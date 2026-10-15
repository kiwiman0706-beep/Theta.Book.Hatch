const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('dsbooks.catalog',JSON.stringify([{id:'1',title:'縦書きの試験',type:'ePub',localName:'sample.epub',offline:true,progress:0}]));
  window.spoken=null;window.mode='ok';window.requests=[];window.launched=0;
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.8.5-preview',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',hasBook:()=>true,
   getEpubChapter:(n,index)=>JSON.stringify({ok:true,index,count:2,title:'章の見出し',html:'<h2>雨の日の読書</h2>'+Array.from({length:120},(_,i)=>'<p>第'+i+'段落。<ruby>図書館<rt>としょかん</rt></ruby>で本を読みました。「こんにちは。」窓の外には雨が降っています。縦書きでも途中の文章から読めることを確認します。</p>').join(''),imageOnly:false,progressWeights:[1,1]}),
   speakText:(text,speed,title,token)=>{spoken={text,token};},getNetworkStatus:()=>'{"connected":true,"vpn":false}',openTailscale:()=>launched++},{get:(o,k)=>o[k]||(()=> '')});
  window.fetch=async(url,options)=>{const p=Object.fromEntries(new URLSearchParams(options.body));requests.push(p.method);
   if(mode==='offline')throw new TypeError('Failed to fetch');
   let data={};if(p.method==='query')data={'SYNO.API.Auth':{path:'auth.cgi',maxVersion:3},'SYNO.FileStation.List':{path:'entry.cgi',maxVersion:2},'SYNO.FileStation.Download':{path:'entry.cgi',maxVersion:2}};
   if(p.method==='list_share'&&['expired','otp'].includes(mode)&&p._sid!=='fresh')return new Response(JSON.stringify({success:false,error:{code:119}}));
   if(p.method==='login'){if(mode==='otp')return new Response(JSON.stringify({success:false,error:{code:403}}));data={sid:'fresh'};}
   if(p.method==='list_share')data={shares:[{name:'Books',path:'/Books'}]};return new Response(JSON.stringify({success:true,data}));
  };
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);await page.evaluate(()=>openLocalBook(books[0]));await page.waitForTimeout(300);
 for(let i=0;i<4;i++)await page.locator('#epubNext').click();
 const getAnchor=()=>page.evaluate(()=>DSEpubSpeech.create(document.getElementById('epubPage')).fromViewport(document.getElementById('epubViewport')).start);
 const visible=offset=>page.evaluate(offset=>{const r=DSEpubSpeech.create(document.getElementById('epubPage')).range(offset,offset+1).getBoundingClientRect(),v=document.getElementById('epubViewport').getBoundingClientRect();return r.right>v.left&&r.left<v.right&&r.bottom>v.top&&r.top<v.bottom;},offset);
 const anchor=await getAnchor();assert(anchor>0);await page.locator('#epubPrefs').click();await page.locator('#readerWriting').selectOption('vertical');await page.locator('#applyReaderPrefs').click();await page.waitForTimeout(250);
 assert.equal(await page.locator('#epubPage').evaluate(x=>getComputedStyle(x).writingMode),'vertical-rl');assert(await visible(anchor));const a=await getAnchor();await page.locator('#epubNext').click();assert(await getAnchor()>a);
 await page.locator('#epubSpeak').click();assert(await page.evaluate(()=>spoken.text.startsWith(DSEpubSpeech.create(document.getElementById('epubPage')).fromViewport(document.getElementById('epubViewport')).text.slice(0,30))));
 const speech=await page.evaluate(()=>{const m=DSEpubSpeech.create(document.getElementById('epubPage')),ctx=books[0].speechContext;let offset=Math.min(m.text.length-2,ctx.start+900);return {offset,state:{active:true,kind:'tts',token:books[0].speechToken,rangeStart:offset-ctx.start,rangeEnd:offset-ctx.start+1,rangeExact:true}};});
 await page.evaluate(s=>DSFeatures.reader.onSpeechState(s),speech.state);assert(await visible(speech.offset));await page.evaluate(()=>{closeModal();openLocalBook(books[0]);});await page.waitForTimeout(300);assert(await getAnchor()>0);
 await page.locator('#epubSeek').evaluate(x=>{x.value='250';x.dispatchEvent(new Event('change'));});assert(await getAnchor()>0);
 await page.locator('#epubPrefs').click();await page.locator('#readerWriting').selectOption('horizontal');await page.locator('#applyReaderPrefs').click();await page.waitForTimeout(200);assert.equal(await page.locator('#epubPage').evaluate(x=>getComputedStyle(x).writingMode),'horizontal-tb');await page.evaluate(()=>closeModal());
 await page.evaluate(()=>{savedLogin={base:'http://100.100.1.2:5000',account:'test',password:'test-only',sid:'old'};});
 const concurrent=await page.evaluate(async()=>{requests=[];return {result:await Promise.all([DSConnection.ensure(true),DSConnection.ensure(true)]),calls:requests};});assert(concurrent.result.every(Boolean));assert.equal(concurrent.calls.filter(x=>x==='query').length,1);assert(!concurrent.calls.includes('login'));
 await page.evaluate(()=>{mode='offline';requests=[];});assert.equal(await page.evaluate(()=>DSConnection.ensure(true)),false);assert.equal(await page.evaluate(()=>requests.includes('login')),false);await page.locator('#nasConnectionNotice button').filter({hasText:'Tailscaleを開く'}).click();assert.equal(await page.evaluate(()=>launched),1);
 const count=await page.evaluate(()=>requests.length);await page.evaluate(()=>DSConnection.ensure());assert.equal(await page.evaluate(()=>requests.length),count);
 await page.evaluate(()=>{mode='ok';dsbooksResumed();});await page.waitForFunction(()=>DSConnection.state().status==='connected');
 await page.evaluate(()=>{mode='expired';requests=[];});assert(await page.evaluate(()=>DSConnection.ensure(true)));assert.equal(await page.evaluate(()=>savedLogin.sid),'fresh');assert.equal(await page.evaluate(()=>requests.filter(x=>x==='login').length),1);
 await page.evaluate(()=>{mode='otp';savedLogin.sid='old';requests=[];});assert.equal(await page.evaluate(()=>DSConnection.ensure(true)),false);assert.equal(await page.evaluate(()=>DSConnection.state().status),'auth');await page.evaluate(()=>DSConnection.ensure(true));assert.equal(await page.evaluate(()=>requests.filter(x=>x==='login').length),1);
 assert.deepEqual(errors,[]);console.log('PASS: vertical pagination, anchor, TTS start/follow, resume, seek; NAS single flight, network backoff, Tailscale launch/resume, session renewal, OTP stop');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
