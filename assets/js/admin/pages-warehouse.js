/* ============================================================
   SCM · 后台：仓库管理
   库容概览 / 仓库档案 CRUD / 省份城市联动 / 详情抽屉 / 关联风险
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Chart = global.Chart, Store = global.Store, Seed = global.Seed;
  var A = global.Admin;
  var card = A.ui.card;

  function rateCls(r) { return r >= 90 ? 'bad' : (r >= 75 ? 'warn' : 'ok'); }
  function rateBadge(r) { return r >= 90 ? 'red' : (r >= 75 ? 'amber' : 'green'); }

  /** 生成不重复的仓库编码：WH-001、WH-002 … */
  function nextCode() {
    var max = 0;
    Store.list('warehouses').forEach(function (w) {
      var m = /(\d+)$/.exec(w.code || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'WH-' + String(max + 1).padStart(3, '0');
  }

  /** 表单归一化：数值转换、自定义城市、省份→区域、库容校验 */
  function normalize(v) {
    if (v.city === '__custom__') v.city = (v.cityCustom || '').trim();
    delete v.cityCustom;
    if (v.province && Seed.regionOf) v.region = Seed.regionOf(v.province) || v.region || '';
    ['capacity', 'used', 'area'].forEach(function (k) {
      v[k] = Number(v[k]) || 0;
    });
    if (!v.name || !v.code) { U.toast('请填写仓库名称和编码', 'err'); return false; }
    if (!v.city) { U.toast('请选择或填写城市', 'err'); return false; }
    if (v.capacity <= 0) { U.toast('库容容量必须大于 0', 'err'); return false; }
    if (v.used < 0) v.used = 0;
    if (v.used > v.capacity) {
      U.toast('已用库容超过总容量，已自动修正为总容量', 'warn');
      v.used = v.capacity;
    }
    v.usageRate = U.round(v.used / v.capacity * 100, 1);
    return v;
  }

  /* ==============================================================
     仓库管理页
     ============================================================== */
  A.pages.warehouses = function () {
    var whs = Store.list('warehouses');

    /* ---------- 顶部 KPI ---------- */
    function strip() {
      var totalCap = U.sum(whs, function (w) { return Number(w.capacity) || 0; });
      var totalUsed = U.sum(whs, function (w) { return Number(w.used) || 0; });
      var s = U.el('div');
      s.appendChild(A.ui.kpi('仓库总数', whs.length, ' 座', null, null, ''));
      s.appendChild(A.ui.kpi('运营中', whs.filter(function (w) { return w.status === 'active'; }).length, ' 座', null, null, 'k3'));
      s.appendChild(A.ui.kpi('总库容', U.num(totalCap), ' 储位', null, null, 'k2'));
      s.appendChild(A.ui.kpi('平均利用率', U.pct(totalCap ? totalUsed / totalCap * 100 : 0), '', null, null, 'k5'));
      return [s.firstChild, s.children[1], s.children[2], s.children[3]];
    }

    /* ---------- 库容概览图 ---------- */
    function topContent() {
      var wrap = U.el('div', { class: 'a-grid2 mb16' });
      var usage = Store.whUsage();
      var high = usage.filter(function (x) { return x.rate >= 90; }).length;
      wrap.appendChild(card('仓库库容利用率', '已用 / 总容量（%）',
        usage.length ? Chart.bar({
          horizontal: true, height: 210, max: 100,
          labels: usage.map(function (x) { return x.warehouse.name; }),
          series: [{ name: '利用率', values: usage.map(function (x) { return x.rate; }), color: '#8b5cf6' }],
          showValue: true, legend: false, yFmt: function (v) { return v + '%'; }
        }) : U.el('div', { class: 'empty', text: '暂无仓库数据' }),
        null,
        U.el('span', { class: 'badge ' + (high ? 'red' : 'green'), text: high ? high + ' 座高负载' : '负载正常' })
      ));
      var byWh = Store.list('warehouses').map(function (w, i) {
        return {
          name: w.name,
          value: U.round(Store.whStats(w.id).value / 10000, 1),
          color: Chart.PALETTE[i % Chart.PALETTE.length]
        };
      }).filter(function (x) { return x.value > 0; });
      var totalValue = U.sum(Store.list('inventory'), function (iv) {
        var p = Store.product(iv.productId);
        return (p ? p.unitPrice : 0) * (Number(iv.qty) || 0);
      });
      wrap.appendChild(card('各仓库存价值分布', '按库存金额（万元）',
        byWh.length ? Chart.donut({
          data: U.sortBy(byWh, function (x) { return x.value; }, 'desc'), size: 190,
          center: { value: U.money(totalValue), label: '库存总值(元)' }
        }) : U.el('div', { class: 'empty', text: '暂无库存数据' })
      ));
      return wrap;
    }

    var page = A.crudPage({
      store: 'warehouses',
      title: '仓库管理',
      keywordPlaceholder: '搜索仓库 / 编码 / 城市 / 负责人',
      searchKeys: ['name', 'code', 'city', 'province', 'manager', 'address'],
      sortBy: function (x) { return x.code; },
      sortDir: 'asc',
      size: 10,
      strip: strip,
      topContent: topContent,
      actionWidth: '190px',
      filters: [
        { key: 'type', label: '全部类型', options: Seed.WH_TYPES },
        { key: 'region', label: '全部区域', options: Seed.REGIONS },
        { key: 'status', label: '全部状态', options: Seed.WH_STATUS }
      ],
      deleteImpact: function (rows) {
        var ref = Store.whRefs(rows.map(function (r) { return r.id; }));
        var parts = [];
        if (ref.inventory) parts.push(ref.inventory + ' 条库存记录');
        if (ref.purchases) parts.push(ref.purchases + ' 张采购单');
        if (ref.sales) parts.push(ref.sales + ' 张销售订单');
        if (ref.shipments) parts.push(ref.shipments + ' 张运单');
        return parts.length
          ? '⚠ 这些仓库已被 ' + parts.join('、') + ' 引用。删除后单据仍会保留，但仓库档案将无法查询；若只是暂停收发，建议改用「停用」。'
          : '';
      },
      columns: [
        {
          t: '仓库', k: 'name', fmt: function (r) {
            return U.el('div', null, [
              U.el('div', {
                class: 'bold link', text: r.name,
                onclick: function (e) { e.stopPropagation(); openDrawer(r); }
              }),
              U.el('div', { class: 't-xs muted', text: r.code + ' · ' + r.city + ' · ' + r.manager })
            ]);
          }
        },
        { t: '类型', k: 'type', fmt: function (r) { return U.el('span', { class: 'tag', text: r.type || '-' }); } },
        {
          t: '所在地区', k: 'region', fmt: function (r) {
            return U.el('div', null, [
              U.el('div', { class: 't-sm', text: r.region || '-' }),
              U.el('div', { class: 't-xs muted', text: [r.province, r.city].filter(Boolean).join(' · ') || '-' })
            ]);
          }
        },
        {
          t: '库容利用率', k: 'usageRate', width: '160px', fmt: function (r) {
            var rt = Number(r.usageRate != null ? r.usageRate : (r.capacity ? U.round(r.used / r.capacity * 100, 1) : 0));
            return U.el('div', null, [
              U.el('div', { class: 'row gap8' }, [
                U.el('div', { class: 'bar grow' }, U.el('i', { class: rateCls(rt), style: { width: Math.min(100, rt) + '%' } })),
                U.el('span', { class: 't-xs bold', text: U.pct(rt, 0) })
              ]),
              U.el('div', { class: 't-xs muted mt4', text: U.num(r.used) + ' / ' + U.num(r.capacity) + ' 储位' })
            ]);
          }
        },
        {
          t: 'SKU / 库存', fmt: function (r) {
            var st = Store.whStats(r.id);
            return U.el('div', null, [
              U.el('div', { class: 'bold', text: U.num(st.skuCount) + ' 种' }),
              U.el('div', { class: 't-xs muted', text: U.num(st.qty) + ' 件' })
            ]);
          }
        },
        {
          t: '库存金额', fmt: function (r) { return U.el('b', { class: 't-sm', text: U.moneyY(Store.whStats(r.id).value) }); }
        },
        { t: '温控', k: 'temperature', fmt: function (r) { return U.el('span', { class: 't-xs', text: r.temperature || '常温' }); } },
        { t: '状态', k: 'status', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.whStatus, r.status); } }
      ],
      rowActions: [
        { label: '详情', fn: function (r) { openDrawer(r); } },
        {
          label: '停用', needEdit: true, cls: 'danger',
          show: function (r) { return r.status !== 'disabled'; },
          fn: function (r, refresh) {
            U.confirm('确定停用「' + r.name + '」？停用后不再作为新单据的默认收货/发货仓。', function () {
              Store.update('warehouses', r.id, { status: 'disabled' });
              refresh(); U.toast('仓库已停用', 'ok');
            }, '停用仓库');
          }
        },
        {
          label: '启用', needEdit: true,
          show: function (r) { return r.status === 'disabled'; },
          fn: function (r, refresh) {
            Store.update('warehouses', r.id, { status: 'active' });
            refresh(); U.toast('仓库已恢复运营', 'ok');
          }
        }
      ],
      fields: [
        { k: 'name', label: '仓库名称', required: true, ph: '如 华南冷链前置仓' },
        { k: 'code', label: '仓库编码', required: true },
        { k: 'type', label: '仓库类型', type: 'select', options: Seed.WH_TYPES, required: true },
        { k: 'status', label: '状态', type: 'select', options: Seed.WH_STATUS },
        { k: 'province', label: '所属省份', type: 'select', options: [['', '请选择省份']].concat(Seed.PROVINCES.map(function (p) { return [p.name, p.name]; })), required: true },
        { k: 'city', label: '城市', type: 'select', options: [['', '请先选择省份']], required: true },
        { k: 'region', label: '所属区域（随省份自动带出）', type: 'select', options: Seed.REGIONS },
        { k: 'address', label: '详细地址', required: true, ph: '如 深圳市龙岗区物流大道 88 号' },
        { k: 'capacity', label: '总库容（储位）', type: 'number', required: true },
        { k: 'used', label: '已用库容（储位）', type: 'number' },
        { k: 'area', label: '仓库面积（m²）', type: 'number' },
        { k: 'temperature', label: '温控条件', type: 'select', options: Seed.WH_TEMPS },
        { k: 'manager', label: '仓库负责人', required: true },
        { k: 'phone', label: '联系电话' },
        { k: 'openedAt', label: '启用日期', type: 'date' },
        { k: 'remark', label: '备注', type: 'textarea', full: true }
      ],
      /* 省份 → 城市级联，兼容旧数据按城市反查省份 */
      onFormReady: function (body, src) {
        var pSel = body.querySelector('[data-f="province"]');
        var cSel = body.querySelector('[data-f="city"]');
        var rSel = body.querySelector('[data-f="region"]');
        if (!pSel || !cSel) return;
        if (!pSel.value) pSel.value = Seed.provinceByCity(src.city) || '';
        if (!pSel.value && src.region) {
          var first = Seed.PROVINCES.filter(function (p) { return p.region === src.region; })[0];
          if (first) pSel.value = first.name;
        }
        var custom = U.el('input', {
          class: 'input', 'data-f': 'cityCustom', placeholder: '填写城市名称',
          style: { display: 'none', marginTop: '8px' }
        });
        cSel.parentNode.appendChild(custom);
        function fillCities(keep) {
          var prov = pSel.value, list = Seed.citiesOf(prov);
          cSel.innerHTML = '';
          cSel.appendChild(U.el('option', { value: '', text: prov ? '请选择城市' : '请先选择省份' }));
          list.forEach(function (c) { cSel.appendChild(U.el('option', { value: c, text: c })); });
          var customOpt = U.el('option', { value: '__custom__', text: '＋ 其他（手动填写）' });
          cSel.appendChild(customOpt);
          if (keep && keep !== '__custom__' && list.indexOf(keep) < 0) {
            cSel.insertBefore(U.el('option', { value: keep, text: keep }), customOpt);
          }
          cSel.value = keep || '';
          custom.style.display = cSel.value === '__custom__' ? 'block' : 'none';
        }
        fillCities(src.city || '');
        pSel.addEventListener('change', function () {
          var rg = Seed.regionOf(pSel.value);
          if (rSel && rg) rSel.value = rg;
          fillCities('');
        });
        cSel.addEventListener('change', function () {
          var on = cSel.value === '__custom__';
          custom.style.display = on ? 'block' : 'none';
          if (on) custom.focus(); else custom.value = '';
        });
      },
      defaultRow: function () {
        return {
          code: nextCode(), type: '分仓', status: 'active',
          province: '上海市', city: '上海', region: '华东',
          capacity: 20000, used: 0, area: 5000, temperature: '常温',
          manager: '张伟', openedAt: U.today(), usageRate: 0
        };
      },
      onCreate: function (v) {
        if (normalize(v) === false) return false;
        v.id = U.uid('WH');
        return v;
      },
      onEdit: function (src, v) {
        return normalize(v);
      },
      onRowClick: function (r) { openDrawer(r); },
      extraToolbar: []
    });

    /* ---------- 仓库详情抽屉 ---------- */
    function openDrawer(w) {
      var st = Store.whStats(w.id);
      var rate = Number(w.usageRate != null ? w.usageRate : st.rate);
      var mask = U.el('div', { class: 'drawer-mask', onclick: close });
      var drawer = U.el('div', { class: 'drawer' }, [
        U.el('div', { class: 'drawer-head' }, [
          U.el('div', null, [
            U.el('h3', { text: w.name }),
            U.el('div', { class: 'row gap8 mt8' }, [
              A.ui.badgeEnum(Store.ENUMS.whStatus, w.status),
              U.el('span', { class: 'tag', text: w.type || '仓库' }),
              U.el('span', { class: 'tag', text: w.code || '-' })
            ])
          ]),
          U.el('button', { class: 'modal-close', html: '&times;', onclick: close })
        ]),
        U.el('div', { class: 'drawer-body col gap16' }, [
          /* 基本信息 */
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '仓库档案' }),
            U.el('div', { class: 'dl' }, [
              U.el('dt', { text: '仓库类型' }), U.el('dd', { text: w.type || '-' }),
              U.el('dt', { text: '所在地区' }), U.el('dd', { text: [w.region, w.province, w.city].filter(Boolean).join(' · ') || '-' }),
              U.el('dt', { text: '详细地址' }), U.el('dd', { text: w.address || '-' }),
              U.el('dt', { text: '负责人' }), U.el('dd', { text: (w.manager || '-') + (w.phone ? ' · ' + w.phone : '') }),
              U.el('dt', { text: '温控条件' }), U.el('dd', { text: w.temperature || '常温' }),
              U.el('dt', { text: '仓库面积' }), U.el('dd', { text: U.num(w.area) + ' m²' }),
              U.el('dt', { text: '启用日期' }), U.el('dd', { text: w.openedAt || '-' }),
              U.el('dt', { text: '备注' }), U.el('dd', { text: w.remark || '-' })
            ])
          ]),
          /* 库容 */
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '库容使用' }),
            U.el('div', { class: 'row gap16', style: { alignItems: 'center', flexWrap: 'wrap' } }, [
              Chart.gauge({
                size: 190, value: rate, max: 100, text: U.pct(rate, 0), label: '库容利用率',
                color: rate >= 90 ? '#dc2626' : (rate >= 75 ? '#f59e0b' : '#2563eb'),
                minLabel: '0%', maxLabel: '100%'
              }),
              U.el('div', { class: 'grow', style: { minWidth: '180px' } }, [
                U.el('div', { class: 'grid g3 tc' }, [
                  U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(st.used) }), U.el('div', { class: 't-xs muted', text: '已用储位' })]),
                  U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(Math.max(0, st.capacity - st.used)) }), U.el('div', { class: 't-xs muted', text: '剩余储位' })]),
                  U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(st.capacity) }), U.el('div', { class: 't-xs muted', text: '总容量' })])
                ]),
                U.el('div', { class: 'bar mt16' }, U.el('i', { class: rateCls(rate), style: { width: Math.min(100, rate) + '%' } })),
                U.el('div', { class: 'row between t-xs muted mt8' }, [
                  U.el('span', { text: '负载等级' }),
                  U.el('span', { class: 'badge ' + rateBadge(rate), text: rate >= 90 ? '高负载 · 建议扩容' : (rate >= 75 ? '偏高 · 关注' : '健康') })
                ])
              ])
            ])
          ]),
          /* 经营概览 */
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '经营概览' }),
            U.el('div', { class: 'grid g3 tc' }, [
              U.el('div', null, [U.el('div', { class: 't-xl bold', text: U.num(st.skuCount) }), U.el('div', { class: 't-xs muted', text: '在库 SKU' })]),
              U.el('div', null, [U.el('div', { class: 't-xl bold', text: U.num(st.qty) }), U.el('div', { class: 't-xs muted', text: '库存件数' })]),
              U.el('div', null, [U.el('div', { class: 't-xl bold', text: U.moneyY(st.value) }), U.el('div', { class: 't-xs muted', text: '库存金额' })])
            ]),
            U.el('div', { class: 'row gap8 mt16 wrap' }, [
              U.el('span', { class: 'tag', text: '采购单 ' + st.poCount + ' 张' }),
              U.el('span', { class: 'tag', text: '销售订单 ' + st.soCount + ' 张' }),
              U.el('span', { class: 'tag', text: '运单 ' + st.shipCount + ' 张' })
            ])
          ]),
          /* 库存明细 */
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '在库物料 TOP 8' }),
            (function () {
              var invs = Store.list('inventory').filter(function (x) { return x.warehouseId === w.id; });
              if (!invs.length) return U.el('div', { class: 'empty t-sm', text: '该仓库暂无库存记录' });
              var rows = invs.map(function (x) {
                var p = Store.product(x.productId);
                return {
                  name: p ? p.name : '-', sku: p ? p.sku : '-', batchNo: x.batchNo,
                  qty: x.qty, available: x.available,
                  value: U.round((p ? p.unitPrice : 0) * (Number(x.qty) || 0), 2)
                };
              });
              return A.ui.table([
                { t: '物料', fmt: function (r) { return U.el('b', { class: 't-sm', text: r.name }); } },
                { t: 'SKU', fmt: function (r) { return U.el('span', { class: 'mono t-xs muted', text: r.sku }); } },
                { t: '批次', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.batchNo }); } },
                { t: '库存', num: true, fmt: function (r) { return U.num(r.qty); } },
                { t: '可用', num: true, fmt: function (r) { return U.num(r.available); } },
                { t: '金额', num: true, fmt: function (r) { return U.moneyY(r.value); } }
              ], U.sortBy(rows, function (r) { return r.value; }, 'desc').slice(0, 8), { mini: true });
            })()
          ]),
          /* 关联单据 */
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '最近关联单据' }),
            (function () {
              var docs = [];
              Store.list('purchases').filter(function (x) { return x.warehouseId === w.id; }).forEach(function (x) {
                docs.push({ no: x.no, type: '采购单', date: x.createdAt, amount: x.amount, label: Store.ENUMS.poStatus[x.status] ? Store.ENUMS.poStatus[x.status][0] : '-' });
              });
              Store.list('sales').filter(function (x) { return x.warehouseId === w.id; }).forEach(function (x) {
                docs.push({ no: x.no, type: '销售订单', date: x.createdAt, amount: x.amount, label: Store.ENUMS.soStatus[x.status] ? Store.ENUMS.soStatus[x.status][0] : '-' });
              });
              Store.list('shipments').filter(function (x) { return x.warehouseId === w.id; }).forEach(function (x) {
                docs.push({ no: x.no, type: '运单', date: x.eta, amount: x.cost, label: Store.ENUMS.shipStatus[x.status] ? Store.ENUMS.shipStatus[x.status][0] : '-' });
              });
              if (!docs.length) return U.el('div', { class: 'empty t-sm', text: '暂无关联单据' });
              return A.ui.table([
                { t: '单号', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.no }); } },
                { t: '类型', fmt: function (r) { return U.el('span', { class: 'tag', text: r.type }); } },
                { t: '日期', fmt: function (r) { return U.el('span', { class: 't-xs', text: r.date || '-' }); } },
                { t: '金额 / 运费', num: true, fmt: function (r) { return U.moneyY(r.amount); } },
                { t: '状态', fmt: function (r) { return U.el('span', { class: 't-xs', text: r.label }); } }
              ], U.sortBy(docs, function (r) { return r.date || ''; }, 'desc').slice(0, 8), { mini: true });
            })()
          ])
        ])
      ]);
      function close() { mask.remove(); drawer.remove(); }
      document.body.appendChild(mask);
      document.body.appendChild(drawer);
    }

    return page;
  };
})(window);
