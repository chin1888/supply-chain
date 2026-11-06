/* 产品管理增量测试：导航/渲染、ProductSchema、派生统计、新增(校验/外币换算/持久化)、
   编辑回显、完整档案抽屉、停用启用、批量删除、只读权限、中英德三语无残留 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const change = (w, el) => el && el.dispatchEvent(new w.Event('change', { bubbles: true }));

const SHIM = '<script>(function(){var m={};var ls={getItem:function(k){return m[k]||null;},' +
  'setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};' +
  'try{Object.defineProperty(window,"localStorage",{configurable:true,value:ls});}catch(e){}})();</script>';

// 页面结构词：翻译后不应再出现（区别于产品名等业务数据）
const PAGE_STRUCT_WORDS = ['产品管理', '新增', '保存', '详情', '停用', '启用', '库存与经营概览', '完整产品档案',
  '库存分布明细', '关联业务统计', '最近采购记录', '全部分类', '导出 CSV'];

function load(file, lang) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8').replace('<head>', '<head>' + SHIM);
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message || '')) errs.push('[jsdomError] ' + (e.message || e)); });
  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, file).replace(/\\/g, '/') + (lang ? '?lang=' + lang : ''),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.message || e.message)));
  return { dom, errs, w: dom.window, d: dom.window.document };
}

(async () => {
  let code = 0;
  const fail = () => { code = 1; };

  // ============================================================
  // 一、后台功能性测试（中文）
  // ============================================================
  {
    const { w, d, errs } = load('admin.html');
    await sleep(1200);
    let f = 0;
    const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) { f++; } };
    const goto = async (h) => { w.location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange')); await sleep(320); };
    const app = () => d.querySelector('#aApp');
    const modal = () => d.querySelector('.modal');
    const drawer = () => d.querySelector('.drawer');
    const fld = (k) => modal() && modal().querySelector('[data-f="' + k + '"]');
    const modalBtn = (kw) => modal() && Array.from(modal().querySelectorAll('button')).find(b => b.textContent.includes(kw));
    const appBtn = (kw) => Array.from(app().querySelectorAll('button')).find(b => b.textContent.includes(kw));
    const save = async () => { click(w, modalBtn('保存')); await sleep(220); };

    // 1. 导航与渲染
    await goto('#/products');
    check('导航含「产品管理」', d.querySelector('#aNav').textContent.includes('产品管理'));
    check('面包屑正确', d.querySelector('#aCrumb').textContent.includes('产品管理'));
    check('页面渲染', app().innerHTML.length > 4000, 'len=' + app().innerHTML.length);
    check('KPI 4 项', app().querySelectorAll('.a-strip .kpi').length === 4, 'kpi=' + app().querySelectorAll('.a-strip .kpi').length);
    check('图表 2 张（品类分布 + 单价带）', app().querySelectorAll('.a-grid2 svg').length >= 2, 'svg=' + app().querySelectorAll('.a-grid2 svg').length);
    check('列表分页展示 ≤10 行', (() => { const n = app().querySelectorAll('tbody tr').length; return n > 0 && n <= 10; })(), 'rows=' + app().querySelectorAll('tbody tr').length);
    check('列表列齐全', ['产品图片', '产品名称', '分类', '等级', '主', '单价', '单位', '建档', '备注']
      .every(t => app().textContent.includes(t)));

    // 2. ProductSchema 字段模型
    const PS = w.ProductSchema;
    check('ProductSchema 全局可用', !!PS);
    check('字段定义 30 项（含图片）', PS.FIELDS.length === 30, 'fields=' + PS.FIELDS.length);
    check('分组 4 个（基础/价格供应/包装库存/档案）', PS.GROUPS.length === 4);
    check('CSV 列 29 项（去掉图片）', PS.csvColumns().length === 29, 'csv=' + PS.csvColumns().length);
    check('defaultRow 含关键字段', (() => { const r = PS.defaultRow(); return r.name === '' && r.sku && r.category && r.status === 'active'; })());
    check('基础分组含 12 个字段（不含图片）', PS.inGroup('basic').length === 12, 'basic=' + PS.inGroup('basic').length);

    // 3. 产品派生统计
    const prods = w.Store.list('products');
    check('种子产品 > 0', prods.length > 0, 'n=' + prods.length);
    const withInv = prods.find(p => w.Store.productStats(p.id).records > 0) || prods[0];
    const st1 = w.Store.productStats(withInv.id);
    check('productStats 含库存/水位/金额/关联字段',
      ['records', 'qty', 'value', 'level', 'warehouses', 'poDocs', 'poQty', 'poAmount', 'soDocs', 'soQty', 'soAmount', 'poItems']
        .every(k => k in st1), 'level=' + st1.level + ' value=' + st1.value);
    check('productStats 金额 = 库存量 × 单价', st1.value === w.U.round(st1.qty * (withInv.unitPrice || 0), 2), String(st1.value));
    const ref = w.Store.productRefs([withInv.id]);
    check('productRefs 含库存/采购/销售引用计数', ['inventory', 'purchases', 'sales'].every(k => k in ref), JSON.stringify(ref));

    // 4. 新增：表单 / 外币换算 / 保存入库 / 持久化
    click(w, appBtn('新增'));
    await sleep(220);
    check('新增弹窗打开（宽屏）', !!modal() && modal().className.includes('xwide'), 'cls=' + (modal() && modal().className));
    const fcount = modal().querySelectorAll('[data-f]').length;
    check('表单字段完整（含图片隐藏域 ≥28）', fcount >= 28, 'fields=' + fcount);
    check('表单含分组卡片（基础/价格/包装/档案）', modal().querySelectorAll('.card-pad h4').length >= 4,
      'h4=' + modal().querySelectorAll('.card-pad h4').length);
    // 必填拦截：清空名称与 SKU
    fld('name').value = ''; fld('sku').value = '';
    click(w, modalBtn('保存'));
    await sleep(150);
    check('必填校验：空名称/SKU 不保存，弹窗保持', !!modal());
    // 正常新增
    const MY_SKU = 'M-0001-TEST001';   // 字母序排第一，确保列表首页首行即本测试新品
    const MY_NAME = '自动化测试产品 ABC';
    const uP = w.Store.list('products')[0];
    fld('name').value = MY_NAME;
    fld('sku').value = MY_SKU;
    fld('supplierId').value = (w.Store.list('suppliers')[0] || {}).id || '';
    fld('unitPrice').value = '120.5';
    const beforeAdd = w.Store.list('products').length;
    await save();
    check('保存成功弹窗关闭', !modal());
    const added = w.Store.list('products').find(p => p.sku === MY_SKU);
    check('新品已入库', w.Store.list('products').length === beforeAdd + 1 && added && added.name === MY_NAME, added && added.sku);
    check('单价与 SKU 正确保存', added && added.unitPrice === 120.5 && added.sku === MY_SKU);
    // 分类跟随主供应商（不再手工填写）
    const addSup = w.Store.supplier(added.supplierId);
    check('新品分类自动跟随主供应商', added && addSup && added.category === addSup.category, added && ('cat=' + added.category));
    check('外币参考价自动换算（欧元/美元 > 0）', added && added.eurPrice > 0 && added.usdPrice > 0,
      'EUR=' + (added && added.eurPrice) + ' USD=' + (added && added.usdPrice));
    check('建档/更新时间已写入', added && !!added.createdAt && !!added.updatedAt);
    check('写入 localStorage 持久化', (w.localStorage.getItem('scm_db_v3') || '').includes(MY_NAME));

    // 5. SKU 重复校验（validate 拦截）
    const beforeDup = w.Store.list('products').length;
    click(w, appBtn('新增'));
    await sleep(200);
    fld('name').value = '重复SKU测试';
    fld('sku').value = uP.sku; // 已存在
    fld('supplierId').value = (w.Store.list('suppliers')[0] || {}).id || '';
    fld('unitPrice').value = '10';
    click(w, modalBtn('保存'));
    await sleep(180);
    check('重复 SKU 被拦截，弹窗保持', !!modal());
    check('重复 SKU 未入库', w.Store.list('products').length === beforeDup, 'n=' + w.Store.list('products').length);
    click(w, modalBtn('取消'));
    await sleep(80);

    // 6. 编辑回显
    const editBtn = Array.from(app().querySelectorAll('tbody tr')[0].querySelectorAll('button')).find(b => b.textContent === '编辑');
    check('列表含编辑按钮', !!editBtn);
    click(w, editBtn);
    await sleep(200);
    check('编辑时名称回显', fld('name').value === MY_NAME, fld('name') && fld('name').value);
    check('编辑时 SKU 回显', fld('sku').value === MY_SKU);
    check('编辑时单价回显', fld('unitPrice').value === '120.5');
    fld('remark').value = '编辑备注-测试';
    await save();
    const editTarget = w.Store.list('products').find(p => p.sku === MY_SKU);
    check('编辑保存成功', !modal() && editTarget && editTarget.remark === '编辑备注-测试');

    // 7. 完整档案抽屉
    click(w, app().querySelector('#aApp .bold.link'));
    await sleep(220);
    const dr = drawer();
    check('完整档案抽屉打开', !!dr);
    check('抽屉含库存与经营概览', dr && dr.textContent.includes('库存与经营概览') && dr.querySelectorAll('svg').length >= 1);
    check('抽屉含完整产品档案', dr && dr.textContent.includes('完整产品档案'), 'dt=' + (dr && dr.querySelectorAll('dt').length));
    check('抽屉字段条目 ≥30（全部字段 + 关联记录）', dr && dr.querySelectorAll('dt').length >= 30, 'dt=' + (dr && dr.querySelectorAll('dt').length));
    check('抽屉含库存分布明细', dr && dr.textContent.includes('库存分布明细'));
    check('抽屉含关联业务统计', dr && dr.textContent.includes('关联业务统计') && dr.textContent.includes('累计采购额'));
    check('抽屉含最近采购记录', dr && dr.textContent.includes('最近采购记录'));
    click(w, (dr && dr.querySelector('.modal-close')));
    await sleep(80);
    check('抽屉可关闭', !drawer());

    // 8. 停用 / 启用
    const stopBtn = Array.from(app().querySelectorAll('tbody tr')[0].querySelectorAll('button')).find(b => b.textContent === '停用');
    check('在售产品显示停用操作', !!stopBtn);
    const stopTargetId = (w.Store.list('products').find(p => p.sku === MY_SKU) || {}).id;
    click(w, stopBtn);
    await sleep(150);
    const cfm = Array.from((modal() || d).querySelectorAll('button')).find(b => /确定|停用|确认/.test(b.textContent));
    click(w, cfm);
    await sleep(150);
    const stopTarget = w.Store.list('products').find(p => p.id === stopTargetId);
    check('停用后状态更新', stopTarget && stopTarget.status === 'inactive');
    const startBtn = Array.from(app().querySelectorAll('tbody tr')[0].querySelectorAll('button')).find(b => b.textContent === '启用');
    check('停用后显示启用操作', !!startBtn);
    click(w, startBtn);
    await sleep(150);
    check('启用后状态恢复', w.Store.list('products')[0].status === 'active');

    // 9. 批量删除 + 关联风险提示
    const boxes = Array.from(app().querySelectorAll('input[type=checkbox][data-sel]'));
    check('表格含多选列', boxes.length >= 2, 'boxes=' + boxes.length);
    check('批量删除常驻提示已显示', !!app().querySelector('.batch-hint'));
    if (boxes.length >= 2) {
      boxes[0].checked = true; change(w, boxes[0]);
      boxes[1].checked = true; change(w, boxes[1]);
      await sleep(60);
      const bar = app().querySelector('.batch-bar');
      check('批量条出现且显示已选 2 项', !!bar && /已选 2/.test(bar.textContent), bar && bar.textContent.slice(0, 30));
      const delBtn = Array.from(bar.querySelectorAll('button')).find(b => b.textContent.includes('批量删除'));
      check('批量条含「批量删除（2）」按钮', !!delBtn, delBtn && delBtn.textContent);
      click(w, delBtn);
      await sleep(150);
      check('批量删除确认弹窗打开', !!modal());
      const warn = modal() && modal().querySelector('.batch-warn');
      check('删除确认含关联风险提示（库存/采购/销售）', !!warn && /库存|采购|销售/.test(warn.textContent), warn && warn.textContent.slice(0, 50));
      const beforeDel = w.Store.list('products').length;
      click(w, modalBtn('确认删除'));
      await sleep(220);
      check('批量删除生效（精确减少 2 条）', w.Store.list('products').length === beforeDel - 2, beforeDel + ' → ' + w.Store.list('products').length);
    }

    // 10. 只读权限
    w.Store.setSession({ userId: 'U4', role: 'viewer', name: '访客', dept: '-' });
    await goto('#/products');
    check('只读角色无新增按钮', !appBtn('新增'));
    check('只读角色无勾选列', app().querySelectorAll('input[type=checkbox][data-sel]').length === 0);
    check('只读角色显示提示条', app().textContent.includes('只读模式'));
    w.Store.setSession({ userId: 'U1', role: 'admin', name: '管理员', dept: '运营部' });

    console.log('\n后台运行时错误：', errs.length ? errs.slice(0, 5) : '无');
    if (errs.length) f++;
    console.log('========== 后台功能：' + (f ? f + ' 项失败' : '全部通过 ✓') + ' ==========\n');
    if (f) fail();
  }

  // ============================================================
  // 二、三语回归：后台产品页 / 表单 / 抽屉 + 前台产品详情
  // ============================================================
  for (const lang of ['en', 'de']) {
    let f = 0;
    console.log('----- 三语 [' + lang + '] -----');
    const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) { f++; } };
    const noStruct = (t) => !PAGE_STRUCT_WORDS.some(w => (t || '').includes(w));

    // 后台
    {
      const { w, d, errs } = load('admin.html', lang);
      await sleep(1100);
      w.location.hash = '#/products'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      await sleep(350);
      const app = d.querySelector('#aApp');
      const residual = residualCN(app.textContent);
      check('页面无页面结构词残留中文', noStruct(app.textContent), residual.slice(0, 6).join('|'));
      const add = Array.from(app.querySelectorAll('button')).find(b => /New|Neu|新增/.test(b.textContent));
      click(w, add); await sleep(220);
      const m = d.querySelector('.modal');
      check('新增表单无结构词残留中文', m ? noStruct(m.textContent) : false, m ? residualCN(m.textContent).slice(0, 6).join('|') : 'no-modal');
      const close = m && m.querySelector('.modal-close'); close && click(w, close); await sleep(80);
      const link = d.querySelector('#aApp .bold.link'); link && click(w, link); await sleep(200);
      const dr = d.querySelector('.drawer');
      check('完整档案抽屉无结构词残留中文', dr ? noStruct(dr.textContent) : false, dr ? residualCN(dr.textContent).slice(0, 6).join('|') : 'no-drawer');
      const dc = dr && dr.querySelector('.modal-close'); dc && click(w, dc); await sleep(60);
      check('无运行时错误', errs.length === 0, errs.slice(0, 3).join('|'));
    }
    // 前台
    {
      const { w, d } = load('index.html', lang);
      await sleep(1100);
      w.location.hash = '#/products'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      await sleep(350);
      const app = d.querySelector('#app');
      check('前台产品目录无结构词残留中文', noStruct(app.textContent), residualCN(app.textContent).slice(0, 6).join('|'));
      const card = app.querySelector('.prod-card');
      card && click(w, card); await sleep(200);
      const m = d.querySelector('.modal');
      check('前台产品详情无结构词残留中文', m ? noStruct(m.textContent) : false, m ? residualCN(m.textContent).slice(0, 6).join('|') : 'no-modal');
    }
    console.log('========== 三语[' + lang + ']：' + (f ? f + ' 项失败' : '全部通过 ✓') + ' ==========\n');
    if (f) fail();
  }

  // ============================================================
  // 三、采购管理联动：采购明细按名称关联到已有产品（不再自动建档）
  // ============================================================
  {
    let f = 0;
    const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) f++; };
    const { w, d, errs } = load('admin.html', 'zh');
    await sleep(1100);
    const app = () => d.querySelector('#aApp');
    const click = (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    // 进入采购管理
    w.location.hash = '#/purchases'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(400);
    const before = w.Store.list('products').length;
    check('初始产品数 > 0', before > 0, 'before=' + before);

    // 用例 A：全新名称的采购明细——不应自动建档
    const newName = '采购联动全新名称测试品_' + Date.now();
    const addBtn = Array.from(app().querySelectorAll('button')).find(b => /新增/.test(b.textContent));
    check('采购页有新增按钮', !!addBtn);
    click(addBtn); await sleep(300);
    const modal = d.querySelector('.modal');
    check('采购新增弹窗打开', !!modal);
    const sup = modal.querySelector('[data-f=supplierId]');
    if (sup) sup.value = w.Store.list('suppliers')[0].id;
    const rows = modal.querySelectorAll('[data-row]');
    check('采购明细至少一行', rows.length >= 1, 'rows=' + rows.length);
    const nameInput = rows[0].querySelector('[data-n]');
    nameInput.value = newName;
    nameInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    const price = rows[0].querySelector('[data-p]'); price.value = '66.6';
    price.dispatchEvent(new w.Event('input', { bubbles: true }));
    const qty = rows[0].querySelector('[data-q]'); qty.value = '8';
    qty.dispatchEvent(new w.Event('input', { bubbles: true }));
    const saveBtn = Array.from(modal.querySelectorAll('.modal-foot button')).find(b => /保存/.test(b.textContent));
    check('采购保存按钮存在', !!saveBtn);
    click(saveBtn); await sleep(450);

    const after = w.Store.list('products').length;
    check('全新名称采购后产品数不变（不自动建档）', after === before, before + ' → ' + after);
    const np = w.Store.list('products').filter(p => p.name === newName)[0];
    check('新产品未写入产品主数据（需在产品管理显式建档）', !np, np ? 'id=' + np.id : 'null（符合预期）');
    const lastPO = w.Store.list('purchases')[0];
    const item = lastPO.items[0];
    check('全新明细 productId 为 null（仅保留名称文本）', item && !item.productId, item && item.productId);

    // 用例 B：命中已有产品名称——应自动关联 productId，且不新建
    const exist = w.Store.list('products')[0];
    const addBtn2 = Array.from(app().querySelectorAll('button')).find(b => /新增/.test(b.textContent));
    click(addBtn2); await sleep(300);
    const modal2 = d.querySelector('.modal');
    const sup2 = modal2.querySelector('[data-f=supplierId]');
    if (sup2) sup2.value = w.Store.list('suppliers')[0].id;
    const rows2 = modal2.querySelectorAll('[data-row]');
    const nameInput2 = rows2[0].querySelector('[data-n]');
    nameInput2.value = exist.name;
    nameInput2.dispatchEvent(new w.Event('input', { bubbles: true }));
    const qty2 = rows2[0].querySelector('[data-q]'); qty2.value = '5';
    qty2.dispatchEvent(new w.Event('input', { bubbles: true }));
    const saveBtn2 = Array.from(modal2.querySelectorAll('.modal-foot button')).find(b => /保存/.test(b.textContent));
    click(saveBtn2); await sleep(450);
    const after2 = w.Store.list('products').length;
    check('命中已有产品后产品数仍不变', after2 === after, after + ' → ' + after2);
    const po2 = w.Store.list('purchases')[0];
    const it2 = po2.items[0];
    check('命中已有产品 → 明细关联 productId', it2 && it2.productId === exist.id, it2 && it2.productId);

    check('无运行时错误', errs.length === 0, errs.slice(0, 3).join('|'));
    console.log('========== 采购联动（仅关联不建档）：' + (f ? f + ' 项失败' : '全部通过 ✓') + ' ==========\n');
    if (f) fail();
  }

  // 收集连续中文字符段（仅用于展示，真实判定见 noStruct）
  function residualCN(text) { return (text.match(/[一-龥]{2,}/g) || []); }

  process.exit(code);
})();
