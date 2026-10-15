const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
 const catalog=[1,2,3].map(n=>({id:'/books/Test '+n+'.epub',path:'/books/Test '+n+'.epub',title:'テスト小説 '+n,author:'作家',type:'ePub',remote:true,localName:'test'+n+'.epub',fileExt:'EPUB',offline:true,folder:'小説',cover:'c1',progress:0,size:1000,series:'テストシリーズ',volume:String(n)}));
 localStorage.clear();localStorage.setItem('dsbooks.catalog',JSON.stringify(catalog));
 window.DSBooksNative=new Proxy({hasBook:()=>true,getAppVersion:()=> '0.5.0-preview',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',loadCredentials:()=> 'null',getStorageInfo:()=>'{"usable":999999999}',getEpubChapter:(local,index)=>JSON.stringify({ok:true,index,count:2,title:'テスト第'+(index+1)+'章',html:Array.from({length:160},(_,i)=>'<p>これは表示確認用の文章です。番号'+i+'。一行ずつ読み進めて、ページの境界と再開位置を確認します。漢字とひらがなを含む日本語の本文です。</p>').join(''),progressWeights:[16000,16000]})},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForTimeout(300);
 assert.equal(await page.locator('.series-stack-button').count(),1);
 await page.locator('.series-stack-button').click();assert.equal(await page.locator('#seriesList button').count(),3);
 await page.locator('#seriesList button').first().click();await page.locator('[data-open]').first().click();await page.waitForTimeout(300);
 const geometry=()=>page.evaluate(()=>{const v=document.getElementById('epubViewport'),p=document.getElementById('epubPage');return {w:v.clientWidth,left:v.scrollLeft,scroll:v.scrollWidth,padding:getComputedStyle(p).paddingLeft,count:document.getElementById('epubCount').textContent,overflow:document.documentElement.scrollWidth>innerWidth};});
 const first=await geometry();assert.equal(first.left,0);assert.equal(first.overflow,false);
 await page.locator('#epubNext').click();const next=await geometry();assert.equal(next.left,next.w);assert(next.count.includes('2/'));
 await page.locator('#epubChapter').click();await page.locator('#jumpPage').fill('9999');await page.locator('#jumpReader').click();const last=await geometry();assert.equal(last.left%last.w,0);await page.locator('#epubChapter').click();await page.locator('#jumpPage').fill('2');await page.locator('#jumpReader').click();
 await page.locator('#epubNotes').click();await page.locator('#noteText').fill('テストメモ');await page.locator('#saveNote').click();assert.equal(await page.locator('#notesList .feature-row').count(),1);
 await page.locator('.reader-panel .close').click();await page.locator('.reader-top .close').click();
 await page.evaluate(()=>openLocalBook(books[0]));await page.waitForTimeout(300);assert.equal((await geometry()).left,next.w);
 await page.locator('#epubPrefs').click();await page.locator('#readerFont').selectOption('1.5');await page.locator('#readerTheme').selectOption('night');await page.locator('#applyReaderPrefs').click();assert.equal(await page.locator('#epubReader.night').count(),1);
 await page.locator('#epubChapter').click();await page.locator('#jumpPage').fill('5');await page.locator('#jumpReader').click();const jump=await geometry();assert.equal(jump.left,4*jump.w);
 await page.locator('#readerMenu').click();await page.locator('#searchChapter').click();await page.locator('#chapterQuery').fill('番号50');await page.locator('#findChapter').click();assert.equal(await page.locator('#epubPage mark').count(),1);
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(350);const rotated=await geometry();assert.equal(rotated.left%rotated.w,0);
 await page.screenshot({path:'tests/reader-desktop-smoke.png'});
 await page.locator('.reader-top .close').click();await page.evaluate(()=>DSFeatures.settings());assert.equal(await page.locator('#exportReading').count(),1);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,tests:'series, bookmarks, page navigation, resume, theme, search, resize, settings',first,next,jump,rotated}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
