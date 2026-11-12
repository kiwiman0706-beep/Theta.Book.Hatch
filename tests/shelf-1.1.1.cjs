const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.1.1: Theta Hatch /shelf (Series spec THETA_SHARED_SETTINGS §4.2). The page sends reading → favourites → recent
// (each book once, at most 30) to DSBooksNative.updateShelf with title, subtitle and cover keys only; settings choose
// the sections. Mocked bridge.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const book=(id,o={})=>({id,bookId:'b-'+id,title:'本'+id,type:'PDF',fileExt:'PDF',path:'/B/'+id+'.pdf',remote:true,modifiedAt:7,size:1,...o});
 const catalog=[book('A',{progress:40,lastReadAt:300,currentPage:12,pageCount:200,author:'著者A',volume:'3',annotations:[{id:'n',note:'秘密のメモ'}]}),
  book('B',{favorite:true,lastReadAt:100,offline:true,localName:'dl-B'}),book('C',{favorite:true,progress:20,lastReadAt:200}),
  book('D',{lastReadAt:50,progress:100,readState:'finished'}),book('E')];
 for(let i=0;i<40;i++)catalog.push(book('R'+i,{lastReadAt:10+i}));
 await page.addInitScript(c=>{localStorage.clear();window.shelf=[];localStorage.setItem('dsbooks.settingsOpen','all');localStorage.setItem('dsbooks.catalog',JSON.stringify(c));
  window.DSBooksNative=new Proxy({appPackageName:()=>'app.thetahatch.book',hasBook:()=>true,loadCredentials:()=>'null',getPlaybackState:()=>'{"active":false}',
   updateShelf:j=>shelf.push(JSON.parse(j))},{get:(o,k)=>o[k]||(()=>''),has:()=>true});},catalog);
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 await page.waitForFunction(()=>shelf.length>0,null,{timeout:5000});
 const rows=await page.evaluate(()=>shelf.at(-1));
 assert.ok(rows.length<=30);
 assert.deepEqual(rows.filter(r=>r.section==='reading').map(r=>r.id),['A','C']);
 assert.deepEqual(rows.filter(r=>r.section==='favorites').map(r=>r.id),['B'],'C already shown under reading');
 assert.equal(rows[0].sectionTitle,'読みかけ');assert.equal(rows.find(r=>r.id==='B').sectionTitle,'お気に入り');
 const recent=rows.filter(r=>r.section==='recent');assert.equal(recent[0].id,'D');assert.equal(recent[0].sectionTitle,'最近');assert.ok(!rows.some(r=>r.id==='E'),'never opened');
 assert.equal(rows[0].title,'本A');assert.equal(rows[0].subtitle,'著者A・3巻・12/200ページ');assert.equal(recent[0].subtitle,'読了');
 assert.equal(rows[0].coverRemote,'remote:/B/A.pdf|7');assert.equal(rows.find(r=>r.id==='B').coverLocal,'dl-B');
 const json=JSON.stringify(rows);assert.ok(!json.includes('秘密'));assert.ok(!/nas|sid|password/i.test(json));
 // Settings: turn "最近" off.
 await page.evaluate(()=>DSFeatures.settings());const box=page.locator('[data-shelf="recent"]');assert.equal(await box.count(),1);
 await box.uncheck();const after=await page.evaluate(()=>shelf.at(-1));assert.ok(!after.some(r=>r.section==='recent'));
 assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('dsbooks.shelfSections'))).recent,false);
 // Same content is not sent twice.
 const n=await page.evaluate(()=>shelf.length);await page.evaluate(()=>saveCatalog());assert.equal(await page.evaluate(()=>shelf.length),n);
 assert.deepEqual(errors,[]);await browser.close();console.log('shelf 1.1.1 ok');
})().catch(e=>{console.error(e);process.exit(1)});
