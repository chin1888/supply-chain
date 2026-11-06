/* 临时桩测：用假 mysql2 驱动验证 MySQL 分支（无需真实 Aiven 连接） */
'use strict';
const Module = require('module');
const http = require('http');

let capturedCfg = null;
let stored = { data: null, updatedAt: 0 };
const log = [];

const fakePool = {
  query: async function (sql, params) {
    log.push(sql.replace(/\s+/g, ' ').trim().slice(0, 70));
    if (/^SELECT data, updated_at/.test(sql.trim())) {
      return [[{ data: stored.data, updated_at: stored.updatedAt ? new Date(stored.updatedAt) : null }], []];
    }
    if (/^INSERT INTO scm_state/.test(sql.trim())) {
      stored = { data: params[0] === undefined ? null : JSON.parse(params[0]), updatedAt: Number(params[1]) };
      return [[], []];
    }
    if (/^UPDATE scm_state SET data = NULL/.test(sql.trim())) {
      stored = { data: null, updatedAt: 0 };
      return [[], []];
    }
    return [[], []];
  }
};
const fakeMysql = {
  createPool: function (cfg) { capturedCfg = cfg; return fakePool; }
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'mysql2/promise') return fakeMysql;
  return origLoad.apply(this, arguments);
};

process.env.DB_HOST = 'fake.aivencloud.com';
process.env.DB_PORT = '12345';
process.env.DB_USER = 'avnadmin';
process.env.DB_PASS = 'pw';
process.env.DB_NAME = 'defaultdb';
process.env.PORT = '4599';
delete process.env.DB_CA;
delete process.env.DB_SSL;

require('../server/server.js');

function req(method, path, body) {
  return new Promise(function (resolve, reject) {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: 4599, method: method, path: path,
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

  console.log('--- health / 自动建表 ---');
  const h = await req('GET', '/api/health');
  ok('health 返回 backend=mysql, db=ok', h.code === 200 && h.body.backend === 'mysql' && h.body.db === 'ok', JSON.stringify(h.body));

  console.log('--- 连接配置（首次请求后惰性创建） ---');
  ok('时区对齐 timezone=Z', capturedCfg && capturedCfg.timezone === 'Z', JSON.stringify(capturedCfg && capturedCfg.timezone));
  ok('无 DB_CA 时 TLS 仍开启且不校验证书',
    capturedCfg && capturedCfg.ssl && capturedCfg.ssl.rejectUnauthorized === false,
    JSON.stringify(capturedCfg && capturedCfg.ssl));
  ok('端口取自 DB_PORT', capturedCfg && capturedCfg.port === 12345);
  ok('自动 CREATE TABLE', log.some(s => /^CREATE TABLE IF NOT EXISTS scm_state/.test(s)));
  ok('自动插入占位行', log.some(s => /^INSERT IGNORE INTO scm_state/.test(s)));

  console.log('--- PUT / GET / DELETE 往返 ---');
  const put = await req('PUT', '/api/state', { data: { products: [1, 2, 3], tag: 'x' }, updatedAt: 1700000000123 });
  ok('PUT 成功', put.code === 200 && put.body.ok === true, JSON.stringify(put.body));
  const get = await req('GET', '/api/state');
  ok('GET 读回同一份数据', get.code === 200 && get.body.data && get.body.data.tag === 'x' && get.body.data.products.length === 3, JSON.stringify(get.body));
  ok('updatedAt 正确回传', get.body.updatedAt === 1700000000123, String(get.body.updatedAt));
  const del = await req('DELETE', '/api/state');
  ok('DELETE 成功', del.code === 200 && del.body.ok === true);
  const get2 = await req('GET', '/api/state');
  ok('DELETE 后云端为空', get2.body.data === null);

  const createCount = log.filter(s => /^CREATE TABLE IF NOT EXISTS/.test(s)).length;
  ok('ensureSchema 只建表一次（幂等缓存）', createCount === 1, 'count=' + createCount);

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('异常:', e); process.exit(1); });
