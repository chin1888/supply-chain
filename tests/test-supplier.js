/* 供应商表单增量测试：主营品类可填写、省份-城市级联联动、保存闭环、旧数据兼容 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const change = (w, el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));

(async () => {
  const html = fs.readFileSync(path.join(DIR, 'admin.html'), 'utf8');
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
  const modal = () => d.querySelector('.modal');
  const fld = (k, root) => (root || modal()).querySelector('[data-f="' + k + '"]');
  const opts = (el) => el ? Array.from(el.options).map(o => o.value) : [];
  const save = async () => {
    const ok = Array.from(modal().querySelectorAll('.modal-foot button')).find(b => b.textContent === '保存');
    click(w, ok);
    await sleep(250);
  };

  // 1. 打开供应商页
  w.location.hash = '#/suppliers';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await sleep(400);
  check('供应商页渲染', d.querySelector('#aApp').innerHTML.length > 500);
  check('种子供应商已带省份', w.Store.list('suppliers').every(s => !!s.province),
    'sample=' + (w.Store.list('suppliers')[0] || {}).province);

  // 2. 新增弹窗结构
  const addBtn = Array.from(d.querySelectorAll('#aApp button')).find(b => b.textContent.includes('新增'));
  click(w, addBtn);
  await sleep(250);
  check('新增弹窗打开', !!modal());
  if (!modal()) { console.log('错误:', errs); process.exit(1); }

  const cat = fld('category');
  check('主营品类为可填写输入框', cat && cat.tagName === 'INPUT' && !cat.disabled);
  check('主营品类带已有品类建议', modal().querySelectorAll('datalist option').length >= 9);
  check('主营品类默认值可改', !!cat.value);
  const pSel = fld('province'), cSel = fld('city'), rSel = fld('region');
  check('所属省份为下拉', pSel && pSel.tagName === 'SELECT');
  check('城市为下拉', cSel && cSel.tagName === 'SELECT');
  check('省份覆盖全部省级行政区', pSel && pSel.options.length === 35, 'options=' + (pSel && pSel.options.length));
  check('含中国香港/中国澳门/中国台湾', ['中国香港', '中国澳门', '中国台湾'].every(x => opts(pSel).includes(x)));
  check('新增默认省份为上海市', pSel.value === '上海市' && cSel.value === '上海', pSel.value + '/' + cSel.value);

  // 3. 省份 → 城市 联动
  pSel.value = '广东省'; change(w, pSel);
  await sleep(50);
  check('广东联动出深圳/广州', opts(cSel).includes('深圳') && opts(cSel).includes('广州'));
  check('广东不含江苏城市', !opts(cSel).includes('苏州'));
  check('切换省份后自动带出所属区域', rSel.value === '华南', rSel.value);
  check('切换省份后城市重置为空', cSel.value === '', JSON.stringify(cSel.value));
  check('含「其他（手动填写）」选项', opts(cSel).includes('__custom__'));

  pSel.value = '江苏省'; change(w, pSel);
  await sleep(50);
  check('江苏联动出苏州/南京', opts(cSel).includes('苏州') && opts(cSel).includes('南京'));
  check('江苏不含广东城市', !opts(cSel).includes('深圳'));
  check('江苏自动带出华东', rSel.value === '华东', rSel.value);

  // 4. 手填主营品类 + 选城市 → 保存
  fld('name').value = '先导特种陶瓷有限公司';
  fld('code').value = 'S9901';
  cat.value = '定制化陶瓷基板 / 精密结构陶瓷';
  cSel.value = '苏州'; change(w, cSel);
  await save();
  check('保存后弹窗关闭', !modal());
  const s1 = w.Store.list('suppliers')[0];
  check('新供应商已入库', !!s1 && s1.code === 'S9901');
  check('主营品类自由填写生效', s1 && s1.category === '定制化陶瓷基板 / 精密结构陶瓷', s1 && s1.category);
  check('省份/城市/区域已保存', s1 && s1.province === '江苏省' && s1.city === '苏州' && s1.region === '华东',
    s1 && [s1.province, s1.city, s1.region].join('/'));
  check('未残留 cityCustom 字段', s1 && !('cityCustom' in s1));

  // 5. 自定义城市
  click(w, Array.from(d.querySelectorAll('#aApp button')).find(b => b.textContent.includes('新增')));
  await sleep(220);
  const p2 = fld('province'), c2 = fld('city');
  fld('name').value = '义乌小商品供应链';
  fld('code').value = 'S9902';
  p2.value = '浙江省'; change(w, p2);
  c2.value = '__custom__'; change(w, c2);
  await sleep(30);
  const custom = fld('cityCustom');
  check('选择「其他」后出现手填输入框', !!custom && custom.style.display !== 'none');
  custom.value = '义乌';
  await save();
  const s2 = w.Store.list('suppliers')[0];
  check('自定义城市保存生效', s2 && s2.city === '义乌' && s2.province === '浙江省', s2 && s2.city);
  check('自定义城市弹窗已关闭', !modal());

  // 6. 编辑刚创建的供应商：省份/城市正确回显
  const sk = d.querySelector('#aApp .a-toolbar input.input');
  sk.value = '义乌小商品供应链';
  sk.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(350);
  const targetRow = Array.from(d.querySelectorAll('#aApp tr')).find(tr => tr.textContent.includes('义乌小商品供应链'));
  const editBtn = targetRow && Array.from(targetRow.querySelectorAll('button')).find(b => b.textContent === '编辑');
  check('目标供应商行含编辑按钮', !!editBtn);
  click(w, editBtn);
  await sleep(250);
  const p3 = fld('province'), c3 = fld('city');
  check('编辑时省份回显', !!p3 && p3.value === '浙江省', p3 && p3.value);
  check('编辑时城市回显（含自定义值）', !!c3 && c3.value === '义乌', c3 && c3.value);
  check('编辑时品类可填写', fld('category') && fld('category').tagName === 'INPUT');
  // 改省份 → 城市重新联动
  p3.value = '四川省'; change(w, p3);
  await sleep(40);
  check('编辑时切省份联动城市', opts(c3).includes('成都') && !opts(c3).includes('杭州'));
  check('编辑时切省份联动区域', fld('region').value === '西南', fld('region').value);
  c3.value = '成都'; change(w, c3);
  await save();
  const s3 = w.Store.list('suppliers').filter(s => s.code === 'S9902')[0];
  check('编辑保存后省市更新', s3 && s3.province === '四川省' && s3.city === '成都' && s3.region === '西南',
    s3 && [s3.province, s3.city, s3.region].join('/'));

  // 7. 其它页面回归
  ['#/dashboard', '#/purchases', '#/inventory', '#/reports'].forEach(h => {
    w.location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  });
  await sleep(300);
  check('回归其它页面无错误', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('\n错误:', errs.length ? errs.slice(0, 5) : '无');
  console.log('结果：' + (fail ? fail + ' 项异常 ✗' : '全部通过 ✓'));
  process.exit(fail || errs.length ? 1 : 0);
})();
