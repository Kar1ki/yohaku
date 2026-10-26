/* 余白 2 — 画面の動き
   構成: 設定とテーマ / 本棚 / リーダー(描画・入力) / 注釈とメモ / 左右パネル / 翻訳 / 書き出し / 設定画面 / キーボード */
(function(){
'use strict';
const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
const $=id=>document.getElementById(id);
const N=window.yohakuNative;               // Windows版はメイン処理、iPad版はブラウザ内の部品
const CMAP=N.cmapUrl||'cmaps/', FONTS=N.fontsUrl||'standard_fonts/';   // 日本語PDF用の文字データ
const TOUCH=matchMedia('(hover: none) and (pointer: coarse)').matches;
const narrow=()=>innerWidth<900;
const app=$('app'), stage=$('stage'), wrap=$('wrap'), pageEl=$('page'), pdfCanvas=$('pdfCanvas'), markCanvas=$('markCanvas'),
      ink=$('inkCanvas'), live=$('liveCanvas'), textLayer=$('textLayer'), memoLayer=$('memoLayer'), reader=$('reader'), home=$('home');
try{live.getContext('2d',{desynchronized:true})}catch(e){}

const PEN_COLORS=['#1b2230','#c0392b','#1f5fbf','#1e7a4a'];
const HL_COLORS=['#f5d547','#86dc96','#8cc8f5','#f6a3c6'];
const MARKS=[{hl:'#f5d547',ul:'#d39e00',name:'黄'},{hl:'#86dc96',ul:'#2b9348',name:'緑'},{hl:'#8cc8f5',ul:'#2b6fd6',name:'青'},{hl:'#f6a3c6',ul:'#c2185b',name:'桃'}];
const WIDTHS={pen:[1.2,2.2,3.6],hl:[8,13,20]};

/* ===================== 設定(このPC内) ===================== */
function lsGet(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
const prefs=Object.assign({fit:'page',penColor:0,hlColor:0,penW:1,hlW:1,markCi:0,finger:false,
  left:true,right:true,leftW:260,rightW:320,ltab:'files',rtab:'memos',askMemo:true,wheelTurn:true},lsGet('yohaku:prefs',{}));
prefs.look=Object.assign({mode:'dark',dark:'graphite',light:'paper',accent:'violet',page:'normal',size:'m',motion:true},prefs.look||{});
const savePrefs=()=>lsSet('yohaku:prefs',prefs);

/* ===================== テーマ ===================== */
const PRESETS={
  dark:{
    graphite:{name:'グラファイト',bg:'#1e1e1e',side:'#252525',ribbon:'#1b1b1b',raise:'#2c2c2c',hover:'#333333',border:'#383838',text:'#dadada',muted:'#a3a3a3',faint:'#707070',desk:'#161616'},
    midnight:{name:'ミッドナイト',bg:'#1a1d24',side:'#20242c',ribbon:'#171a20',raise:'#272b34',hover:'#2e333d',border:'#343a46',text:'#d9dde6',muted:'#9aa3b2',faint:'#687083',desk:'#13151a'},
    black:{name:'漆黒',bg:'#0f0f11',side:'#151517',ribbon:'#0b0b0c',raise:'#1c1c1f',hover:'#232327',border:'#29292e',text:'#d6d6d9',muted:'#97979e',faint:'#62626a',desk:'#080809'},
    forest:{name:'深緑',bg:'#1b201d',side:'#212723',ribbon:'#181c1a',raise:'#28302b',hover:'#2f3832',border:'#343e37',text:'#d8ded9',muted:'#9ba79f',faint:'#6a756d',desk:'#141815'},
    plum:{name:'葡萄',bg:'#1f1b22',side:'#262129',ribbon:'#1b181e',raise:'#2d2731',hover:'#352e39',border:'#3b333f',text:'#dfd9e2',muted:'#a79eac',faint:'#73697a',desk:'#171419'},
  },
  light:{
    paper:{name:'和紙',bg:'#faf8f4',side:'#f2efe9',ribbon:'#ebe7e0',raise:'#ffffff',hover:'#e8e4dc',border:'#ddd8ce',text:'#2b2a28',muted:'#6d6a63',faint:'#a19d95',desk:'#e7e2d9'},
    white:{name:'ホワイト',bg:'#ffffff',side:'#f6f6f7',ribbon:'#efeff1',raise:'#ffffff',hover:'#ececef',border:'#e1e1e5',text:'#222225',muted:'#6b6b73',faint:'#a2a2aa',desk:'#ebebee'},
    cool:{name:'ミスト',bg:'#f7f9fb',side:'#eef1f5',ribbon:'#e6eaf0',raise:'#ffffff',hover:'#e2e7ee',border:'#d7dde6',text:'#1f2530',muted:'#5f6878',faint:'#9aa2b0',desk:'#e1e6ed'},
    sepia:{name:'セピア',bg:'#f4ecdd',side:'#ece2d0',ribbon:'#e4d9c4',raise:'#fbf5ea',hover:'#e3d7c1',border:'#d6c8ae',text:'#3a3024',muted:'#76664f',faint:'#a8977c',desk:'#dfd2ba'},
  }
};
const ACCENTS={
  violet:{name:'バイオレット',d:'#9d8cff',l:'#6c5ce7'},
  blue:{name:'ブルー',d:'#6ea8fe',l:'#2f6fdb'},
  teal:{name:'ティール',d:'#4fd1c1',l:'#13897c'},
  amber:{name:'アンバー',d:'#f0b45b',l:'#b7791f'},
  rose:{name:'ローズ',d:'#f07a95',l:'#c8436a'},
  slate:{name:'スレート',d:'#b4b4bd',l:'#55555f'},
};
const PAGEFX={normal:'none',sepia:'sepia(.32) brightness(.97)',dim:'brightness(.82) contrast(.96)',night:'invert(.9) hue-rotate(180deg) brightness(1.05)'};
const SIZES={s:'12.5px',m:'13.5px',l:'15px'};
const darkMQ=matchMedia('(prefers-color-scheme: dark)');
function effMode(){const m=prefs.look.mode;return m==='system'?(darkMQ.matches?'dark':'light'):m}
function applyTheme(){
  const L=prefs.look,mode=effMode();
  const p=PRESETS[mode][L[mode]]||Object.values(PRESETS[mode])[0];
  const a=ACCENTS[L.accent]||ACCENTS.violet;
  const r=document.documentElement.style;
  for(const k of ['bg','side','ribbon','raise','hover','border','text','muted','faint','desk'])r.setProperty('--'+k,p[k]);
  r.setProperty('--accent',mode==='dark'?a.d:a.l);
  r.setProperty('--accent-fg',mode==='dark'?'#141414':'#ffffff');
  r.setProperty('--danger',mode==='dark'?'#e5737a':'#c0392b');
  r.setProperty('--shadow',mode==='dark'?'0 2px 6px rgba(0,0,0,.28),0 12px 32px rgba(0,0,0,.34)':'0 1px 3px rgba(30,30,40,.10),0 10px 28px rgba(30,30,40,.12)');
  r.setProperty('--pagefilter',PAGEFX[L.page]||'none');
  r.setProperty('--fs',SIZES[L.size]||SIZES.m);
  r.setProperty('color-scheme',mode);
  document.body.classList.toggle('nomotion',!L.motion);
}
darkMQ.addEventListener('change',()=>{if(prefs.look.mode==='system')applyTheme()});
applyTheme();

/* ===================== 保存領域(IndexedDB) ===================== */
const DB={db:null,
  open(){return new Promise((res,rej)=>{const r=indexedDB.open('yohaku',1);
    r.onupgradeneeded=()=>{const d=r.result;for(const s of ['meta','blobs','notes'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})};
    r.onsuccess=()=>{DB.db=r.result;res()};r.onerror=()=>rej(r.error)})},
  tx(s,m,fn){return new Promise((res,rej)=>{const t=DB.db.transaction(s,m),st=t.objectStore(s),r=fn(st);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})},
  get(s,id){return DB.tx(s,'readonly',st=>st.get(id))},
  put(s,o){return DB.tx(s,'readwrite',st=>st.put(o))},
  del(s,id){return DB.tx(s,'readwrite',st=>st.delete(id))},
  all(s){return DB.tx(s,'readonly',st=>st.getAll())}
};

/* ===================== 状態 ===================== */
const S={id:null,meta:null,pdf:null,page:1,fit:prefs.fit,zoom:1,scale:1,tool:'select',finger:prefs.finger,
  notes:null,undo:[],cssW:0,cssH:0,renderId:0,textTask:null,outline:null,metas:[],activeMark:null};
const isDoc=()=>!!S.pdf&&app.classList.contains('doc');
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
// 同期のため、変更した物には時刻を、消した物には「消した時刻」を残す
function touch(it){if(it)it.u=Math.max(Date.now(),(it.u||0)+1)}
function kill(it,notes=S.notes){if(it&&it.id&&notes){notes.dead=notes.dead||{};notes.dead[it.id]=Math.max(Date.now(),(it.u||0)+1)}}

/* ===================== パネルの開閉と幅 ===================== */
function applyPanels(){
  app.classList.toggle('noleft',!prefs.left);app.classList.toggle('noright',!prefs.right);
  app.style.setProperty('--left-w',prefs.left?prefs.leftW+'px':'0px');
  app.style.setProperty('--right-w',prefs.right?prefs.rightW+'px':'0px');
  $('rbLeft').classList.toggle('on',prefs.left);$('rbRight').classList.toggle('on',prefs.right);
}
function toggleLeft(v){prefs.left=v??!prefs.left;if(narrow()&&prefs.left)prefs.right=false;savePrefs();applyPanels();if(prefs.left)renderLeft()}
function toggleRight(v){prefs.right=v??!prefs.right;if(narrow()&&prefs.right)prefs.left=false;savePrefs();applyPanels();if(prefs.right)renderRight()}
$('rbLeft').onclick=()=>toggleLeft();$('rbRight').onclick=()=>toggleRight();
document.querySelectorAll('.resizer').forEach(rz=>{
  rz.addEventListener('pointerdown',e=>{
    const side=rz.dataset.side;if(side==='left'&&!prefs.left||side==='right'&&!prefs.right)return;
    e.preventDefault();rz.setPointerCapture(e.pointerId);rz.classList.add('drag');app.classList.add('resizing');
    const x0=e.clientX,w0=side==='left'?prefs.leftW:prefs.rightW;
    const mv=ev=>{const d=ev.clientX-x0;const w=Math.round(Math.max(200,Math.min(560,side==='left'?w0+d:w0-d)));
      if(side==='left')prefs.leftW=w;else prefs.rightW=w;applyPanels()};
    const up=()=>{rz.removeEventListener('pointermove',mv);rz.classList.remove('drag');app.classList.remove('resizing');savePrefs()};
    rz.addEventListener('pointermove',mv);rz.addEventListener('pointerup',up,{once:true});rz.addEventListener('pointercancel',up,{once:true});
  });
  rz.addEventListener('dblclick',()=>{if(rz.dataset.side==='left')prefs.leftW=260;else prefs.rightW=320;savePrefs();applyPanels()});
});
applyPanels();

/* ===================== 本棚・ホーム ===================== */
async function loadMetas(){S.metas=(await DB.all('meta')).sort((a,b)=>(b.opened||0)-(a.opened||0));return S.metas}
function ago(t){if(!t)return'';const d=(Date.now()-t)/1000;if(d<3600)return'さっき';if(d<86400)return Math.floor(d/3600)+'時間前';if(d<86400*30)return Math.floor(d/86400)+'日前';const x=new Date(t);return (x.getMonth()+1)+'/'+x.getDate()}
const baseName=n=>n.replace(/\.pdf$/i,'');
async function showHome(){
  closeDoc();
  app.classList.remove('doc','hidebars');reader.hidden=true;home.hidden=false;
  $('crumb').innerHTML='<b>ホーム</b>';
  await loadMetas();renderHome();renderLeft();renderRight();
}
function renderHome(){
  const g=$('homeGrid');g.innerHTML='';
  const h=new Date().getHours();
  $('helloTitle').textContent=h<5?'こんばんは':h<11?'おはようございます':h<18?'こんにちは':'こんばんは';
  $('helloSub').textContent=S.metas.length?'読みかけのPDF':'PDFを開いて読み始めましょう';
  $('homeEmpty').hidden=S.metas.length>0;
  for(const m of S.metas.slice(0,12)){
    const c=document.createElement('button');c.className='card';c.title=m.name;
    const th=document.createElement('div');th.className='thumb';
    if(m.thumb){const im=new Image();im.src=m.thumb;im.alt='';th.appendChild(im)}else th.innerHTML='<svg width="28" height="28"><use href="#i-file"/></svg>';
    const nm=document.createElement('div');nm.className='nm';nm.textContent=baseName(m.name);
    const pr=document.createElement('div');pr.className='prog';pr.innerHTML='<i></i>';pr.firstChild.style.width=(m.pages?Math.round((m.page||1)/m.pages*100):0)+'%';
    const mt=document.createElement('div');mt.className='meta';mt.textContent=(m.pages?('p.'+(m.page||1)+'/'+m.pages):'未読')+' · '+ago(m.opened);
    c.append(th,nm,pr,mt);c.onclick=()=>openBook(m.id);
    c.oncontextmenu=e=>{e.preventDefault();openFileMenu(m,e.clientX,e.clientY)};
    g.appendChild(c);
  }
}
function openFileMenu(m,x,y){
  const menu=$('fileMenu');menu.innerHTML='';
  const b1=document.createElement('button');b1.textContent='開く';b1.onclick=()=>{hideFileMenu();openBook(m.id)};
  const b2=document.createElement('button');b2.className='danger';b2.textContent='本棚から削除…';
  b2.onclick=()=>{hideFileMenu();confirmSheet('本棚から削除','「'+m.name+'」と、その書き込み・メモ・しおりをこのPCから削除します。元のファイルは残ります。','削除',async()=>{
    if(S.id===m.id)await showHome();
    await removeLocal(m,true);await loadMetas();renderHome();renderLeft();toast(SYNC.on?'削除しました（同期している他のPCからも削除されます）':'削除しました')})};
  menu.append(b1,b2);menu.hidden=false;
  menu.style.left=Math.min(x,innerWidth-menu.offsetWidth-8)+'px';menu.style.top=Math.min(y,innerHeight-menu.offsetHeight-8)+'px';
}
function hideFileMenu(){$('fileMenu').hidden=true}

async function addFiles(files){
  let lastId=null;
  for(const f of files){
    if(!/pdf$/i.test(f.type)&&!/\.pdf$/i.test(f.name)){toast(f.name+' はPDFではありません');continue}
    const id=f.name+'|'+f.size;
    const buf=await f.arrayBuffer();
    const old=await DB.get('meta',id);
    await DB.put('blobs',{id,data:buf});
    const key=await hashKey(buf);const tomb=removedTomb();if(tomb[key]){delete tomb[key];setRemovedTomb(tomb)}
    const meta=Object.assign({id,name:f.name,size:f.size,page:1,pages:0,thumb:null,added:Date.now()},old||{},{opened:Date.now(),key});
    if(!old)meta.ru=Date.now();
    await DB.put('meta',meta);syncDirty(meta,500);
    lastId=id;
  }
  await loadMetas();
  if(lastId){if(files.length===1)openBook(lastId);else{renderHome();renderLeft()}}
}
$('fileInput').onchange=e=>{const fs=[...e.target.files];e.target.value='';addFiles(fs)};
const pickFile=()=>$('fileInput').click();
$('rbOpen').onclick=pickFile;$('homeOpen').onclick=pickFile;
$('rbHome').onclick=()=>showHome();
$('sampleBtn').onclick=async()=>{
  try{const r=await fetch('sample.pdf');const b=await r.blob();addFiles([new File([b],'使い方サンプル.pdf',{type:'application/pdf'})])}catch(e){toast('サンプルを読み込めませんでした')}
};
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>{e.preventDefault();const fs=[...(e.dataTransfer?.files||[])];if(fs.length)addFiles(fs)});

/* ===================== リーダー ===================== */
function closeDoc(){
  hideAllFloats();hideTr();clearBmp();
  if(S.pdf){try{S.pdf.destroy()}catch(e){}S.pdf=null}
  S.id=null;S.meta=null;S.notes=null;S.outline=null;
}
async function openBook(id){
  const meta=await DB.get('meta',id),blob=await DB.get('blobs',id);
  if(!meta||!blob){toast('ファイルが見つかりません');return showHome()}
  closeDoc();
  S.id=id;S.meta=meta;S.notes=Object.assign({id,strokes:{},marks:{},bookmarks:[]},await DB.get('notes',id)||{});
  if(normNotes(S.notes))DB.put('notes',S.notes).catch(()=>{});
  S.undo=[];S.outline=null;S.fit=prefs.fit;S.page=0;S.activeMark=null;
  home.hidden=true;reader.hidden=false;app.classList.add('doc');app.classList.remove('hidebars');
  if(isFull)app.classList.add('hidebars');
  reader.style.opacity='0';requestAnimationFrame(()=>requestAnimationFrame(()=>{reader.style.opacity=''}));
  $('crumb').innerHTML='';const b=document.createElement('b');b.textContent=baseName(meta.name);$('crumb').append('本棚 / ',b);
  $('pageCount').textContent='–';
  clearCanvases();showMsg('読み込み中…');
  try{
    S.pdf=await pdfjsLib.getDocument({data:new Uint8Array(blob.data),cMapUrl:CMAP,cMapPacked:true,standardFontDataUrl:FONTS,useSystemFonts:true}).promise;
  }catch(e){console.error(e);showMsg(e&&e.name==='PasswordException'?'パスワード付きのPDFは開けません。':'このPDFを開けませんでした。ファイルが壊れている可能性があります。');return}
  if(S.id!==id)return;
  hideMsg();
  const n=S.pdf.numPages;$('pageCount').textContent=n;
  meta.pages=n;meta.opened=Date.now();saveMeta();
  loadMetas().then(()=>{if(prefs.ltab==='files')renderLeft()});
  renderLeft();renderRight();
  await go(Math.min(meta.page||1,n));
  if(!meta.thumb)makeThumb();
}
function showMsg(t){$('msg').textContent=t;$('msg').hidden=false}
function hideMsg(){$('msg').hidden=true}
function clearCanvases(){for(const c of [pdfCanvas,markCanvas,ink,live]){c.width=0;c.height=0}textLayer.innerHTML='';memoLayer.innerHTML='';pageEl.style.width='0';pageEl.style.height='0'}
async function makeThumb(){
  try{const p=await S.pdf.getPage(1);const v0=p.getViewport({scale:1});const vp=p.getViewport({scale:300/v0.width});
    const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
    await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    S.meta.thumb=c.toDataURL('image/jpeg',.72);saveMeta()}catch(e){}
}
let metaT=0;function saveMeta(){clearTimeout(metaT);const m=S.meta;if(!m)return;metaT=setTimeout(()=>DB.put('meta',m).catch(()=>{}),300)}
let notesT=0;function saveNotes(){clearTimeout(notesT);const n=S.notes;if(!n)return;syncDirty(S.meta,1500);notesT=setTimeout(()=>DB.put('notes',n).catch(()=>toast('保存できませんでした（PCの空き容量を確認してください）')),250)}

async function go(n,opt){
  if(!S.pdf)return;
  n=Math.max(1,Math.min(S.pdf.numPages,(n|0)||1));
  const changed=n!==S.page;S.turnDir=changed&&S.page>0?Math.sign(n-S.page):0;S.page=n;
  if(changed){hideTr();hideAllFloats()}
  $('pageInput').value=n;
  $('prevBtn').disabled=n<=1;$('nextBtn').disabled=n>=S.pdf.numPages;
  if(S.meta.page!==n){S.meta.page=n;S.meta.pu=Date.now();syncDirty(S.meta,8000)}saveMeta();updateBmBtn();updateStatus();markTocCurrent();
  if(changed){stage.scrollTop=0;stage.scrollLeft=0}
  await render();
  if(opt&&opt.bottom)stage.scrollTop=stage.scrollHeight;
}
function fitIcon(){
  $('fitUse').setAttribute('href',S.fit==='width'?'#i-fitwidth':'#i-fitpage');
  $('fitBtn').title=S.fit==='width'?'幅に合わせて表示中（クリックでページ全体）':'ページ全体を表示中（クリックで幅に合わせる）';
}

/* ページ画像のキャッシュ(前後のページを先に描いておき、めくりを一瞬にする) */
const bmp=new Map();
function clearBmp(){for(const v of bmp.values())v.then(e=>{e.c.width=0;e.c.height=0}).catch(()=>{});bmp.clear()}
function scaleFor(page){
  const base=page.getViewport({scale:1});
  const pad=14,aw=stage.clientWidth-pad*2,ah=stage.clientHeight-pad*2;
  if(S.fit==='page')return Math.max(.1,Math.min(aw/base.width,ah/base.height));
  if(S.fit==='width')return Math.max(.1,Math.min(aw,1100)/base.width);
  return S.zoom;
}
function getBitmap(n,scale){
  const key=n+'|'+scale.toFixed(4);
  if(bmp.has(key)){const v=bmp.get(key);bmp.delete(key);bmp.set(key,v);return v}
  const doc=S.pdf;
  const pr=(async()=>{
    const page=await doc.getPage(n);
    const vp=page.getViewport({scale});
    const W=Math.floor(vp.width),H=Math.floor(vp.height);
    const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,Math.sqrt(16e6/(W*H))));
    const c=document.createElement('canvas');c.width=Math.floor(W*dpr);c.height=Math.floor(H*dpr);
    await page.render({canvasContext:c.getContext('2d',{alpha:false}),viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
    return {c,W,H};
  })();
  bmp.set(key,pr);pr.catch(()=>bmp.delete(key));
  while(bmp.size>6){const k=bmp.keys().next().value;const v=bmp.get(k);bmp.delete(k);v.then(e=>{e.c.width=0;e.c.height=0}).catch(()=>{})}
  return pr;
}
let prefT=0;
function prefetch(id){
  clearTimeout(prefT);
  prefT=setTimeout(async()=>{
    for(const d of [1,-1,2]){
      if(id!==S.renderId||!S.pdf)return;
      const m=S.page+d;if(m<1||m>S.pdf.numPages)continue;
      try{const pg=await S.pdf.getPage(m);if(id!==S.renderId)return;await getBitmap(m,scaleFor(pg))}catch(e){}
    }
  },120);
}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const motionOK=()=>prefs.look.motion&&!reduceMotion.matches;
function animateTurn(d){
  if(!motionOK()||!d)return;
  pageEl.animate([{transform:'translateX('+(d*28)+'px)',opacity:.3},{transform:'none',opacity:1}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
}
async function render(focal){
  if(!S.pdf)return;
  const id=++S.renderId,n=S.page;
  const page=await S.pdf.getPage(n);if(id!==S.renderId)return;
  S.scale=scaleFor(page);
  if(S.fit!=='custom')S.zoom=S.scale;
  fitIcon();
  const vp=page.getViewport({scale:S.scale});
  let bm;
  try{bm=await getBitmap(n,S.scale)}catch(e){if(id===S.renderId)console.error(e);return}
  if(id!==S.renderId)return;
  const {W,H}=bm;
  const dpr2=Math.max(1,Math.min(window.devicePixelRatio||1,2,Math.sqrt(8e6/(W*H))));
  S.cssW=W;S.cssH=H;
  pageEl.style.width=W+'px';pageEl.style.height=H+'px';
  pdfCanvas.width=bm.c.width;pdfCanvas.height=bm.c.height;pdfCanvas.style.width=W+'px';pdfCanvas.style.height=H+'px';
  pdfCanvas.getContext('2d',{alpha:false}).drawImage(bm.c,0,0);
  for(const c of [markCanvas,ink,live]){c.width=Math.floor(W*dpr2);c.height=Math.floor(H*dpr2);c.style.width=W+'px';c.style.height=H+'px';c.getContext('2d').setTransform(dpr2,0,0,dpr2,0,0)}
  drawMarks();drawInk();
  if(focal){stage.scrollLeft=pageEl.offsetLeft+focal.nx*W-focal.cx;stage.scrollTop=pageEl.offsetTop+focal.ny*H-focal.cy}
  if(S.turnDir){animateTurn(S.turnDir);S.turnDir=0}
  updateStatus();
  prefetch(id);
  if(S.textTask){try{S.textTask.cancel()}catch(e){}}
  textLayer.innerHTML='';textLayer.style.setProperty('--scale-factor',S.scale);
  try{
    S.textTask=pdfjsLib.renderTextLayer({textContentSource:page.streamTextContent(),container:textLayer,viewport:vp});
    await S.textTask.promise;
    if(id!==S.renderId)return;
    const end=document.createElement('div');end.className='endOfContent';textLayer.appendChild(end);
  }catch(e){}
}
// 画面やパネルの大きさが変わったら描き直す
let roT=0,lastSize='';
new ResizeObserver(()=>{
  const sz=stage.clientWidth+'x'+stage.clientHeight;if(sz===lastSize)return;lastSize=sz;
  if(!isDoc())return;
  clearTimeout(roT);roT=setTimeout(()=>{if(S.fit==='custom')S.fit=prefs.fit;render();placeFloats()},140);
}).observe(stage);

/* ---------- 手書き ---------- */
const pageArr=(kind,p)=>S.notes[kind][p]||(S.notes[kind][p]=[]);
function strokePath(ctx,s,W,H){
  const p=s.p;if(!p.length)return;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=s.c;
  const X=i=>p[i][0]*W,Y=i=>p[i][1]*H;
  if(s.t==='hl'){
    ctx.globalAlpha=.38;ctx.globalCompositeOperation='multiply';ctx.lineWidth=s.w*W;
    ctx.beginPath();ctx.moveTo(X(0),Y(0));
    if(p.length===1)ctx.lineTo(X(0)+.01,Y(0));
    for(let i=1;i<p.length-1;i++)ctx.quadraticCurveTo(X(i),Y(i),(X(i)+X(i+1))/2,(Y(i)+Y(i+1))/2);
    if(p.length>1)ctx.lineTo(X(p.length-1),Y(p.length-1));
    ctx.stroke();
  }else{
    const pw=i=>s.w*W*(.55+.9*(p[i][2]??.5));
    if(p.length<3){ctx.lineWidth=pw(0);ctx.beginPath();ctx.moveTo(X(0),Y(0));ctx.lineTo(X(p.length-1)+.01,Y(p.length-1));ctx.stroke()}
    else{
      let sx=X(0),sy=Y(0);
      for(let i=1;i<p.length-1;i++){
        const mx=(X(i)+X(i+1))/2,my=(Y(i)+Y(i+1))/2;
        ctx.lineWidth=pw(i);ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(X(i),Y(i),mx,my);ctx.stroke();sx=mx;sy=my;
      }
      ctx.lineWidth=pw(p.length-1);ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(X(p.length-1),Y(p.length-1));ctx.stroke();
    }
  }
  ctx.restore();
}
function drawInk(){const c=ink.getContext('2d');c.clearRect(0,0,S.cssW,S.cssH);for(const s of S.notes.strokes[S.page]||[])strokePath(c,s,S.cssW,S.cssH)}

/* ---------- ハイライト・下線とメモの印 ---------- */
function drawMarks(){
  const c=markCanvas.getContext('2d'),W=S.cssW,H=S.cssH;c.clearRect(0,0,W,H);
  memoLayer.querySelectorAll('.badge').forEach(b=>b.remove());
  for(const m of S.notes.marks[S.page]||[]){
    const col=MARKS[m.ci]||MARKS[0];
    for(const [x,y,w,h] of m.r){
      if(m.t==='hl'){c.save();c.globalAlpha=.4;c.globalCompositeOperation='multiply';c.fillStyle=col.hl;c.fillRect(x*W,y*H,w*W,h*H);c.restore()}
      else{const t=Math.max(1.5,h*H*.09);c.fillStyle=col.ul;c.fillRect(x*W,(y+h)*H-t*.6,w*W,t)}
    }
    if(m.memo){
      const [x,y,w]=m.r[m.r.length-1];
      const b=document.createElement('button');b.className='badge';b.title='メモを見る';
      b.innerHTML='<svg><use href="#i-note"/></svg>';
      b.style.left=Math.min(W-16,(x+w)*W+2)+'px';b.style.top=(y*H)+'px';
      b.onclick=e=>{e.stopPropagation();openAnno(m)};
      b.onmouseenter=()=>showTip(m,b.getBoundingClientRect().right+6,b.getBoundingClientRect().top);
      b.onmouseleave=hideTip;
      memoLayer.appendChild(b);
    }
  }
}
function markClientRects(m){
  const pr=pageEl.getBoundingClientRect();
  return m.r.map(([x,y,w,h])=>({left:pr.left+x*pr.width,top:pr.top+y*pr.height,right:pr.left+(x+w)*pr.width,bottom:pr.top+(y+h)*pr.height}));
}
function unionRect(rs){return{left:Math.min(...rs.map(r=>r.left)),right:Math.max(...rs.map(r=>r.right)),top:Math.min(...rs.map(r=>r.top)),bottom:Math.max(...rs.map(r=>r.bottom))}}
function flashMark(m){
  const W=S.cssW,H=S.cssH;
  for(const [x,y,w,h] of m.r){
    const d=document.createElement('div');d.className='flash';
    d.style.left=(x*W-3)+'px';d.style.top=(y*H-2)+'px';d.style.width=(w*W+6)+'px';d.style.height=(h*H+4)+'px';
    memoLayer.appendChild(d);setTimeout(()=>d.remove(),1500);
  }
}

/* ===================== 入力: ペン・マウス・タッチの判別 ===================== */
const isDrawTool=()=>S.tool!=='select';
const canDrawWith=type=>type==='pen'||type==='mouse'||(type==='touch'&&S.finger);
let penHover=false,penErase=false;
function updateTouchAction(){pageEl.style.touchAction=(isDrawTool()&&(penHover||S.finger))||penErase?'none':''}
pageEl.addEventListener('touchstart',e=>{
  if(!isDrawTool()||e.touches.length>1)return;
  const t=e.changedTouches[0];if(t.touchType==='stylus'||S.finger)e.preventDefault();
},{passive:false});
pageEl.addEventListener('touchmove',e=>{
  if(!isDrawTool()||e.touches.length>1)return;
  const t=e.changedTouches[0];if(t.touchType==='stylus'||(S.finger&&activeId!==null))e.preventDefault();
},{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault());
pageEl.addEventListener('pointerover',e=>{if(e.pointerType==='pen'){penHover=true;penErase=!!(e.buttons&32);updateTouchAction()}});
pageEl.addEventListener('pointerout',e=>{if(e.pointerType==='pen'&&activeId===null){penHover=false;penErase=false;updateTouchAction()}});
let cur=null,activeId=null,rafId=0,pinch=null,suppressClickUntil=0;
function pt(e){const r=pageEl.getBoundingClientRect();return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]}
function drawLive(){rafId=0;const c=live.getContext('2d');c.clearRect(0,0,S.cssW,S.cssH);if(cur)strokePath(c,S.pred&&S.pred.length?{...cur,p:cur.p.concat(S.pred)}:cur,S.cssW,S.cssH)}
pageEl.addEventListener('pointerdown',e=>{
  const eraserEnd=e.pointerType==='pen'&&(e.buttons&32);
  if(!eraserEnd&&(!isDrawTool()||!canDrawWith(e.pointerType))||pinch)return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(activeId!==null)return;
  e.preventDefault();
  try{pageEl.setPointerCapture(e.pointerId)}catch(_){}
  activeId=e.pointerId;hideAllFloats();
  window.getSelection()?.removeAllRanges();
  S.erasing=eraserEnd||S.tool==='eraser';
  if(S.erasing){eraseAt(pt(e));return}
  const t=S.tool,w=(t==='hl'?WIDTHS.hl[prefs.hlW]:WIDTHS.pen[prefs.penW])/600;
  const q=pt(e);q.push(e.pointerType==='pen'?(e.pressure||.5):.5);
  cur={t,c:t==='hl'?HL_COLORS[prefs.hlColor]:PEN_COLORS[prefs.penColor],w,p:[q]};
  drawLive();
});
pageEl.addEventListener('pointermove',e=>{
  if(e.pointerId!==activeId)return;
  const evs=(e.getCoalescedEvents&&e.getCoalescedEvents())||[];
  const list=evs.length?evs:[e];
  if(S.erasing){for(const ev of list)eraseAt(pt(ev));return}
  if(!cur)return;
  for(const ev of list){
    const q=pt(ev),l=cur.p[cur.p.length-1];
    const dx=(q[0]-l[0])*S.cssW,dy=(q[1]-l[1])*S.cssH;
    if(dx*dx+dy*dy<1)continue;
    q.push(ev.pointerType==='pen'?(ev.pressure||.5):.5);cur.p.push(q);
  }
  S.pred=cur.t==='pen'&&e.getPredictedEvents?e.getPredictedEvents().slice(0,4).map(ev=>{const q=pt(ev);q.push(ev.pressure||.5);return q}):null;
  if(!rafId)rafId=requestAnimationFrame(drawLive);
});
function endStroke(e){
  if(e.pointerId!==activeId)return;
  activeId=null;suppressClickUntil=Date.now()+350;S.pred=null;
  if(S.erasing){S.erasing=false;return}
  if(!cur)return;
  cur.p=cur.p.map(a=>[+a[0].toFixed(5),+a[1].toFixed(5),+(a[2]??.5).toFixed(2)]);
  cur.id=newId();touch(cur);pageArr('strokes',S.page).push(cur);S.undo.push({page:S.page,kind:'strokes',added:cur});
  cur=null;live.getContext('2d').clearRect(0,0,S.cssW,S.cssH);drawInk();saveNotes();renderRightSoon();
}
pageEl.addEventListener('pointerup',endStroke);
pageEl.addEventListener('pointercancel',e=>{if(e.pointerId===activeId){cur=null;activeId=null;S.erasing=false;drawLive()}});
function eraseAt(q){
  const W=S.cssW,H=S.cssH,R=10,px=q[0]*W,py=q[1]*H;
  const arr=pageArr('strokes',S.page),gone=[];
  for(let i=arr.length-1;i>=0;i--){
    const s=arr[i],tol=R+s.w*W/2;let hit=false;
    for(let j=0;j<s.p.length&&!hit;j++){
      const a=s.p[j],b=s.p[j+1]||a,ax=a[0]*W,ay=a[1]*H,bx=b[0]*W,by=b[1]*H,dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy;
      let t=L?((px-ax)*dx+(py-ay)*dy)/L:0;t=Math.max(0,Math.min(1,t));
      const ex=ax+t*dx-px,ey=ay+t*dy-py;if(ex*ex+ey*ey<=tol*tol)hit=true;
    }
    if(hit){gone.push({o:s,i});arr.splice(i,1);kill(s)}
  }
  if(gone.length){S.undo.push({page:S.page,kind:'strokes',removed:gone});drawInk();saveNotes();renderRightSoon()}
  // 消しゴムはメモ付きのハイライトは消さない(メモを守る)
  const mk=pageArr('marks',S.page),mg=[];
  for(let i=mk.length-1;i>=0;i--){if(!mk[i].memo&&hitMark(mk[i],px,py,R)){mg.push({o:mk[i],i});kill(mk[i]);mk.splice(i,1)}}
  if(mg.length){S.undo.push({page:S.page,kind:'marks',removed:mg});drawMarks();saveNotes();renderRightSoon()}
}
function hitMark(m,px,py,pad){
  const W=S.cssW,H=S.cssH;
  return m.r.some(([x,y,w,h])=>px>=x*W-pad&&px<=(x+w)*W+pad&&py>=y*H-pad&&py<=(y+h)*H+pad);
}
function markAt(clientX,clientY,pad){
  const r=pageEl.getBoundingClientRect();
  if(clientX<r.left||clientX>r.right||clientY<r.top||clientY>r.bottom)return null;
  const px=clientX-r.left,py=clientY-r.top;
  return (S.notes.marks[S.page]||[]).slice().reverse().find(m=>hitMark(m,px,py,pad))||null;
}
function undo(){
  const op=S.undo.pop();if(!op){toast('戻せる操作はありません');return}
  const arr=pageArr(op.kind,op.page);
  if(op.added){const i=arr.lastIndexOf(op.added);if(i>=0)arr.splice(i,1);kill(op.added)}
  if(op.removed)for(const r of op.removed.slice().reverse()){touch(r.o);arr.splice(Math.min(r.i,arr.length),0,r.o)}
  saveNotes();hideAllFloats();
  if(op.page!==S.page)go(op.page);else{drawInk();drawMarks()}
  renderRight();updateStatus();
}

/* ---------- タッチ: ピンチ拡大・スワイプ ---------- */
stage.addEventListener('touchstart',e=>{
  if(e.touches.length!==2||!isDoc())return;
  e.preventDefault();
  if(cur){cur=null;activeId=null;drawLive()}
  const [a,b]=e.touches,r=pageEl.getBoundingClientRect(),sr=stage.getBoundingClientRect();
  const cx=(a.clientX+b.clientX)/2,cy=(a.clientY+b.clientY)/2;
  pinch={d0:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),ratio:1,ox:cx-r.left,oy:cy-r.top,nx:(cx-r.left)/r.width,ny:(cy-r.top)/r.height,cx:cx-sr.left,cy:cy-sr.top};
  pageEl.style.transformOrigin=pinch.ox+'px '+pinch.oy+'px';
},{passive:false});
stage.addEventListener('touchmove',e=>{
  if(!pinch||e.touches.length!==2)return;e.preventDefault();
  const [a,b]=e.touches;pinch.ratio=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/pinch.d0;
  pinch.ratio=Math.max(.4/S.scale,Math.min(6/S.scale,pinch.ratio));
  pageEl.style.transform='scale('+pinch.ratio+')';
},{passive:false});
stage.addEventListener('touchend',e=>{
  if(!pinch||e.touches.length>=2)return;
  const p=pinch;pinch=null;suppressClickUntil=Date.now()+400;pageEl.style.transform='';
  if(Math.abs(p.ratio-1)<.03)return;
  S.zoom=S.scale*p.ratio;S.fit='custom';render(p);
});
let sw=null;
stage.addEventListener('touchstart',e=>{
  if(e.touches.length!==1){sw=null;return}
  if(S.finger&&isDrawTool()){sw=null;return}
  const t=e.touches[0];sw={x:t.clientX,y:t.clientY,t:Date.now(),sel:hasSel()};
},{passive:true});
stage.addEventListener('touchend',e=>{
  if(!sw)return;const t=e.changedTouches[0],dx=t.clientX-sw.x,dy=t.clientY-sw.y,dt=Date.now()-sw.t,s=sw;sw=null;
  if(s.sel||hasSel())return;
  if(dt<600&&Math.abs(dx)>60&&Math.abs(dy)<Math.abs(dx)*.6){
    const canX=stage.scrollWidth>stage.clientWidth+2,atL=stage.scrollLeft<=1,atR=stage.scrollLeft>=stage.scrollWidth-stage.clientWidth-1;
    if(!canX||(dx<0&&atR)||(dx>0&&atL)){suppressClickUntil=Date.now()+400;go(S.page+(dx<0?1:-1))}
  }
},{passive:true});
let downSel=false;
stage.addEventListener('pointerdown',()=>{downSel=hasSel()},true);
stage.addEventListener('click',e=>{
  if(Date.now()<suppressClickUntil||downSel||hasSel()||isDrawTool())return;
  const m=markAt(e.clientX,e.clientY,3);
  if(m){openAnno(m);return}
  if(anyFloatOpen()){hideAllFloats();return}
  if(e.pointerType==='mouse'||!e.pointerType)return;
  const r=stage.getBoundingClientRect(),x=e.clientX-r.left,w=r.width;
  if(x<w*.18)go(S.page-1);else if(x>w*.82)go(S.page+1);else app.classList.toggle('hidebars');
});
// メモ付きハイライトにマウスを乗せると中身を表示
let hoverRaf=0,hoverEv=null,tipTimer=0,tipMark=null;
stage.addEventListener('mousemove',e=>{hoverEv=e;if(!hoverRaf)hoverRaf=requestAnimationFrame(onHover)});
stage.addEventListener('mouseleave',()=>{hideTip();app.classList.remove('overmark')});
function onHover(){
  hoverRaf=0;const e=hoverEv;if(!e||!isDoc()||e.buttons||isDrawTool()){app.classList.remove('overmark');return}
  const m=markAt(e.clientX,e.clientY,2);
  app.classList.toggle('overmark',!!m);
  if(m&&m.memo&&$('annoCard').hidden){
    if(tipMark!==m){hideTip();tipMark=m;clearTimeout(tipTimer);tipTimer=setTimeout(()=>showTip(m,e.clientX+14,e.clientY+16),280)}
  }else if(tipMark&&!(m&&m===tipMark))hideTip();
}
function showTip(m,x,y){
  if(!m.memo||!$('annoCard').hidden)return;
  const t=$('tip');t.textContent=m.memo.length>320?m.memo.slice(0,320)+'…':m.memo;t.hidden=false;
  t.style.left=Math.min(x,innerWidth-t.offsetWidth-10)+'px';t.style.top=Math.min(y,innerHeight-t.offsetHeight-10)+'px';
}
function hideTip(){clearTimeout(tipTimer);tipMark=null;$('tip').hidden=true}

/* ===================== 文字の選択 ===================== */
function hasSel(){const s=window.getSelection();return !!(s&&!s.isCollapsed&&s.rangeCount&&textLayer.contains(s.getRangeAt(0).commonAncestorContainer))}
let selRange=null,selText='';
document.addEventListener('selectionchange',()=>{
  if(!isDoc())return;
  const s=window.getSelection();
  if(s&&!s.isCollapsed&&s.rangeCount&&textLayer.contains(s.getRangeAt(0).commonAncestorContainer)){
    selRange=s.getRangeAt(0).cloneRange();selText=cleanText(s.toString());
    if(selText){hideAsk();if(!$('annoCard').hidden&&!annoEditing())hideAnno();$('palette').hidden=true;if(!mouseSelecting)showSelBar();return}
  }
  setTimeout(()=>{if(!hasSel())$('selBar').hidden=true},250);
});
let mouseSelecting=false;
stage.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0)mouseSelecting=true},true);
document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&mouseSelecting){mouseSelecting=false;if(hasSel())showSelBar()}});
function selClientRects(){if(!selRange)return[];return [...selRange.getClientRects()].filter(r=>r.width>1&&r.height>1)}
function bounds(){const r=stage.getBoundingClientRect();return{top:r.top+6,bottom:r.bottom-62,left:r.left+6,right:r.right-6}}
// 浮かぶ部品を目印(anchor)の上か下に置く
function placeNear(el,a,prefer){
  const B=bounds(),w=el.offsetWidth,h=el.offsetHeight;
  let y=prefer==='above'?a.top-h-10:a.bottom+10;
  if(prefer==='above'&&y<B.top)y=a.bottom+10;
  if(prefer!=='above'&&y+h>B.bottom)y=a.top-h-10;
  y=Math.max(B.top,Math.min(y,innerHeight-h-8));
  const x=Math.min(Math.max(8,(a.left+a.right)/2-w/2),innerWidth-w-8);
  el.style.left=Math.round(x)+'px';el.style.top=Math.round(y)+'px';
  return y<a.top?'above':'below';
}
function popIn(el){if(!motionOK())return;el.classList.remove('show');void el.offsetWidth;el.classList.add('show')}
function showSelBar(){
  const bar=$('selBar'),rs=selClientRects();if(!rs.length){bar.hidden=true;return}
  const wasHidden=bar.hidden;bar.hidden=false;
  bar.dataset.side=placeNear(bar,unionRect(rs),TOUCH?'below':'above');
  if(wasHidden)popIn(bar);
}
function cleanText(t){return t.replace(/-\s*\n\s*/g,'').replace(/\s+/g,' ').trim()}
function selRects(range){
  const pr=pageEl.getBoundingClientRect(),W=pr.width,H=pr.height;
  let rs=[...range.getClientRects()].map(r=>({x:r.left-pr.left,y:r.top-pr.top,w:r.width,h:r.height})).filter(r=>r.w>1&&r.h>1&&r.x<W&&r.y<H&&r.x+r.w>0&&r.y+r.h>0);
  if(!rs.length)return[];
  const hs=rs.map(r=>r.h).sort((a,b)=>a-b),med=hs[Math.floor(hs.length/2)];
  rs=rs.filter(r=>r.h<=med*2.2);
  rs.sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2)||a.x-b.x);
  const lines=[];
  for(const r of rs){
    const l=lines.find(l=>Math.abs((l.y+l.h/2)-(r.y+r.h/2))<Math.min(l.h,r.h)*.5&&r.x<=l.x+l.w+Math.max(l.h,r.h)*1.5&&r.x+r.w>=l.x-Math.max(l.h,r.h)*1.5);
    if(l){const x2=Math.max(l.x+l.w,r.x+r.w),y2=Math.max(l.y+l.h,r.y+r.h);l.x=Math.min(l.x,r.x);l.y=Math.min(l.y,r.y);l.w=x2-l.x;l.h=y2-l.y}
    else lines.push({...r});
  }
  const f=v=>+v.toFixed(5);
  return lines.map(l=>[f(Math.max(0,l.x)/W),f(Math.max(0,l.y)/H),f(Math.min(l.w,W)/W),f(Math.min(l.h,H)/H)]);
}
function clearSel(){window.getSelection()?.removeAllRanges();selRange=null;$('selBar').hidden=true}
function addMark(type,ci,opt={}){
  if(!selRange)return null;
  const r=selRects(selRange);if(!r.length){toast('この部分には印を付けられません');return null}
  const m={id:newId(),t:type,ci,r,text:selText.slice(0,1000),at:Date.now()};touch(m);
  pageArr('marks',S.page).push(m);S.undo.push({page:S.page,kind:'marks',added:m});
  prefs.markCi=ci;savePrefs();renderSelDots();
  saveNotes();drawMarks();clearSel();renderRight();updateStatus();
  if(opt.memo)openAnno(m,{edit:true,fresh:true});
  else if(prefs.askMemo)showAsk(m);
  return m;
}
function renderSelDots(){
  const box=$('selDots');box.innerHTML='';
  MARKS.forEach((c,i)=>{const b=document.createElement('button');b.className='dot';b.style.background=c.hl;b.title=c.name+'でハイライト ('+(i+1)+')';
    b.setAttribute('aria-pressed',i===prefs.markCi);
    b.addEventListener('pointerdown',e=>e.preventDefault());
    b.onclick=()=>addMark('hl',i);box.appendChild(b)});
}
for(const id of ['ulBtn','selBmBtn','trBtn','memoBtn'])$(id).addEventListener('pointerdown',e=>e.preventDefault());
$('ulBtn').onclick=()=>addMark('ul',prefs.markCi);
$('memoBtn').onclick=()=>addMark('hl',prefs.markCi,{memo:true});
$('selBmBtn').onclick=()=>{addBookmark(S.page,selText.slice(0,120));clearSel()};

