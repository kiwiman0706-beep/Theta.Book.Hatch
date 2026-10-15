/* 0.9.1 download manager. The native service runs one download at a time and queues the rest;
   this screen shows the running book, the waiting list and recent results. Book files are never touched here. */
window.DSDownloads=(()=>{
 'use strict';
 const $=id=>document.getElementById(id),esc=escapeHtml,F=DSFeatures;
 const HISTORY='dsbooks.downloadHistory';
 const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d;}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
 let queue=[];
 const native=()=>window.DSBooksNative||{};
 function state(){try{return JSON.parse(native().getDownloadState?.()||'{}');}catch(e){return {};}}
 const active=s=>['running','paused'].includes(s.state);
 const bookFor=id=>books.find(b=>String(b.id)===String(id));
 const titleFor=(id,fallback)=>bookFor(id)?.title||fallback||'本';
 function load(){const s=state();if(Array.isArray(s.queue))queue=s.queue;return s;}

 /* Top bar chip: visible only while something is saving or waiting. */
 const chip=document.createElement('button');chip.id='downloadChip';chip.className='download-chip';chip.type='button';chip.hidden=true;
 chip.onclick=()=>open();$('syncBtn')?.before(chip);

 function history(){return store.get(HISTORY,[]);}
 function remember(result){if(!result?.id)return;const list=history().filter(x=>String(x.id)!==String(result.id));
  list.unshift({id:String(result.id),title:titleFor(result.id),ok:!!result.ok,error:result.ok?'':String(result.error||''),at:Date.now()});store.set(HISTORY,list.slice(0,12));}

 function card(s){
  const pct=Math.max(0,Number(s.percent)||0),paused=s.state==='paused';
  return `<section class="dl-current"><div class="dl-label">${paused?'一時停止中':'ダウンロード中'}</div><strong>${esc(titleFor(s.id))}</strong>
   <div class="dl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
   <small>${pct}%${Number(s.total)>0?`（${formatBytes(Number(s.done)||0)} / ${formatBytes(Number(s.total))}）`:''}</small>
   <div class="feature-actions"><button class="secondary" id="dlToggle" data-icon="${paused?'▶':'Ⅱ'}">${paused?'再開':'一時停止'}</button><button class="secondary" id="dlCancel" data-icon="✕">キャンセル</button></div></section>`;
 }
 function render(){
  const box=$('downloadManager');if(!box)return;const s=load(),h=history();
  box.innerHTML=(active(s)?card(s):'<p class="feature-hint dl-idle">現在ダウンロード中の本はありません。</p>')
   +`<h3>待機中 <span class="dl-count">${queue.length}冊</span></h3>`
   +(queue.length?'<ol class="dl-list">'+queue.map((q,i)=>`<li><span class="dl-order">${i+1}</span><span class="dl-name">${esc(titleFor(q.id,q.title))}<small>${Number(q.expectedSize)>0?formatBytes(Number(q.expectedSize)):''}</small></span><button class="secondary dl-small" data-dequeue="${encodeURIComponent(q.id)}">取り消し</button></li>`).join('')+'</ol>'
    :'<p class="feature-hint">待機中の本はありません。本の詳細で「オフライン用に保存」を押すと、ここに順番に並びます。</p>')
   +(h.length?'<h3>最近の結果</h3><ul class="dl-list">'+h.map(x=>`<li class="${x.ok?'ok':'failed'}"><span class="dl-order">${x.ok?'✓':'!'}</span><span class="dl-name">${esc(titleFor(x.id,x.title))}<small>${x.ok?'保存済み':esc(x.error||'失敗')}</small></span>${x.ok?(bookFor(x.id)?.localName?`<button class="secondary dl-small" data-open="${encodeURIComponent(x.id)}">開く</button>`:''):(bookFor(x.id)?`<button class="secondary dl-small" data-retry="${encodeURIComponent(x.id)}">再試行</button>`:'')}</li>`).join('')+'</ul><button class="secondary dl-small" id="dlClearHistory">履歴を消す</button>':'');
  $('dlToggle')?.addEventListener('click',()=>native().controlDownload?.(state().state==='paused'?'resume':'pause'));
  $('dlCancel')?.addEventListener('click',()=>native().controlDownload?.('cancel'));
  box.querySelectorAll('[data-dequeue]').forEach(b=>b.onclick=()=>{const id=decodeURIComponent(b.dataset.dequeue);native().dequeueDownload?.(id);queue=queue.filter(q=>String(q.id)!==id);refresh();});
  box.querySelectorAll('[data-retry]').forEach(b=>b.onclick=()=>{const book=bookFor(decodeURIComponent(b.dataset.retry));if(book)startBookDownload(book,false);});
  box.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const book=bookFor(decodeURIComponent(b.dataset.open));if(book){closeModal();openLocalBook(book);}});
  $('dlClearHistory')?.addEventListener('click',()=>{store.set(HISTORY,[]);render();});
 }
 function open(){showModal('<button class="close">×</button><div class="feature-sheet download-sheet"><h2>ダウンロード</h2><div id="downloadManager"></div><p class="feature-hint">1冊ずつ順番に保存します。アプリを閉じても通知から操作できます。待機中の一覧はアプリを強制終了すると消えるので、その場合はもう一度追加してください。</p></div>');render();}

 /* The open detail screen shows its own place in the queue. */
 function detailStatus(){
  const st=$('downloadStatus');if(!st)return;const id=decodeURIComponent(st.dataset.bookId||''),i=queue.findIndex(q=>String(q.id)===id);
  let row=$('downloadQueued');if(i<0){row?.remove();return;}
  st.textContent=`ダウンロード待ち（${i+1}番目）。前の本が終わると自動で始まります。`;
  if(!row){row=document.createElement('div');row.id='downloadQueued';row.className='feature-actions';row.innerHTML='<button class="secondary" id="downloadQueuedManager">ダウンロード一覧</button><button class="secondary" id="downloadQueuedCancel">待ちを取り消す</button>';st.after(row);
   $('downloadQueuedManager').onclick=open;$('downloadQueuedCancel').onclick=()=>{native().dequeueDownload?.(id);queue=queue.filter(q=>String(q.id)!==id);row.remove();st.textContent='ダウンロード待ちを取り消しました。';refresh();};}
 }
 function refresh(){
  const s=load(),busy=active(s);
  chip.hidden=!busy&&!queue.length;
  chip.textContent=busy?`↓ ${Math.max(0,Number(s.percent)||0)}%${queue.length?` +${queue.length}`:''}`:`↓ 待機 ${queue.length}`;
  chip.setAttribute('aria-label',busy?`ダウンロード中 ${Math.max(0,Number(s.percent)||0)}%、待機${queue.length}冊。一覧を開く`:`ダウンロード待ち${queue.length}冊。一覧を開く`);
  render();detailStatus();
 }
 // Native events arrive through these globals; earlier wrappers keep running first.
 const prevQueue=window.onNativeDownloadQueue;window.onNativeDownloadQueue=list=>{prevQueue?.(list);queue=Array.isArray(list)?list:[];refresh();};
 for(const key of ['onNativeDownloadProgress','onNativeDownloadState']){const old=window[key];window[key]=(...a)=>{old?.(...a);refresh();};}
 const done=window.onNativeDownload;window.onNativeDownload=r=>{done?.(r);remember(r);refresh();};
 new MutationObserver(()=>{if($('downloadStatus')&&!$('downloadQueued'))detailStatus();}).observe($('modal'),{childList:true});

 /* Settings: entry in the storage group (ui-layout groups it by the heading). */
 const settings=F.settings;F.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet');if(!sheet)return;const box=document.createElement('section');
  box.innerHTML='<h3>ダウンロードと保存</h3><div class="feature-actions"><button class="secondary" id="openDownloadManager">ダウンロード一覧</button></div>';sheet.appendChild(box);$('openDownloadManager').onclick=open;};
 $('settingsBtn').onclick=F.settings;$('mobileSettings').onclick=F.settings;
 refresh();
 return {open,refresh,state,get queue(){return queue.slice();}};
})();
