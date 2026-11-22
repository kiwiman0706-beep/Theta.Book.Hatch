const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.1.5: the "Markdown" chip (now "Markdown・JISUI") also lists FullOCR books: a lone .jisui and an X.pdf + X.jisui
// work (shown once, with the PDF as its face). Plain PDFs/EPUBs stay out; the PDF chip still lists the pair's PDF.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();
  const mk=(file,type,ext)=>({id:'/8Books/▶技術書/'+file,path:'/8Books/▶技術書/'+file,title:file.replace(/\.[^.]+$/,''),folder:'▶技術書',remote:true,type,fileExt:ext,cover:'c1',size:1});
  localStorage.setItem('dsbooks.catalog',JSON.stringify([mk('心電図.pdf','PDF','PDF'),mk('心電図.jisui','Jisui','JISUI'),mk('単独.jisui','Jisui','JISUI'),mk('メモ.md','Markdown','MD'),mk('ふつう.pdf','PDF','PDF'),mk('小説.epub','ePub','EPUB')]));
  window.DSBooksNative=new Proxy({getAppVersion:()=> '1.1.5',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',hasBook:()=>false},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 const shown=async t=>{await page.evaluate(t=>{activeType=t;activeFolder='▶技術書';render();},t);return {count:await page.locator('#resultCount').textContent(),titles:(await page.locator('.book-card .book-title').allTextContents()).sort()};};
 assert.deepEqual(await shown('Markdown'),{count:'3冊',titles:['メモ','単独','心電図']},'md, lone jisui, and the pair');
 assert.equal(await page.evaluate(()=>DSWork.collapse(books.filter(mdReadable)).find(b=>b.title==='心電図').type),'PDF','the pair shows its PDF face');
 assert.deepEqual(await shown('PDF'),{count:'2冊',titles:['ふつう','心電図']});
 assert.equal(await page.locator('[data-type="Markdown"]').textContent(),'Markdown・JISUI');
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS md filter: Markdown・JISUI lists .md, lone .jisui and PDF+JISUI (PDF face); PDF chip unchanged');
})().catch(e=>{console.error(e);process.exit(1)});
