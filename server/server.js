/* ============================================================
   SCM · 云端同步后端
   单端口 HTTP 服务：同时提供 API + 托管前端静态文件。
   存储后端（自动选择）：
     - 设了 DB_HOST → 数据库（默认 PostgreSQL；DB_DRIVER=mysql 可切 MySQL）
     - 否则 → 本地 JSON 文件（WorkBuddy 云端托管等无数据库环境）
   整份前端数据块作为一行 JSON 存 scm_state(id='main')。
   ============================================================ */
'use strict';

const path = require('path');
const fsp = require('fs/promises');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); // 同源部署下实际不需要，保留无害
app.use(express.json({ limit: '25mb' }));

/* ---------- 存储模式判定 ---------- */
const USE_DB = !!process.env.DB_HOST;
const DRIVER_RAW = String(process.env.DB_DRIVER || 'postgres').toLowerCase();
const DRIVER = (DRIVER_RAW === 'mysql' || DRIVER_RAW === 'mysql2') ? 'mysql' : 'postgres';
const BACKEND = USE_DB ? DRIVER : 'file';
const STATE_FILE = path.join(__dirname, 'scm-state.json');

/* ============================================================
   连接池 + 统一查询适配（驱动均为惰性加载）
   ============================================================ */
let pool = null;
function buildSsl() {
  // Aiven 强制 TLS。默认「加密但不校验证书」，免费层无需下载 CA 即可连。
  // DB_SSL=false 会关闭 TLS，Aiven 上会连不上。
  if (process.env.DB_SSL === 'false') return false;
  const ca = process.env.DB_CA && String(process.env.DB_CA).trim();
  return ca
    ? { rejectUnauthorized: true, ca: String(ca).replace(/\\n/g, '\n') }
    : { rejectUnauthorized: false };
}
function dbPool() {
  if (pool) return pool;
  const common = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || (DRIVER === 'mysql' ? 3306 : 5432)),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'defaultdb',
    ssl: buildSsl()
  };
  if (DRIVER === 'mysql') {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool(Object.assign({}, common, {
      timezone: 'Z', // 与 FROM_UNIXTIME 的 UTC 语义对齐
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 15000
    }));
  } else {
    const { Pool } = require('pg');
    pool = new Pool(Object.assign({}, common, {
      max: 5,
      connectionTimeoutMillis: 15000
    }));
  }
  return pool;
}
/* 把 pg 的 {rows} 与 mysql2 的 [rows] 统一成 rows 数组 */
async function run(sql, params) {
  const p = dbPool();
  if (DRIVER === 'mysql') {
    const [rows] = await p.query(sql, params);
    return rows;
  }
  const r = await p.query(sql, params);
  return r.rows;
}

