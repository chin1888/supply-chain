/* ============================================================
   SCM · 核心工具库  (window.U)
   零依赖：DOM / 格式化 / 日期 / 随机 / 事件
   ============================================================ */
(function (global) {
  'use strict';

  var U = {};

  /* ---------------- DOM ---------------- */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.el = function (tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') { for (var s in v) n.style[s] = v[s]; }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') { for (var d in v) n.dataset[d] = v[d]; }
      else n.setAttribute(k, v === true ? '' : v);
    }
    if (children != null) {
      var arr = Array.isArray(children) ? children : [children];
      arr.forEach(function (c) {
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return n;
  };
  U.esc = function (s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.on = function (root, evt, sel, fn) {
    (root || document).addEventListener(evt, function (e) {
      var t = e.target.closest(sel);
      if (t && root.contains(t)) fn.call(t, e, t);
    });
  };

  /* ---------------- 数字格式化 ---------------- */
  U.num = function (v, d) {
    if (v == null || isNaN(v)) return '-';
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 0 : d });
  };
  /** 大额金额：万 / 亿 */
  U.money = function (v, d) {
    if (v == null || isNaN(v)) return '-';
    d = d == null ? 2 : d;
    var n = Number(v), sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n >= 1e8) return sign + (n / 1e8).toFixed(d) + '亿';
    if (n >= 1e4) return sign + (n / 1e4).toFixed(d) + '万';
    return sign + n.toFixed(d);
  };
  U.moneyY = function (v, d) { var s = U.money(v, d); return s === '-' ? '-' : '¥' + s; };
  /* KPI 金额：数据单位为「万元」。中文沿用原写法；英/德换算成完整金额，避免出现「1.43K 10K CNY」双重单位 */
  U.moneyWan = function (v) {
    var lang = (window.I18n && window.I18n.get) ? window.I18n.get() : 'zh';
    if (lang === 'zh') return { value: U.money(v), unit: ' 万元' };
    return { value: U.money(Number(v) * 10000), unit: ' CNY' };
  };
  /* 图表提示 / 表格单元格里「数值（万）」的本地化：英德直接换算成完整金额 */
  U.wanText = function (v) {
    var lang = (window.I18n && window.I18n.get) ? window.I18n.get() : 'zh';
    if (lang === 'zh') return U.num(v) + ' 万';
    return U.money(Number(v) * 10000) + ' CNY';
  };
  U.pct = function (v, d) { if (v == null || isNaN(v)) return '-'; return Number(v).toFixed(d == null ? 1 : d) + '%'; };
  U.round = function (v, d) { var p = Math.pow(10, d || 0); return Math.round(Number(v) * p) / p; };

  /* ---------------- 日期 ---------------- */
  U.pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  U.fmtDate = function (d, withTime) {
    if (!d) return '-';
    var t = d instanceof Date ? d : new Date(d);
    if (isNaN(t.getTime())) return '-';
    var s = t.getFullYear() + '-' + U.pad(t.getMonth() + 1) + '-' + U.pad(t.getDate());
    return withTime ? s + ' ' + U.pad(t.getHours()) + ':' + U.pad(t.getMinutes()) : s;
  };
  U.today = function () { return U.fmtDate(new Date()); };
  U.nowStr = function () { return U.fmtDate(new Date(), true); };
  U.addDays = function (base, n) {
    var t = base ? new Date(base) : new Date();
    t.setDate(t.getDate() + n);
    return U.fmtDate(t);
  };
  U.diffDays = function (a, b) {
    var x = new Date(a), y = new Date(b || new Date());
    return Math.round((y - x) / 86400000);
  };
  U.monthKey = function (d) { var t = new Date(d); return t.getFullYear() + '-' + U.pad(t.getMonth() + 1); };
  /** 最近 n 个月的 ['2026-01', ...] */
  U.lastMonths = function (n, end) {
    var out = [], base = end ? new Date(end + '-01') : new Date();
    for (var i = n - 1; i >= 0; i--) {
      var t = new Date(base.getFullYear(), base.getMonth() - i, 1);
      out.push(t.getFullYear() + '-' + U.pad(t.getMonth() + 1));
    }
    return out;
  };
  U.monthLabel = function (k) { var p = String(k).split('-'); return parseInt(p[1], 10) + '月'; };
  U.relTime = function (d) {
    var diff = U.diffDays(d);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff < 0) return Math.abs(diff) + '天后';
    if (diff < 30) return diff + '天前';
    return U.fmtDate(d);
  };

  /* ---------------- 随机（带种子，保证数据稳定） ---------------- */
  U.rng = function (seed) {
    var s = seed || 1;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  };
  U.pick = function (arr, r) { return arr[Math.floor((r ? r() : Math.random()) * arr.length)]; };
  U.randInt = function (min, max, r) { return Math.floor((r ? r() : Math.random()) * (max - min + 1)) + min; };
  U.rand = function (min, max, r) { return (r ? r() : Math.random()) * (max - min) + min; };

  /* ---------------- 数组 / 对象 ---------------- */
  U.groupBy = function (arr, keyFn) {
    var m = {};
    arr.forEach(function (x) { var k = keyFn(x); (m[k] = m[k] || []).push(x); });
    return m;
  };
  U.sum = function (arr, f) {
    return arr.reduce(function (a, x) { return a + (f ? (f(x) || 0) : (x || 0)); }, 0);
  };
  U.avg = function (arr, f) { return arr.length ? U.sum(arr, f) / arr.length : 0; };
  U.sortBy = function (arr, f, dir) {
    var d = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (a, b) {
      var x = f(a), y = f(b);
      if (x == null) return 1; if (y == null) return -1;
      if (typeof x === 'string') return d * x.localeCompare(y, 'zh-CN');
      return d * (x - y);
    });
  };
  U.uid = function (prefix) {
    return (prefix || 'ID') + '-' + Date.now().toString(36).slice(-5).toUpperCase() + Math.floor(Math.random() * 900 + 100);
  };
  U.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 220);
    };
  };

  /* ---------------- 交互：Toast / Modal / Confirm ---------------- */
  U.toast = function (msg, type) {
    var box = U.$('.toast-box');
    if (!box) { box = U.el('div', { class: 'toast-box' }); document.body.appendChild(box); }
    var t = U.el('div', { class: 'toast ' + (type || '') }, [
      U.el('span', { text: ({ ok: '✓', err: '✕', warn: '!' })[type] || '•' }),
      U.el('span', { text: msg })
    ]);
    box.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0'; t.style.transform = 'translateY(-8px)';
      setTimeout(function () { t.remove(); }, 260);
    }, 2200);
  };

  U.modal = function (opts) {
    var o = opts || {};
    var body = U.el('div', { class: 'modal-body' });
    if (typeof o.body === 'string') body.innerHTML = o.body;
    else if (o.body) body.appendChild(o.body);
    var mask = U.el('div', { class: 'modal-mask' });
    var box = U.el('div', { class: 'modal ' + (o.xwide ? 'xwide' : (o.wide ? 'wide' : '')) }, [
      U.el('div', { class: 'modal-head' }, [
        U.el('h3', { text: o.title || '' }),
        U.el('button', { class: 'modal-close', html: '&times;', onclick: function () { close(); } })
      ]),
      body,
      U.el('div', { class: 'modal-foot' }, [
        U.el('button', { class: 'btn', text: o.cancelText || '取消', onclick: function () { close(); } }),
        o.hideOk ? null : U.el('button', {
          class: 'btn ' + (o.okClass || 'primary'), text: o.okText || '保存', onclick: function () {
            if (!o.onOk || o.onOk(body) !== false) close();
          }
        })
      ])
    ]);
    mask.appendChild(box);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    function close() { mask.remove(); if (o.onClose) o.onClose(); }
    document.body.appendChild(mask);
    var first = box.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 60);
    return { close: close, body: body, root: box };
  };

  U.confirm = function (msg, onOk, title) {
    U.modal({
      title: title || '确认操作',
      body: U.el('div', { class: 't-md', text: msg }),
      okText: '确定',
      onOk: function () { onOk && onOk(); }
    });
  };

  /* ---------------- 表单读取 ---------------- */
  /** 读取容器内所有 [data-f] 的值 */
  U.readForm = function (root) {
    var out = {};
    U.$$('[data-f]', root).forEach(function (n) {
      var k = n.dataset.f;
      out[k] = n.type === 'checkbox' ? n.checked : n.value.trim();
    });
    return out;
  };
  /** 生成一个带标签的字段 */
  U.field = function (label, control, cls) {
    return U.el('div', { class: 'field ' + (cls || '') }, [
      label ? U.el('label', { text: label }) : null, control
    ]);
  };
  U.input = function (name, value, ph) {
    return U.el('input', { class: 'input', 'data-f': name, value: value == null ? '' : value, placeholder: ph || '' });
  };
  U.select = function (name, options, value) {
    var s = U.el('select', { class: 'select', 'data-f': name });
    (options || []).forEach(function (o) {
      var v, t;
      if (Array.isArray(o)) { v = o[0]; t = o[1]; }
      else if (o && typeof o === 'object') { v = o.v; t = o.t; }
      else { v = o; t = o; } // 兼容 ['选项A','选项B'] 纯字符串数组
      s.appendChild(U.el('option', { value: v, text: t, selected: String(v) === String(value) ? true : null }));
    });
    return s;
  };
  U.textarea = function (name, value) {
    return U.el('textarea', { class: 'textarea', 'data-f': name, text: value || '' });
  };

  /* ---------------- 分页 ---------------- */
  U.paginate = function (list, page, size) {
    var total = list.length, pages = Math.max(1, Math.ceil(total / size));
    var p = Math.min(Math.max(1, page), pages);
    return { rows: list.slice((p - 1) * size, p * size), page: p, pages: pages, total: total };
  };
  /** 渲染分页器 */
  U.pager = function (res, onChange) {
    var wrap = U.el('div', { class: 'pager' });
    wrap.appendChild(U.el('div', { class: 't-sm muted', text: '共 ' + res.total + ' 条 / ' + res.pages + ' 页' }));
    var pages = U.el('div', { class: 'pages' });
    var nums = U.pageNumbers(res.page, res.pages);
    nums.forEach(function (n) {
      if (n === '...') { pages.appendChild(U.el('button', { text: '…', disabled: true })); return; }
      pages.appendChild(U.el('button', {
        class: n === res.page ? 'on' : '', text: n,
        onclick: function () { onChange(n); }
      }));
    });
    wrap.appendChild(pages);
    return wrap;
  };
  U.pageNumbers = function (cur, total) {
    if (total <= 7) { var a = []; for (var i = 1; i <= total; i++) a.push(i); return a; }
    var out = [1];
    var s = Math.max(2, cur - 1), e = Math.min(total - 1, cur + 1);
    if (s > 2) out.push('...');
    for (var j = s; j <= e; j++) out.push(j);
    if (e < total - 1) out.push('...');
    out.push(total);
    return out;
  };

  /* ---------------- SVG 辅助 ---------------- */
  U.svg = function (w, h, children, attrs) {
    var a = { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'xMidYMid meet' };
    for (var k in (attrs || {})) a[k] = attrs[k];
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (var k2 in a) s.setAttribute(k2, a[k2]);
    (children || []).forEach(function (c) { if (c) s.appendChild(c); });
    return s;
  };
  U.s = function (tag, attrs, children) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'onclick' && typeof v === 'function') n.addEventListener('click', v);
      else n.setAttribute(k, v);
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  };

  /* ---------------- 图片 ---------------- */
  /**
   * 压缩图片文件为 dataURL（本地无后端存储用）
   * @param {File} file 图片文件
   * @param {number} maxW 最大宽度，等比缩放
   * @param {number} quality JPEG 质量 0-1
   */
  U.compressImage = function (file, maxW, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('请选择图片文件')); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, (maxW || 800) / img.width);
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/jpeg', quality || 0.72));
        };
        img.onerror = function () { reject(new Error('图片解析失败')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('文件读取失败')); };
      reader.readAsDataURL(file);
    });
  };
  /** 图片缩略图节点 */
  U.thumb = function (src, size, onClick) {
    var img = U.el('img', {
      src: src, style: {
        width: size + 'px', height: size + 'px', objectFit: 'cover',
        borderRadius: '8px', border: '1px solid var(--border)', cursor: onClick ? 'zoom-in' : 'default', display: 'block'
      }
    });
    if (onClick) img.addEventListener('click', onClick);
    return img;
  };
  /** 简易图片查看器（大图弹窗） */
  U.lightbox = function (images, startIdx) {
    if (!images || !images.length) return;
    var idx = startIdx || 0;
    var body = U.el('div', { class: 'tc' });
    var imgNode = U.el('img', {
      src: images[idx], style: { maxWidth: '100%', maxHeight: '60vh', borderRadius: '10px', objectFit: 'contain' }
    });
    var counter = U.el('div', { class: 't-sm muted mt8', text: '' });
    function show(i) {
      idx = (i + images.length) % images.length;
      imgNode.src = images[idx];
      counter.textContent = (idx + 1) + ' / ' + images.length;
    }
    show(idx);
    var m = U.modal({
      title: '图片预览',
      body: U.el('div', { class: 'col gap8', style: { alignItems: 'center' } }, [
        U.el('div', { class: 'row gap8', style: { alignItems: 'center', justifyContent: 'center' } }, [
          images.length > 1 ? U.el('button', { class: 'btn', text: '‹', onclick: function () { show(idx - 1); } }) : null,
          imgNode,
          images.length > 1 ? U.el('button', { class: 'btn', text: '›', onclick: function () { show(idx + 1); } }) : null
        ]),
        counter
      ]),
      hideOk: true, cancelText: '关闭', wide: true,
      onClose: function () { }
    });
    return m;
  };

  global.U = U;
})(window);
