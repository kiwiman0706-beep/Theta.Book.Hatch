const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.0.0: full-screen reading (bars float, show on a centre tap, fade out) and the page view for PDF/comics:
// spread (cover alone, right/left opening), fit page/width, vertical scroll (only near pages keep images), saved per book.
// Mocked bridge; the comic renderer answers only its latest request, like the Android one.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.clear();window.calls=[];
  const pageImg=n=>{const c=document.createElement('canvas');c.width=100;c.height=141;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,100,141);g.fillStyle='#000';g.font='40px sans-serif';g.fillText(String(n+1),20,80);return c.toDataURL();};
  localStorage.setItem('dsbooks.catalog',JSON.stringify([{id:'P',title:'PDF',type:'PDF',fileExt:'PDF',localName:'p.pdf',offline:true,cover:'c1',size:1},{id:'C',title:'漫画',type:'Comic',fileExt:'CBZ',localName:'c.cbz',offline:true,cover:'c1',size:1}]));
  let comicLatest='';
  window.DSBooksNative=new Proxy({hasBook:()=>true,loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',
   renderPdfPage:(n,p,t)=>{calls.push(['pdf',p]);setTimeout(()=>window.onPdfPage(t,{ok:true,count:40,page:Math.min(p,39),image:pageImg(p)}),3);},
   renderComicPage:(n,p,t)=>{calls.push(['comic',p]);comicLatest=t;setTimeout(()=>{if(t===comicLatest)window.onComicPage(t,{ok:true,count:12,page:Math.min(p,11),image:pageImg(p)});},5);}},{get:(o,k)=>o[k]||(()=> '')});});
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 const open=id=>page.evaluate(id=>openLocalBook(books.find(b=>b.id===id)),id);
 const pages=sel=>page.evaluate(sel=>[...document.querySelectorAll(sel+' img.pv-page')].map(e=>Number(e.dataset.page)),sel);
 const tap=(sel,fx,fy=.5)=>page.evaluate(([sel,fx,fy])=>{const v=document.querySelector(sel),r=v.getBoundingClientRect();const x=r.left+r.width*fx,y=r.top+r.height*fy;(document.elementFromPoint(x,y)||v).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y}));},[sel,fx,fy]);
 const chromeOn=()=>page.evaluate(()=>document.querySelector('#modal > .reader').classList.contains('chrome-on'));
 const pick=async(k,v)=>{await page.evaluate(()=>DSReaderChrome.show());await page.locator('#pdfLayout').click();await page.locator(`[data-pv="${k}"][data-v="${v}"]`).click();await page.evaluate(()=>DSFeatures.closePanel());await page.waitForTimeout(80);};

 // Full screen: the page uses the whole reader; bars float, are shown at first, fade out, come back on a centre tap.
 await open('P');await page.waitForFunction(()=>document.getElementById('pdfImage')?.naturalWidth>0);
 const geo=await page.evaluate(()=>{const r=document.querySelector('#modal > .reader').getBoundingClientRect(),v=document.getElementById('pdfViewport').getBoundingClientRect();return [Math.round(r.height),Math.round(v.height)];});
 assert.equal(geo[1],geo[0],'viewport fills the reader');assert.equal(await chromeOn(),true,'bars shown at first');
 await page.waitForTimeout(3800);assert.equal(await chromeOn(),false,'bars fade out');
 assert.equal(await page.evaluate(()=>document.getElementById('pdfNext').offsetParent!==null),true,'hidden bars stay laid out (keyboard paging)');
 await tap('#pdfViewport',.5);assert.equal(await chromeOn(),true,'centre tap shows');await tap('#pdfViewport',.5);assert.equal(await chromeOn(),false,'centre tap hides');
 // Edge taps turn pages (left-opening PDF: right edge = next) and do not toggle the bars.
 await tap('#pdfViewport',.9);await page.waitForFunction(()=>books.find(b=>b.id==='P').currentPage===1);assert.equal(await chromeOn(),false);
 // Fit page vs width.
 const fit=()=>page.evaluate(()=>{const i=document.getElementById('pdfImage').getBoundingClientRect(),v=document.getElementById('pdfViewport');return [Math.round(i.width),Math.round(i.height),v.clientWidth,v.clientHeight];});
 let f=await fit();assert(f[1]<=f[3]+1&&f[0]<f[2],'fit page: whole page visible');
 await pick('fit','width');f=await fit();assert(Math.abs(f[0]-f[2])<=1,'fit width');await pick('fit','page');
 // Spread with a single cover: 1 | 2-3 | 4-5 …; right-opening puts the earlier page on the right.
 await page.evaluate(()=>{const b=books.find(b=>b.id==='P');b.currentPage=0;});await pick('layout','spread');
 await page.evaluate(()=>window.DSFeatures.reader.jump({page:0}));await page.waitForTimeout(80);assert.deepEqual(await pages('#pdfViewport'),[0]);
 await page.locator('#pdfNext').evaluate(b=>b.click());await page.waitForTimeout(80);assert.deepEqual(await pages('#pdfViewport'),[1,2]);assert.match(await page.locator('#pdfPageLabel').textContent(),/^2-3 \/ 40/);
 await page.locator('#pdfNext').evaluate(b=>b.click());await page.waitForTimeout(80);assert.deepEqual(await pages('#pdfViewport'),[3,4]);
 await pick('dir','rtl');assert.deepEqual(await pages('#pdfViewport'),[4,3],'right-opening: the later page is on the left');
 await tap('#pdfViewport',.1);await page.waitForTimeout(80);assert.deepEqual(await pages('#pdfViewport'),[6,5],'right-opening: left edge = next');
 const w=await page.evaluate(()=>[...document.querySelectorAll('#pdfViewport img.pv-page')].reduce((s,e)=>s+e.getBoundingClientRect().width,0));assert(w<=900+1,'spread fits the width');
 // Saved per book: reopen keeps spread / right-opening.
 await page.evaluate(()=>closeModal());await open('P');await page.waitForTimeout(150);assert.deepEqual(await pages('#pdfViewport'),[6,5]);
 // Vertical scroll: every page has a slot, only pages near the screen hold an image, the current page follows the scroll.
 await pick('layout','scroll');
 assert.equal(await page.locator('#pdfViewport .pv-slot').count(),40);
 await page.evaluate(()=>{const v=document.getElementById('pdfViewport'),s=v.querySelectorAll('.pv-slot')[30];v.scrollTop=s.offsetTop;});await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>books.find(b=>b.id==='P').currentPage),30);assert.match(await page.locator('#pdfPageLabel').textContent(),/^31 \/ 40/);
 const held=await page.evaluate(()=>document.querySelectorAll('#pdfViewport .pv-slot img').length);assert(held>0&&held<20,'only nearby pages keep images ('+held+')');
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#pdfViewport .pv-slot')].slice(0,5).some(s=>s.firstChild)),false,'far pages released');
 await page.locator('#pdfPrev').evaluate(b=>b.click());await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>books.find(b=>b.id==='P').currentPage),29,'prev scrolls one page');
 // Panel open keeps the bars up; the setting turns the overlay off.
 await page.locator('#pdfLayout').evaluate(b=>b.click());await page.waitForTimeout(4000);assert.equal(await chromeOn(),true,'panel keeps bars');await page.evaluate(()=>DSFeatures.closePanel());
 await page.evaluate(()=>{closeModal();DSFeatures.savePrefs({...DSFeatures.prefs(),chromeAlways:true});});await open('P');await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>document.querySelector('#modal > .reader').classList.contains('immersive')),false,'always-visible setting');
 await page.evaluate(()=>{closeModal();DSFeatures.savePrefs({...DSFeatures.prefs(),chromeAlways:false});});

 // Comic: right-opening by default; spread works although the renderer drops all but the latest request.
 await open('C');await page.waitForFunction(()=>document.getElementById('comicImage')?.naturalWidth>0);
 await page.locator('#comicLayout').evaluate(b=>b.click());await page.locator('[data-pv="layout"][data-v="spread"]').click();await page.evaluate(()=>DSFeatures.closePanel());
 await page.locator('#comicNext').evaluate(b=>b.click());await page.waitForFunction(()=>document.querySelectorAll('#comicViewport img.pv-page').length===2,null,{timeout:5000});
 assert.deepEqual(await pages('#comicViewport'),[2,1],'manga spread: page 2 right, 3 left');
 assert.match(await page.locator('#comicCount').textContent(),/^2-3 \/ 12頁/);assert.equal(await page.locator('#comicDirection').textContent(),'右開き');
 // To the end: 「読了」 marks it finished.
 await page.evaluate(()=>DSFeatures.reader.jump({page:11}));await page.waitForFunction(()=>/読了/.test(document.getElementById('comicNext').textContent));
 await page.locator('#comicNext').evaluate(b=>b.click());assert.equal(await page.evaluate(()=>books.find(b=>b.id==='C').readState),'finished');
 for(const w2 of [360,900]){await page.setViewportSize({width:w2,height:700});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow at '+w2);}
 assert.deepEqual(errors,[]);console.log('PASS reader view: full-screen bars (tap/fade/panel/setting, keyboard-safe), edge taps, fit page/width, spread with cover and direction, vertical scroll with page release, saved per book, comic spread with latest-only renderer, finish');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
