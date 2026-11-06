/* 回归测试：旧缓存（产品模块上线前）场景 + 旧版「采购自动建档」残留清理
   - 验证 Store.init 在缺 products 的旧缓存下不崩溃、产品页不再空白
   - 验证「采购/销售明细 → 产品」仅做名称关联，不再自动建档（避免数量虚高/分类错误）
   - 验证 reconcileAutoProducts 标记 + removeAutoProducts 一键清理 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function load(file) {
  const SHIM = '<script>(function(){var m={};var ls={getItem:function(k){return m[k]||null;},' +
    'setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};' +
    'try{Object.defineProperty(window,"localStorage",{configurable:true,value:ls});}catch(e){}})();</script>';
  const html = fs.readFileSync(path.join(DIR, file), 'utf8').replace('<head>', '<head>' + SHIM);
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message || '')) errs.push('[jsdomError] ' + (e.message || e)); });
  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, file).replace(/\\/g, '/'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.message || e.message)));
  return { dom, errs, w: dom.window, d: dom.window.document };
}

let code = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) code = 1; };

(async () => {
  const { w, errs } = load('admin.html');
  await sleep(1400);

  // 1) 构造「老缓存」：删掉 products 数组
  const oldDb = JSON.parse(JSON.stringify(w.Store.db));
  delete oldDb.products;
  ok(oldDb.products === undefined, '构造老缓存：products 字段缺失');

  w.localStorage.setItem('scm_db_v3', JSON.stringify(oldDb));
  let threw = null;
  try { w.Store.init(); } catch (e) { threw = e; }
  ok(!threw, 'Store.init 在缺 products 的旧缓存下不崩溃' + (threw ? ' → ' + threw.message : ''));
  ok(Array.isArray(w.Store.db.products), 'init 后 products 为数组（不再 undefined）');
  ok(w.Store.db.products.length > 0, '产品页不再空白：补齐初始示例产品 ' + w.Store.db.products.length + ' 条');
  ok(errs.filter(e => /unshift|Cannot read|undefined/.test(e)).length === 0, '无 undefined 相关运行错误');

  // 2) 仅关联、不自动建档：塞入一条「全新名称」的采购明细，重算后不应新增产品
  const before = w.Store.db.products.length;
  if (w.Store.db.purchases && w.Store.db.purchases[0]) {
    w.Store.db.purchases[0].items = w.Store.db.purchases[0].items || [];
    w.Store.db.purchases[0].items.push({ name: '全新未建档品·不应被建档', price: 88, grade: '1:1', weight: 3, boxSpec: '8/箱', productId: null });
  }
  const linked = w.Store.ensureProductLinks();
  ok(w.Store.db.products.length === before, '采购明细「全新名称」不会自动建档（产品总数不变 ' + before + '）');
  const newItem = w.Store.db.purchases[0].items[w.Store.db.purchases[0].items.length - 1];
  ok(!newItem.productId, '全新明细 productId 保持 null（仅保留名称文本，不静默建档）');
  ok(linked >= 0, 'ensureProductLinks 仅做关联，返回关联数 ' + linked);

  // 3) 名称命中已有产品 → 关联 productId（不新建）
  const exist = w.Store.db.products[0];
  const po = w.Store.db.purchases[0];
  po.items.push({ name: exist.name, price: 10, grade: '1:1', weight: 1, boxSpec: '1/箱', productId: null });
  w.Store.ensureProductLinks();
  const linkedItem = po.items[po.items.length - 1];
  ok(linkedItem.productId === exist.id, '名称命中已有产品 → 关联 productId（不重复建档）');
  ok(w.Store.db.products.length === before, '关联已有产品后产品总数仍不变 ' + before);

  // 4) 旧版自动建档残留清理：造一个疑似自动建档产品（M-NEW 前缀 + 默认分类 + 命中采购明细名）
  const defCat = (w.Seed.CATS && w.Seed.CATS[0]) || '电子元器件';
  const junkName = '旧版自动建档残留品XYZ';
  if (po.items && po.items[0]) po.items[0].name = junkName;
  w.Store.db.products.push({
    id: 'P-AUTO-JUNK', sku: 'M-NEW-9999', name: junkName, category: defCat, grade: '1:1',
    status: 'active', unitPrice: 1, createdAt: w.U.today(), updatedAt: w.U.nowStr()
  });
  const beforeClean = w.Store.db.products.length;
  const tagged = w.Store.reconcileAutoProducts();
  ok(tagged >= 1, 'reconcileAutoProducts 标记出疑似自动建档产品 ' + tagged + ' 个');
  ok(w.Store.db.products.filter(p => p.source === 'auto').length >= 1, '疑似产品被打上 source:"auto"');
  const removed = w.Store.removeAutoProducts();
  ok(removed >= 1, 'removeAutoProducts 清理掉 ' + removed + ' 个自动建档产品');
  ok(w.Store.db.products.length === beforeClean - removed, '清理后产品总数正确减少（' + beforeClean + ' → ' + w.Store.db.products.length + '）');
  ok(!w.Store.db.products.some(p => p.id === 'P-AUTO-JUNK'), '残留产品已从列表移除');
  ok(w.Store.db.products.filter(p => p.source === 'auto').length === 0, '清理后无残留 auto 标记');

  // 5) 真实产品不应被误清：带正常 SKU 的产品保留
  ok(w.Store.db.products.some(p => p.id === exist.id), '正常产品（' + exist.name + '）未被误清理');

  console.log(code ? '\n=== 存在失败用例 ✗ ===' : '\n=== 老缓存兼容 / 清理：全部通过 ✓ ===');
  process.exit(code);
})();
