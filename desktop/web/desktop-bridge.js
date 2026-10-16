/* DSBooks desktop: provides window.DSBooksNative for the shared Android UI.
   Most calls go synchronously to the local Python server (same names/arguments as Android).
   Audio and read-aloud run here in the page (HTML audio, speechSynthesis) and report through
   window.onPlaybackState exactly like the Android media service. NAS requests are relayed. */
(()=>{
 'use strict';
 const T=window.__DSBOOKS_TOKEN,origFetch=window.fetch.bind(window);
 // Every page (main window, a book window, a DeskHatch drawer) is its own client of the local app.
 const CLIENT=Math.random().toString(36).slice(2)+Date.now().toString(36);
 const params=new URLSearchParams(location.search),READER=params.get('reader'),WIN=params.get('w');
 function call(method,args){
  const x=new XMLHttpRequest();x.open('POST','/bridge/'+method,false);x.setRequestHeader('Content-Type','application/json');x.setRequestHeader('X-DSBooks-Token',T);x.setRequestHeader('X-DSBooks-Client',CLIENT);
  x.send(JSON.stringify(args));if(x.status!==200)throw new Error('bridge '+method+' '+x.status);
  const o=JSON.parse(x.responseText);if(o.error)console.warn('bridge',method,o.error);return o.r;
 }

 /* ---- one library for all windows and drawers: "dsbooks.*" keys live in the app, mirrored here ---- */
 const LS=window.localStorage,setItem=Storage.prototype.setItem,removeItem=Storage.prototype.removeItem,mine=k=>typeof k==='string'&&k.startsWith('dsbooks.');
 try{
  const snap=JSON.parse(call('storageSnapshot',[])||'{}');
  if(Object.keys(snap).length){for(let i=LS.length-1;i>=0;i--){const k=LS.key(i);if(mine(k)&&!(k in snap))removeItem.call(LS,k);}for(const [k,v] of Object.entries(snap))setItem.call(LS,k,v);}
  else for(let i=0;i<LS.length;i++){const k=LS.key(i);if(mine(k))call('storageSet',[k,LS.getItem(k)]);} // first run: adopt this page's data
 }catch(e){console.warn('storage sync',e);}
 const pending=new Map();let flushing=false;
 async function flush(){if(flushing)return;flushing=true;try{while(pending.size){const [k,v]=pending.entries().next().value;pending.delete(k);
   await origFetch('/bridge/'+(v===null?'storageRemove':'storageSet'),{method:'POST',headers:{'Content-Type':'application/json','X-DSBooks-Token':T,'X-DSBooks-Client':CLIENT},body:JSON.stringify(v===null?[k]:[k,v])}).catch(()=>{});}}finally{flushing=false;}}
 Storage.prototype.setItem=function(k,v){setItem.call(this,k,v);if(this===LS&&mine(k)){pending.set(k,String(v));setTimeout(flush,0);}};
 Storage.prototype.removeItem=function(k){removeItem.call(this,k);if(this===LS&&mine(k)){pending.set(k,null);setTimeout(flush,0);}};
 // Before the page closes, push anything not yet sent (positions are saved on every page turn).
 addEventListener('pagehide',()=>{for(const [k,v] of pending){const x=new XMLHttpRequest();x.open('POST','/bridge/'+(v===null?'storageRemove':'storageSet'),false);x.setRequestHeader('Content-Type','application/json');x.setRequestHeader('X-DSBooks-Token',T);x.setRequestHeader('X-DSBooks-Client',CLIENT);try{x.send(JSON.stringify(v===null?[k]:[k,v]));}catch(e){}}pending.clear();});
 let catalogTimer=null;
 function applyRemote(key,removed){
  const v=removed?null:call('storageGet',[key]);if(v==null)removeItem.call(LS,key);else setItem.call(LS,key,v);
  if(key!=='dsbooks.catalog'||v==null||typeof books==='undefined')return;
  clearTimeout(catalogTimer);catalogTimer=setTimeout(()=>{try{
   const incoming=JSON.parse(LS.getItem('dsbooks.catalog')||'[]'),open=window.DSFeatures?.reader?.book;
   // The book open in this window keeps its live position; everything else follows the other window.
   books=incoming.map(b=>open&&String(b.id)===String(open.id)?open:b);
   if(!READER&&!document.querySelector('#modalBg.open .reader'))render();
  }catch(e){console.warn(e);}},250);
 }

 /* ---- playback state (shape of MediaPlaybackService.stateJson) ---- */
 let audio=null,timer=null,sleepTimer=null,sleepAt=0;
 const blank=()=>({active:false});
 let state=blank();
 const emit=()=>{if(state.kind==='audio'&&audio){state.position=Math.round(audio.currentTime*1000);state.duration=Math.round((audio.duration||0)*1000)||state.duration||0;state.playing=!audio.paused&&!audio.ended;}
  state.sleepRemainingMs=sleepAt?Math.max(0,sleepAt-Date.now()):0;try{window.onPlaybackState?.({...state});}catch(e){console.error(e);}};
 const tick=on=>{clearInterval(timer);timer=on?setInterval(emit,500):null;};
 function stopAll(){if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=null;}try{speechSynthesis.cancel();}catch(e){}speech=null;clearTimeout(sleepTimer);sleepAt=0;tick(false);}
 function startAudio(src,meta){
  stopAll();audio=new Audio();audio.preload='auto';audio.src=src;audio.playbackRate=meta.speed||1;
  state={active:true,kind:'audio',token:meta.token,title:meta.title||'',subtitle:meta.subtitle||'',localName:meta.localName||'',sourceId:meta.sourceId||'',streaming:!!meta.streaming,
   chapters:meta.chapters||[],preparing:true,status:'準備中',playing:false,position:meta.position||0,duration:0,speed:meta.speed||1};
  audio.addEventListener('loadedmetadata',()=>{if(meta.position)audio.currentTime=meta.position/1000;});
  audio.addEventListener('playing',()=>{state.preparing=false;state.status='再生中';emit();});
  audio.addEventListener('pause',()=>{state.status=audio.ended?'終了':'一時停止';emit();});
  audio.addEventListener('ended',()=>{state.status='終了';emit();});
  audio.addEventListener('error',()=>{state.preparing=false;state.error='この音声を再生できませんでした';state.status='エラー';emit();});
  audio.play().catch(()=>{});tick(true);emit();
 }
 function control(action,value,speed){
  if(state.kind==='tts')return ttsControl(action,speed);
  if(!audio)return;
  if(action==='pause')audio.pause();else if(action==='play'||action==='resume')audio.play().catch(()=>{});
  else if(action==='stop'){stopAll();state=blank();emit();return;}
  else if(action==='seek')audio.currentTime=Math.max(0,Number(value)/1000);
  else if(action==='back')audio.currentTime=Math.max(0,audio.currentTime-15);
  else if(action==='forward')audio.currentTime=audio.currentTime+15;
  else if(action==='speed'){audio.playbackRate=Number(speed)||1;state.speed=audio.playbackRate;}
  else if(action==='sleep'){clearTimeout(sleepTimer);sleepAt=0;if(Number(value)>0){sleepAt=Date.now()+Number(value);sleepTimer=setTimeout(()=>{audio?.pause();sleepAt=0;emit();},Number(value));}}
  emit();
 }

 /* ---- read aloud with the PC's voices (sentence chunks keep long chapters reliable) ---- */
 let speech=null;
 function speak(text,rate,title,token){
  stopAll();const chunks=[];const re=/[^。！？!?\n]*[。！？!?\n]+|[^。！？!?\n]+$/g;let m;
  while((m=re.exec(text||''))&&m[0]){chunks.push({start:m.index,text:m[0]});if(m[0].length===0)break;}
  speech={chunks,i:0,offset:0,gen:0,rate:Number(rate)||1,token};
  state={active:true,kind:'tts',token,title:title||'',subtitle:'読み上げ',playing:true,preparing:false,status:'読み上げ中',rangeStart:0,rangeEnd:0,rangeExact:false,speechCompleted:false,position:0,duration:0,speed:Number(rate)||1};
  next();
 }
 function next(){
  if(!speech)return;if(speech.i>=speech.chunks.length){state.playing=false;state.speechCompleted=true;state.status='終了';emit();return;}
  // offset: where in the sentence to (re)start, e.g. after a speed change mid-sentence.
  const c=speech.chunks[speech.i],from=speech.offset||0,gen=speech.gen,u=new SpeechSynthesisUtterance(c.text.slice(from)),voice=speechSynthesis.getVoices().find(v=>/^ja/i.test(v.lang));
  u.lang='ja-JP';if(voice)u.voice=voice;u.rate=speech.rate;
  state.rangeStart=c.start+from;state.rangeEnd=c.start+c.text.length;state.rangeExact=false;
  u.onboundary=e=>{if(!speech||gen!==speech.gen)return;speech.offset=from+e.charIndex;state.rangeStart=c.start+from+e.charIndex;state.rangeEnd=state.rangeStart+(e.charLength||1);state.rangeExact=true;emit();};
  u.onend=()=>{if(!speech||gen!==speech.gen)return;speech.i++;speech.offset=0;next();};u.onerror=e=>{if(e.error!=='interrupted'&&e.error!=='canceled'){state.error='読み上げできませんでした';emit();}};
  speechSynthesis.speak(u);emit();
 }
 function ttsControl(action,speed){
  if(action==='pause'){speechSynthesis.pause();state.playing=false;state.status='一時停止';}
  else if(action==='play'||action==='resume'){state.playing=true;state.status='読み上げ中';if(speechSynthesis.paused)speechSynthesis.resume();else if(speech&&!speechSynthesis.speaking)next();}
  else if(action==='stop'){stopAll();state=blank();}
  else if(action==='speed'&&speech){
   // The PC voices take a rate per utterance: restart the current sentence from the last spoken word.
   speech.rate=Number(speed)||1;state.speed=speech.rate;speech.gen++;const paused=!state.playing;speechSynthesis.cancel();
   if(!paused)next();
  }
  emit();
 }

 const local={
  playAudio:(localName,token,positionMs,speed,title,subtitle)=>{const src=call('mediaUrl',[localName]);if(!src){state={active:true,kind:'audio',token,error:'ファイルが見つかりません'};emit();return;}
   let chapters=[];try{chapters=JSON.parse(call('getAudioChapters',[localName])||'[]');}catch(e){}
   startAudio(src,{token,localName,position:Number(positionMs)||0,speed:Number(speed)||1,title,subtitle,chapters});},
  playNasAudio:specJson=>{try{const s=JSON.parse(specJson);startAudio('/nas-stream?t='+encodeURIComponent(T)+'&spec='+encodeURIComponent(JSON.stringify(s)),{token:s.token,sourceId:s.bookId,streaming:true,position:Number(s.position)||0,speed:Number(s.speed)||1,title:s.title,subtitle:s.subtitle});return '';}catch(e){return 'NASの音声を再生できませんでした';}},
  playbackAction:(action,value,speed)=>control(action,value,speed),
  audioAction:(action,value)=>control(action,value,action==='speed'&&value>0?value/100:1),
  getPlaybackState:()=>JSON.stringify(state.kind==='audio'&&audio?(emitless(),state):state),
  speakText:(text,rate,title,token)=>speak(text,rate,title,token),
  stopSpeech:()=>{if(state.kind==='tts'){stopAll();state=blank();emit();}},
  getAudioPositions:()=>'{}',
  keepAwake:keep=>{try{if(keep&&navigator.wakeLock)navigator.wakeLock.request('screen').then(l=>window.__dsWake=l).catch(()=>{});else window.__dsWake?.release();}catch(e){}},
  copyText:text=>{navigator.clipboard?.writeText(String(text||'')).catch(()=>{});},
  setModalOpen:()=>{},stopCast:()=>{},castAudio:()=>{},openCastSettings:()=>{},publishAudioLibrary:()=>{},updateWidgetBooks:()=>{},pinReadingWidget:()=>{},
 };
 function emitless(){state.position=Math.round(audio.currentTime*1000);state.playing=!audio.paused;}
 window.DSBooksNative=new Proxy(local,{get:(o,k)=>typeof k!=='string'?undefined:k in o?o[k]:(...a)=>call(k,a)});

 /* ---- NAS requests: same-origin relay (DSM sends no CORS headers) ---- */
 window.fetch=(input,init={})=>{
  const url=typeof input==='string'?input:input?.url||String(input);
  if(!/^https?:\/\//i.test(url)||new URL(url).origin===location.origin)return origFetch(input,init);
  let headers={};if(init.headers)headers=init.headers instanceof Headers?Object.fromEntries(init.headers.entries()):{...init.headers};
  const body=init.body==null?undefined:String(init.body);
  return origFetch('/proxy',{method:'POST',headers:{'Content-Type':'application/json','X-DSBooks-Token':T},signal:init.signal,body:JSON.stringify({url,method:init.method||(body?'POST':'GET'),headers,body})})
   .then(async r=>{if(r.status!==200)throw new TypeError('Failed to fetch');const status=Number(r.headers.get('X-DSBooks-Status'))||200;
    if(init.redirect==='error'&&status>=300&&status<400)throw new TypeError('Failed to fetch');
    return new Response(status===204||status===304?null:await r.arrayBuffer(),{status,headers:{'Content-Type':r.headers.get('Content-Type')||''}});});
 };

 /* ---- callbacks from Python ---- */
 (async function poll(){
  for(;;){
   try{const r=await origFetch('/events',{headers:{'X-DSBooks-Token':T,'X-DSBooks-Client':CLIENT},cache:'no-store'});const list=await r.json();
    for(const e of list){
     if(e.cb==='dsStorage'){try{applyRemote(e.args[0],e.args[2]);}catch(err){console.warn(err);}continue;}
     if(e.cb==='toast'){window.toast?.(e.args[0]);continue;}
     if(e.cb==='desktopCopy'){navigator.clipboard?.writeText(e.args[0]).catch(()=>{});continue;}
     const f=window[e.cb];if(typeof f==='function'){try{f(...e.args);}catch(err){console.error(e.cb,err);}}
    }
   }catch(err){await new Promise(r=>setTimeout(r,1000));}
  }
 })();

 /* ---- keyboard and mouse "Back": Escape / browser back button / Alt+Left ---- */
 const back=()=>{try{return window.dsbooksHandleBack?.();}catch(e){return false;}};
 addEventListener('keydown',e=>{if(e.defaultPrevented)return;if(e.key==='Escape'||(e.altKey&&e.key==='ArrowLeft')){if(back())e.preventDefault();}},false);
 addEventListener('mouseup',e=>{if(e.button===3){e.preventDefault();back();}});
 /* ---- keyboard page turning in readers: PageDown/Space/↓ next, PageUp/↑ previous;
    ←/→ follow the page direction (vertical text and right-opening comics: ← is next) ---- */
 const visible=id=>{const e=document.getElementById(id);return e&&e.offsetParent!==null&&!e.disabled?e:null;};
 addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||document.querySelector('.reader-panel'))return;
  if(e.target?.matches?.('input,select,textarea'))return;
  const pairs=[['epubNext','epubPrev'],['pdfNext','pdfPrev'],['comicNext','comicPrev']];
  const pair=pairs.find(([n])=>visible(n));if(!pair)return;
  const dirButton=visible('comicDirection')||visible('epubImageDirection');
  const rtl=!!document.querySelector('#epubViewport.vertical-text')||/右開き/.test(dirButton?.textContent||'');
  const k=e.key;let dir=0;
  if(k==='PageDown'||k===' '||k==='ArrowDown')dir=1;else if(k==='PageUp'||k==='ArrowUp')dir=-1;
  else if(k==='ArrowRight')dir=rtl?-1:1;else if(k==='ArrowLeft')dir=rtl?1:-1;
  if(!dir)return;e.preventDefault();visible(dir>0?pair[0]:pair[1])?.click();
 },false);
 /* ---- windows: books open in their own window; a book window closes with its book ---- */
 if(READER){document.documentElement.classList.add('reader-window');
  const css=document.createElement('style');css.textContent='html.reader-window .app,html.reader-window .bottomnav,html.reader-window .mini-player,html.reader-window .topbar{display:none!important}html.reader-window .modal-bg{padding:0!important;background:#101814!important;backdrop-filter:none!important}html.reader-window .modal{max-width:none!important;width:100%!important;height:100vh!important;max-height:none!important;border-radius:0!important;margin:0!important}';
  document.head.appendChild(css);}
 addEventListener('DOMContentLoaded',()=>{
  const openLocal=window.openLocalBook;if(typeof openLocal!=='function')return;
  if(READER){
   // A book window shows one book: no library scans or NAS sync here (the main app does those).
   if(window.DSSync)window.DSSync.run=async()=>false;window.scanLibrary=()=>{};
   let shown=false;
   const start=()=>{const b=books.find(x=>String(x.id)===READER);if(!b){document.title='DSBooks';return;}document.title=b.title||'DSBooks';openLocal(b);shown=true;};
   (function wait(){if(window.DSBoot&&DSBoot.readyMs!==undefined)start();else setTimeout(wait,50);})();
   const close=window.closeModal;window.closeModal=function(){const r=close.apply(this,arguments);if(shown&&!document.querySelector('#modalBg.open'))call('closeWindow',[WIN]);return r;};
   return;
  }
  let windows=false;try{windows=!!call('canOpenWindows',[]);}catch(e){}
  if(!windows)return;
  window.openLocalBook=function(b,...rest){
   // Audio stays here with the mini player; everything readable gets its own window.
   if(b&&b.type!=='Audio'&&call('openReaderWindow',[String(b.id),b.title||'DSBooks'])){window.closeModal?.();return;}
   return openLocal.call(this,b,...rest);
  };
 });
 document.documentElement.classList.add('desktop');
})();
