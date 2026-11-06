/* ============================================================
   SCM · 产品档案字段定义（前后台共用）
   ------------------------------------------------------------
   单一字段源：新增 / 编辑表单、列表列、详情抽屉「全部字段」、
   CSV 导出、前台产品目录详情，全部从这里取，保证「包含产品的所有信息」。
   显示格式化函数惰性读取 U / Store / Seed，避免脚本加载顺序耦合。
   ============================================================ */
(function (global) {
  'use strict';

  function seed() { return global.Seed || {}; }
  function store() { return global.Store || {}; }
  function u() { return global.U; }
  function fixed(arr) { return function () { return arr || []; }; }
  function opt(fn) { return fn; }

  var GROUPS = [
    { k: 'basic', label: '基础档案' },
    { k: 'supply', label: '价格与供应' },
    { k: 'pack', label: '包装与库存' },
    { k: 'meta', label: '档案记录' }
  ];

  function n(v, digits) { var U = u(); return U ? U.num(v, digits) : (v == null ? '-' : v); }
  function money(v) { var U = u(); return U ? U.moneyY(v, 2) : v; }
  function withUnit(v, unit) { return (v == null || v === '') ? '-' : n(v) + ' ' + unit; }

  var FIELDS = [
    /* ---------- 基础档案 ---------- */
    { k: 'image', label: '产品图片', g: 'basic', type: 'image', full: true,
      fmt: function (v) { return v ? '已上传图片' : '未上传图片'; } },
    { k: 'name', label: '产品名称', g: 'basic', type: 'text', required: true, ph: '可填写较长的产品名称', width: '1.6' },
    { k: 'sku', label: 'SKU 编码', g: 'basic', type: 'text', required: true, mono: true },
    { k: 'barcode', label: '条码', g: 'basic', type: 'text', mono: true },
    { k: 'category', label: '产品分类', g: 'basic', type: 'select',
      formHide: true, /* 分类跟随主供应商，表单不再手动选择，保存时自动派生 */
      options: opt(function () { return seed().CATS || []; }) },
    { k: 'grade', label: '等级', g: 'basic', type: 'select',
      options: opt(function () { return seed().GRADES || []; }) },
    { k: 'status', label: '状态', g: 'basic', type: 'select',
      options: opt(function () { return seed().PRODUCT_STATUS || []; }),
      fmt: function (v) { var e = store().ENUMS && store().ENUMS.prodStatus; return (e && e[v] && e[v][0]) || v || '-'; } },
    { k: 'brand', label: '品牌', g: 'basic', type: 'suggest',
      options: opt(function () { return seed().BRANDS || []; }) },
    { k: 'origin', label: '产地', g: 'basic', type: 'suggest',
      options: opt(function () {
        var out = [], S = seed();
        Object.keys(S.CITIES || {}).forEach(function (rg) { (S.CITIES[rg] || []).forEach(function (c) { out.push(c); }); });
        return out;
      }) },
    { k: 'spec', label: '规格型号', g: 'basic', type: 'suggest',
      options: opt(function () { return seed().SPECS || []; }) },
    { k: 'material', label: '材质', g: 'basic', type: 'suggest',
      options: opt(function () { return seed().MATERIALS || []; }) },
    { k: 'color', label: '颜色', g: 'basic', type: 'suggest',
      options: opt(function () { return seed().COLORS || []; }) },
    { k: 'unit', label: '计量单位', g: 'basic', type: 'select',
      options: opt(function () { return seed().UNITS || []; }) },

    /* ---------- 价格与供应 ---------- */
    { k: 'supplierId', label: '主供应商', g: 'supply', type: 'select', required: true,
      options: opt(function () { return store().list('suppliers').map(function (s) { return [s.id, s.name]; }); }),
      fmt: function (v) { return store().supplierName ? store().supplierName(v) : (v || '-'); },
      csv: function (p) { return store().supplierName ? store().supplierName(p.supplierId) : p.supplierId; } },
    { k: 'backupSupplierId', label: '备选供应商', g: 'supply', type: 'select',
      options: opt(function () { return [['', '无']].concat(store().list('suppliers').map(function (s) { return [s.id, s.name]; })); }),
      fmt: function (v) { return v ? (store().supplierName ? store().supplierName(v) : v) : '无'; },
      csv: function (p) { return p.backupSupplierId ? (store().supplierName ? store().supplierName(p.backupSupplierId) : p.backupSupplierId) : ''; } },
    { k: 'unitPrice', label: '采购单价', g: 'supply', type: 'number', step: '0.01', required: true,
      fmt: function (v) { return money(v); } },
    { k: 'eurPrice', label: '欧元参考价', g: 'supply', type: 'number', step: '0.01',
      fmt: function (v) { return v == null || v === '' ? '-' : '€' + n(v, 2); } },
    { k: 'usdPrice', label: '美元参考价', g: 'supply', type: 'number', step: '0.01',
      fmt: function (v) { return v == null || v === '' ? '-' : '$' + n(v, 2); } },
    { k: 'taxRate', label: '税率', g: 'supply', type: 'number', step: '0.1',
      fmt: function (v) { return withUnit(v, '%'); } },
    { k: 'hsCode', label: 'HS 编码', g: 'supply', type: 'text', mono: true },
    { k: 'moq', label: '最小起订量', g: 'supply', type: 'number',
      fmt: function (v, p) { return withUnit(v, p && p.unit ? p.unit : ''); } },
    { k: 'leadTime', label: '采购提前期', g: 'supply', type: 'number',
      fmt: function (v) { return withUnit(v, '天'); } },

    /* ---------- 包装与库存 ---------- */
    { k: 'weight', label: '单件重量', g: 'pack', type: 'number', step: '0.01',
      fmt: function (v) { return withUnit(v, 'kg'); } },
    { k: 'boxSpec', label: '箱规', g: 'pack', type: 'text' },
    { k: 'safetyStock', label: '安全库存', g: 'pack', type: 'number',
      fmt: function (v, p) { return withUnit(v, p && p.unit ? p.unit : ''); } },
    { k: 'shelfLife', label: '保质期', g: 'pack', type: 'number',
      fmt: function (v) { return withUnit(v, '天'); } },
    { k: 'warranty', label: '质保期', g: 'pack', type: 'number',
      fmt: function (v) { return v == null || v === '' ? '-' : n(v) + ' 个月'; } },

    /* ---------- 档案记录 ---------- */
    { k: 'remark', label: '备注', g: 'meta', type: 'textarea', full: true },
    { k: 'createdAt', label: '建档日期', g: 'meta', type: 'date', readonly: true },
    { k: 'updatedAt', label: '更新时间', g: 'meta', type: 'text', readonly: true }
  ];

  var NUMERIC = ['unitPrice', 'eurPrice', 'usdPrice', 'taxRate', 'moq', 'leadTime',
    'weight', 'safetyStock', 'shelfLife', 'warranty'];

  function options(f) { return typeof f.options === 'function' ? f.options() : (f.options || []); }
  function byKey(k) { return FIELDS.filter(function (f) { return f.k === k; })[0]; }
  function inGroup(g) { return FIELDS.filter(function (f) { return f.g === g && f.type !== 'image'; }); }

  /** 字段显示值（详情 / 表格 / 前台共用） */
  function display(p, f) {
    if (!p || !f) return '-';
    var v = p[f.k];
    if (f.fmt) return f.fmt(v, p);
    if (v == null || v === '') return '-';
    return String(v);
  }

  /** 完整档案：字段名 + 显示值，逐条列出，保证所有信息都可见
      @param hide 可选，需排除的字段 key 集合（如详情页隐藏 SKU / 条码等） */
  function rows(p, hide) {
    return FIELDS.filter(function (f) {
      return f.type !== 'image' && !(hide && hide[f.k]);
    }).map(function (f) {
      return { key: f.k, label: f.label, value: display(p, f), group: f.g };
    });
  }

  /** CSV 导出列：所有字段，关联 ID 转成可读名称 */
  function csvColumns() {
    return FIELDS.filter(function (f) { return f.type !== 'image'; }).map(function (f) {
      return {
        t: f.label, k: f.k,
        csv: function (p) {
          if (f.csv) return f.csv(p);
          return p[f.k] == null ? '' : p[f.k];
        }
      };
    });
  }

  /** 表单归一化：数值字段转数字、空串保留、去掉辅助字段 */
  function normalize(v) {
    NUMERIC.forEach(function (k) {
      if (v[k] === '' || v[k] == null) { v[k] = 0; return; }
      v[k] = Number(v[k]) || 0;
    });
    delete v.cityCustom;
    return v;
  }

  /** 默认新品档案 */
  function defaultRow() {
    var U = u(), S = seed(), St = store();
    var max = 0;
    St.list('products').forEach(function (p) {
      var m = /(\d+)$/.exec(p.sku || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return {
      sku: 'M-NEW-' + (1000 + max + 1),
      name: '', category: (S.CATS || ['电子元器件'])[0],
      grade: S.DEFAULT_GRADE || '1:1',
      status: 'active',
      brand: (S.BRANDS || ['GENERIC'])[0],
      origin: '', barcode: '', material: '', color: '',
      unit: (S.UNITS || ['件'])[0], spec: (S.SPECS || ['标准型'])[0],
      supplierId: (St.list('suppliers')[0] || {}).id || '',
      backupSupplierId: '',
      unitPrice: 0, eurPrice: 0, usdPrice: 0,
      taxRate: 13, hsCode: '', moq: 0, leadTime: 7,
      weight: 0, boxSpec: '', safetyStock: 0, shelfLife: 365, warranty: 12,
      image: null, remark: '',
      createdAt: U ? U.today() : '', updatedAt: U ? U.nowStr() : ''
    };
  }

  global.ProductSchema = {
    GROUPS: GROUPS, FIELDS: FIELDS, NUMERIC: NUMERIC,
    options: options, byKey: byKey, inGroup: inGroup,
    display: display, rows: rows, csvColumns: csvColumns,
    normalize: normalize, defaultRow: defaultRow
  };
})(window);