/* ===================== メモ ===================== */
// ハイライト直後に「メモを追加しますか？」
let askMark=null,askT=0;
function showAsk(m){
  askMark=m;const el=$('askMemo');el.hidden=false;
  placeNear(el,unionRect(markClientRects(m)),'below');popIn(el);
  clearTimeout(askT);askT=setTimeout(hideAsk,9000);
}
function hideAsk(){clearTimeout(askT);$('askMemo').hidden=true;askMark=null}
$('askMemo').addEventListener('mouseenter',()=>clearTimeout(askT));
$('askMemo').addEventListener('mouseleave',()=>{if(askMark){clearTimeout(askT);askT=setTimeout(hideAsk,4000)}});
$('askYes').onclick=()=>{const m=askMark;hideAsk();if(m)openAnno(m,{edit:true,fresh:true})};
$('askNo').onclick=hideAsk;

// 注釈カード(ハイライトをクリック / メモを書く)
let annoMark=null;
const annoEditing=()=>!$('annoCard').hidden&&!$('acEdit').hidden;
function openAnno(m,opt={}){
  hideAsk();hideTip();$('palette').hidden=true;$('selBar').hidden=true;
  annoMark=m;S.activeMark=m.id;
  const card=$('annoCard'),col=MARKS[m.ci]||MARKS[0];
  card.style.setProperty('--c',m.t==='hl'?col.hl:col.ul);
  $('acQuote').textContent=m.text||'（テキストなし）';
  const edit=!!opt.edit;
  $('acMemo').hidden=edit;$('acEdit').hidden=!edit;$('acBarView').hidden=edit;$('acBarEdit').hidden=!edit;
  if(m.memo){$('acMemo').textContent=m.memo;$('acMemo').classList.remove('none')}
  else{$('acMemo').textContent='メモはまだありません';$('acMemo').classList.add('none')}
  $('acEditLbl').textContent=m.memo?'メモを編集':'メモを追加';
  $('acTypeUse').setAttribute('href',m.t==='hl'?'#i-ul':'#i-hl');
  $('acType').title=m.t==='hl'?'下線に変更':'ハイライトに変更';
  const box=$('acDots');box.innerHTML='';
  MARKS.forEach((c,i)=>{const b=document.createElement('button');b.className='dot';b.style.background=m.t==='hl'?c.hl:c.ul;b.title=c.name;b.setAttribute('aria-pressed',i===m.ci);
    b.onclick=()=>{m.ci=i;touch(m);saveNotes();drawMarks();renderRight();openAnno(m)};box.appendChild(b)});
  const wasHidden=card.hidden;card.hidden=false;card.dataset.fresh=opt.fresh?'1':'';
  if(edit){$('acEdit').value=m.memo||'';}
  placeAnno();
  if(wasHidden)popIn(card);
  if(edit){const t=$('acEdit');const f=()=>{t.focus();t.setSelectionRange(t.value.length,t.value.length)};f();setTimeout(f,30)}
  highlightActiveCard();
}
function placeAnno(){if(!annoMark||$('annoCard').hidden)return;placeNear($('annoCard'),unionRect(markClientRects(annoMark)),'below')}
function hideAnno(){$('annoCard').hidden=true;annoMark=null}
function saveMemo(){
  const m=annoMark;if(!m)return;
  const v=$('acEdit').value.replace(/\s+$/,'');
  const had=!!m.memo;
  if(v.trim()){m.memo=v;m.memoAt=Date.now()}else{delete m.memo;delete m.memoAt}
  touch(m);
  saveNotes();drawMarks();renderRight();updateStatus();
  if(v.trim())toast(had?'メモを更新しました':'メモを保存しました');else if(had)toast('メモを削除しました');
}
$('acEditBtn').onclick=()=>annoMark&&openAnno(annoMark,{edit:true});
$('acSave').onclick=()=>{const m=annoMark;saveMemo();if(m)openAnno(m)};
$('acCancel').onclick=()=>{const m=annoMark;if(!m)return;if($('annoCard').dataset.fresh)hideAnno();else openAnno(m)};
$('acEdit').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('acSave').click()}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('acCancel').click()}
});
$('acType').onclick=()=>{const m=annoMark;if(!m)return;m.t=m.t==='hl'?'ul':'hl';touch(m);saveNotes();drawMarks();renderRight();openAnno(m)};
$('acDel').onclick=()=>{
  const m=annoMark;if(!m)return;
  const doDel=()=>{const arr=pageArr('marks',S.page),i=arr.indexOf(m);
    if(i>=0){arr.splice(i,1);kill(m);S.undo.push({page:S.page,kind:'marks',removed:[{o:m,i}]})}
    saveNotes();drawMarks();hideAnno();renderRight();updateStatus();toast('削除しました（Ctrl+Z で元に戻せます）')};
  if(m.memo)confirmSheet('ハイライトを削除','このハイライトと、書いたメモを削除します。','削除',doDel);else doDel();
};
// カードの外をクリックしたら閉じる(書きかけのメモは保存する)
document.addEventListener('pointerdown',e=>{
  const card=$('annoCard');
  if(!card.hidden&&!card.contains(e.target)&&!e.target.closest('.badge')&&!e.target.closest('#scrim')){
    if(annoEditing()){const m=annoMark;const v=$('acEdit').value.trim();if(v!==(m.memo||'').trim())saveMemo()}
    hideAnno();highlightActiveCard();
  }
  if(!$('askMemo').hidden&&!$('askMemo').contains(e.target))hideAsk();
  if(!$('fileMenu').hidden&&!$('fileMenu').contains(e.target))hideFileMenu();
  if(!$('palette').hidden&&!$('palette').contains(e.target)&&e.target!==$('colorBtn')&&!e.target.closest('[data-tool]'))$('palette').hidden=true;
},true);

