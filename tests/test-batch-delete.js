/* 批量删除增量测试：跨页选择、全选筛选、确认弹窗、权限控制、关联风险提示 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const change = (w, el) => el && el.dispatchEvent(new w.Event('change', { bubbles: true }));

(async () => {
  // jsdom 的 file:// 源默认禁用 localStorage，注入内存垫片以验证持久化与角色切换
  const shim = '<script>(function(){var m={};var ls={getItem:function(k){return m[k]||null;},' +
    'setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};' +
    'try{Object.defineProperty(window,"localStorage",{configurable:true,value:ls});}catch(e){}})();</script>';
  const html = fs.readFileSync(path.join(DIR, 'admin.html'), 'utf8').replace('<head>', '<head>' + shim);
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message || '')) errs.push('[jsdomError] ' + (e.message || e)); });
  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, 'admin.html').replace(/\\/g, '/'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.message || e.message)));
  await sleep(1200);
  const w = dom.window, d = w.document;
  let fail = 0;
  const check = (name, ok, extra) => {
    console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : ''));
    if (!ok) fail++;
  };
  const goto = async (hash) => {
    w.location.hash = hash;
    w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(300);
  };
  const app = () => d.querySelector('#aApp');
  const bar = () => app().querySelector('.batch-bar');
  const rowBoxes = () => Array.from(app().querySelectorAll('input[type=checkbox][data-sel]'));
  const headBox = () => app().querySelector('thead input[type=checkbox]');
  const barBtn = (kw) => bar() && Array.from(bar().querySelectorAll('button')).find(b => b.textContent.includes(kw));
  const modal = () => d.querySelector('.modal');
  const modalBtn = (kw) => modal() && Array.from(modal().querySelectorAll('.modal-foot button')).find(b => b.textContent.includes(kw));

  // 1. 物流运输页（截图高亮模块）
  await goto('#/logistics');
  const total0 = w.Store.list('shipments').length;
  check('物流运输页渲染', app().innerHTML.length > 500, 'records=' + total0);
  check('表格含多选列', !!headBox() && rowBoxes().length === 10, 'boxes=' + rowBoxes().length);
  check('未选择时批量条隐藏', !!bar() && bar().style.display === 'none');
  check('未选择时无批量删除按钮', !barBtn('批量删除'));

  // 2. 勾选 2 行
  rowBoxes()[0].checked = true; change(w, rowBoxes()[0]);
  rowBoxes()[1].checked = true; change(w, rowBoxes()[1]);
  await sleep(60);
  check('勾选后出现批量条', bar().style.display !== 'none');
  check('批量条显示已选 2 项', bar().textContent.includes('已选 2 项'), bar().textContent.slice(0, 40));
  check('批量删除按钮带数量', !!barBtn('批量删除') && barBtn('批量删除').textContent.includes('2'));

  // 3. 确认弹窗：先取消，数据不变
  click(w, barBtn('批量删除'));
  await sleep(120);
  check('批量删除确认弹窗打开', !!modal() && modal().textContent.includes('批量删除确认'));
  check('弹窗列出选中记录', modal().querySelectorAll('.batch-names .tag').length === 2);
  check('弹窗提示不可恢复', modal().textContent.includes('不可恢复'));
  check('确认按钮为危险样式', !!modalBtn('确认删除') && modalBtn('确认删除').className.includes('danger'));
  click(w, modalBtn('取消'));
  await sleep(120);
  check('取消后不删除数据', w.Store.list('shipments').length === total0);
  check('取消后选择保留', bar().textContent.includes('已选 2 项'));

  // 4. 表头全选本页
  headBox().checked = true; change(w, headBox());
  await sleep(60);
  check('表头全选本页 10 项', rowBoxes().every(b => b.checked) && bar().textContent.includes('已选 10 项'), bar().textContent.slice(0, 30));

  // 5. 跨页选择保留
  const pager2 = Array.from(app().querySelectorAll('.pager .pages button')).find(b => b.textContent === '2');
  click(w, pager2);
  await sleep(200);
  check('翻到第 2 页仍有 10 个勾选框', rowBoxes().length === 10);
  check('跨页保留已选 10 项', bar().textContent.includes('已选 10 项'), bar().textContent.slice(0, 30));
  check('第 2 页默认未勾选', rowBoxes().every(b => !b.checked));
  rowBoxes()[0].checked = true; change(w, rowBoxes()[0]);
  await sleep(50);
  check('跨页累计已选 11 项', bar().textContent.includes('已选 11 项'), bar().textContent.slice(0, 30));

  // 6. 全选当前筛选（含所有页）
  click(w, barBtn('全选当前筛选'));
  await sleep(200);
  check('全选筛选结果覆盖全部记录', bar().textContent.includes('已选 ' + total0 + ' 项'), bar().textContent.slice(0, 30));

  // 7. 清空选择
  click(w, barBtn('清空选择'));
  await sleep(150);
  check('清空后批量条隐藏', bar().style.display === 'none');
  check('清空后勾选框全部取消', rowBoxes().every(b => !b.checked));

  // 8. 真正批量删除 3 条
  const before = w.Store.list('shipments').length;
  const picked = rowBoxes().slice(0, 3);
  const victimIds = picked.map(b => b.dataset.sel);
  picked.forEach(b => { b.checked = true; change(w, b); });
  await sleep(60);
  check('重新勾选 3 项', bar().textContent.includes('已选 3 项'));
  click(w, barBtn('批量删除'));
  await sleep(100);
  click(w, modalBtn('确认删除'));
  await sleep(250);
  check('确认后弹窗关闭', !modal());
  check('数据减少 3 条', w.Store.list('shipments').length === before - 3,
    before + ' → ' + w.Store.list('shipments').length);
  check('指定的 3 条确实被删除', victimIds.every(id => !w.Store.list('shipments').some(r => r.id === id)));
  check('删除后批量条隐藏', bar().style.display === 'none');
  check('批量删除持久化到 localStorage', (() => {
    try { return !JSON.parse(w.localStorage.getItem('scm_db_v3')).shipments.some(r => victimIds.includes(r.id)); }
    catch (e) { return false; }
  })());

  // 9. 供应商页：关联风险提示
  await goto('#/suppliers');
  check('供应商页也有多选列', !!headBox() && rowBoxes().length > 0);
  rowBoxes()[0].checked = true; change(w, rowBoxes()[0]);
  await sleep(60);
  click(w, barBtn('批量删除'));
  await sleep(120);
  check('供应商批量删除弹窗含关联风险提示', !!modal().querySelector('.batch-warn'),
    modal().querySelector('.batch-warn') ? modal().querySelector('.batch-warn').textContent.slice(0, 50) : 'none');
  click(w, modalBtn('取消'));
  await sleep(100);

  // 10. 各业务模块都支持批量删除
  for (const [hash, label] of [['#/purchases', '采购管理'], ['#/inventory', '库存仓储'], ['#/orders', '销售订单'], ['#/finance', '财务对账']]) {
    await goto(hash);
    check(label + ' 含多选列', !!headBox() && rowBoxes().length > 0);
  }

  // 11. 只读角色：不显示勾选与批量删除
  w.Store.setSession({ userId: 'U4', role: 'viewer', name: '访客', isGuest: false });
  await goto('#/logistics');
  check('只读角色无勾选框', !headBox() && rowBoxes().length === 0);
  check('只读角色无批量条', !bar() || bar().style.display === 'none');
  check('只读角色无批量删除按钮', !barBtn('批量删除'));
  w.Store.setSession({ userId: 'U1', role: 'admin', name: '管理员', isGuest: false });

  check('全程无运行时错误', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('\n错误:', errs.length ? errs.slice(0, 5) : '无');
  console.log('结果：' + (fail ? fail + ' 项异常 ✗' : '全部通过 ✓'));
  process.exit(fail || errs.length ? 1 : 0);
})();
