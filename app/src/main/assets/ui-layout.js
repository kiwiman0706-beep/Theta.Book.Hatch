/* 0.9.0 layout: groups existing controls so the main actions are visible at a glance.
   Controls are moved, never recreated, so every id, handler and saved preference stays as before.
   No book, NAS file, reading position or setting value is changed here. */
window.DSLayout=(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,cls,html)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(html!=null)x.innerHTML=html;return x;};
 const store={get(k){try{return localStorage.getItem(k);}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,v);}catch(e){}}};

 /* ---------- Library: chips / view + one "sort & filter" sheet ---------- */
 const toolbar=$('filters'),listTools=document.querySelector('.list-display-tools'),featureFilters=$('readingFilter')?.closest('.feature-actions'),libraryTools=document.querySelector('.library-tools');
 const controls=el('div','lib-controls');toolbar.before(controls);
 const chips=el('div','lib-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','種類で絞り込み');
 toolbar.querySelectorAll('.filter').forEach(b=>chips.appendChild(b));
 const bar=el('div','lib-bar');
 const views=listTools.querySelector('.list-view-buttons');views.classList.add('lib-views');
 const icons={grid:['▦','本棚'],list:['☰','リスト'],flow:['▱','横並び']};
 views.querySelectorAll('[data-library-view]').forEach(b=>{const [i,t]=icons[b.dataset.libraryView]||['',b.textContent];b.innerHTML=`<span class="lib-ico" aria-hidden="true">${i}</span><span>${t}</span>`;});
 const open=el('button','lib-sheet-open','<span class="lib-ico" aria-hidden="true">⇅</span><span class="lib-sort-label"></span><span class="lib-filter-count" hidden></span>');
 open.id='libraryControlsOpen';open.type='button';open.setAttribute('aria-haspopup','dialog');
 bar.append(views,open);controls.append(chips,bar);
 if(libraryTools)controls.after(libraryTools);

 const sheet=el('div','lib-sheet');sheet.id='libraryControls';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','並べ替えと絞り込み');sheet.hidden=true;
 sheet.innerHTML='<div class="lib-sheet-backdrop" data-sheet-close></div><div class="lib-sheet-panel"><div class="lib-sheet-head"><strong>並べ替え・絞り込み</strong><button type="button" class="lib-sheet-done" data-sheet-close>完了</button></div>'
  +'<section><h3>並べ替え</h3><div class="lib-field" data-slot="sort"></div><div class="lib-field lib-inline" data-slot="direction"></div><div class="lib-field" data-slot="pin"></div></section>'
  +'<section><h3>絞り込み</h3><label class="lib-field"><span>フォルダ</span><i data-slot="folder"></i></label><label class="lib-field"><span>読書状態</span><i data-slot="state"></i></label><label class="lib-field"><span>タグ</span><i data-slot="tag"></i></label></section>'
  +'<section data-section="display"><h3>表示</h3><label class="lib-field"><span>フォルダ内の表紙</span><i data-slot="density"></i></label></section>'
  +'<div class="lib-sheet-foot"><button type="button" class="lib-sheet-reset" id="libraryControlsReset">絞り込みを解除</button><button type="button" class="primary" data-sheet-close>この条件で表示</button></div></div>';
 document.body.appendChild(sheet);
 const slot=n=>sheet.querySelector(`[data-slot="${n}"]`);
 const put=(n,node)=>{if(node)slot(n).replaceWith(node);};
 const sortLabel=el('label','lib-field','<span>並べ替えの基準</span>');sortLabel.appendChild($('sort'));put('sort',sortLabel);
 const dirLabel=el('label','lib-field','<span>順番</span>');dirLabel.appendChild($('sortDirection'));put('direction',dirLabel);
 put('pin',$('pinReading')?.closest('label'));$('pinReading')?.closest('label')?.classList.add('lib-check');
 put('folder',$('folderFilter'));put('state',$('readingFilter'));put('tag',$('tagFilter'));put('density',$('coverDensity'));
 // "全フォルダへ" duplicated "本棚ホーム"; keep the element for older wrappers but out of the way.
 if($('allFolders'))$('allFolders').hidden=true;
 [toolbar,listTools,featureFilters].forEach(x=>{if(x&&!x.querySelector('button:not([hidden]),select,input'))x.hidden=true;});

 let lastFocus=null;
 function openSheet(){lastFocus=document.activeElement;sheet.hidden=false;document.body.classList.add('lib-sheet-visible');sync();requestAnimationFrame(()=>sheet.querySelector('.lib-sheet-done')?.focus());}
 function closeSheet(){if(sheet.hidden)return false;sheet.hidden=true;document.body.classList.remove('lib-sheet-visible');try{lastFocus?.focus?.();}catch(e){}return true;}
 open.onclick=openSheet;
 sheet.addEventListener('click',e=>{if(e.target.closest('[data-sheet-close]'))closeSheet();});
 sheet.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeSheet();}});
 $('libraryControlsReset').onclick=()=>{const c=$('clearLibraryFilters');if($('folderFilter')){$('folderFilter').value='';$('folderFilter').dispatchEvent(new Event('change'));}if(c)c.click();sync();};
 const back=window.dsbooksHandleBack;window.dsbooksHandleBack=()=>closeSheet()||back();

 function activeFilterCount(){let n=0;if($('folderFilter')?.value)n++;if(($('readingFilter')?.value||'all')!=='all')n++;if($('tagFilter')?.value.trim())n++;return n;}
 function sync(){
  const s=$('sort'),label=s?.selectedOptions[0]?.textContent||'並べ替え',dir=$('sortDirection')?.value==='asc'?'↑':'↓';
  open.querySelector('.lib-sort-label').textContent=label+' '+dir;
  const n=activeFilterCount(),badge=open.querySelector('.lib-filter-count');badge.hidden=!n;badge.textContent='絞り込み '+n;
  open.setAttribute('aria-label',`並べ替え：${label}${dir==='↑'?'昇順':'降順'}${n?'、絞り込み'+n+'件':''}。変更する`);
  sheet.querySelector('[data-section="display"]').hidden=!!$('coverDensity')?.hidden;
 }
 ['sort','sortDirection','folderFilter','readingFilter'].forEach(id=>$(id)?.addEventListener('change',sync));$('tagFilter')?.addEventListener('input',sync);
 const baseRender=render;render=function(){const r=baseRender.apply(this,arguments);try{sync();}catch(e){}return r;};
 sync();

 /* ---------- Dialogs: one clear primary action, secondary actions as labelled tiles ---------- */
 const tileIcons={workMemo:'✎',workFavorite:'★',splitWork:'#',favoriteBook:'★',metadataBook:'#',bookNotes:'⚑',shareFile:'↗',exportFile:'⇩',workFiles:'❐',
  importBooks:'＋',launchTailscale:'⇄',openDownloadManager:'↓',exportReading:'⇧',importReading:'⇩',settingsSleep:'☾',selfTest:'✓',pinCoverWidget:'▦',pinListWidget:'☰',systemCast:'▭',
  focusReader:'⛶',searchChapter:'⌕',sleepReader:'☾',shareReader:'↗',exportReader:'⇩',stopReaderSpeech:'■'};
 function decorate(root){
  root.querySelectorAll('button[id]').forEach(b=>{let i=tileIcons[b.id];if(!i||b.dataset.icon)return;
   // Favourite labels already start with ☆/★; show it once, as the tile picture.
   const m=b.textContent.match(/^\s*([☆★])\s*/);if(m){i=m[1];b.textContent=b.textContent.slice(m[0].length);}b.dataset.icon=i;});
  root.querySelectorAll('.work-asset').forEach(row=>{row.classList.add('asset-card');const open=row.querySelector('[data-open]');if(open)open.classList.add('asset-main');row.querySelector('[data-share]')?.setAttribute('data-icon','↗');row.querySelector('[data-more]')?.setAttribute('data-icon','⋯');});
  root.querySelectorAll('.feature-actions').forEach(a=>{const bs=[...a.children].filter(x=>x.tagName==='BUTTON'&&!x.hidden);if(bs.length>=2&&bs.every(b=>b.dataset.icon))a.classList.add('action-tiles');});
  const sheetEl=root.querySelector('.feature-sheet');const h2=sheetEl?.querySelector(':scope>h2');
  if(h2&&/^設定/.test(h2.textContent))groupSettings(sheetEl);
 }
 const modal=$('modal');let pending=false;
 // Panels (F.panel) are appended inside #modal, so watching the modal covers every dialog.
 new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;decorate(modal);});}).observe(modal,{childList:true,subtree:true});

 /* ---------- Settings: shortcuts on top, everything else in labelled groups ---------- */
 const groups=[
  ['display','表示と読書','画面の消灯、シリーズのまとめ方、スリープ','Aa',/^(再生|表示)/],
  ['sync','同期とバックアップ','NAS自動同期、読書データの書き出し／取り込み','⟳',/(読書データ|同期)/],
  ['storage','保存先と容量','端末に保存した本、SDカード','▣',/(保存|容量)/],
  ['devices','ウィジェット・TV・車','ホーム画面、Android Auto、テレビ','▭',/(ウィジェット|TV|テレビ|Auto)/],
  ['about','診断と情報','セルフテスト、使用ライブラリ','ⓘ',/(診断|ライセンス|まとめ方)/],
  ['other','その他','','…',/.*/]];
 function group(sheetEl,key){
  let d=sheetEl.querySelector(`:scope>details[data-group="${key}"]`);if(d)return d.querySelector('.settings-body');
  const g=groups.find(x=>x[0]===key);d=el('details','settings-group');d.dataset.group=key;
  d.innerHTML=`<summary><span class="settings-ico" aria-hidden="true">${g[3]}</span><span class="settings-title"><b>${g[1]}</b>${g[2]?'<small>'+g[2]+'</small>':''}</span></summary><div class="settings-body"></div>`;
  // 'all' keeps every group expanded (used by regression tests that drive controls directly).
  const all=store.get('dsbooks.settingsOpen')==='all';d.open=all||store.get('dsbooks.settingsOpen')===key;
  d.addEventListener('toggle',()=>{if(d.open&&store.get('dsbooks.settingsOpen')!=='all'){store.set('dsbooks.settingsOpen',key);sheetEl.querySelectorAll(':scope>details.settings-group').forEach(o=>{if(o!==d)o.open=false;});}});
  // Keep group order stable however late a section is appended.
  const order=groups.map(x=>x[0]),after=[...sheetEl.querySelectorAll(':scope>details.settings-group')].find(o=>order.indexOf(o.dataset.group)>order.indexOf(key));
  sheetEl.insertBefore(d,after||null);return d.querySelector('.settings-body');
 }
 const classify=text=>(groups.find(g=>g[4].test(text||''))||groups.at(-1))[0];
 function groupSettings(sheetEl){
  sheetEl.classList.add('settings-sheet');
  if(!sheetEl.querySelector(':scope>.settings-quick')){
   const quick=el('div','settings-quick');quick.setAttribute('role','group');quick.setAttribute('aria-label','よく使う操作');
   const tile=(icon,label,run,id)=>{const b=el('button','quick-tile',`<span aria-hidden="true">${icon}</span><b>${label}</b>`);b.type='button';if(id)b.id=id;b.onclick=run;return b;};
   const importBtn=$('importBooks'),tail=$('launchTailscale');
   quick.append(tile('＋','本を追加',()=>importBtn?.click(),'quickImport'),tile('⟳','今すぐ同期',()=>{const r=$('runNasSync');if(r)r.click();else window.DSBooksSync?.run?.();},'quickSync'),tile('↓','ダウンロード',()=>window.DSDownloads?.open(),'quickDownloads'),tile('⇄','Tailscale',()=>tail?.click(),'quickTailscale'),tile('✔','Secure SignIn',()=>window.DSBooksNative?.openSecureSignIn?.(),'quickSecureSignIn'),tile('✓','セルフテスト',()=>$('selfTest')?.click(),'quickSelfTest'));
   const first=importBtn?.closest('.feature-actions');if(first){first.hidden=true;}
   sheetEl.querySelector(':scope>h2').after(quick);
  }
  // The same-name grouping switch belongs with display options, even though it shares a block with diagnostics.
  const same=$('groupSameFiles')?.closest('label');if(same&&!same.closest('details')){const h=same.parentElement?.querySelector(':scope>h3');if(h&&/診断/.test(h.textContent))h.textContent='診断';group(sheetEl,'display').appendChild(same);}
  let current='display';
  for(const node of [...sheetEl.children]){
   if(node.tagName==='H2'||node.tagName==='BUTTON'&&node.classList.contains('close')||node.classList.contains('settings-quick')||node.tagName==='DETAILS'||node.hidden&&node.classList.contains('feature-actions'))continue;
   const heading=node.tagName==='H3'?node:node.querySelector?.('h3');
   if(heading)current=classify(heading.textContent);
   if(node.querySelector?.('#settingsSleep')||node.id==='settingsSleep')current='display';
   group(sheetEl,current).appendChild(node);
  }
  // Section headings that only repeat the group title are noise inside a group.
  sheetEl.querySelectorAll('.settings-body').forEach(b=>{const h=b.querySelector(':scope>h3:first-child');if(h&&h.textContent.trim()===b.closest('details').querySelector('summary b').textContent)h.remove();});
 }
 return {openSheet,closeSheet,sync,decorate};
})();
