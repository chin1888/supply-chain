/* ============================================================
   SCM · 云端同步适配器
   - 不改动 Store 内存模型：整份 db 作为一个 JSON 块上传/下载。
   - 本地 localStorage 作为离线缓存；云端为权威（last-write-wins，按时间戳）。
   - 启动：先拉取云端，云端更新则采用云端；否则上传本机（首次启用时本机即权威）。
   - 轮询：每 pollMs 拉取一次，发现云端比本地新则采用并重渲染。
   所有网络调用均 try/catch 静默降级，绝不影响本地使用。
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;
  var META_KEY = 'scm_sync_meta_v1';
  var EXPECTED = ['suppliers', 'products', 'warehouses', 'inventory', 'purchases',
    'sales', 'shipments', 'invoices', 'users', 'monthly', 'regionData', 'categoryData'];

  function cfg() { return global.SCM_CONFIG || {}; }
  function isEnabled() {
    // file:// 直接打开 → 纯离线（localStorage），不发任何网络请求
    var proto = (global.location && global.location.protocol) || '';
    if (proto === 'file:') return false;
    return true; // http(s)：尝试同源相对路径（apiBase 留空）或指定跨域地址
  }
  function baseUrl() {
    var b = String(cfg().apiBase || '').trim();
    if (!b) return ''; // 同源相对路径（前端与后端同一服务）
    return b.replace(/\/+$/, '');
  }
  function pollMs() { return Number(cfg().pollMs) || 8000; }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { } }

  var Sync = {
    ready: false,      // 首轮 拉取/决策 完成后才允许上传，避免启动期误覆盖云端
    suppress: false,   // 采用云端数据时临时屏蔽回传，避免回声循环
    _timer: null,

    enabled: isEnabled,
    apiUrl: function () {
      var u = baseUrl() + '/api/state';
      // 同源部署时携带分享链接的 sharecode，避免被网关按「链接不完整」拦截
      if (!baseUrl() && global.location && global.location.search) u += global.location.search;
      return u;
    },

    /* 上传本机数据块 */
    push: function (db) {
      if (!isEnabled() || this.suppress || !this.ready) return;
      var meta = readMeta();
      var updatedAt = Date.now();
      meta.localUpdated = updatedAt;
      writeMeta(meta);
      fetch(this.apiUrl(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: db, updatedAt: updatedAt })
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          var m = readMeta();
          m.remoteUpdated = (j && j.updatedAt) ? j.updatedAt : updatedAt;
          writeMeta(m);
        }).catch(function () { /* 离线/网络失败：静默降级到 localStorage */ });
    },

    /* 拉取云端数据块（j = {data, updatedAt} 或 null） */
    pull: function (cb) {
      if (!isEnabled()) { cb && cb(null); return; }
      fetch(this.apiUrl(), { method: 'GET', headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) { cb && cb(j); })
        .catch(function () { cb && cb(null); });
    },

    /* 启动：首轮决策 + 开启轮询 */
    start: function (onChange) {
      if (!isEnabled()) return;
      var self = this;
      this.pull(function (j) {
        self.ready = true; // 首轮决策完成，此后本机改动可上传（init 期已错过，不会误覆盖云端）
        var meta = readMeta();
        if (!j || j.data == null) {
          // 云端为空：把本机作为权威上传（请确保本机是你存有最新数据的那台浏览器）
          self.push(global.Store.db);
          var m0 = readMeta();
          m0.remoteUpdated = m0.localUpdated || Date.now();
          writeMeta(m0);
          if (U && U.toast) U.toast('云端同步已开启（已上传本机数据）', 'ok');
          self._beginPoll(onChange);
          return;
        }
        var remoteUpdated = Number(j.updatedAt) || 0;
        if (remoteUpdated > (meta.localUpdated || 0)) {
          self.adopt(j.data, remoteUpdated, onChange);   // 云端更新 → 采用云端
        } else if ((meta.localUpdated || 0) > remoteUpdated) {
          self.push(global.Store.db);                     // 本机更新 → 上传
        }
        if (U && U.toast) U.toast('云端同步已开启', 'ok');
        self._beginPoll(onChange);
      });
    },

    /* 采用云端数据块：写回内存 + 本地缓存，但不回传 */
    adopt: function (data, remoteUpdated, onChange) {
      if (!data) return;
      this.suppress = true;
      global.Store.db = data;
      EXPECTED.forEach(function (k) { if (!global.Store.db[k]) global.Store.db[k] = []; });
      if (!global.Store.db.meta || typeof global.Store.db.meta !== 'object') global.Store.db.meta = {};
      try { global.Store.save(); } catch (e) { }
      this.suppress = false;
      var m = readMeta();
      m.localUpdated = remoteUpdated;
      m.remoteUpdated = remoteUpdated;
      writeMeta(m);
      if (onChange) { try { onChange(); } catch (e) { } }
    },

    _beginPoll: function (onChange) {
      var self = this;
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(function () {
        self.pull(function (j) {
          if (!j || j.data == null) return;
          var meta = readMeta();
          var remoteUpdated = Number(j.updatedAt) || 0;
          if (remoteUpdated > (meta.localUpdated || 0) && remoteUpdated > (meta.remoteUpdated || 0)) {
            self.adopt(j.data, remoteUpdated, onChange);   // 其他设备改了 → 拉取
          } else if (remoteUpdated > (meta.remoteUpdated || 0)) {
            var m = readMeta();
            m.remoteUpdated = remoteUpdated;
            writeMeta(m);
          }
        });
      }, pollMs());
    },

    stop: function () { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
  };

  global.Sync = Sync;
})(window);
