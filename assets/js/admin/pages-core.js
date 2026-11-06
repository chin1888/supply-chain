/* ============================================================
   SCM · 后台核心：UI 组件 + 通用 CRUD + 看板 / 供应商 / 采购
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Chart = global.Chart, Store = global.Store, Seed = global.Seed;
  var A = { pages: {}, ui: {} };

  /* ================= UI 组件 ================= */
  function card(title, sub, body, foot, extraHead) {
    return U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: title }), sub ? U.el('div', { class: 'sub', text: sub }) : null]),
        extraHead || null
      ]),
      U.el('div', { class: 'card-body' }, body),
      foot || null
    ]);
  }
  A.ui.card = card;

  A.ui.kpi = function (label, value, unit, delta, spark, k, invert) {
    var dcls = delta == null ? 'muted' : ((delta >= 0) !== !!invert ? 'up' : 'down');
    return U.el('div', { class: 'kpi ' + (k || '') }, [
      U.el('div', { class: 'label', text: label }),
      U.el('div', { class: 'value' }, [document.createTextNode(value), unit ? U.el('small', { text: unit }) : null]),
      delta == null ? null : U.el('div', { class: 'delta ' + dcls, text: (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + (unit === '%' ? '' : '%') + ' 环比' }),
      spark && spark.length ? U.el('div', { class: 'spark' }, Chart.spark({ values: spark, width: 74, height: 28 })) : null
    ]);
  };

  A.ui.badgeEnum = function (enu, key) {
    var e = enu[key] || ['未知', 'gray'];
    return U.el('span', { class: 'badge ' + e[1], text: e[0] });
  };

  A.ui.readonlyTip = function () {
    // 有编辑权限时返回空片段，避免 appendChild(null) 抛错
    if (Store.can('edit')) return document.createDocumentFragment();
    return U.el('div', { class: 'readonly-tip' }, [
      U.el('b', { text: '只读模式：' }),
      U.el('span', { text: '当前角色为「' + Store.roleLabel(Store.session().role) + '」，仅可查看数据，不能新增或修改。' })
    ]);
  };

  /** 表格构造器 */
  A.ui.table = function (cols, rows, opts) {
    opts = opts || {};
    var tbl = U.el('table', { class: 'tbl ' + (opts.mini ? 'tbl-mini ' : '') + (opts.className || '') });
    var thead = U.el('thead'), tr = U.el('tr');
    var selSet = opts.selectedIds || {};
    /** 向外部同步「本页勾选的 id」和「本页全部 id」，便于跨页保留选择 */
    function emitSelect() {
      var boxes = U.$$('input[type=checkbox][data-sel]', tbl);
      opts.onSelect && opts.onSelect(
        boxes.filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.sel; }),
        boxes.map(function (c) { return c.dataset.sel; })
      );
    }
    if (opts.selectable) {
      var pageIds = rows.map(function (r) { return r.id; });
      tr.appendChild(U.el('th', { style: { width: '38px' } }, [
        U.el('input', {
          type: 'checkbox',
          checked: pageIds.length && pageIds.every(function (id) { return !!selSet[id]; }) ? true : null,
          title: '全选 / 取消本页',
          onchange: function (e) {
            U.$$('input[type=checkbox][data-sel]', tbl).forEach(function (c) { c.checked = e.target.checked; });
            emitSelect();
          }
        })
      ]));
    }
    cols.forEach(function (c) {
      tr.appendChild(U.el('th', { class: c.num ? 'num' : '', style: c.width ? { width: c.width } : null, text: c.t }));
    });
    thead.appendChild(tr);
    tbl.appendChild(thead);
    var tb = U.el('tbody');
    if (!rows.length) {
      tb.appendChild(U.el('tr', null, [U.el('td', { colspan: cols.length + (opts.selectable ? 1 : 0) }, U.el('div', { class: 'empty' }, [
        U.el('div', { class: 'ico', text: '∅' }),
        U.el('div', { text: opts.emptyText || '暂无数据' })
      ]))]));
    }
    rows.forEach(function (r, i) {
      var t = U.el('tr');
      if (opts.selectable) {
        t.appendChild(U.el('td', null, [
          U.el('input', {
            type: 'checkbox', dataset: { sel: r.id },
            checked: selSet[r.id] ? true : null,
            onchange: function () { emitSelect(); }
          })
        ]));
      }
      cols.forEach(function (c) {
        var v = c.fmt ? c.fmt(r, i) : r[c.k];
        t.appendChild(U.el('td', { class: c.num ? 'num' : '', style: c.tdStyle ? c.tdStyle : null },
          (v == null || typeof v === 'string' || typeof v === 'number') ? document.createTextNode(v == null ? '-' : v) : v));
      });
      if (opts.onRowClick) { t.style.cursor = 'pointer'; t.addEventListener('click', function (e) { if (e.target.tagName !== 'INPUT') opts.onRowClick(r); }); }
      tb.appendChild(t);
    });
    tbl.appendChild(tb);
    return U.el('div', { class: 'table-wrap' }, tbl);
  };

  /* ================= 通用 CRUD 页面 ================= */
  /**
   * cfg: { store, title, desc, columns, fields, searchKeys, filters,
   *        onEdit(item, formValues), onCreate(v), defaultRow, size,
   *        extraToolbar, extraHead, onRowClick, rowActions, strip, keywordPlaceholder }
   */
  A.crudPage = function (cfg) {
    var canEdit = Store.can('edit');
    var batchOn = canEdit && cfg.batch !== false;
    var state = { kw: '', page: 1, size: cfg.size || 10, f: {}, selected: {} };
    (cfg.filters || []).forEach(function (f) { state.f[f.key] = ''; });

    var root = U.el('div', { class: 'a-page' });
    root.appendChild(A.ui.readonlyTip());

    /* 统计条 */
    if (cfg.strip) root.appendChild(U.el('div', { class: 'a-strip mb16' }, cfg.strip()));

    /* 自定义顶部内容（图表 / 概览，位于工具栏上方） */
    if (cfg.topContent) root.appendChild(cfg.topContent(refresh));

    /* 工具栏 */
    var tb = U.el('div', { class: 'a-toolbar' });
    var sk = U.el('input', {
      class: 'input', placeholder: cfg.keywordPlaceholder || '搜索…',
      oninput: U.debounce(function (e) { state.kw = e.target.value.trim(); state.page = 1; renderList(); }, 200)
    });
    tb.appendChild(U.el('div', { class: 'search-box grow-search' }, [sk]));

    (cfg.filters || []).forEach(function (f) {
      var sel = U.select('f_' + f.key, [['', f.label]].concat(f.options), '');
      sel.style.width = 'auto';
      sel.addEventListener('change', function () { state.f[f.key] = sel.value; state.page = 1; renderList(); });
      tb.appendChild(sel);
    });
    tb.appendChild(U.el('div', { class: 'grow' }));
    if (cfg.extraToolbar) cfg.extraToolbar.forEach(function (n) { tb.appendChild(n); });
    tb.appendChild(U.el('button', {
      class: 'btn', text: '导出 CSV', onclick: function () { exportCsv(); }
    }));
    if (canEdit) {
      tb.appendChild(U.el('button', {
        class: 'btn primary', text: '+ 新增', onclick: function () { openForm(null); }
      }));
    }
    root.appendChild(tb);

    /* 批量操作条：勾选任意行后出现 */
    var batchBar = U.el('div', { class: 'batch-bar' });
    batchBar.style.display = 'none';
    root.appendChild(batchBar);

    /* 批量操作常驻提示（勾选前也能看到入口） */
    if (batchOn && cfg.batchHint) {
      var hintTxt = (global.I18n && global.I18n.t) ? global.I18n.t(cfg.batchHint) : cfg.batchHint;
      root.appendChild(U.el('div', { class: 'batch-hint t-xs muted', text: '☑ ' + hintTxt }));
    }

    var listBox = U.el('div');
    root.appendChild(listBox);

    function all() { return Store.list(cfg.store); }
    function filtered() {
      var arr = all();
      if (state.kw) {
        var kw = state.kw.toLowerCase();
        arr = arr.filter(function (x) {
          var hit = (cfg.searchKeys || []).some(function (k) {
            return String(x[k] == null ? '' : x[k]).toLowerCase().indexOf(kw) >= 0;
          });
          if (hit) return true;
          /* 关联名称等衍生检索字段（例如产品按供应商名称搜索） */
          if (cfg.searchExtra) return String(cfg.searchExtra(x) || '').toLowerCase().indexOf(kw) >= 0;
          return false;
        });
      }
      (cfg.filters || []).forEach(function (f) {
        if (!state.f[f.key]) return;
        arr = arr.filter(function (x) { return String(x[f.key]) === String(state.f[f.key]); });
      });
      if (cfg.sortBy) arr = U.sortBy(arr, cfg.sortBy, cfg.sortDir || 'desc');
      return arr;
    }

    function renderList() {
      var res = U.paginate(filtered(), state.page, state.size);
      listBox.innerHTML = '';
      var cols = cfg.columns.slice();
      if (cfg.rowActions && (canEdit || cfg.rowActions.length)) {
        cols.push({ t: '操作', width: (cfg.actionWidth || '140px'), fmt: function (r) {
          var box = U.el('div', { class: 'row gap6' });
          (cfg.rowActions || []).forEach(function (act) {
            if (act.needEdit && !canEdit) return;
            if (act.show && !act.show(r)) return;
            box.appendChild(U.el('button', {
              class: 'btn sm ' + (act.cls || ''), text: act.label,
              onclick: function (e) { e.stopPropagation(); act.fn(r, refresh); }
            }));
          });
          if (canEdit && (!cfg.canEditRow || cfg.canEditRow(r))) {
            box.appendChild(U.el('button', { class: 'btn sm', text: '编辑', onclick: function (e) { e.stopPropagation(); openForm(r); } }));
          }
          if (canEdit && (!cfg.canDeleteRow || cfg.canDeleteRow(r))) {
            box.appendChild(U.el('button', { class: 'btn sm danger', text: '删除', onclick: function (e) {
              e.stopPropagation();
              U.confirm('确定删除「' + (r.name || r.no || r.id) + '」？删除后不可恢复。', function () {
                Store.remove(cfg.store, r.id); refresh(); U.toast('已删除', 'ok');
              }, '删除确认');
            } }));
          }
          return box;
        } });
      }
      var tblCard = U.el('div', { class: 'card' });
      tblCard.appendChild(A.ui.table(cols, res.rows, {
        selectable: batchOn,
        selectedIds: state.selected,
        onSelect: function (checked, pageIds) {
          // 本页原有选择全部清掉，再按当前勾选状态重建（跨页选择保留）
          pageIds.forEach(function (id) { delete state.selected[id]; });
          checked.forEach(function (id) { state.selected[id] = true; });
          renderBatchBar();
        },
        onRowClick: cfg.onRowClick,
        emptyText: '没有匹配的记录',
        className: cfg.tableClass || ''
      }));
      tblCard.appendChild(U.pager(res, function (p) { state.page = p; renderList(); }));
      listBox.appendChild(tblCard);
      renderBatchBar();
    }

    function refresh() {
      // 清掉已经不存在的记录的选择
      var alive = {};
      Store.list(cfg.store).forEach(function (r) { alive[r.id] = true; });
      Object.keys(state.selected).forEach(function (id) { if (!alive[id]) delete state.selected[id]; });
      renderList();
    }

    /* ---------------- 批量选择 / 批量删除 ---------------- */
    function selectedRows() {
      return Store.list(cfg.store).filter(function (r) {
        return state.selected[r.id] && (!cfg.canDeleteRow || cfg.canDeleteRow(r));
      });
    }
    function renderBatchBar() {
      if (!batchOn) return;
      var n = selectedRows().length;
      batchBar.innerHTML = '';
      batchBar.style.display = n ? 'flex' : 'none';
      if (!n) return;
      var total = filtered().length;
      batchBar.appendChild(U.el('div', { class: 'row gap10', style: { alignItems: 'center' } }, [
        U.el('span', { class: 'batch-count', text: '已选 ' + n + ' 项' }),
        U.el('button', {
          class: 'btn sm ghost', text: total > n ? '全选当前筛选（' + total + ' 条）' : '全选当前筛选',
          title: '把当前搜索/筛选结果全部加入选择（含未显示的页）',
          onclick: function () {
            filtered().forEach(function (r) { state.selected[r.id] = true; });
            renderList();
          }
        }),
        U.el('button', {
          class: 'btn sm ghost', text: '清空选择',
          onclick: function () { state.selected = {}; renderList(); }
        })
      ]));
      batchBar.appendChild(U.el('div', { class: 'grow' }));
      batchBar.appendChild(U.el('button', {
        class: 'btn danger', text: '批量删除（' + n + '）',
        onclick: batchDelete
      }));
    }

    function batchDelete() {
      var rows = selectedRows();
      if (!rows.length) { U.toast('请先勾选要删除的记录', 'warn'); return; }
      var body = U.el('div', { class: 'col gap12' });
      body.appendChild(U.el('div', { class: 't-md', text: '确定删除选中的 ' + rows.length + ' 条「' + cfg.title.replace('管理', '') + '」记录？' }));
      var names = rows.slice(0, 6).map(function (r) { return r.name || r.no || r.id; });
      body.appendChild(U.el('div', { class: 'batch-names' }, names.map(function (nm) {
        return U.el('span', { class: 'tag', text: nm });
      }).concat(rows.length > 6 ? [U.el('span', { class: 't-xs muted', text: '…等 ' + rows.length + ' 条' })] : [])));
      var impact = cfg.deleteImpact ? cfg.deleteImpact(rows) : '';
      if (impact) body.appendChild(U.el('div', { class: 'batch-warn', text: impact }));
      body.appendChild(U.el('div', { class: 't-xs muted', text: '删除后不可恢复，建议先在「系统设置」导出 JSON 备份。' }));
      U.modal({
        title: '批量删除确认', body: body, wide: true,
        okText: '确认删除 ' + rows.length + ' 条', okClass: 'danger',
        onOk: function () {
          var n = Store.removeMany(cfg.store, rows.map(function (r) { return r.id; }));
          state.selected = {};
          state.page = 1;
          if (cfg.onAfterBatchDelete) cfg.onAfterBatchDelete(rows);
          refresh();
          U.toast('已删除 ' + n + ' 条记录', 'ok');
        }
      });
    }

    /* 表单 */
    function openForm(item) {
      var isNew = !item;
      var src = item ? U.clone(item) : (cfg.defaultRow ? cfg.defaultRow() : {});
      var body;
      if (cfg.formBuilder) {
        // 自定义表单：builder 自行填充 body，明细/图片等复杂状态挂在 body 上由 onCreate/onEdit 读取
        body = U.el('div', { class: 'col', style: { gap: '14px' } });
        cfg.formBuilder(body, src, isNew);
      } else {
        body = U.el('div', { class: 'grid g2', style: { gap: '14px' } });
        (cfg.fields || []).forEach(function (f) {
          var ctl, extra = null;
          if (f.type === 'select') ctl = U.select(f.k, f.options, src[f.k]);
          else if (f.type === 'textarea') ctl = U.textarea(f.k, src[f.k]);
          else if (f.type === 'number') ctl = U.el('input', { class: 'input', 'data-f': f.k, type: 'number', value: src[f.k] == null ? '' : src[f.k] });
          else if (f.type === 'date') ctl = U.el('input', { class: 'input', 'data-f': f.k, type: 'date', value: src[f.k] || '' });
          else if (f.type === 'suggest') {
            // 可自由填写 + 已有值建议（datalist）
            var listId = 'dl-' + f.k + '-' + Math.random().toString(36).slice(2, 8);
            ctl = U.el('input', {
              class: 'input', 'data-f': f.k, value: src[f.k] == null ? '' : src[f.k],
              placeholder: f.ph || '可直接填写，或从建议中选择', list: listId, autocomplete: 'off'
            });
            extra = U.el('datalist', { id: listId });
            (f.options || []).forEach(function (o) {
              extra.appendChild(U.el('option', { value: Array.isArray(o) ? o[0] : o }));
            });
          }
          else ctl = U.input(f.k, src[f.k], f.ph);
          if (f.readonly) ctl.disabled = true;
          body.appendChild(U.el('div', { class: 'field' }, [
            U.el('label', { text: f.label + (f.required ? ' *' : '') }), ctl, extra
          ]));
          if (f.full) body.lastChild.style.gridColumn = '1 / -1';
        });
        if (cfg.onFormReady) cfg.onFormReady(body, src, isNew);
      }
      U.modal({
        title: (isNew ? '新增' : '编辑') + cfg.title.replace('管理', ''),
        body: body, wide: cfg.formBuilder ? true : (cfg.fields || []).length > 6,
        xwide: cfg.formXWide === true,
        onOk: function (b) {
          var v = U.readForm(b);
          for (var k in v) { if (typeof v[k] === 'string') v[k] = v[k].trim(); }
          if (!cfg.formBuilder) {
            var miss = (cfg.fields || []).filter(function (f) { return f.required && !v[f.k]; });
            if (miss.length) { U.toast('请填写：' + miss.map(function (f) { return f.label; }).join('、'), 'err'); return false; }
          }
          if (isNew) {
            var obj = cfg.onCreate ? cfg.onCreate(v, body) : v;
            if (obj === false) return false; // 校验未通过，保持弹窗
            if (obj) { Store.add(cfg.store, obj); U.toast('新增成功', 'ok'); }
          } else {
            var patch = cfg.onEdit ? cfg.onEdit(src, v, body) : v;
            if (patch === false) return false;
            if (patch) { Store.update(cfg.store, item.id, patch); U.toast('保存成功', 'ok'); }
          }
          refresh();
        }
      });
    }

    /* 导出 */
    function exportCsv() {
      var arr = filtered();
      if (!arr.length) { U.toast('没有可导出的数据', 'warn'); return; }
      /* 表格列 + 额外的「仅导出」列：产品档案等宽表可导出全部字段 */
      var cols = cfg.columns.filter(function (c) { return c.k; })
        .concat(cfg.csvColumns || []);
      var head = cols.map(function (c) { return c.t; }).join(',');
      var lines = arr.map(function (r) {
        return cols.map(function (c) {
          var v = c.csv ? c.csv(r) : r[c.k];
          v = v == null ? '' : String(v).replace(/[",\n]/g, ' ');
          return '"' + v + '"';
        }).join(',');
      });
      var csv = '\ufeff' + head + '\n' + lines.join('\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = cfg.title + '_' + U.today() + '.csv';
      a.click();
      U.toast('已导出 ' + arr.length + ' 条', 'ok');
    }

    renderList();
    root.refresh = refresh;
    return root;
  };

  /* ==============================================================
     1. 总览看板
     ============================================================== */
  A.pages.dashboard = function () {
    var st = Store.stats(), m = Store.db.monthly;
    var root = U.el('div', { class: 'a-page' });
    root.appendChild(A.ui.readonlyTip());

    var strip = U.el('div', { class: 'a-strip' });
    strip.appendChild(A.ui.kpi('在途采购额', U.money(st.poAmount), '', st.deltaPurchase, m.map(function (x) { return x.purchase; }), ''));
    strip.appendChild(A.ui.kpi('销售订单额', U.money(st.soAmount), '', st.deltaSales, m.map(function (x) { return x.sales; }), 'k2'));
    strip.appendChild(A.ui.kpi('准时交付率', U.pct(st.onTimeRate), '', st.deltaOnTime, m.map(function (x) { return x.onTime; }), 'k3'));
    strip.appendChild(A.ui.kpi('库存周转率', st.turnover, ' 次/年', st.deltaTurnover, m.map(function (x) { return x.turnover; }), 'k4'));
    root.appendChild(strip);

    var s2 = U.el('div', { class: 'a-strip' });
    s2.appendChild(A.ui.kpi('合作供应商', U.num(st.activeSupplier), ' / ' + st.supplierCount + ' 家', null, null, 'k5'));
    s2.appendChild(A.ui.kpi('库存总值', U.money(st.stockValue), '', null, null, 'k3'));
    s2.appendChild(A.ui.kpi('低库存预警', U.num(st.lowStockCount), ' 项', null, null, 'k4'));
    s2.appendChild(A.ui.kpi('在途 / 异常运单', st.inTransit + ' / ' + st.shipException, '', null, null, 'k2'));
    root.appendChild(s2);

    /* 趋势 + 排行 */
    var r1 = U.el('div', { class: 'a-grid2 mt16' });
    root.appendChild(r1);
    r1.appendChild(card('采购与销售趋势', '近 12 个月（万元）',
      Chart.line({
        labels: m.map(function (x) { return U.monthLabel(x.month); }), height: 250,
        series: [
          { name: '采购额', values: m.map(function (x) { return x.purchase; }), color: '#2563eb' },
          { name: '销售额', values: m.map(function (x) { return x.sales; }), color: '#14b8a6' }
        ], tipFmt: function (v) { return U.wanText(v); }
      })
    ));
    var rank = Store.supplierRank('amount', 8);
    r1.appendChild(card('供应商采购额 TOP8', '累计金额（万元）',
      Chart.bar({
        horizontal: true, height: 250,
        labels: rank.map(function (x) { return x.supplier.short; }),
        series: [{ name: '采购额', values: rank.map(function (x) { return U.round(x.amount / 10000, 1); }), color: '#2563eb' }],
        showValue: true, legend: false
      })
    ));

    /* 库存结构 + 漏斗 + 预警 */
    var r2 = U.el('div', { class: 'a-grid3 mt16' });
    root.appendChild(r2);
    var wu = Store.whUsage();
    r2.appendChild(card('仓库库容', '已用 / 总容量',
      Chart.bar({
        horizontal: true, height: 200, max: 100,
        labels: wu.map(function (x) { return x.warehouse.name.replace('中心仓', '').replace('中转仓', '·中'); }),
        series: [{ name: '利用率', values: wu.map(function (x) { return x.rate; }), color: '#8b5cf6' }],
        showValue: true, legend: false, yFmt: function (v) { return v + '%'; }
      })
    ));
    var po = Store.list('purchases');
    r2.appendChild(card('采购转化漏斗', '下单 → 入库',
      Chart.funnel({
        height: 200, width: 380,
        data: [
          { name: '已下单', value: po.filter(function (p) { return p.status !== 'cancelled'; }).length },
          { name: '已审批', value: po.filter(function (p) { return ['approved', 'purchasing', 'shipped', 'received'].indexOf(p.status) >= 0; }).length },
          { name: '已发运', value: po.filter(function (p) { return ['shipped', 'received'].indexOf(p.status) >= 0; }).length },
          { name: '已入库', value: po.filter(function (p) { return p.status === 'received'; }).length }
        ], fmt: function (v) { return v + ' 单'; }
      })
    ));
    var alerts = Store.alerts().slice(0, 6);
    r2.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '风险预警' }), U.el('div', { class: 'sub', text: Store.alerts().length + ' 条待处理' })]),
        U.el('span', { class: 'badge red', text: '实时' })
      ]),
      U.el('div', { class: 'card-body' }, U.el('div', { class: 'warn-list' }, alerts.map(function (a) {
        var c = a.level === 'high' ? 'var(--danger)' : a.level === 'mid' ? 'var(--warn)' : 'var(--muted-2)';
        return U.el('div', { class: 'it' }, [
          U.el('i', { class: 'dot', style: { background: c } }),
          U.el('div', { class: 'txt' }, [
            U.el('div', { class: 'bold', text: a.title }),
            U.el('div', { class: 't-xs muted', text: a.desc })
          ]),
          U.el('span', { class: 'badge gray plain', text: a.type })
        ]);
      })))
    ]));

    /* 待办 + 分类结构 */
    var r3 = U.el('div', { class: 'a-grid-21 mt16' });
    root.appendChild(r3);
    var pending = po.filter(function (p) { return p.status === 'pending'; }).slice(0, 8);
    r3.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '待审批采购单' }), U.el('div', { class: 'sub', text: po.filter(function (p) { return p.status === 'pending'; }).length + ' 单待处理' })]),
        U.el('a', { class: 'btn sm', href: '#/purchases', text: '去处理 →' })
      ]),
      U.el('div', { class: 'table-wrap' }, (function () {
        if (!pending.length) return U.el('div', { class: 'empty', text: '暂无待审批单据' });
        var t = A.ui.table([
          { t: '单号', k: 'no', fmt: function (r) { return U.el('span', { class: 'mono', text: r.no }); } },
          { t: '供应商', k: 'supplierName' },
          { t: '金额', k: 'amount', num: true, fmt: function (r) { return U.moneyY(r.amount); } },
          { t: '期望到货', k: 'expectedAt' },
          { t: '采购员', k: 'buyer' }
        ], pending, { onRowClick: function () { location.hash = '#/purchases'; } });
        return t;
      }()))
    ]));
    var cd = U.sortBy(Store.db.categoryData, function (x) { return x.amount; }, 'desc');
    r3.appendChild(card('采购品类结构', '按物料分类（万元）',
      Chart.donut({
        data: cd.map(function (x, i) { return { name: x.category, value: x.amount, color: Chart.PALETTE[i] }; }),
        size: 180, legendVertical: true,
        center: { value: U.money(U.sum(cd, function (x) { return x.amount; })), label: '总额(万)' }
      })
    ));

    /* 准时率与质量 */
    root.appendChild(U.el('div', { class: 'card mt16' }, [
      U.el('div', { class: 'card-head' }, [
        U.el('div', null, [U.el('h3', { text: '交付质量趋势' }), U.el('div', { class: 'sub', text: '准时交付率 / 来料合格率 / 退货率（%）' })])
      ]),
      U.el('div', { class: 'card-body' }, Chart.line({
        labels: m.map(function (x) { return U.monthLabel(x.month); }), height: 230, area: false, min: 0, max: 100,
        series: [
          { name: '准时交付率', values: m.map(function (x) { return x.onTime; }), color: '#2563eb' },
          { name: '质量合格率', values: m.map(function (x) { return x.quality; }), color: '#16a34a' },
          { name: '退货率(×10)', values: m.map(function (x) { return U.round(x.returnRate * 10, 1); }), color: '#dc2626', dash: '4 3' }
        ], tipFmt: function (v) { return v + '%'; }, yFmt: function (v) { return v + '%'; }
      }))
    ]));
    return root;
  };

  /* ==============================================================
     2. 供应商管理
     ============================================================== */
  A.pages.suppliers = function () {
    var sups = Store.list('suppliers');
    var strip = function () {
      var s = U.el('div');
      s.appendChild(A.ui.kpi('供应商总数', sups.length, ' 家', null, null, ''));
      s.appendChild(A.ui.kpi('A 级战略', sups.filter(function (x) { return x.level === 'A'; }).length, ' 家', null, null, 'k3'));
      s.appendChild(A.ui.kpi('平均准时率', U.pct(U.avg(sups, function (x) { return x.onTimeRate; })), '', null, null, 'k2'));
      s.appendChild(A.ui.kpi('高风险', sups.filter(function (x) { return x.riskScore > 55; }).length, ' 家', null, null, 'k4'));
      return [s.firstChild, s.children[1], s.children[2], s.children[3]];
    };

    /* 保存前统一处理：自定义城市、省份→区域 */
    function normalizeSupplier(v) {
      if (v.city === '__custom__') v.city = (v.cityCustom || '').trim();
      delete v.cityCustom;
      if (v.province && !v.region) v.region = Seed.regionOf(v.province);
      if (!v.city) { U.toast('请选择或填写城市', 'err'); return false; }
      return v;
    }

    var page = A.crudPage({
      store: 'suppliers',
      title: '供应商管理',
      keywordPlaceholder: '搜索名称 / 城市 / 联系人',
      searchKeys: ['name', 'city', 'category', 'contact', 'code'],
      sortBy: function (x) { return x.rating; },
      filters: [
        { key: 'region', label: '全部区域', options: Seed.REGIONS.map(function (r) { return [r, r]; }) },
        { key: 'level', label: '全部等级', options: [['A', 'A 级'], ['B', 'B 级'], ['C', 'C 级']] },
        { key: 'status', label: '全部状态', options: [['active', '合作中'], ['pending', '待审核'], ['suspended', '已暂停']] }
      ],
      strip: strip,
      actionWidth: '160px',
      deleteImpact: function (rows) {
        var ids = {};
        rows.forEach(function (r) { ids[r.id] = 1; });
        var n = Store.list('purchases').filter(function (p) { return ids[p.supplierId]; }).length;
        return n ? '⚠ 有 ' + n + ' 条采购单关联了这些供应商。删除后采购单仍会保留，但对应的供应商档案将无法查询。' : '';
      },
      columns: [
        {
          t: '供应商', k: 'name', fmt: function (r) {
            return U.el('div', null, [
              U.el('div', { class: 'bold link', text: r.name, onclick: function (e) { e.stopPropagation(); openDrawer(r); } }),
              U.el('div', { class: 't-xs muted', text: r.code + ' · ' + (r.province ? r.province + ' ' : '') + r.city + ' · ' + r.contact })
            ]);
          }
        },
        { t: '品类', k: 'category', fmt: function (r) { return U.el('span', { class: 'tag', text: r.category }); } },
        { t: '等级', k: 'level', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.level, r.level); } },
        {
          t: '准时率', k: 'onTimeRate', num: true, fmt: function (r) {
            return U.el('span', { class: r.onTimeRate >= 95 ? 'down' : (r.onTimeRate < 88 ? 'up' : ''), text: r.onTimeRate + '%' });
          }
        },
        { t: '合格率', k: 'qualityRate', num: true, fmt: function (r) { return r.qualityRate + '%'; } },
        { t: '交期', k: 'leadTime', num: true, fmt: function (r) { return r.leadTime + ' 天'; } },
        { t: '累计采购', k: 'totalAmount', num: true, fmt: function (r) { return U.money(r.totalAmount); } },
        {
          t: '风险', k: 'riskScore', num: true, fmt: function (r) {
            var c = r.riskScore > 55 ? 'red' : r.riskScore > 35 ? 'amber' : 'green';
            return U.el('span', { class: 'badge ' + c, text: r.riskScore });
          }
        },
        { t: '状态', k: 'status', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.supStatus, r.status); } }
      ],
      rowActions: [
        {
          label: '详情', fn: function (r) { openDrawer(r); }
        },
        {
          label: '暂停', needEdit: true, cls: 'danger',
          show: function (r) { return r.status !== 'suspended'; },
          fn: function (r, refresh) {
            U.confirm('确定暂停与「' + r.name + '」的合作？', function () {
              Store.update('suppliers', r.id, { status: 'suspended' }); refresh(); U.toast('已暂停合作', 'ok');
            });
          }
        },
        {
          label: '恢复', needEdit: true,
          show: function (r) { return r.status === 'suspended'; },
          fn: function (r, refresh) { Store.update('suppliers', r.id, { status: 'active' }); refresh(); U.toast('已恢复合作', 'ok'); }
        }
      ],
      fields: [
        { k: 'name', label: '供应商名称', required: true },
        { k: 'code', label: '供应商编码', required: true },
        { k: 'province', label: '所属省份', type: 'select', options: [['', '请选择省份']].concat(Seed.PROVINCES.map(function (p) { return [p.name, p.name]; })), required: true },
        { k: 'city', label: '城市', type: 'select', options: [['', '请先选择省份']], required: true },
        { k: 'category', label: '主营品类', type: 'suggest', options: Seed.CATS, required: true, ph: '可直接填写，或从已有品类中选择' },
        { k: 'region', label: '所属区域（随省份自动带出）', type: 'select', options: Seed.REGIONS.map(function (r) { return [r, r]; }) },
        { k: 'level', label: '等级', type: 'select', options: [['A', 'A 级战略'], ['B', 'B 级合格'], ['C', 'C 级观察']] },
        { k: 'status', label: '状态', type: 'select', options: [['active', '合作中'], ['pending', '待审核'], ['suspended', '已暂停']] },
        { k: 'onTimeRate', label: '准时率(%)', type: 'number' },
        { k: 'qualityRate', label: '合格率(%)', type: 'number' },
        { k: 'leadTime', label: '标准交期(天)', type: 'number' },
        { k: 'contact', label: '联系人' },
        { k: 'phone', label: '联系电话' },
        { k: 'email', label: '邮箱' },
        { k: 'cert', label: '资质认证' },
        { k: 'capacity', label: '月产能', type: 'number' },
        { k: 'remark', label: '备注', type: 'textarea', full: true }
      ],
      /* 省份 → 城市 级联联动；兼容旧数据（按城市反查省份） */
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
        // 「其他」→ 手动填写城市
        var custom = U.el('input', {
          class: 'input', 'data-f': 'cityCustom', placeholder: '填写城市名称',
          style: { display: 'none', marginTop: '8px' }
        });
        cSel.parentNode.appendChild(custom);

        function fillCities(keep) {
          var prov = pSel.value;
          var list = Seed.citiesOf(prov);
          cSel.innerHTML = '';
          cSel.appendChild(U.el('option', { value: '', text: prov ? '请选择城市' : '请先选择省份' }));
          list.forEach(function (c) { cSel.appendChild(U.el('option', { value: c, text: c })); });
          var customOpt = U.el('option', { value: '__custom__', text: '＋ 其他（手动填写）' });
          cSel.appendChild(customOpt);
          // 保留老数据里不在标准清单中的城市
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
          code: 'S' + (1000 + sups.length), level: 'B', status: 'pending',
          onTimeRate: 90, qualityRate: 95, leadTime: 14, cert: 'ISO9001',
          since: U.today(), totalAmount: 0, rating: 3, riskScore: 30,
          region: '华东', province: '上海市', city: '上海', category: Seed.CATS[0]
        };
      },
      onEdit: function (src, v) {
        if (normalizeSupplier(v) === false) return false;
        ['onTimeRate', 'qualityRate', 'leadTime', 'totalAmount', 'capacity'].forEach(function (k) {
          if (v[k] !== '') v[k] = Number(v[k]);
        });
        v.riskScore = U.round(Math.max(0, 100 - v.onTimeRate * 0.5 - v.qualityRate * 0.4 - (30 - v.leadTime) * 0.6), 0);
        v.rating = U.round((v.onTimeRate / 100 * 0.4 + v.qualityRate / 100 * 0.4) * 5, 1);
        return v;
      },
      onCreate: function (v) {
        if (normalizeSupplier(v) === false) return false;
        ['onTimeRate', 'qualityRate', 'leadTime', 'totalAmount', 'capacity'].forEach(function (k) {
          if (v[k] !== '') v[k] = Number(v[k]); else v[k] = 0;
        });
        v.id = 'SUP' + U.pad(sups.length + 1);
        v.short = String(v.name || '新').slice(0, 2);
        v.riskScore = U.round(Math.max(0, 100 - v.onTimeRate * 0.5 - v.qualityRate * 0.4 - (30 - v.leadTime) * 0.6), 0);
        v.rating = U.round((v.onTimeRate / 100 * 0.4 + v.qualityRate / 100 * 0.4) * 5, 1);
        v.since = U.today();
        v.priceIndex = 100;
        return v;
      },
      onRowClick: function (r) { openDrawer(r); }
    });

    /* 供应商详情抽屉 */
    function openDrawer(s) {
      var mask = U.el('div', { class: 'drawer-mask', onclick: function () { close(); } });
      var pos = Store.list('purchases').filter(function (p) { return p.supplierId === s.id && p.status !== 'cancelled'; });
      var inds = [
        { name: '准时交付', max: 100 }, { name: '质量合格', max: 100 },
        { name: '交期响应', max: 100 }, { name: '价格优势', max: 100 },
        { name: '产能规模', max: 100 }, { name: '协同配合', max: 100 }
      ];
      var drawer = U.el('div', { class: 'drawer' }, [
        U.el('div', { class: 'drawer-head' }, [
          U.el('div', null, [
            U.el('h3', { text: s.name }),
            U.el('div', { class: 'row gap8 mt8' }, [
              A.ui.badgeEnum(Store.ENUMS.level, s.level),
              A.ui.badgeEnum(Store.ENUMS.supStatus, s.status),
              U.el('span', { class: 'tag', text: s.code })
            ])
          ]),
          U.el('button', { class: 'modal-close', html: '&times;', onclick: function () { close(); } })
        ]),
        U.el('div', { class: 'drawer-body col gap16' }, [
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '基本信息' }),
            U.el('div', { class: 'dl' }, [
              U.el('dt', { text: '主营品类' }), U.el('dd', { text: s.category }),
              U.el('dt', { text: '所在地区' }), U.el('dd', { text: [s.region, s.province, s.city].filter(Boolean).join(' · ') || '-' }),
              U.el('dt', { text: '联系人' }), U.el('dd', { text: s.contact + ' · ' + s.phone }),
              U.el('dt', { text: '邮箱' }), U.el('dd', { text: s.email }),
              U.el('dt', { text: '资质' }), U.el('dd', { text: s.cert }),
              U.el('dt', { text: '合作起始' }), U.el('dd', { text: s.since + '（' + U.diffDays(s.since) + ' 天）' }),
              U.el('dt', { text: '月产能' }), U.el('dd', { text: U.num(s.capacity) })
            ])
          ]),
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '能力画像' }),
            Chart.radar({
              size: 300, indicators: inds,
              series: [{
                name: s.short, color: '#2563eb',
                values: [s.onTimeRate, s.qualityRate, Math.max(0, 100 - s.leadTime * 2.5),
                Math.max(0, 200 - s.priceIndex * 1.1), Math.min(100, s.capacity / 400), Math.min(100, s.rating * 20)]
              }]
            })
          ]),
          U.el('div', { class: 'card card-pad' }, [
            U.el('h4', { class: 'mb12', text: '合作概览' }),
            U.el('div', { class: 'grid g3 tc' }, [
              U.el('div', null, [U.el('div', { class: 't-xl bold', text: pos.length }), U.el('div', { class: 't-xs muted', text: '采购单数' })]),
              U.el('div', null, [U.el('div', { class: 't-xl bold', text: U.money(U.sum(pos, function (p) { return p.amount; })) }), U.el('div', { class: 't-xs muted', text: '累计金额(万)' })]),
              U.el('div', null, [U.el('div', { class: 't-xl bold', text: s.rating }), U.el('div', { class: 't-xs muted', text: '综合评分' })])
            ]),
            U.el('div', { class: 'mt16' }, [
              U.el('div', { class: 't-sm muted mb8', text: '近期采购单' }),
              pos.length ? A.ui.table([
                { t: '单号', k: 'no', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.no }); } },
                { t: '金额', k: 'amount', num: true, fmt: function (r) { return U.moneyY(r.amount); } },
                { t: '状态', k: 'status', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.poStatus, r.status); } }
              ], U.sortBy(pos, function (p) { return p.createdAt; }, 'desc').slice(0, 5), { mini: true })
                : U.el('div', { class: 'empty t-sm', text: '暂无采购记录' })
            ])
          ])
        ])
      ]);
      function close() { mask.remove(); drawer.remove(); }
      document.body.appendChild(mask);
      document.body.appendChild(drawer);
    }

    return page;
  };

  /* ==============================================================
     3. 采购管理
     ============================================================== */
  A.pages.purchases = function () {
    var pos = Store.list('purchases');
    var strip = function () {
      var s = U.el('div');
      s.appendChild(A.ui.kpi('采购单总数', pos.length, ' 单', null, null, ''));
      s.appendChild(A.ui.kpi('采购总金额', U.money(U.sum(pos.filter(function (p) { return p.status !== 'cancelled'; }), function (p) { return p.amount; })), '', null, null, 'k2'));
      s.appendChild(A.ui.kpi('待审批', pos.filter(function (p) { return p.status === 'pending'; }).length, ' 单', null, null, 'k4'));
      s.appendChild(A.ui.kpi('已入库', pos.filter(function (p) { return p.status === 'received'; }).length, ' 单', null, null, 'k3'));
      return [s.firstChild, s.children[1], s.children[2], s.children[3]];
    };

    /* 明细编辑器实现见 po-editor.js（A.buildPoItemsEditor） */

    var page = A.crudPage({
      store: 'purchases',
      title: '采购管理',
      keywordPlaceholder: '搜索单号 / 供应商',
      searchKeys: ['no', 'supplierName', 'buyer'],
      sortBy: function (x) { return x.createdAt; },
      filters: [
        { key: 'status', label: '全部状态', options: Object.keys(Store.ENUMS.poStatus).map(function (k) { return [k, Store.ENUMS.poStatus[k][0]]; }) }
      ],
      strip: strip,
      actionWidth: '220px',
      columns: [
        { t: '单号', k: 'no', fmt: function (r) { return U.el('span', { class: 'mono t-sm', text: r.no }); } },
        {
          t: '供应商', k: 'supplierName', fmt: function (r) {
            return U.el('div', null, [
              U.el('div', { class: 'bold', text: r.supplierName }),
              U.el('div', { class: 't-xs muted', text: (r.items ? r.items.length : 0) + ' 项物料' })
            ]);
          }
        },
        { t: '金额', k: 'amount', num: true, fmt: function (r) { return U.el('b', { text: U.moneyY(r.amount) }); } },
        { t: '下单日期', k: 'createdAt' },
        {
          t: '预计到货', k: 'expectedAt', fmt: function (r) {
            var late = ['approved', 'purchasing', 'shipped'].indexOf(r.status) >= 0 && new Date(r.expectedAt) < new Date();
            return U.el('span', { class: late ? 'up' : '', text: r.expectedAt + (late ? ' ⚠' : '') });
          }
        },
        { t: '收货仓', k: 'warehouseId', fmt: function (r) { return Store.warehouseName(r.warehouseId); } },
        { t: '采购员', k: 'buyer' },
        { t: '部门经理', k: 'managerName', width: '96px', fmt: function (r) { return U.el('span', { class: 't-sm', text: r.managerName || '—' }); } },
        { t: '业务操作员', k: 'operatorName', width: '96px', fmt: function (r) { return U.el('span', { class: 't-sm', text: r.operatorName || '—' }); } },
        { t: '状态', k: 'status', fmt: function (r) { return A.ui.badgeEnum(Store.ENUMS.poStatus, r.status); } },
        { t: '审批流程', k: 'flow', width: '110px', fmt: function (r) {
          if (!r.flow) return U.el('span', { class: 't-xs muted', text: r.status === 'draft' ? '未发起' : '普通单' });
          return A.ui.badgeEnum(Store.ENUMS.poFlow, r.flow);
        } }
      ],
      rowActions: [
        { label: '明细', fn: function (r) { openDetail(r); } },
        {
          label: '发起流程', needEdit: true, show: function (r) { return !r.flow && Store.currentUser().role === 'admin'; },
          fn: function (r) { doFlowAction(r, 'assign_manager', refreshAll); }
        },
        {
          label: '流程', show: function (r) { return !!r.flow; },
          fn: function (r) { openFlowDrawer(r, refreshAll); }
        },
        {
          label: '审批', needEdit: true, show: function (r) { return !r.flow && r.status === 'pending'; },
          fn: function (r, refresh) {
            U.confirm('审批通过采购单「' + r.no + '」？金额 ' + U.moneyY(r.amount), function () {
              Store.update('purchases', r.id, { status: 'approved' }); refresh(); U.toast('已审批通过', 'ok');
            }, '采购审批');
          }
        },
        {
          label: '入库', needEdit: true, show: function (r) { return ['approved', 'purchasing', 'shipped'].indexOf(r.status) >= 0; },
          fn: function (r, refresh) {
            U.confirm('确认采购单「' + r.no + '」已到货入库？将同步增加对应仓库库存。', function () {
              Store.update('purchases', r.id, { status: 'received', receivedAt: U.today() });
              // 同步入库
              (r.items || []).forEach(function (it) {
                var iv = Store.list('inventory').filter(function (x) { return x.productId === it.productId && x.warehouseId === r.warehouseId; })[0];
                if (iv) Store.update('inventory', iv.id, { qty: iv.qty + it.qty, available: iv.qty + it.qty - iv.locked });
              });
              refresh(); U.toast('已入库，库存已同步', 'ok');
            }, '入库确认');
          }
        }
      ],
      /* ---------- 自定义表单：基础信息 + 明细（名称/等级/实时汇率） ---------- */
      formXWide: true,
      formBuilder: function (body, src, isNew) {
        var grid = U.el('div', { class: 'grid g3', style: { gap: '14px' } });
        function addField(label, ctl, full) {
          var f = U.el('div', { class: 'field' }, [U.el('label', { text: label }), ctl]);
          if (full) f.style.gridColumn = '1 / -1';
          grid.appendChild(f);
        }
        addField('采购单号', U.el('input', { class: 'input', 'data-f': 'no', value: src.no || Store.nextNo('PO', 'purchases'), disabled: true }));
        addField('供应商', U.select('supplierId', Store.list('suppliers').map(function (s) { return [s.id, s.name]; }), src.supplierId));
        addField('收货仓库', U.select('warehouseId', Store.list('warehouses').map(function (w) { return [w.id, w.name]; }), src.warehouseId));
        addField('采购员', U.input('buyer', src.buyer, '如 张伟'));
        addField('状态', U.select('status', Object.keys(Store.ENUMS.poStatus).map(function (k) { return [k, Store.ENUMS.poStatus[k][0]]; }), src.status || 'draft'));
        addField('下单日期', U.el('input', { class: 'input', 'data-f': 'createdAt', type: 'date', value: src.createdAt || U.today() }));
        addField('预计到货', U.el('input', { class: 'input', 'data-f': 'expectedAt', type: 'date', value: src.expectedAt || U.addDays(null, 14) }));
        addField('备注', U.textarea('remark', src.remark), true);
        body.appendChild(grid);
        A.buildPoItemsEditor(body, src.items, src.currency);
      },
      defaultRow: function () {
        return {
          no: Store.nextNo('PO', 'purchases'), status: 'draft', buyer: '张伟',
          createdAt: U.today(), expectedAt: U.addDays(null, 14), amount: 0,
          currency: 'EUR', items: [],
          supplierId: Store.list('suppliers')[0].id,
          warehouseId: Store.firstWarehouseId(),
          supplierName: Store.list('suppliers')[0].name
        };
      },
      onCreate: function (v, body) {
        var items = body._collectItems ? body._collectItems() : [];
        if (!items.length) { U.toast('请至少添加一条采购明细', 'err'); return false; }
        if (items.some(function (x) { return !x.name; })) { U.toast('请填写每条明细的产品名称', 'err'); return false; }
        var synced = A.syncPoItemsToProducts(items, v.supplierId);
        items = synced.items;
        if (synced.created) {
          var tip = global.I18n && global.I18n.translate ? global.I18n.translate('已自动建档新产品到产品管理') : '已自动建档新产品到产品管理';
          U.toast(tip + ' (+' + synced.created + ')', 'ok');
        }
        v.amount = U.round(U.sum(items, function (x) { return x.amount; }), 2);
        v.items = items;
        v.currency = body._poCurrency ? body._poCurrency() : 'EUR';
        var s = Store.supplier(v.supplierId);
        v.supplierName = s ? s.name : '-';
        v.receivedAt = null;
        return v;
      },
      onEdit: function (src, v, body) {
        var items = body._collectItems ? body._collectItems() : [];
        if (!items.length) { U.toast('请至少添加一条采购明细', 'err'); return false; }
        if (items.some(function (x) { return !x.name; })) { U.toast('请填写每条明细的产品名称', 'err'); return false; }
        var synced = A.syncPoItemsToProducts(items, v.supplierId);
        items = synced.items;
        if (synced.created) {
          var tip = global.I18n && global.I18n.translate ? global.I18n.translate('已自动建档新产品到产品管理') : '已自动建档新产品到产品管理';
          U.toast(tip + ' (+' + synced.created + ')', 'ok');
        }
        v.amount = U.round(U.sum(items, function (x) { return x.amount; }), 2);
        v.items = items;
        v.currency = body._poCurrency ? body._poCurrency() : 'EUR';
        var s = Store.supplier(v.supplierId);
        if (s) v.supplierName = s.name;
        return v;
      },
      onRowClick: function (r) { openDetail(r); }
    });

    /* ---------- 采购审批流程看板 + 工作流 UI ---------- */
    var boardBox = U.el('div');
    function rebuildBoard() { boardBox.innerHTML = ''; boardBox.appendChild(buildFlowBoard(refreshAll)); }
    function refreshAll() { try { if (page.refresh) page.refresh(); } catch (e) { } rebuildBoard(); }
    rebuildBoard();

    var root = U.el('div', { class: 'a-page' });
    root.appendChild(boardBox);
    root.appendChild(page);

    /* ---------- 详情弹窗 ---------- */
    function openDetail(r) {
      var body = U.el('div', { class: 'col gap16' });
      body.appendChild(U.el('div', { class: 'dl' }, [
        U.el('dt', { text: '单号' }), U.el('dd', { class: 'mono', text: r.no }),
        U.el('dt', { text: '供应商' }), U.el('dd', { text: r.supplierName }),
        U.el('dt', { text: '金额' }), U.el('dd', { class: 'bold', text: U.moneyY(r.amount) }),
        U.el('dt', { text: '状态' }), U.el('dd', null, A.ui.badgeEnum(Store.ENUMS.poStatus, r.status)),
        U.el('dt', { text: '下单 / 到货' }), U.el('dd', { text: r.createdAt + ' → ' + r.expectedAt + (r.receivedAt ? '（实际 ' + r.receivedAt + '）' : '') }),
        U.el('dt', { text: '收货仓' }), U.el('dd', { text: Store.warehouseName(r.warehouseId) }),
        U.el('dt', { text: '备注' }), U.el('dd', { text: r.remark || '-' })
      ]));
      var items = r.items || [];
      var detailTable = A.ui.table([
        {
          t: '缩略图', k: 'thumb', fmt: function (x) {
            return x.thumb
              ? U.thumb(x.thumb, 44, function () { U.lightbox([x.thumb], 0); })
              : U.el('span', { class: 'muted-2', text: '—' });
          }
        },
        {
          t: '产品名称', k: 'name', fmt: function (x) {
            var pd = Store.product(x.productId);
            return U.el('div', { style: { maxWidth: '260px' } }, [
              U.el('div', { class: 'bold', style: { whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.35' }, text: x.name || (pd ? pd.name : '-') }),
              pd ? U.el('div', { class: 't-xs muted mono', text: pd.sku }) : null
            ]);
          }
        },
        { t: '等级', k: 'grade', fmt: function (x) { return U.el('span', { text: x.grade || (function () { var pd = Store.product(x.productId); return pd ? pd.spec : '-'; })() }); } },
        { t: '采购价', k: 'price', num: true, fmt: function (x) { return U.el('b', { text: U.moneyY(x.price) }); } },
        {
          t: '外币价', k: 'foreignPrice', num: true, fmt: function (x) {
            var cur = x.currency || r.currency || 'EUR';
            var v = x.foreignPrice != null ? x.foreignPrice : (x.eurPrice != null ? x.eurPrice : null);
            if (v == null) v = U.round((x.price || 0) / A.poFxRate(cur), 2);
            return U.el('div', null, [
              U.el('b', { text: A.poFxSymbol(cur) + U.num(v, 2) }),
              U.el('div', { class: 't-xs muted', text: A.poCurrencyName(cur) + ' · 1' + A.poFxSymbol(cur) + '=' + U.num(x.fxRate || A.poFxRate(cur), 4) + '¥' })
            ]);
          }
        },
        { t: '数量', k: 'qty', num: true, fmt: function (x) { return U.num(x.qty); } },
        { t: '重量', k: 'weight', num: true, fmt: function (x) { var w = x.weight != null ? x.weight : (function () { var pd = Store.product(x.productId); return pd ? pd.weight : 0; })(); return U.el('span', { text: U.num(w, 2) + ' kg' }); } },
        { t: '箱规', k: 'boxSpec', fmt: function (x) { return U.el('span', { class: 't-sm', text: x.boxSpec || (function () { var pd = Store.product(x.productId); return pd ? pd.boxSpec : '-'; })() }); } },
        { t: '小计', k: 'amount', num: true, fmt: function (x) { return U.moneyY(x.amount); } }
      ], items, { mini: true, emptyText: '该单据暂无明细' });

      /* 最后一行汇总：总数量 / 总重量 / 金额合计，数值落在各自对应的列下方 */
      if (items.length) {
        var sumQty = 0, sumWeight = 0, sumAmount = 0;
        items.forEach(function (x) {
          var q = Number(x.qty) || 0;
          var w = Number(x.weight != null ? x.weight : (function () { var pd = Store.product(x.productId); return pd ? pd.weight : 0; })()) || 0;
          var a = Number(x.amount);
          if (!isFinite(a)) a = q * (Number(x.price) || 0);
          sumQty += q;
          sumWeight += w;                  /* 总重量 = Σ(明细「重量」列)，与总数量 / 金额合计同为列求和 */
          sumAmount += a;
        });
        var foot = U.el('tfoot'), fr = U.el('tr', { class: 'po-total-row' });
        fr.appendChild(U.el('td', { colspan: 5, class: 'num' }, U.el('b', { text: '合计' })));
        fr.appendChild(U.el('td', { class: 'num' }, [
          U.el('b', { text: U.num(sumQty) }),
          U.el('div', { class: 't-xs muted', text: '总数量' })
        ]));
        fr.appendChild(U.el('td', { class: 'num', title: '总重量为明细「重量」列之和（各行单件重量）' }, [
          U.el('b', { text: U.num(sumWeight, 2) + ' kg' }),
          U.el('div', { class: 't-xs muted', text: '总重量' })
        ]));
        fr.appendChild(U.el('td', { text: '—' }));
        fr.appendChild(U.el('td', { class: 'num' }, [
          U.el('b', { class: 't-lg', text: U.moneyY(sumAmount) }),
          U.el('div', { class: 't-xs muted', text: '金额合计' })
        ]));
        foot.appendChild(fr);
        detailTable.querySelector('table').appendChild(foot);
      }
      body.appendChild(detailTable);
      U.modal({ title: '采购单明细', body: body, hideOk: true, cancelText: '关闭', wide: true, xwide: true });
    }

    /* ============================================================
       采购审批流程看板
       ------------------------------------------------------------
       阶段：待经理指派 → 待操作员处理 → 待经理审核 → 已审核通过；已驳回单列
       看板按当前登录角色作用域展示（经理只看自己负责的、操作员只看指派给自己的）
       ============================================================ */
    function buildFlowBoard(refresh) {
      var me = Store.currentUser();
      var all = Store.list('purchases').filter(function (p) { return p.flow; });
      if (me.role === 'manager') all = all.filter(function (p) { return p.managerId === me.id; });
      else if (me.role === 'operator') all = all.filter(function (p) { return p.operatorId === me.id; });
      var stages = Store.poWorkflow.STEPS.concat(['rejected']);
      var box = U.el('div', { class: 'card mb16' });
      box.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', null, [
          U.el('h3', { text: '采购审批流程看板' }),
          U.el('div', { class: 'sub', text: '超级管理员建单 → 指派经理 → 经理指派操作员 → 操作员提交 → 经理审核通过转正式订单' })
        ]),
        U.el('span', { class: 'badge ' + Store.roleColor(me.role), text: '当前身份：' + Store.roleLabel(me.role) })
      ]));
      var cols = U.el('div', { class: 'flow-cols' });
      stages.forEach(function (stage) {
        var items = all.filter(function (p) { return p.flow === stage; });
        var col = U.el('div', { class: 'flow-col' }, [
          U.el('div', { class: 'flow-col-h' }, [
            A.ui.badgeEnum(Store.ENUMS.poFlow, stage),
            U.el('span', { class: 'flow-count', text: String(items.length) })
          ])
        ]);
        if (!items.length) col.appendChild(U.el('div', { class: 'flow-empty', text: '—' }));
        items.forEach(function (p) { col.appendChild(flowCard(p, refresh)); });
        cols.appendChild(col);
      });
      box.appendChild(cols);
      return box;
    }

    function flowCard(p, refresh) {
      var card = U.el('div', { class: 'flow-card' }, [
        U.el('div', { class: 'row between' }, [
          U.el('span', { class: 'mono t-xs', text: p.no }),
          A.ui.badgeEnum(Store.ENUMS.poStatus, p.status)
        ]),
        U.el('div', { class: 'bold t-sm mt4', text: p.supplierName }),
        U.el('div', { class: 't-xs muted', text: '金额 ' + U.moneyY(p.amount) }),
        U.el('div', { class: 'flow-assign t-xs' }, [
          U.el('span', { text: '经理 ' + (p.managerName || '未指派') }),
          U.el('span', { text: '操作员 ' + (p.operatorName || '未指派') })
        ])
      ]);
      var acts = Store.poWorkflow.actionsFor(p);
      if (acts.length) {
        var bar = U.el('div', { class: 'flow-acts' });
        acts.forEach(function (a) {
          if (a.action === 'view') return;
          bar.appendChild(U.el('button', {
            class: 'btn sm ' + (a.primary ? 'primary' : 'ghost'),
            text: a.label,
            onclick: function (e) { e.stopPropagation(); doFlowAction(p, a.action, refresh); }
          }));
        });
        card.appendChild(bar);
      }
      card.addEventListener('click', function () { openFlowDrawer(p, refresh); });
      return card;
    }

    function openFlowDrawer(po, refresh) {
      var body = U.el('div', { class: 'col gap14' });
      body.appendChild(U.el('div', { class: 'dl' }, [
        U.el('dt', { text: '单号' }), U.el('dd', { class: 'mono', text: po.no }),
        U.el('dt', { text: '供应商' }), U.el('dd', { text: po.supplierName }),
        U.el('dt', { text: '金额' }), U.el('dd', { class: 'bold', text: U.moneyY(po.amount) }),
        U.el('dt', { text: '生命周期状态' }), U.el('dd', null, A.ui.badgeEnum(Store.ENUMS.poStatus, po.status)),
        U.el('dt', { text: '审批流程' }), U.el('dd', null, po.flow ? A.ui.badgeEnum(Store.ENUMS.poFlow, po.flow) : U.el('span', { class: 't-xs muted', text: '未发起（普通采购单）' })),
        U.el('dt', { text: '创建人' }), U.el('dd', { text: po.creatorName || '—' }),
        U.el('dt', { text: '部门经理' }), U.el('dd', { text: po.managerName || '未指派' }),
        U.el('dt', { text: '业务操作员' }), U.el('dd', { text: po.operatorName || '未指派' }),
        U.el('dt', { text: '备注' }), U.el('dd', { text: po.remark || '-' })
      ]));
      body.appendChild(timelineBlock(po));
      var acts = Store.poWorkflow.actionsFor(po);
      if (acts.length) {
        var row = U.el('div', { class: 'row gap8 wrap' }, acts.map(function (a) {
          if (a.action === 'view') return null;
          return U.el('button', {
            class: 'btn sm ' + (a.primary ? 'primary' : 'ghost'),
            text: a.label,
            onclick: function () { modalApi.close(); doFlowAction(po, a.action, refresh); }
          });
        }).filter(Boolean));
        body.appendChild(U.el('div', { class: 'card card-pad' }, [U.el('div', { class: 't-xs bold mb8', text: '流程操作' }), row]));
      }
      body.appendChild(U.el('button', { class: 'btn', text: '查看采购单明细', onclick: function () { modalApi.close(); openDetail(po); } }));
      var modalApi = U.modal({ title: '采购审批流程 · ' + po.no, body: body, hideOk: true, cancelText: '关闭', wide: true, xwide: true });
    }

    function timelineBlock(po) {
      var box = U.el('div', { class: 'card card-pad' }, [U.el('h4', { text: '流程记录' })]);
      var tl = po.timeline || [];
      if (!tl.length) { box.appendChild(U.el('div', { class: 't-xs muted', text: '暂无流程记录' })); return box; }
      var list = U.el('div', { class: 'timeline' });
      tl.forEach(function (t) {
        list.appendChild(U.el('div', { class: 'tl-item' }, [
          U.el('div', { class: 'tl-dot' }),
          U.el('div', { class: 'grow' }, [
            U.el('div', { class: 'row between' }, [
              U.el('b', { class: 't-sm', text: t.actionLabel }),
              U.el('span', { class: 't-xs muted', text: (t.at || '').slice(0, 16) })
            ]),
            U.el('div', { class: 't-xs muted', text: t.byName + '（' + Store.roleLabel(t.byRole) + '）' }),
            t.note ? U.el('div', { class: 't-xs mt4', text: '备注：' + t.note }) : null
          ])
        ]));
      });
      box.appendChild(list);
      return box;
    }

    function pickUser(role, title, cb) {
      var users = Store.usersByRole(role);
      var body = U.el('div', { class: 'col gap8' });
      if (!users.length) body.appendChild(U.el('div', { class: 't-xs muted', text: '没有可用的「' + Store.roleLabel(role) + '」账号' }));
      users.forEach(function (u) {
        body.appendChild(U.el('button', {
          class: 'btn block', text: u.name + '（' + (u.dept || '-') + '）',
          onclick: function () { api.close(); cb(u); }
        }));
      });
      var api = U.modal({ title: title, body: body, hideOk: true, cancelText: '取消' });
    }

    /* 执行一个流程动作，统一刷新看板 + 列表 */
    function doFlowAction(po, action, refresh) {
      function run(payload) {
        var fresh = Store.find('purchases', po.id);
        if (!fresh) return;
        var ok = Store.poWorkflow.apply(fresh, action, payload || {});
        if (ok) { U.toast('操作成功', 'ok'); if (refresh) refresh(); }
        else U.toast('操作失败或无权限', 'err');
      }
      if (action === 'assign_manager') {
        pickUser('manager', '指派部门经理', function (u) { run({ userId: u.id, name: u.name }); });
      } else if (action === 'assign_operator') {
        pickUser('operator', '指派业务操作员', function (u) { run({ userId: u.id, name: u.name }); });
      } else if (action === 'submit') {
        var body = U.el('div', { class: 'col gap10' }, [
          U.el('div', { class: 't-sm muted', text: '提交后单据将送交部门经理审核，确认提交？' }),
          U.el('label', { class: 't-xs muted', text: '提交备注（可选）' }),
          U.el('textarea', { class: 'input', placeholder: '如：已按需求完成采购明细填报', id: 'flowNoteInput' })
        ]);
        U.modal({
          title: '提交审核 · ' + po.no, body: body, okText: '确认提交', onOk: function () {
            var ta = document.getElementById('flowNoteInput');
            run({ note: ta ? ta.value : '' });
          }
        });
      } else if (action === 'approve') {
        U.confirm('审核通过采购单「' + po.no + '」？通过后即转为正式采购订单。', function () { run({}); }, '审核通过');
      } else if (action === 'reject') {
        var body2 = U.el('div', { class: 'col gap10' }, [
          U.el('div', { class: 't-sm muted', text: '驳回后将退回业务操作员重新处理，请填写驳回原因。' }),
          U.el('textarea', { class: 'input', placeholder: '驳回原因（必填）', id: 'flowRejectInput' })
        ]);
        U.modal({
          title: '驳回 · ' + po.no, body: body2, okText: '确认驳回', okClass: 'danger', onOk: function () {
            var ta = document.getElementById('flowRejectInput');
            var note = ta ? ta.value : '';
            if (!String(note).trim()) { U.toast('请填写驳回原因', 'err'); return false; }
            run({ note: String(note).trim() });
          }
        });
      }
    }

    return root;
  };

  global.Admin = A;
})(window);
