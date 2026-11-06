/* ============================================================
   SCM · 后台入口：Shell + 路由 + 身份切换
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Store = global.Store, Admin = global.Admin;

  var NAV = [
    { grp: '总览' },
    { key: 'dashboard', label: '总览看板', icon: '◉', crumb: '首页 / 总览看板' },
    { grp: '供应链' },
    { key: 'products', label: '产品管理', icon: '◈', crumb: '供应链 / 产品管理' },
    { key: 'suppliers', label: '供应商管理', icon: '⬢', crumb: '供应链 / 供应商管理' },
    { key: 'purchases', label: '采购管理', icon: '▤', crumb: '供应链 / 采购管理' },
    { grp: '运营执行' },
    { key: 'warehouses', label: '仓库管理', icon: '▣', crumb: '运营执行 / 仓库管理' },
    { key: 'inventory', label: '库存仓储', icon: '▦', crumb: '运营执行 / 库存仓储', badge: function () { return Store.stats().lowStockCount; } },
    { key: 'orders', label: '销售订单', icon: '▧', crumb: '运营执行 / 销售订单' },
    { key: 'logistics', label: '物流运输', icon: '➜', crumb: '运营执行 / 物流运输', badge: function () { return Store.stats().shipException; } },
    { grp: '经营分析' },
    { key: 'finance', label: '财务对账', icon: '¥', crumb: '经营分析 / 财务对账', badge: function () { return Store.stats().overdueCount; } },
    { key: 'reports', label: '报表分析', icon: '◫', crumb: '经营分析 / 报表分析' },
    { grp: '系统' },
    { key: 'settings', label: '系统设置', icon: '⚙', crumb: '系统 / 系统设置' }
  ];

  function renderNav(cur) {
    var box = U.$('#aNav');
    box.innerHTML = '';
    NAV.forEach(function (n) {
      if (n.grp) { box.appendChild(U.el('div', { class: 'grp', text: n.grp })); return; }
      var cnt = n.badge ? n.badge() : 0;
      box.appendChild(U.el('a', {
        class: n.key === cur ? 'on' : '', href: '#/' + n.key,
        onclick: function () { setTimeout(route, 30); }
      }, [
        U.el('span', { class: 'ic', text: n.icon }),
        U.el('span', { class: 'lb', text: n.label }),
        cnt > 0 ? U.el('span', { class: 'cnt', text: cnt }) : null
      ]));
    });
  }

  function syncUser() {
    var s = Store.session();
    U.$('#aUserName').textContent = s.name;
    U.$('#aUserDept').textContent = s.dept || '-';
    U.$('#aAvatar').textContent = (global.I18n && I18n.glyph && I18n.glyph('avatar')) || String(s.name || 'U').slice(0, 1);
    var badge = U.$('#aRoleBadge');
    badge.textContent = Store.roleLabel(s.role);
    badge.className = 'badge ' + Store.roleColor(s.role);
  }

  function userMenu() {
    var host = U.$('#aUser');
    var s = Store.session();
    var menu = U.el('div', { class: 'menu' }, [
      U.el('div', { class: 'hd' }, [
        U.el('div', { class: 'bold', text: s.name }),
        U.el('div', { class: 't-xs muted', text: (s.dept || '-') + ' · ' + Store.roleLabel(s.role) })
      ]),
      U.el('div', { class: 'it', text: '⚙ 系统设置', onclick: function () { location.hash = '#/settings'; menu.remove(); } })
    ]);
    menu.appendChild(U.el('div', { class: 't-xs muted', style: { padding: '6px 14px 2px' }, text: '切换演示身份：' }));
    Object.keys(Store.ROLES).forEach(function (r) {
      var u = Store.list('users').filter(function (x) { return x.role === r; })[0];
      menu.appendChild(U.el('div', { class: 'it', onclick: function () {
        Store.setSession({ userId: u ? u.id : 'U1', role: r, name: u ? u.name : Store.ROLES[r].label, dept: u ? u.dept : '运营部' });
        U.toast('已切换为「' + Store.ROLES[r].label + '」', 'ok');
        menu.remove();
        setTimeout(function () { Admin.reload(); }, 300);
      } }, [
        U.el('span', { class: 'badge ' + Store.ROLES[r].color, text: Store.ROLES[r].label }),
        r === s.role ? U.el('span', { class: 't-xs muted', style: { marginLeft: '8px' }, text: '当前' }) : null
      ]));
    });
    menu.appendChild(U.el('div', { class: 'it', style: { borderTop: '1px solid var(--border)', color: 'var(--danger)' }, text: '退出登录（访客模式）', onclick: function () {
      Store.setSession({ userId: 'guest', role: 'viewer', name: '访客', dept: '-' });
      menu.remove(); U.toast('已切换为访客（只读）', 'ok');
      setTimeout(function () { Admin.reload(); }, 300);
    } }));
    host.appendChild(menu);
    setTimeout(function () {
      document.addEventListener('click', function h(e) {
        if (!host.contains(e.target)) { menu.remove(); document.removeEventListener('click', h); }
      });
    }, 50);
  }

  function route() {
    var hash = location.hash || '#/dashboard';
    var key = (hash.replace('#/', '') || 'dashboard').split('?')[0];
    if (!Admin.pages[key]) key = 'dashboard';
    var app = U.$('#aApp');
    app.innerHTML = '';
    app.appendChild(Admin.pages[key]());
    var nav = NAV.filter(function (n) { return n.key === key; })[0];
    U.$('#aTitle').textContent = nav ? nav.label : '';
    U.$('#aCrumb').textContent = nav ? nav.crumb : '';
    renderNav(key);
    syncUser();
    window.scrollTo(0, 0);
  }

  Admin.reload = function () { renderNav((location.hash.replace('#/', '') || 'dashboard')); route(); };

  function boot() {
    Store.init();
    if (window.FX) FX.init();
    U.$('#aUser').addEventListener('click', function () {
      var ex = U.$('.a-user .menu');
      if (ex) { ex.remove(); return; }
      userMenu();
    });
    window.addEventListener('hashchange', route);
    route();
    /* 云端同步（方案 B）：启动后与 Aiven MySQL 拉取/对齐，并开启轮询 */
    if (global.Sync) Sync.start(function () { try { Admin.reload(); } catch (e) { } });
    /* 语言切换后重渲染当前页（图表标签 / 数值格式同步更新） */
    if (global.I18n) {
      I18n.onChange(function () { route(); });
      I18n.scan();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
