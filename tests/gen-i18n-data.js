/* 生成数据类词典（地名 / 公司名 / 人名）：运行时只读，无依赖
   用法：NODE_PATH=<含 pinyin-pro 的 node_modules> node tests/gen-i18n-data.js
   输出：assets/js/core/i18n-data.js
*/
const fs = require('fs');
const path = require('path');
const { pinyin } = require('pinyin-pro');
const DIR = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(DIR, 'assets/js/core/seed.js'), 'utf8');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-corpus.json'), 'utf8'));

const D = {};
function put(zh, en, de) { if (zh && !D[zh]) D[zh] = [en, de === undefined ? en : de]; }

/* 拼音：首字母大写连写，特殊多音字修正 */
const PINYIN_FIX = {
  '重庆': 'Chongqing', '重庆市': 'Chongqing', '六安': "Lu'an", '六盘水': 'Liupanshui',
  '长沙': 'Changsha', '长春': 'Changchun', '厦门': 'Xiamen', '台州': 'Taizhou',
  '蚌埠': 'Bengbu', '郴州': 'Chenzhou', '涪陵': 'Fuling', '齐齐哈尔': 'Qiqihar',
  '鄂尔多斯': 'Ordos', '乌鲁木齐': 'Urumqi', '克拉玛依': 'Karamay', '喀什': 'Kashgar',
  '呼和浩特': 'Hohhot', '呼伦贝尔': 'Hulunbuir', '乌兰察布': 'Ulanqab',
  '拉萨': 'Lhasa', '日喀则': 'Shigatse', '那曲': 'Nagqu', '林芝': 'Nyingchi',
  '山南': 'Shannan', '昌都': 'Chamdo', '阿里': 'Ngari',
  '中国香港': 'Hong Kong, China', '中国澳门': 'Macao, China', '中国台湾': 'Taiwan, China',
  '香港': 'Hong Kong, China', '澳门': 'Macao, China', '台湾': 'Taiwan, China',
  '台北': 'Taipei', '新北': 'New Taipei', '桃园': 'Taoyuan', '台中': 'Taichung',
  '台南': 'Tainan', '高雄': 'Kaohsiung', '基隆': 'Keelung', '新竹': 'Hsinchu', '嘉义': 'Chiayi',
  '黑龙江省': 'Heilongjiang', '黑龙江省': 'Heilongjiang'
};
const DE_FIX = {
  '中国香港': 'Hongkong, China', '中国澳门': 'Macau, China', '中国台湾': 'Taiwan, China',
  '北京': 'Peking', '北京市': 'Peking', '重庆': 'Chongqing', '重庆市': 'Chongqing'
};
function py(s) {
  if (PINYIN_FIX[s]) return PINYIN_FIX[s];
  const arr = pinyin(s, { toneType: 'none', type: 'array' });
  return arr.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('');
}
/* 省份名 → 去行政后缀 */
function provinceName(s) {
  if (PINYIN_FIX[s]) return PINYIN_FIX[s];
  const clean = s.replace(/(壮族|回族|维吾尔|自治区|特别行政|省|市|区)$/g, '').replace(/(壮族|回族|维吾尔|自治区)$/g, '');
  return py(clean);
}

