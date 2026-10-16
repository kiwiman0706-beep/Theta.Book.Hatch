const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs');
// 0.9.3: a right-to-left (rtl spine) text EPUB whose cover is an image-only page. Swiping must move forward
// through cover → title → text in the text's direction, never bounce back to the cover. Image-only books keep rtl.
const png='data:image/png;base64,'+fs.readFileSync('tests/fixtures/comics/pages/page1.png').toString('base64');
const para=i=>'<p>'+('第'+i+'段落。雨の日に図書館で本を読みました。窓の外では静かに雨が降っています。').repeat(3)+'</p>';
const textBook=[{html:`<img class="epub-image" src="${png}">`,imageOnly:true,text:0},{html:'<p>短編集</p><p>作者</p>',imageOnly:false,text:5},
 ...[2,3,4].map(c=>({html:'<h2>第'+c+'章</h2>'+Array.from({length:40},(_,i)=>para(i)).join(''),imageOnly:false,text:4000}))];
const comic=[0,1,2].map(()=>({html:`<img class="epub-image" src="${png}">`,imageOnly:true,text:0}));
async function run(browser,chapters,mode,dx,n,extra={}){
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(([C,mode,extra])=>{localStorage.clear();localStorage.setItem('dsbooks.catalog',JSON.stringify([{id:'1',title:'試験',type:'ePub',localName:'b.epub',offline:true,progress:0}]));
  localStorage.setItem('dsbooks.preferences',JSON.stringify({writingMode:mode,...extra}));
  window.DSBooksNative=new Proxy({getAppVersion:()=> 'x',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',hasBook:()=>true,
   getEpubChapter:(n,i)=>{i=Math.max(0,Math.min(i,C.length-1));return JSON.stringify({ok:true,index:i,count:C.length,title:'',html:C[i].html,imageOnly:C[i].imageOnly,images:C[i].imageOnly?1:0,direction:'rtl',progressWeights:C.map(c=>Math.max(1,c.text))});}},{get:(o,k)=>o[k]||(()=> '')});},[chapters,mode,extra]);
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 await page.evaluate(()=>openLocalBook(books[0]));await page.waitForTimeout(400);
 const cdp=await ctx.newCDPSession(page),seen=[];
 for(let k=0;k<n;k++){const x0=dx<0?300:90,y=420;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
  for(let j=1;j<=6;j++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+dx*j/6,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);seen.push(await page.evaluate(()=>DSFeatures.reader.position().chapter));}
 assert.deepEqual(errors,[]);await ctx.close();return seen;
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox','--overscroll-history-navigation=0','--disable-features=OverscrollHistoryNavigation']});
 // Horizontal text: swipe right-to-left is "next" on the cover too (the reported bounce was cover ⇄ title on left-to-right).
 const h=await run(browser,textBook,'horizontal',-200,4);assert.deepEqual(h.slice(0,3),[1,2,2],'horizontal forward: '+h);
 const hBack=await run(browser,textBook,'horizontal',200,3);assert.deepEqual(hBack,[0,0,0],'horizontal: left-to-right on the cover stays (previous)');
 // Vertical text: left-to-right is "next" everywhere.
 const v=await run(browser,textBook,'vertical',200,4);assert.deepEqual(v.slice(0,3),[1,2,2],'vertical forward: '+v);
 // Image-only comic with rtl spine keeps right-opening swipes.
 const c=await run(browser,comic,'horizontal',200,2);assert.deepEqual(c,[1,2],'comic rtl: '+c);
 // Explicit setting wins: horizontal text, but left-to-right chosen as "next" (also for the cover).
 const r=await run(browser,textBook,'horizontal',200,3,{swipeTurn:'right'});assert.deepEqual(r.slice(0,2),[1,2],'setting right: '+r);
 const l=await run(browser,comic,'horizontal',-200,2,{swipeTurn:'left'});assert.deepEqual(l,[1,2],'setting left on rtl comic: '+l);
 console.log('PASS epub swipe: setting override, rtl text book cover follows text direction (horizontal/vertical), no cover⇄title bounce, comic keeps rtl');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
