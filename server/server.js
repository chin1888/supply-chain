/* ============================================================
   SCM · 云端同步后端
   单端口 HTTP 服务：同时提供 API + 托管前端静态文件。
   存储后端（自动选择）：
     - 设了 DB_HOST 等环境变量 → 用 Aiven MySQL（适合 Render 等独立部署）
     - 否则 → 用本地 JSON 文件（适合 WorkBuddy 云端托管等无数据库环境）
   ============================================================ */
'use strict';

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); // 同源部署下实际不需要，保留无害
app.use(express.json({ limit: '25mb' }));

/* ---------- 存储模式判定 ---------- */
const USE_MYSQL = !!(process.env.DB_HOST);
const STATE_FILE = path.join(__dirname, 'scm-state.json');

/* ============================================================
   MySQL 分支（仅当 USE_MYSQL）
   ============================================================ */
let pool = null;
function mysqlPool() {
  if (pool) return pool;
  const mysql = require('mysql2/promise');
  function buildSsl() {
    if (process.env.DB_SSL === 'false') return false;
    return process.env.DB_CA
      ? { rejectUnauthorized: true, ca: process.env.DB_CA }
      : { rejectUnauthorized: false };
  }
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: buildSsl(),
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 15000
  });
  return pool;
}

/* ============================================================
   文件分支（默认）
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
  if (USE_MYSQL) {
    const p = mysqlPool();
    const [rows] = await p.query('SELECT data, updated_at FROM scm_state WHERE id = ?', ['main']);
    if (!rows.length || rows[0].data == null) return { data: null, updatedAt: 0 };
    const raw = rows[0].data;
    const data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    const updatedAt = rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    return { data: data, updatedAt: updatedAt };
  }
  const obj = await fileRead();
  if (!obj) return { data: null, updatedAt: 0 };
  return { data: obj.data, updatedAt: obj.updatedAt || 0 };
}

async function writeState(data, updatedAt) {
  if (USE_MYSQL) {
    const p = mysqlPool();
    await p.query(
      `INSERT INTO scm_state (id, data, updated_at)
       VALUES ('main', ?, FROM_UNIXTIME(? / 1000))
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)`,
      [JSON.stringify(data), updatedAt]
    );
    return { ok: true, updatedAt: updatedAt };
  }
  await fileWrite({ data: data, updatedAt: updatedAt });
  return { ok: true, updatedAt: updatedAt };
}

/* ---------- 健康检查 ---------- */
app.get('/api/health', async function (req, res) {
  if (USE_MYSQL) {
    try { await mysqlPool().query('SELECT 1'); res.json({ ok: true, ts: Date.now() }); }
    catch (e) { res.status(500).json({ ok: false, error: String(e && e.message) }); }
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

/* ---------- 托管前端静态文件（项目根目录） ---------- */
app.use(express.static(path.join(__dirname, '..')));

/* ---------- 启动 ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('[scm-sync] listening on ' + PORT + ' | backend=' + (USE_MYSQL ? 'mysql' : 'file'));
});
