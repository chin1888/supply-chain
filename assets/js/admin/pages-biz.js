/* ============================================================
   SCM · 后台经营：财务对账 / 报表分析 / 系统设置
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Chart = global.Chart, Store = global.Store, Seed = global.Seed, Analytics = global.Analytics;
  var A = global.Admin;
  var card = A.ui.card;

  /* ==============================================================
     7. 财务对账
     ============================================================== */
  A.pages.finance = function () {
    var root = U.el('div', { class: 'a-page' });
    root.appendChild(A.ui.readonlyTip());

    var invs = Store.list('invoices');
    var st = Store.stats();
    root.appendChild(U.el('div', {
      class: 't-sm muted mb12',
      text: '账单由采购单 / 销售订单自动生成，随业务单据实时更新；手工录入的账单可编辑删除。'
    }));
    var strip = U.el('div', { class: 'a-strip' });
    strip.appendChild(A.ui.kpi('应付账款', U.money(st.payable), '', null, null, 'k4'));
    strip.appendChild(A.ui.kpi('应收账款', U.money(st.receivable), '', null, null, ''));
    strip.appendChild(A.ui.kpi('逾期金额', U.money(st.overdueAmount), '', null, null, 'k5'));
    strip.appendChild(A.ui.kpi('逾期笔数', U.num(st.overdueCount), ' 笔', null, null, 'k2'));
    root.appendChild(strip);

    /* 图表 */
    var r1 = U.el('div', { class: 'a-grid3 mb16' });
    root.appendChild(r1);

    // 按月份聚合账单金额
    var months = U.lastMonths(6);
    var payArr = months.map(function (m) {
      return U.round(U.sum(invs.filter(function (x) {
        return x.type === 'payable' && U.monthKey(x.issuedAt) === m;
      }), function (x) { return x.amount; }) / 10000, 1);
    });
    var recArr = months.map(function (m) {
      return U.round(U.sum(invs.filter(function (x) {
        return x.type === 'receivable' && U.monthKey(x.issuedAt) === m;
      }), function (x) { return x.amount; }) / 10000, 1);
    });
    r1.appendChild(card('应收应付趋势', '近 6 个月（万元）',
      Chart.bar({
        height: 220,
        labels: months.map(function (m) { return U.monthLabel(m); }),
        series: [
          { name: '应付', values: payArr, color: '#f59e0b' },
          { name: '应收', values: recArr, color: '#2563eb' }
        ]
      })
    ));

    var stCnt = U.groupBy(invs, function (x) { return x.status; });
    r1.appendChild(card('账单结算状态', invs.length + ' 笔账单',
      Chart.donut({
        data: Object.keys(Store.ENUMS.invStatus).map(function (k, i) {
          return { name: Store.ENUMS.invStatus[k][0], value: (stCnt[k] || []).length, color: ['#16a34a', '#f59e0b', '#dc2626'][i] };
        }).filter(function (x) { return x.value > 0; }),
        size: 170, center: { value: invs.length, label: '账单总数' }
      })
    ));

    var byTerm = U.groupBy(invs, function (x) {
      var d = U.diffDays(x.issuedAt, x.dueAt);
      return d <= 30 ? '30天内' : d <= 60 ? '31-60天' : d <= 90 ? '61-90天' : '90天以上';
    });
    r1.appendChild(card('账期分布', '按账单期限（笔）',
      Chart.bar({
        horizontal: true, height: 200,
        labels: Object.keys(byTerm),
        series: [{ name: '笔数', values: Object.keys(byTerm).map(function (k) { return byTerm[k].length; }), color: '#8b5cf6' }],
        showValue: true, legend: false
      })
    ));

    /* 对账单列表 */
    var page = A.crudPage({
      store: 'invoices',
      title: '财务对账',
      keywordPlaceholder: '搜索票号 / 往来单位',
      searchKeys: ['no', 'counterparty', 'refNo'],
      sortBy: function (x) { return x.issuedAt; },
      filters: [
        { key: 'type', label: '全部类型', options: [['payable', '应付'], ['receivable', '应收']] },
        { key: 'status', label: '全部状态', options: Object.keys(Store.ENUMS.invStatus).map(function (k) { return [k, Store.ENUMS.invStatus[k][0]]; }) }
      ],
      actionWidth: '220px',
      canEditRow: function (r) { return !r.autoKey; },
      canDeleteRow: function (r) { return !r.autoKey; },
      columns: [
        { t: '票号', k: 'no', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.no }); } },
        { t: '来源', k: 'autoKey', fmt: function (r) { return U.el('span', { class: 'tag', text: r.autoKey ? '业务单据' : '手工录入' }); } },
        { t: '类型', k: 'type', fmt: function (r) { return U.el('span', { class: 'badge ' + (r.type === 'payable' ? 'amber' : 'blue'), text: r.type === 'payable' ? '应付' : '应收' }); } },
        { t: '往来单位', k: 'counterparty' },
        { t: '关联单号', k: 'refNo', fmt: function (r) { return U.el('span', { class: 'mono t-xs muted', text: r.refNo }); } },
        { t: '金额', k: 'amount', num: true, fmt: function (r) { return U.el('b', { text: U.moneyY(r.amount) }); } },
        { t: '税率', k: 'taxRate', num: true, fmt: function (r) { return r.taxRate + '%'; } },
        { t: '开票日期', k: 'issuedAt' },
        {
          t: '到期日', k: 'dueAt', fmt: function (r) {
            var over = r.status === 'overdue';
            return U.el('span', { class: over ? 'up' : '', text: r.dueAt + (over ? ' ⚠' : '') });
          }
        },
        { t: '结算方式', k: 'method' },
        { t: '状态', k: 'status', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.invStatus, r.status); } }
      ],
      rowActions: [
        {
          label: '结清', needEdit: true, show: function (r) { return r.status !== 'paid'; },
          fn: function (r, refresh) {
            U.confirm('确认结清账单「' + r.no + '」' + U.moneyY(r.amount) + '？', function () {
              Store.update('invoices', r.id, { status: 'paid', paidAt: U.today() });
              refresh(); U.toast('已标记为已结清', 'ok');
            }, '结算确认');
          }
        }
      ],
      fields: [
        { k: 'no', label: '票号', readonly: true },
        { k: 'type', label: '类型', type: 'select', options: [['payable', '应付'], ['receivable', '应收']] },
        { k: 'counterparty', label: '往来单位', required: true },
        { k: 'refNo', label: '关联单号' },
        { k: 'amount', label: '金额(元)', type: 'number' },
        { k: 'taxRate', label: '税率(%)', type: 'select', options: [['13', '13%'], ['9', '9%'], ['6', '6%'], ['3', '3%']] },
        { k: 'method', label: '结算方式', type: 'select', options: ['银行转账', '承兑汇票', '信用证', '电汇'] },
        { k: 'status', label: '状态', type: 'select', options: Object.keys(Store.ENUMS.invStatus).map(function (k) { return [k, Store.ENUMS.invStatus[k][0]]; }) },
        { k: 'issuedAt', label: '开票日期', type: 'date' },
        { k: 'dueAt', label: '到期日', type: 'date' }
      ],
      defaultRow: function () {
        return {
          no: 'FP' + U.randInt(20260001, 20269999), type: 'payable', counterparty: '',
          refNo: '-', amount: 0, taxRate: '13', method: '银行转账', status: 'pending',
          issuedAt: U.today(), dueAt: U.addDays(null, 30), paidAt: null
        };
      },
      onCreate: function (v) {
        v.amount = Number(v.amount) || 0;
        v.taxRate = Number(v.taxRate) || 13;
        v._manual = true;   /* 手工账单：不随业务单据重算 */
        return v;
      },
      onEdit: function (src, v) {
        if (v.amount !== '') v.amount = Number(v.amount);
        v.taxRate = Number(v.taxRate) || 13;
        if (v.status === 'paid' && !src.paidAt) v.paidAt = U.today();
        return v;
      }
    });
    root.appendChild(page);
    return root;
  };

  /* ==============================================================
     8. 报表分析
     ============================================================== */
  A.pages.reports = function () {
    var root = U.el('div', { class: 'a-page' });
    var m = Store.db.monthly;
    /* 支持 ?dim=supplier|category|region|stock 直接打开指定维度，便于分享与截图核对 */
    var dimParam = /[?&]dim=(trend|supplier|category|region|stock)/.exec(location.search);
    var cur = dimParam ? dimParam[1] : 'trend';

    /* 维度切换栏必须在图表上方：box 在 toolbar 之后追加，避免 IIFE 求值顺序导致位置颠倒 */
    var box = U.el('div', { class: 'mt16' });
    root._box = box;
    root.appendChild(U.el('div', { class: 'a-toolbar' }, [
      U.el('b', { text: '分析维度：' }),
      (function () {
        var seg = U.el('div', { class: 'seg' });
        var dims = [['trend', '经营趋势'], ['supplier', '供应商绩效'], ['category', '品类结构'], ['region', '区域分布'], ['stock', '库存健康']];
        dims.forEach(function (d) {
          var b = U.el('button', { class: d[0] === cur ? 'on' : '', text: d[1] });
          b.addEventListener('click', function () {
            cur = d[0];
            U.$$('button', seg).forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            render();
          });
          seg.appendChild(b);
        });
        return seg;
      }()),
      U.el('div', { class: 'grow' }),
      U.el('span', { class: 't-sm muted', text: '数据来自实际业务单据 · 近 12 个月' })
    ]));
    root.appendChild(box);

    function render() {
      var box = root._box;
      box.innerHTML = '';
      var g;

      if (cur === 'trend' || !cur) {
        g = U.el('div', { class: 'col gap16' });
        var r1 = U.el('div', { class: 'a-grid2' });
        r1.appendChild(card('采购 / 销售 / 库存', '三线图（万元）',
          Chart.line({
            height: 260,
            labels: m.map(function (x) { return U.monthLabel(x.month); }),
            series: [
              { name: '采购额', values: m.map(function (x) { return x.purchase; }), color: '#2563eb' },
              { name: '销售额', values: m.map(function (x) { return x.sales; }), color: '#14b8a6' },
              { name: '库存额', values: m.map(function (x) { return x.inventory; }), color: '#f59e0b' }
            ], tipFmt: function (v) { return U.wanText(v); }
          })
        ));
        r1.appendChild(card('毛利空间', '销售额 - 销售成本（万元）',
          Chart.bar({
            height: 260,
            labels: m.map(function (x) { return U.monthLabel(x.month); }),
            series: [{ name: '毛利', values: m.map(function (x) { return x.profit; }), color: '#16a34a' }],
            legend: false
          })
        ));
        g.appendChild(r1);
        var r2 = U.el('div', { class: 'a-grid2' });
        r2.appendChild(card('周转率与退货率', '库存周转（次/年）· 退货率（暂无退货记录）',
          Chart.line({
            height: 230, area: false, min: 0,
            labels: m.map(function (x) { return U.monthLabel(x.month); }),
            series: [
              { name: '周转率', values: m.map(function (x) { return x.turnover; }), color: '#8b5cf6' },
              { name: '退货率', values: m.map(function (x) { return x.returnRate; }), color: '#dc2626' }
            ]
          })
        ));
        r2.appendChild(card('运费成本', '物流支出（万元）',
          Chart.bar({
            height: 230,
            labels: m.map(function (x) { return U.monthLabel(x.month); }),
            series: [{ name: '运费', values: m.map(function (x) { return x.freight; }), color: '#0ea5e9' }],
            legend: false
          })
        ));
        g.appendChild(r2);
      } else if (cur === 'supplier') {
        var rank = Store.supplierRank('amount');
        /* 准时率改用该供应商已入库采购单的实际收货日期计算 */
        rank.forEach(function (x) {
          var ot = Analytics.supplierOnTime(x.supplier.id);
          x.onTimeRate = ot == null ? x.supplier.onTimeRate : ot;
        });
        g = U.el('div', { class: 'col gap16' });
        var rr = U.el('div', { class: 'a-grid2' });
        rr.appendChild(card('采购额 TOP15', '累计采购金额（万元）',
          Chart.bar({
            horizontal: true, height: 400,
            labels: rank.slice(0, 15).map(function (x) { return x.supplier.short; }),
            series: [{ name: '采购额', values: rank.slice(0, 15).map(function (x) { return U.round(x.amount / 10000, 1); }), color: '#2563eb' }],
            showValue: true, legend: false
          })
        ));
        var scatter = rank.map(function (x) {
          return { name: x.supplier.short, x: x.onTimeRate, y: x.supplier.qualityRate, r: Math.max(4, Math.min(16, Math.sqrt(x.amount / 10000) / 1.6)) };
        });
        rr.appendChild(card('准时率 × 合格率', '气泡大小代表采购额',
          bubbleChart(scatter, '准时率(%)', '合格率(%)')
        ));
        g.appendChild(rr);
        g.appendChild(U.el('div', { class: 'card' }, [
          U.el('div', { class: 'card-head' }, U.el('div', null, [
            U.el('h3', { text: '供应商绩效明细' }),
            U.el('div', { class: 'sub', text: '按累计采购金额排序，含交期与风险评分' })
          ])),
          U.el('div', { class: 'table-wrap' }, A.ui.table([
            { t: '排名', k: 'i', fmt: function (r, i) { return U.el('span', { class: 'bold', text: i + 1 }); } },
            { t: '供应商', k: 'name', fmt: function (r) { return U.el('b', { text: r.supplier.name }); } },
            { t: '等级', k: 'level', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.level, r.supplier.level); } },
            { t: '采购单', k: 'orders', num: true, fmt: function (r) { return r.orders; } },
            { t: '采购额(万)', k: 'amount', num: true, fmt: function (r) { return U.money(r.amount); } },
            { t: '准时率', k: 'onTime', num: true, fmt: function (r) { return r.onTimeRate + '%'; } },
            { t: '合格率', k: 'q', num: true, fmt: function (r) { return r.supplier.qualityRate + '%'; } },
            { t: '交期', k: 'lead', num: true, fmt: function (r) { return r.supplier.leadTime + ' 天'; } },
            { t: '评分', k: 'score', num: true, fmt: function (r) { return U.el('b', { text: r.score }); } }
          ], rank.slice(0, 20), {}))
        ]));
      } else if (cur === 'category') {
        var cd = U.sortBy(Store.db.categoryData, function (x) { return x.amount; }, 'desc');
        g = U.el('div', { class: 'col gap16' });
        var gc = U.el('div', { class: 'a-grid2' });
        gc.appendChild(card('品类采购金额', '（万元）',
          Chart.donut({
            data: cd.map(function (x, i) { return { name: x.category, value: x.amount, color: Chart.PALETTE[i % Chart.PALETTE.length] }; }),
            size: 200, legendVertical: true,
            center: { value: U.money(U.sum(cd, function (x) { return x.amount; })), label: '总额(万)' }
          })
        ));
        gc.appendChild(card('品类采购单数', '（单）',
          Chart.bar({
            horizontal: true, height: 260,
            labels: cd.map(function (x) { return x.category; }),
            series: [{ name: '单数', values: cd.map(function (x) { return x.count; }), color: '#14b8a6' }],
            showValue: true, legend: false
          })
        ));
        g.appendChild(gc);
        /* 库存金额取实际库存 × 成本价，毛利率取销售明细的真实售价与成本价 */
        var profitData = Analytics.categoryMargin();
        g.appendChild(card('品类库存与毛利', '库存金额（万元）· 实际毛利率（%）',
          Chart.bar({
            height: 240,
            labels: profitData.map(function (x) { return x.name; }),
            series: [
              { name: '库存金额', values: profitData.map(function (x) { return x.stock; }), color: '#f59e0b' },
              { name: '平均毛利', values: profitData.map(function (x) { return x.margin; }), color: '#16a34a' }
            ], maxLabels: 12
          })
        ));
      } else if (cur === 'region') {
        var rd = U.sortBy(Store.db.regionData, function (x) { return x.amount; }, 'desc');
        g = U.el('div', { class: 'col gap16' });
        var gr = U.el('div', { class: 'a-grid2' });
        gr.appendChild(card('区域采购额', '（万元）',
          Chart.bar({
            horizontal: true, height: 250,
            labels: rd.map(function (x) { return x.region; }),
            series: [{ name: '采购额', values: rd.map(function (x) { return x.amount; }), color: '#2563eb' }],
            showValue: true, legend: false
          })
        ));
        gr.appendChild(card('区域供应商数量', '（家）',
          Chart.donut({
            data: rd.map(function (x, i) { return { name: x.region, value: x.suppliers, color: Chart.PALETTE[i % Chart.PALETTE.length] }; }),
            size: 200, center: { value: Store.list('suppliers').length, label: '供应商总数' }
          })
        ));
        g.appendChild(gr);
        /* 矩阵按实际采购单：供应商所属区域 × 主营品类 聚合金额 */
        var mx = Analytics.regionCategoryMatrix();
        g.appendChild(card('区域 × 品类 供应密度', '按实际采购单聚合（万元）',
          Chart.heat({ rows: mx.rows, cols: mx.cols, values: mx.values })
        ));
      } else {
        g = U.el('div', { class: 'col gap16' });
        var low = Store.lowStock();
        var health = [
          { label: '健康（≥100%）', n: Store.list('products').length - low.length, c: '#16a34a' },
          { label: '预警（80-100%）', n: low.filter(function (x) { return x.level >= 80; }).length, c: '#f59e0b' },
          { label: '紧张（50-80%）', n: low.filter(function (x) { return x.level >= 50 && x.level < 80; }).length, c: '#f97316' },
          { label: '告急（<50%）', n: low.filter(function (x) { return x.level < 50; }).length, c: '#dc2626' }
        ];
        var gs = U.el('div', { class: 'a-grid2' });
        gs.appendChild(card('库存健康度分布', '按物料数量统计',
          Chart.donut({
            data: health.map(function (h) { return { name: h.label, value: h.n, color: h.c }; }).filter(function (x) { return x.value > 0; }),
            size: 200, center: { value: Store.list('products').length, label: '物料总数' }
          })
        ));
        gs.appendChild(card('仓库库容利用率', '（%）',
          Chart.bar({
            horizontal: true, height: 220, max: 100,
            labels: Store.list('warehouses').map(function (w) { return w.name; }),
            series: [{ name: '利用率', values: Store.whUsage().map(function (x) { return x.rate; }), color: '#8b5cf6' }],
            showValue: true, legend: false, yFmt: function (v) { return v + '%'; }
          })
        ));
        g.appendChild(gs);
        g.appendChild(U.el('div', { class: 'card' }, [
          U.el('div', { class: 'card-head' }, U.el('div', null, [
            U.el('h3', { text: '库存水位明细' }),
            U.el('div', { class: 'sub', text: '可用库存 / 安全库存比值，越低越紧急' })
          ])),
          U.el('div', { class: 'table-wrap' }, A.ui.table([
            { t: '物料', k: 'name', fmt: function (r) { return U.el('b', { text: r.product.name }); } },
            { t: '分类', k: 'category', fmt: function (r) { return U.el('span', { class: 'tag', text: r.product.category }); } },
            { t: '可用', k: 'a', num: true, fmt: function (r) { return U.num(r.stock.available); } },
            { t: '锁定', k: 'l', num: true, fmt: function (r) { return U.num(r.stock.locked); } },
            { t: '安全库存', k: 's', num: true, fmt: function (r) { return U.num(r.product.safetyStock); } },
            { t: '库存金额', k: 'v', num: true, fmt: function (r) { return U.moneyY(r.stock.qty * r.product.unitPrice); } },
            {
              t: '水位', k: 'level', width: '200px', fmt: function (r) {
                return U.el('div', { class: 'row gap8' }, [
                  U.el('div', { class: 'bar grow' }, U.el('i', { class: r.level < 50 ? 'bad' : (r.level < 100 ? 'warn' : 'ok'), style: { width: Math.min(100, r.level) + '%' } })),
                  U.el('span', { class: 't-xs', style: { width: '40px' }, text: r.level + '%' })
                ]);
              }
            }
          ], low, { emptyText: '全部物料库存充足' }))
        ]));
      }
      box.appendChild(g);
    }
    render();
    return root;
  };

  /** 简易气泡图 */
  function bubbleChart(data, xLabel, yLabel) {
    var W = 520, H = 300, pad = { t: 14, r: 16, b: 34, l: 44 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var xs = data.map(function (d) { return d.x; }), ys = data.map(function (d) { return d.y; });
    var x0 = Math.floor(Math.min.apply(null, xs) - 2), x1 = Math.ceil(Math.max.apply(null, xs) + 2);
    var y0 = Math.floor(Math.min.apply(null, ys) - 2), y1 = Math.ceil(Math.max.apply(null, ys) + 2);
    var X = function (v) { return pad.l + (v - x0) / (x1 - x0) * iw; };
    var Y = function (v) { return pad.t + ih - (v - y0) / (y1 - y0) * ih; };
    var nodes = [];
    for (var i = 0; i <= 4; i++) {
      var gy = pad.t + ih * i / 4;
      nodes.push(U.s('line', { x1: pad.l, y1: gy, x2: W - pad.r, y2: gy, class: 'grid-line', 'stroke-dasharray': '3 3' }));
      nodes.push(U.s('text', { x: pad.l - 6, y: gy + 4, 'text-anchor': 'end', class: 'axis-txt', text: U.round(y1 - (y1 - y0) * i / 4, 0) }));
    }
    for (var j = 0; j <= 4; j++) {
      var gx = pad.l + iw * j / 4;
      nodes.push(U.s('text', { x: gx, y: H - 12, 'text-anchor': 'middle', class: 'axis-txt', text: U.round(x0 + (x1 - x0) * j / 4, 0) }));
    }
    nodes.push(U.s('text', { x: pad.l + iw / 2, y: H - 1, 'text-anchor': 'middle', class: 'axis-txt', text: xLabel }));
    nodes.push(U.s('text', { x: 12, y: pad.t + ih / 2, 'text-anchor': 'middle', class: 'axis-txt', transform: 'rotate(-90 12 ' + (pad.t + ih / 2) + ')', text: yLabel }));
    data.forEach(function (d, i) {
      var c = Chart.PALETTE[i % Chart.PALETTE.length];
      var g = U.s('circle', { cx: X(d.x), cy: Y(d.y), r: d.r, fill: c, 'fill-opacity': .55, stroke: c, 'stroke-width': 1.5 });
      nodes.push(g);
      /* 只标注采购额 TOP6，其余靠悬停提示，避免 20+ 个气泡标签互相压叠 */
      if (i < 6) nodes.push(U.s('text', {
        x: X(d.x), y: Y(d.y) - d.r - 3, 'text-anchor': 'middle', class: 'axis-txt', text: d.name,
        style: 'paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round'
      }));
    });
    var box = U.el('div', { class: 'chart', style: { position: 'relative' } });
    box.appendChild(U.svg(W, H, nodes));
    var tip = U.el('div', { class: 'chart-tip', style: { opacity: '0' } });
    box.appendChild(tip);
    box.querySelectorAll('circle').forEach(function (c, i) {
      var d = data[i];
      if (!d) return;
      c.addEventListener('mousemove', function (e) {
        var r = box.getBoundingClientRect();
        tip.innerHTML = '<b>' + d.name + '</b><br>' + xLabel + '：' + d.x + '<br>' + yLabel + '：' + d.y;
        tip.style.opacity = '1';
        tip.style.left = (e.clientX - r.left) + 'px';
        tip.style.top = (e.clientY - r.top - 8) + 'px';
      });
      c.addEventListener('mouseleave', function () { tip.style.opacity = '0'; });
    });
    return box;
  }

  /* ==============================================================
     9. 系统设置
     ============================================================== */
  A.pages.settings = function () {
    var root = U.el('div', { class: 'a-page' });
    var sess = Store.session();
    var isAdmin = sess.role === 'admin';

    if (!isAdmin) {
      root.appendChild(U.el('div', { class: 'readonly-tip' }, [
        U.el('b', { text: '权限受限：' }),
        U.el('span', { text: '仅超级管理员可修改系统配置与用户权限，当前角色为「' + Store.roleLabel(sess.role) + '」。' })
      ]));
    }

    /* 系统信息 */
    root.appendChild(U.el('div', { class: 'card mb16' }, [
      U.el('div', { class: 'card-head' }, U.el('h3', { text: '系统信息' })),
      U.el('div', { class: 'card-body' }, U.el('div', { class: 'dl', style: { gridTemplateColumns: '120px 1fr' } }, [
        U.el('dt', { text: '系统名称' }), U.el('dd', { text: '智联供应链管理系统（SCM）' }),
        U.el('dt', { text: '版本' }), U.el('dd', { text: 'v' + Store.db.meta.version }),
        U.el('dt', { text: '所属公司' }), U.el('dd', { text: Store.db.meta.company }),
        U.el('dt', { text: '数据初始化' }), U.el('dd', { text: Store.db.meta.generatedAt }),
        U.el('dt', { text: '数据存储' }), U.el('dd', { text: '浏览器本地存储（localStorage），无需后端即可运行' }),
        U.el('dt', { text: '记录数' }), U.el('dd', { text: '供应商 ' + Store.list('suppliers').length + ' · 物料 ' + Store.list('products').length + ' · 采购单 ' + Store.list('purchases').length + ' · 订单 ' + Store.list('sales').length + ' · 运单 ' + Store.list('shipments').length + ' · 账单 ' + Store.list('invoices').length })
      ]))
    ]));

    /* 角色权限矩阵 */
    root.appendChild(U.el('div', { class: 'card mb16' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [
          U.el('h3', { text: '角色与权限' }),
          U.el('div', { class: 'sub', text: '超级管理员拥有全部权限；只读访客仅可查看' })
        ]),
        U.el('div', { class: 't-sm muted', text: '当前身份：' + Store.roleLabel(sess.role) })
      ]),
      U.el('div', { class: 'table-wrap' }, (function () {
        var roles = Store.ROLES;
        var acts = [['view', '查看数据'], ['create', '新增'], ['edit', '编辑'], ['approve', '审批'], ['admin', '系统配置']];
        var tbl = U.el('table', { class: 'tbl' });
        var th = U.el('tr');
        th.appendChild(U.el('th', { text: '权限项' }));
        Object.keys(roles).forEach(function (r) { th.appendChild(U.el('th', { class: 'tc', text: roles[r].label })); });
        tbl.appendChild(U.el('thead', null, th));
        var tb = U.el('tbody');
        acts.forEach(function (a) {
          var tr = U.el('tr');
          tr.appendChild(U.el('td', { class: 'bold', text: a[1] }));
          Object.keys(roles).forEach(function (r) {
            var ok = roles[r].can.indexOf('*') >= 0 || roles[r].can.indexOf(a[0]) >= 0;
            tr.appendChild(U.el('td', { class: 'tc' }, ok
              ? U.el('span', { class: 'badge green', text: '✓ 允许' })
              : U.el('span', { class: 'badge gray', text: '✕ 禁止' })));
          });
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        return tbl;
      }()))
    ]));

    /* 用户管理 */
    var userCard = U.el('div', { class: 'card mb16' });
    root.appendChild(userCard);
    function renderUsers() {
      userCard.innerHTML = '';
      userCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '用户管理' }), U.el('div', { class: 'sub', text: Store.list('users').length + ' 个账号' })]),
        isAdmin ? U.el('button', {
          class: 'btn primary sm', text: '+ 新增用户', onclick: function () { openUserForm(null, renderUsers); }
        }) : null
      ]));
      userCard.appendChild(U.el('div', { class: 'table-wrap' }, A.ui.table([
        {
          t: '用户', k: 'name', fmt: function (r) {
            return U.el('div', { class: 'row gap8' }, [
              U.el('div', { class: 'a-avatar', style: { width: '26px', height: '26px', fontSize: '11px' }, text: r.name.slice(0, 1) }),
              U.el('div', null, [
                U.el('div', { class: 'bold', text: r.name }),
                U.el('div', { class: 't-xs muted', text: r.account })
              ])
            ]);
          }
        },
        { t: '角色', k: 'role', fmt: function (r) { return U.el('span', { class: 'badge ' + Store.roleColor(r.role), text: Store.roleLabel(r.role) }); } },
        { t: '部门', k: 'dept' },
        { t: '手机', k: 'phone' },
        { t: '邮箱', k: 'email' },
        { t: '最后登录', k: 'lastLogin', fmt: function (r) { return U.el('span', { class: 't-sm', text: r.lastLogin }); } },
        { t: '状态', k: 'status', fmt: function (r) { return U.el('span', { class: 'badge ' + (r.status === 'active' ? 'green' : 'gray'), text: r.status === 'active' ? '启用' : '停用' }); } },
        {
          t: '操作', k: 'op', width: '180px', fmt: function (r) {
            var box = U.el('div', { class: 'row gap6' });
            box.appendChild(U.el('button', { class: 'btn sm', text: '以此身份登录', onclick: function () {
              Store.setSession({ userId: r.id, role: r.role, name: r.name, dept: r.dept });
              U.toast('已切换为「' + r.name + ' · ' + Store.roleLabel(r.role) + '」', 'ok');
              setTimeout(function () { global.Admin && global.Admin.reload && global.Admin.reload(); }, 400);
            } }));
            if (isAdmin) {
              box.appendChild(U.el('button', { class: 'btn sm', text: '编辑', onclick: function () { openUserForm(r, renderUsers); } }));
              if (r.id !== 'U1') {
                box.appendChild(U.el('button', { class: 'btn sm danger', text: '删除', onclick: function () {
                  U.confirm('确定删除用户「' + r.name + '」？', function () {
                    Store.remove('users', r.id); renderUsers(); U.toast('已删除', 'ok');
                  });
                } }));
              }
            }
            return box;
          }
        }
      ], Store.list('users'), {})));
    }
    renderUsers();

    function openUserForm(item, cb) {
      var isNew = !item;
      var src = item || { role: 'operator', dept: '采购部', status: 'active' };
      var body = U.el('div', { class: 'grid g2', style: { gap: '14px' } }, [
        U.field('姓名', U.input('name', src.name, '请输入姓名')),
        U.field('登录账号', U.input('account', src.account, '如 zhangwei')),
        U.field('角色', U.select('role', Object.keys(Store.ROLES).map(function (r) { return [r, Store.ROLES[r].label]; }), src.role)),
        U.field('所属部门', U.select('dept', Seed.DEPTS, src.dept)),
        U.field('手机号', U.input('phone', src.phone)),
        U.field('邮箱', U.input('email', src.email)),
        U.field('状态', U.select('status', [['active', '启用'], ['disabled', '停用']], src.status))
      ]);
      U.modal({
        title: (isNew ? '新增' : '编辑') + '用户', body: body,
        onOk: function (b) {
          var v = U.readForm(b);
          if (!v.name || !v.account) { U.toast('姓名与账号必填', 'err'); return false; }
          if (isNew) {
            v.id = U.uid('U'); v.createdAt = U.today(); v.lastLogin = '-';
            Store.add('users', v);
          } else Store.update('users', item.id, v);
          U.toast('保存成功', 'ok');
          cb && cb();
        }
      });
    }

    /* 系统配置开关 */
    var opts = [
      ['库存预警自动提醒', '可用库存低于安全库存时自动提醒', true],
      ['采购单自动审批', '金额低于 5 万元的采购单免审批直接通过', false],
      ['运单异常实时告警', '运输中断或超时未更新时推送告警', true],
      ['账单到期提醒', '账单到期前 7 天提醒财务处理', true],
      ['数据看板自动刷新', '每 5 分钟自动刷新看板数据', false]
    ];
    root.appendChild(U.el('div', { class: 'card mb16' }, [
      U.el('div', { class: 'card-head' }, U.el('h3', { text: '业务规则配置' })),
      U.el('div', { class: 'card-body' }, opts.map(function (o) {
        var sw = U.el('span', { class: 'switch' }, [
          U.el('input', { type: 'checkbox', checked: o[2] ? true : null, onchange: function (e) { U.toast(o[0] + '已' + (e.target.checked ? '开启' : '关闭'), 'ok'); } }),
          U.el('span', { class: 'slider' })
        ]);
        return U.el('div', { class: 'set-row' }, [
          U.el('div', null, [U.el('div', { class: 't', text: o[0] }), U.el('div', { class: 'd', text: o[1] })]),
          sw
        ]);
      }))
    ]));

    /* 数据管理 */
    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '数据管理' }), U.el('div', { class: 'sub', text: '演示数据维护与备份' })]),
        isAdmin ? U.el('div', { class: 'row gap8' }, [
          U.el('button', { class: 'btn', text: '导出全量 JSON', onclick: function () {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(Store.db, null, 2)], { type: 'application/json' }));
            a.download = 'scm_backup_' + U.today() + '.json';
            a.click();
            U.toast('已导出备份文件', 'ok');
          } }),
          U.el('button', { class: 'btn danger', text: '重置为示例数据', onclick: function () {
            U.confirm('将清空当前所有改动并恢复初始示例数据，确定继续？', function () {
              Store.reset();
              setTimeout(function () { location.reload(); }, 600);
            }, '重置确认');
          } })
        ]) : null
      ]),
      U.el('div', { class: 'card-body' }, U.el('div', { class: 't-sm muted', text: '所有数据保存在浏览器本地，清除浏览器缓存会导致数据丢失。建议定期导出 JSON 备份。' }))
    ]));

    return root;
  };

})(window);
