/* ============================================================
   SCM · 实时经营数据派生层
   财务账单 / 月度趋势 / 品类结构 / 区域分布：全部由实际业务单据
   （采购单、销售订单、库存、运单、供应商档案）实时聚合，不再使用
   预置的示例数据。Store.save() 之前自动重算，保证全站口径一致。
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, Seed = global.Seed;

  function db() { return global.Store && global.Store.db; }
  function S() { return global.Store; }
  function num(v) { return Number(v) || 0; }
  function monthOf(s) { return s ? String(s).slice(0, 7) : ''; }
  function wan(v) { return U.round(num(v) / 10000, 1); }
  function live(arr) { return (arr || []).filter(function (x) { return x.status !== 'cancelled'; }); }
  function byMonth(arr, field) {
    var m = {};
    (arr || []).forEach(function (x) {
      var k = monthOf(x[field || 'createdAt']);
      if (k) (m[k] = m[k] || []).push(x);
    });
    return m;
  }
  /** 销售订单的实际成本：明细数量 × 物料成本价（无明细时按售价 75% 兜底） */
  function salesCostOf(so) {
    var c = U.sum(so.items || [], function (it) {
      var p = S().product(it.productId);
      return (p ? p.unitPrice : num(it.price)) * num(it.qty);
    });
    return c || num(so.amount) * 0.75;
  }
  function stockValue() {
    return U.sum(db().inventory || [], function (x) {
      var p = S().product(x.productId);
      return (p ? p.unitPrice : 0) * num(x.qty);
    });
  }
  function supplierOf(po) { return S().supplier(po.supplierId) || {}; }

  /* ============================================================
     1. 财务对账：从业务单据生成应收 / 应付账单
     - 采购单（未取消）→ 应付；销售订单（未取消）→ 应收
     - 旧种子假账单（id 形如 INV01）清除
     - 用户手工新增的账单保留（_manual）
     - 结清状态由用户操作决定，重算时保留
     ============================================================ */
  function syncInvoices() {
    var d = db();
    if (!d || !d.purchases || !d.sales) return;
    var today = U.today();
    var list = (d.invoices || []).filter(function (x) {
      return !/^INV\d+$/.test(String(x.id || ''));
    });
    var idx = {}, keep = {};
    list.forEach(function (x) { if (x.autoKey) idx[x.autoKey] = x; });

    function upsert(key, p, type, counterparty, refNo, dueAt) {
      keep[key] = 1;
      var r = idx[key];
      if (!r) {
        r = {
          id: type === 'payable' ? 'AIPO' + p.id : 'AISO' + p.id,
          autoKey: key,
          no: 'FP-' + (type === 'payable' ? 'AP-' : 'AR-') + String(refNo).replace(/\D/g, ''),
          taxRate: 13, method: '银行转账', status: 'pending', paidAt: null
        };
        list.push(r);
        idx[key] = r;
      }
      r.type = type;
      r.counterparty = counterparty;
      r.refNo = refNo;
      r.amount = U.round(num(p.amount), 2);
      r.issuedAt = p.createdAt || r.issuedAt || today;
      r.dueAt = dueAt || U.addDays(r.issuedAt, 30);
      if (!r.taxRate) r.taxRate = 13;
      if (!r.method) r.method = '银行转账';
      /* 已结清状态保留；未结清按到期日与实际日期推导 */
      if (r.status !== 'paid') {
        r.status = new Date(r.dueAt) < new Date(today) ? 'overdue' : 'pending';
        r.paidAt = null;
      }
      return r;
    }

    live(d.purchases).forEach(function (p) {
      upsert('PO:' + p.id, p, 'payable', p.supplierName || S().supplierName(p.supplierId), p.no, p.expectedAt);
    });
    live(d.sales).forEach(function (s) {
      upsert('SO:' + s.id, s, 'receivable', s.customer, s.no, s.dueAt);
    });

    /* 单据被删除 / 取消时，对应自动账单一并移除 */
    d.invoices = list.filter(function (x) { return !x.autoKey || keep[x.autoKey]; });
  }

  /* ============================================================
     2. 月度经营趋势：按单据实际发生月份聚合（单位：万元）
     ============================================================ */
  function monthly(n) {
    var d = db(), months = U.lastMonths(n || 12);
    var pos = byMonth(live(d.purchases));
    var sos = byMonth(live(d.sales));
    var ships = (d.shipments || []).map(function (x) {
      var nodes = x.nodes || [];
      return { month: monthOf(nodes.length ? nodes[0].at : x.eta), cost: num(x.cost) };
    });
    var shipM = {};
    ships.forEach(function (x) { if (x.month) shipM[x.month] = (shipM[x.month] || 0) + x.cost; });

    var purchase = [], sales = [], cost = [], freight = [], onTime = [], quality = [];
    months.forEach(function (m) {
      var ps = pos[m] || [], ss = sos[m] || [];
      var pAmt = U.sum(ps, function (x) { return num(x.amount); });
      var sAmt = U.sum(ss, function (x) { return num(x.amount); });
      var sCost = U.sum(ss, salesCostOf);
      purchase.push(wan(pAmt));
      sales.push(wan(sAmt));
      cost.push(wan(sCost));
      freight.push(wan(shipM[m] || 0));

      /* 准时交付率：当月下单且已入库的采购单，实际收货不晚于期望到货 */
      var got = ps.filter(function (x) { return x.receivedAt; });
      var ok = got.filter(function (x) { return new Date(x.receivedAt) <= new Date(x.expectedAt); });
      onTime.push(got.length ? U.round(ok.length / got.length * 100, 1) : 0);

      /* 来料合格率：按当月收货采购单的供应商档案合格率加权（无收货则为空档） */
      var qs = got.map(function (x) { return num(supplierOf(x).qualityRate); }).filter(function (v) { return v > 0; });
      quality.push(qs.length ? U.round(U.avg(qs, function (v) { return v; }), 1) : 0);
    });

    /* 库存金额：以当前实际库存为基准，按各月「采购入库 - 销售成本」倒推月末值 */
    var stockWan = wan(stockValue());
    var inventory = new Array(months.length);
    var running = stockWan;
    for (var i = months.length - 1; i >= 0; i--) {
      inventory[i] = U.round(Math.max(0, running), 1);
      running -= (purchase[i] - cost[i]);
    }
    /* 年化周转率 = 当月销售成本 / 当前库存金额 × 12 */
    var turnover = cost.map(function (c) { return stockWan > 0 ? U.round(c / stockWan * 12, 2) : 0; });
    var profit = sales.map(function (s, i) { return U.round(s - cost[i], 1); });

    return months.map(function (m, i) {
      return {
        month: m,
        purchase: purchase[i], sales: sales[i], salesCost: cost[i], profit: profit[i],
        inventory: inventory[i], onTime: onTime[i], quality: quality[i],
        turnover: turnover[i], freight: freight[i],
        returnRate: 0 /* 系统暂无退货单据，不编造数据 */
      };
    });
  }

  /* ============================================================
     3. 品类结构：按采购明细中的物料分类聚合
     ============================================================ */
  function category() {
    var map = {};
    live(db().purchases).forEach(function (p) {
      var seen = {};
      (p.items || []).forEach(function (it) {
        var prod = S().product(it.productId);
        var c = (prod && prod.category) || '其他';
        if (!map[c]) map[c] = { category: c, amount: 0, count: 0, docs: {} };
        map[c].amount += num(it.amount);
        map[c].docs[p.id] = 1;
      });
      if (!(p.items || []).length) {
        var sup = supplierOf(p);
        var c2 = sup.category || '其他';
        if (!map[c2]) map[c2] = { category: c2, amount: 0, count: 0, docs: {} };
        map[c2].amount += num(p.amount);
        map[c2].docs[p.id] = 1;
      }
      seen = null;
    });
    return Object.keys(map).map(function (k) {
      var x = map[k];
      return { category: k, amount: wan(x.amount), count: Object.keys(x.docs).length };
    }).filter(function (x) { return x.amount > 0 || x.count > 0; });
  }

  /** 品类库存金额与真实毛利率（销售价 - 物料成本价） */
  function categoryMargin() {
    var d = db(), stock = {}, rev = {}, cost = {};
    (d.inventory || []).forEach(function (x) {
      var p = S().product(x.productId);
      if (!p) return;
      stock[p.category] = (stock[p.category] || 0) + p.unitPrice * num(x.qty);
    });
    live(d.sales).forEach(function (so) {
      (so.items || []).forEach(function (it) {
        var p = S().product(it.productId);
        if (!p) return;
        rev[p.category] = (rev[p.category] || 0) + num(it.price) * num(it.qty);
        cost[p.category] = (cost[p.category] || 0) + p.unitPrice * num(it.qty);
      });
    });
    var cats = Object.keys(stock).concat(Object.keys(rev));
    var seen = {};
    return cats.filter(function (c) { if (seen[c]) return false; seen[c] = 1; return true; }).map(function (c) {
      var r = rev[c] || 0, k = cost[c] || 0;
      return {
        name: c,
        stock: wan(stock[c] || 0),
        margin: r > 0 ? U.round((r - k) / r * 100, 1) : 0
      };
    });
  }

  /* ============================================================
     4. 区域分布：按供应商所属区域 + 真实采购单聚合
     ============================================================ */
  function regionList() {
    var seen = {}, out = [];
    (db().suppliers || []).forEach(function (s) { if (s.region) seen[s.region] = 1; });
    (Seed.REGIONS || []).forEach(function (r) { seen[r] = 1; });
    Object.keys(seen).forEach(function (r) { out.push(r); });
    return out;
  }
  function region() {
    var d = db(), sups = d.suppliers || [], pos = live(d.purchases);
    return regionList().map(function (rg) {
      var ids = {};
      sups.forEach(function (s) { if (s.region === rg) ids[s.id] = 1; });
      var mine = pos.filter(function (p) { return ids[p.supplierId]; });
      var got = mine.filter(function (p) { return p.receivedAt; });
      var ok = got.filter(function (p) { return new Date(p.receivedAt) <= new Date(p.expectedAt); });
      return {
        region: rg,
        suppliers: Object.keys(ids).length,
        amount: wan(U.sum(mine, function (p) { return num(p.amount); })),
        onTime: got.length ? U.round(ok.length / got.length * 100, 1) : 0
      };
    });
  }
  /** 区域 × 品类 采购金额矩阵（万元） */
  function regionCategoryMatrix() {
    var d = db(), regs = regionList(), sups = d.suppliers || [];
    var cats = (Seed.CATS || []).slice(0, 6);
    var vals = {}, supMap = {};
    sups.forEach(function (s) { supMap[s.id] = s; });
    live(d.purchases).forEach(function (p) {
      var s = supMap[p.supplierId];
      if (!s) return;
      var rg = s.region, c = s.category;
      if (!rg || cats.indexOf(c) < 0) return;
      var key = rg + '|' + c;
      vals[key] = (vals[key] || 0) + num(p.amount);
    });
    var rows = regs.filter(function (rg) {
      return cats.some(function (c) { return vals[rg + '|' + c] > 0; });
    });
    return {
      rows: rows.length ? rows : regs,
      cols: cats.map(function (c) { return c.slice(0, 2); }),
      values: (rows.length ? rows : regs).map(function (rg) {
        return cats.map(function (c) { return U.round((vals[rg + '|' + c] || 0) / 10000, 0); });
      })
    };
  }
  /** 供应商实际准时率（已入库采购单） */
  function supplierOnTime(id) {
    var got = live(db().purchases).filter(function (p) { return p.supplierId === id && p.receivedAt; });
    if (!got.length) return null;
    var ok = got.filter(function (p) { return new Date(p.receivedAt) <= new Date(p.expectedAt); });
    return U.round(ok.length / got.length * 100, 1);
  }

  /** 全量重算（直接改 db，不触发 save，避免递归） */
  function refresh() {
    var d = db();
    if (!d || !d.purchases || !d.sales || !d.inventory) return;
    syncInvoices();
    d.monthly = monthly(12);
    d.categoryData = category();
    d.regionData = region();
    d.meta = d.meta || {};
    d.meta.liveData = true;
    d.meta.refreshedAt = U.nowStr();
  }

  global.Analytics = {
    refresh: refresh,
    syncInvoices: syncInvoices,
    monthly: monthly,
    category: category,
    categoryMargin: categoryMargin,
    region: region,
    regionCategoryMatrix: regionCategoryMatrix,
    supplierOnTime: supplierOnTime,
    salesCostOf: salesCostOf
  };
})(window);
