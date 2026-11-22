const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.1.4: the library catalog of a big NAS (≈15,000 books) exceeded the WebView's localStorage quota ("Setting the value
// of 'dsbooks.catalog' exceeded the quota"). On Android it now lives in the app's files (DSBooksNative.storeGet/Set);
// a catalog left in localStorage by an older version moves there once; the migration export still carries it; without
// the native store (desktop, browser) nothing changes. Mocked bridge.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const book=(i)=>({id:'/8Books/▶青空文庫/著者'+(i%500)+'/作品'+i+'/作品'+i+'.epub',path:'/8Books/▶青空文庫/著者'+(i%500)+'/作品'+i+'/作品'+i+'.epub',title:'作品'+i+'（青空文庫の長めの題名がここに入ります）',author:'著者'+(i%500),folder:'▶青空文庫',remote:true,type:'ePub',fileExt:'EPUB',genre:'NAS',cover:'c1',offline:false,localName:null,progress:0,currentPage:0,pageCount:0,bookmarkPage:null,modifiedAt:1700000000,size:123456,stale:false,libraryExcluded:false,bookId:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),tags:[],annotations:[]});
 const run=async(native,old)=>{
  const page=await browser.newPage({viewport:{width:390,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(([native,old])=>{
   if(sessionStorage.getItem('setup'))return;sessionStorage.setItem('setup','1');localStorage.clear();window.store={};
   if(old)localStorage.setItem('dsbooks.catalog',old);
  },[native,old]);
  await page.addInitScript(native=>{
   window.store=window.store||{};
   const api={getAppVersion:()=> '1.1.4',appPackageName:()=> 'app.thetahatch.book',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',hasBook:()=>false,migrationExport:j=>window.exported=JSON.parse(j)};
   if(native)Object.assign(api,{nativeStoreVersion:()=>1,storeGet:k=>window.top.name&&JSON.parse(window.top.name)[k]!==undefined?JSON.parse(window.top.name)[k]:null,
    storeSet:(k,v)=>{const s=JSON.parse(window.top.name||'{}');s[k]=v;window.top.name=JSON.stringify(s);return true;},storeRemove:k=>{const s=JSON.parse(window.top.name||'{}');delete s[k];window.top.name=JSON.stringify(s);return true;},storeKeys:()=>JSON.stringify(Object.keys(JSON.parse(window.top.name||'{}')))});
   window.DSBooksNative=new Proxy(api,{get:(o,k)=>o[k]||(()=> '')});
  },native);
  await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
  return {page,errors};
 };
 // A catalog larger than the quota is saved natively.
 const n=await run(true,JSON.stringify([book(1),book(2)]));
 assert.equal(await n.page.evaluate(()=>DSStore.native),true);
 const lsKeys=()=>n.page.evaluate(()=>{const o=[];for(let i=0;i<localStorage.length;i++)o.push(localStorage.key(i));return o;});
 assert.equal((await lsKeys()).includes('dsbooks.catalog'),false,'moved out of localStorage');
 assert.equal(await n.page.evaluate(()=>books.filter(b=>b.remote).length),2,'old catalog read back from the native store');
 const big=await n.page.evaluate(([src])=>{const make=new Function('return '+src)();const list=[];for(let i=0;i<15000;i++)list.push(make(i));books=list;saveCatalog();return JSON.stringify(list).length;},[book.toString()]);
 assert.ok(big>5_500_000,'fixture larger than the quota: '+big);
 assert.equal(await n.page.evaluate(()=>JSON.parse(localStorage.getItem('dsbooks.catalog')).length),15000);
 assert.equal(await n.page.evaluate(()=>JSON.parse(JSON.parse(window.top.name)['dsbooks.catalog']).length),15000,'written to the native store');
 // Other keys stay in localStorage; the migration export still carries the catalog.
 await n.page.evaluate(()=>localStorage.setItem('dsbooks.sort','title'));assert.equal((await lsKeys()).includes('dsbooks.sort'),true);assert.equal((await lsKeys()).includes('dsbooks.catalog'),false);
 await n.page.evaluate(()=>{localStorage.setItem('dsbooks.catalog',JSON.stringify([{id:'x',path:'/x.pdf',title:'x'}]));});
 await n.page.evaluate(()=>DSMigrate.start({mode:'export',hub:true}));await n.page.locator('#migrateExport').click();
 assert.equal(JSON.parse(await n.page.evaluate(()=>window.exported['dsbooks.catalog'])).length,1,'export includes the native catalog');
 assert.deepEqual(n.errors,[]);await n.page.close();
 // Without a native store: localStorage as before (the quota error is still possible there, e.g. the desktop page).
 const w=await run(false,JSON.stringify([book(1)]));
 assert.equal(await w.page.evaluate(()=>DSStore.native),false);
 assert.equal(await w.page.evaluate(()=>{for(let i=0;i<localStorage.length;i++)if(localStorage.key(i)==='dsbooks.catalog')return JSON.parse(localStorage.getItem('dsbooks.catalog')).length;return -1;}),1);
 const quota=await w.page.evaluate(([src])=>{const make=new Function('return '+src)();const list=[];for(let i=0;i<15000;i++)list.push(make(i));try{localStorage.setItem('dsbooks.catalog',JSON.stringify(list));return 'saved';}catch(e){return e.name;}},[book.toString()]);
 assert.equal(quota,'QuotaExceededError','the same catalog overflows localStorage (the reported error)');
 assert.deepEqual(w.errors,[]);await browser.close();
 console.log('PASS native store: 15,000-book catalog saved outside localStorage, old catalog moved once, other keys untouched, migration export carries it, no native store = localStorage');
})().catch(e=>{console.error(e);process.exit(1)});
