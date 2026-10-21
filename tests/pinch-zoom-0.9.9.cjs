const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 0.9.9: pinch (two touches) and trackpad pinch (Ctrl+wheel) zoom about the gesture point, not the top-left corner.
// Synthetic TouchEvents / WheelEvents on the PDF and Markdown readers; a text EPUB (no zoom) is not scrolled.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:760},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.clear();
  const filler=Array.from({length:120},(_,i)=>'段落'+i+'。ピンチで拡大する位置の確認用の文章です。').join('\n\n');
  window.texts={'a.md':'# 見出し\n\n'+filler};
  localStorage.setItem('dsbooks.catalog',JSON.stringify([{id:'P',title:'PDF',type:'PDF',fileExt:'PDF',localName:'p.pdf',offline:true,cover:'c1',size:1},{id:'M',title:'MD',type:'Markdown',fileExt:'MD',localName:'a.md',offline:true,cover:'c1',size:1}]));
  // A 100×100 page image, so the PDF page has height to scroll in.
  const c=document.createElement('canvas');c.width=c.height=100;const img=c.toDataURL();
  window.DSBooksNative=new Proxy({hasBook:()=>true,loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',readText:n=>texts[n]??null,
   renderPdfPage:(n,p,t)=>setTimeout(()=>window.onPdfPage(t,{ok:true,count:3,page:p,image:img}),5)},{get:(o,k)=>o[k]||(()=> '')});});
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 // Two fingers around (cx,cy) moving apart from gap g0 to g1 (client coordinates).
 const pinch=(sel,cx,cy,g0,g1,steps=6)=>page.evaluate(([sel,cx,cy,g0,g1,steps])=>{const el=document.querySelector(sel);
  const t=(id,x,y)=>new Touch({identifier:id,target:el,clientX:x,clientY:y});const ev=(type,g)=>{const ts=[t(1,cx-g/2,cy),t(2,cx+g/2,cy)];el.dispatchEvent(new TouchEvent(type,{touches:type==='touchend'?[]:ts,targetTouches:ts,changedTouches:ts,bubbles:true,cancelable:true}));};
  ev('touchstart',g0);for(let i=1;i<=steps;i++)ev('touchmove',g0+(g1-g0)*i/steps);ev('touchend',g1);},[sel,cx,cy,g0,g1,steps]);
 // Where the content point that was under (cx,cy) is now, in viewport coordinates.
 const probe=sel=>page.evaluate(sel=>{const el=document.querySelector(sel);return {l:el.scrollLeft,t:el.scrollTop,r:el.getBoundingClientRect()};},sel);

 // PDF: content point under the fingers stays under them (scroll = point × (k−1)).
 await page.evaluate(()=>openLocalBook(books.find(b=>b.id==='P')));await page.waitForFunction(()=>document.getElementById('pdfImage')?.naturalWidth>0);
 const v0=await probe('#pdfViewport');const cx=v0.r.left+200,cy=v0.r.top+120;
 await pinch('#pdfViewport',cx,cy,100,200);const v1=await probe('#pdfViewport');
 assert(Math.abs(v1.l-200)<=3&&Math.abs(v1.t-120)<=3,'pinch about the fingers (got '+v1.l+','+v1.t+')');
 // Trackpad pinch (Ctrl+wheel) about the cursor, here zooming back out.
 await page.evaluate(([x,y])=>document.getElementById('pdfViewport').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:Math.log(2)*100,clientX:x,clientY:y,bubbles:true,cancelable:true})),[cx,cy]);
 const v2=await probe('#pdfViewport');assert(Math.abs(v2.l)<=3&&Math.abs(v2.t)<=3,'ctrl+wheel back to 1× about the cursor (got '+v2.l+','+v2.t+')');
 // macOS WebKit trackpad pinch (GestureEvent with scale), simulated with plain Events carrying the same fields.
 await page.evaluate(([x,y])=>{const v=document.getElementById('pdfViewport');const ev=(type,scale)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{scale,clientX:x,clientY:y});v.dispatchEvent(e);};ev('gesturestart',1);ev('gesturechange',1.5);ev('gesturechange',2);ev('gestureend',2);},[cx,cy]);
 const v3=await probe('#pdfViewport');assert(Math.abs(v3.l-200)<=3&&Math.abs(v3.t-120)<=3,'Mac gesture pinch about the cursor (got '+v3.l+','+v3.t+')');
 // Markdown (CSS zoom): the paragraph under the fingers stays there.
 await page.evaluate(()=>openLocalBook(books.find(b=>b.id==='M')));await page.waitForSelector('#mdPage');
 await page.evaluate(()=>{document.querySelector('.reader-viewport').scrollTop=800;});
 const vp='.reader-viewport',r=(await probe(vp)).r,mx=r.left+150,my=r.top+200;
 const under=()=>page.evaluate(([x,y])=>{for(let dy=0;dy<40;dy+=4){const e=document.elementFromPoint(x,y+dy)?.closest('#mdPage p');if(e)return e.textContent.slice(0,6);}return null;},[mx,my]);
 const before=await under();assert(before&&before!=='段落0。ピ','probe on a scrolled paragraph: '+before);await pinch(vp,mx,my,80,160);assert.equal(await under(),before,'same paragraph under the fingers after zooming');
 assert.deepEqual(errors,[]);console.log('PASS pinch zoom: PDF and Markdown zoom about the fingers, trackpad Ctrl+wheel and Mac gesture pinch about the cursor');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
