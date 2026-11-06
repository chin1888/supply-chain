/* ============================================================
   SCM · 种子数据
   全链路：供应商 / 物料 / 仓库 / 库存 / 采购单 / 销售单 / 物流 / 对账 / 用户
   使用固定种子随机，保证每次生成的数据稳定可复现
   ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;

  var REGIONS = ['华东', '华南', '华北', '华中', '西南', '东北', '西北'];
  var CITIES = {
    '华东': ['上海', '苏州', '杭州', '宁波', '无锡', '南京', '合肥'],
    '华南': ['深圳', '广州', '东莞', '佛山', '厦门', '中山'],
    '华北': ['北京', '天津', '青岛', '石家庄', '济南'],
    '华中': ['武汉', '长沙', '郑州', '南昌'],
    '西南': ['成都', '重庆', '昆明', '贵阳'],
    '东北': ['沈阳', '大连', '长春', '哈尔滨'],
    '西北': ['西安', '兰州', '银川']
  };
  /* 省级行政区 → 大区 → 城市（供应商「省份 / 城市」联动选择数据源） */
  var PROVINCE_RAW = [
    ['北京市', '华北', '北京'],
    ['天津市', '华北', '天津'],
    ['河北省', '华北', '石家庄,唐山,秦皇岛,邯郸,保定,张家口,承德,廊坊,沧州,衡水,邢台'],
    ['山西省', '华北', '太原,大同,阳泉,长治,晋城,朔州,晋中,运城,忻州,临汾,吕梁'],
    ['内蒙古自治区', '华北', '呼和浩特,包头,乌海,赤峰,通辽,鄂尔多斯,呼伦贝尔,乌兰察布'],
    ['辽宁省', '东北', '沈阳,大连,鞍山,抚顺,本溪,丹东,锦州,营口,盘锦,葫芦岛'],
    ['吉林省', '东北', '长春,吉林,四平,辽源,通化,延边'],
    ['黑龙江省', '东北', '哈尔滨,齐齐哈尔,大庆,牡丹江,佳木斯,绥化,鸡西'],
    ['上海市', '华东', '上海'],
    ['江苏省', '华东', '南京,苏州,无锡,常州,镇江,南通,扬州,泰州,盐城,淮安,连云港,徐州,宿迁'],
    ['浙江省', '华东', '杭州,宁波,温州,嘉兴,湖州,绍兴,金华,衢州,台州,丽水,舟山'],
    ['安徽省', '华东', '合肥,芜湖,蚌埠,马鞍山,安庆,滁州,阜阳,宿州,六安,宣城,黄山'],
    ['福建省', '华东', '福州,厦门,泉州,漳州,莆田,三明,南平,龙岩,宁德'],
    ['江西省', '华东', '南昌,九江,赣州,景德镇,上饶,宜春,吉安,抚州,萍乡'],
    ['山东省', '华东', '济南,青岛,烟台,潍坊,淄博,威海,临沂,济宁,泰安,德州,日照,东营'],
    ['河南省', '华中', '郑州,洛阳,开封,新乡,南阳,许昌,焦作,安阳,商丘,信阳,周口'],
    ['湖北省', '华中', '武汉,宜昌,襄阳,荆州,黄石,十堰,孝感,荆门,鄂州,黄冈'],
    ['湖南省', '华中', '长沙,株洲,湘潭,衡阳,岳阳,常德,郴州,邵阳,益阳,娄底,怀化'],
    ['广东省', '华南', '广州,深圳,东莞,佛山,中山,珠海,惠州,汕头,湛江,江门,肇庆,茂名,揭阳,清远'],
    ['广西壮族自治区', '华南', '南宁,柳州,桂林,梧州,北海,玉林,钦州,贵港,百色'],
    ['海南省', '华南', '海口,三亚,三沙,儋州'],
    ['中国香港', '华南', '中国香港'],
    ['中国澳门', '华南', '中国澳门'],
    ['中国台湾', '华东', '台北,新北,桃园,台中,台南,高雄,基隆,新竹,嘉义'],
    ['重庆市', '西南', '重庆'],
    ['四川省', '西南', '成都,绵阳,德阳,宜宾,南充,泸州,自贡,攀枝花,乐山,达州,内江'],
    ['贵州省', '西南', '贵阳,遵义,六盘水,安顺,毕节,铜仁,黔南,黔东南'],
    ['云南省', '西南', '昆明,曲靖,玉溪,大理,丽江,红河,楚雄,文山,昭通'],
    ['西藏自治区', '西南', '拉萨,日喀则,林芝,昌都,山南,那曲'],
    ['陕西省', '西北', '西安,宝鸡,咸阳,渭南,铜川,延安,榆林,汉中,安康'],
    ['甘肃省', '西北', '兰州,天水,白银,酒泉,嘉峪关,张掖,武威,庆阳'],
    ['青海省', '西北', '西宁,海东,格尔木,海西'],
    ['宁夏回族自治区', '西北', '银川,吴忠,石嘴山,中卫,固原'],
    ['新疆维吾尔自治区', '西北', '乌鲁木齐,克拉玛依,喀什,伊犁,昌吉,阿克苏,库尔勒,哈密']
  ];
  var PROVINCES = PROVINCE_RAW.map(function (x) {
    return { name: x[0], region: x[1], cities: x[2].split(',') };
  });
  var PROVINCE_MAP = {}, CITY_PROVINCE = {};
  PROVINCES.forEach(function (p) {
    PROVINCE_MAP[p.name] = p;
    p.cities.forEach(function (c) { if (!CITY_PROVINCE[c]) CITY_PROVINCE[c] = p.name; });
  });
  function citiesOf(p) { return (PROVINCE_MAP[p] || {}).cities || []; }
  function regionOf(p) { return (PROVINCE_MAP[p] || {}).region || ''; }
  function provinceByCity(c) {
    if (!c) return '';
    if (CITY_PROVINCE[c]) return CITY_PROVINCE[c];
    var s = String(c).replace(/(市|地区|自治州)$/, '');
    return CITY_PROVINCE[s] || '';
  }

  var CATS = ['电子元器件', '结构件', '包装材料', '化工原料', '金属材', '塑胶件', '线束线缆', '光学器件', '辅料耗材'];
  /* SKU 使用 ASCII 品类代码，保证多语言下编码不会被翻译或出现中文残留 */
  var CAT_CODES = {
    '电子元器件': 'ELE', '结构件': 'STR', '包装材料': 'PKG', '化工原料': 'CHM',
    '金属材': 'MET', '塑胶件': 'PLS', '线束线缆': 'CBL', '光学器件': 'OPT', '辅料耗材': 'AUX'
  };
  var SUP_SUFFIX = ['科技有限公司', '实业股份有限公司', '精密制造有限公司', '新材料有限公司', '工业集团有限公司', '电子有限公司', '供应链有限公司', '塑胶制品有限公司'];
  var SUP_PREFIX = ['华翔', '恒通', '锐进', '中鼎', '广联', '鑫源', '博远', '天工', '科盛', '立信', '宏图', '万邦', '奥威', '瑞泽', '精诚', '联创', '汇智', '金桥', '德普', '智联', '远东', '新泰', '嘉盈', '先锋'];

  var PRODUCT_NAMES = {
    '电子元器件': ['贴片电阻 0402', '铝电解电容 470μF', 'MCU 主控芯片', '电源管理 IC', '贴片 LED', '石英晶振 16MHz', '场效应管 MOSFET', '霍尔传感器', 'EEPROM 存储芯片', 'TVS 保护二极管'],
    '结构件': ['铝合金外壳', '钣金支架', '压铸底座', '不锈钢面板', '散热鳍片'],
    '包装材料': ['瓦楞纸箱 5层', 'EPE 珍珠棉', '防静电袋', '缠绕膜', '标签贴纸'],
    '化工原料': ['环氧树脂胶', '无尘清洗剂', '导热硅脂', '三防漆', '助焊剂'],
    '金属材': ['冷轧钢板 SPCC', '铝型材 6063', '铜箔带', '不锈钢带 304'],
    '塑胶件': ['ABS 注塑件', 'PC 透明罩', '硅胶密封圈', '尼龙扎带'],
    '线束线缆': ['排线 20P', '硅胶高温线', '端子线束', '同轴线缆'],
    '光学器件': ['光学透镜', '导光板', '扩散膜', '反光片'],
    '辅料耗材': ['螺丝组 M3', '双面胶 3M', '钢网', '无尘布']
  };

  /* 仓库主数据常量 */
  var WH_TYPES = ['中心仓', '中转仓', '分仓', '前置仓', '保税仓', '冷链仓'];
  var WH_TEMPS = ['常温', '恒温 18-25℃', '冷藏 2-8℃', '冷冻 -18℃'];
  var WH_STATUS = [['active', '运营中'], ['maintenance', '检修中'], ['disabled', '已停用']];

  /* 产品主数据常量（与采购明细等级保持一致） */
  var GRADES = ['A quality', '1:1', 'Orginal', 'Pure Original'];
  var DEFAULT_GRADE = '1:1';
  var PRODUCT_STATUS = [['active', '在售'], ['inactive', '停用'], ['discontinued', '已停产']];
  var UNITS = ['件', '个', 'kg', '米', '卷', '套', '箱'];
  var BRANDS = ['SUNTECH', 'NOVACORE', 'VALEON', 'KINGPART', 'MEGALUX', 'ORIONTEK', 'PRECIX', 'AURORA'];
  var COLORS = ['原色', '黑色', '银灰', '白色', '透明', '定制色'];
  var MATERIALS = ['铝合金', '不锈钢', 'ABS 塑胶', '铜', '硅胶', '环氧树脂', '瓦楞纸', '复合材料'];
  var SPECS = ['标准型', '加强型', 'A级', '工业级', '车规级'];
  var REMARKS = ['常规备货物料', '需来料检验', '仅限指定批次使用', '有替代料可切换', '长交期物料，提前备货', ''];

  var CARRIERS = ['顺丰供应链', '京东物流', '德邦快运', '中通货运', '安能物流', '跨越速运'];
  var CUSTOMERS = ['智联智能终端', '云图工业', '星辰电子', '未来工场', '海纳智造', '光谷科技', '合创电子', '元启智能', '恒生数码', '天启物联', '明远通讯', '锐视科技'];
  var DEPTS = ['采购部', '仓储部', '物流部', '财务部', '质量部', '运营部'];
  var NAMES = ['张伟', '李静', '王磊', '陈曦', '刘洋', '赵敏', '孙浩', '周琳', '吴涛', '郑爽', '冯超', '许静'];

  function build() {
    var r = U.rng(20261019);
    var today = new Date();
    var db = {};

    /* ---------- 供应商 ---------- */
    var suppliers = [];
    var usedNames = {};
    for (var i = 0; i < 24; i++) {
      var pre = SUP_PREFIX[i], reg = REGIONS[i % REGIONS.length];
      var city = U.pick(CITIES[reg], r);
      var name = pre + U.pick(SUP_SUFFIX, r);
      var n = 2; while (usedNames[name]) { name = pre + U.pick(SUP_SUFFIX, r); if (++n > 8) break; }
      usedNames[name] = 1;
      var cat = CATS[Math.floor(r() * CATS.length)];
      var onTime = U.round(U.rand(78, 99.4, r), 1);
      var quality = U.round(U.rand(88, 99.8, r), 1);
      var lead = U.randInt(3, 28, r);
      var level = onTime > 95 && quality > 97 ? 'A' : (onTime > 88 && quality > 93 ? 'B' : 'C');
      var status = r() < 0.06 ? 'suspended' : (r() < 0.12 ? 'pending' : 'active');
      suppliers.push({
        id: 'SUP' + U.pad(i + 1),
        code: 'S' + (1000 + i),
        name: name,
        short: pre,
        category: cat,
        region: reg,
        province: provinceByCity(city),
        city: city,
        level: level,
        status: status,
        onTimeRate: onTime,
        qualityRate: quality,
        leadTime: lead,
        priceIndex: U.round(U.rand(88, 112, r), 1),
        rating: U.round((onTime / 100 * 0.4 + quality / 100 * 0.4 + (100 - lead * 2) / 100 * 0.2) * 5, 1),
        contact: U.pick(NAMES, r),
        phone: '1' + U.pick(['3', '5', '7', '8', '9'], r) + U.randInt(10000000, 99999999, r),
        email: 'sales@' + pre.toLowerCase().replace(/[^a-z]/g, '') + (r() < .5 ? '.com' : '.cn'),
        since: U.addDays(today, -U.randInt(200, 2200, r)),
        totalAmount: U.round(U.rand(80, 2600, r), 1) * 10000,
        capacity: U.randInt(2000, 40000, r),
        cert: r() < .6 ? 'ISO9001' : (r() < .5 ? 'ISO14001' : 'IATF16949'),
        riskScore: 0
      });
    }
    suppliers.forEach(function (s) {
      s.riskScore = U.round(Math.max(0, 100 - s.onTimeRate * 0.5 - s.qualityRate * 0.4 - (30 - s.leadTime) * 0.6 + (s.status === 'suspended' ? 25 : 0)), 0);
    });
    db.suppliers = suppliers;

    /* ---------- 物料 ---------- */
    var products = [], pi = 0;
    Object.keys(PRODUCT_NAMES).forEach(function (cat) {
      PRODUCT_NAMES[cat].forEach(function (nm) {
        var sup = suppliers.filter(function (s) { return s.category === cat; });
        if (!sup.length) sup = suppliers;
        var main = sup[pi % sup.length];
        var price = U.round(U.rand(0.5, 380, r), 2);
        var idx = ++pi;
        products.push({
          id: 'P' + U.pad(idx),
          sku: 'M-' + (CAT_CODES[cat] || 'GEN') + '-' + (1000 + idx * 7),
          name: nm,
          category: cat,
          grade: GRADES[U.randInt(0, GRADES.length - 1, r)],
          brand: U.pick(BRANDS, r),
          origin: main.city,
          barcode: '69' + U.randInt(10000000000, 99999999999, r),
          material: U.pick(MATERIALS, r),
          color: U.pick(COLORS, r),
          hsCode: String(U.randInt(10000000, 99999999, r)) + U.randInt(0, 9, r),
          taxRate: 13,
          warranty: U.pick([6, 12, 18, 24, 36], r),
          unit: U.pick(UNITS, r),
          spec: U.pick(SPECS, r),
          supplierId: main.id,
          backupSupplierId: sup[(idx + 1) % sup.length].id,
          unitPrice: price,
          eurPrice: U.round(price / 7.8, 2),
          usdPrice: U.round(price / 7.13, 2),
          weight: U.round(U.rand(0.02, 25, r), 2),
          boxSpec: U.pick(['24件/箱', '50件/箱', '100件/箱', '10卷/箱', '12套/箱', '6个/箱'], r) + '（' + U.randInt(30, 60, r) + '×' + U.randInt(20, 45, r) + '×' + U.randInt(15, 40, r) + 'cm）',
          safetyStock: U.randInt(200, 4000, r),
          moq: U.randInt(50, 2000, r),
          leadTime: main.leadTime,
          shelfLife: U.randInt(90, 720, r),
          status: r() < 0.05 ? 'inactive' : 'active',
          image: null,
          remark: U.pick(REMARKS, r),
          createdAt: U.addDays(today, -U.randInt(60, 900, r)),
          updatedAt: U.nowStr()
        });
      });
    });
    db.products = products;

    /* ---------- 仓库 ---------- */
    var whDef = [
      { name: '华东中心仓', type: '中心仓', province: '上海市', city: '上海', region: '华东', temperature: '常温' },
      { name: '华南中心仓', type: '中心仓', province: '广东省', city: '深圳', region: '华南', temperature: '常温' },
      { name: '华北中心仓', type: '中心仓', province: '北京市', city: '北京', region: '华北', temperature: '恒温 18-25℃' },
      { name: '华中中转仓', type: '中转仓', province: '湖北省', city: '武汉', region: '华中', temperature: '常温' },
      { name: '西南分仓', type: '分仓', province: '四川省', city: '成都', region: '西南', temperature: '常温' },
      { name: '东北分仓', type: '分仓', province: '辽宁省', city: '沈阳', region: '东北', temperature: '常温' }
    ];
    var WH_ROADS = ['物流大道 88 号', '临港产业园 12 号', '保税区兴业路 6 号', '经开区仓储路 23 号', '高新区货运街 45 号', '工业园新华路 9 号'];
    db.warehouses = whDef.map(function (w, i) {
      var cap = U.randInt(20000, 90000, r);
      return {
        id: 'WH' + U.pad(i + 1),
        code: 'WH-' + U.pad(i + 1),
        name: w.name, type: w.type,
        region: w.region, province: w.province, city: w.city,
        address: w.city + '市' + WH_ROADS[i % WH_ROADS.length],
        capacity: cap, used: U.round(cap * U.rand(0.42, 0.94, r), 0),
        area: U.randInt(3200, 28000, r),
        manager: U.pick(NAMES, r),
        phone: '1' + U.pick(['38', '56', '89', '76'], r) + U.pad(U.randInt(1000, 9999, r)) + U.pad(U.randInt(1000, 9999, r)),
        temperature: w.temperature,
        status: i === 5 ? 'maintenance' : 'active',
        openedAt: U.addDays(today, -U.randInt(200, 1600, r)),
        remark: i === 2 ? '含恒温电子料专区' : (i === 5 ? '设备检修中，暂停收发' : '')
      };
    });

    /* ---------- 库存 ---------- */
    var inventory = [];
    products.forEach(function (p) {
      var cnt = U.randInt(1, 4, r);
      var picked = {};
      for (var k = 0; k < cnt; k++) {
        var wh = db.warehouses[U.randInt(0, db.warehouses.length - 1, r)];
        if (picked[wh.id]) continue;
        picked[wh.id] = 1;
        var qty = U.randInt(0, Math.round(p.safetyStock * 2.6), r);
        var locked = Math.round(qty * U.rand(0, 0.35, r));
        inventory.push({
          id: 'IV' + inventory.length,
          productId: p.id, warehouseId: wh.id,
          qty: qty, locked: locked, available: qty - locked,
          batchNo: 'B' + U.randInt(202601, 202612, r) + U.pad(U.randInt(1, 28, r)),
          inboundAt: U.addDays(today, -U.randInt(1, 90, r))
        });
      }
    });
    db.inventory = inventory;

    /* ---------- 采购单 ---------- */
    var poStatus = ['draft', 'pending', 'approved', 'purchasing', 'shipped', 'received', 'cancelled'];
    var purchases = [];
    for (var a = 0; a < 68; a++) {
      var sup = suppliers[U.randInt(0, suppliers.length - 1, r)];
      var createdOffset = U.randInt(0, 150, r);
      var created = U.addDays(today, -createdOffset);
      var st = poStatus[weightedIndex([0.05, 0.14, 0.1, 0.16, 0.14, 0.37, 0.04], r())];
      if (createdOffset < 3 && st === 'received') st = 'approved';
      var items = [], cnt2 = U.randInt(1, 4, r), amount = 0;
      var cur = r() < 0.62 ? 'EUR' : 'USD';
      var fxRate = cur === 'EUR' ? 7.82 : 7.13;
      var pool = products.filter(function (p) { return p.supplierId === sup.id; });
      if (!pool.length) pool = products;
      for (var b = 0; b < cnt2; b++) {
        var p2 = pool[U.randInt(0, pool.length - 1, r)];
        var q = U.randInt(100, 6000, r), price = U.round(p2.unitPrice * U.rand(0.92, 1.1, r), 2);
        amount += q * price;
        items.push({
          productId: p2.id, name: p2.name, thumb: null,
          grade: GRADES[U.randInt(0, GRADES.length - 1, r)],
          qty: q, price: price, currency: cur, fxRate: fxRate,
          foreignPrice: U.round(price / fxRate, 2),
          weight: p2.weight, boxSpec: p2.boxSpec,
          amount: U.round(q * price, 2)
        });
      }
      var expected = U.addDays(created, sup.leadTime + U.randInt(0, 5, r));
      var late = st === 'received' && r() < 0.18;
      /* 演示用审批流程状态（仅前 3 单，便于切换角色体验完整流程；其余为旧版普通采购单） */
      var demoFlow = null, dMgr = null, dMgrName = null, dOp = null, dOpName = null, dNote = '', dStatus = st;
      if (a === 0) { dMgr = 'U2'; dMgrName = '张伟'; demoFlow = 'to_manager'; dStatus = 'draft'; }
      else if (a === 1) { dMgr = 'U2'; dMgrName = '张伟'; dOp = 'U3'; dOpName = '李静'; demoFlow = 'to_operator'; dStatus = 'draft'; }
      else if (a === 2) { dMgr = 'U2'; dMgrName = '张伟'; dOp = 'U3'; dOpName = '李静'; demoFlow = 'submitted'; dNote = '已按需求完成采购明细填报'; dStatus = 'draft'; }
      purchases.push({
        id: 'PO' + U.pad(a + 1),
        no: 'PO-2026' + U.pad(a + 1),
        supplierId: sup.id,
        supplierName: sup.name,
        items: items,
        amount: U.round(amount, 2),
        currency: cur,
        status: dStatus,
        createdAt: created,
        expectedAt: expected,
        receivedAt: dStatus === 'received' ? U.addDays(expected, late ? U.randInt(1, 9, r) : -U.randInt(0, 2, r)) : null,
        buyer: U.pick(NAMES, r),
        warehouseId: db.warehouses[U.randInt(0, db.warehouses.length - 1, r)].id,
        remark: r() < 0.3 ? U.pick(['紧急插单', '季度框架协议', '替代料试用', '备货计划'], r) : '',
        creatorId: 'U1', creatorName: '管理员',
        managerId: dMgr, managerName: dMgrName,
        operatorId: dOp, operatorName: dOpName,
        flow: demoFlow, flowNote: dNote, timeline: []
      });
    }
    db.purchases = purchases;

    /* ---------- 销售订单 ---------- */
    var soStatus = ['pending', 'confirmed', 'picking', 'shipped', 'delivered', 'cancelled'];
    var sales = [];
    for (var c = 0; c < 84; c++) {
      var cust = CUSTOMERS[U.randInt(0, CUSTOMERS.length - 1, r)];
      var co = U.randInt(0, 110, r);
      var cr = U.addDays(today, -co);
      var sst = soStatus[weightedIndex([0.1, 0.12, 0.1, 0.16, 0.46, 0.06], r())];
      if (co < 2 && sst === 'delivered') sst = 'shipped';
      var it2 = [], c3 = U.randInt(1, 3, r), amt = 0;
      for (var d2 = 0; d2 < c3; d2++) {
        var p3 = products[U.randInt(0, products.length - 1, r)];
        var q3 = U.randInt(20, 2500, r), pr3 = U.round(p3.unitPrice * U.rand(1.25, 1.75, r), 2);
        amt += q3 * pr3;
        it2.push({ productId: p3.id, name: p3.name, qty: q3, price: pr3, amount: U.round(q3 * pr3, 2) });
      }
      sales.push({
        id: 'SO' + U.pad(c + 1),
        no: 'SO-2026' + U.pad(c + 1),
        customer: cust,
        channel: U.pick(['直销', '经销', '电商平台', '海外'], r),
        items: it2,
        amount: U.round(amt, 2),
        status: sst,
        priority: r() < 0.18 ? 'high' : (r() < 0.4 ? 'medium' : 'low'),
        createdAt: cr,
        dueAt: U.addDays(cr, U.randInt(5, 30, r)),
        deliveredAt: sst === 'delivered' ? U.addDays(cr, U.randInt(3, 25, r)) : null,
        warehouseId: db.warehouses[U.randInt(0, db.warehouses.length - 1, r)].id,
        owner: U.pick(NAMES, r)
      });
    }
    db.sales = sales;

    /* ---------- 物流运输 ---------- */
    var shipStatus = ['pending', 'in_transit', 'arrived', 'exception'];
    var shipments = [];
    for (var e = 0; e < 46; e++) {
      var ref = r() < 0.55 ? purchases[U.randInt(0, purchases.length - 1, r)] : sales[U.randInt(0, sales.length - 1, r)];
      var sst2 = shipStatus[weightedIndex([0.12, 0.4, 0.4, 0.08], r())];
      var fromWh = db.warehouses[U.randInt(0, db.warehouses.length - 1, r)];
      var toCity = U.pick(CITIES[U.pick(REGIONS, r)], r);
      var prog = sst2 === 'arrived' ? 100 : (sst2 === 'exception' ? U.randInt(30, 75, r) : U.randInt(10, 90, r));
      var dep = U.addDays(today, -U.randInt(1, 40, r));
      var nodes = [
        { t: '已下单', at: dep, done: true },
        { t: '仓库拣货', at: U.addDays(dep, 1), done: prog > 20 },
        { t: '已发运', at: U.addDays(dep, 2), done: prog > 35 },
        { t: '干线运输', at: U.addDays(dep, 3), done: prog > 60 },
        { t: '到达分拨中心', at: U.addDays(dep, 4), done: prog > 80 },
        { t: '派送中', at: U.addDays(dep, 5), done: prog > 92 },
        { t: '已签收', at: U.addDays(dep, 6), done: prog >= 100 }
      ];
      shipments.push({
        id: 'SH' + U.pad(e + 1),
        no: 'SF' + U.randInt(100000000000, 999999999999, r),
        refNo: ref.no,
        refType: ref.no.indexOf('PO') === 0 ? 'purchase' : 'sales',
        carrier: U.pick(CARRIERS, r),
        from: fromWh.city, to: toCity,
        status: sst2,
        progress: prog,
        weight: U.round(U.rand(20, 4200, r), 1),
        volume: U.round(U.rand(1, 60, r), 2),
        cost: U.round(U.rand(120, 9800, r), 2),
        eta: U.addDays(dep, U.randInt(3, 8, r)),
        driver: U.pick(NAMES, r) + ' · ' + U.pick(['沪A', '粤B', '京C', '苏E', '鄂A'], r) + U.randInt(10000, 99999, r),
        nodes: sst2 === 'exception' ? nodes.slice(0, 4) : nodes
      });
    }
    db.shipments = shipments;

    /* ---------- 财务对账 ----------
       不再预置示例账单：由 Analytics 按实际采购单 / 销售订单实时生成 */
    db.invoices = [];

    /* ---------- 用户 ---------- */
    var users = [
      { id: 'U1', name: '管理员', account: 'admin', role: 'admin', dept: '运营部', phone: '13800000001', email: 'admin@scm.demo', status: 'active', lastLogin: U.nowStr(), createdAt: U.addDays(today, -420) },
      { id: 'U2', name: '张伟', account: 'zhangwei', role: 'manager', dept: '采购部', phone: '13800000002', email: 'zw@scm.demo', status: 'active', lastLogin: U.addDays(today, -1), createdAt: U.addDays(today, -380) },
      { id: 'U3', name: '李静', account: 'lijing', role: 'operator', dept: '仓储部', phone: '13800000003', email: 'lj@scm.demo', status: 'active', lastLogin: U.addDays(today, -3), createdAt: U.addDays(today, -300) },
      { id: 'U4', name: '王磊', account: 'wanglei', role: 'viewer', dept: '财务部', phone: '13800000004', email: 'wl@scm.demo', status: 'disabled', lastLogin: U.addDays(today, -40), createdAt: U.addDays(today, -260) }
    ];
    for (var g = 4; g < 12; g++) {
      users.push({
        id: 'U' + (g + 1), name: NAMES[g], account: 'user' + (g + 1),
        role: U.pick(['manager', 'operator', 'viewer', 'operator'], r),
        dept: U.pick(DEPTS, r), phone: '138' + U.pad(g + 10) + U.randInt(1000, 9999, r),
        email: 'user' + (g + 1) + '@scm.demo',
        status: r() < 0.15 ? 'disabled' : 'active',
        lastLogin: U.addDays(today, -U.randInt(0, 30, r)),
        createdAt: U.addDays(today, -U.randInt(60, 400, r))
      });
    }
    db.users = users;

    /* ---------- 经营分析数据 ----------
       月度趋势 / 区域分布 / 品类结构不再预置随机示例值，
       由 Analytics 从实际业务单据实时聚合，Store.save() 前刷新。 */
    db.monthly = [];
    db.regionData = [];
    db.categoryData = [];

    db.meta = { version: '1.0.0', generatedAt: U.nowStr(), company: '智联供应链科技（上海）有限公司' };
    return db;
  }

  function weightedIndex(weights, x) {
    var acc = 0;
    for (var i = 0; i < weights.length; i++) { acc += weights[i]; if (x <= acc) return i; }
    return weights.length - 1;
  }

  global.Seed = {
    build: build, CITIES: CITIES, REGIONS: REGIONS, CATS: CATS, CAT_CODES: CAT_CODES,
    PROVINCES: PROVINCES, citiesOf: citiesOf, regionOf: regionOf, provinceByCity: provinceByCity,
    WH_TYPES: WH_TYPES, WH_TEMPS: WH_TEMPS, WH_STATUS: WH_STATUS,
    GRADES: GRADES, DEFAULT_GRADE: DEFAULT_GRADE, PRODUCT_STATUS: PRODUCT_STATUS,
    UNITS: UNITS, BRANDS: BRANDS, COLORS: COLORS, MATERIALS: MATERIALS, SPECS: SPECS,
    CARRIERS: CARRIERS, DEPTS: DEPTS
  };
})(window);
