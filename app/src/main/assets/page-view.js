/* 1.0.0 page-image view shared by the PDF and comic readers.
   Layouts: one page / two-page spread (right- or left-opening, optional single cover) / continuous vertical scroll.
   Fit: whole page or page width; pinch / Ctrl+wheel zoom about the gesture point (bindPinchZoom).
   Pages come from the native renderers one at a time (render(i) -> Promise<{image,count,page}>), are cached a few at a
   time and, in scroll mode, only the pages near the screen keep their image (large books are never held in memory).
   Edge taps turn pages (single/spread); the centre tap is left to the overlay controls (reader-chrome.js). */
window.DSPageView=(()=>{
 'use strict';
 const LAYOUTS={single:'1ページ',spread:'見開き',scroll:'縦スクロール'};
 const defaults=()=>({layout:'single',fit:'page',dir:'ltr',cover:true,...(DSFeatures.prefs().pageView||{})});
 function settingsFor(book,dirDefault){const s={...defaults(),...(book.pageView||{})};if(!book.pageView?.dir)s.dir=dirDefault||s.dir;return s;}

 let active=null;
 function create(o){
  active?.dispose(); // one book view at a time (other modules replace the reader's dispose hook)
  // o: {viewport, book, render(i), dir, ids:{img,label,seek,seekHint,prev,next,status}, onPage(i,count), finish(), labelText(i,count,pair)}
  const vp=o.viewport,$=id=>document.getElementById(id),book=o.book;
  let st=settingsFor(book,o.dir),count=Number(book.pageCount)||0,cur=Math.max(0,Number(o.start)||0),zoom=1,closed=false,gen=0;
  const cache=new Map(),sizes=new Map(),inflight=new Map();
  const stage=document.createElement('div');stage.className='pv-stage';vp.textContent='';vp.appendChild(stage);vp.classList.add('pv-viewport');
  const status=t=>{const s=o.ids.status&&$(o.ids.status);if(s)s.textContent=t;};
  function get(i){
   if(cache.has(i)){const v=cache.get(i);cache.delete(i);cache.set(i,v);return Promise.resolve(v);}
   if(inflight.has(i))return inflight.get(i);
   const p=o.render(i).then(r=>new Promise((res,rej)=>{if(!r||!r.ok){rej(new Error(r&&r.error||'ページを表示できませんでした'));return;}
     if(r.count)count=r.count;const im=new Image();im.onload=()=>{const v={url:r.image,w:im.naturalWidth,h:im.naturalHeight,page:r.page??i};sizes.set(i,v.w/v.h);cache.set(i,v);while(cache.size>(st.layout==='scroll'?16:8))cache.delete(cache.keys().next().value);res(v);};im.onerror=()=>{status('ページ画像を表示できません（画像形式・破損を確認してください）');const v={url:r.image,w:1,h:1.414,page:r.page??i,broken:true};cache.set(i,v);res(v);};im.src=r.image;}))
    .finally(()=>inflight.delete(i));
   inflight.set(i,p);return p;
  }
  const W=()=>vp.clientWidth,H=()=>vp.clientHeight;
  const clampPage=i=>Math.max(0,count?Math.min(count-1,i):i);
  // Spread pairs: with a single cover, page 1 stands alone and 2-3, 4-5 … face each other.
  const pairStart=i=>st.cover?(i<=0?0:(i%2?i:i-1)):i-i%2;
  const pairOf=i=>{const a=pairStart(i);if(st.cover&&a===0)return [0];return count&&a+1>=count?[a]:[a,a+1];};
  function img(v,i){const e=document.createElement('img');e.src=v.url;e.alt=(i+1)+'ページ';e.className='pv-page';e.dataset.page=i;e.draggable=false;return e;}

  /* ---------- single / spread ---------- */
  function layoutFlat(){
   const imgs=[...stage.querySelectorAll('img.pv-page')];if(!imgs.length)return;
   const ratios=imgs.map(e=>e.naturalWidth/e.naturalHeight||sizes.get(Number(e.dataset.page))||1/1.414),sum=ratios.reduce((a,b)=>a+b,0);
   // A common page height h: the row is h*sum wide. Fit page = the row fits both ways; fit width = the row fills the width.
   const h=(st.fit==='width'?W()/sum:Math.min(H(),W()/sum))*zoom;
   imgs.forEach((e,k)=>{e.style.height=h+'px';e.style.width=h*ratios[k]+'px';});
  }
  async function showFlat(i){
   const my=++gen,pages=st.layout==='spread'?pairOf(i):[clampPage(i)];status('ページを読み込み中…');busy();
   try{const vs=await Promise.all(pages.map(get));if(my!==gen||closed)return;
    cur=pages[0];stage.className='pv-stage pv-flat';stage.textContent='';
    const order=st.layout==='spread'&&st.dir==='rtl'?[...pages].reverse():pages;
    const row=document.createElement('div');row.className='pv-row';
    for(const p of order){const e=img(vs[pages.indexOf(p)],p);row.appendChild(e);}
    stage.appendChild(row);zoom=1;layoutFlat();vp.scrollTop=0;vp.scrollLeft=st.dir==='rtl'?vp.scrollWidth:0;markCurrent();status(vs.some(v=>v.broken)?'ページ画像を表示できません（画像形式・破損を確認してください）':'');done();
    // Prefetch the next step.
    const nx=st.layout==='spread'?pairOf(pairStart(cur)+(st.cover&&cur===0?1:2)):[cur+1];nx.filter(p=>!count||p<count).forEach(p=>get(p).catch(()=>{}));
   }catch(e){if(my===gen)status(e.message);}
  }

  /* ---------- continuous scroll ---------- */
  let slots=[],io=null,scrollRaf=0;
  function slotSize(i){const r=sizes.get(i)||[...sizes.values()][0]||1/1.414;const w=st.fit==='width'?W()*zoom:Math.min(W(),H()*r)*zoom;return {w,h:w/r};}
  function buildScroll(){
   io?.disconnect();stage.className='pv-stage pv-scroll';stage.textContent='';slots=[];
   for(let i=0;i<count;i++){const s=document.createElement('div');s.className='pv-slot';s.dataset.page=i;const z=slotSize(i);s.style.width=z.w+'px';s.style.height=z.h+'px';stage.appendChild(s);slots.push(s);}
   io=new IntersectionObserver(es=>{for(const e of es){const i=Number(e.target.dataset.page);if(e.isIntersecting)fill(i);else if(Math.abs(i-cur)>6)unfill(i);}},{root:vp,rootMargin:'150% 0px'});
   slots.forEach(s=>io.observe(s));
  }
  function resizeSlot(i){const s=slots[i];if(!s)return;const z=slotSize(i),old=s.offsetHeight;s.style.width=z.w+'px';s.style.height=z.h+'px';
   // Keep the reading position when a page above the screen gets its real height.
   if(s.offsetTop+old<=vp.scrollTop+1)vp.scrollTop+=z.h-old;}
  function fill(i){const s=slots[i];if(!s||s.firstChild)return;get(i).then(v=>{if(closed||!slots[i]||s.firstChild)return;const e=img(v,i);e.style.width='100%';e.style.height='100%';s.appendChild(e);resizeSlot(i);markCurrent();}).catch(()=>{});}
  function unfill(i){const s=slots[i];if(s)s.textContent='';}
  function layoutScroll(){slots.forEach((s,i)=>{const z=slotSize(i);s.style.width=z.w+'px';s.style.height=z.h+'px';});}
  function topIndex(){const y=vp.scrollTop+H()*.3;let lo=0,hi=slots.length-1,ans=0;while(lo<=hi){const m=(lo+hi)>>1;if(slots[m].offsetTop<=y){ans=m;lo=m+1;}else hi=m-1;}return ans;}
  function onScroll(){if(st.layout!=='scroll'||scrollRaf)return;scrollRaf=requestAnimationFrame(()=>{scrollRaf=0;const i=topIndex();if(i!==cur){cur=i;done();}});}
  vp.addEventListener('scroll',onScroll,{passive:true});
  function scrollTo(i){i=clampPage(i);const s=slots[i];if(s){vp.scrollTop=s.offsetTop;cur=i;done();}}
  async function startScroll(i){status('ページを読み込み中…');busy();try{await get(clampPage(i));}catch(e){status(e.message);return;}if(closed)return;zoom=1;buildScroll();scrollTo(i);status('');}

  /* ---------- common ---------- */
  // While a page loads the slider is disabled (label() enables it again), as in the earlier readers.
  function busy(){const k=o.ids.seek&&$(o.ids.seek);if(k)k.disabled=true;}
  function markCurrent(){const e=stage.querySelector(`img.pv-page[data-page="${cur}"]`)||stage.querySelector('img.pv-page');document.querySelectorAll('#'+o.ids.img).forEach(x=>{if(x!==e)x.removeAttribute('id');});if(e&&o.ids.img)e.id=o.ids.img;}
  function done(){book.currentPage=cur;if(count)book.pageCount=count;o.onPage?.(cur,count);label();}
  function label(){
   if(closed)return;const seek=o.ids.seek&&$(o.ids.seek);
   if(seek){seek.max=Math.max(0,count-1);seek.disabled=count<2;seek.style.direction=st.dir;if(!seek.dataset.dragging){seek.value=cur;const h=o.ids.seekHint&&$(o.ids.seekHint);if(h)h.textContent='';}seek.setAttribute('aria-valuetext',`${cur+1} / ${count}ページ`);}
   const pair=st.layout==='spread'?pairOf(cur):[cur];const l=o.ids.label&&$(o.ids.label);if(l)l.textContent=o.labelText?o.labelText(cur,count,pair):(pair.length>1?`${pair[0]+1}-${pair[1]+1}`:cur+1)+' / '+count;
   const last=st.layout==='spread'?pair[pair.length-1]:cur,p=o.ids.prev&&$(o.ids.prev),n=o.ids.next&&$(o.ids.next);if(p)p.disabled=cur<=0;if(n&&!o.nextAtEnd)n.disabled=!!count&&last>=count-1;
   o.after?.(cur,count,pair);
  }
  function go(i){if(closed)return;if(st.layout==='scroll'){if(slots.length)scrollTo(i);else startScroll(i);}else showFlat(i);}
  function step(d){
   if(st.layout==='scroll'){scrollTo(cur+d);return;}
   if(st.layout==='spread'){const a=pairStart(cur);if(d>0){const pair=pairOf(a);if(count&&pair[pair.length-1]>=count-1)return o.atEnd?.();go(pair[pair.length-1]+1);}else{if(a<=0)return;go(pairStart(a-1));}return;}
   if(d>0&&count&&cur>=count-1)return o.atEnd?.();go(cur+d);
  }
  function setZoom(z){zoom=Math.max(1,Math.min(5,z));if(st.layout==='scroll')layoutScroll();else layoutFlat();o.onZoom?.(zoom);}
  function apply(next,keep=true){st={...st,...next};book.pageView={...st};saveCatalog();if(st.layout==='scroll')startScroll(cur);else{io?.disconnect();slots=[];showFlat(cur);}vp.classList.toggle('pv-rtl',st.dir==='rtl');}
  vp.classList.toggle('pv-rtl',st.dir==='rtl');

  // Gestures: pinch / trackpad zoom, double tap, horizontal swipe (not in scroll mode), edge taps.
  bindPinchZoom(vp,()=>zoom,setZoom,1,5);
  vp.addEventListener('dblclick',e=>{e.preventDefault();setZoom(zoom>1?1:2);});
  const forward=dx=>{const t=DSFeatures.prefs().swipeTurn;return t==='left'?dx<0:t==='right'?dx>0:st.dir==='rtl'?dx>0:dx<0;};
  let sx=0,sy=0,one=false;
  vp.addEventListener('touchstart',e=>{one=e.touches.length===1&&zoom<=1.01&&st.layout!=='scroll';if(one){sx=e.touches[0].clientX;sy=e.touches[0].clientY;}},{passive:true});
  vp.addEventListener('touchmove',e=>{if(e.touches.length>1)one=false;},{passive:true});
  vp.addEventListener('touchend',e=>{if(!one)return;one=false;const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3)step(forward(dx)?1:-1);},{passive:true});
  vp.addEventListener('click',e=>{
   if(st.layout==='scroll'||zoom>1.01||e.target.closest('button,a,input'))return;
   const r=vp.getBoundingClientRect(),x=(e.clientX-r.left)/r.width;if(x>.25&&x<.75)return; // centre: overlay controls
   e.dsHandled=true;const leftIsNext=st.dir==='rtl';step((x<=.25)===leftIsNext?1:-1);
  });
  const onResize=()=>{if(!vp.isConnected){api.dispose();return;}if(st.layout==='scroll')layoutScroll();else layoutFlat();};window.addEventListener('resize',onResize);

  function menu(){
   const b=(k,v,t)=>`<button class="${st[k]===v?'primary':'secondary'}" data-pv="${k}" data-v="${v}">${t}</button>`;
   DSFeatures.panel('表示',`<h3>ページの並べ方</h3><div class="feature-actions">${Object.entries(LAYOUTS).map(([v,t])=>b('layout',v,t)).join('')}</div>
    <h3>大きさ</h3><div class="feature-actions">${b('fit','page','ページ全体')}${b('fit','width','幅に合わせる')}</div>
    <h3>めくる向き</h3><div class="feature-actions">${b('dir','rtl','右開き（右から左へ）')}${b('dir','ltr','左開き（左から右へ）')}</div>
    <h3>見開き</h3><label><input type="checkbox" id="pvCover" ${st.cover?'checked':''}> 1ページ目（表紙）は単独で表示</label>
    <label><input type="checkbox" id="pvDefault"> この並べ方を他の本の初期設定にする</label>`);
   document.querySelectorAll('[data-pv]').forEach(x=>x.onclick=()=>{apply({[x.dataset.pv]:x.dataset.v});if(document.getElementById('pvDefault')?.checked)saveDefault();menu();});
   const c=document.getElementById('pvCover');c.onchange=()=>{apply({cover:c.checked});if(document.getElementById('pvDefault')?.checked)saveDefault();};
   document.getElementById('pvDefault').onchange=e=>{if(e.target.checked)saveDefault();};
  }
  function saveDefault(){const p=DSFeatures.prefs();DSFeatures.savePrefs({...p,pageView:{layout:st.layout,fit:st.fit,cover:st.cover}});}

  const api={go,step,menu,apply,setZoom,get zoom(){return zoom;},get page(){return cur;},get count(){return count;},get settings(){return {...st};},
   dispose(){closed=true;gen++;io?.disconnect();vp.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onResize);cache.clear();}};
  active=api;go(cur);
  return api;
 }
 return {create,settingsFor,LAYOUTS};
})();