// メモ一覧から該当箇所へ
async function jumpToMark(p,m,opt={}){
  hideAllFloats();if(narrow()&&prefs.right){prefs.right=false;applyPanels();await new Promise(r=>setTimeout(r,60))}
  if(S.page!==p)await go(p);
  const [,y,,h]=m.r[0],top=pageEl.offsetTop+y*S.cssH,bottom=pageEl.offsetTop+(y+h)*S.cssH;
  if(top<stage.scrollTop+16||bottom>stage.scrollTop+stage.clientHeight-80)
    stage.scrollTo({top:Math.max(0,top-stage.clientHeight*.3),behavior:motionOK()?'smooth':'auto'});
  S.activeMark=m.id;highlightActiveCard();
  setTimeout(()=>{flashMark(m);if(opt.open)openAnno(m,{edit:!!opt.edit})},motionOK()?260:0);
}

/* ===================== 浮かぶ部品の管理 ===================== */
function anyFloatOpen(){return ['selBar','askMemo','annoCard','palette','fileMenu'].some(id=>!$(id).hidden)}
function hideAllFloats(){$('palette').hidden=true;hideAsk();hideAnno();hideTip();hideFileMenu()}
function placeFloats(){
  if(!$('selBar').hidden&&selRange)showSelBar();
  if(!$('trPop').hidden)placeTr();
  placeAnno();
  if(askMark&&!$('askMemo').hidden)placeNear($('askMemo'),unionRect(markClientRects(askMark)),'below');
}
stage.addEventListener('scroll',placeFloats,{passive:true});
window.addEventListener('resize',placeFloats);

