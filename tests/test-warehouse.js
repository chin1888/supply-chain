/* 仓库管理增量测试：页面/图表、CRUD 闭环、省市联动、详情抽屉、批量删除、权限、旧数据迁移 */
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
    await sleep(320);
  };
  const app = () => d.querySelector('#aApp');
  const modal = () => d.querySelector('.modal');
  const fld = (k) => modal() && modal().querySelector('[data-f="' + k + '"]');
  const modalBtn = (kw) => modal() && Array.from(modal().querySelectorAll('.modal-foot button')).find(b => b.textContent.includes(kw));
  const appBtn = (kw) => Array.from(app().querySelectorAll('button')).find(b => b.textContent.includes(kw));
  const opts = (sel) => sel ? Array.from(sel.options).map(o => o.value) : [];
  const save = async () => { click(w, modalBtn('保存')); await sleep(220); };

  // ---------- 1. 导航与页面渲染 ----------
  await goto('#/warehouses');
  const navText = d.querySelector('#aNav').textContent;
  check('导航含「仓库管理」', navText.includes('仓库管理'));
  check('面包屑正确', d.querySelector('#aCrumb').textContent.includes('仓库管理'));
  check('页面渲染', app().innerHTML.length > 3000, 'len=' + app().innerHTML.length);
  check('KPI 条 4 项', app().querySelectorAll('.a-strip .kpi').length === 4);
  check('库容图表 2 张', app().querySelectorAll('.a-grid2 svg').length >= 2,
    'svg=' + app().querySelectorAll('.a-grid2 svg').length);
  check('列表展示 6 座仓库', app().querySelectorAll('tbody tr').length === 6);
  check('列表列齐全', ['仓库', '类型', '所在地区', '库容利用率', 'SKU / 库存', '库存金额', '温控', '状态']
    .every(t => app().textContent.includes(t)));
  await goto('#/inventory');
  check('库存仓储页有「仓库管理」按钮', !!appBtn('仓库管理'));
  await goto('#/warehouses');

  // ---------- 2. 数据模型与统计 ----------
  const whs = w.Store.list('warehouses');
  check('种子仓库 6 座', whs.length === 6);
  check('仓库字段完整（编码/类型/省份/地址/面积/电话/温控/启用日期）',
    ['code', 'type', 'province', 'address', 'area', 'phone', 'temperature', 'openedAt', 'status']
      .every(k => whs.every(x => x[k] != null)));
  check('含检修中仓库', whs.some(x => x.status === 'maintenance'));
  const st0 = w.Store.whStats(whs[0].id);
  check('单仓统计含 SKU/库存/金额/关联单据',
    st0 && ['skuCount', 'qty', 'value', 'poCount', 'soCount', 'shipCount', 'rate'].every(k => k in st0),
    st0 && 'sku=' + st0.skuCount + ' qty=' + st0.qty);
  check('单仓库存金额为正', st0.value > 0, String(st0.value));
  check('库容利用率在 0-100', st0.rate >= 0 && st0.rate <= 100, st0.rate + '%');
  const ref0 = w.Store.whRefs([whs[0].id]);
  check('关联引用统计可用', ref0.inventory > 0 || ref0.purchases > 0,
    JSON.stringify(ref0));

  // ---------- 3. 新增弹窗与省份城市联动 ----------
  click(w, appBtn('新增'));
  await sleep(200);
  check('新增弹窗打开', !!modal() && modal().textContent.includes('新增仓库'));
  check('表单字段 16 项', modal().querySelectorAll('[data-f]').length >= 16,
    'fields=' + modal().querySelectorAll('[data-f]').length);
  const p = fld('province'), c = fld('city'), rg = fld('region');
  check('省份下拉含 34 个省级行政区', opts(p).length === 35, 'options=' + opts(p).length);
  check('默认省份上海市 + 城市上海', p.value === '上海市' && c.value === '上海', p.value + '/' + c.value);
  p.value = '广东省'; change(w, p);
  await sleep(50);
  check('切省份联动城市', opts(c).includes('深圳') && !opts(c).includes('上海'));
  check('切省份自动带出区域', rg.value === '华南', rg.value);
  c.value = '深圳'; change(w, c);
  // 填写必填项
  fld('name').value = '深圳保税测试仓';
  fld('address').value = '深圳市盐田区保税区兴业路 6 号';
  fld('capacity').value = '30000';
  fld('used').value = '12000';
  fld('area').value = '8600';
  fld('manager').value = '李静';
  fld('phone').value = '13800001234';
  fld('type').value = '保税仓';
  fld('temperature').value = '冷藏 2-8℃';
  fld('status').value = 'active';
  fld('remark').value = '自动化测试仓库';
  const beforeAdd = w.Store.list('warehouses').length;
  const codesBefore = w.Store.list('warehouses').map(x => x.code);
  await save();
  check('保存成功弹窗关闭', !modal());
  const added = w.Store.list('warehouses')[0];
  check('新仓库已入库', w.Store.list('warehouses').length === beforeAdd + 1 && added.name === '深圳保税测试仓');
  check('省市区域正确保存', added.province === '广东省' && added.city === '深圳' && added.region === '华南',
    [added.province, added.city, added.region].join('/'));
  check('数值字段转数字并计算利用率',
    added.capacity === 30000 && added.used === 12000 && added.usageRate === 40,
    'rate=' + added.usageRate);
  check('新字段全部写入', added.type === '保税仓' && added.temperature === '冷藏 2-8℃' && added.remark === '自动化测试仓库');
  check('自动生成唯一 id 与编码', !!added.id && !!added.code && codesBefore.indexOf(added.code) < 0, added.id + ' / ' + added.code);
  check('写入 localStorage 持久化', (w.localStorage.getItem('scm_db_v3') || '').includes('深圳保税测试仓'));

  // ---------- 4. 编辑回显 + 越界库容修正 ----------
  const editBtn = Array.from(app().querySelectorAll('tbody tr')[0].querySelectorAll('button'))
    .find(b => b.textContent === '编辑');
  check('列表含编辑按钮', !!editBtn);
  click(w, editBtn);
  await sleep(200);
  check('编辑时省份回显', fld('province').value === '广东省', fld('province').value);
  check('编辑时城市回显', fld('city').value === '深圳', fld('city').value);
  check('编辑时名称回显', fld('name').value === '深圳保税测试仓');
  check('编辑时类型/温控回显', fld('type').value === '保税仓' && fld('temperature').value === '冷藏 2-8℃');
  fld('used').value = '50000'; // 超过容量 → 自动修正为 30000
  fld('manager').value = '王磊';
  await save();
  const edited = w.Store.list('warehouses')[0];
  check('编辑保存成功', edited.manager === '王磊' && !modal());
  check('已用库容超限时自动修正', edited.used === 30000 && edited.usageRate === 100,
    'used=' + edited.used + ' rate=' + edited.usageRate);

  // ---------- 5. 详情抽屉 ----------
  click(w, app().querySelector('tbody .link'));
  await sleep(200);
  const drawer = d.querySelector('.drawer');
  check('详情抽屉打开', !!drawer);
  check('抽屉含仓库档案', drawer && drawer.textContent.includes('仓库档案') && drawer.textContent.includes('深圳保税测试仓'));
  check('抽屉含库容仪表', drawer && drawer.textContent.includes('库容利用率') && drawer.querySelectorAll('svg').length >= 1);
  check('抽屉含经营概览与关联单据', drawer && ['经营概览', '在库物料', '最近关联单据'].every(t => drawer.textContent.includes(t)));
  click(w, d.querySelector('.modal-close'));
  await sleep(80);
  check('抽屉可关闭', !d.querySelector('.drawer'));

  // ---------- 6. 停用 / 启用 ----------
  const stopBtn = Array.from(app().querySelectorAll('tbody tr')[0].querySelectorAll('button'))
    .find(b => b.textContent === '停用');
  check('运营中仓库显示停用操作', !!stopBtn);
  click(w, stopBtn);
  await sleep(120);
  click(w, modalBtn('确定'));
  await sleep(150);
  check('停用后状态更新', w.Store.list('warehouses')[0].status === 'disabled');
  const startBtn = Array.from(app().querySelectorAll('tbody tr')[0].querySelectorAll('button'))
    .find(b => b.textContent === '启用');
  check('停用后显示启用操作', !!startBtn);
  click(w, startBtn);
  await sleep(150);
  check('启用后状态恢复', w.Store.list('warehouses')[0].status === 'active');

  // ---------- 7. 批量删除 + 关联风险提示 ----------
  const boxes = Array.from(app().querySelectorAll('input[type=checkbox][data-sel]'));
  check('表格含多选列', boxes.length >= 7);
  boxes[0].checked = true; change(w, boxes[0]);
  boxes[1].checked = true; change(w, boxes[1]);
  await sleep(60);
  const bar = app().querySelector('.batch-bar');
  check('批量条显示已选 2 项', bar && bar.textContent.includes('已选 2 项'));
  click(w, Array.from(bar.querySelectorAll('button')).find(b => b.textContent.includes('批量删除')));
  await sleep(150);
  check('删除确认弹窗含关联风险提示', !!modal() && !!modal().querySelector('.batch-warn') &&
    modal().querySelector('.batch-warn').textContent.includes('引用'),
    modal() && modal().querySelector('.batch-warn') && modal().querySelector('.batch-warn').textContent.slice(0, 60));
  const beforeDel = w.Store.list('warehouses').length;
  click(w, modalBtn('确认删除'));
  await sleep(200);
  check('批量删除生效', w.Store.list('warehouses').length === beforeDel - 2,
    beforeDel + ' → ' + w.Store.list('warehouses').length);
  check('删除后选择清空', app().querySelector('.batch-bar').style.display === 'none');

  // ---------- 8. 只读权限 ----------
  w.Store.setSession({ userId: 'U4', role: 'viewer', name: '访客', dept: '-' });
  await goto('#/warehouses');
  check('只读角色无新增按钮', !appBtn('新增'));
  check('只读角色无勾选列', app().querySelectorAll('input[type=checkbox][data-sel]').length === 0);
  check('只读角色显示提示条', app().textContent.includes('只读模式'));
  w.Store.setSession({ userId: 'U1', role: 'admin', name: '管理员', dept: '运营部' });

  // ---------- 9. 旧缓存迁移（不重置已有业务数据） ----------
  const dbOld = JSON.parse(JSON.stringify(w.Store.db));
  const supplierNames = dbOld.suppliers.map(s => s.name).join(',');
  dbOld.warehouses = dbOld.warehouses.map(function (x, i) {
    return { id: x.id, name: x.name, region: x.region, city: x.city, capacity: x.capacity, used: x.used, manager: x.manager, temperature: x.temperature, status: x.status };
  });
  w.localStorage.setItem('scm_db_v3', JSON.stringify(dbOld));
  w.Store.db = null;
  w.Store.init();
  const migrated = w.Store.list('warehouses');
  check('旧缓存自动补齐仓库新字段',
    migrated.every(x => x.code && x.type && x.address && x.province != null && x.area != null && x.openedAt != null));
  check('迁移按城市反查省份', migrated.length > 0 && migrated.every(function (x) {
    return x.province === w.Seed.provinceByCity(x.city);
  }), migrated.map(x => x.city + '→' + x.province).join(', '));
  check('迁移不重置其它业务数据', w.Store.list('suppliers').map(s => s.name).join(',') === supplierNames);
  check('迁移结果持久化', (w.localStorage.getItem('scm_db_v3') || '').includes('WH-'));

  // ---------- 10. 仓库被删空的边界防护 ----------
  w.Store.db.warehouses = [];
  check('仓库删空后默认仓库取值安全', w.Store.firstWarehouseId() === '' && w.Store.firstWarehouse().city === '-');
  await goto('#/purchases');
  click(w, appBtn('新增'));
  await sleep(350);
  check('仓库为空时新增采购单仍可打开', !!modal());
  click(w, modalBtn('取消'));
  await sleep(80);

  console.log('\n运行时错误：', errs.length ? errs.slice(0, 5) : '无');
  if (errs.length) fail++;
  console.log('\n========== ' + (fail ? fail + ' 项失败' : '全部通过 ✓') + ' ==========');
  process.exit(fail ? 1 : 0);
})();