/* ---------- 两种数据库各自的 SQL（占位符语法不同，故分开写） ---------- */
const SQL = {
  postgres: {
    create: `CREATE TABLE IF NOT EXISTS scm_state (
               id VARCHAR(32) PRIMARY KEY,
               data JSONB NULL,
               updated_at TIMESTAMPTZ NULL DEFAULT now()
             )`,
    seed:   `INSERT INTO scm_state (id, data) VALUES ('main', NULL) ON CONFLICT (id) DO NOTHING`,
    select: `SELECT data, updated_at FROM scm_state WHERE id = 'main'`,
    upsert: `INSERT INTO scm_state (id, data, updated_at)
             VALUES ('main', $1::jsonb, to_timestamp($2))
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    reset:  `UPDATE scm_state SET data = NULL, updated_at = NULL WHERE id = 'main'`,
    ping:   'SELECT 1'
  },
  mysql: {
    create: `CREATE TABLE IF NOT EXISTS scm_state (
               id VARCHAR(32) NOT NULL,
               data JSON NULL,
               updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
               PRIMARY KEY (id)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    seed:   `INSERT IGNORE INTO scm_state (id, data) VALUES ('main', NULL)`,
    select: `SELECT data, updated_at FROM scm_state WHERE id = ?`,
    upsert: `INSERT INTO scm_state (id, data, updated_at)
             VALUES ('main', ?, FROM_UNIXTIME(? / 1000))
             ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)`,
    reset:  `UPDATE scm_state SET data = NULL, updated_at = NULL WHERE id = ?`,
    ping:   'SELECT 1'
  }
};
function sql(name) { return SQL[DRIVER][name]; }
function mainParam() { return DRIVER === 'mysql' ? ['main'] : []; }

/* 首次访问时自动建表（幂等）——免去手动执行 schema.sql。
   Aiven 免费层闲置会自动断电，失败时清空缓存以便恢复后重试。 */
let schemaReady = null;
function ensureSchema() {
  if (!USE_DB) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = (async function () {
      await run(sql('create'), []);
      await run(sql('seed'), []);
    })().catch(function (e) {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/* ============================================================
   文件分支（无 DB_HOST 时的默认后端）
   ============================================================ */
async function fileRead() {
  try {
    const raw = await fsp.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null; // 文件不存在 → 视为空
  }
}
let fileWriteQ = Promise.resolve();
async function fileWrite(obj) {
  // 串行化写，避免并发覆盖；原子改名
  fileWriteQ = fileWriteQ.then(async function () {
    const tmp = STATE_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(obj), 'utf8');
    await fsp.rename(tmp, STATE_FILE);
  }).catch(function () { /* 忽略单次写失败 */ });
  return fileWriteQ;
}

/* ---------- 统一读写接口 ---------- */
async function readState() {
  if (USE_DB) {
    await ensureSchema();
    const rows = await run(sql('select'), mainParam());
    if (!rows.length || rows[0].data == null) return { data: null, updatedAt: 0 };
    const raw = rows[0].data;
    const data = (typeof raw === 'string') ? JSON.parse(raw) : raw; // pg(jsonb) 已是对象
    const updatedAt = rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    return { data: data, updatedAt: updatedAt };
  }
  const obj = await fileRead();
  if (!obj) return { data: null, updatedAt: 0 };
  return { data: obj.data, updatedAt: obj.updatedAt || 0 };
}

async function writeState(data, updatedAt) {
  if (USE_DB) {
    await ensureSchema();
    // pg: to_timestamp 收秒；mysql: FROM_UNIXTIME(?/1000) 收毫秒
    const params = DRIVER === 'mysql'
      ? [JSON.stringify(data), updatedAt]
      : [JSON.stringify(data), updatedAt / 1000];
    await run(sql('upsert'), params);
    return { ok: true, updatedAt: updatedAt };
  }
  await fileWrite({ data: data, updatedAt: updatedAt });
  return { ok: true, updatedAt: updatedAt };
}

/* ---------- 健康检查 ---------- */
app.get('/api/health', async function (req, res) {
  if (USE_DB) {
    try {
      await ensureSchema();
      await run(sql('ping'), []);
      res.json({ ok: true, backend: BACKEND, db: 'ok', ts: Date.now() });
    } catch (e) {
      res.status(500).json({ ok: false, backend: BACKEND, error: String(e && e.message) });
    }
    return;
  }
  res.json({ ok: true, backend: 'file', ts: Date.now() });
});

/* ---------- 读取云端数据块 ---------- */
app.get('/api/state', async function (req, res) {
  try {
    const s = await readState();
    res.json({ data: s.data, updatedAt: s.updatedAt });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
});

/* ---------- 写入 / 覆盖云端数据块（last-write-wins，按 updatedAt 时间戳） ---------- */
app.put('/api/state', async function (req, res) {
  try {
    const body = req.body || {};
    const data = body.data;
    if (data == null) return res.status(400).json({ error: 'data required' });
    const updatedAt = body.updatedAt ? Number(body.updatedAt) : Date.now();
    await writeState(data, updatedAt);
    res.json({ ok: true, updatedAt: updatedAt });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
});

/* ---------- 重置云端数据块（清空为「空」） ---------- */
app.delete('/api/state', async function (req, res) {
  try {
    if (USE_DB) {
      await ensureSchema();
      await run(sql('reset'), mainParam());
    } else {
      await fileWrite({ data: null, updatedAt: 0 });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
});

/* ---------- 托管前端静态文件（项目根目录） ---------- */
app.use(express.static(path.join(__dirname, '..')));

/* ---------- 启动 ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('[scm-sync] listening on ' + PORT + ' | backend=' + BACKEND);
});
