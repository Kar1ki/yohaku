/* 余白 — その場で翻訳(Windows版とiPad版で共通の部品)
   無料で使える翻訳の窓口を複数持ち、1つが混雑・拒否・不通になったら次へ切り替える。
   調子の悪い窓口はしばらく休ませ、時間がたったら自動でまた使う。
   送るのは「翻訳」を押したときに選んでいた文だけ。PDF本体・メモ・書き込みは送らない。
   fetch は呼び出し側から渡す(Windows版は専用の通信セッション、iPad版はブラウザのfetch)。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YohakuTranslate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  class TrError extends Error {
    constructor(code, msg, status) { super(msg); this.code = code; this.status = status || 0; }
  }
  const isJa = t => { const ja = (t.match(/[぀-ヿ㐀-鿿]/g) || []).length, lat = (t.match(/[A-Za-z]/g) || []).length; return ja > 0 && ja >= lat * 0.25; };
  const decodeEntities = s => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // 応答を確かめる(混雑・拒否・空)
  async function check(res, name) {
    if (res.status === 429) throw new TrError('busy', name + 'が混み合っています。', 429);
    if (res.status === 403) throw new TrError('blocked', name + 'に一時的に断られました。', 403);
    if (!res.ok) throw new TrError('http', name + 'から応答がありませんでした（' + res.status + '）。', res.status);
    const txt = await res.text();
    try { return JSON.parse(txt); } catch (e) { throw new TrError('parse', name + 'の応答を読み取れませんでした。'); }
  }
  const timeoutSignal = ms => {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
    const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal;
  };
  const form = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };

  // 1) Google翻訳(gtx)
  async function googleGtx(f, text, tl, host) {
    const base = 'https://' + host + '/translate_a/single?client=gtx&dt=t&sl=auto&tl=' + tl;
    const q = encodeURIComponent(text);
    const res = q.length < 1800 ? await f(base + '&q=' + q, { signal: timeoutSignal(8000) })
      : await f(base, { method: 'POST', headers: form, body: 'q=' + q, signal: timeoutSignal(8000) });
    const d = await check(res, 'Google 翻訳');
    const out = (Array.isArray(d) && Array.isArray(d[0]) ? d[0] : []).map(x => (x && x[0]) || '').join('');
    if (!out) throw new TrError('empty', 'Google 翻訳の結果が空でした。');
    return { text: out, detected: (typeof d[2] === 'string' ? d[2] : ''), engine: 'Google 翻訳' };
  }
  // 2) Google翻訳(Chromeの辞書拡張と同じ窓口)
  async function googleDict(f, text, tl) {
    const base = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' + tl;
    const q = encodeURIComponent(text);
    const res = q.length < 1800 ? await f(base + '&q=' + q, { signal: timeoutSignal(8000) })
      : await f(base, { method: 'POST', headers: form, body: 'q=' + q, signal: timeoutSignal(8000) });
    const d = await check(res, 'Google 翻訳');
    let out = '', det = '';
    if (Array.isArray(d)) {
      const first = d[0];
      if (Array.isArray(first)) { out = first[0] || ''; det = first[1] || ''; }
      else if (typeof first === 'string') out = d.join('');
    } else if (d && Array.isArray(d.sentences)) {
      out = d.sentences.map(s => s.trans || '').join(''); det = d.src || '';
    }
    if (!out) throw new TrError('empty', 'Google 翻訳の結果が空でした。');
    return { text: out, detected: det, engine: 'Google 翻訳' };
  }
  // 3) MyMemory(1回に送れる量が少ないので、文ごとに区切って送る)
  function chunks(text, maxBytes) {
    const enc = s => unescape(encodeURIComponent(s)).length;
    const parts = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [text], out = [];
    let cur = '';
    for (let p of parts) {
      while (enc(p) > maxBytes) { // 1文が長すぎるときは途中で切る
        let i = Math.min(p.length, Math.floor(maxBytes / 3));
        const sp = p.lastIndexOf(' ', i); if (sp > i / 2) i = sp;
        if (cur) { out.push(cur); cur = ''; }
        out.push(p.slice(0, i)); p = p.slice(i);
      }
      if (enc(cur + p) > maxBytes) { if (cur) out.push(cur); cur = p; } else cur += p;
    }
    if (cur.trim()) out.push(cur);
    return out.map(s => s.trim()).filter(Boolean);
  }
  async function myMemory(f, text, tl) {
    const sl = tl === 'ja' ? 'en' : 'ja';
    const outs = [];
    for (const c of chunks(text.slice(0, 3000), 450)) {
      const res = await f('https://api.mymemory.translated.net/get?langpair=' + sl + '|' + tl + '&q=' + encodeURIComponent(c), { signal: timeoutSignal(8000) });
      const d = await check(res, 'MyMemory');
      const t = d && d.responseData && d.responseData.translatedText;
      if (!t || +d.responseStatus === 429 || /^MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) throw new TrError('busy', 'MyMemoryの今日の上限に達しました。', 429);
      outs.push(decodeEntities(t));
    }
    if (!outs.length) throw new TrError('empty', 'MyMemoryの結果が空でした。');
    return { text: outs.join(tl === 'ja' ? '' : ' '), detected: sl, engine: 'MyMemory' };
  }

  /* 翻訳する人
     opts.fetch       : 通信に使う fetch
     opts.extra       : 先に試す窓口(Windows版のDeepLなど) [{name, run(text, tl)}]
     opts.onTrouble   : 窓口が失敗したときに呼ぶ(Windows版は通信をつなぎ直す) */
  function create(opts) {
    const f = opts.fetch;
    const engines = [
      { name: 'gtx', run: (t, tl) => googleGtx(f, t, tl, 'translate.googleapis.com') },
      { name: 'dict', run: (t, tl) => googleDict(f, t, tl) },
      { name: 'gtx2', run: (t, tl) => googleGtx(f, t, tl, 'translate.google.com') },
    ];
    if (opts.myMemory !== false) engines.push({ name: 'mymemory', run: (t, tl) => myMemory(f, t, tl) });
    const rest = new Map(); // 窓口 → 休ませる期限
    const cache = new Map();
    async function translate(text, tl) {
      text = String(text || '').slice(0, 5000); tl = tl === 'en' ? 'en' : 'ja';
      const list = (opts.extra ? opts.extra() : []).concat(engines);
      const key = list.map(e => e.name).join(',') + '|' + tl + '|' + text;
      if (cache.has(key)) return cache.get(key);
      const now = Date.now();
      // 休み中の窓口は後回しにする(全部休み中なら、期限が早いものから試す)
      const order = list.filter(e => !(rest.get(e.name) > now)).concat(list.filter(e => rest.get(e.name) > now).sort((a, b) => rest.get(a.name) - rest.get(b.name)));
      let last = null, offline = true;
      for (const e of order) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await e.run(text, tl);
            rest.delete(e.name);
            if (cache.size > 300) cache.delete(cache.keys().next().value);
            cache.set(key, r);
            return r;
          } catch (err) {
            last = err;
            if (err instanceof TrError) offline = false;
            if (err instanceof TrError && (err.code === 'nokey' || err.code === 'badkey')) break;
            // 1回目の失敗では通信をつなぎ直して同じ窓口をもう1回(アプリの再起動と同じ効果)
            if (attempt === 0 && opts.onTrouble) { try { await opts.onTrouble(e.name, err); } catch (x) {} continue; }
            break;
          }
        }
        const busy = last instanceof TrError && (last.status === 429 || last.status === 403);
        rest.set(e.name, Date.now() + (busy ? 15 : 3) * 60 * 1000);
      }
      if (offline && opts.isOffline && opts.isOffline()) throw new TrError('offline', 'オフラインのため翻訳できません。');
      if (last && last.code === 'nokey') throw last;
      throw new TrError(last && last.code === 'busy' ? 'busy' : 'down',
        '翻訳サービスが一時的に使えません（Google 翻訳への接続が混み合っているか、制限されています）。数分たってからもう一度押してください。');
    }
    return { translate, status: () => Object.fromEntries([...rest].map(([k, v]) => [k, Math.max(0, Math.round((v - Date.now()) / 1000))])) };
  }
  return { create, TrError, chunks, _engines: { googleGtx, googleDict, myMemory } };
});
