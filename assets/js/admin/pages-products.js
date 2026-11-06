/* ============================================================
   SCM · 后台：产品管理
   全量产品档案列表（所有字段）/ KPI / 品类与价格带 / 全字段表单
   / 图片上传 / 完整档案抽屉 / 库存与关联单据 / 批量删除 / CSV
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Chart = global.Chart, Store = global.Store, Seed = global.Seed;
  var PS = global.ProductSchema, A = global.Admin;
  var card = A.ui.card;

  function st(p) { return Store.productStats(p.id); }
  function lvlCls(lv) { return lv < 60 ? 'bad' : (lv < 100 ? 'warn' : 'ok'); }
  function lvlBadge(lv) { return lv < 60 ? 'red' : (lv < 100 ? 'amber' : 'green'); }
  function supplierPairs() {
    return Store.list('suppliers').map(function (s) { return [s.id, s.name]; });
  }
  function statusText(key) {
    var e = Store.ENUMS.prodStatus;
    return (e[key] && e[key][0]) || key || '-';
  }
  /* 产品分类跟随主供应商：取主供应商的分类 */
  function supplierCategory(id) {
    var s = Store.supplier(id);
    return s && s.category ? s.category : null;
  }
  /* 详情页「完整产品档案」需隐藏的字段（按用户要求移除：SKU/条码/品牌/规格/材质/颜色/税率/HS编码/最小起订量） */
  var DRAWER_HIDE = { sku: 1, barcode: 1, brand: 1, spec: 1, material: 1, color: 1, taxRate: 1, hsCode: 1, moq: 1, safetyStock: 1, shelfLife: 1, warranty: 1 };

  /* ==============================================================
     表单：按字段定义生成分组表单 + 产品图片上传
     ============================================================== */
  function formControl(f, val) {
    var ctl, extra = null;
    if (f.type === 'select') ctl = U.select(f.k, PS.options(f), val);
    else if (f.type === 'textarea') ctl = U.textarea(f.k, val);
    else if (f.type === 'number') ctl = U.el('input', {
      class: 'input', 'data-f': f.k, type: 'number', step: f.step || '1',
      value: val == null ? '' : val
    });
    else if (f.type === 'date') ctl = U.el('input', {
      class: 'input', 'data-f': f.k, type: 'date', value: val || ''
    });
    else if (f.type === 'suggest') {
      var listId = 'dl-prod-' + f.k + '-' + Math.random().toString(36).slice(2, 8);
      ctl = U.el('input', {
        class: 'input', 'data-f': f.k, value: val == null ? '' : val,
        placeholder: f.ph || '可直接填写，或从建议中选择', list: listId, autocomplete: 'off'
      });
      extra = U.el('datalist', { id: listId });
      PS.options(f).forEach(function (o) {
        extra.appendChild(U.el('option', { value: Array.isArray(o) ? o[0] : o }));
      });
    } else ctl = U.input(f.k, val, f.ph);
    if (f.readonly) ctl.disabled = true;
    if (f.mono) {
      ctl.style.fontFamily = 'var(--mono)';
      /* SKU / 条码 / HS 编码是业务标识符，切换语言时不翻译显示值 */
      ctl.setAttribute('data-i18n-skip', '1');
    }
    return { ctl: ctl, extra: extra };
  }

  function buildForm(body, src, isNew) {
    /* ---------- 产品图片 ---------- */
    var imgValue = U.el('input', { type: 'hidden', 'data-f': 'image', value: src.image || '' });
    var file = U.el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    var preview = U.el('div', { class: 'row gap12', style: { alignItems: 'center', flexWrap: 'wrap' } });
    body.appendChild(imgValue);
    body.appendChild(file);

    function paintPreview() {
      preview.innerHTML = '';
      if (imgValue.value) {
        preview.appendChild(U.thumb(imgValue.value, 92, function () { U.lightbox([imgValue.value], 0); }));
      } else {
        preview.appendChild(U.el('div', { class: 'prod-img-empty', text: '暂无图片' }));
      }
      preview.appendChild(U.el('button', {
        class: 'btn sm', type: 'button', text: imgValue.value ? '更换图片' : '上传图片',
        onclick: function () { file.click(); }
      }));
      if (imgValue.value) preview.appendChild(U.el('button', {
        class: 'btn sm ghost', type: 'button', text: '移除图片',
        onclick: function () { imgValue.value = ''; paintPreview(); }
      }));
      preview.appendChild(U.el('span', { class: 't-xs muted', text: '支持 JPG / PNG，自动压缩后保存在本机' }));
    }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      U.compressImage(f, 480, 0.72).then(function (dataUrl) {
        imgValue.value = dataUrl;
        paintPreview();
        U.toast('产品图片已上传', 'ok');
      }).catch(function (e) { U.toast(e.message || '图片读取失败', 'err'); });
      file.value = '';
    });
    paintPreview();
    body.appendChild(U.el('div', { class: 'card card-pad' }, [
      U.el('h4', { class: 'mb12', text: '产品图片' }), preview
    ]));

    /* ---------- 分组字段 ---------- */
    PS.GROUPS.forEach(function (g) {
      var fields = PS.inGroup(g.k).filter(function (f) { return !(isNew && f.k === 'updatedAt') && !f.formHide; });
      var grid = U.el('div', { class: 'grid g2', style: { gap: '14px' } });
      fields.forEach(function (f) {
        var made = formControl(f, src[f.k]);
        var wrap = U.el('div', { class: 'field' }, [
          U.el('label', { text: f.label + (f.required ? ' *' : '') }),
          made.ctl, made.extra
        ]);
        if (f.full) wrap.style.gridColumn = '1 / -1';
        grid.appendChild(wrap);
      });
      body.appendChild(U.el('div', { class: 'card card-pad' }, [
        U.el('h4', { class: 'mb12', text: g.label }), grid
      ]));
    });
  }

  function validate(v, src) {
    if (!v.name || !v.sku) { U.toast('请填写产品名称和 SKU 编码', 'err'); return false; }
    if (!v.supplierId) { U.toast('请选择主供应商（产品分类将自动跟随该供应商）', 'err'); return false; }
    var dup = Store.list('products').filter(function (p) {
      return String(p.sku).toLowerCase() === String(v.sku).toLowerCase() && (!src || p.id !== src.id);
    });
    if (dup.length) { U.toast('SKU 编码已存在：' + v.sku, 'err'); return false; }
    return true;
  }
  function fillFx(v) {
    var FX = global.FX;
    var rate = function (c, fallback) { return FX && FX.rate ? (FX.rate(c) || fallback) : fallback; };
    if (!Number(v.eurPrice) && Number(v.unitPrice)) v.eurPrice = U.round(Number(v.unitPrice) / rate('EUR', 7.82), 2);
    if (!Number(v.usdPrice) && Number(v.unitPrice)) v.usdPrice = U.round(Number(v.unitPrice) / rate('USD', 7.13), 2);
  }

  /* ==============================================================
     完整档案抽屉：所有字段 + 派生经营数据
     ============================================================== */
  function dlPairs(pairs) {
    var out = [];
    pairs.forEach(function (x) {
      out.push(U.el('dt', { text: x[0] }));
      var skip = /^(SKU|条码|HS)/.test(String(x[0])) ? { 'data-i18n-skip': '1' } : {};
      var attrs = { text: x[1] == null || x[1] === '' ? '-' : x[1] };
      Object.keys(skip).forEach(function (k) { attrs[k] = skip[k]; });
      out.push(U.el('dd', attrs));
    });
    return out;
  }

  function openDrawer(p) {
    var s = st(p);
    var mask = U.el('div', { class: 'drawer-mask', onclick: close });
    var drawer = U.el('div', { class: 'drawer', style: { width: '680px' } }, [
      U.el('div', { class: 'drawer-head' }, [
        U.el('div', { class: 'row gap12', style: { alignItems: 'flex-start' } }, [
          p.image ? U.thumb(p.image, 56, function () { U.lightbox([p.image], 0); })
            : U.el('div', { class: 'prod-img-empty sm', text: '无图' }),
          U.el('div', null, [
            U.el('h3', { text: p.name }),
            U.el('div', { class: 'row gap8 mt8 wrap' }, [
              A.ui.badgeEnum(Store.ENUMS.prodStatus, p.status),
              U.el('span', { class: 'tag', text: p.category || '-' }),
              U.el('span', { class: 'tag', text: p.grade || '-' }),
              U.el('span', { class: 'mono t-xs muted', text: p.sku || '-' })
            ])
          ])
        ]),
        U.el('button', { class: 'modal-close', html: '&times;', onclick: close })
      ]),
      U.el('div', { class: 'drawer-body col gap16' }, [
        /* 关键指标 */
        U.el('div', { class: 'card card-pad' }, [
          U.el('h4', { class: 'mb12', text: '库存与经营概览' }),
          U.el('div', { class: 'row gap16 wrap', style: { alignItems: 'center' } }, [
            Chart.gauge({
              size: 165, value: Math.min(200, s.level), max: 200,
              text: U.pct(s.level, 0), label: '库存水位',
              color: s.level < 60 ? '#dc2626' : (s.level < 100 ? '#f59e0b' : '#16a34a'),
              minLabel: '0%', maxLabel: '200%'
            }),
            U.el('div', { class: 'grow', style: { minWidth: '220px' } }, [
              U.el('div', { class: 'grid g3 tc' }, [
                U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(s.available) }), U.el('div', { class: 't-xs muted', text: '可用库存' })]),
                U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(s.qty) }), U.el('div', { class: 't-xs muted', text: '库存总量' })]),
                U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.moneyY(s.value) }), U.el('div', { class: 't-xs muted', text: '库存金额' })])
              ]),
              U.el('div', { class: 'row gap8 mt16 wrap' }, [
                U.el('span', { class: 'tag', text: '锁定 ' + U.num(s.locked) }),
                U.el('span', { class: 'tag', text: '分布仓库 ' + s.warehouses + ' 座' }),
                U.el('span', { class: 'badge ' + lvlBadge(s.level), text: s.level < 100 ? '低于安全线' : '库存健康' })
              ])
            ])
          ])
        ]),
        /* 全部字段：按分组逐条列出（隐藏 DRAWER_HIDE 指定的字段） */
        U.el('div', { class: 'card card-pad' }, [
          U.el('div', { class: 'row between mb12' }, [
            U.el('h4', { text: '完整产品档案' }),
            U.el('span', { class: 't-xs muted', text: '共 ' + PS.rows(p, DRAWER_HIDE).length + ' 个字段' })
          ]),
          U.el('div', { class: 'col gap14' }, PS.GROUPS.map(function (g) {
            var rows = PS.rows(p, DRAWER_HIDE).filter(function (x) { return x.group === g.k; });
            return U.el('div', null, [
              U.el('div', { class: 't-xs bold mb8', style: { color: 'var(--primary)' }, text: g.label }),
              U.el('div', { class: 'dl prod-dl' }, dlPairs(rows.map(function (x) { return [x.label, x.value]; })))
            ]);
          }))
        ]),
        /* 库存分布 */
        U.el('div', { class: 'card card-pad' }, [
          U.el('h4', { class: 'mb12', text: '库存分布明细' }),
          (function () {
            var invs = Store.list('inventory').filter(function (x) { return x.productId === p.id; });
            if (!invs.length) return U.el('div', { class: 'empty t-sm', text: '该产品暂无库存记录' });
            return A.ui.table([
              { t: '仓库', fmt: function (r) { return Store.warehouseName(r.warehouseId); } },
              { t: '批次', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.batchNo }); } },
              { t: '库存', num: true, fmt: function (r) { return U.num(r.qty); } },
              { t: '锁定', num: true, fmt: function (r) { return U.num(r.locked); } },
              { t: '可用', num: true, fmt: function (r) { return U.num(r.available); } },
              { t: '入库日期', fmt: function (r) { return r.inboundAt || '-'; } }
            ], invs, { mini: true });
          })()
        ]),
        /* 关联业务 */
        U.el('div', { class: 'card card-pad' }, [
          U.el('h4', { class: 'mb12', text: '关联业务统计' }),
          U.el('div', { class: 'grid g3 tc mb16' }, [
            U.el('div', null, [U.el('div', { class: 't-lg bold', text: s.poDocs }), U.el('div', { class: 't-xs muted', text: '采购单数' })]),
            U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(s.poQty) }), U.el('div', { class: 't-xs muted', text: '累计采购量' })]),
            U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.moneyY(s.poAmount) }), U.el('div', { class: 't-xs muted', text: '累计采购额' })]),
            U.el('div', null, [U.el('div', { class: 't-lg bold', text: s.soDocs }), U.el('div', { class: 't-xs muted', text: '销售订单数' })]),
            U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.num(s.soQty) }), U.el('div', { class: 't-xs muted', text: '累计销售量' })]),
            U.el('div', null, [U.el('div', { class: 't-lg bold', text: U.moneyY(s.soAmount) }), U.el('div', { class: 't-xs muted', text: '累计销售额' })])
          ]),
          U.el('div', { class: 'dl' }, dlPairs([
            ['最近采购日期', s.lastPurchaseAt], ['最近销售日期', s.lastSalesAt],
            ['建档日期', p.createdAt], ['更新时间', p.updatedAt]
          ]))
        ]),
        /* 最近采购明细 */
        U.el('div', { class: 'card card-pad' }, [
          U.el('h4', { class: 'mb12', text: '最近采购记录' }),
          (function () {
            if (!s.poItems.length) return U.el('div', { class: 'empty t-sm', text: '暂无采购记录' });
            var rows = U.sortBy(s.poItems, function (x) { return x.doc.createdAt || ''; }, 'desc').slice(0, 8);
            return A.ui.table([
              { t: '单号', fmt: function (r) { return U.el('span', { class: 'mono t-xs', text: r.doc.no }); } },
              { t: '供应商', fmt: function (r) { return Store.supplierName(r.doc.supplierId); } },
              { t: '数量', num: true, fmt: function (r) { return U.num(r.item.qty); } },
              { t: '单价', num: true, fmt: function (r) { return U.moneyY(r.item.price); } },
              { t: '金额', num: true, fmt: function (r) { return U.moneyY(r.item.amount); } },
              { t: '日期', fmt: function (r) { return r.doc.createdAt || '-'; } }
            ], rows, { mini: true });
          })()
        ])
      ])
    ]);
    function close() { mask.remove(); drawer.remove(); }
    document.body.appendChild(mask);
    document.body.appendChild(drawer);
  }

  /* ==============================================================
     产品管理页
     ============================================================== */
  A.pages.products = function () {
    var products = Store.list('products');
    var stt = Store.stats();

    function strip() {
      var s = U.el('div');
      s.appendChild(A.ui.kpi('产品总数', U.num(products.length), ' 个 SKU', null, null, ''));
      s.appendChild(A.ui.kpi('在售产品', U.num(products.filter(function (p) { return p.status === 'active'; }).length), ' 个', null, null, 'k3'));
      s.appendChild(A.ui.kpi('产品品类', U.num(Object.keys(U.groupBy(products, function (p) { return p.category; })).length), ' 类', null, null, 'k2'));
      s.appendChild(A.ui.kpi('库存总值', U.money(stt.stockValue), '', null, null, 'k5'));
      return [s.firstChild, s.children[1], s.children[2], s.children[3]];
    }

    function topContent() {
      var col = U.el('div', { class: 'col gap16 mb16' });
      /* 旧版「采购自动建档」残留清理引导：仅在存在疑似自动建档产品时出现 */
      var auto = products.filter(function (p) { return p.source === 'auto'; });
      if (auto.length) {
        col.appendChild(U.el('div', { class: 'cleanup-banner' }, [
          U.el('div', { class: 't-sm', style: { flex: '1 1 320px', minWidth: '260px' }, text:
            '⚠ 检测到 ' + auto.length + ' 个旧版本自动建档的疑似重复产品（分类均为默认「' + (Seed.CATS[0]) + '」），建议清理后只保留你实际录入的产品。' }),
          U.el('button', { class: 'btn sm danger', text: '清理 ' + auto.length + ' 个', onclick: function () {
            var n = Store.removeAutoProducts();
            U.toast('已清理 ' + n + ' 个自动建档产品', 'ok');
            if (global.Admin && global.Admin.reload) global.Admin.reload();
          } })
        ]));
      }
      var wrap = U.el('div', { class: 'a-grid2' });
      var byCat = U.groupBy(products, function (p) { return p.category; });
      var donut = Object.keys(byCat).map(function (c, i) {
        return { name: c, value: byCat[c].length, color: Chart.PALETTE[i % Chart.PALETTE.length] };
      });
      wrap.appendChild(card('产品品类分布', '按 SKU 数量统计',
        donut.length ? Chart.donut({
          data: U.sortBy(donut, function (x) { return x.value; }, 'desc'), size: 190,
          center: { value: U.num(products.length), label: '产品总数' }
        }) : U.el('div', { class: 'empty', text: '暂无产品数据' })
      ));
      var bands = [
        { label: '0-50', min: 0, max: 50 },
        { label: '50-100', min: 50, max: 100 },
        { label: '100-200', min: 100, max: 200 },
        { label: '200+', min: 200, max: Infinity }
      ];
      wrap.appendChild(card('采购单价分布', '按标准采购价区间统计产品数（元）',
        Chart.bar({
          height: 210, labels: bands.map(function (b) { return b.label; }),
          series: [{
            name: '产品数', color: '#0ea5e9',
            values: bands.map(function (b) {
              return products.filter(function (p) {
                var v = Number(p.unitPrice) || 0;
                return v >= b.min && v < b.max;
              }).length;
            })
          }],
          showValue: true, legend: false
        })
      ));
      col.appendChild(wrap);
      return col;
    }

    var columns = [
      {
        t: '产品图片', width: '78px', fmt: function (r) {
          return r.image
            ? U.thumb(r.image, 48, function (e) { e.stopPropagation(); U.lightbox([r.image], 0); })
            : U.el('div', { class: 'prod-img-empty xs', text: '无图' });
        }
      },
      {
        t: '产品名称', k: 'name', width: '190px', fmt: function (r) {
          return U.el('div', null, [
            U.el('div', { class: 'bold link', text: r.name, title: r.name,
              onclick: function (e) { e.stopPropagation(); openDrawer(r); } }),
            U.el('div', { class: 't-xs muted', text: (r.brand || '-') + ' · ' + (r.origin || '-') })
          ]);
        }
      },
      {
        t: '分类', k: 'category', width: '130px', fmt: function (r) {
          return U.el('div', null, U.el('span', { class: 'tag', text: r.category || '-' }));
        }
      },
      {
        t: '等级', k: 'grade', width: '110px', fmt: function (r) {
          return U.el('span', { class: 'tag', text: r.grade || '-' });
        }
      },
      {
        t: '主 / 备选供应商', k: 'supplierId', width: '190px',
        csv: function (r) { return Store.supplierName(r.supplierId) + (r.backupSupplierId ? ' / ' + Store.supplierName(r.backupSupplierId) : ''); },
        fmt: function (r) {
          return U.el('div', null, [
            U.el('div', { class: 't-sm ellipsis', text: Store.supplierName(r.supplierId), title: Store.supplierName(r.supplierId) }),
            U.el('div', { class: 't-xs muted ellipsis', text: r.backupSupplierId ? Store.supplierName(r.backupSupplierId) : '无备选供应商' })
          ]);
        }
      },
      {
        t: '单价 / 外币参考价', k: 'unitPrice', num: true, width: '140px', fmt: function (r) {
          return U.el('div', null, [
            U.el('div', { class: 'bold', text: U.moneyY(r.unitPrice, 2) }),
            U.el('div', { class: 't-xs muted', text: '€' + U.num(r.eurPrice, 2) + ' · $' + U.num(r.usdPrice, 2) })
          ]);
        }
      },
      {
        t: '单位 / 重量 / 箱规', k: 'weight', width: '175px', fmt: function (r) {
          return U.el('div', null, [
            U.el('div', { class: 't-sm', text: (r.unit || '-') + ' · ' + U.num(r.weight, 2) + ' kg' }),
            U.el('div', { class: 't-xs muted ellipsis', text: r.boxSpec || '-', title: r.boxSpec || '' })
          ]);
        }
      },
      {
        t: '建档 / 更新', k: 'createdAt', width: '150px', fmt: function (r) {
          return U.el('div', null, [
            U.el('div', { class: 't-xs', text: r.createdAt || '-' }),
            U.el('div', { class: 't-xs muted', text: r.updatedAt || '-' })
          ]);
        }
      },
      {
        t: '备注', k: 'remark', width: '160px', fmt: function (r) {
          return U.el('div', { class: 't-xs muted ellipsis', text: r.remark || '-', title: r.remark || '' });
        }
      }
    ];

    var shown = {};
    columns.forEach(function (c) { if (c.k) shown[c.k] = 1; });
    var csvExtra = [{ t: '产品 ID', k: 'id', csv: function (r) { return r.id; } }]
      .concat(PS.csvColumns().filter(function (c) { return !shown[c.k]; }));

    var page = A.crudPage({
      store: 'products',
      title: '产品管理',
      keywordPlaceholder: '搜索名称 / SKU / 条码 / 品牌 / 产地 / 规格 / 供应商',
      searchKeys: ['name', 'sku', 'barcode', 'category', 'grade', 'brand', 'origin', 'spec',
        'material', 'color', 'unit', 'hsCode', 'remark', 'status'],
      searchExtra: function (p) {
        return Store.supplierName(p.supplierId) + ' ' + Store.supplierName(p.backupSupplierId);
      },
      sortBy: function (x) { return x.sku; },
      sortDir: 'asc',
      size: 10,
      batchHint: '勾选左侧复选框可批量删除；删除前会校验库存 / 采购 / 销售引用，被引用的产品建议改用「停用」。',
      strip: strip,
      topContent: topContent,
      tableClass: 'tbl-products',
      csvColumns: csvExtra,
      actionWidth: '190px',
      filters: [
        { key: 'category', label: '全部分类', options: Seed.CATS },
        { key: 'grade', label: '全部等级', options: Seed.GRADES },
        { key: 'status', label: '全部状态', options: Seed.PRODUCT_STATUS },
        { key: 'supplierId', label: '全部供应商', options: supplierPairs() }
      ],
      deleteImpact: function (rows) {
        var ref = Store.productRefs(rows.map(function (r) { return r.id; }));
        var parts = [];
        if (ref.inventory) parts.push(ref.inventory + ' 条库存记录');
        if (ref.purchases) parts.push(ref.purchases + ' 张采购单');
        if (ref.sales) parts.push(ref.sales + ' 张销售订单');
        return parts.length
          ? '⚠ 这些产品已被 ' + parts.join('、') + ' 引用。删除后历史单据仍会保留，但物料名称与成本价将无法反查；若只是暂停使用，建议改用「停用」。'
          : '';
      },
      columns: columns,
      rowActions: [
        { label: '详情', fn: function (r) { openDrawer(r); } },
        {
          label: '停用', needEdit: true, cls: 'danger',
          show: function (r) { return r.status === 'active'; },
          fn: function (r, refresh) {
            U.confirm('确定停用「' + r.name + '」？停用后产品档案保留，但不再作为推荐采购物料。', function () {
              Store.update('products', r.id, { status: 'inactive', updatedAt: U.nowStr() });
              refresh(); U.toast('产品已停用', 'ok');
            }, '停用产品');
          }
        },
        {
          label: '启用', needEdit: true,
          show: function (r) { return r.status !== 'active'; },
          fn: function (r, refresh) {
            Store.update('products', r.id, { status: 'active', updatedAt: U.nowStr() });
            refresh(); U.toast('产品已恢复在售', 'ok');
          }
        }
      ],
      formBuilder: buildForm,
      formXWide: true,
      defaultRow: PS.defaultRow,
      onCreate: function (v) {
        if (!validate(v)) return false;
        v = PS.normalize(v);
        fillFx(v);
        v.category = supplierCategory(v.supplierId) || v.category || (Seed.CATS && Seed.CATS[0]) || '电子元器件';
        v.id = U.uid('PR');
        v.createdAt = U.today();
        v.updatedAt = U.nowStr();
        return v;
      },
      onEdit: function (src, v) {
        if (!validate(v, src)) return false;
        v = PS.normalize(v);
        fillFx(v);
        v.category = supplierCategory(v.supplierId) || src.category || (Seed.CATS && Seed.CATS[0]) || '电子元器件';
        v.createdAt = src.createdAt || U.today();
        v.updatedAt = U.nowStr();
        return v;
      },
      onRowClick: function (r) { openDrawer(r); }
    });

    return page;
  };
})(window);
