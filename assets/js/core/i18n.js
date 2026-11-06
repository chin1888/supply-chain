/* ============================================================
   SCM · 多语言引擎 (window.I18n)  中文 / English / Deutsch
   ------------------------------------------------------------
   设计要点：
   1. 只改「显示层」：文本节点 / placeholder / title / aria-label / alt。
      表单 value、data-* 与业务比较值始终保持中文，不破坏任何逻辑。
   2. MutationObserver 覆盖路由切换、弹窗、抽屉、Toast、SVG 图表等动态内容。
   3. 原文存于 WeakMap，切回中文或切换语种时可无损还原。
   4. 数字与日期格式随语言切换（K/M、Mio./Mrd.、千分位、月份名）。
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;
  var doc = global.document;

  /* ---------------- 词典合并：界面词条优先于自动生成的数据词条 ---------------- */
  var DICT = {}, k;
  var DATA = global.I18N_DATA || {}, UI = global.I18N_DICT || {};
  for (k in DATA) if (DATA.hasOwnProperty(k)) DICT[k] = DATA[k];
  for (k in UI) if (UI.hasOwnProperty(k)) DICT[k] = UI[k];

  var LANGS = [
    { key: 'zh', label: '中文', short: '中', html: 'zh-CN' },
    { key: 'en', label: 'English', short: 'EN', html: 'en' },
    { key: 'de', label: 'Deutsch', short: 'DE', html: 'de' }
  ];
  var STORE_KEY = 'scm_lang';
  var IDX = { zh: -1, en: 0, de: 1 };

  /* ---------------- 语言状态 ---------------- */
  function readStore() {
    try { return global.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function writeStore(v) {
    try { global.localStorage.setItem(STORE_KEY, v); } catch (e) { /* file:// 下忽略 */ }
  }
  function urlLang() {
    try {
      var m = /(?:^|[?&])lang=(zh|en|de)(?:&|$)/.exec(global.location.search || '');
      return m && m[1];
    } catch (e) { return null; }
  }
  function valid(v) { return v === 'en' || v === 'de' || v === 'zh' ? v : 'zh'; }
  var cur = valid(urlLang() || readStore() || 'zh');
  if (!readStore()) writeStore(cur);

  var hooks = [], missing = {}, resyncFieldsFn = null;
  var hasWM = typeof global.WeakMap === 'function';
  var origText = hasWM ? new global.WeakMap() : null;    // Text -> 原始中文
  var handledText = hasWM ? new global.WeakMap() : null; // Text -> 已处理的语言
  var origAttr = hasWM ? new global.WeakMap() : null;    // Element -> { attr: 原文 }
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  /* ---------------- 最长匹配索引 ---------------- */
  var keys = Object.keys(DICT).sort(function (a, b) { return b.length - a.length || a.localeCompare(b); });
  var maxLen = 1, byLen = {};
  keys.forEach(function (key) {
    var L = key.length;
    if (!/^[\u4e00-\u9fff]+$/.test(key)) return; // 组合切分只用纯中文键
    if (L > maxLen) maxLen = L;
    (byLen[L] = byLen[L] || {})[key] = DICT[key];
  });
  var lengths = Object.keys(byLen).map(Number).sort(function (a, b) { return b - a; });

  var CJK_SPLIT = /([\u4e00-\u9fff]+)/;
  var CJK_RE = /[\u4e00-\u9fff]/;
  var MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  };
  var PUNCT = {
    '，': ', ', '。': '. ', '、': ', ', '；': '; ', '：': ': ', '？': '? ', '！': '! ',
    '（': '(', '）': ')', '【': '[', '】': ']', '「': '"', '」': '"',
    '《': '"', '》': '"', '／': '/', '％': '%', '￥': '¥', '—': '—', '·': ' · '
  };

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function deNum(x) { return x.replace('.', ','); }

  /* 数字 + 中文单位：转换为目标语言的数值写法 */
  function localizeNumbers(s, lang) {
    var de = lang === 'de';
    s = s.replace(/(\d[\d,.]*)\s*万万/g, function (_, n) {
      var v = parseFloat(n.replace(/,/g, '')) * 100;
      return (de ? deNum(v.toFixed(2)) : v.toFixed(2)) + (de ? ' Mio.' : 'M');
    });
    s = s.replace(/(\d[\d,.]*)\s*亿元?/g, function (_, n) {
      var v = parseFloat(n.replace(/,/g, '')) * 100;
      return (de ? deNum(v.toFixed(2)) : v.toFixed(2)) + (de ? ' Mio.' : 'M');
    });
    s = s.replace(/(\d[\d,.]*)\s*万元?/g, function (_, n) {
      var v = parseFloat(n.replace(/,/g, ''));
      var big = v >= 100;
      var out = big ? (v / 100) : (v * 10);
      var txt = de ? deNum(out.toFixed(2)) : out.toFixed(2);
      return txt + (big ? (de ? ' Mio.' : 'M') : (de ? ' Tsd.' : 'K'));
    });
    s = s.replace(/(\d+)\s*个月/g, function (_, n) { return n + (de ? ' Monate' : ' months'); });
    s = s.replace(/(\d+)\s*月(?![份])/g, function (_, n) {
      var m = parseInt(n, 10);
      return (m >= 1 && m <= 12) ? MONTHS[lang][m - 1] : n;
    });
    s = s.replace(/(\d+)\s*天前/g, function (_, n) { return de ? 'vor ' + n + ' Tagen' : n + ' days ago'; });
    s = s.replace(/(\d+)\s*天后/g, function (_, n) { return de ? 'in ' + n + ' Tagen' : 'in ' + n + ' days'; });
    s = s.replace(/(\d+)\s*号/g, function (_, n) { return (de ? 'Nr. ' : 'No. ') + n; });
    return s;
  }

  /* 一个纯中文片段：最长匹配切分 → 拼接译文 */
  function segTranslate(seg, lang, keepMissing) {
    var i = 0, parts = [], hitAll = true, ix = IDX[lang];
    while (i < seg.length) {
      var found = null;
      for (var j = 0; j < lengths.length; j++) {
        var L = lengths[j];
        if (L > seg.length - i) continue;
        var cand = seg.substr(i, L);
        var val = byLen[L][cand];
        if (val) { found = { len: L, text: val[ix] || val[0] }; break; }
      }
      if (found) { parts.push(found.text); i += found.len; }
      else {
        hitAll = false;
        var ch = seg.charAt(i);
        if (keepMissing) missing[ch] = (missing[ch] || 0) + 1;
        var charMap = global.I18N_CHAR;
        parts.push(charMap && charMap[ch] ? charMap[ch] : ch);
        i++;
      }
    }
    return { text: parts.join(' ').replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, ''), hitAll: hitAll };
  }

  /* 对外翻译函数 */
  function t(s, lang) {
    lang = lang || cur;
    if (s == null) return s;
    var str = String(s);
    if (lang === 'zh' || !CJK_RE.test(str)) return str;
    var lead = /^\s*/.exec(str)[0], tail = /\s*$/.exec(str)[0];
    var body = str.trim();
    if (DICT[body] && DICT[body][IDX[lang]]) return lead + DICT[body][IDX[lang]] + tail;
    /* 先在中文原文上处理「数字 + 中文单位 / 语序」结构，避免单位被切碎后再拼接 */
    body = localizeNumbers(body, lang);
    body = body.replace(/第\s*(\d+)\s*\/\s*(\d+)\s*页/g, function (_, a, b) {
      return lang === 'de' ? 'Seite ' + a + ' von ' + b : 'Page ' + a + ' of ' + b;
    });
    var out = body.split(CJK_SPLIT).map(function (piece) {
      if (!piece) return '';
      if (/^[\u4e00-\u9fff]+$/.test(piece)) return segTranslate(piece, lang, true).text;
      var p = piece;
      Object.keys(PUNCT).forEach(function (c) { p = p.split(c).join(PUNCT[c]); });
      return p;
    }).join('');
    out = localizeNumbers(out, lang);
    /* 相邻英文词之间补空格（中文紧邻词素的情况） */
    out = out.replace(/([A-Za-z0-9\)])([A-Z][a-z])/g, '$1 $2').replace(/\s{2,}/g, ' ');
    return lead + out + tail;
  }

  /* ---------------- DOM 扫描 ---------------- */
  /* select 不跳过：option 文本需要翻译，而 value 属性不在翻译范围内，取值逻辑保持不变。
     仅跳过不可见的脚本 / 用户可编辑内容的文本节点。 */
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
  function skipped(el) {
    while (el && el.nodeType === 1) {
      if (SKIP_TAGS[el.tagName] || el.hasAttribute('data-i18n-skip') || el.isContentEditable) return true;
      el = el.parentNode;
    }
    return false;
  }
  function noTranslate(el) {
    while (el && el.nodeType === 1) {
      if (el.hasAttribute('data-i18n-skip')) return true;
      el = el.parentNode;
    }
    return false;
  }
  function handleText(node) {
    var val = node.nodeValue;
    /* 含中文 = 业务刚写入的新原文（或中文态），刷新原文缓存并强制重译 */
    if (CJK_RE.test(val)) {
      if (origText) origText.set(node, val);
      if (handledText) handledText.delete(node);
    }
    if (handledText && handledText.get(node) === cur) return;
    var src = origText ? (origText.get(node) == null ? val : origText.get(node)) : val;
    if (!CJK_RE.test(src)) { if (handledText) handledText.set(node, cur); return; }
    var next = (cur === 'zh') ? src : t(src, cur);
    if (next !== val) node.nodeValue = next;
    if (handledText) handledText.set(node, cur);
  }
  function handleAttrs(el) {
    if (!el.getAttribute) return;
    var map = origAttr ? (origAttr.get(el) || {}) : {};
    ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v == null) return;
      if (CJK_RE.test(v) || !(a in map)) map[a] = v; /* 含中文即为新原文 */
      var src = map[a];
      if (!CJK_RE.test(src)) return;
      var next = (cur === 'zh') ? src : t(src, cur);
      if (next !== v) el.setAttribute(a, next);
    });
    /* datalist 建议项只有 value 属性（没有文本节点），需要单独翻译显示值 */
    if (el.tagName === 'OPTION' && el.parentNode && el.parentNode.tagName === 'DATALIST') {
      var ov = el.getAttribute('value');
      if (ov != null) {
        if (CJK_RE.test(ov) || !('value' in map)) map.value = ov;
        var osrc = map.value;
        var onext = cur === 'zh' ? osrc : t(osrc, cur);
        el.setAttribute('data-i18n-raw', osrc);
        if (onext !== ov) el.setAttribute('value', onext);
      }
    }
    if (origAttr) origAttr.set(el, map);
  }
  var TITLE_ZH = doc.title;
  function syncTitle() {
    var next = cur === 'zh' ? TITLE_ZH : t(TITLE_ZH, cur);
    if (doc.title !== next) doc.title = next;
    doc.documentElement.setAttribute('lang', (LANGS.filter(function (l) { return l.key === cur; })[0] || LANGS[0]).html);
    var meta = doc.querySelector('meta[name=description]');
    if (meta && meta.content) {
      if (!meta.getAttribute('data-i18n-zh')) meta.setAttribute('data-i18n-zh', meta.content);
      meta.content = cur === 'zh' ? meta.getAttribute('data-i18n-zh') : t(meta.getAttribute('data-i18n-zh'), cur);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentNode)) handleText(root); return; }
    if (root.nodeType !== 1) return;
    if (!noTranslate(root)) handleAttrs(root);
    var tw = doc.createTreeWalker(root, 5 /* TEXT | ELEMENT */, null, false);
    var n = tw.nextNode();
    while (n) {
      if (n.nodeType === 3) { if (!skipped(n.parentNode)) handleText(n); }
      else if (!noTranslate(n)) handleAttrs(n);
      n = tw.nextNode();
    }
  }
  function scanAll() {
    suppress = true;
    try {
      syncTitle();
      walk(doc.body);
      syncSwitch();
      syncGlyphs();
    } finally { suppress = false; }
  }

  /* ---------------- 动态内容监听 ---------------- */
  var suppress = false;
  function onMutate(muts) {
    if (suppress) return;
    var targets = [];
    muts.forEach(function (m) {
      if (m.type === 'childList') {
        Array.prototype.forEach.call(m.addedNodes, function (n) { targets.push(n); });
      } else if (m.type === 'characterData') targets.push(m.target);
      else if (m.type === 'attributes') targets.push(m.target);
    });
    if (!targets.length) return;
    suppress = true;
    try { targets.forEach(walk); } finally { suppress = false; }
  }
  if (global.MutationObserver) {
    var mo = new global.MutationObserver(onMutate);
    mo.observe(doc.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.concat(['lang'])
    });
  }

  /* ---------------- 数字 / 日期格式本地化 ---------------- */
  if (U) {
    var _num = U.num, _money = U.money, _monthLabel = U.monthLabel;
    U.num = function (v, d) {
      if (cur === 'zh' || v == null || isNaN(v)) return _num.call(U, v, d);
      return Number(v).toLocaleString(cur === 'de' ? 'de-DE' : 'en-US', {
        minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 0 : d
      });
    };
    U.money = function (v, d) {
      if (cur === 'zh' || v == null || isNaN(v)) return _money.call(U, v, d);
      d = d == null ? 2 : d;
      var n = Number(v), sign = n < 0 ? '-' : '';
      n = Math.abs(n);
      var f = function (x) { return cur === 'de' ? deNum(x.toFixed(d)) : x.toFixed(d); };
      if (n >= 1e9) return sign + f(n / 1e9) + (cur === 'de' ? ' Mrd.' : 'B');
      if (n >= 1e6) return sign + f(n / 1e6) + (cur === 'de' ? ' Mio.' : 'M');
      if (n >= 1e3) return sign + f(n / 1e3) + (cur === 'de' ? ' Tsd.' : 'K');
      return sign + f(n);
    };
    U.monthLabel = function (mk) {
      if (cur === 'zh') return _monthLabel.call(U, mk);
      var m = parseInt(String(mk).split('-')[1], 10);
      return (m >= 1 && m <= 12) ? MONTHS[cur][m - 1] : _monthLabel.call(U, mk);
    };

    /* ---- 表单输入框的「显示值」本地化 ----
       input.value 同时承担显示与业务取值，因此：
       · 渲染时把中文原值记在 data-i18n-raw，显示值替换为译文；
       · 读取表单时若用户未改动则回传中文原值，用户改过则以输入为准。 */
    function trackable(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false;
      var type = String(el.type || '').toLowerCase();
      var skipType = { checkbox: 1, radio: 1, file: 1, hidden: 1, date: 1, datetime: 1,
        'datetime-local': 1, number: 1, password: 1, color: 1, range: 1, submit: 1, button: 1, reset: 1 };
      return !skipType[type] && !el.hasAttribute('data-i18n-skip');
    }
    function rawOf(el) {
      if (!el || !el.hasAttribute || !el.hasAttribute('data-i18n-raw')) return null;
      return el.value === el.getAttribute('data-i18n-shown')
        ? el.getAttribute('data-i18n-raw') : null;
    }
    U.rawVal = function (el) {
      if (!el) return '';
      var r = rawOf(el);
      if (r != null) return r;
      /* 从 datalist 建议里选中的名称：按译文反查中文原值 */
      var listId = el.getAttribute && el.getAttribute('list');
      if (listId && cur !== 'zh') {
        var dl = doc.getElementById(listId);
        if (dl) {
          var opts = dl.querySelectorAll('option[data-i18n-raw]');
          for (var i = 0; i < opts.length; i++) {
            if (opts[i].getAttribute('value') === el.value) return opts[i].getAttribute('data-i18n-raw');
          }
        }
      }
      return el.value;
    };
    U.setVal = function (el, value) {
      if (!el) return;
      var raw = value == null ? '' : String(value);
      if (!trackable(el) || !CJK_RE.test(raw)) {
        el.removeAttribute('data-i18n-raw'); el.removeAttribute('data-i18n-shown');
        el.value = raw; return;
      }
      var shown = cur === 'zh' ? raw : t(raw, cur);
      el.setAttribute('data-i18n-raw', raw);
      el.setAttribute('data-i18n-shown', shown);
      el.value = shown;
    };
    function localizeField(el) {
      if (!trackable(el) || el.hasAttribute('data-i18n-raw')) return;
      U.setVal(el, el.value || '');
    }
    var _el = U.el;
    U.el = function () {
      var node = _el.apply(U, arguments);
      try { localizeField(node); } catch (e) { /* 单个控件失败不影响渲染 */ }
      return node;
    };
    var _readForm = U.readForm;
    U.readForm = function (root) {
      var out = _readForm.call(U, root);
      U.$$('[data-f]', root).forEach(function (n) {
        if (n.type === 'checkbox') return;
        var r = rawOf(n);
        if (r != null) out[n.dataset.f] = r.trim();
      });
      return out;
    };
    /* 切换语言时同步已打开表单里的显示值 */
    function resyncFields() {
      U.$$('[data-i18n-raw]').forEach(function (el) {
        if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
        if (!el.isConnected) return;
        var raw = el.getAttribute('data-i18n-raw');
        var shown = el.getAttribute('data-i18n-shown');
        if (el.value !== shown) { /* 用户已手动改写：不再跟踪 */ 
          el.removeAttribute('data-i18n-raw'); el.removeAttribute('data-i18n-shown'); return;
        }
        var next = cur === 'zh' ? raw : t(raw, cur);
        el.value = next;
        el.setAttribute('data-i18n-shown', next);
      });
    }
    resyncFieldsFn = resyncFields;
  }

  /* ---------------- 语言切换控件 ---------------- */
  function buildSwitch(host) {
    if (!host || host.querySelector('.lang-switch')) return;
    var box = U.el('div', { class: 'lang-switch', 'data-i18n-skip': '1', title: 'Language / Sprache / 语言' });
    LANGS.forEach(function (l) {
      box.appendChild(U.el('button', {
        type: 'button', class: 'lang-btn' + (l.key === cur ? ' on' : ''),
        'data-lang': l.key, 'data-i18n-skip': '1',
        title: l.label, text: l.short,
        onclick: function () { setLang(l.key); }
      }));
    });
    host.insertBefore(box, host.firstChild);
  }
  function syncSwitch() {
    U.$$('.lang-switch .lang-btn').forEach(function (b) {
      b.className = 'lang-btn' + (b.getAttribute('data-lang') === cur ? ' on' : '');
    });
  }

  /* 品牌标志 / 用户头像：固定方形或圆形容纳不下完整译文，
     用单字母字形按语言替换（元素带 data-i18n-skip，避免被通用翻译覆盖）。 */
  var GLYPHS = {
    mark: { zh: '链', en: 'Z', de: 'Z' },
    avatar: { zh: '管', en: 'A', de: 'A' }
  };
  function syncGlyphs() {
    Object.keys(GLYPHS).forEach(function (name) {
      var val = GLYPHS[name][cur];
      U.$$('[data-i18n-glyph="' + name + '"]').forEach(function (el) {
        if (el.textContent !== val) el.textContent = val;
      });
    });
  }
  function mountSwitch() {
    buildSwitch(U.$('.p-nav .right') || U.$('.a-top .right'));
    syncSwitch();
  }

  /* ---------------- 对外 API ---------------- */
  function setLang(lang) {
    lang = valid(lang);
    writeStore(lang);
    var changed = lang !== cur;
    cur = lang;
    if (changed && resyncFieldsFn) resyncFieldsFn();
    if (changed) {
      /* 先让业务层用新语言重渲染（数字/日期格式随之更新），再全量翻译静态与动态节点 */
      hooks.forEach(function (fn) { try { fn(lang); } catch (e) { /* 单个订阅失败不影响切换 */ } });
    }
    scanAll();
    try { global.dispatchEvent(new global.CustomEvent('scm:langchange', { detail: { lang: lang } })); } catch (e) { }
    return lang;
  }
  var API = {
    t: t,
    get: function () { return cur; },
    set: setLang,
    langs: LANGS,
    dict: DICT,
    glyph: function (name) { return (GLYPHS[name] || {})[cur] || ''; },
    missing: missing,
    onChange: function (fn) { if (typeof fn === 'function') hooks.push(fn); },
    scan: scanAll,
    mount: mountSwitch,
    /** 供业务层包装纯字符串场景（confirm / alert / 文件名） */
    translate: function (s) { return t(s, cur); }
  };
  global.I18n = API;

  /* alert / confirm 消息本地化 */
  ['alert', 'confirm'].forEach(function (name) {
    var orig = global[name];
    if (typeof orig !== 'function') return;
    global[name] = function (msg) { return orig.call(global, cur === 'zh' ? msg : t(msg, cur)); };
  });

  /* ---------------- 启动 ---------------- */
  function boot() {
    mountSwitch();
    scanAll();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
