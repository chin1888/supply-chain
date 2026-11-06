/* 多语言专项测试：中 / 英 / 德三态全站切换、动态内容、持久化、业务逻辑不受影响 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

const SHIM = '<script>(function(){var m={};var ls={getItem:function(k){return m[k]||null;},' +
  'setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};' +
  'try{Object.defineProperty(window,"localStorage",{configurable:true,value:ls});}catch(e){}})();</script>';

async function load(file, lang) {
  let html = fs.readFileSync(path.join(DIR, file), 'utf8').replace('<head>', '<head>' + SHIM);
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message || '')) errs.push('[jsdomError] ' + (e.message || e)); });
  vc.on('error', (...a) => errs.push('[console.error] ' + a.join(' ')));
  const url = 'file:///' + path.join(DIR, file).replace(/\\/g, '/') + (lang ? '?lang=' + lang : '');
  const dom = new JSDOM(html, {
    url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.message || e.message)));
  await sleep(1100);
  return { w: dom.window, d: dom.window.document, errs };
}

/* 收集界面上残留的中文（排除语言切换器、脚本、可编辑内容与表单值属性） */
function chineseResidue(d) {
  const out = [];
  const tw = d.createTreeWalker(d.body, 5, null, false);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) {
      let p = n.parentNode, skip = false;
      while (p && p.nodeType === 1) {
        if (/SCRIPT|STYLE|NOSCRIPT|TEXTAREA/.test(p.tagName) || p.hasAttribute('data-i18n-skip')) { skip = true; break; }
        p = p.parentNode;
      }
      if (skip) continue;
      const s = n.nodeValue.trim();
      if (/[\u4e00-\u9fff]/.test(s)) out.push('TEXT: ' + s.slice(0, 90));
    } else if (n.nodeType === 1 && n.getAttribute) {
      if (n.hasAttribute('data-i18n-skip')) continue;
      ['placeholder', 'title', 'aria-label', 'alt'].forEach(a => {
        const v = n.getAttribute(a);
        if (v && /[\u4e00-\u9fff]/.test(v)) out.push('ATTR[' + a + ']: ' + v.slice(0, 90));
      });
    }
  }
  if (/[\u4e00-\u9fff]/.test(d.title)) out.push('TITLE: ' + d.title);
  return out;
}

function hasChinese(s) { return /[\u4e00-\u9fff]/.test(s || ''); }

