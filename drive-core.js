/* 余白 — Googleドライブとのやり取り(Windows版のメイン処理とiPad版の画面の両方で使う)
   ・権限は drive.file(余白が作ったファイルにだけ触れる。Googleの審査が不要な種類)
   ・マイドライブに「余白 同期データ」フォルダを作り、その中に平らに置く
       <指紋>.pdf                 PDF本体
       <指紋>.meta.<端末ID>.json   その端末から見た書類情報
       <指紋>.notes.<端末ID>.json  その端末から見た注釈
   ・各端末は自分の名前のファイルにだけ書くので、上書きの取り合いが起きない */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YohakuDrive = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FOLDER = '余白 同期データ';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const NAME = /^([a-f0-9]{32})\.(pdf|(meta|notes)\.([a-f0-9]{12})\.json)$/;

  function hosts(base) {
    if (base) return { api: base, upload: base, auth: base + '/o/oauth2/v2/auth', token: base + '/token' };
    return { api: 'https://www.googleapis.com', upload: 'https://www.googleapis.com', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token' };
  }
  const enc = s => new TextEncoder().encode(s);
  function concat(parts) {
    let n = 0; for (const p of parts) n += p.byteLength;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p instanceof Uint8Array ? p : new Uint8Array(p), o); o += p.byteLength; }
    return out;
  }
  function b64url(bytes) {
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function sha256hex(data) {
    const h = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function pkce() {
    const v = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const c = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(v))));
    return { verifier: v, challenge: c, state: b64url(crypto.getRandomValues(new Uint8Array(16))) };
  }
  function authUrl({ base, clientId, redirectUri, challenge, state }) {
    const q = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      code_challenge: challenge, code_challenge_method: 'S256', state,
    });
    return hosts(base).auth + '?' + q;
  }
  class AuthError extends Error { constructor(m) { super(m); this.auth = true; } }
  async function tokenCall(fetchFn, base, params) {
    let res;
    try {
      res = await fetchFn(hosts(base).token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    } catch (e) { throw new Error('インターネットに接続できません。'); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (d.error === 'invalid_grant') throw new AuthError('Googleのログインが切れました。もう一度ログインしてください。');
      if (d.error === 'invalid_client' || d.error === 'unauthorized_client') throw new AuthError('クライアントIDかシークレットが正しくありません。');
      throw new Error('Googleにログインできませんでした（' + (d.error || res.status) + '）');
    }
    return d;
  }
  // ログインで受け取ったコードを、長く使える鍵(リフレッシュトークン)に交換
  function exchange({ fetch: f, base, clientId, secret, code, verifier, redirectUri }) {
    return tokenCall(f, base, { code, client_id: clientId, client_secret: secret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier });
  }

  /* 一時的な鍵(アクセストークン)を必要なときに更新する */
  function tokenManager({ fetch: f, base, clientId, secret, refreshToken, onInvalid }) {
    let tok = null, exp = 0, inflight = null;
    async function get(force) {
      if (!force && tok && Date.now() < exp - 60000) return tok;
      if (!inflight) inflight = (async () => {
        try {
          const d = await tokenCall(f, base, { client_id: clientId, client_secret: secret, refresh_token: refreshToken(), grant_type: 'refresh_token' });
          tok = d.access_token; exp = Date.now() + (d.expires_in || 3600) * 1000; return tok;
        } catch (e) { if (e.auth && onInvalid) onInvalid(e); throw e; }
        finally { inflight = null; }
      })();
      return inflight;
    }
    return { get, reset() { tok = null; exp = 0; } };
  }

  /* ドライブの読み書き(同期の画面側が使う形にそろえる) */
  function create({ fetch: f, base, getToken, devId }) {
    const H = hosts(base);
    let folderId = null;
    let index = new Map();   // ファイル名 → [{id,size,t}](新しい順)
    async function call(url, opt = {}, raw) {
      for (let attempt = 0; ; attempt++) {
        const token = await getToken(attempt > 0);
        let res;
        try { res = await f(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + token }, opt.headers || {}) })); }
        catch (e) { if (attempt < 2) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; } throw new Error('インターネットに接続できません。'); }
        if (res.status === 401 && attempt === 0) continue;                     // 鍵の期限切れ → 更新してやり直す
        if ((res.status === 429 || res.status >= 500 || (res.status === 403 && /rate|quota/i.test(await res.clone().text()))) && attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))); continue;  // 混雑 → 少し待って再試行
        }
        if (res.status === 404 && raw === 'allow404') return null;
        if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('Googleドライブのエラー（' + res.status + '）' + (t ? ': ' + t.slice(0, 120) : '')); }
        if (raw === 'response') return res;
        if (raw === 'buffer') return new Uint8Array(await res.arrayBuffer());
        if (res.status === 204) return null;
        const ct = res.headers.get('content-type') || '';
        return ct.includes('json') ? res.json() : res.text();
      }
    }
    async function listAll() {
      const files = []; let page = '';
      do {
        const q = new URLSearchParams({ q: 'trashed = false', spaces: 'drive', pageSize: '1000',
          fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents)' });
        if (page) q.set('pageToken', page);
        const d = await call(H.api + '/drive/v3/files?' + q);
        files.push(...(d.files || [])); page = d.nextPageToken || '';
      } while (page);
      return files;
    }
    async function ensureFolder(files) {
      const folders = files.filter(x => x.mimeType === FOLDER_MIME && x.name === FOLDER).sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)));
      if (folders.length) { folderId = folders[0].id; return; }
      const d = await call(H.api + '/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: FOLDER_MIME }) });
      folderId = d.id;
    }
    // 画面側には「書類ごとのファイル一覧」を返す(名前は doc.pdf / meta.<端末>.json / notes.<端末>.json)
    async function list() {
      const files = await listAll();
      await ensureFolder(files);
      const idx = new Map(), groups = new Map();
      for (const x of files) {
        const m = NAME.exec(x.name); if (!m) continue;
        const t = Date.parse(x.modifiedTime) || 0, s = +x.size || 0;
        if (!idx.has(x.name)) idx.set(x.name, []);
        idx.get(x.name).push({ id: x.id, size: s, t });
      }
      for (const [name, arr] of idx) {
        arr.sort((a, b) => b.t - a.t);
        const m = NAME.exec(name), key = m[1], n = m[2] === 'pdf' ? 'doc.pdf' : m[2];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ n, s: arr[0].size, t: arr[0].t });
      }
      index = idx;
      return [...groups].map(([key, files]) => ({ key, files }));
    }
    const fileName = (key, n) => n === 'doc.pdf' ? key + '.pdf' : key + '.' + n;
    async function readJson(key, n) {
      const arr = index.get(fileName(key, n)); if (!arr || !arr.length) return null;
      try { const b = await call(H.api + '/drive/v3/files/' + arr[0].id + '?alt=media', {}, 'buffer'); return JSON.parse(new TextDecoder().decode(b)); }
      catch (e) { if (/JSON/.test(e.message) || e instanceof SyntaxError) return null; throw e; }
    }
    async function upload(name, bytes, mime, existingId) {
      if (existingId) {
        const d = await call(H.upload + '/upload/drive/v3/files/' + existingId + '?uploadType=media&fields=id,size,modifiedTime', { method: 'PATCH', headers: { 'Content-Type': mime }, body: bytes });
        return d;
      }
      const meta = JSON.stringify({ name, parents: [folderId], mimeType: mime });
      if (bytes.byteLength < 4 * 1024 * 1024) {
        const bd = 'yohaku' + Math.random().toString(36).slice(2);
        const body = concat([enc('--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + bd + '\r\nContent-Type: ' + mime + '\r\n\r\n'), bytes, enc('\r\n--' + bd + '--')]);
        return call(H.upload + '/upload/drive/v3/files?uploadType=multipart&fields=id,size,modifiedTime', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body });
      }
      // 大きいPDFは分割アップロード(途中で切れても最初からやり直せる)
      const res = await call(H.upload + '/upload/drive/v3/files?uploadType=resumable&fields=id,size,modifiedTime', { method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(bytes.byteLength) }, body: meta }, 'response');
      const loc = res.headers.get('location'); if (!loc) throw new Error('アップロードを始められませんでした');
      const r2 = await f(loc, { method: 'PUT', headers: { 'Content-Type': mime }, body: bytes });
      if (!r2.ok) throw new Error('アップロードできませんでした（' + r2.status + '）');
      return r2.json();
    }
    async function writeJson(key, kind, obj) {
      const name = key + '.' + kind + '.' + devId + '.json';
      const arr = index.get(name) || [];
      const d = await upload(name, enc(JSON.stringify(obj)), 'application/json', arr[0] && arr[0].id);
      // 同じ名前のファイルが重複していたら、新しい1つだけ残す
      for (const old of arr.slice(1)) { try { await call(H.api + '/drive/v3/files/' + old.id, { method: 'DELETE' }, 'allow404'); } catch (e) {} }
      index.set(name, [{ id: d.id, size: +d.size || 0, t: Date.parse(d.modifiedTime) || Date.now() }]);
      return true;
    }
    async function readPdf(key) {
      const arr = index.get(key + '.pdf'); if (!arr || !arr.length) return { missing: true };
      for (const c of arr) {
        const b = await call(H.api + '/drive/v3/files/' + c.id + '?alt=media', {}, 'buffer');
        if ((await sha256hex(b)).slice(0, 32) === key) return { data: b };
      }
      return { incomplete: true };
    }
    async function writePdf(key, data) {
      const name = key + '.pdf', arr = index.get(name) || [];
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (arr.some(x => x.size === bytes.byteLength)) return true;
      const d = await upload(name, bytes, 'application/pdf');
      index.set(name, [{ id: d.id, size: bytes.byteLength, t: Date.now() }, ...arr]);
      return true;
    }
    async function deletePdf(key) {
      for (const x of index.get(key + '.pdf') || []) { try { await call(H.api + '/drive/v3/files/' + x.id, { method: 'DELETE' }, 'allow404'); } catch (e) {} }
      index.delete(key + '.pdf');
      return true;
    }
    async function about() {
      const d = await call(H.api + '/drive/v3/about?fields=user(displayName,emailAddress)');
      return d && d.user ? { email: d.user.emailAddress || '', name: d.user.displayName || '' } : {};
    }
    return { list, readJson, writeJson, readPdf, writePdf, deletePdf, about };
  }

  // iPad版に設定を渡すための「接続コード」(クライアントIDとシークレットをまとめた文字列)
  function packCode(clientId, secret) { return 'YHK1.' + btoa(unescape(encodeURIComponent(JSON.stringify({ i: clientId, s: secret })))); }
  function unpackCode(code) {
    const m = /YHK1\.([A-Za-z0-9+/=]+)/.exec(String(code || '').replace(/\s+/g, ''));
    if (!m) return null;
    try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); return o.i && o.s ? { clientId: o.i, secret: o.s } : null; } catch (e) { return null; }
  }

  return { FOLDER, SCOPE, hosts, pkce, authUrl, exchange, tokenManager, create, packCode, unpackCode, AuthError, sha256hex };
});
