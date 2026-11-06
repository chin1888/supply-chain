/* 文案提取工具：无头渲染所有页面，导出可见文案（文本节点 + 属性）用于构建词典 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = { text: {}, attr: {}, title: {} };

function collect(d, tag) {
  const walker = d.createTreeWalker(d.body, 5 /* SHOW_TEXT */ | 1 /* SHOW_ELEMENT */, null, false);
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 3) {
      const s = n.nodeValue.trim();
      if (s && /[\u4e00-\u9fff]/.test(s)) out.text[s] = (out.text[s] || 0) + 1;
    } else if (n.nodeType === 1) {
      ['placeholder', 'title', 'aria-label', 'alt'].forEach(a => {
        const v = n.getAttribute && n.getAttribute(a);
        if (v && /[\u4e00-\u9fff]/.test(v)) out.attr[v] = (out.attr[v] || 0) + 1;
      });
      if ((n.tagName === 'INPUT' || n.tagName === 'BUTTON') && /[\u4e00-\u9fff]/.test(n.value || '')) {
        out.attr[n.value] = (out.attr[n.value] || 0) + 1;
      }
    }
  }
  if (d.title && /[\u4e00-\u9fff]/.test(d.title)) out.title[d.title] = (out.title[d.title] || 0) + 1;
}

async function load(file) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, file).replace(/\\/g, '/'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
  });
  await sleep(1000);
  return { w: dom.window, d: dom.window.document };
}

function click(d, w, el) { if (el) el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }

(async () => {
  /* 前台 */
  {
    const { w, d } = await load('index.html');
    for (const h of ['#/home', '#/suppliers', '#/products', '#/tracking', '#/insight']) {
      w.location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      await sleep(250); collect(d, 'portal ' + h);
    }
    w.location.hash = '#/tracking'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(250);
    click(d, w, d.querySelectorAll('.track-item')[1]); await sleep(200); collect(d, 'portal tracking detail');
    w.location.hash = '#/home'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(250);
    d.querySelectorAll('button, .seg button, .tab').forEach(b => { click(d, w, b); });
    await sleep(300); collect(d, 'portal clicks');
  }
  /* 后台：所有页面 + 新增弹窗 + 详情抽屉 + 用户菜单 + 报表维度 */
  {
    const { w, d } = await load('admin.html');
    const pages = ['dashboard', 'products', 'suppliers', 'purchases', 'warehouses', 'inventory', 'orders', 'logistics', 'finance', 'reports', 'settings'];
    for (const key of pages) {
      w.location.hash = '#/' + key; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      await sleep(300); collect(d, 'admin #/' + key);
      // 打开所有「新增」按钮
      const add = Array.from(d.querySelectorAll('#aApp button')).find(b => /新增|添加|新建/.test(b.textContent));
      if (add) { click(d, w, add); await sleep(250); collect(d, 'admin modal #/' + key); }
      const mask = d.querySelector('.modal-mask'); if (mask) mask.remove();
      const drawer = d.querySelector('.drawer'); if (drawer) drawer.remove();
      // 详情链接/抽屉
      const link = d.querySelector('#aApp .link');
      if (link) { click(d, w, link); await sleep(250); collect(d, 'admin drawer #/' + key); }
      const mask2 = d.querySelector('.modal-mask'); if (mask2) mask2.remove();
      const drawer2 = d.querySelector('.drawer'); if (drawer2) drawer2.remove();
      // 报表/图表维度切换
      d.querySelectorAll('.seg button').forEach(b => { click(d, w, b); });
      await sleep(250); collect(d, 'admin seg #/' + key);
    }
    // 用户菜单
    click(d, w, d.querySelector('#aUser')); await sleep(200); collect(d, 'admin usermenu');
    const menu = d.querySelector('.a-user .menu'); if (menu) menu.remove();
    // 批量选择条
    w.location.hash = '#/suppliers'; w.dispatchEvent(new w.HashChangeEvent('hashchange')); await sleep(250);
    const cb = d.querySelector('#aApp input[type=checkbox]');
    if (cb) { cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(200); collect(d, 'admin batchbar'); }
  }
  /* 源码字符串补集 */
  const src = {};
  const files = [];
  (function walk(p) {
    fs.readdirSync(p, { withFileTypes: true }).forEach(e => {
      const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f); else if (/\.js$/.test(e.name)) files.push(f);
    });
  })(path.join(DIR, 'assets/js'));
  files.forEach(f => {
    const s = fs.readFileSync(f, 'utf8');
    const re = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
    let m;
    while ((m = re.exec(s))) {
      const t = m[2].trim();
      if (/[\u4e00-\u9fff]/.test(t) && t.length < 120 && !/[<>]|\\n|^\s*$/.test(t)) src[t] = (src[t] || 0) + 1;
    }
  });
  const result = {
    text: Object.keys(out.text).sort(),
    attr: Object.keys(out.attr).sort(),
    title: Object.keys(out.title).sort(),
    source: Object.keys(src).sort(),
    stats: { text: Object.keys(out.text).length, attr: Object.keys(out.attr).length, source: Object.keys(src).length }
  };
  fs.writeFileSync(path.join(__dirname, 'i18n-corpus.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result.stats));
})();
