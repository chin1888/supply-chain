/* ============================================================
   SCM · 实时汇率 FX
   CNY 计价，返回「1 单位外币 = 多少人民币」
   数据源优先级：
     1) frankfurter.dev（ECB，一次请求可取最新 + 区间历史）
     2) jsDelivr @fawazahmed0/currency-api（最新 + 按日期历史）
     3) open.er-api.com（仅最新）
     4) 内置参考汇率（离线兜底）
   缓存 localStorage 30 分钟，缓存可直接用于首屏渲染
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.U;
  var CACHE_KEY = 'scm_fx_v1';
  var TTL = 30 * 60 * 1000;
  var CURRENCIES = ['EUR', 'USD'];
  var FALLBACK = { EUR: 7.82, USD: 7.13 };   // 离线参考值
  var SYMBOL = { EUR: '€', USD: '$' };

  var FX = {
    latest: { EUR: FALLBACK.EUR, USD: FALLBACK.USD },
    history: { EUR: [], USD: [] },
    source: 'offline',
    isLive: false,
    updatedAt: null,
    loading: false,
    _subs: [],

    symbol: function (c) { return SYMBOL[c] || c; },
    name: function (c) { return c === 'EUR' ? '欧元' : (c === 'USD' ? '美元' : c); },
    /** 1 外币 兑 人民币 */
    rate: function (c) { return this.latest[c] || FALLBACK[c] || 1; },
    /** 按人民币金额折算外币 */
    convert: function (cny, c) { return U.round((Number(cny) || 0) / this.rate(c), 2); },
    /** 某币种近 n 天历史（含今天），缺失日期用前值补齐 */
    series: function (c, n) {
      var arr = (this.history[c] || []).slice(-(n || 7));
      return arr;
    },

    subscribe: function (fn) {
      this._subs.push(fn);
      var self = this;
      return function () { self._subs = self._subs.filter(function (f) { return f !== fn; }); };
    },
    _emit: function () {
      var self = this;
      this._subs.forEach(function (f) { try { f(self); } catch (e) { } });
    },

    /* ---------- 缓存 ---------- */
    _readCache: function () {
      try {
        var raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        var c = JSON.parse(raw);
        if (!c || !c.latest) return null;
        return c;
      } catch (e) { return null; }
    },
    _writeCache: function () {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          latest: this.latest, history: this.history, source: this.source,
          updatedAt: this.updatedAt, ts: Date.now()
        }));
      } catch (e) { }
    },

    /** 首屏：先用缓存（或兜底）渲染，再异步刷新 */
    init: function () {
      var c = this._readCache();
      if (c) {
        this.latest = c.latest;
        this.history = c.history || { EUR: [], USD: [] };
        this.source = c.source || 'cache';
        this.updatedAt = c.updatedAt || null;
        this.isLive = this.source !== 'offline';
      } else {
        this._seedHistory();
      }
      var stale = !c || (Date.now() - (c.ts || 0) > TTL);
      if (stale) this.refresh();
      return this;
    },

    /** 无历史数据时，用当前汇率造一条平线，避免图表空白 */
    _seedHistory: function () {
      var self = this;
      CURRENCIES.forEach(function (cur) {
        var out = [];
        for (var i = 6; i >= 0; i--) {
          var d = new Date(); d.setDate(d.getDate() - i);
          out.push({ date: dateStr(d), rate: self.rate(cur) });
        }
        self.history[cur] = out;
      });
    },

    refresh: function () {
      if (this.loading) return Promise.resolve(this.latest);
      this.loading = true;
      var self = this;
      return fetchFrankfurter()
        .then(function (r) { return r; })
        .catch(function () { return fetchCurrencyApi(); })
        .catch(function () { return fetchErApi(); })
        .then(function (r) {
          self.latest = r.latest;
          self.history = r.history;
          self.source = r.source;
          self.isLive = true;
          self.updatedAt = new Date();
          self._writeCache();
          self.loading = false;
          self._emit();
          return self.latest;
        })
        .catch(function () {
          self.loading = false;
          if (!self.history.EUR.length) self._seedHistory();
          self.source = 'offline';
          self.isLive = false;
          self._emit();
          return self.latest;
        });
    }
  };

  function dateStr(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function shiftDays(n) {
    var d = new Date(); d.setDate(d.getDate() + n); return d;
  }
  function withTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms || 6000);
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        if (done) return; done = true; clearTimeout(timer); resolve(j);
      }).catch(function (e) {
        if (done) return; done = true; clearTimeout(timer); reject(e);
      });
    });
  }

  /* ---------- 1) frankfurter（ECB 参考汇率，CNY 为基准） ---------- */
  function fetchFrankfurter() {
    var start = dateStr(shiftDays(-8));
    var end = dateStr(new Date());
    var url = 'https://api.frankfurter.dev/v1/' + start + '..' + end + '?base=CNY&symbols=EUR,USD';
    return withTimeout(url, 6000).then(function (j) {
      if (!j || !j.rates) throw new Error('bad payload');
      var dates = Object.keys(j.rates).sort();
      if (!dates.length) throw new Error('no rates');
      var history = { EUR: [], USD: [] };
      dates.forEach(function (d) {
        CURRENCIES.forEach(function (c) {
          var v = j.rates[d][c];
          if (v) history[c].push({ date: d, rate: U.round(1 / v, 4) });
        });
      });
      var last = j.rates[dates[dates.length - 1]];
      var latest = {};
      CURRENCIES.forEach(function (c) { latest[c] = last[c] ? U.round(1 / last[c], 4) : FALLBACK[c]; });
      return { latest: latest, history: padHistory(history), source: 'frankfurter' };
    });
  }

  /* ---------- 2) jsDelivr currency-api（无 key，逐日快照） ---------- */
  function fetchCurrencyApi() {
    var days = [];
    for (var i = 6; i >= 0; i--) days.push(dateStr(shiftDays(-i)));
    var tasks = days.map(function (d, idx) {
      var tag = idx === days.length - 1 ? '@latest' : '@' + d;
      var url = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api' + tag + '/v1/currencies/cny.min.json';
      return withTimeout(url, 6000).then(function (j) {
        var r = j && j.cny;
        if (!r || !r.eur) throw new Error('bad payload');
        return { date: (j.date || d), EUR: 1 / r.eur, USD: 1 / r.usd };
      }).catch(function () { return null; });
    });
    return Promise.all(tasks).then(function (list) {
      var ok = list.filter(Boolean);
      if (!ok.length) throw new Error('no data');
      var history = { EUR: [], USD: [] };
      ok.forEach(function (x) {
        CURRENCIES.forEach(function (c) {
          history[c].push({ date: x.date, rate: U.round(x[c], 4) });
        });
      });
      var last = ok[ok.length - 1];
      return {
        latest: { EUR: U.round(last.EUR, 4), USD: U.round(last.USD, 4) },
        history: padHistory(history), source: 'currency-api'
      };
    });
  }

  /* ---------- 3) open.er-api.com（仅最新，历史用最新值铺平） ---------- */
  function fetchErApi() {
    return withTimeout('https://open.er-api.com/v6/latest/CNY', 6000).then(function (j) {
      if (!j || !j.rates || !j.rates.EUR) throw new Error('bad payload');
      var latest = { EUR: U.round(1 / j.rates.EUR, 4), USD: U.round(1 / j.rates.USD, 4) };
      var history = { EUR: [], USD: [] };
      for (var i = 6; i >= 0; i--) {
        var d = dateStr(shiftDays(-i));
        CURRENCIES.forEach(function (c) { history[c].push({ date: d, rate: latest[c] }); });
      }
      return { latest: latest, history: history, source: 'er-api' };
    });
  }

  /** 补齐最近 7 天（周末/节假日无报价时沿用前值） */
  function padHistory(h) {
    var out = { EUR: [], USD: [] };
    CURRENCIES.forEach(function (c) {
      var src = h[c] || [];
      if (!src.length) return;
      var map = {};
      src.forEach(function (x) { map[x.date] = x.rate; });
      var lastRate = src[0].rate;
      for (var i = 6; i >= 0; i--) {
        var d = dateStr(shiftDays(-i));
        var v = map[d] != null ? map[d] : (src.filter(function (x) { return x.date <= d; }).pop() || {}).rate;
        if (v == null) v = lastRate;
        lastRate = v;
        out[c].push({ date: d, rate: U.round(v, 4) });
      }
    });
    return out;
  }

  global.FX = FX;
})(window);