/* ---- 省份 / 城市 ---- */
const provBlock = seed.slice(seed.indexOf('var PROVINCE_RAW'), seed.indexOf('var PROVINCES ='));
const provRows = [...provBlock.matchAll(/\['([^']+)',\s*'([^']+)',\s*'([^']+)'\]/g)].map(m => m.slice(1));
const cities = new Set();
provRows.forEach(([p, , cs]) => {
  put(p, provinceName(p), DE_FIX[p] || provinceName(p));
  cs.split(',').forEach(c => cities.add(c));
});
const cityBlock = seed.slice(seed.indexOf('var CITIES ='), seed.indexOf('/* 省级行政区'));
[...cityBlock.matchAll(/'([^']+)':\s*\[([^\]]+)\]/g)].forEach(m => {
  m[2].split(',').forEach(c => cities.add(c.replace(/['\s]/g, '')));
});
[...cities].filter(Boolean).forEach(c => put(c, py(c), DE_FIX[c] || py(c)));
/* 城市 + 「市」的常见组合 */
[...cities].filter(Boolean).forEach(c => {
  if (c.length <= 3 && !/市$/.test(c)) put(c + '市', py(c), DE_FIX[c] || py(c));
});

/* ---- 公司名 ---- */
const SUFFIX = {
  '科技有限公司': ['Technology Co., Ltd.', 'Technologie GmbH'],
  '实业股份有限公司': ['Industrial Co., Ltd.', 'Industrie AG'],
  '精密制造有限公司': ['Precision Manufacturing Co., Ltd.', 'Präzisionsfertigung GmbH'],
  '新材料有限公司': ['Advanced Materials Co., Ltd.', 'Neue Werkstoffe GmbH'],
  '工业集团有限公司': ['Industrial Group Co., Ltd.', 'Industriegruppe GmbH'],
  '电子有限公司': ['Electronics Co., Ltd.', 'Elektronik GmbH'],
  '供应链有限公司': ['Supply Chain Co., Ltd.', 'Supply-Chain GmbH'],
  '塑胶制品有限公司': ['Plastic Products Co., Ltd.', 'Kunststoffprodukte GmbH']
};
const prefixBlock = seed.match(/var SUP_PREFIX = \[([^\]]+)\]/)[1];
const prefixes = [...prefixBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
prefixes.forEach(p => put(p, py(p), py(p)));
Object.keys(SUFFIX).forEach(s => put(s, SUFFIX[s][0].trim(), SUFFIX[s][1].trim()));
prefixes.forEach(p => Object.keys(SUFFIX).forEach(s => {
  put(p + s, py(p) + ' ' + SUFFIX[s][0], py(p) + ' ' + SUFFIX[s][1]);
}));
/* 品牌固定名 */
put('智联', 'Zhilian', 'Zhilian');
put('智联科技有限公司', 'Zhilian Technology Co., Ltd.', 'Zhilian Technologie GmbH');
put('智联供应链科技', 'Zhilian Supply Chain Technology', 'Zhilian Supply-Chain-Technologie');
put('智联供应链科技（上海）有限公司', 'Zhilian Supply Chain Technology (Shanghai) Co., Ltd.', 'Zhilian Supply-Chain-Technologie (Shanghai) GmbH');

/* ---- 人名 / 姓氏 ---- */
const nameBlock = seed.match(/var NAMES = \[([^\]]+)\]/)[1];
const names = [...nameBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
const pyName = s => pinyin(s, { toneType: 'none', type: 'array' })
  .map((x, i) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
names.forEach(n => { put(n, pyName(n), pyName(n)); put(n[0], pinyin(n[0], { toneType: 'none' }), pinyin(n[0], { toneType: 'none' })); });

/* ---- 仓库名 ---- */
const WH_NAME = {
  '华东中心仓': ['East China Central Warehouse', 'Zentrallager Ostchina'],
  '华南中心仓': ['South China Central Warehouse', 'Zentrallager Südchina'],
  '华北中心仓': ['North China Central Warehouse', 'Zentrallager Nordchina'],
  '华中中转仓': ['Central China Transit Warehouse', 'Umschlaglager Zentralchina'],
  '西南分仓': ['Southwest Branch Warehouse', 'Niederlassungslager Südwest'],
  '东北分仓': ['Northeast Branch Warehouse', 'Niederlassungslager Nordost'],
  '华南冷链前置仓': ['South China Cold-Chain Forward Warehouse', 'Kühlketten-Vorlager Südchina']
};
Object.keys(WH_NAME).forEach(k => put(k, WH_NAME[k][0], WH_NAME[k][1]));

/* ---- 输出覆盖检查 ---- */
const segs = new Set();
[...corpus.text, ...corpus.attr, ...corpus.title, ...corpus.source].forEach(s => {
  (s.match(/[\u4e00-\u9fff]+/g) || []).forEach(x => segs.add(x));
});
const covered = [...segs].filter(x => D[x]);
const missing = [...segs].filter(x => !D[x]);
console.log('数据词条:', Object.keys(D).length, '| 语料片段覆盖:', covered.length, '/', segs.size, '| 待手写:', missing.length);
fs.writeFileSync(path.join(__dirname, 'i18n-missing.json'), JSON.stringify(missing.sort(), null, 2), 'utf8');

/* 字符级拼音兜底：任何未收录的汉字也不会以中文残留在界面上 */
const CH = {};
[...segs].join('').split('').filter(c => /[\u4e00-\u9fff]/.test(c)).forEach(c => {
  if (!CH[c]) CH[c] = pinyin(c, { toneType: 'none' }).replace(/^./, x => x.toUpperCase());
});
/* 常见单字（语料外也可能出现） */
'供应链采购销售库存仓库物流运输订单财务对账报表分析管理系统设置用户角色权限供应商商品物料数量金额价格重量箱规等级状态类型名称编码备注日期时间年月日今天昨天前页条项笔张座家个件套箱卷种次元万亿低高紧急风险预警提示确认保存取消关闭编辑删除新增添加详情操作搜索导出更新启用停用暂停审批推进结清盘点合计小计总计平均最近近周月季年度区域城市省份地址电话邮箱联系人负责人部门姓名账号登录退出访客管理员只读模式数据源刷新筛选全选清空选择确定继续重置备份导出成功失败无有可否请填写输入选择或从建议中可手动覆盖自动折算实时汇率外币欧元美元价产品缩略图上传图片删除该行'.split('').forEach(c => {
  if (/[\u4e00-\u9fff]/.test(c) && !CH[c]) CH[c] = pinyin(c, { toneType: 'none' }).replace(/^./, x => x.toUpperCase());
});
console.log('字符兜底:', Object.keys(CH).length);

const body = '/* SCM · 数据类本地化词典（自动生成，勿手改）\n' +
  '   覆盖：省份 / 城市 / 供应商名称 / 人名 / 仓库名 / 汉字兜底转写\n' +
  '   格式：中文原文 -> [English, Deutsch]\n' +
  '*/\nwindow.I18N_DATA = ' + JSON.stringify(D, null, 2) + ';\n' +
  'window.I18N_CHAR = ' + JSON.stringify(CH) + ';\n';
fs.writeFileSync(path.join(DIR, 'assets/js/core/i18n-data.js'), body, 'utf8');
console.log('已生成 assets/js/core/i18n-data.js');
