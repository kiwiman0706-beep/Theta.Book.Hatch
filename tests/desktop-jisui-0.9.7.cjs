const {chromium}=require('playwright'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
// Desktop 0.2.2 / Theta.Jisui.Viewer: real .jisui ZIPs through the Python bridge. --viewer with a file argument,
// members read from the ZIP, picture data URL, embedded PDF rendered (PyMuPDF) from the streamed-out member,
// a second launch hands its file over (/open), sidecar PDF beside the .jisui, "delete" never removes the user's file.
const PY=process.env.DESKTOP_PYTHON||'python3',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jisui-desktop-')),lib=path.join(tmp,'lib'),home=path.join(tmp,'home');
const PORT=47951,URL0=`http://127.0.0.1:${PORT}/`,env={...process.env,DSBOOKS_DESKTOP_HOME:home,DSBOOKS_DESKTOP_PORT:String(PORT)};
execFileSync(PY,['tests/desktop/make_jisui.py',lib]);
const server=spawn(PY,['desktop/dsbooks_desktop.py','--serve-only','--viewer',path.join(lib,'ねころん.jisui')],{env,stdio:['ignore','pipe','inherit']});
const ready=new Promise((res,rej)=>{server.stdout.on('data',d=>{if(String(d).includes('127.0.0.1'))res();});server.on('exit',c=>rej(new Error('server exit '+c)));});
(async()=>{
 await ready;
 assert.deepEqual(JSON.parse(execFileSync('curl',['-s',URL0+'ping']).toString()),{app:'jisuiviewer'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:900,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(URL0);await page.waitForFunction(()=>window.DSBoot&&DSBoot.readyMs!==undefined);
 // The file from the command line opens by itself, in place (no copy into the app's folder).
 await page.waitForSelector('#mdPage',{timeout:15000});assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('viewer-mode')),true);
 const c=await page.evaluate(()=>books.find(b=>b.type==='Jisui'));assert.match(c.localName,/^ext-/);assert.equal(c.title,'ねころんで読めるてんかん診療');
 assert.deepEqual(fs.readdirSync(path.join(home,'books')),[],'nothing copied');
 await page.locator('.md-wikilink').click();await page.waitForSelector('#mdOriginal');
 assert.match(await page.locator('#mdPage img.md-figure').getAttribute('src'),/^data:image\/png;base64,iVBOR/);
 await page.locator('#mdOriginal').click();await page.waitForFunction(()=>/^9 \/ 12/.test(document.getElementById('pdfPageLabel')?.textContent||''),null,{timeout:15000});
 assert.match(await page.locator('#pdfImage').getAttribute('src'),/^data:image\//);
 // Second launch with another file: handed to the running viewer, which opens it.
 execFileSync(PY,['desktop/dsbooks_desktop.py','--viewer',path.join(lib,'side.jisui')],{env,timeout:20000});
 await page.waitForFunction(()=>books.some(b=>b.type==='Jisui'&&b.importName==='side.jisui'),null,{timeout:10000});
 const side=await page.evaluate(()=>books.find(b=>b.importName==='side.jisui').id);
 await page.evaluate(id=>openLocalBook(books.find(b=>b.id===id+'!01_第1章.md')||books.find(b=>b.id===id)),side);await page.waitForSelector('#mdPage');
 await page.evaluate(id=>openLocalBook(books.find(b=>b.id===id+'!01_第1章.md')),side);await page.waitForSelector('#mdOriginal');
 await page.locator('#mdOriginal').click();await page.waitForFunction(()=>/^9 \/ 14/.test(document.getElementById('pdfPageLabel')?.textContent||''),null,{timeout:15000});
 // "Delete" of a file opened in place only forgets it.
 assert.equal(await page.evaluate(n=>DSBooksNative.deleteBook(n),c.localName),true);assert.equal(fs.existsSync(path.join(lib,'ねころん.jisui')),true);
 assert.deepEqual(errors,[]);console.log('PASS desktop jisui: viewer mode + /ping id, CLI file opens in place, ZIP members & picture, embedded PDF rendered, second launch → /open, sidecar PDF, delete keeps the file');
 await browser.close();server.kill();
})().catch(e=>{console.error(e);server.kill();process.exit(1)});
