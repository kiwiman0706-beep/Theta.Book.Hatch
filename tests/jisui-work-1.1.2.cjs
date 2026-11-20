const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.1.2: FullOCR's bookhatch preset writes X.jisui (MD vault, 原文 = sidecar X.pdf) beside the original X.pdf on the NAS.
// The shelf shows them as one book (PDF + JISUI); a .jisui with no PDF of the same name stays its own book.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();
  const mk=(id,file,type,ext)=>({id,path:'/8Books/医学書/'+file,title:file.replace(/\.[^.]+$/,''),folder:'医学書',remote:true,type,fileExt:ext,cover:'c1',size:1});
  localStorage.setItem('dsbooks.catalog',JSON.stringify([mk('p','3秒で心電図を読む本.pdf','PDF','PDF'),mk('j','3秒で心電図を読む本.jisui','Jisui','JISUI'),mk('o','別の本.jisui','Jisui','JISUI')]));
  window.DSBooksNative=new Proxy({getAppVersion:()=> '1.1.2',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',hasBook:()=>false,readText:()=>null},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 await page.evaluate(()=>{activeFolder='医学書';render();});
 const titles=await page.locator('.book-card .book-title').allTextContents();
 assert.deepEqual(titles.sort(),['3秒で心電図を読む本','別の本'],'X.pdf + X.jisui = one book');
 assert.equal(await page.locator('.book-card .work-formats').count(),1);
 assert.deepEqual((await page.locator('.book-card .work-formats').textContent()).split(' + ').sort(),['JISUI','PDF']);
 // The book's sheet lists both formats.
 await page.locator('.book-card',{hasText:'3秒で心電図を読む本'}).first().click();await page.waitForSelector('#workAssets');
 assert.match(await page.locator('#workAssets').textContent(),/JISUI/);assert.match(await page.locator('#workAssets').textContent(),/PDF/);
 assert.deepEqual(errors,[]);console.log('PASS jisui work: X.pdf + X.jisui on the NAS = one book (PDF + JISUI) with both formats in its sheet; lone .jisui stays separate');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
