const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.8.6-preview',hasBook:()=>true,loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}'}, {get:(o,k)=>o[k]||(()=> '')});
  if(localStorage.getItem('dsbooks.catalog'))return;
  const xs=Array.from({length:85},(_,i)=>({id:'/Books/'+(i<80?'小説':'音声')+'/本'+i+'.epub',path:'/Books/'+(i<80?'小説':'音声')+'/本'+i+'.epub',title:'本 '+(i+1),author:i%2?'作家B':'作家A',folder:i<80?'小説':'音声',remote:true,type:'ePub',fileExt:'EPUB',cover:'c1',size:(i+1)*1024,modifiedAt:1700000000000+i*1000,lastReadAt:i===30?1750000000000:0,progress:i===30?40:i===31?100:0,readState:i===31?'finished':undefined,offline:i===30,localName:i===30?'test.epub':null}));
  [0,1,9].forEach(i=>Object.assign(xs[i],{series:'連作',volume:String(i+1)}));
  xs.push({id:'/Books/音声/朗読.m4b',path:'/Books/音声/朗読.m4b',title:'朗読',type:'Audio',fileExt:'M4B',folder:'音声',remote:true,cover:'c4',size:400000,offline:true,localName:'audio.m4b',progress:20});
  xs.push({...xs.at(-1),id:'/Books/音声/朗読.pdf',path:'/Books/音声/朗読.pdf',type:'PDF',fileExt:'PDF',offline:false,localName:null,progress:0,size:50000});
  localStorage.setItem('dsbooks.catalog',JSON.stringify(xs));
 });
 const url='file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html';
 await page.goto(url);await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 await page.locator('[data-library-view="list"]').click();
 assert.equal(await page.locator('.book-list-row').count(),72);assert.equal(await page.locator('#resultCount').textContent(),'86冊');
 await page.locator('#pinReading').uncheck();await page.locator('#sort').selectOption('title');
 const titles=()=>page.locator('.book-list .book-title').allTextContents();
 assert.deepEqual((await titles()).slice(0,3),['本 1','本 2','本 3']);
 await page.locator('#sortDirection').selectOption('desc');assert.equal((await titles())[0],'朗読');
 await page.locator('#sort').selectOption('size');assert.equal((await titles())[0],'朗読');
 assert.match(await page.locator('.book-list-row').first().textContent(),/M4B \+ PDF/);assert.match(await page.locator('.book-list-row').first().textContent(),/一部保存 1\/2/);
 await page.locator('#sortDirection').selectOption('asc');assert.equal((await titles())[0],'本 1');
 await page.locator('#sort').selectOption('lastRead');assert.equal((await titles())[0],'本 31');
 await page.locator('#sort').selectOption('series');assert.deepEqual((await titles()).slice(0,3),['本 1','本 2','本 10']);
 await page.locator('#sort').selectOption('title');await page.locator('#pinReading').check();assert.equal((await titles())[0],'本 31');assert.notEqual((await titles())[1],'本 32');
 await page.locator('#pinReading').uncheck();await page.locator('#libraryPages button').last().click();assert.equal(await page.locator('.book-list-row').count(),14);
 await page.locator('#sortDirection').selectOption('desc');assert.equal(await page.locator('#libraryPages span').textContent(),'1 / 2');
 await page.reload();await page.waitForFunction(()=>DSBoot.readyMs!==undefined);assert.equal(await page.locator('#bookGrid').getAttribute('class'),'book-list');assert.equal(await page.locator('#sortDirection').inputValue(),'desc');assert.equal(await page.locator('#pinReading').isChecked(),false);
 await page.locator('#search').fill('朗読');await page.waitForTimeout(230);assert.equal(await page.locator('.book-list-row').count(),1);assert(await page.locator('#libraryPages').isHidden());
 await page.locator('.book-list-row').press('Enter');assert.equal(await page.locator('#modalBg.open').count(),1);assert(await page.evaluate(()=>dsbooksHandleBack()));
 await page.locator('#clearLibraryFilters').click();await page.locator('#folderFilter').selectOption('小説');assert.equal(await page.locator('.book-list-row').count(),72);assert(await page.locator('#coverDensity').isHidden());
 assert(await page.evaluate(()=>dsbooksHandleBack()));assert.equal(await page.evaluate(()=>activeFolder),'');assert.equal(await page.locator('#bookGrid').getAttribute('class'),'book-list');
 await page.locator('.list-folder').filter({hasText:'音声'}).first().click();assert.equal(await page.locator('#resultCount').textContent(),'6冊');assert.equal(await page.locator('#modalBg.open').count(),0);
 await page.locator('[data-library-view="grid"]').click();assert.equal(await page.locator('.folder-detail').count(),1);assert(await page.locator('#coverDensity').isVisible());
 await page.locator('[data-library-view="flow"]').click();assert.equal(await page.locator('#bookGrid').getAttribute('class'),'coverflow');
 await page.locator('[data-library-view="list"]').click();await page.locator('#libraryHome').click();
 for(const width of [320,390,800,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow at '+width);}
 await page.setViewportSize({width:390,height:844});await page.locator('#bookGrid').scrollIntoViewIfNeeded();await page.screenshot({path:'tests/library-list-0.8.6.png'});
 // Large catalogs remain paged; filtering searches beyond the rendered page.
 await page.evaluate(()=>{books=Array.from({length:12000},(_,i)=>({id:String(i),title:'Large '+i,type:'ePub',fileExt:'EPUB',folder:'大量',remote:true,cover:'c1'}));render();});
 assert.equal(await page.locator('.book-list-row').count(),72);await page.locator('#search').fill('Large 11999');await page.waitForTimeout(240);assert.equal(await page.locator('.book-list-row').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS list: natural sorting, direction, reading pin, grouping, formats, progress, paging, search, folder/Back, persistence, 320–1280px, 12000 books');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
