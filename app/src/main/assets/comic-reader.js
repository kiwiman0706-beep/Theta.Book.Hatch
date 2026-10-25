'use strict';
window.comicReader=function(book,start=0){
 /* 1.0.0: on the shared page view (page-view.js): one page / spread / vertical scroll, fit page or width, direction.
    Ids, the saved fields (currentPage, pageCount, progress, comicDirection) and the finished-at-the-end rule are kept. */
 const F=DSFeatures,$=id=>document.getElementById(id),esc=escapeHtml;
 let direction=book.comicDirection||'rtl';
 showReaderModal(`<div class="reader comic-reader"><div class="reader-top"><button class="close" aria-label="本棚へ戻る">×</button><strong>${esc(book.title)}</strong><button class="tool-btn" id="comicLayout" title="表示（見開き・縦スクロール・幅に合わせる）">▤</button><button class="tool-btn" id="comicMenu">☰</button></div><div class="reader-tools"><button id="comicJump">ページ</button><button id="comicNote">栞・メモ</button><button id="comicMinus" aria-label="縮小">−</button><button id="comicFit">全体</button><button id="comicPlus" aria-label="拡大">＋</button><button id="comicDirection">右開き</button></div><div class="reader-status" id="comicStatus">ページを準備しています…</div><div class="reader-viewport comic-viewport" id="comicViewport"></div><div class="reader-controls reader-navigation"><div class="reader-seek"><input id="comicSeek" type="range" min="0" max="0" value="0" disabled aria-label="ページへジャンプ"><output id="comicSeekHint"></output></div><button id="comicPrev">‹ 前</button><span id="comicCount"></span><button id="comicNext">次 ›</button></div></div>`);
 // The native comic renderer answers only its latest request, so pages are asked for one at a time.
 let chain=Promise.resolve(),closed=false;const waiting=new Map(),prior=window.onComicPage;
 window.onComicPage=(t,d)=>{const w=waiting.get(t);if(w){waiting.delete(t);w(d);}};
 const render=i=>(chain=chain.then(()=>closed?{ok:false,error:'closed'}:new Promise(res=>{const t=DSModel.uuid();waiting.set(t,res);DSBooksNative.renderComicPage(book.localName,i,t);})));
 const finish=()=>{book.progress=100;book.readState='finished';saveCatalog();toast('読了にしました');};
 let view=null;
 view=DSPageView.create({viewport:$('comicViewport'),book,start,render,dir:direction,nextAtEnd:true,atEnd:finish,
  ids:{img:'comicImage',label:'comicCount',seek:'comicSeek',seekHint:'comicSeekHint',prev:'comicPrev',next:'comicNext',status:'comicStatus'},
  labelText:(i,n,pair)=>n?`${pair.length>1?pair[0]+1+'-'+(pair[1]+1):i+1} / ${n}頁 · ${book.progress||0}%`:'',
  onPage:(i,n)=>{book.lastReadAt=Date.now();if(n&&book.readState!=='finished')book.progress=Math.max(1,Math.min(99,Math.round((i+1)*100/n)));saveCatalog();},
  after:(i,n,pair)=>{const s=view?.settings;$('comicNext').textContent=n&&pair[pair.length-1]>=n-1?'読了':'次 ›';if(s){$('comicDirection').textContent=s.dir==='rtl'?'右開き':'左開き';$('comicFit').textContent=s.fit==='width'?'幅に合わせる':'全体';}},
  onZoom:z=>{$('comicFit').textContent=z>1.01?Math.round(z*100)+'%':view?.settings.fit==='width'?'幅に合わせる':'全体';}});
 $('comicPrev').onclick=()=>view.step(-1);$('comicNext').onclick=()=>view.step(1);
 $('comicMinus').onclick=()=>view.setZoom(view.zoom-.5);$('comicPlus').onclick=()=>view.setZoom(view.zoom+.5);
 $('comicFit').onclick=()=>{if(view.zoom>1.01)view.setZoom(1);else view.apply({fit:view.settings.fit==='width'?'page':'width'});};
 $('comicDirection').onclick=()=>{const d=view.settings.dir==='rtl'?'ltr':'rtl';book.comicDirection=d;view.apply({dir:d});};
 $('comicLayout').onclick=()=>view.menu();
 $('comicSeek').oninput=()=>{$('comicSeek').dataset.dragging='1';$('comicSeekHint').textContent=`${Number($('comicSeek').value)+1} / ${view.count}頁へ`;};
 $('comicSeek').onchange=()=>{delete $('comicSeek').dataset.dragging;view.go(Number($('comicSeek').value));};
 $('comicJump').onclick=()=>{const n=view.count;if(!n)return;F.panel('ページへ移動',`<label>ページ（1〜${n}）<input type="number" id="comicPageNumber" min="1" max="${n}" value="${view.page+1}"></label><button class="primary" id="comicGo">移動</button>`);$('comicGo').onclick=()=>{F.closePanel();view.go((Number($('comicPageNumber').value)||1)-1);};};
 $('comicNote').onclick=()=>F.notes(book);
 $('comicMenu').onclick=()=>{F.panel('読書メニュー','<div class="feature-actions"><button class="secondary" id="comicShare">共有</button><button class="secondary" id="comicExport">ファイルを保存</button><button class="secondary" id="comicTest">表示を診断</button><button class="secondary" id="comicRetry">ページ再読込</button></div>');$('comicShare').onclick=()=>shareBookFile(book);$('comicExport').onclick=()=>exportBookFile(book);$('comicTest').onclick=()=>DSDiagnostics.open(book);$('comicRetry').onclick=()=>{F.closePanel();view.go(view.page);};};
 const save=()=>{if(closed)return;book.currentPage=view.page;if(view.count)book.pageCount=view.count;book.lastReadAt=Date.now();saveCatalog();};
 function key(e){if(document.querySelector('.reader-panel'))return;if(e.key==='PageDown'||e.key==='PageUp'){e.preventDefault();view.step(e.key==='PageDown'?1:-1);}}
 window.addEventListener('keydown',key);
 F.reader={book,position:()=>({kind:'Comic',page:view.page}),jump:a=>view.go(Number(a.page)||0),dispose:()=>{save();closed=true;view.dispose();window.onComicPage=prior;DSBooksNative.closeComic();window.removeEventListener('keydown',key);if(window.dsbooksPersistReader===save)window.dsbooksPersistReader=null;}};window.dsbooksPersistReader=save;
};
