/* ============================================================
   SCM · 后台运营：库存仓储 / 销售订单 / 物流运输
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Chart = global.Chart, Store = global.Store, Seed = global.Seed;
  var A = global.Admin;
  var card = A.ui.card;

  /* ==============================================================
     4. 库存仓储
     ============================================================== */
  A.pages.inventory = function () {
    var root = U.el('div', { class: 'a-page' });
    root.appendChild(A.ui.readonlyTip());

    var st = Store.stats();
    var low = Store.lowStock();
    var strip = U.el('div', { class: 'a-strip' });
    strip.appendChild(A.ui.kpi('库存总值', U.money(st.stockValue), '', null, null, ''));
    strip.appendChild(A.ui.kpi('在管物料', U.num(Store.list('products').length), ' 种', null, null, 'k2'));
    strip.appendChild(A.ui.kpi('低库存预警', U.num(low.length), ' 项', null, null, 'k4'));
    strip.appendChild(A.ui.kpi('平均库容利用率', U.pct(U.avg(Store.whUsage(), function (x) { return x.rate; })), '', null, null, 'k5'));
    root.appendChild(strip);

    /* 仓库卡片 */
    root.appendChild(U.el('div', { class: 'row between mb8' }, [
      U.el('div', { class: 't-sm muted', text: '仓库库容概览 · 共 ' + Store.list('warehouses').length + ' 座仓库' }),
      U.el('div', { class: 'row gap8' }, [
        U.el('button', {
          class: 'btn sm ghost', text: '产品管理 →',
          onclick: function () { location.hash = '#/products'; }
        }),
        U.el('button', {
          class: 'btn sm ghost', text: '仓库管理 →',
          onclick: function () { location.hash = '#/warehouses'; }
        })
      ])
    ]));
    var whRow = U.el('div', { class: 'grid g3 mb16' });
    Store.whUsage().forEach(function (x) {
      var w = x.warehouse;
      var cls = x.rate > 90 ? 'bad' : x.rate > 75 ? 'warn' : 'ok';
      whRow.appendChild(U.el('div', { class: 'card card-pad' }, [
        U.el('div', { class: 'row between' }, [
          U.el('b', { text: w.name }),
          U.el('span', { class: 'badge ' + (x.rate > 90 ? 'red' : x.rate > 75 ? 'amber' : 'green'), text: x.rate + '%' })
        ]),
        U.el('div', { class: 't-xs muted mt4', text: w.city + ' · ' + w.manager + ' · ' + w.temperature }),
        U.el('div', { class: 'bar mt12' }, U.el('i', { class: cls, style: { width: Math.min(100, x.rate) + '%' } })),
        U.el('div', { class: 'row between t-xs muted mt8' }, [
          U.el('span', { text: '已用 ' + U.num(w.used) }),
          U.el('span', { text: '容量 ' + U.num(w.capacity) })
        ])
      ]));
    });
    root.appendChild(whRow);

    /* 图表行 */
    var r1 = U.el('div', { class: 'a-grid2 mb16' });
    root.appendChild(r1);
    var byCat = U.groupBy(Store.list('products'), function (p) { return p.category; });
    var catStock = Object.keys(byCat).map(function (c, i) {
      return {
        name: c,
        value: U.round(U.sum(byCat[c], function (p) { return Store.stockOf(p.id).qty * p.unitPrice; }) / 10000, 1),
        color: Chart.PALETTE[i % Chart.PALETTE.length]
      };
    }).filter(function (x) { return x.value > 0; });
    r1.appendChild(card('分类库存价值', '库存金额分布（万元）',
      Chart.donut({
        data: U.sortBy(catStock, function (x) { return x.value; }, 'desc'), size: 180,
        center: { value: U.money(st.stockValue), label: '库存总值' }
      })
    ));
    r1.appendChild(card('仓库可用容量', '剩余可容纳量（单位）',
      Chart.bar({
        horizontal: true, height: 200,
        labels: Store.list('warehouses').map(function (w) { return w.name.replace('中心仓', ''); }),
        series: [{ name: '剩余容量', values: Store.list('warehouses').map(function (w) { return w.capacity - w.used; }), color: '#14b8a6' }],
        showValue: true, legend: false
      })
    ));

    /* 库存明细 */
    var page = A.crudPage({
      store: 'inventory',
      title: '库存明细',
      keywordPlaceholder: '搜索物料 / 批次',
      searchKeys: ['batchNo'],
      size: 12,
      filters: [
        { key: 'warehouseId', label: '全部仓库', options: Store.list('warehouses').map(function (w) { return [w.id, w.name]; }) }
      ],
      columns: [
        { t: '物料', k: 'productId', fmt: function (r) { return U.el('b', { text: Store.productName(r.productId) }); } },
        { t: 'SKU', k: 'sku', fmt: function (r) { var p = Store.product(r.productId); return U.el('span', { class: 'mono t-xs muted', text: p ? p.sku : '-' }); } },
        { t: '仓库', k: 'warehouseId', fmt: function (r) { return Store.warehouseName(r.warehouseId); } },
        { t: '批次号', k: 'batchNo', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.batchNo }); } },
        { t: '库存量', k: 'qty', num: true, fmt: function (r) { return U.num(r.qty); } },
        { t: '锁定', k: 'locked', num: true, fmt: function (r) { return U.el('span', { class: 'muted', text: U.num(r.locked) }); } },
        {
          t: '可用', k: 'available', num: true, fmt: function (r) {
            return U.el('b', { class: r.available <= 0 ? 'up' : '', text: U.num(r.available) });
          }
        },
        {
          t: '库存金额', k: 'value', num: true, fmt: function (r) {
            var p = Store.product(r.productId);
            return U.moneyY(p ? p.unitPrice * r.qty : 0);
          }
        },
        { t: '入库日期', k: 'inboundAt' }
      ],
      rowActions: [
        {
          label: '盘点', needEdit: true, fn: function (r, refresh) {
            var p = Store.product(r.productId);
            var inp = U.el('input', { class: 'input', type: 'number', value: r.qty });
            U.modal({
              title: '库存盘点 · ' + (p ? p.name : ''),
              body: U.el('div', { class: 'col gap12' }, [
                U.el('div', { class: 't-sm muted', text: '当前系统库存 ' + U.num(r.qty) + '，锁定 ' + U.num(r.locked) + '，可用 ' + U.num(r.available) }),
                U.el('div', { class: 'field' }, [U.el('label', { text: '实际盘点数量' }), inp])
              ]),
              okText: '保存盘点',
              onOk: function () {
                var v = Number(inp.value);
                if (isNaN(v) || v < 0) { U.toast('请输入有效数量', 'err'); return false; }
                Store.update('inventory', r.id, { qty: v, available: Math.max(0, v - r.locked) });
                refresh(); U.toast('盘点已保存', 'ok');
              }
            });
          }
        }
      ],
      fields: [
        { k: 'productId', label: '物料', type: 'select', options: Store.list('products').map(function (p) { return [p.id, p.name]; }) },
        { k: 'warehouseId', label: '仓库', type: 'select', options: Store.list('warehouses').map(function (w) { return [w.id, w.name]; }) },
        { k: 'qty', label: '库存量', type: 'number' },
        { k: 'locked', label: '锁定量', type: 'number' },
        { k: 'batchNo', label: '批次号' },
        { k: 'inboundAt', label: '入库日期', type: 'date' }
      ],
      defaultRow: function () {
        return {
          productId: Store.list('products')[0].id, warehouseId: Store.firstWarehouseId(),
          qty: 0, locked: 0, available: 0, batchNo: 'B' + U.randInt(202601, 202612) + '01', inboundAt: U.today()
        };
      },
      onCreate: function (v) {
        v.qty = Number(v.qty) || 0; v.locked = Number(v.locked) || 0;
        v.available = Math.max(0, v.qty - v.locked);
        return v;
      },
      onEdit: function (src, v) {
        v.qty = Number(v.qty) || 0; v.locked = Number(v.locked) || 0;
        v.available = Math.max(0, v.qty - v.locked);
        return v;
      }
    });
    root.appendChild(page);
    return root;
  };

  /* ==============================================================
     5. 销售订单
     ============================================================== */
  A.pages.orders = function () {
    var sos = Store.list('sales');
    var strip = function () {
      var s = U.el('div');
      var act = sos.filter(function (x) { return x.status !== 'cancelled'; });
      s.appendChild(A.ui.kpi('订单总数', act.length, ' 单', null, null, ''));
      s.appendChild(A.ui.kpi('订单金额', U.money(U.sum(act, function (x) { return x.amount; })), '', null, null, 'k2'));
      s.appendChild(A.ui.kpi('已交付', act.filter(function (x) { return x.status === 'delivered'; }).length, ' 单', null, null, 'k3'));
      s.appendChild(A.ui.kpi('高优先级', act.filter(function (x) { return x.priority === 'high'; }).length, ' 单', null, null, 'k4'));
      return [s.firstChild, s.children[1], s.children[2], s.children[3]];
    };

    var page = A.crudPage({
      store: 'sales',
      title: '销售订单',
      keywordPlaceholder: '搜索单号 / 客户',
      searchKeys: ['no', 'customer', 'owner'],
      sortBy: function (x) { return x.createdAt; },
      filters: [
        { key: 'status', label: '全部状态', options: Object.keys(Store.ENUMS.soStatus).map(function (k) { return [k, Store.ENUMS.soStatus[k][0]]; }) },
        { key: 'priority', label: '全部优先级', options: [['high', '高'], ['medium', '中'], ['low', '低']] },
        { key: 'channel', label: '全部渠道', options: ['直销', '经销', '电商平台', '海外'] }
      ],
      strip: strip,
      actionWidth: '200px',
      columns: [
        { t: '单号', k: 'no', fmt: function (r) { return U.el('span', { class: 'mono t-sm', text: r.no }); } },
        {
          t: '客户', k: 'customer', fmt: function (r) {
            return U.el('div', null, [
              U.el('div', { class: 'bold', text: r.customer }),
              U.el('div', { class: 't-xs muted', text: r.channel + ' · ' + r.items.length + ' 项' })
            ]);
          }
        },
        { t: '金额', k: 'amount', num: true, fmt: function (r) { return U.el('b', { text: U.moneyY(r.amount) }); } },
        { t: '优先级', k: 'priority', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.priority, r.priority); } },
        { t: '下单日期', k: 'createdAt' },
        {
          t: '交付截止', k: 'dueAt', fmt: function (r) {
            var late = r.status !== 'delivered' && r.status !== 'cancelled' && new Date(r.dueAt) < new Date();
            return U.el('span', { class: late ? 'up' : '', text: r.dueAt + (late ? ' ⚠' : '') });
          }
        },
        { t: '发货仓', k: 'warehouseId', fmt: function (r) { return Store.warehouseName(r.warehouseId); } },
        { t: '负责人', k: 'owner' },
        { t: '状态', k: 'status', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.soStatus, r.status); } }
      ],
      rowActions: [
        { label: '明细', fn: function (r) { openDetail(r); } },
        {
          label: '推进', needEdit: true, show: function (r) { return ['pending', 'confirmed', 'picking', 'shipped'].indexOf(r.status) >= 0; },
          fn: function (r, refresh) {
            var next = { pending: 'confirmed', confirmed: 'picking', picking: 'shipped', shipped: 'delivered' };
            var nx = next[r.status];
            U.confirm('将订单「' + r.no + '」推进到「' + Store.ENUMS.soStatus[nx][0] + '」？', function () {
              var patch = { status: nx };
              if (nx === 'delivered') patch.deliveredAt = U.today();
              Store.update('sales', r.id, patch);
              refresh(); U.toast('已更新为 ' + Store.ENUMS.soStatus[nx][0], 'ok');
            }, '订单推进');
          }
        }
      ],
      fields: [
        { k: 'no', label: '订单号', readonly: true },
        { k: 'customer', label: '客户名称', required: true },
        { k: 'channel', label: '渠道', type: 'select', options: ['直销', '经销', '电商平台', '海外'] },
        { k: 'priority', label: '优先级', type: 'select', options: [['high', '高'], ['medium', '中'], ['low', '低']] },
        { k: 'warehouseId', label: '发货仓库', type: 'select', options: Store.list('warehouses').map(function (w) { return [w.id, w.name]; }) },
        { k: 'owner', label: '负责人' },
        { k: 'status', label: '状态', type: 'select', options: Object.keys(Store.ENUMS.soStatus).map(function (k) { return [k, Store.ENUMS.soStatus[k][0]]; }) },
        { k: 'createdAt', label: '下单日期', type: 'date' },
        { k: 'dueAt', label: '交付截止', type: 'date' },
        { k: 'amount', label: '金额(元)', type: 'number' },
        { k: 'remark', label: '备注', type: 'textarea', full: true }
      ],
      defaultRow: function () {
        return {
          no: Store.nextNo('SO', 'sales'), status: 'pending', priority: 'medium', channel: '直销',
          createdAt: U.today(), dueAt: U.addDays(null, 15), amount: 0, items: [],
          warehouseId: Store.firstWarehouseId(), owner: '张伟', customer: ''
        };
      },
      onCreate: function (v) {
        v.amount = Number(v.amount) || 0;
        v.items = v.items && v.items.length ? v.items : [];
        v.deliveredAt = null;
        return v;
      },
      onEdit: function (src, v) {
        if (v.amount !== '') v.amount = Number(v.amount);
        if (v.status === 'delivered' && !src.deliveredAt) v.deliveredAt = U.today();
        return v;
      },
      onRowClick: function (r) { openDetail(r); }
    });

    function openDetail(r) {
      var body = U.el('div', { class: 'col gap16' });
      var steps = ['pending', 'confirmed', 'picking', 'shipped', 'delivered'];
      var curIdx = steps.indexOf(r.status);
      body.append(
        U.el('div', { class: 'steps', style: { flexWrap: 'wrap', rowGap: '8px' } }, steps.map(function (s, i) {
          var done = i < curIdx || r.status === 'delivered';
          return [
            U.el('div', { class: 's ' + (done ? 'done' : (i === curIdx ? 'cur' : '')) }, [
              U.el('span', { class: 'cir', text: done ? '✓' : (i + 1) }),
              U.el('span', { text: Store.ENUMS.soStatus[s][0] })
            ]),
            i < steps.length - 1 ? U.el('i', { class: 'line ' + (done ? 'done' : '') }) : null
          ];
        }).flat()),
        U.el('div', { class: 'dl mt12' }, [
          U.el('dt', { text: '订单号' }), U.el('dd', { class: 'mono', text: r.no }),
          U.el('dt', { text: '客户' }), U.el('dd', { text: r.customer + ' · ' + r.channel }),
          U.el('dt', { text: '金额' }), U.el('dd', { class: 'bold', text: U.moneyY(r.amount) }),
          U.el('dt', { text: '优先级' }), U.el('dd', null, A.ui.badgeEnum(Store.ENUMS.priority, r.priority)),
          U.el('dt', { text: '下单 / 截止' }), U.el('dd', { text: r.createdAt + ' → ' + r.dueAt }),
          U.el('dt', { text: '发货仓' }), U.el('dd', { text: Store.warehouseName(r.warehouseId) })
        ]),
        A.ui.table([
          { t: '物料', k: 'name' },
          { t: '数量', k: 'qty', num: true, fmt: function (x) { return U.num(x.qty); } },
          { t: '单价', k: 'price', num: true, fmt: function (x) { return '¥' + x.price; } },
          { t: '小计', k: 'amount', num: true, fmt: function (x) { return U.moneyY(x.amount); } }
        ], r.items || [], { mini: true, emptyText: '暂无明细' })
      );
      U.modal({ title: '销售订单明细', body: body, hideOk: true, cancelText: '关闭', wide: true });
    }

    return U.el('div', { class: 'a-page' }, [page]);
  };

  /* ==============================================================
     6. 物流运输
     ============================================================== */
  A.pages.logistics = function () {
    var root = U.el('div', { class: 'a-page' });
    root.appendChild(A.ui.readonlyTip());

    var ships = Store.list('shipments');
    var strip = U.el('div', { class: 'a-strip' });
    strip.appendChild(A.ui.kpi('运单总数', ships.length, ' 票', null, null, ''));
    strip.appendChild(A.ui.kpi('在途', ships.filter(function (x) { return x.status === 'in_transit'; }).length, ' 票', null, null, 'k2'));
    strip.appendChild(A.ui.kpi('运输异常', ships.filter(function (x) { return x.status === 'exception'; }).length, ' 票', null, null, 'k4'));
    strip.appendChild(A.ui.kpi('运费合计', U.money(U.sum(ships, function (x) { return x.cost; })), '', null, null, 'k5'));
    root.appendChild(strip);

    /* 承运商对比 */
    var r1 = U.el('div', { class: 'a-grid2 mb16' });
    root.appendChild(r1);
    var byCarrier = U.groupBy(ships, function (x) { return x.carrier; });
    var carriers = Object.keys(byCarrier).map(function (c) {
      var arr = byCarrier[c];
      return {
        name: c, count: arr.length,
        cost: U.round(U.sum(arr, function (x) { return x.cost; }), 0),
        onTime: U.round(arr.filter(function (x) { return x.status === 'arrived'; }).length / arr.length * 100, 0)
      };
    });
    r1.appendChild(card('承运商运单量', '各承运商在承运单量（票）',
      Chart.bar({
        height: 210,
        labels: carriers.map(function (c) { return c.name.replace('供应链', '').replace('物流', '').replace('快运', '').replace('货运', '').replace('速运', ''); }),
        series: [{ name: '运单量', values: carriers.map(function (c) { return c.count; }), color: '#2563eb' }],
        legend: false
      })
    ));
    r1.appendChild(card('承运商时效对比', '到达率（%）与运费（元）',
      Chart.bar({
        height: 210,
        labels: carriers.map(function (c) { return c.name.replace('供应链', '').replace('物流', '').replace('快运', '').replace('货运', '').replace('速运', ''); }),
        series: [
          { name: '到达率', values: carriers.map(function (c) { return c.onTime; }), color: '#16a34a' },
          { name: '运费(百元)', values: carriers.map(function (c) { return U.round(c.cost / 100, 0); }), color: '#f59e0b' }
        ]
      })
    ));

    /* 异常运单 */
    var exc = ships.filter(function (x) { return x.status === 'exception'; });
    if (exc.length) {
      root.appendChild(U.el('div', { class: 'card mb16' }, [
        U.el('div', { class: 'card-head' }, [
          U.el('div', null, [U.el('h3', { text: '异常运单处理' }), U.el('div', { class: 'sub', text: '运输中断或延误，需人工介入' })]),
          U.el('span', { class: 'badge red', text: exc.length + ' 票' })
        ]),
        U.el('div', { class: 'table-wrap' }, A.ui.table([
          { t: '运单号', k: 'no', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.no }); } },
          { t: '关联单据', k: 'refNo', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.refNo }); } },
          { t: '承运商', k: 'carrier' },
          { t: '路线', k: 'route', fmt: function (r) { return r.from + ' → ' + r.to; } },
          { t: '进度', k: 'progress', fmt: function (r) { return U.el('div', { class: 'row gap8' }, [U.el('div', { class: 'bar grow' }, U.el('i', { class: 'bad', style: { width: r.progress + '%' } })), U.el('span', { class: 't-xs', text: r.progress + '%' })]); } },
          {
            t: '操作', k: 'op', fmt: function (r) {
              return U.el('button', {
                class: 'btn sm primary', text: '标记恢复',
                onclick: function (e) {
                  e.stopPropagation();
                  if (!Store.can('edit')) { U.toast('当前角色无操作权限', 'warn'); return; }
                  Store.update('shipments', r.id, { status: 'in_transit', progress: Math.max(r.progress, 50) });
                  U.toast('已恢复运输', 'ok'); location.reload();
                }
              });
            }
          }
        ], exc, {}))
      ]));
    }

    /* 运单列表 */
    var page = A.crudPage({
      store: 'shipments',
      title: '物流运单',
      keywordPlaceholder: '搜索运单号 / 关联单号',
      searchKeys: ['no', 'refNo', 'carrier', 'driver'],
      sortBy: function (x) { return x.eta; },
      filters: [
        { key: 'status', label: '全部状态', options: Object.keys(Store.ENUMS.shipStatus).map(function (k) { return [k, Store.ENUMS.shipStatus[k][0]]; }) },
        { key: 'carrier', label: '全部承运商', options: Seed.CARRIERS }
      ],
      columns: [
        { t: '运单号', k: 'no', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.no }); } },
        { t: '关联单据', k: 'refNo', fmt: function (r) { return U.el('span', { class: 'mono t-xs muted', text: r.refNo }); } },
        { t: '承运商', k: 'carrier', fmt: function (r) { return U.el('div', null, [U.el('div', { text: r.carrier }), U.el('div', { class: 't-xs muted', text: r.driver })]); } },
        { t: '路线', k: 'from', fmt: function (r) { return r.from + ' → ' + r.to; } },
        { t: '重量', k: 'weight', num: true, fmt: function (r) { return r.weight + ' kg'; } },
        { t: '运费', k: 'cost', num: true, fmt: function (r) { return U.moneyY(r.cost); } },
        { t: '预计到达', k: 'eta' },
        {
          t: '进度', k: 'progress', width: '150px', fmt: function (r) {
            return U.el('div', { class: 'row gap8' }, [
              U.el('div', { class: 'bar grow' }, U.el('i', { class: r.status === 'exception' ? 'bad' : (r.progress >= 100 ? 'ok' : ''), style: { width: r.progress + '%' } })),
              U.el('span', { class: 't-xs', text: r.progress + '%' })
            ]);
          }
        },
        { t: '状态', k: 'status', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.shipStatus, r.status); } }
      ],
      rowActions: [
        { label: '轨迹', fn: function (r) { openTrack(r); } },
        {
          label: '推进', needEdit: true, show: function (r) { return r.progress < 100; },
          fn: function (r, refresh) {
            var nodes = r.nodes || [];
            var nextIdx = nodes.findIndex(function (n) { return !n.done; });
            if (nextIdx < 0) { U.toast('该运单已完成', 'warn'); return; }
            nodes[nextIdx].done = true;
            nodes[nextIdx].at = U.today();
            var prog = Math.round((nextIdx + 1) / nodes.length * 100);
            Store.update('shipments', r.id, { nodes: nodes, progress: prog, status: prog >= 100 ? 'arrived' : 'in_transit' });
            refresh(); U.toast('已推进至「' + nodes[nextIdx].t + '」', 'ok');
          }
        }
      ],
      fields: [
        { k: 'no', label: '运单号', readonly: true },
        { k: 'carrier', label: '承运商', type: 'select', options: Seed.CARRIERS },
        { k: 'from', label: '出发地' },
        { k: 'to', label: '目的地' },
        { k: 'refNo', label: '关联单号' },
        { k: 'status', label: '状态', type: 'select', options: Object.keys(Store.ENUMS.shipStatus).map(function (k) { return [k, Store.ENUMS.shipStatus[k][0]]; }) },
        { k: 'weight', label: '重量(kg)', type: 'number' },
        { k: 'volume', label: '体积(m³)', type: 'number' },
        { k: 'cost', label: '运费(元)', type: 'number' },
        { k: 'eta', label: '预计到达', type: 'date' },
        { k: 'driver', label: '司机/车牌' }
      ],
      defaultRow: function () {
        var wh = Store.firstWarehouse();
        return {
          no: 'SF' + U.randInt(100000000000, 999999999999), carrier: Seed.CARRIERS[0],
          from: wh.city, to: '上海', refNo: '-', refType: 'sales', status: 'pending',
          progress: 0, weight: 100, volume: 5, cost: 500, eta: U.addDays(null, 5),
          driver: '张伟 · 沪A12345',
          nodes: [
            { t: '已下单', at: U.today(), done: true }, { t: '仓库拣货', at: '', done: false },
            { t: '已发运', at: '', done: false }, { t: '干线运输', at: '', done: false },
            { t: '到达分拨中心', at: '', done: false }, { t: '派送中', at: '', done: false },
            { t: '已签收', at: '', done: false }
          ]
        };
      },
      onCreate: function (v) {
        ['weight', 'volume', 'cost'].forEach(function (k) { v[k] = Number(v[k]) || 0; });
        return v;
      },
      onEdit: function (src, v) {
        ['weight', 'volume', 'cost'].forEach(function (k) { if (v[k] !== '') v[k] = Number(v[k]); });
        return v;
      },
      onRowClick: function (r) { openTrack(r); }
    });
    root.appendChild(page);

    function openTrack(r) {
      var nodes = r.nodes || [];
      var body = U.el('div', { class: 'col gap16' }, [
        U.el('div', { class: 'dl' }, [
          U.el('dt', { text: '运单号' }), U.el('dd', { class: 'mono', text: r.no }),
          U.el('dt', { text: '承运商' }), U.el('dd', { text: r.carrier + ' · ' + r.driver }),
          U.el('dt', { text: '路线' }), U.el('dd', { text: r.from + ' → ' + r.to }),
          U.el('dt', { text: '关联单据' }), U.el('dd', { class: 'mono', text: r.refNo }),
          U.el('dt', { text: '货量' }), U.el('dd', { text: r.weight + ' kg / ' + r.volume + ' m³' }),
          U.el('dt', { text: '预计到达' }), U.el('dd', { text: r.eta })
        ]),
        U.el('div', { class: 'timeline' }, nodes.map(function (n, i) {
          var isCur = !n.done && nodes[i - 1] && nodes[i - 1].done;
          return U.el('div', { class: 'node ' + (n.done ? 'done' : (isCur ? 'cur' : '')) }, [
            U.el('div', { class: 'bold t-sm', text: n.t }),
            U.el('div', { class: 't', text: (n.at || '待定') + (n.done ? ' · 已完成' : (isCur ? ' · 进行中' : ' · 待处理')) })
          ]);
        }))
      ]);
      U.modal({ title: '运单轨迹', body: body, hideOk: true, cancelText: '关闭' });
    }
    return root;
  };

})(window);
