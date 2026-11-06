/* ============================================================
   SCM · 云端同步后端
   Render (Node/Express) + Aiven MySQL
   - 整份前端数据块存为 scm_state 表的一行 JSON（id='main'）
   - 同时托管前端静态文件（admin.html / index.html / assets）
   ============================================================ */
'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors()); // 演示：允许所有来源（含 file:// 的 null origin）。生产请收紧白名单
app.use(express.json({ limit: '25mb' }));

/* ---------- MySQL 连接池 ---------- */
function buildSsl() {
  if (process.env.DB_SSL === 'false') return false;
  // Aiven 需要 TLS。提供 DB_CA 时严格校验；否则开发期宽松放行。
  return process.env.DB_CA
    ? { rejectUnauthorized: true, ca: process.env.DB_CA }
    : { rejectUnauthorized: false };
}

const pool = mysql.createPool({
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

/* ---------- 健康检查 ---------- */
app.get('/api/health', async function (req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message) });
  }
});

/* ---------- 读取云端数据块 ---------- */
app.get('/api/state', async function (req, res) {
  try {
    const [rows] = await pool.query('SELECT data, updated_at FROM scm_state WHERE id = ?', ['main']);
    if (!rows.length || rows[0].data == null) {
      return res.json({ data: null, updatedAt: 0 });
    }
    const raw = rows[0].data;
    const data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    const updatedAt = rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    res.json({ data: data, updatedAt: updatedAt });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
});

/* ---------- 写入 / 覆盖云端数据块（按 updatedAt 时间戳 last-write-wins） ---------- */
app.put('/api/state', async function (req, res) {
  try {
    const body = req.body || {};
    const data = body.data;
    if (data == null) return res.status(400).json({ error: 'data required' });
    const updatedAt = body.updatedAt ? Number(body.updatedAt) : Date.now();

    await pool.query(
      `INSERT INTO scm_state (id, data, updated_at)
       VALUES ('main', ?, FROM_UNIXTIME(? / 1000))
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)`,
      [JSON.stringify(data), updatedAt]
    );
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
  console.log('[scm-sync] server listening on ' + PORT);
});
