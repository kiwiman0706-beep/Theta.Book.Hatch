const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  if(!localStorage.getItem('fixture081')){
   localStorage.clear();localStorage.setItem('fixture081','true');
   const xs=['⑧A','⑧B'].map((f,i)=>({id:'/Books/'+f+'/book.epub',path:'/Books/'+f+'/book.epub',title:f+' Book',folder:f,remote:true,type:'ePub',fileExt:'EPUB',cover:'c1',author:f,bookId:'test-book-'+i,progress:30+i,currentPage:71,chapterIndex:2,annotations:[{id:'note-'+i,note:'keep',updatedAt:100}],localName:i?'b.epub':null,offline:!!i}));
   localStorage.setItem('dsbooks.catalog',JSON.stringify(xs));localStorage.setItem('dsbooks.scanRoots',JSON.stringify(['/Books/⑧A','/Books/⑧B']));localStorage.setItem('dsbooks.shares',JSON.stringify(['/Books']));localStorage.setItem('dsbooks.folderPrefix','⑧');localStorage.setItem('dsbooks.downloads',JSON.stringify({'/Books/⑧B/book.epub':'b.epub'}));
  }
  window.nativeCalls={deleted:0,widgets:[]};
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.8.1-preview',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',hasBook:n=>n==='b.epub',updateWidgetBooks:s=>nativeCalls.widgets=JSON.parse(s),deleteBook:()=>{nativeCalls.deleted++;return true;}},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 const setMock=()=>page.evaluate(()=>{
  dsmConn={base:'http://100.64.0.1:5000',sid:'test',apis:{'SYNO.FileStation.List':{},'SYNO.FileStation.Search':{}}};
  window.scenario='removed-b';window.apiCalls=[];
  dsmCall=async(api,method,p)=>{
   apiCalls.push({api,method,p});
   if(scenario==='network-failure')throw Error('network fixture');
   if(scenario==='malformed')return {success:true,data:{}};
   if(p.folder_path==='/Books'){
    if(scenario==='zero')return {data:{files:[{path:'/Books/B',name:'B',isdir:true}],total:1}};
    if(scenario==='partial')return {data:{files:[],total:1}};
    if(scenario==='paged')return Number(p.offset)===0?{data:{files:[{path:'/Books/A',name:'A',isdir:true}],total:2}}:{data:{files:[{path:'/Books/⑧B',name:'⑧B',isdir:true}],total:2}};
    const names=scenario==='restored'?['⑧A','⑧B']:['⑧A','B'];return {data:{files:names.map(name=>({path:'/Books/'+name,name,isdir:true})),total:names.length}};
   }
   if(scenario==='nested-failure')throw Error('nested fixture');
   return {data:{files:[{path:p.folder_path+'/book.epub',name:'book.epub',isdir:false,additional:{size:100,time:{mtime:100}}}],total:1}};
  };
 });
 await setMock();await page.evaluate(()=>scanLibrary(['/Books']));
 assert.equal(await page.locator('.book-card').count(),1);assert(!await page.locator('#folderFilter').textContent().then(s=>s.includes('⑧B')));
 let b=await page.evaluate(()=>books.find(b=>b.folder==='⑧B'));assert(b.libraryExcluded);assert.equal(b.progress,31);assert.equal(b.currentPage,71);assert.equal(b.annotations[0].note,'keep');assert.equal(b.localName,'b.epub');assert(b.offline);
 assert.equal(await page.locator('.reading-item').count(),1);assert.equal(await page.evaluate(()=>nativeCalls.widgets.length),1);
 await page.evaluate(()=>{activeNav='downloaded';render();});assert.equal(await page.locator('.book-card').count(),1);assert.match(await page.locator('.stale-badge').textContent(),/対象外/);
 // Cold reload retains exclusion and all archived metadata.
 await page.reload();await page.waitForFunction(()=>DSBoot.readyMs!==undefined);assert.equal(await page.locator('.book-card').count(),1);await setMock();
 // Failed or incomplete scan does not change the catalog or the last successful roots.
 for(const scenario of ['network-failure','malformed','partial','nested-failure']){
  const before=await page.evaluate(()=>[localStorage.getItem('dsbooks.catalog'),localStorage.getItem('dsbooks.scanRoots')]);
  await page.evaluate(async s=>{scenario=s;await scanLibrary(['/Books']);},scenario);
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('dsbooks.catalog'),localStorage.getItem('dsbooks.scanRoots')]),before,scenario);
 }
 // Zero matching folders commits an empty shelf while keeping the downloaded book.
 await page.evaluate(async()=>{scenario='zero';await scanLibrary(['/Books']);});assert.equal(await page.locator('.book-card').count(),0);assert.equal(await page.locator('.reading-item').count(),0);
 assert.deepEqual(await page.evaluate(()=>savedScanRoots),[]);assert.equal(await page.evaluate(()=>books.length),2);
 await page.evaluate(()=>{activeNav='downloaded';render();});assert.equal(await page.locator('.book-card').count(),1);
 // Re-including the same paths restores identity, notes, progress, and download.
 await page.evaluate(async()=>{activeNav='home';scenario='restored';await scanLibrary(['/Books']);});assert.equal(await page.locator('.book-card').count(),2);
 b=await page.evaluate(()=>books.find(b=>b.folder==='⑧B'));assert.equal(b.libraryExcluded,false);assert.equal(b.stale,false);assert.equal(b.bookId,'test-book-1');assert.equal(b.progress,31);assert.equal(b.localName,'b.epub');assert.equal(b.annotations[0].note,'keep');
 // Multiple listing pages, including a match only on a later page.
 await page.evaluate(async()=>{scenario='paged';await scanLibrary(['/Books']);});assert.equal(await page.locator('.book-card').count(),1);assert.deepEqual(await page.evaluate(()=>savedScanRoots),['/Books/⑧B']);
 // Exact match mode and native file preservation.
 await page.evaluate(async()=>{savedPrefixExact=true;savedFolderPrefix='⑧B';scenario='restored';await scanLibrary(['/Books']);});assert.deepEqual(await page.evaluate(()=>savedScanRoots),['/Books/⑧B']);
 assert.equal(await page.evaluate(()=>nativeCalls.deleted),0);
 // Explicit blank prefix survives restart (not silently replaced by default ⑧).
 await page.evaluate(()=>localStorage.setItem('dsbooks.folderPrefix',''));await page.reload();await page.waitForFunction(()=>DSBoot.readyMs!==undefined);assert.equal(await page.evaluate(()=>savedFolderPrefix),'');
 // Whole-share search mode keeps scoped missing files as NAS-unconfirmed.
 await setMock();await page.evaluate(async()=>{dsmCall=async(api,m,p)=>m==='start'?{data:{taskid:'t'}}:{data:{finished:true,total:0,files:[]}};await scanLibrary(['/Books']);});
 assert.equal(await page.locator('.book-card').count(),2);assert.equal(await page.evaluate(()=>nativeCalls.deleted),0);
 assert.deepEqual(errors,[]);console.log('PASS: scope exclusion, saved access, cold reload, progress/notes/ID, failure atomicity, zero matches, re-include, paged roots, exact/blank filters, whole-share search');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
