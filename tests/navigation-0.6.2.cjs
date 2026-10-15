const inSheet=async(page,fn)=>{await page.locator('#libraryControlsOpen').click();await fn();await page.locator('#libraryControls .lib-sheet-done').click();};
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.6.2-preview',hasBook:()=>true,loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',getStorageInfo:()=>'{"usable":999999999}'},{get:(o,k)=>o[k]||(()=> '')});
  if(localStorage.getItem('dsbooks.catalog'))return;
  const books=Array.from({length:30},(_,i)=>({id:'/Books/'+(i<20?'小説':'音声本')+'/本'+i+'.epub',path:'/Books/'+(i<20?'小説':'音声本')+'/本'+i+'.epub',title:'テスト本 '+String(i).padStart(2,'0'),author:'作家',type:'ePub',fileExt:'EPUB',remote:true,folder:i<20?'小説':'音声本',cover:'c1',size:1234,offline:i<4,localName:i<4?'book'+i+'.epub':null,progress:i<2?i*20+10:0}));
  for(const [i,v] of [[0,'1'],[1,'2'],[2,'10'],[20,'3']])Object.assign(books[i],{series:'同じシリーズ',volume:v});
  books.push({...books[0],id:books[0].id.replace('.epub','.pdf'),path:books[0].path.replace('.epub','.pdf'),type:'PDF',fileExt:'PDF',localName:'book0.pdf'});
  localStorage.setItem('dsbooks.catalog',JSON.stringify(books));
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForTimeout(100);
 assert.deepEqual(await page.locator('.summary .pill b').allTextContents(),['30冊','4冊','2冊','0冊']);
 assert.equal(await page.evaluate(()=>dsbooksHandleBack()),false);
 await page.locator('.folder-shelf-name h3').filter({hasText:'小説'}).click();await page.waitForTimeout(100);
 assert.equal(await page.locator('.folder-detail').count(),1);
 const cols=()=>page.locator('.folder-detail .shelf-rail').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
 await inSheet(page,()=>page.locator('#coverDensity').selectOption('compact'));const small=await cols();await inSheet(page,()=>page.locator('#coverDensity').selectOption('large'));const large=await cols();assert(small>large);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await inSheet(page,()=>page.locator('#sort').selectOption('title'));await page.reload();await page.waitForTimeout(100);assert.equal(await page.locator('#coverDensity').inputValue(),'large');assert.equal(await page.locator('#sort').inputValue(),'title');
 // A book detail and its nested panel consume Back before the folder does.
 await page.evaluate(()=>openBook(books[0].id));assert.equal(await page.locator('.series-jump').count(),1);assert(await page.locator('[data-series-direction="-1"]').isDisabled());
 await page.locator('[data-series-direction="1"]').click();assert.match(await page.locator('#modal h2').first().textContent(),/01/);
 await page.locator('[data-series-direction="1"]').click();assert.match(await page.locator('#modal h2').first().textContent(),/02/);assert(await page.locator('[data-series-direction="1"]').isDisabled());
 await page.locator('#seriesVolumes').click();assert.equal(await page.locator('#seriesVolumeList button').count(),3);
 assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);assert.equal(await page.locator('.reader-panel').count(),0);assert.equal(await page.locator('#modalBg.open').count(),1);
 assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);assert.equal(await page.locator('#modalBg.open').count(),0);assert.equal(await page.locator('.folder-detail').count(),1);
 assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);await page.waitForTimeout(100);assert.equal(await page.locator('.folder-detail').count(),0);assert.equal(await page.evaluate(()=>activeNav),'home');assert.equal(await page.evaluate(()=>dsbooksHandleBack()),false);
 // Filtering cannot leave stale state when Back or a navigation tab returns home.
 await inSheet(page,async()=>{await page.locator('#readingFilter').selectOption('reading');await page.locator('#tagFilter').fill('なし');});await page.locator('#search').fill('テスト');
 assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);assert.equal(await page.locator('#readingFilter').inputValue(),'all');assert.equal(await page.locator('#tagFilter').inputValue(),'');assert.equal(await page.locator('#search').inputValue(),'');
 await page.locator('.bottomnav [data-nav="downloaded"]').click();assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);assert.equal(await page.evaluate(()=>activeNav),'home');
 // Home shelf horizontal position survives entering a folder and going back.
 const rail=page.locator('.folder-shelf').filter({hasText:'NAS / 小説'}).locator('.shelf-rail');await rail.evaluate(e=>e.scrollLeft=210);const before=await rail.evaluate(e=>e.scrollLeft);
 await page.locator('.folder-shelf-name h3').filter({hasText:'小説'}).click();await page.waitForTimeout(100);await page.locator('#libraryHome').click();await page.waitForTimeout(100);assert.equal(await rail.evaluate(e=>e.scrollLeft),before);
 await inSheet(page,()=>page.locator('#folderFilter').selectOption('小説'));await page.locator('#search').fill('19');await page.locator('#clearLibraryFilters').click();assert.equal(await page.evaluate(()=>activeFolder),'小説');assert.equal(await page.locator('#search').inputValue(),'');
 await inSheet(page,()=>page.locator('#coverDensity').selectOption('normal'));
 await page.screenshot({path:'tests/navigation-0.6.2.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:'Back panel > book > folder > home; filters/tabs; counts/grouping; density/persistence; series 1/2/10 same-folder; shelf scroll restoration',small,large}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
