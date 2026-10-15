'use strict';
(function(){
 const native=window.DSBooksNative,$=id=>document.getElementById(id),F=DSFeatures;
 // Only a small, credential-free offline audio index crosses to the car browser.
 let publishTimer;
 function publish(){native?.publishAudioLibrary?.(JSON.stringify(books.filter(b=>b.type==='Audio'&&b.offline).map(b=>({id:String(b.id),type:b.type,offline:true,title:b.title,folder:b.folder,localName:b.localName,path:b.path,modifiedAt:b.modifiedAt,audioPosition:b.audioPosition,audioDuration:b.audioDuration,audioSpeed:b.audioSpeed,progressUpdatedAt:b.progressUpdatedAt}))));}
 const save=saveCatalog;saveCatalog=function(){save();clearTimeout(publishTimer);publishTimer=setTimeout(publish,400);};
 function mergePositions(){
  let positions;try{positions=JSON.parse(native?.getAudioPositions?.()||'{}');}catch(_){return;}
  let changed=false;
  for(const b of books){const p=positions[b.localName];if(b.type!=='Audio'||!p||!Number.isFinite(p.updatedAt)||p.updatedAt<=(b.progressUpdatedAt||0)||!(p.duration>0))continue;
   if(playbackSnapshot.active&&playbackSnapshot.playing&&audioMatches(b))continue;
   b.audioPosition=Math.max(0,Math.min(p.duration,p.position||0));b.audioDuration=p.duration;b.audioSpeed=p.speed||1;b.progress=Math.round(100*b.audioPosition/p.duration);b.progressUpdatedAt=p.updatedAt;b.lastReadAt=p.updatedAt;b.readState=b.progress>=100?'finished':'reading';changed=true;
  }
  if(changed){F.acceptMergedPositions();saveCatalog();render();}
 }
 window.addEventListener('focus',mergePositions);document.addEventListener('visibilitychange',()=>{if(!document.hidden)mergePositions();});
 const state=window.onPlaybackState;window.onPlaybackState=o=>{state(o);if(o?.kind==='audio'&&!o.playing)mergePositions();};
 setTimeout(()=>{mergePositions();publish();},1200);
 const settings=F.settings;F.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet'),section=document.createElement('section');
 section.innerHTML='<h3>ウィジェット・TV・車で使う</h3><div class="feature-actions"><button id="pinCoverWidget" class="primary">表紙つき本棚を追加</button><button id="pinListWidget" class="secondary">表紙つき一覧を追加</button></div><p class="feature-hint">読みかけの本を表示します。保存済みの本は表紙を順に生成し、未取得の表紙は代替画像になります。</p><h3>Android Auto（試験対応）</h3><p class="feature-hint">端末に保存した音声本を車側のDSBooksから選択できます。再生・一時停止・15秒送り戻し・続きから再生に対応。初めにこのアプリで本を保存してください。プレビューAPKのため、車側への表示にはAndroid Autoの開発者設定が必要な場合があります。設定操作は停車中に行ってください。</p><h3>テレビへ表示</h3><button id="systemCast" class="secondary">端末の画面共有設定を開く</button><p class="feature-hint">端末が対応していれば画面を共有できます。保存済み音声本は再生画面の「キャスト」から同じWi-Fiの機器へ送信できます（試験対応・1倍速）。朗読・書籍画面の直接送信は未対応です。Android TVへこのAPKをインストールすると、リモコンの方向キー・決定・戻るで操作できます（試験対応）。</p>';
 sheet.appendChild(section);$('pinCoverWidget').onclick=()=>native?.pinReadingWidget?.(true);$('pinListWidget').onclick=()=>native?.pinReadingWidget?.(false);$('systemCast').onclick=()=>native?.openCastSettings?.();};
 $('settingsBtn').onclick=F.settings;$('mobileSettings').onclick=F.settings;
 const tv=native?.isTelevision?.()===true;
 if(!tv)return;
 document.body.classList.add('tv-mode');
 const css=document.createElement('style');css.textContent=`
 .tv-mode{font-size:18px}.tv-mode .app{max-width:none;grid-template-columns:180px minmax(0,1fr)}
 .tv-mode .main{padding:20px 32px}.tv-mode .book-card{flex-basis:150px}.tv-mode .book-title{font-size:17px}.tv-mode .folder-shelf-name h3{font-size:21px}
 .tv-mode button,.tv-mode select,.tv-mode input{min-height:44px;font-size:17px}.tv-mode :focus{outline:4px solid #ffe39b!important;outline-offset:3px;box-shadow:0 0 0 7px #11291dcc!important}
 .tv-mode .reader{max-width:none}.tv-mode .reader-panel{max-width:900px}.tv-mode .folder-shelf{margin:0}.tv-mode .sidebar{display:flex}
 @media(max-width:900px){.tv-mode .app{grid-template-columns:1fr}.tv-mode .sidebar{display:none}.tv-mode .main{padding:20px 28px 65px}}
 `;document.head.appendChild(css);
 function prepare(){document.querySelectorAll('.book-card,[data-read]').forEach(e=>{if(!e.hasAttribute('tabindex')){e.tabIndex=0;e.setAttribute('role','button');e.setAttribute('aria-label',e.querySelector('.book-title')?.textContent||e.textContent.trim());}});}
 new MutationObserver(prepare).observe(document.body,{childList:true,subtree:true});prepare();
 function scope(){return document.querySelector('.reader-panel')||($('modalBg').classList.contains('open')?$('modal'):document.body);}
 const selector='button,input,select,textarea,[tabindex="0"],a[href]';
 function candidates(){return [...scope().querySelectorAll(selector)].filter(e=>!e.disabled&&!e.closest('[hidden]')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');}
 function focus(e){if(!e)return;e.focus({preventScroll:true});e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'||e.key==='BrowserBack'){if(window.dsbooksHandleBack()){e.preventDefault();focus(candidates()[0]);}return;}
  const active=document.activeElement,typing=active?.matches('input,select,textarea');
  if((e.key==='Enter'||e.key===' ')&&!typing){if(active?.matches('.book-card,[data-read],[role="button"]')){e.preventDefault();e.stopImmediatePropagation();active.click();return;}}
  if(!e.key.startsWith('Arrow')||typing)return;
  const all=candidates();if(!all.length)return;e.preventDefault();
  if(!scope().contains(active)||!all.includes(active)){focus(all[0]);return;}
  const r=active.getBoundingClientRect(),cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
  const horizontal=e.key==='ArrowLeft'||e.key==='ArrowRight',sign=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;
  let best=null,score=Infinity;
  for(const item of all){if(item===active||active.contains(item)||item.contains(active))continue;const t=item.getBoundingClientRect(),dx=(t.left+t.right)/2-cx,dy=(t.top+t.bottom)/2-cy,forward=(horizontal?dx:dy)*sign,cross=Math.abs(horizontal?dy:dx);if(forward<4)continue;const n=forward+cross*3;if(n<score){score=n;best=item;}}
  focus(best);
 },true);
 focus(candidates()[0]);
})();
