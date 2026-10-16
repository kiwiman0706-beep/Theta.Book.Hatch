const {chromium}=require('playwright'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
// Desktop 0.1.0: the real Python server/bridge (no window) driven through the shared UI in Chromium.
// PY must have Pillow, PyMuPDF, mutagen (thumbnail-helper-release/requirements.txt). Fake DSM simulates the NAS.
const PY=process.env.DESKTOP_PYTHON||'python3',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dsbooks-desktop-')),fx=path.join(tmp,'fixtures'),home=path.join(tmp,'home');
const APP=47901,NAS=47902;
execFileSync(PY,['tests/desktop/make_fixtures.py',fx]);
const server=spawn(PY,['tests/desktop/run_desktop_server.py',home,path.join(fx,'doc.pdf'),String(NAS),String(APP)],{env:{...process.env,DSBOOKS_TEST_DIALOG:JSON.stringify(['novel.epub','doc.pdf','comic.cbz','bad.txt'].map(n=>path.join(fx,n)))},stdio:['ignore','pipe','inherit']});
const ready=new Promise((res,rej)=>{server.stdout.on('data',d=>{if(String(d).includes('ready'))res();});server.on('exit',c=>rej(new Error('server exit '+c)));});
fs.writeFileSync(path.join(fx,'bad.txt'),'x');
(async()=>{
 await ready;
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${APP}/`);await page.waitForFunction(()=>window.DSBoot&&DSBoot.readyMs!==undefined);
 assert.match(await page.evaluate(()=>DSBooksNative.getAppVersion()),/^0\.\d+\.\d+-desktop$/);
 // Bridge requires the per-run token.
 assert.equal(await page.evaluate(async()=>(await fetch('/bridge/getAppVersion',{method:'POST',body:'[]'})).status),403);
 // Import through the (test) file dialog: 3 books in, 1 rejected.
 await page.evaluate(()=>DSBooksNative.chooseBooks());await page.waitForFunction(()=>books.filter(b=>b.localName&&b.localName.startsWith('import-')).length===3,null,{timeout:15000});
 const imported=await page.evaluate(()=>books.filter(b=>b.localName?.startsWith('import-')).map(b=>[b.type,b.fileExt]));assert.deepEqual(imported.map(x=>x[0]).sort(),['Comic','PDF','ePub']);
 assert(fs.readdirSync(path.join(home,'books')).filter(n=>n.startsWith('import-')).length===3);
 // EPUB: Python port, rtl text book starts at the cover image, swipe-free next goes to text.
 await page.evaluate(()=>openLocalBook(books.find(b=>b.type==='ePub')));await page.waitForSelector('#epubPage img.epub-image');
 await page.keyboard.press('PageDown');await page.waitForFunction(()=>/第一章/.test(document.getElementById('epubPage')?.textContent||''));
 const pos=()=>page.evaluate(()=>DSFeatures.reader.position());const p1=await pos();await page.keyboard.press('ArrowRight');await page.waitForTimeout(150);assert.notDeepEqual(await pos(),p1,'→ turns a horizontal page');
 await page.keyboard.press('ArrowLeft');await page.waitForTimeout(150);assert.deepEqual(await pos(),p1,'← goes back');
 assert.equal(await page.evaluate(()=>books.find(b=>b.type==='ePub').chapterCount),3);
 assert.match(await page.locator('#epubPage').textContent(),/ 窓の外/);
 await page.evaluate(()=>closeModal());
 // PDF via PyMuPDF.
 await page.evaluate(()=>openLocalBook(books.find(b=>b.type==='PDF')));await page.waitForFunction(()=>document.getElementById('pdfImage')?.src?.startsWith('data:image/jpeg'),null,{timeout:15000});
 assert.match(await page.locator('#pdfPageLabel').textContent(),/2/);await page.evaluate(()=>closeModal());
 // CBZ in natural page order.
 await page.evaluate(()=>openLocalBook(books.find(b=>b.type==='Comic')));await page.waitForFunction(()=>/1\s*\/\s*3/.test(document.body.innerText),null,{timeout:15000});await page.evaluate(()=>closeModal());
 assert.equal(await page.evaluate(()=>{let r;window.onComicPage=(t,o)=>{r=o};DSBooksNative.renderComicPage(books.find(b=>b.type==='Comic').localName,1,'x');return new Promise(res=>{const i=setInterval(()=>{if(r){clearInterval(i);res(r.name)}},50)})}),'page2.png');
 // Thumbnail from the shared PC-helper code.
 const thumb=await page.evaluate(()=>new Promise(res=>{const name=books.find(b=>b.type==='ePub').localName,prev=window.onBookThumbnail;window.onBookThumbnail=(n,d)=>{prev?.(n,d);if(n===name)res(d);};DSBooksNative.requestBookThumbnail(name);}));assert.match(thumb,/^data:image\/jpeg;base64,/);
 // NAS relay: GET and POST to the fake DSM go through /proxy.
 const echo=await page.evaluate(async n=>(await (await fetch(`http://127.0.0.1:${n}/webapi/query.cgi?x=hello`)).json()).data.echo,NAS);assert.equal(echo,'hello');
 const posted=await page.evaluate(async n=>(await (await fetch(`http://127.0.0.1:${n}/webapi/entry.cgi`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'a=1&b=%E6%9C%AC'})).json()).data.posted,NAS);assert.equal(posted,'a=1&b=%E6%9C%AC');
 assert.equal(await page.evaluate(async()=>{try{await fetch('http://127.0.0.1:1/x');return 'ok'}catch(e){return e.name}}),'TypeError');
 // Downloads: run one, queue the second, then both saved; wrong session reports DSM_SESSION_EXPIRED.
 await page.evaluate(n=>{window.dlResults=[];const prev=window.onNativeDownload;window.onNativeDownload=r=>{dlResults.push(r);prev?.(r);};
  DSBooksNative.downloadBook(`http://127.0.0.1:${n}`,'entry.cgi','2','good','/Books/本/sample.pdf','sample','application/pdf','nas-1',0);
  DSBooksNative.downloadBook(`http://127.0.0.1:${n}`,'entry.cgi','2','good','/Books/本/second.pdf','second','application/pdf','nas-2',0);},NAS);
 await page.waitForFunction(()=>dlResults.filter(r=>r.ok).length===2,null,{timeout:15000});
 assert.deepEqual(await page.evaluate(()=>dlResults.map(r=>r.id)),['nas-1','nas-2']);
 const saved=await page.evaluate(()=>dlResults[0].localName);assert.equal(await page.evaluate(n=>DSBooksNative.hasBook(n),saved),true);
 await page.evaluate(n=>DSBooksNative.downloadBook(`http://127.0.0.1:${n}`,'entry.cgi','2','bad','/Books/本/sample.pdf','x','application/pdf','nas-3',0),NAS);
 await page.waitForFunction(()=>dlResults.some(r=>r.id==='nas-3'),null,{timeout:10000});assert.equal(await page.evaluate(()=>dlResults.find(r=>r.id==='nas-3').error),'DSM_SESSION_EXPIRED');
 // Saved audio/media files are served with Range.
 const media=await page.evaluate(async n=>{const u=DSBooksNative.mediaUrl(n);const r=await fetch(u,{headers:{Range:'bytes=0-3'}});return [r.status,new Uint8Array(await r.arrayBuffer()).length,r.headers.get('Content-Range')];},saved);
 assert.equal(media[0],206);assert.equal(media[1],4);assert.match(media[2],/^bytes 0-3\//);
 // NAS audio relay keeps Range (stream while not saved).
 const stream=await page.evaluate(async n=>{const spec={base:`http://127.0.0.1:${n}`,apiPath:'entry.cgi',version:2,sid:'good',path:'/Books/本/sample.pdf'};const r=await fetch('/nas-stream?t='+encodeURIComponent(window.__DSBOOKS_TOKEN)+'&spec='+encodeURIComponent(JSON.stringify(spec)),{headers:{Range:'bytes=4-'}});return [r.status,(await r.arrayBuffer()).byteLength];},NAS);
 assert.equal(stream[0],206);assert.equal(stream[1],fs.statSync(path.join(fx,'doc.pdf')).size-4);
 // Credentials round trip (Linux test: private file; Windows uses DPAPI).
 await page.evaluate(()=>DSBooksNative.saveCredentials('http://nas','me','pw','sid'));assert.equal(JSON.parse(await page.evaluate(()=>DSBooksNative.loadCredentials())).account,'me');
 // Desktop menu entries.
 await page.locator('#appMenuBtn').click();assert.equal(await page.locator('[data-menu="libraryTools"]').count(),1);assert.equal(await page.locator('[data-menu="dataFolder"]').count(),1);await page.keyboard.press('Escape');
 // Escape works as Android Back on dialogs.
 await page.evaluate(()=>openBook(books[0].id));await page.keyboard.press('Escape');assert.equal(await page.locator('#modalBg.open').count(),0);
 // Library survives a reload (fixed origin + localStorage).
 await page.reload();await page.waitForFunction(()=>window.DSBoot&&DSBoot.readyMs!==undefined);assert.equal(await page.evaluate(()=>books.filter(b=>b.localName?.startsWith('import-')).length),3);
 assert.deepEqual(errors,[]);console.log('PASS desktop: keyboard paging, token guard, import dialog, EPUB(port)/PDF/CBZ, thumbnail, NAS relay GET/POST/error, download queue + session error, media Range, NAS stream Range, credentials, PC menu, Escape=Back, persistence');
 await browser.close();server.kill();
})().catch(e=>{console.error(e);server.kill();process.exit(1)});
