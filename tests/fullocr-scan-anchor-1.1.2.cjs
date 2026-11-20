const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.1.2 review additions: (1) a scan limited to prefixed folders (⑧…, the default) also finds .jisui files (the walk's
// extension list missed them, so X.jisui beside X.pdf never reached the shelf); (2) a FullOCR page marker that falls
// inside a folded callout or a $$ formula is kept as a page anchor after the block instead of showing as text.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('dsbooks.folderPrefix','⑧');localStorage.setItem('dsbooks.shares',JSON.stringify(['/8Books']));
  window.texts={'ch.md':['<!-- fullocr:page pdf=11 print="3" -->','','本文。','',
   '> [!info]- 表のテキスト','> 行1','> <!-- fullocr:page pdf=12 print="4" -->','> 行2','',
   '$$','a+b','<!-- fullocr:page pdf=13 print="5" -->','=c','$$','','最後。'].join('\n')};
  window.DSBooksNative=new Proxy({getAppVersion:()=> '1.1.2',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',
   hasBook:n=>n==='ch.md',readText:n=>texts[n]??null},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 // (1) Prefix scan: /8Books/⑧医学書/ has X.pdf, X.jisui and an unrelated file; B (no prefix) is not read.
 await page.evaluate(async()=>{
  DSConnection.ensure=async()=>true;dsmConn={base:'http://100.64.0.1:5000',sid:'t',apis:{'SYNO.FileStation.List':{},'SYNO.FileStation.Search':{}}};
  dsmCall=async(api,method,p)=>{
   if(p.folder_path==='/8Books')return {data:{files:[{path:'/8Books/⑧医学書',name:'⑧医学書',isdir:true},{path:'/8Books/B',name:'B',isdir:true}],total:2}};
   const f=n=>({path:p.folder_path+'/'+n,name:n,isdir:false,additional:{size:100,time:{mtime:100}}});
   return {data:{files:[f('X.pdf'),f('X.jisui'),f('memo.txt')],total:3}};
  };
  await scanLibrary(['/8Books']);
 });
 const found=await page.evaluate(()=>books.filter(b=>b.remote&&!b.stale).map(b=>b.path).sort());
 assert.deepEqual(found,['/8Books/⑧医学書/X.jisui','/8Books/⑧医学書/X.pdf']);
 assert.equal(await page.evaluate(()=>books.find(b=>b.path.endsWith('.jisui')).type),'Jisui');
 // (2) Page markers inside a callout / formula.
 await page.evaluate(()=>{books.push({id:'ch',path:'/B/本/01_章.md',title:'01_章',folder:'本',type:'Markdown',fileExt:'MD',cover:'c1',size:1,localName:'ch.md',offline:true});openLocalBook(books.find(b=>b.id==='ch'));});
 await page.waitForSelector('#mdPage');const md=page.locator('#mdPage');
 assert.deepEqual(await md.locator('.fo-anchor').evaluateAll(xs=>xs.map(x=>x.dataset.pdf)),['11','12','13']);
 const text=await md.textContent();assert.doesNotMatch(text,/⟦|fullocr/);
 assert.match(await md.locator('.md-callout-body').innerHTML(),/^行1<br>行2$/);
 assert.equal(await md.locator('.md-math code').textContent(),'a+b\n=c');
 assert.equal(await md.locator('details .fo-anchor, .md-math .fo-anchor').count(),0,'anchors sit after the blocks');
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS fullocr 1.1.2 review: prefix scan finds .jisui, page markers inside callouts/formulas stay anchors');
})().catch(e=>{console.error(e);process.exit(1)});
