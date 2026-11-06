/* ============================================================
   SCM · 前台入口：路由 + 导航
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Store = global.Store, Portal = global.Portal;

  var NAV = [
    { path: '#/home', label: '首页', key: 'home' },
    { path: '#/suppliers', label: '供应商网络', key: 'suppliers' },
    { path: '#/products', label: '物料与库存', key: 'products' },
    { path: '#/tracking', label: '订单追踪', key: 'tracking' },
    { path: '#/insight', label: '数据洞察', key: 'insight' }
  ];

  function renderNav(cur) {
    var box = U.$('#pMenu');
    box.innerHTML = '';
    NAV.forEach(function (n) {
      box.appendChild(U.el('a', {
        href: n.path, text: n.label,
        class: n.key === cur ? 'on' : '',
        onclick: function () { setTimeout(function () { route(); }, 30); }
      }));
    });
  }

  function route() {
    var hash = location.hash || '#/home';
    var key = (hash.replace('#/', '') || 'home').split('?')[0];
    if (!Portal.pages[key]) key = 'home';
    var app = U.$('#app');
    app.innerHTML = '';
    app.appendChild(Portal.pages[key]());
    renderNav(key);
    window.scrollTo(0, 0);
  }

  function clock() {
    var d = new Date();
    var wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    U.$('#pClock').textContent = U.fmtDate(d, true) + ' 星期' + wd;
  }

  function boot() {
    Store.init();
    U.$('#pUpdated').textContent = Store.db.meta.generatedAt;
    clock();
    setInterval(clock, 30000);
    window.addEventListener('hashchange', route);
    route();
    /* 云端同步（方案 B）：启动后与 Aiven PostgreSQL 拉取/对齐，并开启轮询 */
    if (global.Sync) Sync.start(function () { try { route(); } catch (e) { } });
    /* 语言切换后重渲染（数字 / 日期格式随语言变化），并立即翻译全页 */
    if (global.I18n) {
      I18n.onChange(function () { route(); clock(); });
      I18n.scan();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
