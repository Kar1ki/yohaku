/* 余白 iPad版 — Windows版のメイン処理の代わりに、ブラウザの中で同じ機能を用意する
   ・Googleログイン: Googleのページへ移動 → 許可 → この画面に戻る(コードを長期の鍵に交換して端末内に保存)
   ・同期: Windows版と同じ drive-core.js を使う
   ・保存: iPadの「共有」シートでファイルアプリやGoogleドライブへ */
(function () {
  'use strict';
  const D = window.YohakuDrive;
  const LS = 'yohaku:google', PK = 'yohaku:pkce';
  // Androidアプリ版: 余白アプリ(WebView)が用意する橋渡し。ないときは普通のブラウザ版として動く
  const AN = window.YohakuAndroid || null;
  const cbs = {}; let cbSeq = 0;
  window.__yohakuCb = (id, val) => { const f = cbs[id]; delete cbs[id]; if (f) f(val); };
  const call = (fn, ...a) => new Promise(res => { const id = 'c' + (++cbSeq); cbs[id] = res; AN[fn](id, ...a); });
  const base = (() => { try { return localStorage.getItem('yohaku:googleBase') || undefined; } catch (e) { return undefined; } })(); // 動作確認用
  const f = (u, o) => fetch(u, o);
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const save = o => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} };
  function dev() {
    let d; try { d = JSON.parse(localStorage.getItem('yohaku:device')); } catch (e) {}
    if (!d || !/^[a-f0-9]{12}$/.test(d.id)) {
      d = { id: Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('') };
      try { localStorage.setItem('yohaku:device', JSON.stringify(d)); } catch (e) {}
    }
    const ua = navigator.userAgent;
    d.name = /iPhone/.test(ua) ? 'iPhone' : (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Androidスマホ' : 'Androidタブレット') : 'ブラウザ';
    return d;
  }
  const redirectUri = AN ? 'http://localhost:53682/oauth' : location.origin + location.pathname;
  let tm = null, drive = null, loginError = '';
  function client() {
    const c = load();
    if (!c.clientId || !c.secret || !c.refresh) return null;
    if (!drive) {
      tm = D.tokenManager({ fetch: f, base, clientId: c.clientId, secret: c.secret, refreshToken: () => load().refresh,
        onInvalid: () => { const k = load(); delete k.refresh; save(k); drive = null; } });
      drive = D.create({ fetch: f, base, getToken: force => tm.get(force), devId: dev().id });
    }
    return drive;
  }
  function info() {
    const c = load();
    return { mode: 'google', enabled: !!c.enabled && !!c.refresh, signedIn: !!c.refresh, email: c.email || '', name: c.name || '',
      clientId: c.clientId || '', hasSecret: !!c.secret, device: dev(), loginError };
  }
  // Googleのページから戻ってきたら、コードを鍵に交換する
  async function finishLogin(code, state, err) {
    if (err) { loginError = err === 'access_denied' ? 'ログインが取り消されました。' : 'ログインできませんでした（' + err + '）。'; return; }
    let p = null; try { p = JSON.parse(localStorage.getItem(PK)); localStorage.removeItem(PK); } catch (e) {}
    if (!p || p.state !== state) { loginError = 'ログインの途中で情報が失われました。もう一度ログインしてください。'; return; }
    const c = load();
    try {
      const t = await D.exchange({ fetch: f, base, clientId: c.clientId, secret: c.secret, code, verifier: p.verifier, redirectUri });
      if (!t.refresh_token) { loginError = 'Googleから長期の鍵を受け取れませんでした。もう一度ログインしてください。'; return; }
      const k = load(); k.refresh = t.refresh_token; k.enabled = true; save(k); drive = null;
      try { const a = await client().about(); const k2 = load(); k2.email = a.email; k2.name = a.name; save(k2); } catch (e) {}
    } catch (e) { loginError = e.message; }
  }
  const ready = (async () => {
    if (AN) return;
    const q = new URLSearchParams(location.search);
    const code = q.get('code'), state = q.get('state'), err = q.get('error');
    if (!code && !err) return;
    history.replaceState(null, '', redirectUri);
    await finishLogin(code, state, err);
  })();

  const need = () => { const d = client(); if (!d) throw new D.AuthError('Googleにログインしていません。'); if (!load().enabled) throw new Error('同期がオフです。'); return d; };
  const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { return { error: e.message || String(e), auth: !!e.auth }; } };
  function toB64(data) {
    const u = data instanceof Uint8Array ? data : new Uint8Array(data instanceof ArrayBuffer ? data : new TextEncoder().encode(String(data)));
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function share(name, data, type) {
    if (AN) return call('saveFile', name, typeof data === 'string' ? toB64(new TextEncoder().encode(data)) : toB64(data), type).then(ok => ({ ok: !!ok }));
    const file = new File([data], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).then(() => ({ ok: true }), () => ({ ok: false }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    return Promise.resolve({ ok: true });
  }

  window.yohakuNative = {
    platform: 'web',
    // 日本語PDF用の文字データは、初回だけ公開CDNから読み込み、以後は端末にキャッシュ
    cmapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    fontsUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
    saveNeedsTap: true,
    // その場で翻訳: 「翻訳」を押したときだけ、選んだ文を翻訳サービスに送る(PDF本体は送らない)
    // 窓口を複数持ち、混雑・拒否されたら自動で次へ切り替える(translate-core.js)
    translate: (() => {
      const tr = window.YohakuTranslate.create({ fetch: (u, o) => fetch(u, Object.assign({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }, o)), isOffline: () => navigator.onLine === false });
      return async (text, tl) => { try { return await tr.translate(text, tl); } catch (e) { return { error: e.message || '翻訳できませんでした。', code: e.code || 'down' }; } };
    })(),
    savePdf: (name, data) => share(name, data, 'application/pdf'),
    saveText: (name, text) => share(name, text, 'text/markdown'),
    appInfo: async () => ({ version: '2.6.0（' + (AN ? 'Android版' : 'iPad版') + '）', dataPath: '' }),
    syncConfig: async () => { await ready; return info(); },
    syncSetClient: async o => {
      o = o || {};
      if (o.clear) { save({}); drive = null; return info(); }
      let { clientId, secret, code } = o;
      if (code) { const u = D.unpackCode(code); if (!u) return { error: '接続コードを読み取れませんでした。' }; clientId = u.clientId; secret = u.secret; }
      clientId = String(clientId || '').trim(); secret = String(secret || '').trim();
      if (!/\.apps\.googleusercontent\.com$/.test(clientId)) return { error: 'クライアントIDは「…apps.googleusercontent.com」で終わる文字列です。' };
      if (!secret) return { error: 'クライアント シークレットを入力してください。' };
      save({ clientId, secret }); drive = null; loginError = '';
      return info();
    },
    syncLogin: async () => {
      const c = load();
      if (!c.clientId || !c.secret) return { error: '先に接続コードを入力してください。' };
      const p = await D.pkce();
      try { localStorage.setItem(PK, JSON.stringify({ verifier: p.verifier, state: p.state })); } catch (e) { return { error: 'この画面では情報を保存できません。' }; }
      loginError = '';
      const url = D.authUrl({ base, clientId: c.clientId, redirectUri, challenge: p.challenge, state: p.state });
      if (AN) { // アプリ版: ブラウザでログイン → 端末の中の受付(localhost)で受け取る
        const r = await call('startLogin', url);
        if (!r || r.error) { try { localStorage.removeItem(PK); } catch (e) {} return { error: (r && r.error) || 'ログインできませんでした。' }; }
        await finishLogin(r.code, r.state, r.err);
        if (loginError) return { error: loginError };
        return info();
      }
      location.href = url;
      return null; // Googleのページへ移動する
    },
    syncLogout: async () => { const c = load(); delete c.refresh; delete c.email; delete c.name; c.enabled = false; save(c); drive = null; return info(); },
    syncEnable: async on => { const c = load(); c.enabled = !!on && !!c.refresh; save(c); return info(); },
    syncList: wrap(() => need().list()),
    syncReadJson: async (key, n) => { try { return await need().readJson(key, n); } catch (e) { return null; } },
    syncWriteJson: wrap((key, kind, obj) => need().writeJson(key, kind, obj)),
    syncReadPdf: wrap(key => need().readPdf(key)),
    syncWritePdf: wrap((key, data) => need().writePdf(key, data)),
    syncDeletePdf: wrap(key => need().deletePdf(key)),
    onClosing: fn => {
      let t = 0;
      const go = () => { clearTimeout(t); t = setTimeout(fn, 50); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') go(); });
      window.addEventListener('pagehide', go);
    },
    closingDone: () => {},
    android: !!AN,
    copyText: AN ? (s => call('copyText', String(s)).then(ok => { if (!ok) throw new Error('copy'); })) : undefined,
    // ほかのアプリから「余白で開く」「共有」で渡されたPDF
    onOpenFiles: AN ? (fn => {
      window.__yohakuOpenFiles = () => {
        let list = []; try { list = JSON.parse(AN.openList()); } catch (e) {}
        const out = [];
        for (const f of list) {
          const u = new Uint8Array(f.size); let off = 0;
          while (off < f.size) { // 1MBずつ受け取る
            const s = atob(AN.openChunk(f.i, off, 1 << 20)); if (!s.length) break;
            for (let k = 0; k < s.length; k++) u[off + k] = s.charCodeAt(k);
            off += s.length;
          }
          if (off === f.size) out.push({ name: f.name, data: u });
        }
        try { AN.openDone(); } catch (e) {}
        if (out.length) fn(out);
      };
      try { AN.ready(); } catch (e) {}
    }) : undefined,
  };
})();
