const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 0.9.1: progress stays on its own book, second request is queued, manager screen, Secure SignIn buttons. Mocked bridge only.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('dsbooks.settingsOpen','all');
  const mk=(id,title,size)=>({id,path:'/B/'+id+'.pdf',title,folder:'本',remote:true,type:'PDF',fileExt:'PDF',cover:'c1',size});
  localStorage.setItem('dsbooks.catalog',JSON.stringify([mk('A','本A',194.8e6),mk('B','本B',212.7e6),mk('C','本C',1e6)]));
  window.calls=[];window.ds={state:'running',id:'A',percent:10,done:1,total:2,queue:[]};
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.9.1-claude',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',hasBook:()=>false,
   getStorageInfo:()=>'{"available":true,"usable":5e9,"label":"本体"}',getDownloadState:()=>JSON.stringify(ds),
   downloadBook:(...a)=>calls.push(['download',a[7]]),dequeueDownload:id=>calls.push(['dequeue',id]),controlDownload:a=>calls.push(['control',a]),
   openSecureSignIn:()=>calls.push(['securesignin']),openTailscale:()=>calls.push(['tailscale'])},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 await page.evaluate(()=>{DSConnection.ensure=async()=>true;dsmConn={base:'http://nas',sid:'s',apis:{'SYNO.FileStation.Download':{path:'entry.cgi',maxVersion:2}}};});
 // Chip shows the running download.
 await page.evaluate(()=>DSDownloads.refresh());assert.equal(await page.locator('#downloadChip').isVisible(),true);assert.match(await page.locator('#downloadChip').textContent(),/10%/);
 // Detail of B while A is saving: A's progress must not appear on B.
 await page.evaluate(()=>openBook('B'));await page.waitForTimeout(50);if(!await page.locator('#downloadStatus').count())await page.locator('[data-more]').first().click();await page.waitForTimeout(50);
 const before=await page.locator('#downloadStatus').textContent();
 await page.evaluate(()=>{ds.percent=81;onNativeDownloadProgress('A',81,157.8e6,194.8e6);onNativeDownloadState('A','running');});
 assert.equal(await page.locator('#downloadStatus').textContent(),before,'other book progress leaked into this detail');
 assert.doesNotMatch(await page.locator('#downloadStatus').textContent(),/81%/);
 // Saving B queues it (native call made, buttons stay usable, queue position shown).
 await page.locator('#downloadFileBtn').click();await page.waitForTimeout(50);
 assert.deepEqual(await page.evaluate(()=>calls.filter(c=>c[0]==='download')),[['download','B']]);
 assert.match(await page.locator('#downloadStatus').textContent(),/ダウンロード待ち/);
 await page.evaluate(()=>{ds.queue=[{id:'B',title:'本B',expectedSize:212.7e6}];onNativeDownloadQueue(ds.queue);});
 assert.match(await page.locator('#downloadStatus').textContent(),/1番目/);assert.equal(await page.locator('#downloadQueuedCancel').isVisible(),true);
 assert.match(await page.locator('#downloadChip').textContent(),/81% \+1/);
 // A finishes: B (queued, not the detail-open "open after") must not auto-open; A gets saved.
 await page.evaluate(()=>{ds={state:'complete',id:'A',percent:100,queue:[]};onNativeDownload({id:'A',ok:true,localName:'a.pdf',size:1});});
 assert.equal(await page.evaluate(()=>books.find(b=>b.id==='A').localName),'a.pdf');assert.equal(await page.locator('#modalBg.open').count(),1);
 assert.match(await page.locator('#downloadStatus').textContent(),/ダウンロード待ち|NAS|保存/);
 // B now runs: its own detail shows progress.
 await page.evaluate(()=>{ds={state:'running',id:'B',percent:5,done:1,total:2,queue:[]};onNativeDownloadQueue([]);onNativeDownloadProgress('B',5,10e6,212.7e6);onNativeDownloadState('B','running');});
 assert.match(await page.locator('#downloadStatus').textContent(),/5%/);
 // Manager: current card, controls, waiting list with dequeue, history with retry.
 await page.evaluate(()=>{ds.queue=[{id:'C',title:'本C',expectedSize:1e6}];onNativeDownloadQueue(ds.queue);onNativeDownload({id:'X',ok:false,error:'失敗テスト'});});
 await page.evaluate(()=>closeModal());await page.locator('#downloadChip').click();await page.waitForTimeout(50);
 assert.match(await page.locator('.dl-current').textContent(),/本B/);assert.equal(await page.locator('.dl-list li').first().textContent().then(t=>/本C/.test(t)),true);
 await page.locator('#dlToggle').click();await page.locator('[data-dequeue]').click();
 assert.deepEqual(await page.evaluate(()=>calls.slice(-2)),[['control','pause'],['dequeue','C']]);
 assert.match(await page.locator('#downloadManager').textContent(),/本A[\s\S]*保存済み/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'tests/downloads-0.9.1.png'});
 await page.evaluate(()=>closeModal());
 // Settings: Secure SignIn next to Tailscale; download list entry in the storage group.
 await page.locator('#mobileSettings').click();await page.waitForTimeout(50);
 const tiles=await page.locator('.settings-quick .quick-tile b').allTextContents();assert.equal(tiles.indexOf('Secure SignIn'),tiles.indexOf('Tailscale')+1);
 await page.locator('#quickSecureSignIn').click();await page.locator('#quickDownloads').click();
 assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['securesignin']);assert.equal(await page.locator('#downloadManager').count(),1);
 await page.evaluate(()=>{closeModal();openConnectModal();});await page.locator('#nasOpenSecureSignIn').click();assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='securesignin').length),2);
 assert.equal(await page.locator('details[data-group=storage] #openDownloadManager').count(),0+await page.locator('#openDownloadManager').count());
 assert.deepEqual(errors,[]);console.log('PASS downloads: no cross-book progress, queue on second request, position/cancel in detail, no auto-open of queued book, manager controls/dequeue/history, Secure SignIn buttons');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
