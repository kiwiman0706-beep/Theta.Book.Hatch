/* 1.1 Theta Hatch migration (Theta.Hatch.Series docs/MIGRATION.md §3) and updates through the hub (spec §6.1).
   Export (bridge version, old id): every dsbooks.* item of this page (library, bookIds, positions, bookmarks,
   notes, settings, NAS folders) + NAS address/account. Never the password, SID or API keys; never book files.
   Import (new app): merge without losing what is already here; downloaded files are not carried over, so those books
   go back to "on the NAS" (same bookId, same reading position) and are downloaded again when opened. */
window.DSMigrate=(()=>{
 'use strict';
 const $=id=>document.getElementById(id),N=()=>window.DSBooksNative||{},esc=s=>escapeHtml(s);
 const SKIP=new Set(['dsbooks.downloads','dsbooks.downloadState','dsbooks.downloadHistory']); // device file tokens: meaningless in another app
 function collect(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('dsbooks.')&&!SKIP.has(k))out[k]=localStorage.getItem(k);}return out;}
 function counts(store){let list=[];try{list=JSON.parse(store['dsbooks.catalog']||'[]');}catch(e){}
  const books=list.filter(b=>b&&!b.jisuiOf),reading=books.filter(b=>b.progress>0).length;
  const notes=books.reduce((n,b)=>n+(Array.isArray(b.annotations)?b.annotations.filter(a=>!a.deleted).length:0),0);
  return {books:books.length,reading,notes,keys:Object.keys(store).length};}
 const panel=html=>showModal('<button class="close">×</button><div class="feature-sheet migrate-sheet">'+html+'</div>');

 /* ---------- export (bridge version) ---------- */
 function exportScreen(hub){
  const store=collect(),c=counts(store);
  panel(`<h2>新しいアプリへ移る</h2>
   <p class="feature-hint">DSBooks は Theta Book Hatch（新しいアプリ）に変わります。${hub?'Theta Home Hatch に':'ファイルに'}、この端末の記録を書き出します。</p>
   <ul class="migrate-list"><li>本棚の一覧：${c.books}冊（読みかけ ${c.reading}冊）</li><li>読書位置・栞とメモ ${c.notes}件・読了・表示の設定</li><li>NAS の接続先とアカウント名、共有フォルダの設定</li></ul>
   <p class="feature-hint">入れないもの：NAS のパスワード（新しいアプリで入れ直すか、Home の共通設定から）、Gemini の API キー、端末に保存した本のファイル（新しいアプリで NAS から取り直します。読書位置はそのまま）。</p>
   <div class="feature-actions"><button class="primary" id="migrateExport">書き出す</button>${hub?'<button class="secondary" id="migrateCancel">やめる</button>':''}</div><p class="feature-hint" id="migrateStatus" aria-live="polite"></p>`);
  $('migrateExport').onclick=()=>{$('migrateExport').disabled=true;$('migrateStatus').textContent='書き出しています…';N().migrationExport?.(JSON.stringify(store));};
  if($('migrateCancel'))$('migrateCancel').onclick=()=>{closeModal();N().migrationCancel?.();};
 }
 function saved(ok){const s=$('migrateStatus');if(s)s.textContent=ok?'保存しました。新しいアプリの「前の DSBooks から読み込む」で、このファイルを選んでください。':'保存できませんでした';if($('migrateExport'))$('migrateExport').disabled=false;if(ok)toast('書き出しました');}
 function failed(msg){const s=$('migrateStatus');if(s)s.textContent=msg;if($('migrateExport'))$('migrateExport').disabled=false;}

 /* ---------- import (new app) ---------- */
 function merge(store){
  let mine=[],theirs=[];try{mine=JSON.parse(localStorage.getItem('dsbooks.catalog')||'[]');}catch(e){}try{theirs=JSON.parse(store['dsbooks.catalog']||'[]');}catch(e){}
  if(!Array.isArray(mine))mine=[];
  // Files saved by the old app are not here: those entries keep their bookId and position but are "not downloaded".
  const strip=b=>({...b,localName:b.remote?null:b.localName,offline:false});
  const key=b=>String(b.bookId||b.id),byKey=new Map(mine.filter(b=>typeof b.id!=='number').map(b=>[key(b),b]));
  let added=0,updated=0;
  for(const t of theirs){if(!t||t.jisuiOf)continue;const k=key(t),m=byKey.get(k);
   if(!m){byKey.set(k,strip(t));added++;continue;}
   // Notes and bookmarks: union by id (the newer edit wins); position and progress: the more recently read side.
   const notes=new Map();for(const a of [...(m.annotations||[]),...(t.annotations||[])]){const o=notes.get(a.id);if(!o||(Number(a.updatedAt)||0)>(Number(o.updatedAt)||0))notes.set(a.id,a);}
   if((Number(t.lastReadAt)||0)>(Number(m.lastReadAt)||0)){Object.assign(m,{...strip(t),localName:m.localName,offline:m.offline});updated++;}
   m.annotations=[...notes.values()];}
  localStorage.setItem('dsbooks.catalog',JSON.stringify([...byKey.values()]));
  for(const [k,v] of Object.entries(store)){if(k==='dsbooks.catalog'||SKIP.has(k)||!k.startsWith('dsbooks.'))continue;if(localStorage.getItem(k)==null)localStorage.setItem(k,v);}
  return {added,updated};
 }
 function importScreen(info){
  if(info.error){panel(`<h2>前の DSBooks から読み込む</h2><p class="feature-hint">${esc(info.error)}</p><div class="feature-actions"><button class="secondary" id="migrateClose">閉じる</button></div>`);$('migrateClose').onclick=()=>{closeModal();N().migrationImportDone?.(false,info.error);};return;}
  const p=info.payload,c=counts(p.storage),from=p.manifest?.from||{},nas=p.nas||{};
  panel(`<h2>前の DSBooks から読み込む</h2>
   <p class="feature-hint">${esc(from.packageName||'')} ${esc(from.versionName||'')} の記録です。いまの本棚は消さずに足します（同じ本は、新しく読んだ方の位置を残します）。</p>
   <ul class="migrate-list"><li>本棚の一覧：${c.books}冊（読みかけ ${c.reading}冊）</li><li>読書位置・栞とメモ ${c.notes}件・設定</li>${nas.base?`<li>NAS：${esc(nas.base)}（${esc(nas.account||'')}）— パスワードはあとで入力</li>`:''}</ul>
   <p class="feature-hint">端末に保存していた本は、開くときに NAS から取り直します。</p>
   <div class="feature-actions"><button class="primary" id="migrateImport">読み込む</button><button class="secondary" id="migrateSkip">やめる</button></div>`);
  $('migrateImport').onclick=()=>{
   const r=merge(p.storage);
   if(nas.base){localStorage.setItem('dsbooks.host',nas.base);if(nas.account)localStorage.setItem('dsbooks.migratedAccount',nas.account);}
   localStorage.setItem('dsbooks.migratedFrom',JSON.stringify({...from,at:Date.now()}));
   toast(`読み込みました（${r.added}冊を追加、${r.updated}冊の位置を更新）`);N().migrationImportDone?.(true,'');
   setTimeout(()=>location.reload(),400); // start again with the merged library
  };
  $('migrateSkip').onclick=()=>{closeModal();N().migrationImportDone?.(false,'cancelled');};
 }
 function start(info){if(info?.mode==='export')exportScreen(!!info.hub);else if(info?.mode==='import')importScreen(info);}

 // The NAS form remembers the migrated account name (the password is entered once, or comes from the hub later).
 if(typeof openConnectModal==='function'){const o=openConnectModal;openConnectModal=function(){const r=o.apply(this,arguments);const a=localStorage.getItem('dsbooks.migratedAccount'),u=$('nasUser');if(a&&u&&!u.value)u.value=a;return r;};}

 /* ---------- settings: move / import / update ---------- */
 const F=DSFeatures,settings=F.settings;
 F.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet');if(!sheet||!N().appPackageName)return;const box=document.createElement('section');
  const old=/^jp\.shinwakai\.dsbooks/.test(N().appPackageName());
  box.innerHTML=`<h3>診断と情報：引っ越し・更新</h3><div class="feature-actions">${old?'<button class="primary" id="migrateOut">新しいアプリへ移る（書き出す）</button>':'<button class="secondary" id="migrateIn">前の DSBooks から読み込む</button>'}<button class="secondary" id="appUpdate">更新を確認</button></div>
   <p class="feature-hint">${old?'Theta Home Hatch があれば、Home の「移行」から進められます。':'更新は Theta Home Hatch／KidsHome Hatch が行います（無ければ Releases ページを開きます）。'}</p>`;
  sheet.appendChild(box);
  $('migrateOut')&&($('migrateOut').onclick=()=>exportScreen(false));$('migrateIn')&&($('migrateIn').onclick=()=>N().migrationChooseImport?.());$('appUpdate').onclick=()=>N().requestUpdate?.();};
 $('settingsBtn').onclick=F.settings;$('mobileSettings').onclick=F.settings;
 return {start,saved,failed,collect,merge};
})();
