/* 采购模块增量测试：明细编辑器（缩略图/等级/欧元价/重量/箱规）、整单图片区已移除、保存闭环 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

  // 1. 打开采购页
  w.location.hash = '#/purchases';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await sleep(400);
  check('采购页渲染', d.querySelector('#aApp').innerHTML.length > 500);
  check('列表不含整单图片列', !d.querySelector('#aApp').textContent.includes('自动压缩存储'));
  check('收款条件已从列表移除', !d.querySelector('#aApp').textContent.includes('月结30天'));

  // 2. 打开新增弹窗
  const addBtn = Array.from(d.querySelectorAll('#aApp button')).find(b => b.textContent.includes('新增'));
  addBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  const modal = d.querySelector('.modal');
  check('新增弹窗打开', !!modal);
  if (!modal) { console.log('错误:', errs); process.exit(1); }

  // 3. 表单结构
  check('名称列为可填写输入框', !!modal.querySelector('[data-row] [data-n]') && modal.querySelector('[data-row] [data-n]').tagName === 'INPUT');
  check('名称列带产品建议 datalist', modal.querySelectorAll('datalist option').length > 10);
  check('弹窗含明细行', modal.querySelectorAll('[data-row]').length >= 1);
  check('弹窗含每行缩略图上传按钮', Array.from(modal.querySelectorAll('[data-row] button')).some(b => b.title === '上传产品图片'));
  check('等级为四档下拉', (() => {
    const g = modal.querySelector('[data-row] [data-g]');
    return g && g.tagName === 'SELECT' && g.options.length === 4 &&
      ['A quality', '1:1', 'Orginal', 'Pure Original'].every(v => Array.from(g.options).some(o => o.value === v));
  })());
  check('列头显示实时汇率', /1€ = [\d.]+ ¥/.test(modal.textContent));
  check('币种可切换（欧元/美元）', Array.from(modal.querySelectorAll('button')).some(b => b.textContent.includes('欧元')) && Array.from(modal.querySelectorAll('button')).some(b => b.textContent.includes('美元')));
  check('底部含近 7 日汇率列表', modal.textContent.includes('近 7 日汇率'));
  const rateRows = Array.from(modal.querySelectorAll('div')).filter(el => /^(今天|\d{2}-\d{2} 周)/.test((el.textContent || '').slice(0, 12).trim()) && el.style.display === 'grid');
  check('汇率列表逐日 7 行', rateRows.length >= 7, 'rows=' + rateRows.length);
  check('列表同时显示欧元与美元', modal.textContent.includes('欧元 EUR') && modal.textContent.includes('美元 USD'));
  check('列表含较前日涨跌', modal.textContent.includes('较前日'));
  check('汇率面板已无折线图', modal.querySelectorAll('.chart svg').length === 0);
  check('明细表头列齐全（等级/重量/箱规）', ['等级', '重量 kg', '箱规'].every(t => modal.textContent.includes(t)));
  check('整单图片区已移除', !modal.textContent.includes('自动压缩存储'));
  check('收款条件字段已移除', !modal.textContent.includes('收款') && !modal.textContent.includes('月结60天'));

  // 4. 填写明细并保存
  const row = modal.querySelector('[data-row]');
  const nameInput = row.querySelector('[data-n]');
  const qty = row.querySelector('[data-q]');
  qty.value = '500';
  // 名称改为一个已存在的产品，触发带出价格/重量/箱规
  const someProd = w.Store.list('products')[5];
  nameInput.value = someProd.name;
  nameInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(120);
  check('输入名称后带出采购价', Number(row.querySelector('[data-p]').value) > 0);
  check('外币价自动折算', Number(row.querySelector('[data-e]').value) > 0);
  check('重量自动带出', Number(row.querySelector('[data-w]').value) > 0);
  check('箱规自动带出', row.querySelector('[data-b]').value.includes('/箱'));
  const totalTxt = modal.textContent.match(/¥[\d,.]+/);
  check('合计自动计算', !!totalTxt, totalTxt && totalTxt[0]);

  // 4b. 合计条：同一行显示总数量 / 总重量 / 金额合计
  // 解析数值：兼容「万元 / 亿元」显示格式（如 ¥16.58万 → 165800）
  const num = (s) => {
    const str = String(s);
    const wan = str.match(/([\d.]+)\s*万/); if (wan) return Number(wan[1]) * 10000;
    const yi = str.match(/([\d.]+)\s*亿/); if (yi) return Number(yi[1]) * 1e8;
    return Number(str.replace(/[^\d.]/g, '')) || 0;
  };
  const expectedQty = Number(qty.value) || 0;
  /* 总重量与其它两项一样是「列求和」：Σ(各行重量)，不乘数量 */
  const expectedWeight = Array.from(modal.querySelectorAll('[data-row]'))
    .reduce((s, r) => s + (Number(r.querySelector('[data-w]').value) || 0), 0);
  const expectedAmount = expectedQty * (Number(row.querySelector('[data-p]').value) || 0);
  check('合计条三项标签齐全', ['总数量', '总重量', '金额合计'].every(t => modal.textContent.includes(t)));
  check('合计条总数量正确', num(modal.querySelector('[data-po-sum="qty"]').textContent) === expectedQty,
    '显示=' + modal.querySelector('[data-po-sum="qty"]').textContent + ' 期望=' + expectedQty);
  check('合计条总重量=各行重量之和', Math.abs(num(modal.querySelector('[data-po-sum="weight"]').textContent) - expectedWeight) < 0.02,
    '显示=' + modal.querySelector('[data-po-sum="weight"]').textContent + ' 期望=' + expectedWeight);
  check('合计条金额合计正确', Math.abs(num(modal.querySelector('[data-po-sum="amount"]').textContent) - expectedAmount) < 0.02,
    '显示=' + modal.querySelector('[data-po-sum="amount"]').textContent + ' 期望=' + expectedAmount);

  // 切换美元，外币价应重算
  const usdBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('美元'));
  const eurBefore = Number(row.querySelector('[data-e]').value);
  usdBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  check('切美元后列头更新', modal.textContent.includes('美元价 $'));
  check('切美元后外币价重算', Number(row.querySelector('[data-e]').value) !== eurBefore);

  const okBtn = Array.from(modal.querySelectorAll('.modal-foot button')).find(b => b.textContent === '保存');
  okBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  check('保存成功弹窗关闭', !d.querySelector('.modal'));

  // 5. 新数据校验（从 Store 验证）
  const po = w.Store.list('purchases')[0];
  check('新采购单已入库 Store', po && po.items.length === 1 && po.items[0].qty === 500,
    po && ('amount=' + po.amount + ' items=' + po.items.length));
  check('新采购单金额=明细合计', po && po.amount > 0, po && String(po.amount));
  check('新采购单记录计价币种', po && po.currency === 'USD', po && ('currency=' + po.currency));
  check('新采购单无收款条件字段', po && !('payTerm' in po));
  check('新采购单无整单 images 字段', po && !('images' in po));
  const it0 = po && po.items[0];
  check('明细含新字段（名称/缩略图/等级/汇率/外币价/重量/箱规）',
    it0 && it0.name && ('thumb' in it0) && ('grade' in it0) && ('fxRate' in it0) && ('foreignPrice' in it0) && ('weight' in it0) && ('boxSpec' in it0),
    it0 && ('name=' + it0.name + ' grade=' + it0.grade + ' fx=' + it0.fxRate + ' fp=' + it0.foreignPrice));
  check('明细等级在四档之内', it0 && ['A quality', '1:1', 'Orginal', 'Pure Original'].indexOf(it0.grade) >= 0, it0 && it0.grade);

  // 6. 详情弹窗
  w.location.hash = '#/purchases';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await sleep(300);
  const detailBtn = Array.from(d.querySelectorAll('#aApp button')).find(b => b.textContent === '明细');
  detailBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(250);
  const m2 = d.querySelector('.modal');
  check('详情弹窗打开', !!m2);
  check('详情含明细表', m2 && m2.querySelectorAll('tbody tr').length >= 1);
  check('详情无收款条件', m2 && !m2.textContent.includes('付款条件'));

  // 6b. 明细表最后一行汇总：总数量 / 总重量 / 金额合计
  const totalRow = m2 && m2.querySelector('tfoot tr.po-total-row');
  check('详情表格最后一行是汇总行', !!totalRow);
  if (totalRow) {
    const tds = totalRow.querySelectorAll('td');
    check('汇总行三项标签齐全', ['合计', '总数量', '总重量', '金额合计'].every(t => totalRow.textContent.includes(t)));
    check('汇总行首格跨 5 列、共 5 个单元格', tds.length === 5 && tds[0].getAttribute('colspan') === '5', 'td=' + tds.length);
    check('汇总行总数量正确', num(tds[1].textContent) === po.items[0].qty, tds[1].textContent);
    const sumItemWeight = po.items.reduce((s, x) => s + (Number(x.weight) || 0), 0);
    check('汇总行总重量=明细重量之和', Math.abs(num(tds[2].textContent) - sumItemWeight) < 0.02, tds[2].textContent);
    /* 从界面上「重量」列实际显示的数值反算，避免自己验证自己 */
    const columnWeight = Array.from(m2.querySelectorAll('tbody tr')).reduce((s, tr) => {
      const cell = tr.querySelectorAll('td')[6];
      return s + num(cell ? cell.textContent : '0');
    }, 0);
    check('汇总行总重量=界面重量列之和', Math.abs(num(tds[2].textContent) - columnWeight) < 0.02,
      '合计=' + tds[2].textContent + ' 列求和=' + columnWeight);
    check('汇总行总重量未乘数量', num(tds[2].textContent) < po.items[0].qty * po.items[0].weight, tds[2].textContent);
    check('汇总行金额合计=单据金额', Math.abs(num(tds[4].textContent) - po.amount) < po.amount * 0.01 + 60, tds[4].textContent);
  }

  // 6c. 编辑弹窗打开时合计条应立即汇总（不能显示初始 0）
  const closeBtn = m2 && Array.from(m2.querySelectorAll('.modal-foot button')).find(b => b.textContent === '关闭');
  if (closeBtn) closeBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  const editBtn = Array.from(d.querySelectorAll('#aApp button')).find(b => b.textContent === '编辑');
  if (editBtn) editBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(250);
  const m3 = d.querySelector('.modal');
  check('编辑弹窗打开', !!m3);
  if (m3 && m3.querySelector('[data-po-sum="qty"]')) {
    check('编辑弹窗合计条初始总数量正确', num(m3.querySelector('[data-po-sum="qty"]').textContent) === po.items[0].qty,
      m3.querySelector('[data-po-sum="qty"]').textContent);
    check('编辑弹窗合计条初始总重量正确', Math.abs(num(m3.querySelector('[data-po-sum="weight"]').textContent) - po.items.reduce((s, x) => s + (Number(x.weight) || 0), 0)) < 0.02,
      m3.querySelector('[data-po-sum="weight"]').textContent);
    check('编辑弹窗合计条初始金额正确', Math.abs(num(m3.querySelector('[data-po-sum="amount"]').textContent) - po.amount) < 0.02,
      m3.querySelector('[data-po-sum="amount"]').textContent);
    const cancel2 = Array.from(m3.querySelectorAll('.modal-foot button')).find(b => b.textContent === '取消');
    if (cancel2) cancel2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
  }

  // 7. 其余页面回归
  for (const key of ['dashboard', 'suppliers', 'inventory', 'reports', 'settings']) {
    w.location.hash = '#/' + key;
    w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(300);
    check('回归 #/' + key, d.querySelector('#aApp').innerHTML.length > 500);
  }

  console.log('\n错误:', errs.length ? errs.slice(0, 5) : '无');
  console.log('结果：' + (fail ? fail + ' 项异常 ✗' : '全部通过 ✓'));
  process.exit(fail ? 1 : 0);
})();
