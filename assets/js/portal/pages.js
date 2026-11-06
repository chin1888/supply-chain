/* ============================================================
   SCM · 前台展示端页面
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Chart = global.Chart, Store = global.Store, Seed = global.Seed;
  var PS = global.ProductSchema;
  var P = { pages: {} };

  var CAT_COLORS = {};
  (function () {
    Seed.CATS.forEach(function (c, i) { CAT_COLORS[c] = Chart.PALETTE[i % Chart.PALETTE.length]; });
  })();

  /* ---------------- 通用组件 ---------------- */
  function secHead(title, sub, extra) {
    return U.el('div', { class: 'p-sec-head' }, [
      U.el('div', null, [U.el('h2', { text: title }), sub ? U.el('div', { class: 'sub', text: sub }) : null]),
      extra || null
    ]);
  }
  function card(title, sub, bodyNode, footNode) {
    return U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: title }), sub ? U.el('div', { class: 'sub', text: sub }) : null])
      ]),
      U.el('div', { class: 'card-body' }, bodyNode),
      footNode || null
    ]);
  }
  function kpi(label, value, unit, delta, spark, k) {
    var dcls = delta == null ? '' : (delta >= 0 ? 'up' : 'down');
    return U.el('div', { class: 'kpi ' + (k || '') }, [
      U.el('div', { class: 'label', text: label }),
      U.el('div', { class: 'value' }, [
        document.createTextNode(value),
        unit ? U.el('small', { text: unit }) : null
      ]),
      delta == null ? null : U.el('div', { class: 'delta ' + dcls, text: (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + '% 环比' }),
      spark && spark.length ? U.el('div', { class: 'spark' }, Chart.spark({ values: spark, width: 74, height: 28 })) : null
    ]);
  }
  function heroStat(v, l, unit) {
    return U.el('div', { class: 'st' }, [
      U.el('div', { class: 'v' }, [document.createTextNode(v), unit ? U.el('small', { text: unit }) : null]),
      U.el('div', { class: 'l', text: l })
    ]);
  }

  /* ---------------- 供应链网络图 ---------------- */
  function network(opts) {
    opts = opts || {};
    var W = 660, H = opts.height || 340;
    var cx = W / 2, cy = H / 2;
    var sup = Store.list('suppliers').filter(function (s) {
      return !opts.filter || opts.filter(s);
    });
    var groups = U.groupBy(sup, function (s) { return s.region; });
    var keys = Object.keys(groups);
    var nodes = [];
    var R0 = Math.min(H / 2 - 40, 118);
    /* 德/英供应商名更长：把整体拓扑等比缩到画布安全区内，标签不会溢出到卡片标题上方 */
    var far = R0 + 34 + 40;
    var allow = Math.min(cy - 34, H - cy - 22);
    var sc = Math.min(1, allow / far);
    var R = R0 * sc;
    var hubR = 30, nodeR = 9;

    // 连线
    keys.forEach(function (k, gi) {
      var ang0 = -Math.PI / 2 + gi * Math.PI * 2 / keys.length;
      var gx = cx + R * Math.cos(ang0), gy = cy + R * Math.sin(ang0);
      var arr = groups[k];
      arr.forEach(function (s, i) {
        var spread = Math.PI * 2 / Math.max(arr.length, 4) * 0.42;
        var a = ang0 - spread / 2 + (arr.length > 1 ? i * spread / (arr.length - 1) : spread / 2);
        var rr = (R0 + 34 + (i % 3) * 20) * sc;
        var nx = cx + rr * Math.cos(a), ny = cy + rr * Math.sin(a);
        s._x = nx; s._y = ny;
        nodes.push(U.s('line', {
          x1: gx, y1: gy, x2: nx, y2: ny,
          class: 'link-l' + (s.level === 'A' ? ' hot' : ''), opacity: .55
        }));
      });
    });
    // 中心
    nodes.push(U.s('circle', { cx: cx, cy: cy, r: hubR + 12, class: 'hub', opacity: .1 }));
    nodes.push(U.s('circle', { cx: cx, cy: cy, r: hubR, class: 'hub' }));
    nodes.push(U.s('text', { x: cx, y: cy + 1, 'text-anchor': 'middle', fill: '#fff', 'font-size': '12', 'font-weight': '700', text: '智联' }));
    nodes.push(U.s('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.8)', 'font-size': '9', text: 'SCM HUB' }));

    // 区域节点 + 供应商节点
    var box;
    keys.forEach(function (k, gi) {
      var ang0 = -Math.PI / 2 + gi * Math.PI * 2 / keys.length;
      var gx = cx + R * Math.cos(ang0), gy = cy + R * Math.sin(ang0);
      nodes.push(U.s('circle', { cx: gx, cy: gy, r: 15, fill: '#1e3a8a', opacity: .9 }));
      nodes.push(U.s('text', { x: gx, y: gy + 4, 'text-anchor': 'middle', fill: '#fff', 'font-size': '10', 'font-weight': '600', text: k }));
      nodes.push(U.s('text', { x: gx, y: gy + 28, 'text-anchor': 'middle', class: 'axis-txt', text: groups[k].length + ' 家' }));
    });
    sup.forEach(function (s) {
      if (s._x == null) return;
      var cls = s.level === 'A' ? 'n1' : s.level === 'B' ? 'n2' : 'n4';
      if (s.status === 'suspended') cls = 'n3';
      var g = U.s('g', { class: 'node-g' }, [
        U.s('circle', { class: 'halo', cx: s._x, cy: s._y, r: nodeR + 6, fill: '#2563eb', opacity: 0 }),
        U.s('circle', { cx: s._x, cy: s._y, r: nodeR, class: cls, stroke: '#fff', 'stroke-width': 1.5 }),
        U.s('text', { x: s._x, y: s._y - nodeR - 5, 'text-anchor': 'middle', class: 'axis-txt', text: s.short })
      ]);
      g.addEventListener('mousemove', function (e) {
        if (!box) return;
        var r = box.getBoundingClientRect(), tip = box._tip;
        tip.innerHTML = '<b>' + s.name + '</b><br>' + s.level + ' 级 · ' + s.city +
          '<br>准时率 ' + s.onTimeRate + '% · 交期 ' + s.leadTime + ' 天';
        tip.style.opacity = '1';
        tip.style.left = (e.clientX - r.left) + 'px';
        tip.style.top = (e.clientY - r.top - 8) + 'px';
      });
      g.addEventListener('mouseleave', function () { if (box) box._tip.style.opacity = '0'; });
      if (opts.onPick) { g.style.cursor = 'pointer'; g.addEventListener('click', function () { opts.onPick(s); }); }
      nodes.push(g);
    });

    var wrapDiv = U.el('div', { class: 'chart net-wrap', style: { position: 'relative' } });
    wrapDiv.appendChild(U.svg(W, H, nodes));
    var tip = U.el('div', { class: 'chart-tip', style: { opacity: '0', left: '0px', top: '0px' } });
    wrapDiv.appendChild(tip);
    wrapDiv._tip = tip;
    box = wrapDiv;
    return wrapDiv;
  }
  P.network = network;

  /* ================================================================
     1. 首页
     ================================================================ */
  P.pages.home = function () {
    var st = Store.stats(), m = Store.db.monthly;
    var root = U.el('div', { class: 'fade-in' });

    /* Hero */
    root.appendChild(U.el('div', { class: 'p-hero' }, [
      U.el('div', { class: 'inner' }, [
        U.el('div', { class: 'tag', style: { background: 'rgba(255,255,255,.16)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }, text: '全链路协同 · 数据驱动决策' }),
        U.el('h1', { class: 'mt12', text: '打通从供应商到客户的每一环' }),
        U.el('div', { class: 'desc', text: '覆盖供应商协同、采购执行、智能仓储、物流追踪与财务对账的端到端供应链管理平台。实时感知库存水位、交付风险与履约进度，让供应链从被动响应走向主动预测。' }),
        U.el('div', { class: 'stats' }, [
          heroStat(U.num(st.supplierCount), '合作供应商', ' 家'),
          heroStat(U.num(st.productCount), '在管物料', ' 种'),
          heroStat(U.money(st.poAmount), '在途采购额', ''),
          heroStat(U.pct(st.onTimeRate), '准时交付率', '')
        ]),
        U.el('div', { class: 'btns' }, [
          U.el('a', { class: 'btn lg', href: '#/insight', text: '查看数据洞察' }),
          U.el('a', { class: 'btn lg ghost-l', href: '#/suppliers', text: '探索供应商网络' })
        ])
      ])
    ]));

    var main = U.el('div', { class: 'p-main' });
    root.appendChild(main);

    /* KPI 带 */
    var kpis = U.el('div', { class: 'grid g4 mb16' });
    var buy = U.moneyWan(st.monthPurchase), sell = U.moneyWan(st.monthSales);
    kpis.appendChild(kpi('本月采购额', buy.value, buy.unit, st.deltaPurchase, m.map(function (x) { return x.purchase; }), ''));
    kpis.appendChild(kpi('本月销售额', sell.value, sell.unit, st.deltaSales, m.map(function (x) { return x.sales; }), 'k2'));
    kpis.appendChild(kpi('订单准时交付率', U.pct(st.onTimeRate), '', st.deltaOnTime, m.map(function (x) { return x.onTime; }), 'k3'));
    kpis.appendChild(kpi('库存周转率', st.turnover, ' 次/年', st.deltaTurnover, m.map(function (x) { return x.turnover; }), 'k4'));
    main.appendChild(kpis);

    /* 网络 + 侧栏 */
    var row1 = U.el('div', { class: 'grid', style: { gridTemplateColumns: '1.5fr 1fr' } });
    main.appendChild(row1);

    row1.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [
          U.el('h3', { text: '供应链网络拓扑' }),
          U.el('div', { class: 'sub', text: '按区域聚合的供应商分布，A 级战略供应商以高亮链路连接' })
        ]),
        U.el('div', { class: 'row gap6' }, [
          U.el('span', { class: 'badge blue', text: 'A 级' }),
          U.el('span', { class: 'badge cyan', text: 'B 级' }),
          U.el('span', { class: 'badge amber', text: 'C 级' })
        ])
      ]),
      U.el('div', { class: 'card-body', style: { padding: '6px' } }, network({ height: 330 }))
    ]));

    var side = U.el('div', { class: 'col gap16' });
    row1.appendChild(side);

    var levelCnt = U.groupBy(Store.list('suppliers'), function (s) { return s.level; });
    var lvNode = U.el('div', { class: 'row gap12', style: { justifyContent: 'space-around' } }, ['A', 'B', 'C'].map(function (l, i) {
      var arr = levelCnt[l] || [];
      return U.el('div', { class: 'tc' }, [
        Chart.ring(arr.length / Store.list('suppliers').length * 100, 66, ['#16a34a', '#2563eb', '#f59e0b'][i], arr.length + ' 家'),
        U.el('div', { class: 't-xs muted mt4', text: l + ' 级供应商' })
      ]);
    }));
    side.appendChild(card('供应商分级', '基于准时率/质量/交期综合评分', lvNode));

    var alerts = Store.alerts().slice(0, 5);
    side.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '风险预警' }), U.el('div', { class: 'sub', text: '系统自动识别的异常事件' })])
      ]),
      U.el('div', { class: 'card-body' }, U.el('div', { class: 'warn-list' }, alerts.length ? alerts.map(function (a) {
        var c = a.level === 'high' ? 'var(--danger)' : a.level === 'mid' ? 'var(--warn)' : 'var(--muted-2)';
        return U.el('div', { class: 'it' }, [
          U.el('i', { class: 'dot', style: { background: c } }),
          U.el('div', { class: 'txt' }, [
            U.el('div', { class: 'bold', text: a.title }),
            U.el('div', { class: 't-xs muted', text: a.desc })
          ]),
          U.el('span', { class: 'badge gray plain', text: a.type })
        ]);
      }) : [U.el('div', { class: 'empty', text: '暂无预警' })]))
    ]));

    /* 趋势 */
    main.appendChild(U.el('div', { class: 'card mt16' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '经营趋势（近 12 个月）' }), U.el('div', { class: 'sub', text: '采购 / 销售 / 库存金额走势（万元）' })]),
        U.el('div', { class: 'row gap12 t-sm' }, [
          U.el('span', { class: 'muted', html: '采购峰值 <b>' + U.wanText(Math.max.apply(null, m.map(function (x) { return x.purchase; }))) + '</b>' })
        ])
      ]),
      U.el('div', { class: 'card-body' }, Chart.line({
        labels: m.map(function (x) { return U.monthLabel(x.month); }),
        height: 260,
        series: [
          { name: '采购额', values: m.map(function (x) { return x.purchase; }), color: '#2563eb' },
          { name: '销售额', values: m.map(function (x) { return x.sales; }), color: '#14b8a6' }
        ],
        yFmt: function (v) { return U.num(v); },
        tipFmt: function (v) { return U.wanText(v); }
      }))
    ]));

    /* 分类结构 + 区域分布 */
    var row2 = U.el('div', { class: 'grid g2 mt16' });
    main.appendChild(row2);
    var cd = U.sortBy(Store.db.categoryData, function (x) { return x.amount; }, 'desc').slice(0, 6);
    row2.appendChild(card('采购品类结构', '按物料分类的采购金额占比（万元）',
      Chart.donut({
        data: cd.map(function (x) { return { name: x.category, value: x.amount, color: CAT_COLORS[x.category] }; }),
        size: 190, legendVertical: false,
        center: { value: U.money(U.sum(cd, function (x) { return x.amount; })), label: '采购总额(万)' }
      })
    ));

    var rd = U.sortBy(Store.db.regionData, function (x) { return x.amount; }, 'desc');
    row2.appendChild(card('区域供应能力', '各区域供应商数量与采购额（万元）',
      Chart.bar({
        horizontal: true, height: 250,
        labels: rd.map(function (x) { return x.region; }),
        series: [{ name: '采购额', values: rd.map(function (x) { return x.amount; }), color: '#0ea5e9' }],
        showValue: true, legend: false,
        yFmt: function (v) { return U.num(v); }
      })
    ));

    /* 质量与交付 */
    main.appendChild(U.el('div', { class: 'card mt16' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '交付质量双维度' }), U.el('div', { class: 'sub', text: '准时交付率与来料质量合格率月度走势（%）' })])
      ]),
      U.el('div', { class: 'card-body' }, Chart.line({
        labels: m.map(function (x) { return U.monthLabel(x.month); }),
        height: 230, area: false, min: 80, max: 100,
        series: [
          { name: '准时交付率', values: m.map(function (x) { return x.onTime; }), color: '#2563eb' },
          { name: '质量合格率', values: m.map(function (x) { return x.quality; }), color: '#16a34a' }
        ],
        yFmt: function (v) { return v + '%'; },
        tipFmt: function (v) { return v + '%'; }
      }))
    ]));

    /* 能力卡片 */
    var caps = [
      ['供应商协同', '分级准入、绩效评分、风险预警，A/B/C 三级动态管理', '#2563eb'],
      ['智能采购', '需求转采购、比价审批、交期跟踪，全流程线上闭环', '#0ea5e9'],
      ['仓储可视化', '多仓库存实时同步，安全库存预警与库容利用率分析', '#14b8a6'],
      ['物流追踪', '承运商对接、在途可视化、异常自动识别与节点回溯', '#f59e0b'],
      ['财务对账', '应收应付联动、账期管理、逾期催收与现金流预测', '#8b5cf6'],
      ['数据洞察', '12 项核心指标看板，多维度下钻分析与经营诊断', '#ec4899']
    ];
    main.appendChild(U.el('div', { class: 'grid g3 mt16' }, caps.map(function (c) {
      return U.el('div', { class: 'card card-pad' }, [
        U.el('div', { class: 'row gap8' }, [
          U.el('i', { style: { width: '8px', height: '8px', borderRadius: '3px', background: c[2], display: 'block' } }),
          U.el('b', { text: c[0] })
        ]),
        U.el('div', { class: 't-sm muted mt8', text: c[1] })
      ]);
    })));

    return root;
  };

  /* ================================================================
     2. 供应商网络
     ================================================================ */
  P.pages.suppliers = function () {
    var root = U.el('div', { class: 'fade-in' });
    var main = U.el('div', { class: 'p-main' });
    root.appendChild(main);
    main.appendChild(secHead('供应商网络', Store.list('suppliers').length + ' 家合作伙伴覆盖 ' + Seed.REGIONS.length + ' 大区域，支持按区域 / 等级 / 状态筛选'));

    var state = { region: '', level: '', status: '', kw: '' };
    var listBox = U.el('div');

    function filtered() {
      return Store.list('suppliers').filter(function (s) {
        if (state.region && s.region !== state.region) return false;
        if (state.level && s.level !== state.level) return false;
        if (state.status && s.status !== state.status) return false;
        if (state.kw && (s.name + s.city + s.category + s.contact).indexOf(state.kw) < 0) return false;
        return true;
      });
    }

    var toolbar = U.el('div', { class: 'card card-pad mb16' });
    var trow = U.el('div', { class: 'row gap12 wrap' });
    trow.appendChild(U.el('div', { class: 'search-box grow', style: { maxWidth: '240px' } }, [
      U.el('input', { class: 'input', placeholder: '搜索名称 / 城市 / 品类', oninput: U.debounce(function (e) { state.kw = e.target.value; render(); }, 200) })
    ]));
    function mkSel(label, options, key) {
      var sel = U.select('f_' + key, options, state[key]);
      sel.style.width = 'auto';
      sel.addEventListener('change', function () { state[key] = sel.value; render(); });
      return U.el('div', { class: 'row gap6' }, [U.el('span', { class: 't-sm muted', text: label }), sel]);
    }
    trow.appendChild(mkSel('区域', [['', '全部区域']].concat(Seed.REGIONS.map(function (r) { return [r, r]; })), 'region'));
    trow.appendChild(mkSel('等级', [['', '全部等级'], ['A', 'A 级'], ['B', 'B 级'], ['C', 'C 级']], 'level'));
    trow.appendChild(mkSel('状态', [['', '全部状态'], ['active', '合作中'], ['pending', '待审核'], ['suspended', '已暂停']], 'status'));
    trow.appendChild(U.el('div', { class: 'grow' }));
    // 直接持有引用：页面渲染时尚未挂载到 document，不能用 U.$('#id') 查询
    var countNode = U.el('span', { class: 't-sm muted' });
    trow.appendChild(countNode);
    toolbar.appendChild(trow);
    main.appendChild(toolbar);

    var netCard = U.el('div', { class: 'card mb16' });
    main.appendChild(netCard);
    main.appendChild(listBox);

    function render() {
      var arr = filtered();
      countNode.textContent = '共 ' + arr.length + ' 家';
      netCard.innerHTML = '';
      netCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '网络拓扑' }), U.el('div', { class: 'sub', text: '节点大小代表供应商等级，连线越亮代表协同越紧密' })])
      ]));
      netCard.appendChild(U.el('div', { class: 'card-body', style: { padding: '6px' } },
        network({ height: 320, filter: function (s) { return arr.indexOf(s) >= 0; } })
      ));

      listBox.innerHTML = '';
      var table = U.el('div', { class: 'card' });
      var tw = U.el('div', { class: 'table-wrap' });
      var tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th>供应商</th><th>编码</th><th>品类</th><th>区域</th><th>等级</th><th class="num">准时率</th><th class="num">合格率</th><th class="num">交期(天)</th><th class="num">累计采购(万)</th><th>状态</th></tr></thead>';
      var tb = U.el('tbody');
      U.sortBy(arr, function (s) { return s.rating; }, 'desc').forEach(function (s) {
        var e = Store.ENUMS.supStatus[s.status];
        var lv = Store.ENUMS.level[s.level];
        tb.appendChild(U.el('tr', null, [
          U.el('td', null, [
            U.el('div', { class: 'bold', text: s.name }),
            U.el('div', { class: 't-xs muted', text: s.city + ' · ' + s.contact + ' · ' + s.phone })
          ]),
          U.el('td', { class: 'mono t-sm muted', text: s.code }),
          U.el('td', null, U.el('span', { class: 'tag', text: s.category })),
          U.el('td', { text: s.region }),
          U.el('td', null, U.el('span', { class: 'badge ' + lv[1], text: lv[0] })),
          U.el('td', { class: 'num', html: '<span class="' + (s.onTimeRate >= 95 ? 'down' : s.onTimeRate < 88 ? 'up' : '') + '">' + s.onTimeRate + '%</span>' }),
          U.el('td', { class: 'num', text: s.qualityRate + '%' }),
          U.el('td', { class: 'num', text: s.leadTime }),
          U.el('td', { class: 'num', text: U.money(s.totalAmount) }),
          U.el('td', null, U.el('span', { class: 'badge ' + e[1], text: e[0] }))
        ]));
      });
      tbl.appendChild(tb);
      tw.appendChild(tbl);
      table.appendChild(tw);
      listBox.appendChild(table);
    }
    render();
    return root;
  };

  /* ================================================================
     3. 产品与库存
     ================================================================ */
  P.pages.products = function () {
    var root = U.el('div', { class: 'fade-in' });
    var main = U.el('div', { class: 'p-main' });
    root.appendChild(main);
    main.appendChild(secHead('物料与库存', '多仓库存实时聚合，安全库存水位动态预警'));

    var low = Store.lowStock();
    var strip = U.el('div', { class: 'grid g4 mb16' });
    var totalQty = U.sum(Store.list('inventory'), function (x) { return x.qty; });
    strip.appendChild(kpi('在管物料', U.num(Store.list('products').length), ' 种', null, null, ''));
    strip.appendChild(kpi('库存总量', U.num(totalQty), ' 件', null, null, 'k2'));
    strip.appendChild(kpi('库存总值', U.money(Store.stats().stockValue), '', null, null, 'k3'));
    strip.appendChild(kpi('低库存预警', U.num(low.length), ' 项', null, null, 'k4'));
    main.appendChild(strip);

    /* 库容 + 分类库存 */
    var row = U.el('div', { class: 'grid g2 mb16' });
    main.appendChild(row);
    var wu = U.sortBy(Store.whUsage(), function (x) { return x.rate; }, 'desc');
    row.appendChild(card('仓库库容利用率', '已用库容 / 总库容',
      Chart.bar({
        horizontal: true, height: 220, max: 100,
        labels: wu.map(function (x) { return x.warehouse.name; }),
        series: [{ name: '利用率', values: wu.map(function (x) { return x.rate; }), color: '#8b5cf6' }],
        showValue: true, legend: false, yFmt: function (v) { return v + '%'; }
      })
    ));

    var byCat = U.groupBy(Store.list('products'), function (p) { return p.category; });
    var catStock = Object.keys(byCat).map(function (c) {
      return { name: c, value: U.round(U.sum(byCat[c], function (p) { return Store.stockOf(p.id).qty * p.unitPrice; }) / 10000, 1), color: CAT_COLORS[c] };
    }).filter(function (x) { return x.value > 0; });
    row.appendChild(card('分类库存价值', '按物料分类的库存金额（万元）',
      Chart.donut({
        data: U.sortBy(catStock, function (x) { return x.value; }, 'desc'),
        size: 190,
        center: { value: U.money(Store.stats().stockValue), label: '库存总值' }
      })
    ));

    /* 低库存预警表 */
    main.appendChild(U.el('div', { class: 'card mb16' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '库存水位预警' }), U.el('div', { class: 'sub', text: '可用库存低于安全库存的物料，按紧张程度排序' })]),
        U.el('span', { class: 'badge red', text: low.length + ' 项待补货' })
      ]),
      U.el('div', { class: 'table-wrap' }, (function () {
        var tbl = U.el('table', { class: 'tbl' });
        tbl.innerHTML = '<thead><tr><th>物料</th><th>SKU</th><th>分类</th><th class="num">可用库存</th><th class="num">安全库存</th><th style="width:180px">水位</th><th>主供应商</th></tr></thead>';
        var tb = U.el('tbody');
        low.slice(0, 10).forEach(function (x) {
          var cls = x.level < 50 ? 'bad' : 'warn';
          tb.appendChild(U.el('tr', null, [
            U.el('td', { class: 'bold', text: x.product.name }),
            U.el('td', { class: 'mono t-xs muted', text: x.product.sku }),
            U.el('td', null, U.el('span', { class: 'tag', text: x.product.category })),
            U.el('td', { class: 'num', text: U.num(x.stock.available) + ' ' + x.product.unit }),
            U.el('td', { class: 'num muted', text: U.num(x.product.safetyStock) }),
            U.el('td', null, U.el('div', { class: 'row gap8' }, [
              U.el('div', { class: 'bar grow' }, U.el('i', { class: cls, style: { width: Math.min(100, x.level) + '%' } })),
              U.el('span', { class: 't-xs num ' + (x.level < 50 ? 'up' : ''), style: { width: '38px' }, text: x.level + '%' })
            ])),
            U.el('td', { class: 't-sm', text: Store.supplierName(x.product.supplierId) })
          ]));
        });
        tbl.appendChild(tb);
        return tbl;
      })())
    ]));

    /* ---------- 全部产品目录：列出所有产品，点击查看完整档案 ---------- */
    var cat = '';
    var countNode = U.el('span', { class: 't-xs muted' });
    var gridBox = U.el('div', { class: 'grid g4' });
    main.appendChild(U.el('div', { class: 'row between mb12 mt16' }, [
      U.el('div', { class: 'row gap12' }, [
        U.el('h3', { text: '全部产品' }), countNode
      ]),
      (function () {
        var sel = U.select('fcat', [['', '全部分类']].concat(Seed.CATS.map(function (c) { return [c, c]; })), '');
        sel.style.width = 'auto';
        sel.addEventListener('change', function () { cat = sel.value; renderGrid(); });
        return sel;
      })()
    ]));
    main.appendChild(U.el('div', { class: 't-xs muted mb12', text: '查看完整档案（点击任意产品卡片）' }));
    main.appendChild(gridBox);

    /* 完整产品档案弹窗：与后台共用同一套字段定义 */
    function openProduct(p) {
      var s = Store.productStats(p.id);
      var groups = PS ? PS.GROUPS : [];
      var rows = PS ? PS.rows(p) : [];
      var body = U.el('div', { class: 'col gap16' }, [
        U.el('div', { class: 'p-detail-head' }, [
          p.image ? U.thumb(p.image, 96, function () { U.lightbox([p.image], 0); })
            : U.el('div', {
              class: 'thumb', style: { width: '96px', height: '96px', borderRadius: '10px', background: 'linear-gradient(135deg,' + (CAT_COLORS[p.category] || '#2563eb') + ',#0f172a)' },
              text: String(p.name || '?').slice(0, 1)
            }),
          U.el('div', { class: 'grow' }, [
            U.el('div', { class: 'row gap8 wrap mb8' }, [
              U.el('span', { class: 'tag', text: p.category || '-' }),
              U.el('span', { class: 'tag', text: p.grade || '-' }),
              U.el('span', { class: 'tag', text: p.brand || '-' })
            ]),
            U.el('div', { class: 'grid g3 tc' }, [
              U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.moneyY(p.unitPrice, 2) }), U.el('div', { class: 't-xs muted', text: '采购单价' })]),
              U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(s.available) }), U.el('div', { class: 't-xs muted', text: '可用库存' })]),
              U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.pct(s.level, 0) }), U.el('div', { class: 't-xs muted', text: '库存水位' })])
            ])
          ])
        ]),
        U.el('div', { class: 'card card-pad' }, [
          U.el('h4', { class: 'mb12', text: '完整产品档案' }),
          U.el('div', { class: 'col gap12' }, groups.map(function (g) {
            var pairs = [];
            rows.filter(function (x) { return x.group === g.k; }).forEach(function (x) {
              pairs.push(U.el('dt', { text: x.label }));
              pairs.push(U.el('dd', {
                text: x.value == null || x.value === '' ? '-' : x.value,
                'data-i18n-skip': /^(SKU|条码|HS)/.test(x.label) ? '1' : null
              }));
            });
            return U.el('div', null, [
              U.el('div', { class: 't-xs bold mb8', style: { color: 'var(--primary)' }, text: g.label }),
              U.el('div', { class: 'p-dl' }, pairs)
            ]);
          }))
        ]),
        U.el('div', { class: 'card card-pad' }, [
          U.el('h4', { class: 'mb12', text: '业务关联' }),
          U.el('div', { class: 'p-dl' }, [
            U.el('dt', { text: '采购次数' }), U.el('dd', { text: s.poDocs + ' 单' }),
            U.el('dt', { text: '累计采购量' }), U.el('dd', { text: U.num(s.poQty) }),
            U.el('dt', { text: '销售次数' }), U.el('dd', { text: s.soDocs + ' 单' }),
            U.el('dt', { text: '累计销售额' }), U.el('dd', { text: U.moneyY(s.soAmount) }),
            U.el('dt', { text: '库存金额' }), U.el('dd', { text: U.moneyY(s.value) }),
            U.el('dt', { text: '分布仓库' }), U.el('dd', { text: s.warehouses + ' 座' })
          ])
        ])
      ]);
      U.modal({ title: '产品详情', body: body, wide: true, hideOk: true, cancelText: '关闭' });
    }

    function renderGrid() {
      gridBox.innerHTML = '';
      var arr = Store.list('products').filter(function (p) { return !cat || p.category === cat; });
      countNode.textContent = '共 ' + arr.length + ' SKU';
      arr.forEach(function (p) {
        var lv = Store.stockLevel(p.id), st = Store.stockOf(p.id);
        var c = CAT_COLORS[p.category] || '#2563eb';
        var bcls = lv < 60 ? 'bad' : lv < 100 ? 'warn' : 'ok';
        var thumb = p.image
          ? U.el('div', { class: 'thumb', style: { padding: 0, overflow: 'hidden' } },
            U.el('img', { src: p.image, alt: p.name, style: { width: '100%', height: '100%', objectFit: 'cover' } }))
          : U.el('div', { class: 'thumb', style: { background: 'linear-gradient(135deg,' + c + ',#0f172a)' },
              text: String(p.sku || 'P').replace(/^M-/, '').charAt(0).toUpperCase() });
        gridBox.appendChild(U.el('div', {
          class: 'prod-card', style: { cursor: 'pointer' }, title: '查看完整档案',
          onclick: function () { openProduct(p); }
        }, [
          thumb,
          U.el('div', { class: 'body' }, [
            U.el('div', { class: 'row between' }, [
              U.el('div', { class: 'nm ellipsis', text: p.name }),
              U.el('span', { class: 'badge ' + (lv < 60 ? 'red' : lv < 100 ? 'amber' : 'green'), text: lv + '%' })
            ]),
            U.el('div', { class: 'sku ellipsis' }, [
              U.el('span', { 'data-i18n-skip': '1', text: p.sku }),
              document.createTextNode(' · '),
              U.el('span', { text: p.spec || '-' })
            ]),
            U.el('div', { class: 'row between mt4' }, [
              U.el('span', { class: 't-sm', text: '¥' + p.unitPrice + ' / ' + p.unit }),
              U.el('span', { class: 't-xs muted', text: '可用 ' + U.num(st.available) })
            ]),
            U.el('div', { class: 'bar thin mt8' }, U.el('i', { class: bcls, style: { width: Math.min(100, lv) + '%' } })),
            U.el('div', { class: 't-xs muted mt4 ellipsis', text: Store.supplierName(p.supplierId) })
          ])
        ]));
      });
      if (!arr.length) gridBox.appendChild(U.el('div', { class: 'empty', text: '暂无产品数据' }));
    }
    renderGrid();
    return root;
  };

  /* ================================================================
     4. 订单追踪
     ================================================================ */
  P.pages.tracking = function () {
    var root = U.el('div', { class: 'fade-in' });
    var main = U.el('div', { class: 'p-main' });
    root.appendChild(main);
    main.appendChild(secHead('订单全链路追踪', '采购单 / 销售订单 / 物流运单，一屏掌握履约进度'));

    var tab = 'ship';
    var curId = null;
    var detailBox = U.el('div');

    var segBox = U.el('div', { class: 'seg mb16' });
    [['ship', '物流运单'], ['po', '采购订单'], ['so', '销售订单']].forEach(function (t) {
      var b = U.el('button', { class: t[0] === tab ? 'on' : '', text: t[1] });
      b.addEventListener('click', function () {
        tab = t[0]; curId = null;
        U.$$('button', segBox).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        render();
      });
      segBox.appendChild(b);
    });
    main.appendChild(segBox);

    var box = U.el('div', { class: 'track-box' });
    main.appendChild(box);
    var listWrap = U.el('div', { class: 'card' });
    box.appendChild(listWrap);
    box.appendChild(detailBox);

    function items() {
      if (tab === 'ship') return Store.list('shipments');
      if (tab === 'po') return Store.list('purchases');
      return Store.list('sales');
    }
    function statusOf(x) {
      if (tab === 'ship') return Store.ENUMS.shipStatus[x.status];
      if (tab === 'po') return Store.ENUMS.poStatus[x.status];
      return Store.ENUMS.soStatus[x.status];
    }
    function titleOf(x) {
      return tab === 'ship' ? x.no : x.no + ' · ' + (tab === 'po' ? x.supplierName : x.customer);
    }
    function subOf(x) {
      if (tab === 'ship') return x.carrier + ' · ' + x.from + ' → ' + x.to;
      return (tab === 'po' ? x.supplierName : x.customer) + ' · ' + U.moneyY(x.amount) + ' · ' + x.createdAt;
    }

    function renderDetail() {
      detailBox.innerHTML = '';
      var x = curId ? Store.find(items() === Store.list('shipments') ? 'shipments' : (tab === 'po' ? 'purchases' : 'sales'), curId) : null;
      if (!x) {
        detailBox.appendChild(U.el('div', { class: 'card card-pad empty' }, [
          U.el('div', { class: 'ico', text: '◎' }),
          U.el('div', { text: '选择左侧单据查看详情' })
        ]));
        return;
      }
      var body = U.el('div', { class: 'col gap16' });

      if (tab === 'ship') {
        var nodes = x.nodes || [];
        body.appendChild(U.el('div', { class: 'card card-pad' }, [
          U.el('div', { class: 'row between mb12' }, [
            U.el('b', { text: x.no }),
            U.el('span', { class: 'badge ' + Store.ENUMS.shipStatus[x.status][1], text: Store.ENUMS.shipStatus[x.status][0] })
          ]),
          U.el('div', { class: 'dl mb12' }, [
            U.el('dt', { text: '承运商' }), U.el('dd', { text: x.carrier + ' · ' + x.driver }),
            U.el('dt', { text: '路线' }), U.el('dd', { text: x.from + ' → ' + x.to }),
            U.el('dt', { text: '关联单据' }), U.el('dd', { class: 'mono', text: x.refNo }),
            U.el('dt', { text: '重量/体积' }), U.el('dd', { text: x.weight + ' kg / ' + x.volume + ' m³' }),
            U.el('dt', { text: '预计到达' }), U.el('dd', { text: x.eta }),
            U.el('dt', { text: '运费' }), U.el('dd', { text: U.moneyY(x.cost) })
          ]),
          U.el('div', { class: 'bar mb12' }, U.el('i', { class: x.status === 'exception' ? 'bad' : (x.progress >= 100 ? 'ok' : ''), style: { width: x.progress + '%' } })),
          U.el('div', { class: 'timeline' }, nodes.map(function (n, i) {
            var isCur = !n.done && nodes[i - 1] && nodes[i - 1].done;
            return U.el('div', { class: 'node ' + (n.done ? 'done' : (isCur ? 'cur' : '')) }, [
              U.el('div', { class: 'bold t-sm', text: n.t }),
              U.el('div', { class: 't', text: n.at + (n.done ? ' · 已完成' : (isCur ? ' · 进行中' : ' · 待处理')) })
            ]);
          }))
        ]));
      } else {
        var isPO = tab === 'po';
        var steps = isPO ? ['draft', 'pending', 'approved', 'purchasing', 'shipped', 'received'] : ['pending', 'confirmed', 'picking', 'shipped', 'delivered'];
        var enu = isPO ? Store.ENUMS.poStatus : Store.ENUMS.soStatus;
        var curIdx = steps.indexOf(x.status);
        body.appendChild(U.el('div', { class: 'card card-pad' }, [
          U.el('div', { class: 'row between mb12' }, [
            U.el('b', { text: x.no }),
            U.el('span', { class: 'badge ' + enu[x.status][1], text: enu[x.status][0] })
          ]),
          U.el('div', { class: 'steps mb16 wrap', style: { flexWrap: 'wrap', rowGap: '8px' } }, steps.map(function (s, i) {
            var done = i < curIdx || x.status === 'received' || x.status === 'delivered';
            var isCur = i === curIdx && x.status !== 'received' && x.status !== 'delivered';
            return [
              U.el('div', { class: 's ' + (done ? 'done' : (isCur ? 'cur' : '')) }, [
                U.el('span', { class: 'cir', text: done ? '✓' : (i + 1) }),
                U.el('span', { text: enu[s][0] })
              ]),
              i < steps.length - 1 ? U.el('i', { class: 'line ' + (done ? 'done' : '') }) : null
            ];
          }).flat()),
          U.el('div', { class: 'dl' }, [
            U.el('dt', { text: isPO ? '供应商' : '客户' }), U.el('dd', { text: isPO ? x.supplierName : x.customer }),
            U.el('dt', { text: '金额' }), U.el('dd', { class: 'bold', text: U.moneyY(x.amount) }),
            U.el('dt', { text: '下单日期' }), U.el('dd', { text: x.createdAt }),
            U.el('dt', { text: isPO ? '预计到货' : '交付截止' }), U.el('dd', { text: isPO ? x.expectedAt : x.dueAt }),
            U.el('dt', { text: '收货仓库' }), U.el('dd', { text: Store.warehouseName(x.warehouseId) }),
            U.el('dt', { text: isPO ? '采购员' : '负责人' }), U.el('dd', { text: isPO ? x.buyer : x.owner })
          ])
        ]));
        body.appendChild(U.el('div', { class: 'card' }, [
          U.el('div', { class: 'card-head' }, U.el('h3', { text: '明细' })),
          U.el('div', { class: 'table-wrap' }, (function () {
            var tbl = U.el('table', { class: 'tbl tbl-mini' });
            tbl.innerHTML = '<thead><tr><th>物料</th><th class="num">数量</th><th class="num">单价</th><th class="num">小计</th></tr></thead>';
            var tb = U.el('tbody');
            (x.items || []).forEach(function (it) {
              tb.appendChild(U.el('tr', null, [
                U.el('td', { text: it.name }),
                U.el('td', { class: 'num', text: U.num(it.qty) }),
                U.el('td', { class: 'num', text: '¥' + it.price }),
                U.el('td', { class: 'num', text: U.moneyY(it.amount) })
              ]));
            });
            tbl.appendChild(tb);
            return tbl;
          })())
        ]));
      }
      detailBox.appendChild(body);
    }

    function render() {
      var arr = items();
      if (!curId && arr.length) curId = arr[0].id;
      listWrap.innerHTML = '';
      listWrap.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: ({ ship: '物流运单', po: '采购订单', so: '销售订单' })[tab] }), U.el('div', { class: 'sub', text: arr.length + ' 条记录' })]),
        U.el('span', { class: 'badge blue', text: '实时' })
      ]));
      var list = U.el('div', { class: 'track-list', style: { padding: '12px' } });
      U.sortBy(arr, function (x) { return x.createdAt || x.eta; }, 'desc').slice(0, 40).forEach(function (x) {
        var e = statusOf(x);
        var it = U.el('div', { class: 'track-item ' + (x.id === curId ? 'on' : '') }, [
          U.el('div', { class: 'row between' }, [
            U.el('b', { class: 't-sm ellipsis', text: titleOf(x) }),
            U.el('span', { class: 'badge ' + e[1], text: e[0] })
          ]),
          U.el('div', { class: 't-xs muted mt4', text: subOf(x) }),
          tab === 'ship' ? U.el('div', { class: 'bar thin mt8' }, U.el('i', { class: x.status === 'exception' ? 'bad' : (x.progress >= 100 ? 'ok' : ''), style: { width: x.progress + '%' } })) : null
        ]);
        it.addEventListener('click', function () { curId = x.id; render(); });
        list.appendChild(it);
      });
      listWrap.appendChild(list);
      renderDetail();
    }
    render();
    return root;
  };

  /* ================================================================
     5. 数据洞察大屏
     ================================================================ */
  P.pages.insight = function () {
    var root = U.el('div', { class: 'fade-in' });
    var main = U.el('div', { class: 'p-main' });
    root.appendChild(main);
    var st = Store.stats(), m = Store.db.monthly;

    main.appendChild(U.el('div', { class: 'insight-hero mb16' }, [
      U.el('div', { class: 'row between wrap', style: { position: 'relative' } }, [
        U.el('div', null, [
          U.el('h2', { style: { fontSize: '22px' }, text: '供应链经营洞察' }),
          U.el('div', { class: 't-sm', style: { color: 'rgba(255,255,255,.7)' }, text: '数据周期：近 12 个月 · 更新于 ' + U.nowStr() })
        ]),
        U.el('a', { class: 'btn sm', href: 'admin.html#/dashboard', style: { background: 'rgba(255,255,255,.16)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }, text: '进入后台看板 →' })
      ]),
      U.el('div', { class: 'g' }, [
        heroStat(U.money(st.poAmount), '在途采购额', ''),
        heroStat(U.money(st.soAmount), '销售订单额', ''),
        heroStat(U.pct(st.fulfillRate), '订单履约率', ''),
        heroStat(U.num(st.inTransit), '在途运单', ' 票')
      ])
    ]));

    /* 采购销售对比 + 库存与周转 */
    var r1 = U.el('div', { class: 'grid g2 mb16' });
    main.appendChild(r1);
    r1.appendChild(card('采购 vs 销售', '月度对比（万元）',
      Chart.bar({
        height: 250,
        labels: m.map(function (x) { return U.monthLabel(x.month); }),
        series: [
          { name: '采购额', values: m.map(function (x) { return x.purchase; }), color: '#2563eb' },
          { name: '销售额', values: m.map(function (x) { return x.sales; }), color: '#14b8a6' }
        ],
        yFmt: function (v) { return U.num(v); }
      })
    ));
    r1.appendChild(card('库存金额与周转率', '库存（万元）· 周转（次/年）',
      Chart.line({
        height: 250, area: false, min: 0,
        labels: m.map(function (x) { return U.monthLabel(x.month); }),
        series: [
          { name: '库存金额', values: m.map(function (x) { return x.inventory; }), color: '#f59e0b' },
          { name: '周转率', values: m.map(function (x) { return x.turnover; }), color: '#8b5cf6' }
        ],
        tipFmt: function (v) { return U.num(v); }
      })
    ));

    /* 供应商 TOP10 + 漏斗 */
    var r2 = U.el('div', { class: 'grid g2 mb16' });
    main.appendChild(r2);
    var rank = Store.supplierRank('amount', 10);
    r2.appendChild(card('供应商采购额 TOP10', '累计采购金额（万元）',
      Chart.bar({
        horizontal: true, height: 300,
        labels: rank.map(function (x) { return x.supplier.short; }),
        series: [{ name: '采购额', values: rank.map(function (x) { return U.round(x.amount / 10000, 1); }), color: '#2563eb' }],
        showValue: true, legend: false
      })
    ));

    var po = Store.list('purchases');
    var cnt = function (s) { return po.filter(function (p) { return p.status === s; }).length; };
    r2.appendChild(card('采购订单转化漏斗', '从下单到入库的全流程转化',
      Chart.funnel({
        height: 300, width: 480,
        data: [
          { name: '已下单', value: po.filter(function (p) { return p.status !== 'cancelled'; }).length },
          { name: '已审批', value: po.filter(function (p) { return ['approved', 'purchasing', 'shipped', 'received'].indexOf(p.status) >= 0; }).length },
          { name: '已发运', value: po.filter(function (p) { return ['shipped', 'received'].indexOf(p.status) >= 0; }).length },
          { name: '已入库', value: cnt('received') }
        ],
        fmt: function (v) { return v + ' 单'; }
      })
    ));

    /* 雷达 + 热力 */
    var r3 = U.el('div', { class: 'grid g2 mb16' });
    main.appendChild(r3);
    var top5 = Store.supplierRank('score', 5).map(function (x) { return x.supplier; });
    var inds = [
      { name: '准时交付', max: 100 }, { name: '质量合格', max: 100 },
      { name: '交期响应', max: 100 }, { name: '价格优势', max: 100 },
      { name: '产能规模', max: 100 }, { name: '协同配合', max: 100 }
    ];
    r3.appendChild(card('TOP5 供应商能力画像', '六维能力对比',
      Chart.radar({
        size: 300, indicators: inds,
        series: top5.map(function (s, i) {
          return {
            name: s.short,
            color: Chart.PALETTE[i],
            values: [
              s.onTimeRate, s.qualityRate,
              Math.max(0, 100 - s.leadTime * 2.5),
              Math.max(0, 200 - s.priceIndex * 1.1),
              Math.min(100, s.capacity / 400),
              Math.min(100, s.rating * 20)
            ]
          };
        })
      })
    ));

    /* 热力：区域 × 品类 采购额 */
    var regs = Seed.REGIONS.filter(function (rg) {
      return Store.list('suppliers').filter(function (s) { return s.region === rg; }).length;
    });
    var cats = Seed.CATS.slice(0, 6);
    var vals = regs.map(function (rg) {
      return cats.map(function (c) {
        var ss = Store.list('suppliers').filter(function (s) { return s.region === rg && s.category === c; });
        return U.round(U.sum(ss, function (s) { return s.totalAmount; }) / 10000, 0);
      });
    });
    r3.appendChild(card('区域 × 品类 供应密度', '累计采购额矩阵（万元）',
      Chart.heat({ rows: regs, cols: cats.map(function (c) { return c.slice(0, 2); }), values: vals })
    ));

    /* 物流 + 财务 */
    var r4 = U.el('div', { class: 'grid g3 mb16' });
    main.appendChild(r4);
    var ships = Store.list('shipments');
    var shipCnt = U.groupBy(ships, function (x) { return x.status; });
    r4.appendChild(card('物流状态分布', ships.length + ' 票运单',
      Chart.donut({
        data: Object.keys(Store.ENUMS.shipStatus).map(function (k, i) {
          return { name: Store.ENUMS.shipStatus[k][0], value: (shipCnt[k] || []).length, color: Chart.PALETTE[i + 1] };
        }).filter(function (x) { return x.value > 0; }),
        size: 170, center: { value: ships.length, label: '总运单' }
      })
    ));

    var invs = Store.list('invoices');
    r4.appendChild(card('应收应付结构', '待结算金额（万元）',
      Chart.donut({
        data: [
          { name: '应付账款', value: U.round(st.payable / 10000, 1), color: '#f59e0b' },
          { name: '应收账款', value: U.round(st.receivable / 10000, 1), color: '#2563eb' }
        ],
        size: 170, center: { value: U.money(st.payable + st.receivable), label: '待结算合计' }
      })
    ));

    var sv = Store.list('sales');
    var soCnt = U.groupBy(sv, function (x) { return x.status; });
    r4.appendChild(card('销售订单状态', sv.length + ' 张订单',
      Chart.donut({
        data: Object.keys(Store.ENUMS.soStatus).map(function (k, i) {
          return { name: Store.ENUMS.soStatus[k][0], value: (soCnt[k] || []).length, color: Chart.PALETTE[i] };
        }).filter(function (x) { return x.value > 0; }),
        size: 170, center: { value: sv.length, label: '订单总数' }
      })
    ));

    /* 退货率与运费 */
    main.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '质量与物流成本' }), U.el('div', { class: 'sub', text: '退货率（%）与运费支出（万元）月度走势' })])
      ]),
      U.el('div', { class: 'card-body' }, Chart.line({
        height: 240,
        labels: m.map(function (x) { return U.monthLabel(x.month); }),
        series: [
          { name: '运费', values: m.map(function (x) { return x.freight; }), color: '#0ea5e9' },
          { name: '退货率', values: m.map(function (x) { return x.returnRate; }), color: '#dc2626' }
        ],
        tipFmt: function (v) { return U.num(v); }
      }))
    ]));

    return root;
  };

  global.Portal = P;
})(window);
