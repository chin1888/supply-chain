/* ============================================================
   SCM · 采购单明细编辑器（admin/pages-core.js 的 purchases 专用）
   - 名称可自由填写（带产品建议，长名称自动换行显示在明细里）
   - 等级固定四档：A quality / 1:1 / Orginal / Pure Original
   - 外币价（欧元 / 美元）按实时汇率折算，列头显示当前汇率
   - 编辑器底部展示欧元、美元近 7 日汇率走势
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Store = global.Store, FX = global.FX, Chart = global.Chart;
  var A = global.Admin;

  var GRADES = (global.Seed && global.Seed.GRADES) || ['A quality', '1:1', 'Orginal', 'Pure Original'];
  var DEFAULT_GRADE = (global.Seed && global.Seed.DEFAULT_GRADE) || '1:1';
  A.PO_GRADES = GRADES;
  A.PO_CURRENCIES = ['EUR', 'USD'];

  A.poCurrencyName = function (c) { return c === 'USD' ? '美元' : '欧元'; };
  A.poCurrencyLabel = function (c) { return c === 'USD' ? '美元价' : '欧元价'; };
  A.poFxSymbol = function (c) { return c === 'USD' ? '$' : '€'; };
  A.poFxRate = function (c) { return FX ? FX.rate(c) : (c === 'USD' ? 7.13 : 7.82); };

  function fxMetaText() {
    if (!FX) return '汇率模块未加载';
    var names = {
      frankfurter: '欧洲央行 ECB 中间价',
      'currency-api': 'currency-api（jsDelivr）',
      'er-api': 'exchangerate-api',
      offline: '内置离线参考值',
      cache: '本地缓存'
    };
    var t = FX.updatedAt ? new Date(FX.updatedAt) : null;
    var hhmm = t ? (('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2)) : '—';
    return (FX.isLive ? '实时' : '离线') + ' · ' + (names[FX.source] || FX.source) + ' · 更新 ' + hhmm;
  }

  A.buildPoItemsEditor = function (container, items, currency) {
    var products = Store.list('products');
    var byName = {};
    products.forEach(function (p) { byName[String(p.name).trim().toLowerCase()] = p; });

    var state = { currency: currency === 'USD' ? 'USD' : 'EUR' };
    var rows = [];
    var rowsBox = U.el('div', { class: 'col gap6' });
    var totalNode = U.el('b', { class: 't-lg', text: '¥0.00', dataset: { poSum: 'amount' } });
    var qtyNode = U.el('b', { text: '0', dataset: { poSum: 'qty' } });
    var weightNode = U.el('b', { text: '0.00 kg', dataset: { poSum: 'weight' } });
    var fxHeadLabel = U.el('span', { class: 't-xs muted', style: { display: 'block', marginTop: '-2px' } });
    var fxHeadTitle = U.el('span', { class: 'bold', text: A.poCurrencyLabel(state.currency) + ' ' + A.poFxSymbol(state.currency) });
    var nameHead = U.el('span', { text: '产品名称 *' });

    /* ---------- 产品名称建议 ---------- */
    var dlId = 'poProdList_' + Math.random().toString(36).slice(2, 7);
    var dl = U.el('datalist', { id: dlId });
    products.forEach(function (p) {
      dl.appendChild(U.el('option', { value: p.name, label: p.sku + ' · ¥' + p.unitPrice }));
    });

    function recalcTotal() {
      var total = 0, qty = 0, weight = 0;
      rows.forEach(function (r) {
        var q = Number(r._qty.value) || 0;
        var p = Number(r._price.value) || 0;
        var w = Number(r._weight.value) || 0;
        total += q * p;
        qty += q;
        weight += w;                  /* 总重量 = Σ(各行「重量」输入框)，与明细表汇总口径一致 */
      });
      totalNode.textContent = '¥' + U.num(total, 2);
      qtyNode.textContent = U.num(qty);
      weightNode.textContent = U.num(weight, 2) + ' kg';
    }

    function refreshFxHeaders() {
      var c = state.currency;
      fxHeadTitle.textContent = A.poCurrencyLabel(c) + ' ' + A.poFxSymbol(c);
      fxHeadLabel.textContent = '1' + A.poFxSymbol(c) + ' = ' + U.num(A.poFxRate(c), 4) + ' ¥';
      rows.forEach(function (r) {
        r._sym.textContent = A.poFxSymbol(c);
        r._fx.title = A.poCurrencyLabel(c) + '，按 1' + A.poFxSymbol(c) + '=' + U.num(A.poFxRate(c), 4) + '¥ 自动折算，可手改';
      });
    }

    /* ---------- 单行缩略图（压缩至 220px） ---------- */
    function buildThumbCell(cell, row) {
      var fileInput = U.el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      function render() {
        cell.innerHTML = '';
        cell.appendChild(fileInput);
        if (row._thumb) {
          var wrap = U.el('div', { style: { position: 'relative', width: '56px', height: '56px' } });
          wrap.appendChild(U.thumb(row._thumb, 56, function () { U.lightbox([row._thumb], 0); }));
          wrap.appendChild(U.el('button', {
            text: '×', title: '移除图片',
            onclick: function (e) { e.stopPropagation(); row._thumb = null; render(); },
            style: {
              position: 'absolute', top: '-6px', right: '-6px', width: '16px', height: '16px',
              borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff',
              cursor: 'pointer', fontSize: '10px', lineHeight: '16px', padding: 0
            }
          }));
          cell.appendChild(wrap);
        } else {
          cell.appendChild(U.el('button', {
            class: 'btn', text: '＋', title: '上传产品图片',
            onclick: function () { fileInput.click(); },
            style: { width: '56px', height: '56px', borderStyle: 'dashed', color: 'var(--muted)', fontSize: '18px', padding: 0 }
          }));
        }
      }
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) return;
        U.compressImage(f, 220, 0.75).then(function (d) {
          row._thumb = d; render();
        }).catch(function (e) { U.toast(e.message || '图片处理失败', 'err'); });
      });
      render();
    }

    /* ---------- 新增一行 ---------- */
    function addRow(it) {
      it = it || {};
      var row = U.el('div', { class: 'row gap6', dataset: { row: '1' }, style: { alignItems: 'center' } });
      row._thumb = it.thumb || null;
      row._pid = it.productId || null;

      var thumbCell = U.el('div', { style: { flex: '0 0 56px' } });
      buildThumbCell(thumbCell, row);

      var name = U.el('input', {
        class: 'input', 'data-n': '1', list: dlId,
        placeholder: '填写产品名称，可从建议中选',
        value: it.name || '',
        title: it.name || '',
        style: { flex: '2.6 1 150px', minWidth: '150px' }
      });

      var grade = U.el('select', { class: 'select', 'data-g': '1', style: { flex: '0 0 116px' } });
      GRADES.forEach(function (g) {
        var on = it.grade ? it.grade === g : g === DEFAULT_GRADE;
        grade.appendChild(U.el('option', { value: g, text: g, selected: on ? true : null }));
      });

      var price = U.el('input', {
        class: 'input', type: 'number', step: '0.01', min: '0', 'data-p': '1',
        value: it.price != null ? it.price : '',
        style: { flex: '0 0 86px' }
      });

      var sym = U.el('span', { class: 't-xs muted', style: { position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }, text: A.poFxSymbol(state.currency) });
      var fx = U.el('input', {
        class: 'input', type: 'number', step: '0.01', min: '0', 'data-e': '1',
        style: { paddingLeft: '20px' },
        title: A.poCurrencyLabel(state.currency) + '，按实时汇率自动折算，可手改'
      });
      var fxWrap = U.el('div', { style: { position: 'relative', flex: '0 0 110px' } }, [sym, fx]);

      var qty = U.el('input', { class: 'input', type: 'number', min: '1', 'data-q': '1', value: it.qty != null ? it.qty : 100, style: { flex: '0 0 78px' } });
      var weight = U.el('input', { class: 'input', type: 'number', step: '0.01', min: '0', 'data-w': '1', title: '单件重量 kg，可改', value: it.weight != null ? it.weight : '', style: { flex: '0 0 78px' } });
      var box = U.el('input', { class: 'input', 'data-b': '1', title: '箱规，可改', value: it.boxSpec || '', style: { flex: '1.3 1 120px', minWidth: '110px' } });
      var sub = U.el('span', { class: 'num t-sm nowrap', style: { width: '88px', textAlign: 'right' } });

      row._name = name; row._grade = grade; row._price = price; row._fx = fx;
      row._qty = qty; row._weight = weight; row._box = box; row._sym = sym; row._sub = sub;

      function syncFx() {
        var cny = Number(price.value) || 0;
        fx.value = cny ? U.round(cny / A.poFxRate(state.currency), 2) : '';
      }
      function recalcRow() {
        var q = Number(qty.value) || 0, p = Number(price.value) || 0;
        sub.textContent = '¥' + U.num(q * p, 2);
        recalcTotal();
      }
      function fillFromProduct(p) {
        if (!p) return;
        price.value = p.unitPrice != null ? p.unitPrice : '';
        if (p.weight != null) weight.value = p.weight;
        if (p.boxSpec) U.setVal(box, p.boxSpec);
        if (GRADES.indexOf(grade.value) < 0) grade.value = DEFAULT_GRADE;
        syncFx(); recalcRow();
      }

      /* 名称输入：命中产品则带出价格 / 重量 / 箱规，未命中则保留手填名称 */
      name.addEventListener('input', function () {
        var key = String(name.value).trim().toLowerCase();
        name.title = name.value;
        var p = byName[key];
        if (p) {
          var changed = row._pid !== p.id;
          row._pid = p.id;
          if (changed) fillFromProduct(p);
        } else {
          row._pid = null;
        }
      });
      price.addEventListener('input', function () { syncFx(); recalcRow(); });
      qty.addEventListener('input', recalcRow);
      fx.addEventListener('input', function () { fx.dataset.touched = '1'; });

      if (it.name) {
        if (it.price == null || it.price === '') {
          var p0 = byName[String(it.name).trim().toLowerCase()];
          if (p0) price.value = p0.unitPrice;
        }
        var legacyFx = it.foreignPrice != null ? it.foreignPrice : it.eurPrice;
        if (legacyFx != null) fx.value = legacyFx;
        else syncFx();
      } else {
        // 新行留空，名称由用户填写（placeholder 提示）
        syncFx();
      }
      recalcRow();

      row.appendChild(thumbCell);
      row.appendChild(name);
      row.appendChild(grade);
      row.appendChild(price);
      row.appendChild(fxWrap);
      row.appendChild(qty);
      row.appendChild(weight);
      row.appendChild(box);
      row.appendChild(U.el('button', {
        class: 'btn sm ghost', text: '✕', title: '删除该行',
        onclick: function () {
          var i = rows.indexOf(row);
          if (i >= 0) rows.splice(i, 1);
          row.remove(); recalcTotal();
        }
      }));
      row.appendChild(sub);

      rows.push(row);
      rowsBox.appendChild(row);
      recalcTotal();   /* 打开编辑弹窗时立即汇总，避免初始显示 0 */
    }

    /* ---------- 近 7 日汇率面板（逐日列表） ---------- */
    function buildRatePanel() {
      var panel = U.el('div', { class: 'col gap10', style: { paddingTop: '12px', borderTop: '1px dashed var(--border)' } });
      var meta = U.el('span', { class: 't-xs muted' });
      var listBox = U.el('div', { class: 'col' });

      var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      function dayLabel(d) {
        if (d === U.today()) return '今天';
        var dt = new Date(d + 'T00:00:00');
        return d.slice(5) + ' ' + (WEEK[dt.getDay()] || '');
      }
      function deltaCell(diff, pct) {
        if (diff == null) return U.el('span', { class: 'muted-2 t-xs', text: '—' });
        var flat = Math.abs(diff) < 0.00005;
        if (flat) return U.el('span', { class: 'muted t-xs', text: '持平' });
        return U.el('span', {
          class: 't-xs ' + (diff > 0 ? 'up' : 'down'),
          text: (diff > 0 ? '▲ +' : '▼ ') + U.num(Math.abs(diff), 4) + ' (' + (diff > 0 ? '+' : '-') + U.num(Math.abs(pct), 2) + '%)'
        });
      }

      function render() {
        listBox.innerHTML = '';
        var eur = FX ? FX.series('EUR', 7) : [];
        var usd = FX ? FX.series('USD', 7) : [];
        var mapE = {}, mapU = {}, dates = [];
        eur.forEach(function (x) { if (dates.indexOf(x.date) < 0) dates.push(x.date); mapE[x.date] = x.rate; });
        usd.forEach(function (x) { if (dates.indexOf(x.date) < 0) dates.push(x.date); mapU[x.date] = x.rate; });
        dates.sort();
        // 数据缺失时用当前汇率补齐
        if (!dates.length) {
          for (var i = 6; i >= 0; i--) { var dd = U.addDays(null, -i); dates.push(dd); mapE[dd] = A.poFxRate('EUR'); mapU[dd] = A.poFxRate('USD'); }
        }

        var COLS = '112px minmax(0,1fr) 132px minmax(0,1fr) 132px';
        var head = U.el('div', {
          class: 'row t-xs muted',
          style: { display: 'grid', gridTemplateColumns: COLS, gap: '8px', padding: '0 12px 7px', alignItems: 'center' }
        }, [
          U.el('span', { text: '日期' }),
          U.el('span', { class: 'nowrap', text: '欧元 EUR · 1€ 兑 ¥' }),
          U.el('span', { class: 'nowrap', style: { textAlign: 'right' }, text: '较前日' }),
          U.el('span', { class: 'nowrap', text: '美元 USD · 1$ 兑 ¥' }),
          U.el('span', { class: 'nowrap', style: { textAlign: 'right' }, text: '较前日' })
        ]);

        var table = U.el('div', {
          class: 'col',
          style: { border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)' }
        });
        table.appendChild(U.el('div', { style: { paddingTop: '8px' } }, [head]));

        // 最新在上
        dates.slice().reverse().forEach(function (d, ri) {
          var idx = dates.indexOf(d);
          var prevE = idx > 0 ? mapE[dates[idx - 1]] : null;
          var prevU = idx > 0 ? mapU[dates[idx - 1]] : null;
          var e = mapE[d], u = mapU[d];
          var dE = (prevE != null && e != null) ? e - prevE : null;
          var dU = (prevU != null && u != null) ? u - prevU : null;
          var isToday = d === U.today();

          var row = U.el('div', {
            style: {
              display: 'grid', gridTemplateColumns: COLS, gap: '8px', alignItems: 'center',
              padding: '9px 12px',
              borderTop: ri === 0 ? 'none' : '1px solid var(--border)',
              background: isToday ? 'rgba(37,99,235,.06)' : ''
            }
          }, [
            U.el('div', { class: 'row gap6' }, [
              U.el('span', { class: 't-sm ' + (isToday ? 'bold' : ''), text: dayLabel(d) }),
              isToday ? U.el('span', {
                class: 't-xs', text: '今日',
                style: { padding: '1px 6px', borderRadius: '999px', background: 'rgba(37,99,235,.12)', color: '#2563eb' }
              }) : null
            ].filter(Boolean)),
            U.el('b', {
              class: 'num t-md' + (state.currency === 'EUR' ? '' : ' muted'),
              text: e != null ? '¥' + U.num(e, 4) : '—'
            }),
            U.el('div', { style: { textAlign: 'right' } }, [deltaCell(dE, prevE ? dE / prevE * 100 : 0)]),
            U.el('b', {
              class: 'num t-md' + (state.currency === 'USD' ? '' : ' muted'),
              text: u != null ? '¥' + U.num(u, 4) : '—'
            }),
            U.el('div', { style: { textAlign: 'right' } }, [deltaCell(dU, prevU ? dU / prevU * 100 : 0)])
          ]);
          table.appendChild(row);
        });

        listBox.appendChild(table);
        meta.textContent = fxMetaText();
      }

      panel.appendChild(U.el('div', { class: 'row between wrap gap8' }, [
        U.el('div', null, [
          U.el('b', { class: 't-sm', text: '近 7 日汇率（逐日）' }),
          U.el('div', { class: 't-xs muted', text: '采购明细外币价按当日最新汇率折算，可手动覆盖单行外币价' })
        ]),
        meta
      ]));
      panel.appendChild(listBox);
      render();

      if (FX) {
        var off = FX.subscribe(function () {
          if (!document.body.contains(container)) { off(); return; }
          render();
          refreshFxHeaders();
          rows.forEach(function (r) {
            // 汇率刷新后，未被手改过的外币价重新折算
            if (!r._fx.dataset.touched) r._fx.value = (Number(r._price.value) || 0) ? U.round((Number(r._price.value) || 0) / A.poFxRate(state.currency), 2) : '';
          });
        });
        container._fxOff = off;
      }
      return panel;
    }

    /* ---------- 组装 ---------- */
    var currBtns = {};
    var currGroup = U.el('div', { class: 'row gap4', style: { padding: '2px', background: 'var(--surface-2)', borderRadius: '8px' } });
    A.PO_CURRENCIES.forEach(function (c) {
      var b = U.el('button', {
        class: 'btn sm ' + (state.currency === c ? 'primary' : 'ghost'),
        text: A.poFxSymbol(c) + ' ' + A.poCurrencyName(c),
        title: '按' + A.poCurrencyName(c) + '汇率折算',
        onclick: function () { setCurrency(c); }
      });
      currBtns[c] = b;
      currGroup.appendChild(b);
    });

    function setCurrency(c) {
      state.currency = c;
      Object.keys(currBtns).forEach(function (k) {
        currBtns[k].className = 'btn sm ' + (k === c ? 'primary' : 'ghost');
      });
      rows.forEach(function (r) {
        if (!r._fx.dataset.touched || !Number(r._fx.value)) {
          r._fx.value = (Number(r._price.value) || 0) ? U.round((Number(r._price.value) || 0) / A.poFxRate(c), 2) : '';
        }
      });
      refreshFxHeaders();
    }

    var head = U.el('div', { class: 'row between wrap gap10' }, [
      U.el('div', null, [
        U.el('b', { class: 't-sm', text: '采购明细' }),
        U.el('div', { class: 't-xs muted', text: '名称可直接填写；选中已有产品会自动带出采购价 / 重量 / 箱规' })
      ]),
      U.el('div', { class: 'row gap10' }, [
        U.el('span', { class: 't-xs muted', text: '计价货币' }),
        currGroup,
        U.el('button', { class: 'btn sm primary', text: '+ 添加产品', onclick: function () { addRow(null); } })
      ])
    ]);

    var headerRow = U.el('div', { class: 't-xs muted row gap6', style: { alignItems: 'center', paddingRight: '38px' } }, [
      U.el('span', { style: { flex: '0 0 56px' }, text: '缩略图' }),
      U.el('span', { style: { flex: '2.6 1 150px', minWidth: '150px' } }, [nameHead]),
      U.el('span', { style: { flex: '0 0 116px' }, text: '等级' }),
      U.el('span', { style: { flex: '0 0 86px' }, text: '采购价 ¥' }),
      U.el('span', { style: { flex: '0 0 110px' } }, [fxHeadTitle, fxHeadLabel]),
      U.el('span', { style: { flex: '0 0 78px' }, text: '数量' }),
      U.el('span', { style: { flex: '0 0 78px' }, text: '重量 kg' }),
      U.el('span', { style: { flex: '1.3 1 120px', minWidth: '110px' }, text: '箱规' }),
      U.el('span', { style: { width: '88px', textAlign: 'right' }, text: '小计' })
    ]);

    container.appendChild(dl);
    container.appendChild(U.el('div', { class: 'col gap8' }, [
      head,
      U.el('div', { style: { overflowX: 'auto' } }, [
        U.el('div', { style: { minWidth: '940px' } }, [headerRow, U.el('div', { class: 'col gap6', style: { marginTop: '6px' } }, [rowsBox])])
      ]),
      U.el('div', {
        class: 'row between',
        style: { padding: '10px 12px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border)', gap: '12px', flexWrap: 'wrap' }
      }, [
        U.el('span', { class: 't-sm muted', text: '合计（自动计算）' }),
        U.el('div', { class: 'row', style: { gap: '24px', alignItems: 'center', flexWrap: 'wrap' } }, [
          U.el('div', { class: 'col', style: { alignItems: 'flex-end', gap: '2px' } }, [
            qtyNode, U.el('span', { class: 't-xs muted', text: '总数量' })
          ]),
          U.el('div', { class: 'col', style: { alignItems: 'flex-end', gap: '2px' }, title: '总重量为明细「重量」列之和（各行单件重量）' }, [
            weightNode, U.el('span', { class: 't-xs muted', text: '总重量' })
          ]),
          U.el('div', { class: 'col', style: { alignItems: 'flex-end', gap: '2px' } }, [
            totalNode, U.el('span', { class: 't-xs muted', text: '金额合计' })
          ])
        ])
      ]),
      U.el('div', { class: 't-xs muted', text: '每行可单独上传一张产品缩略图（自动压缩至 220px）；外币价按实时汇率自动折算，手动修改后会保留。' })
    ]));

    container.appendChild(buildRatePanel());

    (items && items.length ? items : [null]).forEach(function (it) { addRow(it); });
    refreshFxHeaders();

    container._poCurrency = function () { return state.currency; };
    container._collectItems = function () {
      return rows.filter(function (r) { return r.isConnected; }).map(function (r) {
        var q = Number(r._qty.value) || 0;
        var p = Number(r._price.value) || 0;
        var pd = r._pid ? Store.product(r._pid) : null;
        return {
          productId: r._pid || null,
          name: String(U.rawVal(r._name)).trim() || (pd ? pd.name : ''),
          thumb: r._thumb || null,
          grade: r._grade.value,
          price: p,
          currency: state.currency,
          fxRate: U.round(A.poFxRate(state.currency), 4),
          foreignPrice: Number(r._fx.value) || 0,
          qty: q,
          weight: Number(r._weight.value) || 0,
          boxSpec: String(U.rawVal(r._box)).trim(),
          amount: U.round(q * p, 2)
        };
      }).filter(function (x) { return x.qty > 0; });
    };
  };

  /* ============================================================
     采购明细 → 产品主数据联动（仅关联，不自动建档）
     ------------------------------------------------------------
     保存采购单时，把每条明细关联到「产品管理」的产品主数据：
       · 名称命中已有产品 → 直接关联 productId（不重复建档）
       · 名称未命中       → 不自动建档，明细仅保留名称文本
     产品主数据只由用户在「产品管理」显式创建，避免每次保存采购单都把
     明细名称批量建成产品（分类被强制成默认、造成数量虚高与分类错误）。
     ============================================================ */
  A.syncPoItemsToProducts = function (items, supplierId) {
    var St = global.Store, U = global.U;
    if (!St || !items) return { items: items || [], created: 0 };
    var byName = {};
    St.list('products').forEach(function (p) { byName[String(p.name).trim().toLowerCase()] = p; });
    var created = 0;
    items.forEach(function (it) {
      if (it.productId && St.product(it.productId)) return;            // 已关联且有效
      var key = String(it.name || '').trim().toLowerCase();
      if (!key) return;
      var hit = byName[key];
      if (hit) { it.productId = hit.id; created++; }                   // 仅关联已有产品，不再自动建档
    });
    return { items: items, created: created };
  };
})(window);
