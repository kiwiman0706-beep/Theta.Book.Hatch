const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.1: Theta Hatch migration. Bridge export (what goes into storage.json, what never does), new-app import
// (merge without loss: notes by id, newer position wins, downloaded files not carried over), NAS account prefill,
// settings entries by package (old id = move out, new id = import), update through the hub. Mocked bridge.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const run=async(pkg,catalog,extra={})=>{
  const page=await browser.newPage({viewport:{width:390,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(([pkg,catalog,extra])=>{localStorage.clear();window.calls=[];localStorage.setItem('dsbooks.settingsOpen','all');
   localStorage.setItem('dsbooks.catalog',JSON.stringify(catalog));for(const [k,v] of Object.entries(extra))localStorage.setItem(k,v);
   window.DSBooksNative=new Proxy({appPackageName:()=>pkg,hasBook:()=>true,loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',
    migrationExport:j=>calls.push(['export',JSON.parse(j)]),migrationImportDone:(ok,e)=>calls.push(['done',ok,e]),migrationCancel:()=>calls.push(['cancel']),
    migrationChooseImport:()=>calls.push(['choose']),requestUpdate:()=>calls.push(['update'])},{get:(o,k)=>o[k]||(()=> '')});},[pkg,catalog,extra]);
  await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
  return {page,errors};
 };
 const book=(id,o={})=>({id,bookId:'b-'+id,title:'本'+id,type:'PDF',fileExt:'PDF',path:'/B/'+id+'.pdf',remote:true,localName:'dl-'+id,offline:true,cover:'c1',size:1,...o});

 // Bridge (old id): export screen started by the hub.
 const old=await run('jp.shinwakai.dsbooks.claude',[book('A',{progress:40,lastReadAt:100,annotations:[{id:'n1',note:'メモ',updatedAt:1}]}),book('B')],
  {'dsbooks.downloads':'{"\\/B\\/A.pdf":"dl-A"}','dsbooks.host':'https://nas.local:5001','dsbooks.shares':'["\\/B"]','thetaBookHatch.geminiKey':'AIza-secret'});
 await old.page.evaluate(()=>DSMigrate.start({mode:'export',hub:true}));
 const sheet=await old.page.locator('.migrate-sheet').textContent();
 assert.match(sheet,/2冊（読みかけ 1冊）/);assert.match(sheet,/栞とメモ 1件/);assert.match(sheet,/Theta Home Hatch に/);assert.match(sheet,/パスワード/);
 await old.page.locator('#migrateExport').click();
 const exp=await old.page.evaluate(()=>calls.find(c=>c[0]==='export')[1]);
 assert.equal(JSON.parse(exp['dsbooks.catalog']).length,2);assert.equal(exp['dsbooks.host'],'https://nas.local:5001');
 assert.equal('dsbooks.downloads' in exp,false,'device file table not exported');assert.equal(Object.keys(exp).some(k=>!k.startsWith('dsbooks.')),false,'only dsbooks.* (no API key)');
 assert.equal(JSON.stringify(exp).includes('AIza-secret'),false);
 // Cancel from a hub returns to it.
 await old.page.evaluate(()=>DSMigrate.start({mode:'export',hub:true}));await old.page.locator('#migrateCancel').click();assert.deepEqual(await old.page.evaluate(()=>calls.pop()),['cancel']);
 // Settings on the old id: "move to the new app"; update asks the hub.
 await old.page.evaluate(()=>DSFeatures.settings());assert.equal(await old.page.locator('#migrateOut').count(),1);assert.equal(await old.page.locator('#migrateIn').count(),0);
 await old.page.locator('#appUpdate').click();assert.deepEqual(await old.page.evaluate(()=>calls.pop()),['update']);
 assert.deepEqual(old.errors,[]);await old.page.close();

 // New app with something already read here: import merges.
 const nw=await run('app.thetahatch.book',[book('A',{progress:10,lastReadAt:50,annotations:[{id:'n2',note:'こちらのメモ',updatedAt:5}],localName:'here-A'})]);
 const payload={manifest:{format:'theta-export-1',app:'book',from:{packageName:'jp.shinwakai.dsbooks.claude',versionName:'1.0.1-claude'}},
  storage:{'dsbooks.catalog':JSON.stringify([book('A',{progress:40,lastReadAt:100,annotations:[{id:'n1',note:'メモ',updatedAt:1},{id:'n2',note:'古い',updatedAt:2}]}),book('B',{progress:5,lastReadAt:20})]),'dsbooks.shares':'["/B"]','dsbooks.sort':'title'},
  nas:{base:'https://nas.local:5001',account:'reader'}};
 await nw.page.evaluate(p=>{window.__reload=0;DSMigrate.start({mode:'import',payload:p});},payload);
 const s2=await nw.page.locator('.migrate-sheet').textContent();assert.match(s2,/jp\.shinwakai\.dsbooks\.claude/);assert.match(s2,/nas\.local/);assert.match(s2,/パスワードはあとで入力/);
 await nw.page.evaluate(()=>{window.location.reload=()=>{};});
 await nw.page.locator('#migrateImport').click();
 const st=await nw.page.evaluate(()=>({cat:JSON.parse(localStorage.getItem('dsbooks.catalog')),host:localStorage.getItem('dsbooks.host'),acc:localStorage.getItem('dsbooks.migratedAccount'),shares:localStorage.getItem('dsbooks.shares'),done:calls.find(c=>c[0]==='done')}));
 const A=st.cat.find(b=>b.bookId==='b-A'),B=st.cat.find(b=>b.bookId==='b-B');
 assert.equal(st.cat.length,2);assert.equal(A.progress,40,'newer position wins');assert.equal(A.localName,'here-A','file saved in this app is kept');
 assert.deepEqual(A.annotations.map(a=>a.id+':'+a.note).sort(),['n1:メモ','n2:こちらのメモ'],'notes merged by id, newer edit wins');
 assert.equal(B.localName,null);assert.equal(B.offline,false,'files from the old app are not here');assert.equal(B.progress,5);
 assert.equal(st.host,'https://nas.local:5001');assert.equal(st.acc,'reader');assert.equal(st.shares,'["/B"]');assert.deepEqual(st.done,['done',true,'']);
 // The NAS form is prefilled with the migrated account.
 await nw.page.evaluate(()=>{closeModal();openConnectModal();});assert.equal(await nw.page.locator('#nasUser').inputValue(),'reader');
 // Errors are shown and reported to the hub.
 await nw.page.evaluate(()=>{closeModal();DSMigrate.start({mode:'import',error:'Theta Book Hatch（DSBooks）の書き出しファイルではありません'});});
 assert.match(await nw.page.locator('.migrate-sheet').textContent(),/書き出しファイルではありません/);await nw.page.locator('#migrateClose').click();
 assert.equal(await nw.page.evaluate(()=>calls.pop()[1]),false);
 // Settings on the new id: import from the old app.
 await nw.page.evaluate(()=>DSFeatures.settings());assert.equal(await nw.page.locator('#migrateIn').count(),1);assert.equal(await nw.page.locator('#migrateOut').count(),0);
 await nw.page.locator('#migrateIn').click();assert.deepEqual(await nw.page.evaluate(()=>calls.pop()),['choose']);
 assert.deepEqual(nw.errors,[]);
 console.log('PASS migrate: export contents (dsbooks.* only, no device files, no API key), hub cancel, settings by package, import merge (newer position, notes by id, local files kept/old ones dropped), NAS prefill, error report, update via hub');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
