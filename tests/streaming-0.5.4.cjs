const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('dsbooks.catalog',JSON.stringify([{id:'remote1',path:'/Books/Test.m4b',title:'ストリーミングのテスト',author:'AudioBooks',folder:'音声本',type:'Audio',fileExt:'M4B',remote:true,size:822100000,cover:'c1',audioPosition:45000,progress:12},{id:'remote2',path:'/Books/Other.m4b',title:'別の音声本',type:'Audio',fileExt:'M4B',remote:true,size:100000,folder:'音声本',cover:'c2'}]));
  window.calls=[];window.saved=false;window.download={};window.state={active:false};
  window.DSBooksNative=new Proxy({hasBook:()=>saved,getAppVersion:()=> '0.5.4-preview',getPlaybackState:()=>JSON.stringify(state),getDownloadState:()=>JSON.stringify(download),loadCredentials:()=> 'null',getStorageInfo:()=>'{"usable":9999999999}',getAudioChapters:()=> '[]',
   playNasAudio:json=>{const spec=JSON.parse(json);calls.push(['stream',spec]);setTimeout(()=>{state={active:true,kind:'audio',token:spec.token,sourceId:spec.bookId,streaming:true,position:spec.position,duration:120000,playing:true,chapters:[{title:'はじめに',timeMs:0},{title:'第二章',timeMs:60000}]};onPlaybackState(state)},5);return '';},
   playAudio:(file,token,pos)=>{calls.push(['local',file,pos]);setTimeout(()=>{state={active:true,kind:'audio',token,localName:file,position:pos,duration:120000,playing:true};onPlaybackState(state)},5);},
   downloadBook:(...args)=>{calls.push(['download',...args]);download={id:args[7],state:'running',percent:10};setTimeout(()=>onNativeDownloadProgress(download.id,10,82210000,822100000),5)},
   controlDownload:a=>{calls.push(['downloadControl',a]);download.state=a==='pause'?'paused':a==='cancel'?'cancelled':'running';setTimeout(()=>onNativeDownloadState(download.id,download.state),5);},
   audioAction:(a,v)=>calls.push(['audio',a,v]),playbackAction:(a,v)=>{calls.push(['control',a,v]);if(a==='stop')state={active:false};else state.playing=a==='play';setTimeout(()=>onPlaybackState(state),5);}
  },{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForTimeout(100);
 await page.evaluate(()=>{dsmConn={base:'http://nas.test:5000',sid:'PRIVATE_SESSION',apis:{'SYNO.FileStation.Download':{path:'entry.cgi',maxVersion:2}}};openBook('remote1')});
 await page.getByRole('button',{name:'今すぐ聴く',exact:true}).click();await page.waitForTimeout(50);
 assert.equal(await page.locator('.audio-modal').count(),1);assert.match(await page.locator('#audioStatus').textContent(),/NASストリーミング中/);assert.equal(await page.locator('.chapter-row').count(),2);
 assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='download').length),0);assert.equal(await page.evaluate(()=>calls.find(x=>x[0]==='stream')[1].position),45000);
 assert.equal(await page.getByRole('button',{name:'VLCで開く',exact:true}).isDisabled(),true);
 await page.locator('.chapter-row').nth(1).click();assert.equal(await page.evaluate(()=>calls.at(-1)[2]),60000);
 await page.locator('.audio-modal > .close').click();assert.equal(await page.locator('#miniPlayer').isVisible(),true);await page.locator('#miniOpen').click();assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='stream').length),1);
 await page.locator('#streamSave').click();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='download').length),1);assert.match(await page.locator('#streamSaveStatus').textContent(),/10%/);
 await page.locator('#streamPauseSave').click();await page.waitForTimeout(30);assert.match(await page.locator('#streamPauseSave').textContent(),/再開/);assert.equal(await page.evaluate(()=>state.playing),true);
 await page.locator('#streamPauseSave').click();await page.locator('#streamCancelSave').click();await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>state.playing),true);
 await page.evaluate(()=>{state={...state,error:'接続エラー',position:0,duration:0,playing:false};onPlaybackState(state)});assert.equal(await page.evaluate(()=>books[0].audioPosition),45000);
 assert.equal(await page.evaluate(()=>localStorage.getItem('dsbooks.catalog').includes('PRIVATE_SESSION')),false);assert.equal(await page.locator('body').innerText().then(x=>x.includes('PRIVATE_SESSION')),false);
 await page.locator('.audio-modal > .close').click();await page.evaluate(()=>{state={active:false};onPlaybackState(state);download={};openBook('remote1')});
 await page.getByRole('button',{name:'保存しながら聴く',exact:true}).click();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='download').length),2);assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='stream').length),2);
 await page.evaluate(()=>{saved=true;download={id:'remote1',state:'complete',percent:100};onNativeDownload({id:'remote1',ok:true,localName:'saved.m4b',size:822100000})});
 assert.match(await page.locator('#streamSaveStatus').textContent(),/保存完了/);assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='local').length),0);
 await page.screenshot({path:'tests/streaming-0.5.4.png'});
 await page.locator('#streamSave').click();await page.waitForTimeout(40);assert.deepEqual(await page.evaluate(()=>calls.find(x=>x[0]==='local')),['local','saved.m4b',45000]);assert.equal(await page.locator('#streamSave').count(),0);
 await page.locator('.audio-modal > .close').click();await page.evaluate(()=>openBook('remote1'));await page.getByRole('button',{name:'NASから聴く',exact:true}).click();await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='stream').length),3);
 await page.locator('.audio-modal > .close').click();await page.evaluate(()=>{saved=false;download={id:'remote1',state:'running',percent:50};openBook('remote2')});await page.getByRole('button',{name:'保存しながら聴く',exact:true}).click();await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='download').length),2);assert.equal(await page.evaluate(()=>state.sourceId),'remote2');
 assert.deepEqual(errors,[]);console.log('PASS: stream/start/save concurrently/download pause-cancel/remote chapters/reopen mini/progress preservation/local handoff/credential non-persistence');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
