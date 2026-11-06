/* 双驱动桩测：用假 pg / mysql2 驱动验证数据库分支，无需真实 Aiven 连接。
   直接 node tests/test-db-branch.js 会 spawn 两个子进程分别测 postgres / mysql。 */
'use strict';
const { spawnSync } = require('child_process');
const DRIVER = process.env.SCM_TEST_DRIVER;

if (!DRIVER) {
  let fail = 0;
  ['postgres', 'mysql'].forEach(function (d) {
    const r = spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { SCM_TEST_DRIVER: d }),
      encoding: 'utf8'
    });
    process.stdout.write(r.stdout || '');
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) fail++;
  });
  console.log('\n===== 双驱动汇总：' + (fail ? fail + ' 个驱动失败' : '全部通过 ✓') + ' =====');
  process.exit(fail ? 1 : 0);
}

const Module = require('module');
const http = require('http');
const PORT = DRIVER === 'mysql' ? 4601 : 4599;

let capturedCfg = null;
const state = { data: null, updatedAt: 0 };
const log = [];
function norm(sql) { return sql.replace(/\s+/g, ' ').trim(); }
function handle(sql, params) {
  const s = norm(sql);
  log.push(s);
  // 只把带占位符的 UPSERT 当作写入；占位行 INSERT ... NULL / INSERT IGNORE 要跳过
  if (/\$1::jsonb/.test(s) || /FROM_UNIXTIME/.test(s)) {
    const ms = DRIVER === 'mysql' ? Number(params[1]) : Number(params[1]) * 1000;
    state.data = JSON.parse(params[0]);
    state.updatedAt = ms;
  } else if (/^UPDATE scm_state SET data = NULL/.test(s)) {
    state.data = null;
    state.updatedAt = 0;
  }
}
function rowsFor(sql) {
  if (/^SELECT data, updated_at/.test(norm(sql))) {
    return [{ data: state.data, updated_at: state.updatedAt ? new Date(state.updatedAt) : null }];
  }
  return [];
}
const pgFake = {
  Pool: class {
    constructor(cfg) { capturedCfg = cfg; }
    async query(sql, params) { handle(sql, params || []); return { rows: rowsFor(sql) }; }
  }
};
const mysqlFake = {
  createPool: function (cfg) {
    capturedCfg = cfg;
    return { query: async function (sql, params) { handle(sql, params || []); return [rowsFor(sql)]; } };
  }
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'pg') return pgFake;
  if (request === 'mysql2/promise') return mysqlFake;
  return origLoad.apply(this, arguments);
};

process.env.DB_HOST = 'fake.aivencloud.com';
process.env.DB_PORT = '12345';
process.env.DB_USER = 'avnadmin';
process.env.DB_PASS = 'pw';
process.env.DB_NAME = 'defaultdb';
process.env.DB_DRIVER = DRIVER;
process.env.PORT = String(PORT);
delete process.env.DB_CA;
delete process.env.DB_SSL;
require('../server/server.js');

function req(method, path, body) {
  return new Promise(function (resolve, reject) {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, method: method, path: path,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} },
      function (res) {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ code: res.statusCode, body: JSON.parse(d) }));
      });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' → ' + extra : '')); }
}

(async function () {
  await new Promise(r => setTimeout(r, 250));
  console.log('\n===== 驱动：' + DRIVER + ' =====');

  const h = await req('GET', '/api/health');
  ok('health 返回 backend=' + DRIVER, h.code === 200 && h.body.backend === DRIVER && h.body.db === 'ok', JSON.stringify(h.body));

  ok('连接参数取自 DB_*', capturedCfg && capturedCfg.host === 'fake.aivencloud.com' && capturedCfg.port === 12345 && capturedCfg.database === 'defaultdb');
  ok('默认开启 TLS 且不校验 CA', capturedCfg && capturedCfg.ssl && capturedCfg.ssl.rejectUnauthorized === false);
  if (DRIVER === 'mysql') ok('MySQL 时区对齐 UTC', capturedCfg.timezone === 'Z');
  else ok('PostgreSQL 连接池 max=5', capturedCfg.max === 5);

  ok('自动 CREATE TABLE', log.some(s => /^CREATE TABLE IF NOT EXISTS scm_state/.test(s)));
  if (DRIVER === 'postgres') {
    ok('建表用 JSONB + TIMESTAMPTZ', log.some(s => /JSONB/.test(s) && /TIMESTAMPTZ/.test(s)));
    ok('占位行用 ON CONFLICT DO NOTHING', log.some(s => /ON CONFLICT \(id\) DO NOTHING/.test(s)));
  } else {
    ok('建表用 JSON + InnoDB', log.some(s => /JSON NULL/.test(s) && /InnoDB/.test(s)));
    ok('占位行用 INSERT IGNORE', log.some(s => /INSERT IGNORE INTO scm_state/.test(s)));
  }

  const put = await req('PUT', '/api/state', { data: { products: [1, 2, 3], tag: 'x' }, updatedAt: 1700000000123 });
  ok('PUT 成功', put.code === 200 && put.body.ok === true, JSON.stringify(put.body));
  if (DRIVER === 'postgres') {
    ok('UPSERT 用 $1::jsonb + to_timestamp + ON CONFLICT', log.some(s => /\$1::jsonb/.test(s) && /to_timestamp/.test(s) && /ON CONFLICT/.test(s)));
  } else {
    ok('UPSERT 用 ? + FROM_UNIXTIME + ON DUPLICATE KEY', log.some(s => /FROM_UNIXTIME/.test(s) && /ON DUPLICATE KEY/.test(s)));
  }
  const get = await req('GET', '/api/state');
  ok('GET 读回同一份数据', get.code === 200 && get.body.data && get.body.data.tag === 'x' && get.body.data.products.length === 3, JSON.stringify(get.body));
  ok('updatedAt 毫秒精确回传', get.body.updatedAt === 1700000000123, String(get.body.updatedAt));
  const del = await req('DELETE', '/api/state');
  ok('DELETE 成功', del.code === 200 && del.body.ok === true);
  const get2 = await req('GET', '/api/state');
  ok('DELETE 后云端为空', get2.body.data === null);
  ok('ensureSchema 只建表一次', log.filter(s => /^CREATE TABLE IF NOT EXISTS/.test(s)).length === 1);

  console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('异常:', e); process.exit(1); });