/* ===================== ツール ===================== */
function setTool(t){
  S.tool=t;setTimeout(updateTouchAction,0);
  document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===t));
  app.classList.toggle('drawtool',t!=='select');
  if(t!=='select'){clearSel();hideAllFloats()}
  updateColorBtn();
}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{
  if(S.tool===b.dataset.tool&&(b.dataset.tool==='pen'||b.dataset.tool==='hl')){openPalette();return}
  setTool(b.dataset.tool)});
const curKind=()=>S.tool==='hl'?'hl':'pen';
function updateColorBtn(){
  const k=curKind();$('colorBtn').style.background=k==='hl'?HL_COLORS[prefs.hlColor]:PEN_COLORS[prefs.penColor];
  $('colorBtn').style.opacity=S.tool==='select'||S.tool==='eraser'?.55:1;
}
function openPalette(){
  const k=curKind(),pal=$('palDots'),wd=$('widths');pal.innerHTML='';wd.innerHTML='';
  (k==='hl'?HL_COLORS:PEN_COLORS).forEach((c,i)=>{const b=document.createElement('button');b.className='dot';b.style.background=c;
    b.setAttribute('aria-pressed',i===(k==='hl'?prefs.hlColor:prefs.penColor));
    b.onclick=()=>{if(k==='hl')prefs.hlColor=i;else prefs.penColor=i;savePrefs();if(S.tool==='select'||S.tool==='eraser')setTool(k);updateColorBtn();openPalette()};pal.appendChild(b)});
  WIDTHS[k].forEach((w,i)=>{const b=document.createElement('button');b.setAttribute('aria-label',['細','中','太'][i]);
    b.setAttribute('aria-pressed',i===(k==='hl'?prefs.hlW:prefs.penW));
    b.innerHTML='<i style="height:'+(k==='hl'?[5,8,12][i]:[2,3.5,6][i])+'px;background:'+(k==='hl'?HL_COLORS[prefs.hlColor]:PEN_COLORS[prefs.penColor])+'"></i>';
    b.onclick=()=>{if(k==='hl')prefs.hlW=i;else prefs.penW=i;savePrefs();openPalette()};wd.appendChild(b)});
  const pop=$('palette');const wasHidden=pop.hidden;pop.hidden=false;
  const r=$('colorBtn').getBoundingClientRect();
  pop.style.left=Math.min(Math.max(8,r.left+r.width/2-pop.offsetWidth/2),innerWidth-pop.offsetWidth-8)+'px';
  pop.style.top=(r.top-pop.offsetHeight-12)+'px';
  if(wasHidden)popIn(pop);
}
$('colorBtn').onclick=()=>{if(!$('palette').hidden){$('palette').hidden=true;return}if(S.tool==='select'||S.tool==='eraser')setTool('pen');openPalette()};
function syncFinger(){$('fingerBtn').setAttribute('aria-pressed',S.finger)}
function setFinger(v){S.finger=v;prefs.finger=v;savePrefs();syncFinger();updateTouchAction()}
$('fingerBtn').onclick=()=>{setFinger(!S.finger);toast(S.finger?'タッチでも描けます（2本指で拡大・移動）':'タッチは画面操作、ペンとマウスで描画')};
$('undoBtn').onclick=undo;