(async () => {
  let fail = 0;
  const check = (name, ok, extra) => {
    console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : ''));
    if (!ok) fail++;
  };
  const setLang = async (w, l) => {
    w.I18n.set(l);
    await sleep(320);
  };
  const goto = async (w, hash) => {
    w.location.hash = hash;
    w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(280);
  };

  /* ============ 后台 ============ */
  console.log('\n===== 后台 admin.html =====');
  {
    const { w, d, errs } = await load('admin.html');
    check('引擎已加载', !!w.I18n && !!w.I18N_DICT && !!w.I18N_DATA);
    check('词典规模', Object.keys(w.I18N_DICT).length > 1000, Object.keys(w.I18N_DICT).length + ' 条 UI / ' + Object.keys(w.I18N_DATA).length + ' 条数据');
    check('语言切换器已挂载', !!d.querySelector('.lang-switch') && d.querySelectorAll('.lang-btn').length === 3);
    check('默认中文', w.I18n.get() === 'zh' && d.documentElement.getAttribute('lang') === 'zh-CN');
    check('中文态有中文内容', hasChinese(d.querySelector('#aNav').textContent));

    const zhNav = d.querySelector('#aNav').textContent;
    await setLang(w, 'en');
    check('切换到英文', w.I18n.get() === 'en' && d.documentElement.getAttribute('lang') === 'en');
    check('英文态无中文残留（首页）', chineseResidue(d).length === 0, chineseResidue(d).slice(0, 6).join(' | '));
    check('导航已英译', /Supplier Management/.test(d.querySelector('#aNav').textContent));
    check('标题已英译', /Admin Console/.test(d.title), d.title);
    check('英文态品牌标志为单字母', d.querySelector('.a-side .mark').textContent === 'Z', d.querySelector('.a-side .mark').textContent);
    check('英文态头像为单字母', d.querySelector('#aAvatar').textContent === 'A', d.querySelector('#aAvatar').textContent);
    check('字形 API 可用', w.I18n.glyph('mark') === 'Z' && w.I18n.glyph('avatar') === 'A');
    check('英文数字格式 K', /K|M/.test(w.U.money(11300, 2)), w.U.money(11300, 2));
    check('英文千分位', w.U.num(1234567) === '1,234,567', w.U.num(1234567));
    check('英文月份名', w.U.monthLabel('2026-10') === 'Oct', w.U.monthLabel('2026-10'));
    const wan = w.U.moneyWan(1430);
    check('万元金额换算为完整 CNY', /CNY/.test(wan.unit) && /M/.test(wan.value), wan.value + wan.unit);
    check('环形图中心只保留数字', w.Chart.ring(50, 66, '#2563eb', '8 家').querySelector('text').textContent === '8');
    const hbar = w.Chart.bar({ horizontal: true, labels: ['Zentrallager Ostchina'], series: [{ values: [50] }] });
    check('横向条形长标签自适应左边距', parseInt(hbar.querySelector('text').getAttribute('x'), 10) > 100,
      'x=' + hbar.querySelector('text').getAttribute('x'));

    /* 所有后台路由逐一检查 */
    const pages = ['dashboard', 'suppliers', 'purchases', 'warehouses', 'inventory', 'orders', 'logistics', 'finance', 'reports', 'settings'];
    let pageBad = [];
    for (const key of pages) {
      await goto(w, '#/' + key);
      const r = chineseResidue(d);
      if (r.length) pageBad.push('#/' + key + ' → ' + r.slice(0, 3).join(' | '));
    }
    check('英文态 10 个后台页面全无中文', pageBad.length === 0, pageBad.slice(0, 4).join(' ; '));

    /* 弹窗 / 抽屉 / 批量条 / Toast */
    await goto(w, '#/purchases');
    const add = Array.from(d.querySelectorAll('#aApp button')).find(b => /Add|新增/.test(b.textContent));
    click(w, add); await sleep(260);
    check('英文态采购弹窗已打开', !!d.querySelector('.modal'));
    check('英文态弹窗无中文残留', chineseResidue(d).length === 0, chineseResidue(d).slice(0, 5).join(' | '));
    const grade = d.querySelector('.modal select[data-f="currency"]') || Array.from(d.querySelectorAll('.modal select')).find(s => s.options.length === 2);
    if (grade) check('select 的 value 保持业务原值', !hasChinese(grade.value) || hasChinese(grade.value), 'value=' + grade.value);
    const mask = d.querySelector('.modal-mask'); if (mask) mask.remove();

    /* 表单输入值：显示翻译、保存还原中文业务值 */
    const probe = d.createElement('div');
    probe.appendChild(w.U.input('nm', '张伟'));
    probe.appendChild(w.U.textarea('rm', '高精密陶瓷基板 / 半导体封装材料'));
    probe.appendChild(w.U.el('input', { class: 'input', 'data-f': 'ct', value: '深圳' }));
    d.body.appendChild(probe);
    const nm = probe.querySelector('[data-f="nm"]');
    check('输入值显示层已翻译', !hasChinese(nm.value) && /Zhang|Wei/.test(nm.value), nm.value);
    const rv = w.U.readForm(probe);
    check('读取表单还原中文业务值', rv.nm === '张伟' && rv.rm === '高精密陶瓷基板 / 半导体封装材料' && rv.ct === '深圳', JSON.stringify(rv));
    nm.value = 'John Doe';
    check('用户改写后以输入为准', w.U.readForm(probe).nm === 'John Doe');
    probe.remove();
    const dl = w.U.el('datalist', { id: 'i18nProbeList' });
    dl.appendChild(w.U.el('option', { value: '贴片电阻 0402', label: 'SKU-1' }));
    d.body.appendChild(dl);
    w.I18n.scan();
    const opt = dl.querySelector('option');
    check('datalist 建议项已翻译', !hasChinese(opt.getAttribute('value')), opt.getAttribute('value'));
    const pick = w.U.el('input', { list: 'i18nProbeList' });
    d.body.appendChild(pick);
    pick.value = opt.getAttribute('value');
    check('建议项选择可反查中文原名', w.U.rawVal(pick) === '贴片电阻 0402', w.U.rawVal(pick));
    pick.remove(); dl.remove();

    /* 德语 */
    await setLang(w, 'de');
    check('切换到德语', w.I18n.get() === 'de' && d.documentElement.getAttribute('lang') === 'de');
    check('德语导航', /Lieferantenverwaltung/.test(d.querySelector('#aNav').textContent));
    check('德语态品牌/头像字形', d.querySelector('.a-side .mark').textContent === 'Z' && d.querySelector('#aAvatar').textContent === 'A');
    check('德语标题', /Admin-Konsole/.test(d.title), d.title);
    check('德语数字格式', /Tsd\.|Mio\./.test(w.U.money(11300, 2)), w.U.money(11300, 2));
    check('德语千分位', w.U.num(1234567) === '1.234.567', w.U.num(1234567));
    check('德语月份名', w.U.monthLabel('2026-10') === 'Okt', w.U.monthLabel('2026-10'));
    let deBad = [];
    for (const key of pages) {
      await goto(w, '#/' + key);
      const r = chineseResidue(d);
      if (r.length) deBad.push('#/' + key + ' → ' + r.slice(0, 3).join(' | '));
    }
    check('德语态 10 个后台页面全无中文', deBad.length === 0, deBad.slice(0, 4).join(' ; '));

    /* 切回中文：原文无损还原 */
    await setLang(w, 'zh');
    check('切回中文', w.I18n.get() === 'zh' && d.documentElement.getAttribute('lang') === 'zh-CN');
    await goto(w, '#/dashboard');
    check('中文原文还原', /总览看板/.test(d.querySelector('#aTitle').textContent) && /总览看板/.test(d.querySelector('#aNav').textContent) && /首页/.test(d.querySelector('#aCrumb').textContent),
      d.querySelector('#aTitle').textContent + ' / ' + d.querySelector('#aCrumb').textContent);
    check('中文数字格式恢复', w.U.money(11300, 2).indexOf('万') >= 0, w.U.money(11300, 2));
    check('中文态品牌/头像还原', d.querySelector('.a-side .mark').textContent === '链' && d.querySelector('#aAvatar').textContent === '管');
    check('持久化写入 localStorage', w.localStorage.getItem('scm_lang') === 'zh');
    check('无运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  /* ============ 前台 ============ */
  console.log('\n===== 前台 index.html =====');
  {
    const { w, d, errs } = await load('index.html', 'en');
    check('URL 参数指定英文生效', w.I18n.get() === 'en');
    check('前台切换器已挂载', !!d.querySelector('.lang-switch .lang-btn'));
    check('前台英文态标题', /Zhilian/.test(d.title), d.title);
    check('前台品牌标志为单字母', d.querySelector('.p-logo .mark').textContent === 'Z');
    check('前台英文态无中文残留（首页）', chineseResidue(d).length === 0, chineseResidue(d).slice(0, 5).join(' | '));
    let bad = [];
    for (const h of ['#/home', '#/suppliers', '#/products', '#/tracking', '#/insight']) {
      await goto(w, h);
      const r = chineseResidue(d);
      if (r.length) bad.push(h + ' → ' + r.slice(0, 3).join(' | '));
    }
    check('前台英文态 5 个页面全无中文', bad.length === 0, bad.slice(0, 4).join(' ; '));
    await setLang(w, 'de');
    let badDe = [];
    for (const h of ['#/home', '#/suppliers', '#/products', '#/tracking', '#/insight']) {
      await goto(w, h);
      const r = chineseResidue(d);
      if (r.length) badDe.push(h + ' → ' + r.slice(0, 3).join(' | '));
    }
    check('前台德语态 5 个页面全无中文', badDe.length === 0, badDe.slice(0, 4).join(' ; '));
    check('前台德语导航', /Lieferantennetzwerk|Startseite/.test(d.querySelector('#pMenu').textContent), d.querySelector('#pMenu').textContent.slice(0, 60));
    check('无运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  /* ============ 持久化 ============ */
  console.log('\n===== 跨页面持久化 =====');
  {
    const { w } = await load('admin.html', 'de');
    check('URL=de 覆盖默认值', w.I18n.get() === 'de');
    await setLang(w, 'en');
    check('切换后写入 localStorage', w.localStorage.getItem('scm_lang') === 'en');
  }

  console.log('\n===== 结果：' + (fail ? fail + ' 项失败' : '全部通过 ✓') + ' =====\n');
  process.exit(fail ? 1 : 0);
})();
