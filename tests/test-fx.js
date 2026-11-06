/* 实时汇率链路测试：mock fetch 返回 ECB 数据，验证折算与底部双币种走势 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ECB = {
  amount: 1, base: 'CNY',
  start_date: '2026-10-29', end_date: '2026-11-05',
  rates: {
    '2026-10-29': { EUR: 0.13487, USD: 0.15011 },
    '2026-10-30': { EUR: 0.13454, USD: 0.15031 },
    '2026-11-02': { EUR: 0.13411, USD: 0.15042 },
    '2026-11-03': { EUR: 0.13407, USD: 0.14987 },
    '2026-11-04': { EUR: 0.13302, USD: 0.14987 }
  }
};

(async () => {
  const html = fs.readFileSync(path.join(DIR, 'admin.html'), 'utf8');
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message || '')) errs.push('[jsdomError] ' + (e.message || e)); });

  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, 'admin.html').replace(/\\/g, '/'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.fetch = (url) => Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(url.includes('frankfurter') ? ECB : {})
      });
    }
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.message || e.message)));
  await sleep(1500);
  const w = dom.window, d = w.document;
  let fail = 0;
  const check = (name, ok, extra) => {
    console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : ''));
    if (!ok) fail++;
  };

  check('FX 已初始化', !!w.FX);
  check('走 frankfurter 数据源', w.FX.source === 'frankfurter', w.FX.source);
  const eur = w.FX.rate('EUR'), usd = w.FX.rate('USD');
  check('EUR 折算正确（1/0.13302≈7.5177）', Math.abs(eur - 7.5177) < 0.001, String(eur));
  check('USD 折算正确（1/0.14987≈6.6724）', Math.abs(usd - 6.6724) < 0.001, String(usd));
  check('EUR 历史 7 天', w.FX.series('EUR', 7).length === 7, String(w.FX.series('EUR', 7).length));
  check('USD 历史 7 天', w.FX.series('USD', 7).length === 7, String(w.FX.series('USD', 7).length));
  check('标记为实时', w.FX.isLive === true);

  w.location.hash = '#/purchases';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await sleep(400);
  const addBtn = Array.from(d.querySelectorAll('#aApp button')).find(b => b.textContent.includes('新增'));
  addBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  const modal = d.querySelector('.modal');
  check('弹窗为超宽布局', modal.classList.contains('xwide'));

  const head = modal.textContent;
  check('列头显示 ECB 实时汇率', head.includes('1€ = 7.5177 ¥'), (head.match(/1€ = [\d.]+ ¥/) || [''])[0]);

  const row = modal.querySelector('[data-row]');
  const price = Number(row.querySelector('[data-p]').value);
  const fxVal = Number(row.querySelector('[data-e]').value);
  check('外币价按实时汇率折算', Math.abs(fxVal - Math.round(price / eur * 100) / 100) < 0.02,
    'price=' + price + ' fx=' + fxVal);

  const usdBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('美元'));
  usdBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  check('切美元后显示美元汇率', modal.textContent.includes('1$ = 6.6724 ¥'));
  const fxUsd = Number(row.querySelector('[data-e]').value);
  check('切美元后外币价重算', Math.abs(fxUsd - Math.round(price / usd * 100) / 100) < 0.02, 'fx=' + fxUsd);

  const rows7 = Array.from(modal.querySelectorAll('div')).filter(el => el.style.display === 'grid' && /^(今天|\d{2}-\d{2} 周)/.test((el.textContent || '').slice(0, 12).trim()));
  check('底部汇率面板改为逐日列表', rows7.length === 7, 'rows=' + rows7.length);
  check('列表逐日显示欧元汇率', rows7.every(r => /¥\d+\.\d{4}/.test(r.textContent)), rows7[0] && rows7[0].textContent.slice(0, 60));
  check('列表今天在首行', (rows7[0] || {}).textContent && rows7[0].textContent.includes('今天'), rows7[0] && rows7[0].textContent.slice(0, 40));
  check('列表无折线图', modal.querySelectorAll('.chart svg').length === 0);
  check('标注数据来源', modal.textContent.includes('ECB'));

  console.log('\n错误:', errs.length ? errs.slice(0, 5) : '无');
  console.log('结果：' + (fail ? fail + ' 项异常 ✗' : '全部通过 ✓'));
  process.exit(fail ? 1 : 0);
})();