/* ===================== ヘッダー・ステータス ===================== */
$('prevBtn').onclick=()=>go(S.page-1);
$('nextBtn').onclick=()=>go(S.page+1);
$('pageInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go(parseInt(e.target.value,10));e.target.blur()}else if(e.key==='Escape')e.target.blur()});
$('pageInput').addEventListener('focus',e=>setTimeout(()=>e.target.select(),0));
$('pageInput').addEventListener('blur',e=>{const v=parseInt(e.target.value,10);if(v&&v!==S.page)go(v);else e.target.value=S.page});
$('fitBtn').onclick=()=>{S.fit=S.fit==='page'?'width':'page';prefs.fit=S.fit;savePrefs();render()};
function allMarks(){const out=[];if(!S.notes)return out;for(const [p,arr] of Object.entries(S.notes.marks))for(const m of arr)out.push({p:+p,m});
  out.sort((a,b)=>a.p-b.p||a.m.r[0][1]-b.m.r[0][1]||a.m.r[0][0]-b.m.r[0][0]);return out}
function updateStatus(){
  if(!S.pdf||!S.notes)return;
  const all=allMarks(),memos=all.filter(x=>x.m.memo).length;
  $('status').innerHTML='';
  for(const t of ['p.'+S.page+' / '+S.pdf.numPages,'ハイライト '+all.length,'メモ '+memos,Math.round(S.scale*100)+'%']){const s=document.createElement('span');s.textContent=t;$('status').appendChild(s)}
  $('memoCount').textContent=memos||'';$('markCount').textContent=all.length||'';$('bmCount').textContent=S.notes.bookmarks.length||'';
}

/* しおり */
function updateBmBtn(){if(S.notes)$('bmBtn').setAttribute('aria-pressed',S.notes.bookmarks.some(b=>b.page===S.page))}
async function addBookmark(page,note){
  if(!note){try{const pg=await S.pdf.getPage(page);const tc=await pg.getTextContent();note=cleanText(tc.items.map(i=>i.str).join(' ')).slice(0,40)}catch(e){}}
  const bk={id:newId(),page,note:note||(page+'ページ'),at:Date.now()};touch(bk);S.notes.bookmarks.push(bk);
  S.notes.bookmarks.sort((a,b)=>a.page-b.page||a.at-b.at);
  saveNotes();updateBmBtn();updateStatus();toast(page+'ページをしおりに追加しました');if(prefs.ltab==='bm')renderLeft();
}
$('bmBtn').onclick=()=>{
  if(S.notes.bookmarks.some(b=>b.page===S.page)){S.notes.bookmarks.filter(b=>b.page===S.page).forEach(b=>kill(b));S.notes.bookmarks=S.notes.bookmarks.filter(b=>b.page!==S.page);saveNotes();updateBmBtn();updateStatus();toast(S.page+'ページのしおりを外しました');if(prefs.ltab==='bm')renderLeft()}
  else addBookmark(S.page);
};

/* ===================== 左パネル ===================== */
document.querySelectorAll('[data-ltab]').forEach(t=>t.onclick=()=>{prefs.ltab=t.dataset.ltab;savePrefs();renderLeft()});
$('fileFilter').addEventListener('input',()=>renderLeft());
async function renderLeft(){
  let tab=prefs.ltab;if(!isDoc()&&tab!=='files')tab='files';
  document.querySelectorAll('[data-ltab]').forEach(t=>t.setAttribute('aria-selected',t.dataset.ltab===tab));
  $('fileTool').hidden=tab!=='files';
  const body=$('leftBody');body.innerHTML='';
  if(tab==='files'){
    const q=$('fileFilter').value.trim().toLowerCase();
    const list=S.metas.filter(m=>!q||m.name.toLowerCase().includes(q));
    if(!S.metas.length){body.innerHTML='<div class="empty">PDFを開くと、ここに一覧で並びます。</div>';return}
    if(!list.length){body.innerHTML='<div class="empty">見つかりません。</div>';return}
    for(const m of list){
      const r=document.createElement('button');r.className='frow'+(m.id===S.id?' active':'');r.title=m.name;
      r.innerHTML='<svg><use href="#i-file"/></svg><span class="nm"></span><span class="pg"></span>';
      r.querySelector('.nm').textContent=baseName(m.name);
      r.querySelector('.pg').textContent=m.pages?Math.round((m.page||1)/m.pages*100)+'%':'';
      const more=document.createElement('span');more.className='ib more';more.innerHTML='<svg><use href="#i-dots"/></svg>';more.title='その他';
      more.onclick=e=>{e.stopPropagation();const b=more.getBoundingClientRect();openFileMenu(m,b.left,b.bottom+4)};
      r.appendChild(more);
      r.onclick=()=>{if(m.id!==S.id)openBook(m.id)};
      r.oncontextmenu=e=>{e.preventDefault();openFileMenu(m,e.clientX,e.clientY)};
      body.appendChild(r);
    }
  }else if(tab==='toc'){
    if(!S.outline){body.innerHTML='<div class="empty">読み込み中…</div>';S.outline=await loadOutline();if(prefs.ltab!=='toc')return;body.innerHTML=''}
    if(!S.outline.length){body.innerHTML='<div class="empty">このPDFには目次情報がありません。しおりで章の位置を登録できます。</div>';return}
    for(const it of S.outline){
      const r=document.createElement('button');r.className='orow';r.style.setProperty('--ind',(8+it.d*14)+'px');
      r.innerHTML='<span class="t"></span><span class="p"></span>';
      r.querySelector('.t').textContent=it.title;r.querySelector('.p').textContent=it.n||'';
      if(it.n){r.dataset.n=it.n;r.onclick=()=>go(it.n)}else r.disabled=true;
      body.appendChild(r);
    }
    markTocCurrent();
  }else{
    const bms=S.notes.bookmarks;
    if(!bms.length){body.innerHTML='<div class="empty">しおりはまだありません。上の栞ボタン（B）で今のページを、文字を選んで「しおり」でその一文を登録できます。</div>';return}
    bms.forEach((b,i)=>{
      const row=document.createElement('div');row.className='bmrow';
      const pn=document.createElement('button');pn.className='p';pn.textContent='p.'+b.page;pn.onclick=()=>go(b.page);
      const inp=document.createElement('input');inp.id='bm-'+i;inp.value=b.note||'';inp.setAttribute('aria-label','しおりの名前');inp.oninput=()=>{b.note=inp.value;touch(b);saveNotes()};
      const x=document.createElement('button');x.className='ib';x.title='削除';x.innerHTML='<svg><use href="#i-x"/></svg>';
      x.onclick=()=>{kill(b);S.notes.bookmarks.splice(S.notes.bookmarks.indexOf(b),1);saveNotes();updateBmBtn();updateStatus();renderLeft()};
      row.append(pn,inp,x);body.appendChild(row);
    });
  }
}
function markTocCurrent(){
  if(prefs.ltab!=='toc'||!S.outline)return;
  const rows=[...$('leftBody').querySelectorAll('.orow[data-n]')];let best=null;
  for(const r of rows){r.classList.remove('cur');if(+r.dataset.n<=S.page&&(!best||+r.dataset.n>=+best.dataset.n))best=r}
  if(best)best.classList.add('cur');
}
async function loadOutline(){
  let ol=null;try{ol=await S.pdf.getOutline()}catch(e){}
  if(!ol)return[];
  const flat=[];(function walk(items,d){for(const it of items){flat.push({title:it.title,dest:it.dest,d});if(it.items&&it.items.length&&d<3)walk(it.items,d+1)}})(ol,0);
  for(const it of flat.slice(0,600)){
    try{let dest=it.dest;if(typeof dest==='string')dest=await S.pdf.getDestination(dest);
      if(dest&&dest[0]!=null)it.n=(typeof dest[0]==='object'?await S.pdf.getPageIndex(dest[0]):dest[0])+1}catch(e){}
  }
  return flat;
}

/* ===================== 右パネル: メモ・ハイライト ===================== */
document.querySelectorAll('[data-rtab]').forEach(t=>t.onclick=()=>{prefs.rtab=t.dataset.rtab;savePrefs();renderRight()});
$('memoFilter').addEventListener('input',()=>renderRight());
let rrT=0;function renderRightSoon(){clearTimeout(rrT);rrT=setTimeout(renderRight,120)}
function fmtDate(t){if(!t)return'';const d=new Date(t);return (d.getMonth()+1)+'/'+d.getDate()}
function renderRight(){
  const tab=prefs.rtab;
  document.querySelectorAll('[data-rtab]').forEach(t=>t.setAttribute('aria-selected',t.dataset.rtab===tab));
  $('memoFilter').placeholder=tab==='memos'?'メモを検索':'ハイライトを検索';
  const body=$('rightBody');body.innerHTML='';
  if(!isDoc()){body.innerHTML='<div class="empty">PDFを開くと、ハイライトとメモがここに並びます。</div>';return}
  updateStatus();
  const q=$('memoFilter').value.trim().toLowerCase();
  let list=allMarks();
  if(tab==='memos')list=list.filter(x=>x.m.memo);
  if(q)list=list.filter(x=>(x.m.text||'').toLowerCase().includes(q)||(x.m.memo||'').toLowerCase().includes(q));
  if(!list.length){
    body.innerHTML='<div class="empty">'+(q?'見つかりません。':tab==='memos'?'メモはまだありません。<br>文字を選んで色を付けると「メモを追加しますか？」と聞かれます。選択バーの「メモ」からも書けます。':'ハイライトはまだありません。文字を選ぶと色や下線を付けられます。')+'</div>';
  }
  for(const {p,m} of list){
    const c=document.createElement('div');c.className='mcard'+(m.id===S.activeMark?' active':'');c.dataset.id=m.id;c.tabIndex=0;
    const col=MARKS[m.ci]||MARKS[0];
    const head=document.createElement('div');head.className='mhead';
    head.innerHTML='<span class="pg"></span><span></span><span class="sp"></span>';
    head.children[0].textContent='p.'+p;head.children[1].textContent=fmtDate(m.memoAt||m.at);
    const ed=document.createElement('button');ed.className='ib';ed.title=m.memo?'メモを編集':'メモを追加';ed.innerHTML='<svg><use href="#i-edit"/></svg>';
    ed.onclick=e=>{e.stopPropagation();jumpToMark(p,m,{open:true,edit:true})};
    head.appendChild(ed);
    const qt=document.createElement('blockquote');qt.className='mq'+(m.t==='ul'?' ul':'');qt.style.setProperty('--c',m.t==='hl'?col.hl:col.ul);qt.textContent=m.text||'';
    c.append(head,qt);
    if(m.memo){const mm=document.createElement('div');mm.className='mm';mm.textContent=m.memo;c.appendChild(mm)}
    c.onclick=()=>jumpToMark(p,m,{open:!!m.memo});
    c.onkeydown=e=>{if(e.key==='Enter')c.click()};
    body.appendChild(c);
  }
  if(tab==='marks'&&!q){
    const inkPages=Object.entries(S.notes.strokes).filter(([,a])=>a.length).map(([p])=>+p).sort((a,b)=>a-b);
    if(inkPages.length){
      const h=document.createElement('div');h.className='sec';h.textContent='手書きのあるページ';body.appendChild(h);
      for(const p of inkPages){const r=document.createElement('button');r.className='inkrow';r.onclick=()=>go(p);
        r.innerHTML='<span class="pg">p.'+p+'</span><span>手書き '+S.notes.strokes[p].length+' 本</span>';body.appendChild(r)}
    }
  }
}
function highlightActiveCard(){
  $('rightBody').querySelectorAll('.mcard').forEach(c=>c.classList.toggle('active',c.dataset.id===S.activeMark));
  const a=$('rightBody').querySelector('.mcard.active');if(a)a.scrollIntoView({block:'nearest',behavior:motionOK()?'smooth':'auto'});
}
// Markdownで書き出す(Obsidianに貼れる形)
function toMarkdown(){
  const title=baseName(S.meta.name);let out='# '+title+'\n\n';let lastP=0;
  for(const {p,m} of allMarks()){
    if(p!==lastP){out+='## p.'+p+'\n\n';lastP=p}
    out+=(m.text||'').split('\n').map(l=>'> '+l).join('\n')+'\n';
    if(m.memo)out+='\n'+m.memo+'\n';
    out+='\n';
  }
  return out.trim()+'\n';
}
$('mdCopy').onclick=async()=>{if(!allMarks().length){toast('ハイライトがまだありません');return}
  try{await navigator.clipboard.writeText(toMarkdown());toast('Markdownをコピーしました')}catch(e){toast('コピーできませんでした')}};
$('mdSave').onclick=async()=>{if(!allMarks().length){toast('ハイライトがまだありません');return}
  const fname=baseName(S.meta.name)+'_メモ.md';
  if(N.saveNeedsTap){await N.saveText(fname,toMarkdown());return}
  const r=await N.saveText(fname,toMarkdown());
  if(r&&r.ok)toast('メモを保存しました（'+r.path.split(/[\\/]/).pop()+'）')};

/* ===================== その場で翻訳 ===================== */
let trSet={engine:'google',target:'auto',hasKey:false},trSeq=0,trAnchor=null,trResult='';
if(N.getTrSettings)N.getTrSettings().then(v=>{trSet=v}).catch(()=>{});
const LANG={ja:'日本語',en:'英語',de:'ドイツ語',fr:'フランス語',zh:'中国語','zh-cn':'中国語','zh-tw':'中国語',ko:'韓国語',es:'スペイン語',it:'イタリア語',ru:'ロシア語',pt:'ポルトガル語',nl:'オランダ語',la:'ラテン語'};
function isJapanese(t){const ja=(t.match(/[぀-ヿ㐀-鿿]/g)||[]).length;const lat=(t.match(/[A-Za-z]/g)||[]).length;return ja>0&&ja>=lat*0.25}
function targetFor(t){return trSet.target==='ja'?'ja':(isJapanese(t)?'en':'ja')}
function placeTr(){
  const pop=$('trPop');if(pop.hidden||!trAnchor)return;
  const selAbove=!$('selBar').hidden&&$('selBar').dataset.side==='above';
  placeNear(pop,trAnchor,selAbove||$('selBar').hidden?'below':'above');
}
function hideTr(){$('trPop').hidden=true;trSeq++}
async function translateSel(){
  if(!selText)return;
  const text=selText.slice(0,5000),tl=targetFor(text),seq=++trSeq;
  const rs=selClientRects();
  trAnchor=rs.length?unionRect(rs):{top:innerHeight/2,bottom:innerHeight/2,left:innerWidth/2,right:innerWidth/2};
  const pop=$('trPop'),wasHidden=pop.hidden;
  $('trLang').textContent='→ '+LANG[tl];$('trEng').textContent='';trResult='';
  $('trBody').innerHTML='<div class="skel"><i></i><i></i><i></i></div>';
  $('trSrc').textContent=text;
  pop.hidden=false;placeTr();if(wasHidden)popIn(pop);
  let r;
  try{r=await N.translate(text,tl)}catch(e){r={error:'翻訳できませんでした。'}}
  if(seq!==trSeq)return;
  if(r.error){
    $('trBody').innerHTML='';const p=document.createElement('div');p.className='trerr';p.textContent=r.error;$('trBody').appendChild(p);
    if(r.code==='nokey'||r.code==='badkey'||r.code==='quota'){const b=document.createElement('button');b.className='tb';b.style.marginTop='10px';b.textContent='翻訳の設定を開く';b.onclick=()=>openSettings('tr');$('trBody').appendChild(b)}
  }else{
    trResult=r.text;$('trBody').textContent=r.text;
    const from=LANG[(r.detected||'').toLowerCase()];
    $('trLang').textContent=(from?from+' ':'')+'→ '+LANG[tl];$('trEng').textContent='· '+r.engine;
  }
  placeTr();
}
$('trBtn').onclick=translateSel;
$('trClose').onclick=hideTr;
$('trCopy').onclick=async()=>{if(!trResult)return;try{await navigator.clipboard.writeText(trResult);toast('訳文をコピーしました')}catch(e){toast('コピーできませんでした')}};
$('trSet').onclick=()=>openSettings('tr');

/* ===================== 設定画面 ===================== */
let setTab='look';
function openSettings(tab){setTab=tab||setTab;$('settings').hidden=false;renderSettings()}
function closeSettings(){$('settings').hidden=true}
$('rbSettings').onclick=()=>openSettings();$('homeSettings').onclick=()=>openSettings('look');
$('setClose').onclick=closeSettings;
$('settings').addEventListener('pointerdown',e=>{if(e.target===$('settings'))closeSettings()});
document.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{setTab=b.dataset.set;renderSettings()});
function row(title,desc,control,col){
  const r=document.createElement('div');r.className='srow'+(col?' col':'');
  const l=document.createElement('div');l.className='lab';l.innerHTML='<b></b><small></small>';
  l.firstChild.textContent=title;if(desc)l.lastChild.textContent=desc;else l.lastChild.remove();
  r.append(l);if(control)r.append(control);return r;
}
function seg(opts,val,on){
  const s=document.createElement('div');s.className='seg';
  for(const [v,label] of opts){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-pressed',v===val);
    b.onclick=()=>{s.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));on(v)};s.appendChild(b)}
  return s;
}
function toggle(val,on){
  const b=document.createElement('button');b.className='switch';b.setAttribute('role','switch');b.setAttribute('aria-checked',!!val);
  b.onclick=()=>{const v=b.getAttribute('aria-checked')!=='true';b.setAttribute('aria-checked',v);on(v)};return b;
}
function setLook(k,v){prefs.look[k]=v;savePrefs();applyTheme();if(isDoc()&&k==='size')setTimeout(()=>render(),50)}
function bgPicker(mode){
  const g=document.createElement('div');g.className='bgs';
  for(const [k,p] of Object.entries(PRESETS[mode])){
    const b=document.createElement('button');b.className='bgopt';b.setAttribute('aria-pressed',prefs.look[mode]===k);
    const pv=document.createElement('div');pv.className='bgprev';
    pv.innerHTML='<i></i><i></i><i></i>';pv.children[0].style.background=p.ribbon;pv.children[1].style.background=p.side;pv.children[2].style.background=p.desk;
    const nm=document.createElement('span');nm.textContent=p.name;
    b.append(pv,nm);
    b.onclick=()=>{g.querySelectorAll('.bgopt').forEach(x=>x.setAttribute('aria-pressed',x===b));setLook(mode,k)};
    g.appendChild(b);
  }
  return g;
}
async function renderSettings(){
  document.querySelectorAll('[data-set]').forEach(b=>b.setAttribute('aria-selected',b.dataset.set===setTab));
  const B=$('setBody');B.innerHTML='';
  const h=document.createElement('h2');B.appendChild(h);
  const L=prefs.look;
  if(setTab==='look'){
    h.textContent='外観';
    B.append(row('テーマ','「システムに合わせる」はWindowsの設定に従います。',seg([['dark','ダーク'],['light','ライト'],['system','システムに合わせる']],L.mode,v=>setLook('mode',v))));
    const r1=row('ダークのときの背景',null,null,true);r1.append(bgPicker('dark'));B.append(r1);
    const r2=row('ライトのときの背景',null,null,true);r2.append(bgPicker('light'));B.append(r2);
    const ac=document.createElement('div');ac.className='accents';
    for(const [k,a] of Object.entries(ACCENTS)){const b=document.createElement('button');b.title=a.name;b.style.background=effMode()==='dark'?a.d:a.l;b.setAttribute('aria-pressed',L.accent===k);
      b.onclick=()=>{ac.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));setLook('accent',k)};ac.appendChild(b)}
    B.append(row('アクセントカラー','ボタンや選択中の項目の色です。',ac));
    B.append(row('PDFページの色','目が疲れるときは「少し暗く」や「夜間」を。書き込みの色はそのままです。',seg([['normal','そのまま'],['sepia','セピア'],['dim','少し暗く'],['night','夜間']],L.page,v=>setLook('page',v))));
    B.append(row('文字の大きさ','メニューやメモの文字の大きさです。',seg([['s','小'],['m','標準'],['l','大']],L.size,v=>setLook('size',v))));
    B.append(row('なめらかな動き','ページめくりやパネルの動きを表示します。',toggle(L.motion,v=>setLook('motion',v))));
  }else if(setTab==='read'){
    h.textContent='読書と注釈';
    B.append(row('ハイライトのあとにメモを聞く','色を付けたあと「メモを追加しますか？」と表示します。オフにしても、ハイライトをクリックすればいつでもメモを書けます。',toggle(prefs.askMemo,v=>{prefs.askMemo=v;savePrefs()})));
    B.append(row('開いたときの表示',null,seg([['page','ページ全体'],['width','幅に合わせる']],prefs.fit,v=>{prefs.fit=v;S.fit=v;savePrefs();if(isDoc())render()})));
    B.append(row('マウスホイールでページをめくる','ページの端でさらにホイールを回すと、次・前のページへ移ります。',toggle(prefs.wheelTurn,v=>{prefs.wheelTurn=v;savePrefs()})));
    B.append(row('タッチ操作でも描く','タッチ画面でペンがないときに使います。オフのときはタッチで画面操作、ペンとマウスで描画です。',toggle(S.finger,v=>setFinger(v))));
  }else if(setTab==='sync'){
    h.textContent='同期';syncSettings(B);
  }else if(setTab==='tr'){
    h.textContent='翻訳';
    try{trSet=await N.getTrSettings()}catch(e){}
    if(setTab!=='tr')return;
    const note=document.createElement('p');note.className='note';
    const saveTr=async(extra)=>{const r=await N.setTrSettings(Object.assign({engine:trSet.engine,target:trSet.target},extra||{}));
      if(r&&r.error){note.textContent=r.error;note.style.color='var(--danger)';return false}trSet=r;return true};
    B.append(row('翻訳サービス','Google 翻訳は設定不要です。DeepLは文章の訳が自然で、無料のAPIキー（月50万文字まで）で使えます。',
      seg([['google','Google 翻訳'],['deepl','DeepL']],trSet.engine,async v=>{trSet.engine=v;await saveTr();renderSettings()})));
    if(trSet.engine==='deepl'){
      const box=document.createElement('div');box.style.cssText='display:flex;gap:8px;width:100%';
      const inp=document.createElement('input');inp.className='keyin';inp.id='keyIn';inp.type='password';inp.autocomplete='off';inp.spellcheck=false;
      inp.placeholder=trSet.hasKey?'設定済み（変更するときだけ入力）':'xxxxxxxx-xxxx-…:fx';
      const sv=document.createElement('button');sv.className='tb primary';sv.textContent='保存';
      sv.onclick=async()=>{if(!inp.value.trim()){note.textContent='キーを入力してください。';note.style.color='var(--danger)';return}
        if(await saveTr({key:inp.value})){inp.value='';toast('APIキーを保存しました');renderSettings()}};
      box.append(inp,sv);
      const r=row('DeepL APIキー',null,null,true);r.append(box,note);B.append(r);
      note.textContent='DeepLのサイトで「DeepL API Free」に登録すると、アカウント画面でキーを確認できます。キーはこのPCに暗号化して保存します。';
      if(trSet.hasKey)N.deeplUsage().then(u=>{if(u&&u.limit)note.textContent='今月の使用量: '+u.used.toLocaleString()+' / '+u.limit.toLocaleString()+' 文字'}).catch(()=>{});
    }
    B.append(row('訳す方向','「自動」は日本語以外を日本語に、日本語を英語に訳します。',seg([['auto','自動'],['ja','常に日本語に']],trSet.target,async v=>{trSet.target=v;await saveTr()})));
    const p=document.createElement('p');p.className='note';p.style.marginTop='18px';p.textContent='「翻訳」を押したときだけ、選んだ文が翻訳サービスに送られます。PDFそのもの、書き込み、メモは送られません。';B.append(p);
  }else{
    h.textContent='このアプリについて';
    let info={};try{info=await N.appInfo()}catch(e){}
    if(setTab!=='about')return;
    B.append(row('余白 PDFリーダー','バージョン '+(info.version||'')));
    B.append(row('保存場所','本棚のPDF・書き込み・メモはこの端末の中に保存されます。同期をオンにすると、あなたのGoogleドライブの「余白 同期データ」にも保存されます。元のPDFファイルには書き込みません。'+(info.dataPath?'\n'+info.dataPath:''),null));
    const k=document.createElement('div');k.className='keys';
    const keys=[['Ctrl O','PDFを開く'],['← →','ページをめくる'],['G','ページ番号へ移動'],['V P H E','選択・ペン・マーカー・消しゴム'],['1〜4','選んだ文をその色でハイライト'],['M','選んだ文にメモ'],['U','選んだ文に下線'],['T','選んだ文を翻訳'],['B','しおり'],['Ctrl Z','元に戻す'],['Ctrl ホイール','拡大・縮小'],['Ctrl [  Ctrl ]','左右のパネル'],['Ctrl ,','設定'],['F11','全画面']];
    for(const [a,b] of keys){const s1=document.createElement('span');for(const part of a.split(' ')){if(!part)continue;const kb=document.createElement('span');kb.className='kbd';kb.textContent=part;s1.appendChild(kb)}
      const s2=document.createElement('span');s2.textContent=b;k.append(s1,s2)}
    const r=row('キーボード操作',null,null,true);r.append(k);B.append(r);
  }
}