/* PDF reader on the shared page view (replaces the one-page reader; ids, labels and saved fields are unchanged). */
pdfReader=function(b,startPage){
 const $=id=>document.getElementById(id);
 showReaderModal(`<div class="reader pdf-reader"><div class="reader-top"><button class="close">×</button><strong>${escapeHtml(b.title)}</strong><div class="reader-zoom"><button id="pdfZoomOut">−</button><button id="pdfZoomReset" class="zoom-reset"><span id="pdfZoomLabel">100%</span></button><button id="pdfZoomIn">＋</button></div><button class="tool-btn" id="pdfLayout" title="表示（見開き・縦スクロール・幅に合わせる）">▤</button><button class="tool-btn" id="pdfShare" title="共有">↗</button><button class="tool-btn" id="pdfExport" title="端末に保存">⇩</button><button class="tool-btn" id="pdfBookmark">⚑</button></div><div id="pdfStatus" class="reader-status">PDFを表示しています…</div><div class="reader-viewport pdf-viewport" id="pdfViewport"></div><div class="reader-controls reader-navigation"><div class="reader-seek"><input id="pdfSeek" type="range" min="0" max="0" value="0" disabled aria-label="PDFのページへジャンプ"><output id="pdfSeekHint"></output></div><button id="pdfPrev">‹ 前へ</button><span id="pdfPageLabel">読み込み中</span><button id="pdfNext">次へ ›</button></div></div>`);
 const waiting=new Map();
 window.onPdfPage=(t,r)=>{const w=waiting.get(t);if(w){waiting.delete(t);w(r);}};
 const render=i=>new Promise(res=>{const t=String(Date.now())+Math.random().toString(36).slice(2);waiting.set(t,res);DSBooksNative.renderPdfPage(b.localName,i,t);});
 let view=null;
 view=DSPageView.create({viewport:$('pdfViewport'),book:b,start:startPage||0,render,dir:'ltr',
  ids:{img:'pdfImage',label:'pdfPageLabel',seek:'pdfSeek',seekHint:'pdfSeekHint',prev:'pdfPrev',next:'pdfNext',status:'pdfStatus'},
  labelText:(i,n,pair)=>(pair.length>1?`${pair[0]+1}-${pair[1]+1}`:i+1)+' / '+n+(view?.settings.layout==='scroll'?' · 縦スクロール':' · 左右にスワイプ'),
  onPage:(i,n)=>{if(n){b.progress=Math.round((i+1)*100/n);}saveCatalog();renderReading();},
  onZoom:z=>{$('pdfZoomLabel').textContent=Math.round(z*100)+'%';}});
 $('pdfPrev').onclick=()=>view.step(-1);$('pdfNext').onclick=()=>view.step(1);
 $('pdfZoomOut').onclick=()=>view.setZoom(view.zoom-.25);$('pdfZoomIn').onclick=()=>view.setZoom(view.zoom+.25);$('pdfZoomReset').onclick=()=>view.setZoom(1);
 $('pdfSeek').oninput=e=>{e.target.dataset.dragging='1';$('pdfSeekHint').textContent=`${Number(e.target.value)+1} / ${view.count}頁へ`;};
 $('pdfSeek').onchange=e=>{delete e.target.dataset.dragging;view.go(Number(e.target.value));};
 $('pdfLayout').onclick=()=>view.menu();
 $('pdfShare').onclick=()=>shareBookFile(b);$('pdfExport').onclick=()=>exportBookFile(b);
 $('pdfBookmark').onclick=()=>{b.bookmarkPage=view.page;saveCatalog();toast('このページを栞にしました');};
 DSFeatures.reader={book:b,position:()=>({kind:'PDF',page:view.page}),jump:a=>view.go(Number(a.page)||0),dispose:()=>view.dispose()};
};
