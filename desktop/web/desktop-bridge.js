/* DSBooks desktop: provides window.DSBooksNative for the shared Android UI.
   Most calls go synchronously to the local Python server (same names/arguments as Android).
   Audio and read-aloud run here in the page (HTML audio, speechSynthesis) and report through
   window.onPlaybackState exactly like the Android media service. NAS requests are relayed. */
(()=>{
 'use strict';
 const T=window.__DSBOOKS_TOKEN,origFetch=window.fetch.bind(window);
 function call(method,args){
  const x=new XMLHttpRequest();x.open('POST','/bridge/'+method,false);x.setRequestHeader('Content-Type','application/json');x.setRequestHeader('X-DSBooks-Token',T);
  x.send(JSON.stringify(args));if(x.status!==200)throw new Error('bridge '+method+' '+x.status);
  const o=JSON.parse(x.responseText);if(o.error)console.warn('bridge',method,o.error);return o.r;
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
  if(state.kind==='tts')return ttsControl(action);
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
  speech={chunks,i:0,rate:Number(rate)||1,token};
  state={active:true,kind:'tts',token,title:title||'',subtitle:'読み上げ',playing:true,preparing:false,status:'読み上げ中',rangeStart:0,rangeEnd:0,rangeExact:false,speechCompleted:false,position:0,duration:0,speed:Number(rate)||1};
  next();
 }
 function next(){
  if(!speech)return;if(speech.i>=speech.chunks.length){state.playing=false;state.speechCompleted=true;state.status='終了';emit();return;}
  const c=speech.chunks[speech.i],u=new SpeechSynthesisUtterance(c.text),voice=speechSynthesis.getVoices().find(v=>/^ja/i.test(v.lang));
  u.lang='ja-JP';if(voice)u.voice=voice;u.rate=speech.rate;
  state.rangeStart=c.start;state.rangeEnd=c.start+c.text.length;state.rangeExact=false;
  u.onboundary=e=>{state.rangeStart=c.start+e.charIndex;state.rangeEnd=c.start+e.charIndex+(e.charLength||1);state.rangeExact=true;emit();};
  u.onend=()=>{if(!speech)return;speech.i++;next();};u.onerror=e=>{if(e.error!=='interrupted'&&e.error!=='canceled'){state.error='読み上げできませんでした';emit();}};
  speechSynthesis.speak(u);emit();
 }
 function ttsControl(action){
  if(action==='pause'){speechSynthesis.pause();state.playing=false;state.status='一時停止';}
  else if(action==='play'||action==='resume'){speechSynthesis.resume();state.playing=true;state.status='読み上げ中';}
  else if(action==='stop'){stopAll();state=blank();}
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
   try{const r=await origFetch('/events',{headers:{'X-DSBooks-Token':T},cache:'no-store'});const list=await r.json();
    for(const e of list){
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
 document.documentElement.classList.add('desktop');
})();
