/* ============================================================
   SCM · 数据层 Store
   localStorage 持久化 + CRUD + 业务统计计算 + 角色权限
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Seed = global.Seed;

  var KEY = 'scm_db_v3';
  var SESSION = 'scm_session_v1';

  var Store = {
    db: null,
    _subs: [],

    /* ---------- 初始化 ---------- */
    init: function () {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { }
      if (raw) {
        try { this.db = JSON.parse(raw); } catch (e) { this.db = null; }
      }
      if (!this.db || !this.db.suppliers) {
        this.db = Seed.build();
        this.save();
      }
      // 兼容旧缓存：补齐所有顶层集合字段（旧版 localStorage 可能缺 products / inventory 等，
      // 缺失会导致产品页空白、且采购建档时 Store.add('products') 因 undefined.unshift 崩溃）
      var self = this;
      var EXPECTED_ARRAYS = ['suppliers', 'products', 'warehouses', 'inventory', 'purchases', 'sales', 'shipments', 'invoices', 'users', 'monthly', 'regionData', 'categoryData'];
      var seedDb = Seed.build();
      var missing = [];
      EXPECTED_ARRAYS.forEach(function (k) {
        if (!self.db[k]) { self.db[k] = seedDb[k] || []; missing.push(k); }
        else if (!Array.isArray(self.db[k])) { self.db[k] = []; missing.push(k); }
      });
      if (!self.db.meta || typeof self.db.meta !== 'object') { self.db.meta = seedDb.meta || {}; missing.push('meta'); }
      // 兼容旧缓存：补齐新增字段（不重置已有业务数据）
      var migrated = false;
      if (missing.length) migrated = true;
      (this.db.suppliers || []).forEach(function (s) {
        if (!s.province && Seed.provinceByCity) {
          s.province = Seed.provinceByCity(s.city) || '';
          migrated = true;
        }
      });
      (this.db.warehouses || []).forEach(function (w, i) {
        if (!w.province && Seed.provinceByCity) { w.province = Seed.provinceByCity(w.city) || ''; migrated = true; }
        var defaults = {
          code: 'WH-' + U.pad(i + 1), type: '分仓', address: (w.city || '') + '市物流园区',
          area: 5000, phone: '', temperature: '常温', status: 'active',
          openedAt: '', remark: ''
        };
        Object.keys(defaults).forEach(function (k) {
          if (w[k] == null || w[k] === '') { w[k] = defaults[k]; migrated = true; }
        });
        if (Number(w.capacity) <= 0) { w.capacity = 10000; migrated = true; }
        if (Number(w.used) > Number(w.capacity)) { w.used = w.capacity; migrated = true; }
      });
      /* 兼容旧缓存：产品档案补齐新增主数据字段（不重置已有业务数据） */
      var db = this.db;
      (db.products || []).forEach(function (p, i) {
        var main = (db.suppliers || []).filter(function (s) { return s.id === p.supplierId; })[0] || {};
        var S = Seed || {};
        /* 旧版 SKU 含中文品类名，统一迁移为 ASCII 编码，避免多语言下出现中文残留 */
        if (/[\u4e00-\u9fff]/.test(String(p.sku || ''))) {
          var tail = /(\d+)$/.exec(String(p.sku)) || [];
          p.sku = 'M-' + ((S.CAT_CODES || {})[p.category] || 'GEN') + '-' + (tail[1] || U.pad(i + 1));
          migrated = true;
        }
        var defaults = {
          grade: S.DEFAULT_GRADE || '1:1',
          brand: (S.BRANDS || ['GENERIC'])[i % (S.BRANDS || [1]).length],
          origin: main.city || '',
          barcode: '69' + String(100000000000 + i),
          material: '', color: '', hsCode: '', taxRate: 13, warranty: 12,
          usdPrice: U.round((Number(p.unitPrice) || 0) / 7.13, 2),
          leadTime: main.leadTime || 7,
          image: null, remark: '',
          status: 'active',
          createdAt: U.addDays(new Date(), -365),
          updatedAt: U.nowStr()
        };
        Object.keys(defaults).forEach(function (k) {
          if (p[k] == null || p[k] === '') { p[k] = defaults[k]; migrated = true; }
        });
      });
      /* 兼容旧缓存：采购/销售明细按名称关联到已有产品（仅关联，不再自动建档） */
      try { if (global.ProductSchema) { var n = this.ensureProductLinks(); if (n) migrated = true; } } catch (e) { }
      /* 旧版「采购自动建档」会在加载时把明细批量建成产品（分类被强制成默认），
         给这类疑似自动建档的产品打上 source:'auto'，供产品管理一键清理 */
      try { var m = this.reconcileAutoProducts(); if (m) migrated = true; } catch (e) { }
      /* 产品分类跟随主供应商分类（避免分类错配） */
      try { var c2 = this.reconcileProductCategories(); if (c2) migrated = true; } catch (e) { }
      /* 每次进入系统都重算派生数据：清除历史示例账单、按真实业务单据刷新趋势/品类/区域 */
      this.save();
      return this.db;
    },
    save: function () {
      /* 财务账单与经营报表全部由实际业务单据派生，持久化前实时重算 */
      if (global.Analytics && global.Analytics.refresh) {
        try { global.Analytics.refresh(); } catch (e) { }
      }
      try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch (e) { }
      // 云端同步（方案 B）：首轮决策完成且未处于回传屏蔽态时才上传，避免启动期误覆盖云端
      if (global.Sync && global.Sync.enabled() && global.Sync.ready && !global.Sync.suppress) {
        try { global.Sync.push(this.db); } catch (e) { }
      }
      this._subs.forEach(function (f) { try { f(); } catch (e) { } });
    },
    reset: function () {
      this.db = Seed.build();
      this.save();
      U.toast('数据已重置为初始示例数据', 'ok');
    },
    subscribe: function (fn) { this._subs.push(fn); },

    /* ---------- 通用 CRUD ---------- */
    list: function (name) { return this.db[name] || []; },
    find: function (name, id) {
      return this.list(name).filter(function (x) { return x.id === id; })[0] || null;
    },
    add: function (name, obj) {
      obj.id = obj.id || U.uid(name.slice(0, 2).toUpperCase());
      this.db[name].unshift(obj);
      this.save();
      return obj;
    },
    update: function (name, id, patch) {
      var o = this.find(name, id);
      if (!o) return null;
      for (var k in patch) o[k] = patch[k];
      this.save();
      return o;
    },
    remove: function (name, id) {
      var arr = this.db[name];
      var i = arr.findIndex(function (x) { return x.id === id; });
      if (i >= 0) { arr.splice(i, 1); this.save(); return true; }
      return false;
    },
    /** 批量删除：一次性过滤并只持久化一次，返回实际删除条数 */
    removeMany: function (name, ids) {
      var arr = this.db[name] || [];
      var set = {};
      (ids || []).forEach(function (id) { set[id] = 1; });
      var before = arr.length;
      this.db[name] = arr.filter(function (x) { return !set[x.id]; });
      var n = before - this.db[name].length;
      if (n) this.save();
      return n;
    },
    nextNo: function (prefix, name) {
      var max = 0;
      this.list(name).forEach(function (x) {
        var m = /(\d+)$/.exec(x.no || '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return prefix + '-2026' + U.pad(max + 1);
    },

    /* ---------- 关联查询 ---------- */
    supplier: function (id) { return this.find('suppliers', id); },
    product: function (id) { return this.find('products', id); },
    warehouse: function (id) { return this.find('warehouses', id); },
    /** 仓库可能被全部删除，取默认仓库时给出安全兜底 */
    firstWarehouse: function () { return this.list('warehouses')[0] || { id: '', name: '-', city: '-' }; },
    firstWarehouseId: function () { return this.firstWarehouse().id; },
    supplierName: function (id) { var s = this.supplier(id); return s ? s.name : '-'; },
    productName: function (id) { var p = this.product(id); return p ? p.name : '-'; },
    warehouseName: function (id) { var w = this.warehouse(id); return w ? w.name : '-'; },

    /* ---------- 兼容旧缓存：采购/销售明细 → 产品主数据（仅关联，不自动建档） ----------
       旧版本未做采购→产品联动时，明细 productId 缺失；加载时按名称把明细关联到
       已有产品主数据。产品主数据只由用户在「产品管理」显式创建，避免每次加载都
       把采购/销售明细的名称批量建成产品（分类被强制成默认、造成数量虚高与分类错误）。 */
    ensureProductLinks: function () {
      var U = global.U;
      if (!U) return 0;
      var self = this, linked = 0;
      function link(items) {
        (items || []).forEach(function (it) {
          if (it.productId && self.product(it.productId)) return;          // 已关联且有效
          var key = String(it.name || '').trim().toLowerCase();
          if (!key) return;
          var hit = self.list('products').filter(function (p) {
            return String(p.name || '').trim().toLowerCase() === key;
          })[0];
          if (hit) { it.productId = hit.id; linked++; }
        });
      }
      this.list('purchases').forEach(function (po) { link(po.items); });
      this.list('sales').forEach(function (so) { link(so.items); });
      if (linked) this.save();
      return linked;
    },

    /* ---------- 旧版「采购自动建档」残留清理 ----------
       旧逻辑会在每次加载时把采购/销售明细名称批量建成产品，且分类被强制写成默认分类
       （电子元器件），导致产品数量虚高、分类显示错误。这里给这类疑似自动建档的产品打上
       source:'auto' 标记，供「产品管理」一键清理；用户在产品管理显式创建的产品不会带此标记。 */
    reconcileAutoProducts: function () {
      var S = global.Seed, defCat = (S && S.CATS && S.CATS[0]) || '电子元器件';
      var poNames = {};
      this.list('purchases').concat(this.list('sales')).forEach(function (doc) {
        (doc.items || []).forEach(function (it) {
          var k = String(it.name || '').trim().toLowerCase();
          if (k) poNames[k] = 1;
        });
      });
      var changed = 0;
      this.list('products').forEach(function (p) {
        if (p.source) return;
        var sku = String(p.sku || '');
        var name = String(p.name || '').trim().toLowerCase();
        if (sku.indexOf('M-NEW-') === 0 && p.category === defCat && poNames[name]) {
          p.source = 'auto'; changed++;
        }
      });
      if (changed) this.save();
      return changed;
    },

    /* ---------- 产品分类跟随主供应商分类 ----------
       产品分类应与主供应商一致；旧数据 / 手动建档可能分类错配（如被强制写成默认分类），
       每次加载时统一把产品分类重算为主供应商的分类，避免分类显示错误。 */
    reconcileProductCategories: function () {
      var self = this, changed = 0;
      (this.db.products || []).forEach(function (p) {
        if (!p.supplierId) return;
        var sup = self.supplier(p.supplierId);
        if (!sup || !sup.category) return;
        if (p.category !== sup.category) { p.category = sup.category; changed++; }
      });
      if (changed) this.save();
      return changed;
    },

    /* 清理旧版自动建档的残留产品（用户在产品管理点击「清理」时调用） */
    removeAutoProducts: function () {
      var self = this;
      var ids = {};
      this.list('products').forEach(function (p) { if (p.source === 'auto') ids[p.id] = 1; });
      var n = Object.keys(ids).length;
      if (!n) return 0;
      this.db.products = this.db.products.filter(function (p) { return !ids[p.id]; });
      ['purchases', 'sales'].forEach(function (name) {
        self.list(name).forEach(function (doc) {
          (doc.items || []).forEach(function (it) { if (ids[it.productId]) it.productId = null; });
        });
      });
      this.save();
      return n;
    },

    /** 某物料总库存 */
    stockOf: function (pid) {
      var iv = this.list('inventory').filter(function (x) { return x.productId === pid; });
      return { qty: U.sum(iv, function (x) { return x.qty; }), locked: U.sum(iv, function (x) { return x.locked; }), available: U.sum(iv, function (x) { return x.available; }) };
    },
    /** 库存水位：低于安全库存 = 预警 */
    stockLevel: function (pid) {
      var p = this.product(pid), s = this.stockOf(pid);
      if (!p) return 0;
      return p.safetyStock > 0 ? U.round(s.available / p.safetyStock * 100, 0) : 100;
    },
    /** 低库存物料列表 */
    lowStock: function () {
      var self = this;
      return this.list('products').map(function (p) {
        var s = self.stockOf(p.id);
        return { product: p, stock: s, level: self.stockLevel(p.id) };
      }).filter(function (x) { return x.level < 100; }).sort(function (a, b) { return a.level - b.level; });
    },
    /** 仓库利用率 */
    whUsage: function () {
      return this.list('warehouses').map(function (w) {
        var cap = Number(w.capacity) || 0;
        return { warehouse: w, rate: cap ? U.round(Number(w.used || 0) / cap * 100, 1) : 0 };
      });
    },
    /** 单仓经营统计：库存 / SKU / 库存金额 / 关联单据 */
    whStats: function (id) {
      var d = this.db, self = this;
      var invs = d.inventory.filter(function (x) { return x.warehouseId === id; });
      var sku = {};
      invs.forEach(function (x) { sku[x.productId] = 1; });
      var value = U.sum(invs, function (x) {
        var p = self.product(x.productId);
        return (p ? p.unitPrice : 0) * (Number(x.qty) || 0);
      });
      var w = this.warehouse(id) || {};
      var cap = Number(w.capacity) || 0;
      return {
        records: invs.length,
        skuCount: Object.keys(sku).length,
        qty: U.sum(invs, function (x) { return Number(x.qty) || 0; }),
        available: U.sum(invs, function (x) { return Number(x.available) || 0; }),
        value: U.round(value, 2),
        poCount: d.purchases.filter(function (x) { return x.warehouseId === id; }).length,
        soCount: d.sales.filter(function (x) { return x.warehouseId === id; }).length,
        shipCount: d.shipments.filter(function (x) { return x.warehouseId === id; }).length,
        capacity: cap,
        used: Number(w.used) || 0,
        rate: cap ? U.round((Number(w.used) || 0) / cap * 100, 1) : 0
      };
    },
    /** 仓库被业务单据引用的情况，用于删除风险提示 */
    whRefs: function (ids) {
      var set = {};
      (ids || []).forEach(function (id) { set[id] = 1; });
      var d = this.db;
      return {
        inventory: d.inventory.filter(function (x) { return set[x.warehouseId]; }).length,
        purchases: d.purchases.filter(function (x) { return set[x.warehouseId]; }).length,
        sales: d.sales.filter(function (x) { return set[x.warehouseId]; }).length,
        shipments: d.shipments.filter(function (x) { return set[x.warehouseId]; }).length
      };
    },

    /** 单产品全量派生统计：库存 / 水位 / 金额 / 采购与销售关联 */
    productStats: function (id) {
      var d = this.db, p = this.product(id) || {}, Ux = U;
      var invs = (d.inventory || []).filter(function (x) { return x.productId === id; });
      var whSet = {}, qty = 0, locked = 0, available = 0;
      invs.forEach(function (x) {
        whSet[x.warehouseId] = 1;
        qty += Number(x.qty) || 0;
        locked += Number(x.locked) || 0;
        available += Number(x.available) || 0;
      });
      var po = [], so = [], poDocs = {}, soDocs = {};
      (d.purchases || []).forEach(function (doc) {
        if (doc.status === 'cancelled') return;
        (doc.items || []).forEach(function (it) {
          if (it.productId === id) { po.push({ doc: doc, item: it }); poDocs[doc.id] = 1; }
        });
      });
      (d.sales || []).forEach(function (doc) {
        if (doc.status === 'cancelled') return;
        (doc.items || []).forEach(function (it) {
          if (it.productId === id) { so.push({ doc: doc, item: it }); soDocs[doc.id] = 1; }
        });
      });
      var lastOf = function (arr) {
        return arr.reduce(function (a, x) {
          var t = x.doc.createdAt || '';
          return t > a ? t : a;
        }, '');
      };
      var safety = Number(p.safetyStock) || 0;
      return {
        records: invs.length, warehouses: Object.keys(whSet).length,
        qty: qty, locked: locked, available: available,
        value: Ux.round(qty * (Number(p.unitPrice) || 0), 2),
        level: safety ? Ux.round(available / safety * 100, 0) : 100,
        poDocs: Object.keys(poDocs).length,
        poQty: Ux.sum(po, function (x) { return Number(x.item.qty) || 0; }),
        poAmount: Ux.round(Ux.sum(po, function (x) { return Number(x.item.amount) || 0; }), 2),
        soDocs: Object.keys(soDocs).length,
        soQty: Ux.sum(so, function (x) { return Number(x.item.qty) || 0; }),
        soAmount: Ux.round(Ux.sum(so, function (x) { return Number(x.item.amount) || 0; }), 2),
        poItems: po, soItems: so,
        lastPurchaseAt: lastOf(po), lastSalesAt: lastOf(so)
      };
    },
    /** 产品被业务单据引用的情况，用于删除风险提示 */
    productRefs: function (ids) {
      var set = {};
      (ids || []).forEach(function (id) { set[id] = 1; });
      var d = this.db;
      var refs = function (arr) {
        return (arr || []).filter(function (doc) {
          return (doc.items || []).some(function (it) { return set[it.productId]; });
        }).length;
      };
      return {
        inventory: (d.inventory || []).filter(function (x) { return set[x.productId]; }).length,
        purchases: refs(d.purchases),
        sales: refs(d.sales)
      };
    },

    /* ---------- 统计计算 ---------- */
    stats: function () {
      var d = this.db;
      var pos = d.purchases || [], sos = d.sales || [], ships = d.shipments || [], invs = d.invoices || [];
      var activePO = pos.filter(function (x) { return x.status !== 'cancelled'; });
      var doneSO = sos.filter(function (x) { return x.status === 'delivered'; });
      var received = pos.filter(function (x) { return x.status === 'received'; });
      var onTimePO = received.filter(function (x) {
        return x.receivedAt && new Date(x.receivedAt) <= new Date(x.expectedAt);
      });
      var overdueInv = invs.filter(function (x) { return x.status === 'overdue'; });

      var totalStockValue = U.sum(d.inventory, function (x) {
        var p = Store.product(x.productId);
        return (p ? p.unitPrice : 0) * x.qty;
      });

      var m = d.monthly, last = m[m.length - 1], prev = m[m.length - 2] || last;

      return {
        supplierCount: d.suppliers.length,
        activeSupplier: d.suppliers.filter(function (s) { return s.status === 'active'; }).length,
        productCount: d.products.length,
        warehouseCount: d.warehouses.length,
        poCount: activePO.length,
        poAmount: U.sum(activePO, function (x) { return x.amount; }),
        soCount: sos.filter(function (x) { return x.status !== 'cancelled'; }).length,
        soAmount: U.sum(sos.filter(function (x) { return x.status !== 'cancelled'; }), function (x) { return x.amount; }),
        deliveredCount: doneSO.length,
        onTimeRate: received.length ? U.round(onTimePO.length / received.length * 100, 1) : 0,
        fulfillRate: sos.length ? U.round(doneSO.length / sos.filter(function (x) { return x.status !== 'cancelled'; }).length * 100, 1) : 0,
        avgQuality: U.round(U.avg(d.suppliers, function (s) { return s.qualityRate; }), 1),
        stockValue: totalStockValue,
        lowStockCount: this.lowStock().length,
        inTransit: ships.filter(function (x) { return x.status === 'in_transit'; }).length,
        shipException: ships.filter(function (x) { return x.status === 'exception'; }).length,
        payable: U.sum(invs.filter(function (x) { return x.type === 'payable' && x.status !== 'paid'; }), function (x) { return x.amount; }),
        receivable: U.sum(invs.filter(function (x) { return x.type === 'receivable' && x.status !== 'paid'; }), function (x) { return x.amount; }),
        overdueCount: overdueInv.length,
        overdueAmount: U.sum(overdueInv, function (x) { return x.amount; }),
        turnover: last.turnover,
        monthPurchase: last.purchase,
        monthSales: last.sales,
        deltaPurchase: prev.purchase ? U.round((last.purchase - prev.purchase) / prev.purchase * 100, 1) : 0,
        deltaSales: prev.sales ? U.round((last.sales - prev.sales) / prev.sales * 100, 1) : 0,
        deltaOnTime: U.round(last.onTime - prev.onTime, 1),
        deltaTurnover: U.round(last.turnover - prev.turnover, 2)
      };
    },

    /** 供应商绩效排行 */
    supplierRank: function (metric, n) {
      var self = this;
      var arr = this.db.suppliers.map(function (s) {
        var pos = self.db.purchases.filter(function (p) { return p.supplierId === s.id && p.status !== 'cancelled'; });
        return {
          supplier: s,
          amount: U.sum(pos, function (p) { return p.amount; }),
          orders: pos.length,
          score: s.rating
        };
      });
      arr = U.sortBy(arr, function (x) {
        if (metric === 'amount') return x.amount;
        if (metric === 'orders') return x.orders;
        return x.score;
      }, 'desc');
      return n ? arr.slice(0, n) : arr;
    },

    /** 风险预警 */
    alerts: function () {
      var out = [], self = this;
      this.lowStock().slice(0, 6).forEach(function (x) {
        var lv = x.level;
        out.push({
          level: lv < 50 ? 'high' : (lv < 80 ? 'mid' : 'low'),
          title: x.product.name + ' 库存' + (lv < 50 ? '严重不足' : '低于安全线'),
          desc: 'SKU ' + x.product.sku + ' · 可用 ' + U.num(x.stock.available) + ' ' + x.product.unit + ' / 安全库存 ' + U.num(x.product.safetyStock),
          time: U.today(), type: '库存'
        });
      });
      this.db.suppliers.filter(function (s) { return s.riskScore > 55 || s.status === 'suspended'; }).slice(0, 5).forEach(function (s) {
        out.push({
          level: s.status === 'suspended' ? 'high' : 'mid',
          title: s.name + (s.status === 'suspended' ? ' 已暂停合作' : ' 交付风险偏高'),
          desc: '准时率 ' + s.onTimeRate + '% · 质量合格率 ' + s.qualityRate + '% · 风险分 ' + s.riskScore,
          time: U.today(), type: '供应商'
        });
      });
      this.db.purchases.filter(function (p) {
        return ['approved', 'purchasing', 'shipped'].indexOf(p.status) >= 0 && new Date(p.expectedAt) < new Date();
      }).slice(0, 5).forEach(function (p) {
        out.push({
          level: 'high', title: '采购单 ' + p.no + ' 已逾期',
          desc: p.supplierName + ' · 应到 ' + p.expectedAt + ' · 逾期 ' + U.diffDays(p.expectedAt) + ' 天',
          time: p.expectedAt, type: '采购'
        });
      });
      this.db.shipments.filter(function (s) { return s.status === 'exception'; }).slice(0, 4).forEach(function (s) {
        out.push({
          level: 'mid', title: '运单 ' + s.no + ' 运输异常',
          desc: s.carrier + ' · ' + s.from + ' → ' + s.to + ' · 进度 ' + s.progress + '%',
          time: U.today(), type: '物流'
        });
      });
      this.db.invoices.filter(function (x) { return x.status === 'overdue'; }).slice(0, 4).forEach(function (x) {
        out.push({
          level: 'high', title: '账单 ' + x.no + ' 已逾期未结',
          desc: x.counterparty + ' · ' + U.moneyY(x.amount) + ' · 到期 ' + x.dueAt,
          time: x.dueAt, type: '财务'
        });
      });
      var order = { high: 0, mid: 1, low: 2 };
      return U.sortBy(out, function (x) { return order[x.level]; });
    },

    /* ---------- 权限 ---------- */
    ROLES: {
      admin: { label: '超级管理员', color: 'red', can: ['*'] },
      manager: { label: '部门经理', color: 'blue', can: ['view', 'create', 'edit', 'approve'] },
      operator: { label: '业务操作员', color: 'cyan', can: ['view', 'create', 'edit'] },
      viewer: { label: '只读访客', color: 'gray', can: ['view'] }
    },
    session: function () {
      var s = null;
      try { s = JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch (e) { }
      if (!s) s = { userId: 'U1', role: 'admin', name: '管理员', isGuest: false };
      return s;
    },
    setSession: function (s) {
      try { localStorage.setItem(SESSION, JSON.stringify(s)); } catch (e) { }
    },
    logout: function () {
      try { localStorage.removeItem(SESSION); } catch (e) { }
    },
    can: function (action) {
      var s = this.session();
      var role = this.ROLES[s.role] || this.ROLES.viewer;
      return role.can.indexOf('*') >= 0 || role.can.indexOf(action) >= 0;
    },
    roleLabel: function (r) { return (this.ROLES[r] || this.ROLES.viewer).label; },
    roleColor: function (r) { return (this.ROLES[r] || this.ROLES.viewer).color; },

    /* ---------- 当前登录用户 ---------- */
    currentUser: function () {
      var s = this.session();
      var u = this.list('users').filter(function (x) { return x.id === s.userId; })[0];
      return u || { id: s.userId, name: s.name || '管理员', role: s.role || 'admin', dept: s.dept || '运营部' };
    },
    usersByRole: function (role) {
      return this.list('users').filter(function (u) { return u.role === role && u.status !== 'disabled'; });
    },

    /* ============================================================
       采购审批工作流引擎
       ------------------------------------------------------------
       角色：超级管理员(admin) → 部门经理(manager) → 业务操作员(operator)
       状态流转：
         to_manager    待经理指派   （admin 创建任务并指派经理）
         to_operator   待操作员处理 （manager 指派操作员）
         submitted     待经理审核   （operator 采购完并提交）
         approved      已审核通过   （manager 审核通过 → 正式采购单，status='approved'）
         rejected      已驳回       （manager 驳回，退回 operator 重新处理）
       所有动作都会写入 po.timeline 留痕。
       ============================================================ */
    poWorkflow: {
      STEPS: ['to_manager', 'to_operator', 'submitted', 'approved'],

      /* 当前用户对该单据可执行的操作（角色 + 流程状态双重判定） */
      actionsFor: function (po) {
        var me = Store.currentUser();
        var role = me.role;
        var flow = po.flow;
        if (!flow) {
          // 旧版普通采购单：仅超级管理员可将其纳入审批流程
          return role === 'admin' ? [{ action: 'assign_manager', label: '发起审批流程', primary: true }] : [];
        }
        var acts = [];
        if (role === 'admin') {
          acts.push({ action: 'assign_manager', label: po.managerId ? '改派经理' : '指派经理' });
          acts.push({ action: 'assign_operator', label: '指派操作员' });
          if (flow === 'submitted') {
            acts.push({ action: 'approve', label: '审核通过', primary: true });
            acts.push({ action: 'reject', label: '驳回' });
          }
        } else if (role === 'manager') {
          if (po.managerId && po.managerId !== me.id) return [];   // 非本人负责的单据
          if (flow === 'to_manager') acts.push({ action: 'assign_operator', label: '指派操作员', primary: true });
          else if (flow === 'submitted') {
            acts.push({ action: 'approve', label: '审核通过', primary: true });
            acts.push({ action: 'reject', label: '驳回' });
          } else acts.push({ action: 'view', label: '查看' });
        } else if (role === 'operator') {
          if (po.operatorId && po.operatorId !== me.id) return [];
          if (flow === 'to_operator' || flow === 'rejected') acts.push({ action: 'submit', label: '提交审核', primary: true });
          else acts.push({ action: 'view', label: '查看' });
        }
        return acts;
      },

      /* 执行状态流转；payload: { userId, name, note }；返回是否成功 */
      apply: function (po, action, payload) {
        payload = payload || {};
        var me = Store.currentUser();
        var role = me.role;
        var flow = po.flow;
        function record(act, label, note) {
          po.timeline = po.timeline || [];
          po.timeline.push({
            at: U.nowStr(), byId: me.id, byName: me.name, byRole: role,
            action: act, actionLabel: label, note: note || ''
          });
        }
        if (action === 'assign_manager') {
          if (role !== 'admin') return false;
          if (!payload.userId) return false;
          po.creatorId = po.creatorId || me.id;
          po.creatorName = po.creatorName || me.name;
          po.managerId = payload.userId;
          po.managerName = payload.name;
          po.flow = 'to_manager';
          record('assign_manager', '指派部门经理', '指派给 ' + payload.name);
        } else if (action === 'assign_operator') {
          if (role !== 'admin' && role !== 'manager') return false;
          if (po.flow !== 'to_manager' && po.flow !== 'to_operator' && po.flow !== 'submitted' && po.flow !== 'rejected' && po.flow !== 'approved') return false;
          if (!payload.userId) return false;
          po.operatorId = payload.userId;
          po.operatorName = payload.name;
          po.flow = 'to_operator';
          record('assign_operator', '指派业务操作员', '指派给 ' + payload.name);
        } else if (action === 'submit') {
          if (role !== 'operator') return false;
          if (po.flow !== 'to_operator' && po.flow !== 'rejected') return false;
          po.flow = 'submitted';
          po.flowNote = payload.note || '';
          record('submit', '提交审核', payload.note || '');
        } else if (action === 'approve') {
          if (role !== 'manager' && role !== 'admin') return false;
          if (po.flow !== 'submitted') return false;
          po.flow = 'approved';
          po.status = 'approved';
          po.approvedAt = U.today();
          record('approve', '审核通过', '已转为正式采购订单');
        } else if (action === 'reject') {
          if (role !== 'manager' && role !== 'admin') return false;
          if (po.flow !== 'submitted') return false;
          po.flow = 'rejected';
          po.flowNote = payload.note || '';
          record('reject', '驳回', payload.note || '');
        } else {
          return false;
        }
        Store.update('purchases', po.id, po);
        return true;
      }
    }
  };

  /* ---------- 业务常量 ---------- */
  Store.ENUMS = {
    poStatus: {
      draft: ['草稿', 'gray'], pending: ['待审批', 'amber'], approved: ['已审批', 'blue'],
      purchasing: ['采购中', 'cyan'], shipped: ['已发运', 'purple'], received: ['已入库', 'green'], cancelled: ['已取消', 'gray']
    },
    soStatus: {
      pending: ['待确认', 'amber'], confirmed: ['已确认', 'blue'], picking: ['拣货中', 'cyan'],
      shipped: ['已发货', 'purple'], delivered: ['已交付', 'green'], cancelled: ['已取消', 'gray']
    },
    shipStatus: {
      pending: ['待发运', 'gray'], in_transit: ['运输中', 'blue'], arrived: ['已到达', 'green'], exception: ['异常', 'red']
    },
    invStatus: { paid: ['已结清', 'green'], pending: ['待结算', 'amber'], overdue: ['已逾期', 'red'] },
    supStatus: { active: ['合作中', 'green'], pending: ['待审核', 'amber'], suspended: ['已暂停', 'red'] },
    whStatus: { active: ['运营中', 'green'], maintenance: ['检修中', 'amber'], disabled: ['已停用', 'gray'] },
    prodStatus: { active: ['在售', 'green'], inactive: ['停用', 'gray'], discontinued: ['已停产', 'red'] },
    level: { A: ['A 级战略', 'green'], B: ['B 级合格', 'blue'], C: ['C 级观察', 'amber'] },
    priority: { high: ['高', 'red'], medium: ['中', 'amber'], low: ['低', 'gray'] },
    /* 采购审批工作流（超级管理员 → 部门经理 → 业务操作员 → 经理审核） */
    poFlow: {
      to_manager: ['待经理指派', 'amber'],
      to_operator: ['待操作员处理', 'cyan'],
      submitted: ['待经理审核', 'purple'],
      approved: ['已审核通过', 'green'],
      rejected: ['已驳回', 'red']
    }
  };

  global.Store = Store;
})(window);