/* ===================== 書き出し(注釈をPDFに焼き込む) ===================== */
let pdfLibLoading=null;
function loadPdfLib(){return pdfLibLoading||(pdfLibLoading=new Promise((res,rej)=>{const s=document.createElement('script');s.src='pdf-lib.min.js';s.onload=()=>res(window.PDFLib);s.onerror=rej;document.head.appendChild(s)}))}
function hexRgb(h){const n=parseInt(h.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
$('exportBtn').onclick=async()=>{
  const st=S.notes.strokes,mk=S.notes.marks;
  const pages=new Set([...Object.keys(st).filter(p=>st[p].length),...Object.keys(mk).filter(p=>mk[p].length)].map(Number));
  if(!pages.size){toast('書き込みやハイライトがまだありません');return}
  sheet('<h3>書き出し中…</h3><p>注釈をPDFに書き込んでいます。</p>');
  try{
    const L=await loadPdfLib(),blob=await DB.get('blobs',S.id);
    const doc=await L.PDFDocument.load(blob.data,{ignoreEncryption:true});
    for(const pn of pages){
      const page=doc.getPage(pn-1);if(!page)continue;
      const cb=page.getCropBox(),rot=((page.getRotation().angle%360)+360)%360;
      const map=(nx,ny)=>{let u,v;
        if(rot===90){u=ny;v=1-nx}else if(rot===180){u=1-nx;v=1-ny}else if(rot===270){u=1-ny;v=nx}else{u=nx;v=ny}
        return[cb.x+u*cb.width,cb.y+cb.height-v*cb.height]};
      const dispW=(rot===90||rot===270)?cb.height:cb.width;
      for(const m of mk[pn]||[]){
        const c=MARKS[m.ci]||MARKS[0];
        for(const [x,y,w,h] of m.r){
          if(m.t==='hl'){const a=map(x,y),b=map(x+w,y+h);
            page.drawRectangle({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1]),color:L.rgb(...hexRgb(c.hl)),opacity:.4,blendMode:L.BlendMode.Multiply});
          }else{const a=map(x,y+h),b=map(x+w,y+h);
            page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:Math.max(.8,h*dispW*.06),color:L.rgb(...hexRgb(c.ul))})}
        }
      }
      for(const s of st[pn]||[]){
        const P=s.p.map(q=>map(q[0],q[1])),col=L.rgb(...hexRgb(s.c));
        const seg=(d,wid,op)=>page.drawSvgPath(d,{x:0,y:0,borderColor:col,borderWidth:wid,borderOpacity:op,borderLineCap:L.LineCapStyle.Round,...(s.t==='hl'?{blendMode:L.BlendMode.Multiply}:{})});
        const f=v=>v.toFixed(2),pt2=q=>f(q[0])+' '+f(-q[1]);
        if(P.length<3){seg('M'+pt2(P[0])+' L'+pt2(P[P.length-1]),s.w*dispW,s.t==='hl'?.38:1);continue}
        if(s.t==='hl'){let d='M'+pt2(P[0]);for(let i=1;i<P.length-1;i++)d+=' Q'+pt2(P[i])+' '+pt2([(P[i][0]+P[i+1][0])/2,(P[i][1]+P[i+1][1])/2]);d+=' L'+pt2(P[P.length-1]);seg(d,s.w*dispW,.38)}
        else{let sx=P[0];for(let i=1;i<P.length-1;i++){const m2=[(P[i][0]+P[i+1][0])/2,(P[i][1]+P[i+1][1])/2];seg('M'+pt2(sx)+' Q'+pt2(P[i])+' '+pt2(m2),s.w*dispW*(.55+.9*(s.p[i][2]??.5)),1);sx=m2}}
      }
    }
    const out=await doc.save();
    closeSheet();
    const fname=baseName(S.meta.name)+'_注釈.pdf';
    if(N.saveNeedsTap){
      sheet('<h3>書き出しました</h3><p>「'+escapeHtml(fname)+'」（'+(out.length/1048576).toFixed(1)+' MB）</p><p class="note">「共有・保存」から「\"ファイル\"に保存」を選ぶと、ファイルアプリやGoogleドライブに保存できます。メモの文章はPDFに入りません。</p><div class="acts"><button class="tb" id="shClose">閉じる</button><button class="tb primary" id="shGo">共有・保存</button></div>');
      $('shClose').onclick=closeSheet;$('shGo').onclick=async()=>{await N.savePdf(fname,out);closeSheet()};return;
    }
    const r=await N.savePdf(fname,out);
    if(r&&r.ok){
      sheet('<h3>保存しました</h3><p>'+escapeHtml(r.path)+'</p><p class="note">メモの文章はPDFに入りません。メモはメモパネルの「.mdで保存」で書き出せます。</p><div class="acts"><button class="tb" id="shOpen">フォルダを開く</button><button class="tb primary" id="shClose">閉じる</button></div>');
      $('shClose').onclick=closeSheet;if(!N.showInFolder)$('shOpen').hidden=true;$('shOpen').onclick=()=>{N.showInFolder(r.path);closeSheet()};
    }
  }catch(e){console.error(e);sheet('<h3>書き出せませんでした</h3><p>このPDFは書き込みに対応していない形式の可能性があります（暗号化されたPDFなど）。アプリ内の書き込みはそのまま残っています。</p><div class="acts"><button class="tb primary" id="shClose">閉じる</button></div>');$('shClose').onclick=closeSheet}
};
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

/* ===================== 共通 ===================== */
function sheet(html){$('sheet').innerHTML=html;$('scrim').hidden=false}
function closeSheet(){$('scrim').hidden=true}
function confirmSheet(title,text,ok,fn){
  sheet('<h3>'+escapeHtml(title)+'</h3><p>'+escapeHtml(text)+'</p><div class="acts"><button class="tb" id="shClose">キャンセル</button><button class="tb primary" id="shOk" style="background:var(--danger);border-color:var(--danger);color:#fff">'+escapeHtml(ok)+'</button></div>');
  $('shClose').onclick=closeSheet;$('shOk').onclick=async()=>{closeSheet();await fn()};
}
let toastT=0;function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;popIn(el);clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2200)}

