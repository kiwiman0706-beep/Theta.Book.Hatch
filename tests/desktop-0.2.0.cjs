const {chromium}=require('playwright'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
// Desktop 0.2.0: one library for the main window, book windows and a DeskHatch drawer (separate browser storage),
// per-page event delivery, books opening in their own window, read-aloud speed change. Python server, no native windows.
const PY=process.env.DESKTOP_PYTHON||'python3',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dsbooks-desktop2-')),fx=path.join(tmp,'fixtures'),home=path.join(tmp,'home');
const APP=47941,NAS=47942,URL0=`http://127.0.0.1:${APP}/`;
execFileSync(PY,['tests/desktop/make_fixtures.py',fx]);
const server=spawn(PY,['tests/desktop/run_desktop_server.py',home,path.join(fx,'doc.pdf'),String(NAS),String(APP)],{env:{...process.env,DSBOOKS_TEST_WINDOWS:'1',DSBOOKS_TEST_DIALOG:JSON.stringify(['novel.epub','doc.pdf'].map(n=>path.join(fx,n)))},stdio:['ignore','pipe','inherit']});
const ready=new Promise((res,rej)=>{server.stdout.on('data',d=>{if(String(d).includes('ready'))res();});server.on('exit',c=>rej(new Error('server exit '+c)));});
const boot=p=>p.waitForFunction(()=>window.DSBoot&&DSBoot.readyMs!==undefined);
(async()=>{
 await ready;
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const errors=[];const ctx=async()=>{const c=await browser.newContext({viewport:{width:900,height:800}});await c.addInitScript(()=>{
   // Stub the PC voices so read-aloud can be checked headless.
   window.__utter=[];window.SpeechSynthesisUtterance=function(t){this.text=t;window.__utter.push(this);};
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speaking:false,paused:false,getVoices:()=>[{lang:'ja-JP'}],speak(u){this.speaking=true;this.cur=u;},cancel(){this.speaking=false;},pause(){this.paused=true;},resume(){this.paused=false;}}});});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return p;};
 const main=await ctx(),drawer=await ctx();
 await main.goto(URL0);await boot(main);
 // Import in the main window.
 await main.evaluate(()=>DSBooksNative.chooseBooks());await main.waitForFunction(()=>books.filter(b=>b.localName?.startsWith('import-')).length===2,null,{timeout:15000});
 // The drawer is a different browser profile (its own localStorage) but sees the same library.
 await drawer.goto(URL0);await boot(drawer);
 assert.equal(await drawer.evaluate(()=>books.filter(b=>b.localName?.startsWith('import-')).length),2,'drawer sees the library');
 // Opening a book from the drawer asks the app for a book window instead of opening in the drawer.
 const epubId=await drawer.evaluate(()=>books.find(b=>b.type==='ePub').id);
 await drawer.evaluate(id=>openLocalBook(books.find(b=>b.id===id)),epubId);
 assert.equal(await drawer.locator('#modalBg.open').count(),0);
 let opened=JSON.parse(await main.evaluate(()=>DSBooksNative.testOpened()));assert.equal(opened.length,1);assert.match(opened[0],new RegExp('^\\?reader='+encodeURIComponent(epubId).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'&w='));
 // Same book again: the existing window is brought forward, not duplicated.
 await main.evaluate(id=>openLocalBook(books.find(b=>b.id===id)),epubId);opened=JSON.parse(await main.evaluate(()=>DSBooksNative.testOpened()));assert.equal(opened.filter(q=>q.startsWith('?reader')).length,1);assert(opened.some(q=>q.startsWith('restored')));
 // The book window: opens straight into the reader, full window.
 const reader=await ctx();await reader.goto(URL0+opened[0]);await boot(reader);await reader.waitForSelector('#epubPage');
 assert.equal(await reader.evaluate(()=>getComputedStyle(document.querySelector('.app')).display),'none');
 await reader.locator('#epubNext').click();await reader.waitForFunction(()=>/第一章/.test(document.getElementById('epubPage').textContent));await reader.locator('#epubNext').click();await reader.waitForTimeout(150);
 const pos=await reader.evaluate(id=>books.find(b=>b.id===id).epubPositions,epubId);
 // Position reaches the main window and the drawer without reloading.
 for(const p of [main,drawer])await p.waitForFunction(([id,want])=>JSON.stringify(books.find(b=>b.id===id).epubPositions)===want,[epubId,JSON.stringify(pos)],{timeout:8000});
 // Per-page events: PDF pages requested by two pages come back to the right page.
 const pdfName=await main.evaluate(()=>books.find(b=>b.type==='PDF').localName);
 const ask=(p,page)=>p.evaluate(([n,page])=>new Promise(res=>{const tok='t'+page+Math.random();window.onPdfPage=(t,o)=>{if(t===tok)res(o.page);};DSBooksNative.renderPdfPage(n,page,tok);setTimeout(()=>res('timeout'),8000);}),[pdfName,page]);
 assert.deepEqual(await Promise.all([ask(main,0),ask(drawer,1)]),[0,1]);
 // Read-aloud speed change restarts the sentence at the new rate from the last spoken word.
 await reader.evaluate(()=>DSBooksNative.speakText('一文目です。二文目はもっと長い文章です。',1,'t','tok1'));
 assert.equal(await reader.evaluate(()=>speechSynthesis.cur.rate),1);
 await reader.evaluate(()=>{const u=speechSynthesis.cur;u.onboundary({charIndex:3,charLength:1});DSBooksNative.playbackAction('speed',0,1.5);});
 assert.deepEqual(await reader.evaluate(()=>[speechSynthesis.cur.rate,speechSynthesis.cur.text,JSON.parse(DSBooksNative.getPlaybackState()).speed]),[1.5,'です。',1.5]);
 await reader.evaluate(()=>speechSynthesis.cur.onend());assert.deepEqual(await reader.evaluate(()=>[speechSynthesis.cur.rate,speechSynthesis.cur.text]),[1.5,'二文目はもっと長い文章です。']);
 await reader.evaluate(()=>DSBooksNative.stopSpeech());
 // Closing the reader closes its window.
 await reader.evaluate(()=>closeModal());opened=JSON.parse(await main.evaluate(()=>DSBooksNative.testOpened()));assert(opened.some(q=>q.startsWith('closed ?reader=')));
 // macOS ⌘W closes a book window too (0.2.1); in the shelf it does nothing.
 await main.keyboard.press('Meta+KeyW');assert.equal(JSON.parse(await main.evaluate(()=>DSBooksNative.testOpened())).filter(q=>q.startsWith('closed')).length,1);
 await main.evaluate(id=>openLocalBook(books.find(b=>b.id===id)),epubId);opened=JSON.parse(await main.evaluate(()=>DSBooksNative.testOpened()));
 const reader2=await ctx();await reader2.goto(URL0+opened.filter(q=>q.startsWith('?reader')).pop());await boot(reader2);await reader2.waitForSelector('#epubPage');
 await reader2.keyboard.press('Meta+KeyW');assert.equal(JSON.parse(await main.evaluate(()=>DSBooksNative.testOpened())).filter(q=>q.startsWith('closed')).length,2,'⌘W closes the book window');
 // Survives an app restart: the store is on disk.
 assert(fs.existsSync(path.join(home,'storage.json')));assert(JSON.parse(fs.readFileSync(path.join(home,'storage.json'),'utf8'))['dsbooks.catalog'].includes('import-'));
 assert.deepEqual(errors,[]);console.log('PASS desktop 0.2: shared library main/drawer/book window, live position sync, book windows (open/focus/close, ⌘W), per-page events, read-aloud speed, store on disk');
 await browser.close();server.kill();
})().catch(e=>{console.error(e);server.kill();process.exit(1)});
