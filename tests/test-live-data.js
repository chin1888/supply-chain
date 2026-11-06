/* 财务对账 / 报表分析专项测试：老示例数据已清除、全部指标由实际业务单据实时派生 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHIM = '<script>(function(){var m={};var ls={getItem:function(k){return m[k]||null;},' +
  'setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};' +
  'try{Object.defineProperty(window,"localStorage",{configurable:true,value:ls});}catch(e){}})();</script>';

(async () => {
  const html = fs.readFileSync(path.join(DIR, 'admin.html'), 'utf8').replace('<head>', '<head>' + SHIM);
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message || '')) errs.push('[jsdomError] ' + (e.message || e)); });
  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, 'admin.html').replace(/\\/g, '/'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.message || e.message)));
  await sleep(1200);
  const w = dom.window, d = w.document, S = w.Store, A = w.Analytics, U = w.U;
  const db = () => S.db;
  let fail = 0;
  const check = (name, ok, extra) => {
    console.log((ok ? '✓' : '✗') + ' ' + name + (extra != null ? '  ' + extra : ''));
    if (!ok) fail++;
  };
  const n = v => Number(v) || 0;
  const sum = (arr, fn) => arr.reduce((a, x) => a + n(fn(x)), 0);
  const round1 = v => U.round(v, 1);

  /* ---------- 1. 老示例数据清除 ---------- */
  check('派生层已加载', !!A && typeof A.refresh === 'function');
  check('旧种子假账单已清除', db().invoices.every(x => !/^INV\d+$/.test(String(x.id || ''))));
  check('数据模式标记为实时', db().meta.liveData === true);
  check('月度趋势 12 个月', db().monthly.length === 12, db().monthly.length);
  check('品类数据非空', db().categoryData.length > 0, db().categoryData.length);
  check('区域数据非空', db().regionData.length > 0, db().regionData.length);

  /* ---------- 2. 账单来自实际单据 ---------- */
  const pos = db().purchases.filter(p => p.status !== 'cancelled');
  const sos = db().sales.filter(s => s.status !== 'cancelled');
  const autos = db().invoices.filter(x => x.autoKey);
  check('自动账单数 = 有效采购单 + 有效销售单', autos.length === pos.length + sos.length,
    autos.length + ' = ' + pos.length + ' + ' + sos.length);
  check('账单全部为自动/手工两类', db().invoices.every(x => x.autoKey || x._manual));
  const pInv = autos.find(x => x.refNo === pos[0].no);
  check('应付账单金额 = 采购单金额', !!pInv && Math.abs(pInv.amount - pos[0].amount) < 0.01,
    pInv && pInv.amount);
  check('应付账单往来单位 = 供应商', !!pInv && pInv.counterparty === pos[0].supplierName);
  check('应付账单开票日 = 采购单下单日', !!pInv && pInv.issuedAt === pos[0].createdAt);
  const sInv = autos.find(x => x.refNo === sos[0].no);
  check('应收账单金额 = 销售订单金额', !!sInv && Math.abs(sInv.amount - sos[0].amount) < 0.01);
  check('应收账单往来单位 = 客户', !!sInv && sInv.counterparty === sos[0].customer);
  check('账单类型仅应付/应收', autos.every(x => x.type === 'payable' || x.type === 'receivable'));

  /* ---------- 3. 月度趋势与单据聚合一致 ---------- */
  const m = db().monthly[11], mk = m.month;
  const poM = pos.filter(p => String(p.createdAt).slice(0, 7) === mk);
  const soM = sos.filter(s => String(s.createdAt).slice(0, 7) === mk);
  check('当月采购额 = 当月采购单合计', Math.abs(m.purchase - round1(sum(poM, p => p.amount) / 10000)) < 0.2,
    m.purchase + ' / ' + round1(sum(poM, p => p.amount) / 10000));
  check('当月销售额 = 当月销售单合计', Math.abs(m.sales - round1(sum(soM, s => s.amount) / 10000)) < 0.2);
  check('毛利 = 销售额 - 销售成本', Math.abs(m.profit - round1(m.sales - m.salesCost)) < 0.2);
  check('退货率无单据时为 0（不编造）', m.returnRate === 0);
  const shipM = (db().shipments || []).filter(x => {
    const nodes = x.nodes || [];
    return String(nodes.length ? nodes[0].at : x.eta).slice(0, 7) === mk;
  });
  check('当月运费 = 当月运单成本', Math.abs(m.freight - round1(sum(shipM, s => s.cost) / 10000)) < 0.2,
    m.freight + ' / ' + round1(sum(shipM, s => s.cost) / 10000));
  check('月度趋势不再有随机质量/退货值', db().monthly.every(x => x.returnRate === 0 && x.onTime <= 100));

  /* ---------- 4. 品类 / 区域与单据一致 ---------- */
  const catTotal = round1(sum(db().categoryData, x => x.amount));
  const poTotal = round1(sum(pos, p => p.amount) / 10000);
  check('品类金额合计 = 采购单总额', Math.abs(catTotal - poTotal) < 2, catTotal + ' / ' + poTotal);
  const regTotal = round1(sum(db().regionData, x => x.amount));
  check('区域金额合计 = 采购单总额', Math.abs(regTotal - poTotal) < 2, regTotal + ' / ' + poTotal);
  const regSup = sum(db().regionData, x => x.suppliers);
  check('区域供应商数 = 供应商总数', regSup === db().suppliers.length, regSup + ' / ' + db().suppliers.length);
  const mx = A.regionCategoryMatrix();
  check('区域×品类矩阵有行有列', mx.rows.length > 0 && mx.cols.length > 0 && mx.values.length === mx.rows.length);
  const margin = A.categoryMargin();
  check('品类毛利率由销售明细计算', margin.length > 0 && margin.every(x => isFinite(x.margin) && x.margin <= 100));

  /* ---------- 5. 业务单据变化后实时联动 ---------- */
  const before = db().invoices.length;
  const po = S.add('purchases', {
    no: 'PO-TEST-LIVE', supplierId: pos[0].supplierId, supplierName: pos[0].supplierName,
    items: [], amount: 1000, currency: 'CNY', status: 'approved',
    createdAt: U.today(), expectedAt: U.addDays(null, 30), receivedAt: null,
    buyer: '测试', warehouseId: S.firstWarehouseId(), remark: ''
  });
  const newInv = db().invoices.find(x => x.autoKey === 'PO:' + po.id);
  check('新增采购单 → 自动生成应付账单', db().invoices.length === before + 1 && !!newInv);
  check('新账单金额 = 新单据金额', !!newInv && newInv.amount === 1000);
  S.update('purchases', po.id, { amount: 23456.78 });
  check('修改单据金额 → 账单同步', Math.abs(db().invoices.find(x => x.autoKey === 'PO:' + po.id).amount - 23456.78) < 0.01);
  S.update('invoices', newInv.id, { status: 'paid', paidAt: U.today() });
  check('结清状态在重算后保留', db().invoices.find(x => x.autoKey === 'PO:' + po.id).status === 'paid');
  S.update('purchases', po.id, { status: 'cancelled' });
  check('单据取消 → 账单移除', !db().invoices.some(x => x.autoKey === 'PO:' + po.id));
  S.remove('purchases', po.id);

  const manual = S.add('invoices', {
    no: 'FP-TEST-MANUAL', type: 'payable', counterparty: '测试单位', refNo: '-',
    amount: 888, taxRate: 13, method: '银行转账', status: 'pending',
    issuedAt: U.today(), dueAt: U.addDays(null, 30), paidAt: null, _manual: true
  });
  check('手工账单重算后保留', db().invoices.some(x => x.id === manual.id && x.amount === 888));
  S.update('invoices', manual.id, { amount: 999 });
  check('手工账单可编辑', db().invoices.find(x => x.id === manual.id).amount === 999);
  S.remove('invoices', manual.id);
  check('手工账单可删除', !db().invoices.some(x => x.id === manual.id));

  /* ---------- 6. 财务统计与侧栏徽章跟随实际账单 ---------- */
  const st = S.stats();
  const unpaid = db().invoices.filter(x => x.status !== 'paid');
  check('应付账款 = 未结应付账单合计',
    Math.abs(st.payable - sum(unpaid.filter(x => x.type === 'payable'), x => x.amount)) < 0.01);
  check('应收账款 = 未结应收账单合计',
    Math.abs(st.receivable - sum(unpaid.filter(x => x.type === 'receivable'), x => x.amount)) < 0.01);
  check('逾期笔数 = 逾期账单数', st.overdueCount === db().invoices.filter(x => x.status === 'overdue').length,
    st.overdueCount);

  /* ---------- 7. 两个页面渲染 & 自动账单只读 ---------- */
  function goto(hash) {
    w.location.hash = hash;
    w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  }
  goto('#/finance'); await sleep(350);
  const fTxt = d.querySelector('#aApp').textContent;
  check('财务对账页渲染', d.querySelector('#aApp').innerHTML.length > 1000);
  check('财务页显示来源列', fTxt.includes('来源'));
  check('财务页显示实时数据说明', fTxt.includes('自动生成'));
  const rows = Array.from(d.querySelectorAll('#aApp table.tbl tbody tr'));
  const autoRow = rows.find(r => /FP-(AP|AR)-/.test(r.textContent));
  check('自动账单行存在', !!autoRow);
  if (autoRow) {
    check('自动账单不可编辑/删除', !/编辑|删除/.test(autoRow.textContent), autoRow.textContent.slice(-60));
    check('自动账单可结清', /结清/.test(autoRow.textContent));
  }

  goto('#/reports'); await sleep(350);
  const segs = Array.from(d.querySelectorAll('#aApp .seg button'));
  check('报表维度按钮 5 个', segs.length === 5, segs.length);
  for (let i = 0; i < segs.length; i++) {
    segs[i].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
    check('维度「' + segs[i].textContent + '」渲染正常', d.querySelector('#aApp').innerHTML.length > 1000);
  }
  check('报表页显示实际数据说明', d.querySelector('#aApp').textContent.includes('实际业务单据'));
  check('报表页无硬编码平均毛利', !/30 \+|unitPrice > 100/.test(d.querySelector('#aApp').innerHTML));

  /* ---------- 8. 三语新文案 ---------- */
  const zhSample = '账单由采购单 / 销售订单自动生成，随业务单据实时更新；手工录入的账单可编辑删除。';
  check('中文词条存在', !!w.I18n.dict[zhSample]);
  check('英文说明已配置', /generated|automatically/i.test(w.I18n.dict[zhSample][0]));
  check('德文说明已配置', /Rechnungen|Bestellungen/.test(w.I18n.dict[zhSample][1]));
  ['来源', '业务单据', '手工录入', '数据来自实际业务单据 · 近 12 个月',
    '销售额 - 销售成本（万元）', '库存金额（万元）· 实际毛利率（%）',
    '按实际采购单聚合（万元）'].forEach(k => check('词条「' + k + '」三语齐备',
    !!w.I18n.dict[k] && w.I18n.dict[k].length === 2 && !/[\u4e00-\u9fff]/.test(w.I18n.dict[k][0] + w.I18n.dict[k][1])));

  console.log('\n错误:', errs.length ? errs.join('\n') : '无');
  if (errs.length) fail += errs.length;
  console.log('========== 结果：' + (fail ? '失败 ' + fail + ' 项' : '全部通过 ✓') + ' ==========');
  process.exit(fail ? 1 : 0);
})();