/* ===================== キーボード ===================== */
document.addEventListener('keydown',e=>{
  const k=e.key,ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&k.toLowerCase()==='o'){e.preventDefault();pickFile();return}
  if(ctrl&&k===','){e.preventDefault();$('settings').hidden?openSettings():closeSettings();return}
  if(ctrl&&k==='['){e.preventDefault();toggleLeft();return}
  if(ctrl&&k===']'){e.preventDefault();toggleRight();return}
  if(k==='Escape'&&!$('settings').hidden){closeSettings();return}
  if(k==='Escape'&&!$('scrim').hidden){closeSheet();return}
  const tag=(e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='select'||tag==='textarea'||!$('settings').hidden||!$('scrim').hidden)return;
  if(!isDoc())return;
  if(ctrl&&k.toLowerCase()==='z'){e.preventDefault();undo();return}
  if(ctrl&&(k==='='||k==='+'||k===';')){e.preventDefault();zoomBy(1.2);return}
  if(ctrl&&k==='-'){e.preventDefault();zoomBy(1/1.2);return}
  if(ctrl&&k==='0'){e.preventDefault();S.fit=prefs.fit;render();return}
  if(ctrl||e.altKey)return;
  const sel=hasSel();
  if(sel&&/^[1-4]$/.test(k)){e.preventDefault();addMark('hl',+k-1);return}
  if(sel&&(k==='m'||k==='M')){e.preventDefault();addMark('hl',prefs.markCi,{memo:true});return}
  if(sel&&(k==='u'||k==='U')){e.preventDefault();addMark('ul',prefs.markCi);return}
  if(sel&&(k==='t'||k==='T')){e.preventDefault();translateSel();return}
  if(k==='ArrowRight'||k==='ArrowDown'&&S.fit==='page'||k==='PageDown'||k===' '){e.preventDefault();go(S.page+1)}
  else if(k==='ArrowLeft'||k==='ArrowUp'&&S.fit==='page'||k==='PageUp'){e.preventDefault();go(S.page-1)}
  else if(k==='Home'){e.preventDefault();go(1)}else if(k==='End'){e.preventDefault();go(S.pdf.numPages)}
  else if(k==='Escape'){
    if(!$('trPop').hidden)hideTr();
    else if(anyFloatOpen()||sel){hideAllFloats();clearSel()}
    else if(!isFull)showHome();
  }
  else if(k==='v')setTool('select');else if(k==='p')setTool('pen');else if(k==='h')setTool('hl');else if(k==='e')setTool('eraser');
  else if(k==='b')$('bmBtn').click();else if(k==='g'){e.preventDefault();$('pageInput').focus()}
  else if(k==='f')app.classList.toggle('hidebars');
});

/* ===================== PC間の同期 =====================
   同期フォルダの中で、このPCは自分の meta/notes ファイルにだけ書く。
   読むときは全PCのファイルを合わせ、項目ごとに「最後に変更した方」を採用する。
   消した項目は「消した時刻」を残すので、他のPCで復活しない。 */
const SYNC={on:false,dev:null,cfg:null,busy:false,queued:false,last:0,err:'',dirty:new Set(),timer:0,due:0,
  written:{},cache:{},seen:{},newThumbs:[]};
function normNotes(n){
  let ch=false;n.marks=n.marks||{};n.strokes=n.strokes||{};n.bookmarks=n.bookmarks||[];if(!n.dead){n.dead={};ch=true}
  for(const k of ['marks','strokes'])for(const arr of Object.values(n[k]))for(const it of arr){if(!it.id){it.id=newId();ch=true}if(!it.u){it.u=it.at||1;ch=true}}
  for(const b of n.bookmarks){if(!b.id){b.id=newId();ch=true}if(!b.u){b.u=b.at||1;ch=true}}
  return ch;
}
async function hashKey(buf){const h=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32)}
function removedTomb(){return lsGet('yohaku:removed',{})}
function setRemovedTomb(t){lsSet('yohaku:removed',t)}
async function removeLocal(m,propagate){
  if(S.id===m.id)await showHome();
  const ru=Date.now();
  if(m.key){const t=removedTomb();t[m.key]=ru;setRemovedTomb(t)}
  await DB.del('meta',m.id);await DB.del('blobs',m.id);await DB.del('notes',m.id);
  if(propagate&&SYNC.on&&m.key){
    try{await N.syncList();await writeOwn(m.key,'meta',{file:m.name,removed:true,ru});await N.syncDeletePdf(m.key)}catch(e){SYNC.dirty.add(m.key)}
  }
}
// 項目ごとに新しい方を採用して合わせる(同じ時刻ならこのPCの物を残す)
function mergeNotes(local,others){
  const best=new Map(),dead={};
  const take=(kind,page,it)=>{const u=it.u||0,b=best.get(it.id);if(!b||u>b.u)best.set(it.id,{kind,page,it,u})};
  for(const st of [local,...others]){
    if(!st)continue;
    for(const kind of ['marks','strokes'])for(const [p,arr] of Object.entries(st[kind]||{}))for(const it of (arr||[]))if(it&&it.id)take(kind,p,it);
    for(const b of st.bookmarks||[])if(b&&b.id)take('bookmarks',null,b);
    for(const [id,u] of Object.entries(st.dead||{}))if(!(dead[id]>=u))dead[id]=u;
  }
  const out={id:local.id,marks:{},strokes:{},bookmarks:[],dead};
  for(const {kind,page,it,u} of best.values()){
    if((dead[it.id]||0)>=u)continue;
    if(kind==='bookmarks')out.bookmarks.push(it);else(out[kind][page]||(out[kind][page]=[])).push(it);
  }
  for(const arr of Object.values(out.marks))arr.sort((a,b)=>(a.at||0)-(b.at||0));
  for(const arr of Object.values(out.strokes))arr.sort((a,b)=>(a.u||0)-(b.u||0));
  out.bookmarks.sort((a,b)=>a.page-b.page||(a.at||0)-(b.at||0));
  return out;
}
function notesSig(n){
  const a=[];
  for(const k of ['marks','strokes'])for(const [p,arr] of Object.entries(n[k]||{}))for(const it of arr)a.push(k[0]+p+':'+it.id+':'+(it.u||0));
  for(const b of n.bookmarks||[])a.push('b'+b.id+':'+(b.u||0));
  for(const [id,u] of Object.entries(n.dead||{}))a.push('d'+id+':'+u);
  return a.sort().join('|');
}
async function writeOwn(key,kind,body){
  const str=JSON.stringify(body);
  if(SYNC.written[key+kind]===str)return;
  const r=await N.syncWriteJson(key,kind,Object.assign({v:1,dev:SYNC.dev.id,pc:SYNC.dev.name,at:Date.now()},body));
  if(r&&r.error)throw new Error(r.error);
  SYNC.written[key+kind]=str;
}
async function readRemote(key,f){
  const ck=key+'/'+f.n,sig=f.s+':'+f.t,c=SYNC.cache[ck];
  if(c&&c.sig===sig)return c.obj;
  const obj=await N.syncReadJson(key,f.n);
  if(obj){SYNC.cache[ck]={sig,obj};return obj}
  return c?c.obj:null; // 同期の途中で読めなければ、前回読めた内容を使う
}
function syncDirty(meta,delay){
  if(!meta||!meta.key)return;
  SYNC.dirty.add(meta.key);
  if(!SYNC.on)return;
  const due=Date.now()+delay;if(SYNC.due&&SYNC.due<=due)return;
  clearTimeout(SYNC.timer);SYNC.due=due;SYNC.timer=setTimeout(()=>{SYNC.due=0;syncRun()},delay);
}
let libChanged=false;
async function syncRun(){
  if(!SYNC.on)return;
  if(SYNC.busy){SYNC.queued=true;return}
  SYNC.busy=true;SYNC.queued=false;updateSyncBadge();libChanged=false;
  try{
    // 指紋がまだない本(以前のバージョンで追加した物)に付ける
    for(const m of await DB.all('meta'))if(!m.key){
      const b=await DB.get('blobs',m.id);if(!b)continue;
      m.key=await hashKey(b.data);if(!m.ru)m.ru=m.added||1;await DB.put('meta',m);
      if(S.meta&&S.meta.id===m.id){S.meta.key=m.key;S.meta.ru=m.ru}
    }
    const list=await N.syncList();
    if(!list)throw new Error('同期がオフです');
    if(list.error){if(list.auth){try{applySyncInfo(await N.syncConfig())}catch(e){}
      if(!SYNC.authWarned){SYNC.authWarned=true;toast('Googleのログインが切れました。設定の「同期」からログインし直してください')}}throw new Error(list.error)}
    const remote=new Map(list.map(x=>[x.key,x.files]));
    const locals=new Map();for(const m of await DB.all('meta'))if(m.key)locals.set(m.key,S.meta&&S.meta.id===m.id?S.meta:m);
    const tomb=removedTomb();
    const keys=new Set([...remote.keys(),...locals.keys(),...Object.keys(tomb)]);
    const dirty=new Set(SYNC.dirty);SYNC.dirty.clear();
    for(const key of keys){
      const files=remote.get(key)||[];
      const sig=files.filter(f=>!f.n.endsWith('.'+SYNC.dev.id+'.json')).map(f=>f.n+':'+f.s+':'+f.t).sort().join('|');
      const firstTime=!SYNC.written[key+'meta'];
      if(!firstTime&&!dirty.has(key)&&SYNC.seen[key]===sig)continue;
      try{await syncDoc(key,files,locals.get(key));SYNC.seen[key]=sig}
      catch(e){console.error(e);SYNC.dirty.add(key);if(/インターネット|ログイン|Google/.test(e.message||''))throw e}
    }
    if(SYNC.err)toast('同期を再開しました');
    SYNC.last=Date.now();SYNC.err='';
  }catch(e){SYNC.err=e&&e.message?e.message:'同期できませんでした'}
  SYNC.busy=false;updateSyncBadge();
  if(libChanged){await loadMetas();if(!home.hidden)renderHome();if(prefs.ltab==='files'||!isDoc())renderLeft()}
  if(SYNC.newThumbs.length)makeThumbsLater();
  if(!$('settings').hidden&&setTab==='sync')renderSettings();
  if(!SYNC.err&&(SYNC.queued||SYNC.dirty.size)){SYNC.queued=false;setTimeout(syncRun,800)}
}
async function syncDoc(key,files,lm){
  const own=SYNC.dev.id,others=files.filter(f=>!f.n.endsWith('.'+own+'.json'));
  const pdf=files.find(f=>f.n==='doc.pdf');
  const rmeta=(await Promise.all(others.filter(f=>f.n.startsWith('meta.')).map(f=>readRemote(key,f)))).filter(Boolean);
  const tomb=removedTomb()[key];
  const mine=lm?{removed:false,ru:lm.ru||lm.added||1,file:lm.name,page:lm.page||1,pu:lm.pu||0}:(tomb?{removed:true,ru:tomb}:null);
  const cands=[mine,...rmeta].filter(Boolean);if(!cands.length)return;
  const win=cands.reduce((a,b)=>(b.ru||0)>(a.ru||0)?b:a);
  // 削除が一番新しい → このPCからも削除
  if(win.removed){
    if(lm){const wasOpen=S.id===lm.id;await removeLocal(lm,false);libChanged=true;if(wasOpen)toast('別のPCで本棚から削除されたため閉じました')}
    else if(!tomb){const t=removedTomb();t[key]=win.ru;setRemovedTomb(t)}
    await writeOwn(key,'meta',{file:win.file||'',removed:true,ru:win.ru});
    return;
  }
  let local=lm;
  if(!local){
    // 他のPCで追加されたPDFを受け取る(同期が終わっていなければ次回)
    if(!pdf)return;
    const r=await N.syncReadPdf(key);if(!r||!r.data)return;
    const u8=r.data instanceof Uint8Array?r.data:new Uint8Array(r.data);
    const ab=u8.buffer.slice(u8.byteOffset,u8.byteOffset+u8.byteLength);
    const named=rmeta.find(x=>x.file&&!x.removed);const name=(named&&named.file)||'PDF.pdf';
    let id=name+'|'+ab.byteLength;const clash=await DB.get('meta',id);if(clash&&clash.key!==key)id+='|'+key.slice(0,6);
    local={id,name,size:ab.byteLength,page:1,pu:0,pages:(named&&named.pages)||0,thumb:null,added:Date.now(),opened:0,key,ru:win.ru};
    await DB.put('blobs',{id,data:ab});await DB.put('meta',local);
    if(tomb){const t=removedTomb();delete t[key];setRemovedTomb(t)}
    libChanged=true;SYNC.newThumbs.push(id);
  }else if(!pdf){
    const b=await DB.get('blobs',local.id);if(b){const w=await N.syncWritePdf(key,b.data);if(w&&w.error)throw new Error(w.error)}
  }
  const isOpen=S.id===local.id&&!!S.notes;
  // 読んだページ: 最後にめくったPCの位置に合わせる(開いている本は動かさない)
  let metaCh=false;
  if((win.ru||0)>(local.ru||0)){local.ru=win.ru;metaCh=true}
  const pw=rmeta.reduce((a,b)=>(b.pu||0)>(a.pu||0)?b:a,{pu:local.pu||0});
  if(!isOpen&&(pw.pu||0)>(local.pu||0)&&pw.page){local.page=pw.page;local.pu=pw.pu;metaCh=true;libChanged=true}
  if(!local.pages&&pw.pages){local.pages=pw.pages;metaCh=true}
  if(metaCh&&!isOpen)await DB.put('meta',local);
  if(metaCh&&isOpen)saveMeta();
  // 注釈を合わせる
  const rnotes=(await Promise.all(others.filter(f=>f.n.startsWith('notes.')).map(f=>readRemote(key,f)))).filter(Boolean);
  let ln=isOpen?S.notes:((await DB.get('notes',local.id))||{id:local.id,strokes:{},marks:{},bookmarks:[],dead:{}});
  if(normNotes(ln)&&!isOpen)await DB.put('notes',ln);
  if(rnotes.length){
    const merged=mergeNotes(ln,rnotes);
    if(notesSig(merged)!==notesSig(ln)){
      if(isOpen){
        if(annoEditing()){SYNC.queued=true;SYNC.dirty.add(key)} // メモを書いている途中は待つ
        else{applyToOpen(merged);ln=S.notes}
      }else{await DB.put('notes',merged);ln=merged}
    }
  }
  await writeOwn(key,'meta',{file:local.name,size:local.size,pages:local.pages||0,page:local.page||1,pu:local.pu||0,removed:false,ru:local.ru||local.added||1});
  await writeOwn(key,'notes',{marks:ln.marks,strokes:ln.strokes,bookmarks:ln.bookmarks,dead:ln.dead||{}});
}
function applyToOpen(merged){
  const n=S.notes;n.marks=merged.marks;n.strokes=merged.strokes;n.bookmarks=merged.bookmarks;n.dead=merged.dead;
  DB.put('notes',n).catch(()=>{});
  if(annoMark&&!allMarks().some(x=>x.m===annoMark))hideAnno();
  drawMarks();drawInk();renderRight();updateStatus();updateBmBtn();if(prefs.ltab==='bm')renderLeft();
}
let thumbing=false;
async function makeThumbsLater(){
  if(thumbing)return;thumbing=true;
  while(SYNC.newThumbs.length){
    const id=SYNC.newThumbs.shift();
    try{
      const m=await DB.get('meta',id),b=await DB.get('blobs',id);if(!m||!b||m.thumb)continue;
      const doc=await pdfjsLib.getDocument({data:new Uint8Array(b.data),cMapUrl:CMAP,cMapPacked:true,standardFontDataUrl:FONTS}).promise;
      const p=await doc.getPage(1);const v0=p.getViewport({scale:1});const vp=p.getViewport({scale:300/v0.width});
      const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
      await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      m.thumb=c.toDataURL('image/jpeg',.72);m.pages=m.pages||doc.numPages;await DB.put('meta',m);doc.destroy();
    }catch(e){}
  }
  thumbing=false;await loadMetas();if(!home.hidden)renderHome();
}
// 同期の状態をリボンに表示
function updateSyncBadge(){
  const b=$('rbSync');b.hidden=!SYNC.on&&!SYNC.err;
  b.classList.toggle('busy',SYNC.busy);b.classList.toggle('err',!!SYNC.err&&!SYNC.busy);
  const t=SYNC.last?new Date(SYNC.last).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'';
  b.title=SYNC.err?'同期できません: '+SYNC.err:SYNC.busy?'同期中…':t?'同期済み（'+t+'）':'同期';
}
$('rbSync').onclick=()=>openSettings('sync');
function applySyncInfo(c){if(!c)return;SYNC.cfg=c;SYNC.dev=c.device;SYNC.on=!!c.enabled;updateSyncBadge()}
async function syncInit(){
  try{applySyncInfo(await N.syncConfig())}catch(e){}
  if(SYNC.on)syncRun();
  else if(SYNC.cfg&&SYNC.cfg.loginError){SYNC.err=SYNC.cfg.loginError;updateSyncBadge();openSettings('sync')}
}
N.onSyncChanged&&N.onSyncChanged(()=>{setTimeout(syncRun,300)});
// 15秒ごとにドライブを確認(変化がなければ一覧を1回見るだけ)
setInterval(()=>{if(SYNC.on&&!document.hidden)syncRun()},15000);
window.addEventListener('focus',()=>{if(SYNC.on&&Date.now()-SYNC.last>4000)syncRun()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&SYNC.on&&Date.now()-SYNC.last>4000)syncRun()});
// 閉じる前(iPadでは画面を離れる前)に保存と同期を済ませる
N.onClosing&&N.onClosing(async()=>{
  try{
    clearTimeout(notesT);clearTimeout(metaT);
    if(S.notes)await DB.put('notes',S.notes);if(S.meta)await DB.put('meta',S.meta);
    if(SYNC.on&&SYNC.dirty.size){
      for(let i=0;i<30&&SYNC.busy;i++)await new Promise(r=>setTimeout(r,100));
      clearTimeout(SYNC.timer);SYNC.due=0;await syncRun();
    }
  }catch(e){}
  N.closingDone&&N.closingDone();
});
function syncSettings(B){
  const c=SYNC.cfg||{},web=N.platform==='web';
  const msg=document.createElement('p');msg.className='note';msg.style.marginTop='10px';
  const err=t=>{msg.textContent=t;msg.style.color='var(--danger)'};
  const intro=document.createElement('p');intro.className='note';intro.style.cssText='font-size:13px;color:var(--muted);margin:6px 0 14px;line-height:1.8';
  intro.textContent='Googleアカウントでログインすると、Windows PCとiPadのあいだで本棚・ハイライト・メモ・手書き・しおり・読んだページが同期されます。データはあなたのGoogleドライブの「余白 同期データ」フォルダに保存され、余白はそのフォルダ以外のファイルには触れません。';
  // 1) アプリの登録情報がまだない
  if(!c.clientId||!c.hasSecret){
    B.append(intro);
    const r1=row('接続コードで設定','もう一台のPCで「接続コードをコピー」したものを貼り付けます。2台目以降のPCとiPadはこちらが簡単です。',null,true);
    const box1=document.createElement('div');box1.style.cssText='display:flex;gap:8px;width:100%';
    const code=document.createElement('input');code.className='keyin';code.id='connCode';code.placeholder='YHK1.…';code.spellcheck=false;code.autocomplete='off';
    const b1=document.createElement('button');b1.className='tb primary';b1.textContent='設定';
    b1.onclick=async()=>{const r=await N.syncSetClient({code:code.value});if(r.error)return err(r.error);applySyncInfo(r);renderSettings()};
    box1.append(code,b1);r1.append(box1);B.append(r1);
    const r2=row('最初の1台: Google Cloudの登録情報','手順書のとおりに作った「クライアントID」と「クライアント シークレット」を入力します。',null,true);
    const id=document.createElement('input');id.className='keyin';id.id='gcid';id.placeholder='xxxxxxxx.apps.googleusercontent.com';id.spellcheck=false;id.autocomplete='off';
    const sc=document.createElement('input');sc.className='keyin';sc.id='gcsec';sc.placeholder='GOCSPX-…';sc.type='password';sc.autocomplete='off';
    const b2=document.createElement('button');b2.className='tb primary';b2.textContent='保存';b2.style.alignSelf='flex-start';
    b2.onclick=async()=>{const r=await N.syncSetClient({clientId:id.value,secret:sc.value});if(r.error)return err(r.error);applySyncInfo(r);renderSettings()};
    r2.append(id,sc,b2);B.append(r2,msg);return;
  }
  // 2) ログインがまだ
  if(!c.signedIn){
    B.append(intro);
    const b=document.createElement('button');b.className='tb primary';b.style.cssText='height:36px;padding:0 18px';b.textContent='Googleでログイン';
    b.onclick=async()=>{b.disabled=true;b.textContent=web?'Googleへ移動中…':'ブラウザでログインしてください…';msg.textContent='';
      const r=await N.syncLogin();b.disabled=false;b.textContent='Googleでログイン';
      if(!r)return; if(r.error)return err(r.error);
      applySyncInfo(r);SYNC.err='';SYNC.written={};SYNC.seen={};SYNC.cache={};renderSettings();toast('ログインしました。同期を始めます');syncRun()};
    const reset=document.createElement('button');reset.className='tb ghost';reset.textContent='登録情報を入れ直す';
    reset.onclick=async()=>{applySyncInfo(await N.syncSetClient({clientId:'',secret:'',clear:true}));renderSettings()};
    const box=document.createElement('div');box.style.cssText='display:flex;gap:8px;flex-wrap:wrap';box.append(b,reset);
    B.append(box,msg);
    const p=document.createElement('p');p.className='note';p.style.marginTop='14px';
    p.textContent=web?'Googleのページに移動します。ログインして「許可」を押すと、余白に戻ります。':'ブラウザでGoogleのページが開きます。ログインして「許可」を押したら、余白に戻ってください。';
    B.append(p);return;
  }
  // 3) ログイン済み
  B.append(row('同期する','オフにすると、この端末はGoogleドライブを読み書きしません。データはそのまま残ります。',toggle(SYNC.on,async v=>{
    applySyncInfo(await N.syncEnable(v));if(SYNC.on)syncRun();renderSettings()})));
  const out=document.createElement('button');out.className='tb';out.textContent='ログアウト';
  out.onclick=()=>confirmSheet('ログアウト','この端末の同期を止めます。本棚やメモはこの端末に残り、Googleドライブのデータもそのままです。','ログアウト',async()=>{applySyncInfo(await N.syncLogout());SYNC.err='';updateSyncBadge();renderSettings()});
  B.append(row('Googleアカウント',(c.name?c.name+'\n':'')+(c.email||'ログイン済み'),out));
  const t=SYNC.last?new Date(SYNC.last).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'まだ同期していません';
  const now=document.createElement('button');now.className='tb';now.textContent=SYNC.busy?'同期中…':'今すぐ同期';now.disabled=SYNC.busy||!SYNC.on;
  now.onclick=async()=>{now.textContent='同期中…';now.disabled=true;await syncRun();renderSettings();toast(SYNC.err?'同期できませんでした':'同期しました')};
  B.append(row('状態',SYNC.err?'同期できません: '+SYNC.err:!SYNC.on?'オフ':'最終同期: '+t,now));
  if(N.syncConnectCode){
    const cp=document.createElement('button');cp.className='tb';cp.textContent='接続コードをコピー';
    cp.onclick=async()=>{const code=await N.syncConnectCode();try{await navigator.clipboard.writeText(code);toast('接続コードをコピーしました')}catch(e){toast('コピーできませんでした')}};
    B.append(row('ほかの端末を追加','iPadや別のPCの「同期」設定に、この接続コードを貼り付けてからログインします。コードには余白の登録情報が入っているので、他人には渡さないでください。',cp));
  }
  B.append(row(web?'この端末の名前':'このPCの名前',(SYNC.dev?SYNC.dev.name:'')));
  const p=document.createElement('p');p.className='note';p.style.cssText='margin-top:18px;line-height:1.8;white-space:pre-line';
  p.textContent='同期されるもの: 本棚のPDF、ハイライト、メモ、手書き、しおり、読んだページ、本棚からの削除。\n同期されないもの: 外観や翻訳などの設定。\n反映までの時間: 数秒〜15秒ほど。画面を開き直したときにもすぐ確認します。\n同じメモを2台で同時に書き換えた場合は、後から保存した方が残ります。';
  B.append(p);
}

