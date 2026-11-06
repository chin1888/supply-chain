/* 分类跟随供应商 + 详情页字段隐藏 测试 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

const SHIM = '<script>(function(){var m={};var ls={getItem:function(k){return m[k]||null;},' +
  'setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};' +
  'try{Object.defineProperty(window,"localStorage",{configurable:true,value:ls});}catch(e){}})();</script>';

function load(file) {
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

(async () => {
  let code = 0;
  const fail = () => { code = 1; };
  let f = 0;
  const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) f++; };

  const { w, d, errs } = load('admin.html');
  await sleep(1200);
  const app = () => d.querySelector('#aApp');

  // ---------- 1. 分类跟随供应商：种子数据一致 ----------
  const prods = w.Store.list('products');
  const allMatch = prods.filter(p => p.supplierId).every(p => {
    const s = w.Store.supplier(p.supplierId);
    return s && p.category === s.category;
  });
  check('所有已关联供应商的产品，分类=供应商分类（种子）', allMatch, 'n=' + prods.length);

  // ---------- 2. 分类修正迁移：故意错配后 re-init 被纠正 ----------
  const target = prods[0];
  const sup = w.Store.supplier(target.supplierId);
  const wrongCat = (w.Seed.CATS.filter(c => c !== sup.category)[0]) || '电子元器件';
  target.category = wrongCat;
  w.Store.save();
  // 直接调用迁移方法（等价于 init 内 reconcileProductCategories），验证错配被纠正
  const fixedCount = w.Store.reconcileProductCategories();
  const after = w.Store.product(target.id);
  check('reconcileProductCategories 修正错配分类', after.category === sup.category, 'was=' + wrongCat + ' → now=' + after.category);
  check('迁移返回修正计数 ≥1', fixedCount >= 1, 'fixed=' + fixedCount);

  // ---------- 3. 详情抽屉隐藏红框字段 ----------
  w.location.hash = '#/products'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await sleep(400);
  // 点击第一个产品的「详情」按钮
  const detailBtn = Array.from(app().querySelectorAll('tbody tr button')).find(b => /详情/.test(b.textContent));
  check('产品列表有「详情」按钮', !!detailBtn);
  click(w, detailBtn); await sleep(350);
  const drawer = d.querySelector('.drawer');
  check('详情抽屉已打开', !!drawer);
  const HIDE_LABELS = ['SKU 编码', '条码', '品牌', '规格型号', '材质', '颜色', '税率', 'HS 编码', '最小起订量', '安全库存', '保质期', '质保期'];
  const drawerText = drawer ? drawer.textContent : '';
  const leaked = HIDE_LABELS.filter(l => drawerText.includes(l));
  check('详情页已隐藏红框字段（SKU/条码/品牌/规格/材质/颜色/税率/HS编码/最小起订量/安全库存/保质期/质保期）',
    leaked.length === 0, leaked.length ? '残留: ' + leaked.join(',') : '');
  // 字段计数（29 总字段 - 12 隐藏；rows 已排除 image）
  const countMatch = drawer && /共\s*(\d+)\s*个字段/.exec(drawerText);
  const shown = countMatch ? parseInt(countMatch[1], 10) : -1;
  // 总 FIELDS=30，image 已在 rows 内排除 → 29；再隐藏 12 → 17
  check('详情页字段计数已排除隐藏项', shown === 17, 'shown=' + shown);
  // 分类标签仍显示（且等于供应商分类）
  check('详情页仍展示「产品分类」', drawerText.includes('产品分类') || drawerText.includes(target.category),
    'cat=' + target.category);

  check('无运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n========== 分类跟随供应商 + 详情隐藏：' + (f ? f + ' 项失败' : '全部通过 ✓') + ' ==========');
  if (f) fail();
  process.exit(code);
})();
