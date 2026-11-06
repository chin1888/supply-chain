/* ============================================================
   SCM · 云端同步配置（方案 B：Render 后端 + Aiven MySQL）
   把 apiBase 改成你部署好的 Render 服务地址（不要带结尾斜杠）。
   留空则自动降级为纯 localStorage（单机 / 离线模式，行为与改造前一致）。
   ============================================================ */
window.SCM_CONFIG = {
  // Render 部署后自动分配的域名（service 名 CFKSCS）
  apiBase: 'https://cfkscs.onrender.com',

  // 轮询间隔（毫秒）。多浏览器通过轮询感知彼此的改动，实现近实时同步。
  pollMs: 8000
};