/* ===================== Windows向け ===================== */
N.onOpenFiles&&N.onOpenFiles(list=>{dbReady.then(()=>addFiles(list.map(f=>new File([f.data],f.name,{type:'application/pdf'}))))});
let isFull=false,barT=0;
N.onFullscreen&&N.onFullscreen(on=>{isFull=on;app.classList.toggle('focus',on);app.classList.toggle('hidebars',on)});
$('fsBtn').onclick=()=>N.toggleFullscreen&&N.toggleFullscreen();
document.addEventListener('mousemove',e=>{
  if(!isFull||!isDoc())return;
  const near=e.clientY<60||e.clientY>innerHeight-70;
  if(near){app.classList.remove('hidebars');clearTimeout(barT)}
  else if(!app.classList.contains('hidebars')&&!anyFloatOpen()&&!hasSel()){clearTimeout(barT);barT=setTimeout(()=>{if(isFull)app.classList.add('hidebars')},900)}
});
let wz=null,wheelAcc=0,wheelT=0,lastTurn=0,wheelLock=false,wheelLockT=0;
function zoomBy(f,cx,cy){
  const sr=stage.getBoundingClientRect(),r=pageEl.getBoundingClientRect();
  cx=cx??sr.left+sr.width/2;cy=cy??sr.top+sr.height/2;
  if(!wz){wz={ratio:1,nx:(cx-r.left)/r.width,ny:(cy-r.top)/r.height,cx:cx-sr.left,cy:cy-sr.top};pageEl.style.transformOrigin=(cx-r.left)+'px '+(cy-r.top)+'px'}
  wz.ratio=Math.max(.3/S.scale,Math.min(6/S.scale,wz.ratio*f));
  pageEl.style.transform='scale('+wz.ratio+')';hideAllFloats();
  clearTimeout(wheelT);wheelT=setTimeout(()=>{const p=wz;wz=null;pageEl.style.transform='';S.zoom=S.scale*p.ratio;S.fit='custom';render(p)},160);
}
stage.addEventListener('wheel',e=>{
  if(e.ctrlKey){e.preventDefault();zoomBy(Math.exp(-e.deltaY*0.0022),e.clientX,e.clientY);return}
  if(!prefs.wheelTurn||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  if(wheelLock){clearTimeout(wheelLockT);wheelLockT=setTimeout(()=>{wheelLock=false},180);return}
  const max=stage.scrollHeight-stage.clientHeight;
  const atBottom=stage.scrollTop>=max-1,atTop=stage.scrollTop<=1;
  if((e.deltaY>0&&atBottom)||(e.deltaY<0&&atTop)){
    if(Math.sign(wheelAcc)!==Math.sign(e.deltaY))wheelAcc=0;
    wheelAcc+=e.deltaY;
    if(Math.abs(wheelAcc)>=(max>2?220:90)&&Date.now()-lastTurn>450){
      lastTurn=Date.now();const d=wheelAcc>0?1:-1;wheelAcc=0;wheelLock=true;clearTimeout(wheelLockT);wheelLockT=setTimeout(()=>{wheelLock=false},180);
      if(d>0)go(S.page+1);else go(S.page-1,{bottom:max>2});
    }
  }else wheelAcc=0;
},{passive:false});

/* ===================== 端末に合わせた表示 ===================== */
if(!N.translate){$('trBtn').hidden=true;$('trBtn').nextElementSibling.hidden=true;document.querySelector('[data-set="tr"]').hidden=true}
if(!N.toggleFullscreen)$('fsBtn').hidden=true;
if(TOUCH)document.body.classList.add('touch');
if(N.platform==='web'){
  const e=$('homeEmpty'),sb=$('sampleBtn');e.innerHTML='';
  const b=document.createElement('b');b.textContent='まだPDFがありません';
  const t=document.createElement('div');t.textContent='「PDFを開く」から、ファイルアプリやGoogleドライブ、iCloud Driveの資料を選んでください。追加したPDFは本棚に保存され、次からはタップするだけで続きから開けます。';
  const d=document.createElement('div');d.style.marginTop='16px';d.appendChild(sb);e.append(b,t,d);
}
if(narrow()){prefs.left=false;prefs.right=false;applyPanels()}
document.body.classList.toggle('narrow',narrow());
window.addEventListener('resize',()=>document.body.classList.toggle('narrow',narrow()));
// 狭い画面ではパネルは重ねて表示。本文を触ったら閉じる
stage.addEventListener('pointerdown',()=>{if(narrow()&&(prefs.left||prefs.right)){prefs.left=false;prefs.right=false;applyPanels()}},true);
home.addEventListener('pointerdown',()=>{if(narrow()&&(prefs.left||prefs.right)){prefs.left=false;prefs.right=false;applyPanels()}},true);
/* ===================== 起動 ===================== */
renderSelDots();syncFinger();setTool('select');renderRight();
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
const dbReady=DB.open();
dbReady.then(showHome).then(syncInit).catch(()=>{$('homeGrid').innerHTML='<div class="empty">保存領域を開けませんでした。</div>'});
window.__yohaku=S; // 動作確認用
})();
