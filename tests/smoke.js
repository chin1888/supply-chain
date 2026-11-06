/* 冒烟测试：用 jsdom 无头渲染两个入口的所有页面，捕获运行时错误 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function load(file) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');
  const vc = new VirtualConsole();
  const errs = [];
  // jsdom 未实现的浏览器 API（如 window.scrollTo）不算真实缺陷，过滤掉
  const isNoise = (m) => /Not implemented/i.test(m || '');
  vc.on('jsdomError', e => { if (!isNoise(e.message)) errs.push('[jsdomError] ' + (e.message || e)); });
  vc.on('error', (...a) => errs.push('[console.error] ' + a.join(' ')));
  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, file).replace(/\\/g, '/'),
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.stack || e.message)));
  await sleep(1200);
  return { dom, errs, w: dom.window, d: dom.window.document };
}

function inspect(w, d, sel) {
  const root = d.querySelector(sel);
  if (!root) return { err: '容器 ' + sel + ' 不存在' };
  const svg = root.querySelectorAll('svg').length;
  const tblRows = root.querySelectorAll('tbody tr').length;
  const cards = root.querySelectorAll('.card').length;
  const btns = root.querySelectorAll('button').length;
  return {
    html: root.innerHTML.length,
    子节点: root.children.length,
    SVG图表: svg,
    表格行: tblRows,
    卡片: cards,
    按钮: btns
  };
}

(async () => {
  let fail = 0;

  /* ---------- 前台 ---------- */
  console.log('\n========== 前台 index.html ==========');
  {
    const { w, d, errs } = await load('index.html');
    for (const h of ['#/home', '#/suppliers', '#/products', '#/tracking', '#/insight']) {
      w.location.hash = h;
      w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      await sleep(350);
      const r = inspect(w, d, '#app');
      console.log(h.padEnd(14), JSON.stringify(r));
      if (r.err || r.html < 500) { fail++; console.log('   ✗ 渲染异常'); }
    }
    // 交互：点击追踪列表项
    w.location.hash = '#/tracking'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(300);
    const items = d.querySelectorAll('.track-item');
    if (items.length > 2) { items[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(200); }
    console.log('交互：订单追踪点击 →', d.querySelectorAll('.timeline .node').length, '个时间线节点');
    console.log('错误：', errs.length ? errs.slice(0, 5) : '无');
    if (errs.length) fail++;
  }

  /* ---------- 后台 ---------- */
  console.log('\n========== 后台 admin.html ==========');
  {
    const { w, d, errs } = await load('admin.html');
    const pages = ['dashboard', 'suppliers', 'purchases', 'warehouses', 'products', 'inventory', 'orders', 'logistics', 'finance', 'reports', 'settings'];
    for (const key of pages) {
      w.location.hash = '#/' + key;
      w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      await sleep(400);
      const r = inspect(w, d, '#aApp');
      console.log(('#/' + key).padEnd(14), JSON.stringify(r));
      if (r.err || r.html < 500) { fail++; console.log('   ✗ 渲染异常'); }
      if (key === 'inventory') {
        const txt = d.querySelector('#aApp').textContent;
        const removed = !/补货建议|建议补货量|生成采购单/.test(txt) && /批次号|库存量/.test(txt);
        console.log('   ' + (removed ? '✓ 补货建议模块已移除，库存明细表格保留' : '✗ 补货建议模块仍存在或库存明细表格缺失'));
        if (!removed) fail++;
      }
      if (key === 'products') {
        const crumb = d.querySelector('#aCrumb').textContent;
        const kpi = d.querySelector('#aApp').querySelectorAll('.a-strip .kpi').length;
        const tr = d.querySelector('#aApp').querySelectorAll('tbody tr').length;
        const ok = /产品管理/.test(crumb) && kpi === 4 && tr > 0;
        console.log('   ' + (ok ? '✓ 产品管理页：面包屑 + 4 KPI + 列表渲染正常' : '✗ 产品管理页渲染异常 crumb=' + crumb.slice(0, 16) + ' kpi=' + kpi + ' tr=' + tr));
        if (!ok) fail++;
      }
    }
    // 报表维度切换
    w.location.hash = '#/reports'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(300);
    const segs = d.querySelectorAll('.seg button');
    for (let i = 0; i < segs.length; i++) {
      segs[i].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await sleep(250);
      const n = d.querySelectorAll('#aApp svg').length;
      console.log('   维度[' + segs[i].textContent + '] → SVG', n);
      if (n === 0) { fail++; console.log('   ✗ 无图表'); }
    }
    // 打开新增弹窗（采购）
    w.location.hash = '#/purchases'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(300);
    const addBtn = Array.from(d.querySelectorAll('#aApp button')).find(b => b.textContent.includes('新增'));
    if (addBtn) {
      addBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await sleep(250);
      const modal = d.querySelector('.modal');
      console.log('弹窗：', modal ? '已打开，字段数 ' + modal.querySelectorAll('[data-f]').length : '✗ 未打开');
      if (!modal) fail++;
      else {
        // 填写并保存（新明细行需填名称）
        modal.querySelectorAll('[data-f]').forEach(inp => {
          if (inp.dataset.f === 'amount') inp.value = '12345';
        });
        const nameInp = modal.querySelector('[data-row] [data-n]');
        if (nameInp) {
          nameInp.value = w.Store.list('products')[0].name;
          nameInp.dispatchEvent(new w.Event('input', { bubbles: true }));
        }
        await sleep(120);
        const ok = Array.from(modal.querySelectorAll('button')).find(b => b.textContent === '保存');
        ok && ok.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await sleep(250);
        console.log('保存后弹窗关闭：', d.querySelector('.modal') ? '✗ 仍打开' : '✓');
      }
    }
    // 供应商详情抽屉
    w.location.hash = '#/suppliers'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(300);
    const link = d.querySelector('#aApp .link');
    if (link) {
      link.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await sleep(250);
      console.log('供应商抽屉：', d.querySelector('.drawer') ? '✓ 已打开' : '✗ 未打开');
    }
    console.log('错误：', errs.length ? errs.slice(0, 8) : '无');
    if (errs.length) fail++;
  }

  console.log('\n========== 结果：' + (fail ? fail + ' 项异常' : '全部通过 ✓') + ' ==========\n');
  process.exit(fail ? 1 : 0);
})();
