/* 词典覆盖率 / 翻译质量检查：模拟引擎切分，列出仍会回退到单字拼音的中文片段 */
global.window = global;
require('../assets/js/core/i18n-data.js');
require('../assets/js/core/i18n-dict.js');
require('../assets/js/core/i18n-products.js');
const fs = require('fs');
const path = require('path');
const D = Object.assign({}, global.I18N_DATA, global.I18N_DICT);
const CH = global.I18N_CHAR;
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-corpus.json'), 'utf8'));

const byLen = {}, lengths = [];
Object.keys(D).forEach(k => {
  if (!/^[\u4e00-\u9fff]+$/.test(k)) return;
  (byLen[k.length] = byLen[k.length] || {})[k] = D[k];
});
Object.keys(byLen).map(Number).sort((a, b) => b - a).forEach(x => lengths.push(x));

function seg(part, ix) {
  let i = 0, out = [], miss = [];
  while (i < part.length) {
    let hit = null;
    for (const L of lengths) {
      if (L > part.length - i) continue;
      const v = byLen[L][part.substr(i, L)];
      if (v) { hit = { L, txt: v[ix] || v[0] }; break; }
    }
    if (hit) { out.push(hit.txt); i += hit.L; }
    else { const c = part[i]; miss.push(c); out.push(CH[c] || c); i++; }
  }
  return { txt: out.join(' ').replace(/\s{2,}/g, ' ').trim(), miss };
}
function tr(s, ix) {
  if (D[s] && D[s][ix]) return { txt: D[s][ix], miss: [] };
  let miss = [];
  const out = s.split(/([\u4e00-\u9fff]+)/).map(p => {
    if (!p) return '';
    if (/^[\u4e00-\u9fff]+$/.test(p)) { const r = seg(p, ix); miss = miss.concat(r.miss); return r.txt; }
    return p;
  }).join('');
  return { txt: out, miss };
}

const strings = [...new Set([...corpus.text, ...corpus.attr, ...corpus.title, ...corpus.source])];
const bad = {}, samples = [];
strings.forEach(s => {
  const en = tr(s, 0), de = tr(s, 1);
  const miss = [...new Set([...en.miss, ...de.miss])];
  miss.forEach(c => bad[c] = (bad[c] || 0) + 1);
  if (miss.length && /[\u4e00-\u9fff]/.test(s)) samples.push({ s, en: en.txt, de: de.txt, miss: miss.join('') });
});
const langResidual = strings.filter(s => {
  const en = tr(s, 0).txt;
  return /[\u4e00-\u9fff]/.test(en);
});

console.log('语料字符串:', strings.length);
console.log('精确/组合后仍含中文的字符串:', langResidual.length);
console.log('回退单字:', Object.keys(bad).length, '个 / 出现', Object.values(bad).reduce((a, b) => a + b, 0), '次');
console.log('高频回退字:', Object.entries(bad).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => k + ':' + v).join(' '));
console.log('\n--- 需要补词条的片段（按长度降序，前 120）---');
samples.sort((a, b) => b.s.length - a.s.length).slice(0, 120).forEach(x => {
  console.log(x.s + '\n  EN: ' + x.en + '\n  DE: ' + x.de + '\n  MISS: ' + x.miss);
});
fs.writeFileSync(path.join(__dirname, 'i18n-review.json'), JSON.stringify({
  badChars: bad, samples, residual: langResidual
}, null, 2), 'utf8');
