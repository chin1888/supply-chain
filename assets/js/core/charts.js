/* ============================================================
   SCM · 零依赖 SVG 图表库  (window.Chart)
   折线/面积 · 柱状(分组/堆叠/横向) · 环形 · 漏斗 · 雷达 · 热力 · 仪表 · 迷你线
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, S = U.s, svg = U.svg;

  var PALETTE = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#84cc16', '#f97316', '#06b6d4'];

  function color(i, c) { return c || PALETTE[i % PALETTE.length]; }
  /* 图表标签在渲染时直接本地化，便于根据译文长度计算内边距（避免德文长词被裁切） */
  function tr(s) {
    if (s == null) return '';
    return (global.I18n && global.I18n.t) ? global.I18n.t(String(s)) : String(s);
  }

  /** 创建带 tooltip 的图表容器 */
  function wrap(svgNode, height) {
    var box = U.el('div', { class: 'chart', style: { position: 'relative' } });
    box.appendChild(svgNode);
    var tip = U.el('div', { class: 'chart-tip', style: { opacity: '0', left: '0px', top: '0px' } });
    box.appendChild(tip);
    box._tip = tip;
    return box;
  }
  function bindTip(box, node, html, offsetY) {
    node.style.cursor = 'default';
    node.addEventListener('mousemove', function (e) {
      var r = box.getBoundingClientRect();
      var tip = box._tip;
      tip.innerHTML = html;
      tip.style.opacity = '1';
      tip.style.left = (e.clientX - r.left) + 'px';
      tip.style.top = ((offsetY != null ? offsetY : e.clientY - r.top) - 8) + 'px';
    });
    node.addEventListener('mouseleave', function () { box._tip.style.opacity = '0'; });
  }
  function niceMax(v) {
    if (v <= 0) return 10;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function ticks(max, count) {
    count = count || 4;
    var out = [];
    for (var i = 0; i <= count; i++) out.push(U.round(max * i / count, 2));
    return out;
  }
  /** 平滑曲线 path（Catmull-Rom → 贝塞尔） */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }
  function linePath(pts) {
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ',' + p[1]; }).join(' ');
  }

  var Chart = {};

  /* ================= 折线 / 面积图 ================= */
  Chart.line = function (o) {
    o = o || {};
    var W = o.width || 720, H = o.height || 260;
    var pad = o.pad || { t: 16, r: 18, b: 30, l: 48 };
    var labels = o.labels || [], series = o.series || [];
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var all = [];
    series.forEach(function (s) { all = all.concat(s.values || []); });
    var rawMax = Math.max.apply(null, all.concat([0]));
    var rawMin = Math.min.apply(null, all.concat([0]));
    var max = o.max != null ? o.max : niceMax(rawMax * 1.08);
    var min = o.min != null ? o.min : (rawMin < 0 ? -niceMax(Math.abs(rawMin) * 1.1) : 0);
    var stepX = labels.length > 1 ? iw / (labels.length - 1) : iw / 2;
    var Y = function (v) { return pad.t + ih - (v - min) / (max - min || 1) * ih; };
    var X = function (i) { return pad.l + (labels.length > 1 ? i * stepX : iw / 2); };
    var fmt = o.yFmt || function (v) { return U.num(v); };

    var nodes = [];
    // 网格 + Y 轴
    ticks(max, o.ticks || 4).forEach(function (t) {
      var y = Y(t);
      nodes.push(S('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, class: 'grid-line', 'stroke-dasharray': t === 0 ? '' : '3 3' }));
      nodes.push(S('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-txt', text: fmt(t) }));
    });
    // X 轴标签
    var everyN = Math.ceil(labels.length / (o.maxLabels || 12));
    labels.forEach(function (l, i) {
      if (i % everyN !== 0 && i !== labels.length - 1) return;
      nodes.push(S('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', class: 'axis-txt', text: l }));
    });

    // 系列
    series.forEach(function (s, si) {
      var vals = s.values || [];
      var pts = vals.map(function (v, i) { return [X(i), Y(v)]; });
      var c = color(si, s.color);
      if (o.area !== false && series.length <= 2) {
        var area = (o.smooth === false ? linePath(pts) : smoothPath(pts)) +
          ' L' + pts[pts.length - 1][0] + ',' + Y(min) + ' L' + pts[0][0] + ',' + Y(min) + ' Z';
        var gid = 'g' + si + '_' + Math.random().toString(36).slice(2, 7);
        nodes.push(S('defs', null, [
          S('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' }, [
            S('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': s.fillOpacity || .22 }),
            S('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': '0' })
          ])
        ]));
        nodes.push(S('path', { d: area, fill: 'url(#' + gid + ')' }));
      }
      nodes.push(S('path', {
        d: o.smooth === false ? linePath(pts) : smoothPath(pts),
        fill: 'none', stroke: c, 'stroke-width': s.width || 2.2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'stroke-dasharray': s.dash || null
      }));
      if (o.dots !== false) {
        pts.forEach(function (p, i) {
          nodes.push(S('circle', { cx: p[0], cy: p[1], r: 2.6, fill: '#fff', stroke: c, 'stroke-width': 1.8 }));
        });
      }
    });

    var sNode = svg(W, H, nodes);
    var box = wrap(sNode, H);

    // hover 竖线
    if (o.hover !== false) {
      var hl = S('line', { y1: pad.t, y2: pad.t + ih, stroke: '#94a3b8', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
      sNode.appendChild(hl);
      var hit = S('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' });
      sNode.appendChild(hit);
      hit.addEventListener('mousemove', function (e) {
        var r = sNode.getBoundingClientRect();
        var mx = (e.clientX - r.left) / r.width * W;
        var idx = Math.round((mx - pad.l) / (stepX || 1));
        idx = Math.max(0, Math.min(labels.length - 1, idx));
        hl.setAttribute('x1', X(idx)); hl.setAttribute('x2', X(idx)); hl.setAttribute('opacity', 1);
        var html = '<b>' + labels[idx] + '</b>';
        series.forEach(function (s, si) {
          var v = (s.values || [])[idx];
          if (v == null) return;
          html += '<br><span style="color:' + color(si, s.color) + '">■</span> ' + (s.name || '') + ' ' + (o.tipFmt ? o.tipFmt(v) : fmt(v));
        });
        var tip = box._tip;
        tip.innerHTML = html;
        tip.style.opacity = '1';
        tip.style.left = (X(idx) / W * sNode.getBoundingClientRect().width) + 'px';
        tip.style.top = (pad.t + 10) + 'px';
      });
      hit.addEventListener('mouseleave', function () {
        hl.setAttribute('opacity', 0); box._tip.style.opacity = '0';
      });
    }

    if (o.legend !== false) {
      var lg = U.el('div', { class: 'chart-legend' });
      series.forEach(function (s, si) {
        lg.appendChild(U.el('div', { class: 'item' }, [
          U.el('i', { class: 'dot', style: { background: color(si, s.color) } }),
          U.el('span', { text: s.name })
        ]));
      });
      box.appendChild(lg);
    }
    return box;
  };

  /* ================= 柱状图 ================= */
  Chart.bar = function (o) {
    o = o || {};
    var labels = o.labels || [], series = o.series || [];
    var horizontal = !!o.horizontal;
    var W = o.width || 720, H = o.height || 260;
    var pad = o.pad || (horizontal ? { t: 10, r: 24, b: 22, l: 64 } : { t: 16, r: 18, b: 30, l: 48 });
    /* 横向条形的分类标签右对齐在 pad.l 处，译文变长时需要相应加宽左边距 */
    if (horizontal && !o.pad) {
      var longest = 0, hasCJK = false;
      labels.forEach(function (l) {
        var s = tr(l);
        longest = Math.max(longest, s.length);
        if (/[\u4e00-\u9fff]/.test(s)) hasCJK = true;
      });
      var need = longest * (hasCJK ? 11 : 6.6) + 14;
      pad.l = Math.max(64, Math.min(180, Math.round(need)));
    }
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var all = [];
    series.forEach(function (s) { all = all.concat(s.values || []); });
    var max = o.max != null ? o.max : niceMax(Math.max.apply(null, all.concat([0])) * 1.08);
    var fmt = o.yFmt || function (v) { return U.num(v); };
    var nodes = [];
    // 先收集，待容器创建后统一绑定 tooltip
    var pending = [];
    var tipFor = function (node, html) { pending.push({ node: node, html: html }); };

    if (horizontal) {
      var rowH = ih / Math.max(1, labels.length);
      var bh = Math.min(rowH * 0.62, (series.length > 1 ? rowH / (series.length + 0.8) : rowH * 0.62));
      labels.forEach(function (l, i) {
        var y0 = pad.t + i * rowH + rowH / 2;
        nodes.push(S('text', { x: pad.l - 8, y: y0 + 4, 'text-anchor': 'end', class: 'axis-txt', text: tr(l) }));
        var acc = 0;
        series.forEach(function (s, si) {
          var v = (s.values || [])[i] || 0;
          var w = v / (max || 1) * iw;
          var y = series.length > 1 ? y0 - (series.length * bh) / 2 + si * (bh + 2) : y0 - bh / 2;
          var rect = S('rect', {
            x: pad.l + (o.stack ? acc : si * (iw / series.length)), y: y,
            width: Math.max(o.stack ? w : w / series.length, v > 0 ? 2 : 0), height: bh,
            rx: 3, fill: color(si, s.color)
          });
          nodes.push(rect);
          tipFor(rect, '<b>' + l + '</b><br>' + (s.name ? s.name + '：' : '') + fmt(v));
          acc += w;
        });
        if (o.showValue) {
          var tv = (o.stack ? U.sum(series, function (s) { return (s.values || [])[i] || 0; }) : ((series[0].values || [])[i] || 0));
          nodes.push(S('text', { x: pad.l + tv / (max || 1) * iw + 6, y: y0 + 4, class: 'axis-txt', text: fmt(tv) }));
        }
      });
      // 竖向网格
      ticks(max, o.ticks || 4).forEach(function (t) {
        var x = pad.l + t / (max || 1) * iw;
        nodes.push(S('line', { x1: x, y1: pad.t, x2: x, y2: pad.t + ih, class: 'grid-line', 'stroke-dasharray': '3 3' }));
        nodes.push(S('text', { x: x, y: H - 6, 'text-anchor': 'middle', class: 'axis-txt', text: fmt(t) }));
      });
    } else {
      var groupW = iw / Math.max(1, labels.length);
      var n = series.length;
      var bw = Math.min((groupW * 0.68) / Math.max(1, n), o.maxBar || 34);
      ticks(max, o.ticks || 4).forEach(function (t) {
        var y = pad.t + ih - t / (max || 1) * ih;
        nodes.push(S('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, class: 'grid-line', 'stroke-dasharray': t === 0 ? '' : '3 3' }));
        nodes.push(S('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-txt', text: fmt(t) }));
      });
      labels.forEach(function (l, i) {
        var cx = pad.l + groupW * i + groupW / 2;
        var accY = 0;
        series.forEach(function (s, si) {
          var v = (s.values || [])[i] || 0;
          var h = v / (max || 1) * ih;
          var x = n > 1 ? cx - (n * bw) / 2 + si * bw : cx - bw / 2;
          var y = o.stack ? pad.t + ih - accY - h : pad.t + ih - h;
          var rect = S('rect', {
            x: x, y: y, width: bw - (n > 1 ? 2 : 0), height: Math.max(h, v > 0 ? 2 : 0),
            rx: 3, fill: color(si, s.color)
          });
          nodes.push(rect);
          tipFor(rect, '<b>' + l + '</b><br>' + (s.name ? s.name + '：' : '') + fmt(v));
          accY += h;
        });
        var everyN = Math.ceil(labels.length / (o.maxLabels || 12));
        if (i % everyN === 0 || i === labels.length - 1) {
          nodes.push(S('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'axis-txt', text: tr(l) }));
        }
      });
    }

    var box = wrap(svg(W, H, nodes), H);
    // 统一绑定柱子 tooltip
    pending.forEach(function (it) {
      it.node.style.cursor = 'default';
      it.node.addEventListener('mousemove', function (e) {
        var r = box.getBoundingClientRect(), tip = box._tip;
        tip.innerHTML = it.html;
        tip.style.opacity = '1';
        tip.style.left = (e.clientX - r.left) + 'px';
        tip.style.top = (e.clientY - r.top - 8) + 'px';
      });
      it.node.addEventListener('mouseleave', function () { box._tip.style.opacity = '0'; });
    });
    if (o.legend !== false && series.length > 1) {
      var lg = U.el('div', { class: 'chart-legend' });
      series.forEach(function (s, si) {
        lg.appendChild(U.el('div', { class: 'item' }, [
          U.el('i', { class: 'dot', style: { background: color(si, s.color) } }),
          U.el('span', { text: s.name })
        ]));
      });
      box.appendChild(lg);
    }
    return box;
  };

  /* ================= 环形 / 饼图 ================= */
  Chart.donut = function (o) {
    o = o || {};
    var data = (o.data || []).filter(function (d) { return d.value > 0; });
    var size = o.size || 200, thick = o.thickness || (o.pie ? size / 2 : 34);
    var cx = size / 2, cy = size / 2, R = size / 2 - 6, r = R - thick;
    var total = U.sum(data, function (d) { return d.value; }) || 1;
    var nodes = [], ang = -Math.PI / 2;
    var fmt = o.fmt || function (v) { return U.num(v); };

    data.forEach(function (d, i) {
      var a = d.value / total * Math.PI * 2;
      var a2 = ang + a;
      var large = a > Math.PI ? 1 : 0;
      var p1 = [cx + R * Math.cos(ang), cy + R * Math.sin(ang)];
      var p2 = [cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
      var p3 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
      var p4 = [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      var dstr;
      if (o.pie) {
        dstr = 'M' + cx + ',' + cy + ' L' + p1[0] + ',' + p1[1] + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + p2[0] + ',' + p2[1] + ' Z';
      } else {
        dstr = 'M' + p1[0] + ',' + p1[1] + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + p2[0] + ',' + p2[1] +
          ' L' + p3[0] + ',' + p3[1] + ' A' + r + ',' + r + ' 0 ' + large + ' 0 ' + p4[0] + ',' + p4[1] + ' Z';
      }
      var c = color(i, d.color);
      var path = S('path', { d: dstr, fill: c, stroke: '#fff', 'stroke-width': 1.5 });
      nodes.push(path);
      ang = a2;
    });

    // 固定像素宽度，避免 .chart svg{width:100%} 把环形图拉伸到卡片宽度导致溢出
    var box = wrap(svg(size, size, nodes, {
      style: 'width:' + size + 'px;max-width:100%;margin:0 auto'
    }), size);
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.alignItems = 'center';
    // tooltip
    box.querySelectorAll('path').forEach(function (p, i) {
      var d = data[i];
      if (!d) return;
      var pctv = U.round(d.value / total * 100, 1);
      p.addEventListener('mousemove', function (e) {
        var r = box.getBoundingClientRect(), tip = box._tip;
        tip.innerHTML = '<b>' + d.name + '</b><br>' + fmt(d.value) + ' · ' + pctv + '%';
        tip.style.opacity = '1';
        tip.style.left = (e.clientX - r.left) + 'px';
        tip.style.top = (e.clientY - r.top - 8) + 'px';
      });
      p.addEventListener('mouseleave', function () { box._tip.style.opacity = '0'; });
      p.style.cursor = 'pointer';
    });

    if (o.center) {
      var cWrap = U.el('div', {
        style: {
          position: 'absolute', left: '0', top: '0', width: '100%', height: String(size) + 'px',
          display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center'
        }
      }, [
        U.el('div', null, [
          U.el('div', { class: 't-xl bold', text: o.center.value }),
          U.el('div', { class: 't-xs muted', text: o.center.label })
        ])
      ]);
      box.insertBefore(cWrap, box.firstChild);
      // 不固定容器高度：让容器自适应「环形图 + 图例」，避免图例溢出卡片
    }
    // 图例
    if (o.legend !== false) {
      var lg = U.el('div', {
        class: 'chart-legend',
        style: { flexDirection: o.legendVertical ? 'column' : 'row', width: '100%' }
      });
      data.forEach(function (d, i) {
        var pctv = U.round(d.value / total * 100, 1);
        lg.appendChild(U.el('div', { class: 'item', style: { minWidth: o.legendVertical ? '100%' : 'auto' } }, [
          U.el('i', { class: 'dot', style: { background: color(i, d.color) } }),
          U.el('span', { class: 'grow', text: d.name }),
          U.el('b', { class: 'num', text: fmt(d.value) }),
          U.el('span', { class: 'muted t-xs', text: ' ' + pctv + '%' })
        ]));
      });
      box.appendChild(lg);
    }
    return box;
  };

  /* ================= 漏斗图 ================= */
  Chart.funnel = function (o) {
    o = o || {};
    var data = o.data || [];
    var W = o.width || 420, H = o.height || 240;
    var pad = { t: 8, r: 8, b: 8, l: 8 };
    var n = data.length;
    var rowH = (H - pad.t - pad.b) / Math.max(1, n);
    var maxV = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    var nodes = [];
    var fmt = o.fmt || function (v) { return U.num(v); };

    data.forEach(function (d, i) {
      var w1 = (d.value / maxV) * (W - pad.l - pad.r);
      var next = data[i + 1];
      var w2 = next ? (next.value / maxV) * (W - pad.l - pad.r) : w1 * 0.55;
      var y1 = pad.t + i * rowH, y2 = y1 + rowH - 6;
      var cx = W / 2;
      var path = 'M' + (cx - w1 / 2) + ',' + y1 + ' L' + (cx + w1 / 2) + ',' + y1 +
        ' L' + (cx + w2 / 2) + ',' + y2 + ' L' + (cx - w2 / 2) + ',' + y2 + ' Z';
      var p = S('path', { d: path, fill: color(i, d.color), opacity: .92, stroke: '#fff', 'stroke-width': 1 });
      nodes.push(p);
      nodes.push(S('text', {
        x: cx, y: (y1 + y2) / 2 - 1, 'text-anchor': 'middle', fill: '#fff', 'font-size': '12', 'font-weight': '600',
        text: d.name + ' ' + fmt(d.value)
      }));
      var pctv = i === 0 ? 100 : U.round(d.value / data[0].value * 100, 1);
      nodes.push(S('text', {
        x: cx, y: (y1 + y2) / 2 + 13, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.85)', 'font-size': '10',
        text: pctv + '%'
      }));
      p.addEventListener('mousemove', function (e) {
        var box2 = p.ownerSVGElement.parentNode;
        var r = box2.getBoundingClientRect(), tip = box2._tip;
        tip.innerHTML = '<b>' + d.name + '</b><br>' + fmt(d.value) + ' · 转化 ' + pctv + '%';
        tip.style.opacity = '1';
        tip.style.left = (e.clientX - r.left) + 'px';
        tip.style.top = (e.clientY - r.top - 8) + 'px';
      });
      p.addEventListener('mouseleave', function () {
        var box2 = p.ownerSVGElement.parentNode; box2._tip.style.opacity = '0';
      });
    });
    return wrap(svg(W, H, nodes), H);
  };

  /* ================= 雷达图 ================= */
  Chart.radar = function (o) {
    o = o || {};
    var inds = o.indicators || [], series = o.series || [];
    var size = o.size || 260, cx = size / 2, cy = size / 2 + 4, R = size / 2 - 34;
    var n = inds.length;
    var nodes = [], rings = o.rings || 4;
    var maxOf = function (i) { return inds[i].max || 100; };

    for (var g = rings; g >= 1; g--) {
      var pts = [];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / n;
        var rr = R * g / rings;
        pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
      }
      nodes.push(S('polygon', {
        points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '),
        fill: g === rings ? '#f8fafc' : 'none', stroke: '#e6eaf2', 'stroke-width': 1
      }));
    }
    for (var j = 0; j < n; j++) {
      var a2 = -Math.PI / 2 + j * Math.PI * 2 / n;
      nodes.push(S('line', { x1: cx, y1: cy, x2: cx + R * Math.cos(a2), y2: cy + R * Math.sin(a2), stroke: '#e6eaf2' }));
      var lx = cx + (R + 18) * Math.cos(a2), ly = cy + (R + 18) * Math.sin(a2);
      nodes.push(S('text', {
        x: lx, y: ly + 4, 'text-anchor': Math.abs(Math.cos(a2)) < .2 ? 'middle' : (Math.cos(a2) > 0 ? 'start' : 'end'),
        class: 'axis-txt', text: inds[j].name
      }));
    }
    series.forEach(function (s, si) {
      var pts = (s.values || []).map(function (v, i) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / n;
        var rr = R * Math.min(1, v / (maxOf(i) || 100));
        return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      });
      var c = color(si, s.color);
      nodes.push(S('polygon', {
        points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '),
        fill: c, 'fill-opacity': .16, stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round'
      }));
      pts.forEach(function (p, i) {
        var dot = S('circle', { cx: p[0], cy: p[1], r: 3, fill: '#fff', stroke: c, 'stroke-width': 1.8 });
        nodes.push(dot);
        dot.addEventListener('mousemove', function (e) {
          var b2 = dot.ownerSVGElement.parentNode, r = b2.getBoundingClientRect(), tip = b2._tip;
          tip.innerHTML = '<b>' + inds[i].name + '</b><br>' + (s.name ? s.name + '：' : '') + (s.values[i]);
          tip.style.opacity = '1'; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top - 8) + 'px';
        });
        dot.addEventListener('mouseleave', function () { dot.ownerSVGElement.parentNode._tip.style.opacity = '0'; });
      });
    });
    var box = wrap(svg(size, size, nodes), size);
    if (series.length > 1) {
      var lg = U.el('div', { class: 'chart-legend', style: { justifyContent: 'center' } });
      series.forEach(function (s, si) {
        lg.appendChild(U.el('div', { class: 'item' }, [
          U.el('i', { class: 'dot', style: { background: color(si, s.color) } }), U.el('span', { text: s.name })
        ]));
      });
      box.appendChild(lg);
    }
    return box;
  };

  /* ================= 热力矩阵 ================= */
  Chart.heat = function (o) {
    o = o || {};
    var rows = o.rows || [], cols = o.cols || [], vals = o.values || [];
    var flat = [];
    vals.forEach(function (r) { r.forEach(function (v) { flat.push(v); }); });
    var mx = Math.max.apply(null, flat.concat([1])), mn = Math.min.apply(null, flat.concat([0]));
    var box = U.el('div', { class: 'chart', style: { position: 'relative', overflowX: 'auto' } });
    var tbl = U.el('table', { class: 'heat-tbl' });
    var thead = U.el('tr');
    thead.appendChild(U.el('th'));
    cols.forEach(function (c) { thead.appendChild(U.el('th', { text: c })); });
    tbl.appendChild(thead);
    rows.forEach(function (rn, i) {
      var tr = U.el('tr');
      tr.appendChild(U.el('th', { style: { textAlign: 'right', paddingRight: '6px' }, text: rn }));
      cols.forEach(function (c, j) {
        var v = (vals[i] || [])[j];
        var t = mx === mn ? 0 : (v - mn) / (mx - mn);
        var col = o.color ? o.color(t) : heatColor(t);
        var td = U.el('td', {
          style: { background: col }, title: rn + ' / ' + c + ': ' + v,
          text: o.fmt ? o.fmt(v) : v
        });
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    box.appendChild(tbl);
    return box;
  };
  function heatColor(t) {
    // 浅 → 深蓝
    var stops = [[239, 246, 255], [191, 219, 254], [147, 197, 253], [59, 130, 246], [29, 78, 216]];
    var x = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
    var i = Math.floor(x), f = x - i;
    var a = stops[i], b = stops[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }

  /* ================= 仪表盘 ================= */
  Chart.gauge = function (o) {
    o = o || {};
    var size = o.size || 180, v = o.value || 0, max = o.max || 100;
    var cx = size / 2, cy = size / 2 + 8, R = size / 2 - 14;
    var start = Math.PI * 0.78, end = Math.PI * 2.22;
    var t = Math.max(0, Math.min(1, v / max));
    var ang = start + (end - start) * t;
    var pt = function (a, r) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    var arc = function (a1, a2, r) {
      var p1 = pt(a1, r), p2 = pt(a2, r);
      return 'M' + p1[0] + ',' + p1[1] + ' A' + r + ',' + r + ' 0 ' + (a2 - a1 > Math.PI ? 1 : 0) + ' 1 ' + p2[0] + ',' + p2[1];
    };
    var c = o.color || (t > .7 ? '#16a34a' : t > .4 ? '#f59e0b' : '#dc2626');
    var nodes = [
      S('path', { d: arc(start, end, R), fill: 'none', stroke: '#e6eaf2', 'stroke-width': 12, 'stroke-linecap': 'round' }),
      S('path', { d: arc(start, ang, R), fill: 'none', stroke: c, 'stroke-width': 12, 'stroke-linecap': 'round' }),
      S('circle', { cx: pt(ang, R)[0], cy: pt(ang, R)[1], r: 5, fill: '#fff', stroke: c, 'stroke-width': 2.5 }),
      S('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': '24', 'font-weight': '700', fill: '#0f172a', text: o.text != null ? o.text : U.num(v) }),
      S('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': '11', fill: '#64748b', text: o.label || '' }),
      S('text', { x: cx - R, y: cy + 24, 'text-anchor': 'middle', 'font-size': '10', fill: '#94a3b8', text: o.minLabel || '0' }),
      S('text', { x: cx + R, y: cy + 24, 'text-anchor': 'middle', 'font-size': '10', fill: '#94a3b8', text: o.maxLabel || String(max) })
    ];
    var box = wrap(svg(size, size * 0.78, nodes, {
      style: 'width:' + size + 'px;max-width:100%'
    }), size);
    // 固定容器宽度，避免 flex 行内被 .chart{width:100%} 撑满挤压其它内容
    box.style.width = size + 'px';
    box.style.flex = '0 0 auto';
    return box;
  };

  /* ================= 迷你折线 ================= */
  Chart.spark = function (o) {
    o = o || {};
    var vals = o.values || [], W = o.width || 90, H = o.height || 30;
    if (!vals.length) return U.el('div');
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    var rg = (mx - mn) || 1;
    var pts = vals.map(function (v, i) {
      return [i / Math.max(1, vals.length - 1) * (W - 4) + 2, H - 3 - (v - mn) / rg * (H - 6)];
    });
    var c = o.color || '#2563eb';
    var sv = svg(W, H, [
      S('path', { d: linePath(pts) + ' L' + pts[pts.length - 1][0] + ',' + H + ' L' + pts[0][0] + ',' + H + ' Z', fill: c, opacity: .12 }),
      S('path', { d: smoothPath(pts), fill: 'none', stroke: c, 'stroke-width': 1.8, 'stroke-linecap': 'round' }),
      S('circle', { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.2, fill: c })
    ], { style: 'width:' + W + 'px;height:' + H + 'px' });
    return sv;
  };

  /* ================= 进度环 ================= */
  Chart.ring = function (pct, size, color, label) {
    size = size || 64;
    var R = size / 2 - 5, c = 2 * Math.PI * R, off = c * (1 - Math.max(0, Math.min(1, pct / 100)));
    var txt = label != null ? tr(label) : Math.round(pct) + '%';
    /* 环形中心仅够放数字：英/德译文「8 companies / 8 Unternehmen」过长时只保留数字 */
    if (global.I18n && global.I18n.get() !== 'zh' && /^\s*\d[\d.,]*\s+\S/.test(txt)) {
      txt = /^\s*\d[\d.,]*/.exec(txt)[0];
    }
    var nodes = [
      S('circle', { cx: size / 2, cy: size / 2, r: R, fill: 'none', stroke: '#e6eaf2', 'stroke-width': 6 }),
      S('circle', {
        cx: size / 2, cy: size / 2, r: R, fill: 'none', stroke: color || '#2563eb', 'stroke-width': 6,
        'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': off,
        transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'
      }),
      S('text', { x: size / 2, y: size / 2 + 4, 'text-anchor': 'middle', 'font-size': size > 60 ? 13 : 11, 'font-weight': '700', fill: '#0f172a', text: txt })
    ];
    return svg(size, size, nodes, { style: 'width:' + size + 'px;height:' + size + 'px' });
  };

  Chart.PALETTE = PALETTE;
  Chart.color = color;
  global.Chart = Chart;
})(window);
