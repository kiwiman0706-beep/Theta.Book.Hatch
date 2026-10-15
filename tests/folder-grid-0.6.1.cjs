const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  if(localStorage.getItem("dsbooks.catalog"))return;
  const books=Array.from({length:19},(_,n)=>({id:'/8Books/'+(n<17?'音声本':'小説')+'/本'+n+'.'+(n<17?'m4b':'epub'),path:'/8Books/'+(n<17?'音声本':'小説')+'/本'+n+'.'+(n<17?'m4b':'epub'),title:'見やすさのテスト書籍 '+String(n).padStart(2,'0'),author:'テスト著者',type:n<17?'Audio':'ePub',remote:true,folder:n<17?'音声本':'小説',fileExt:n<17?'M4B':'EPUB',cover:'c1',progress:0,size:12345678}));
  localStorage.setItem('dsbooks.catalog',JSON.stringify(books));
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');
 assert.equal(await page.locator('.folder-shelf').count(),2);
 assert.equal(await page.locator('.folder-detail').count(),0);
 const rail=page.locator('.shelf-rail').first();assert(await rail.evaluate(e=>e.scrollWidth>e.clientWidth));
 await page.locator('.folder-shelf-name h3').filter({hasText:'音声本'}).click();
 const sizes=[];
 for(const width of [320,390,600,844,1280]){
  await page.setViewportSize({width,height:844});
  const state=await page.evaluate(()=>{const r=document.querySelector('.folder-detail .shelf-rail'),cards=[...r.querySelectorAll('.book-card:not([hidden])')],rects=cards.map(c=>c.getBoundingClientRect());return {width:innerWidth,count:cards.length,columns:rects.filter(c=>Math.abs(c.top-rects[0].top)<1).length,rows:new Set(rects.map(c=>Math.round(c.top))).size,overflow:r.scrollWidth>r.clientWidth,bodyOverflow:document.documentElement.scrollWidth>innerWidth,arrows:getComputedStyle(document.querySelector('.folder-shelf-actions')).display,allFit:rects.every(c=>c.left>=0&&c.right<=innerWidth)};});
  console.log(state);assert.equal(state.count,17);assert(state.rows>1);assert.equal(state.overflow,false);assert.equal(state.bodyOverflow,false);assert.equal(state.arrows,'none');assert(state.allFit);sizes.push(state);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.folder-detail').screenshot({path:'tests/folder-grid-0.6.1.png'});
 await page.locator('#sort').selectOption('title');
 assert.match(await page.locator('.folder-detail .book-title').first().textContent(),/00/);
 await page.locator('.folder-detail .book-card').first().click();assert(await page.locator('#modalBg').isVisible());assert.match(await page.locator('#modal').textContent(),/テスト書籍 00/);await page.locator('#modal .close').first().click();
 await page.reload();assert.equal(await page.locator('.folder-detail').count(),1);
 await page.locator('#search').fill('本03');assert.equal(await page.locator('.folder-detail .book-card').count(),0);
 await page.locator('#search').fill('03');assert.equal(await page.locator('.folder-detail .book-card').count(),1);
 await page.locator('#search').fill('');
 await page.locator('#allFolders').click();assert.equal(await page.locator('.folder-detail').count(),0);assert.equal(await page.locator('.folder-shelf').count(),2);assert(await page.locator('.shelf-rail').first().evaluate(e=>e.scrollWidth>e.clientWidth));
 await page.locator('#folderFilter').selectOption('音声本');assert.equal(await page.locator('.folder-detail .book-card').count(),17);
 await page.evaluate(()=>{books[0].series='シリーズ';books[1].series='シリーズ';render();});assert.equal(await page.locator('.folder-detail .book-card:visible').count(),16);assert.equal(await page.locator('.series-stack-button').count(),1);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,sizes,checks:'home rail, folder grid, rotation, title sort, open, reload, search, return, selection, series stack'}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
