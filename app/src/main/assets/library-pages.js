/* Bound DOM cost, without truncating the catalog or search. */
window.DSPages=(()=>{
 let key='',page=0,readingPage=0,total=0,readingTotal=0,mode='shelves';
 const size=()=>mode==='shelves'?8:72;
 function scope(){const next=JSON.stringify([view,document.getElementById('sortDirection')?.value,document.getElementById('pinReading')?.checked,activeFolder,activeNav,activeType,activeGenre,query,document.getElementById('sort').value,document.getElementById('readingFilter')?.value,document.getElementById('tagFilter')?.value]);if(next!==key){key=next;page=0;}}
 function slice(xs,n){total=xs.length;page=Math.max(0,Math.min(page,Math.ceil(total/n)-1));return xs.slice(page*n,(page+1)*n);}
 function controls(id,count,n,current,change){let el=document.getElementById(id);if(!el){el=document.createElement('nav');el.id=id;el.className='library-pages';el.setAttribute('aria-label',id==='readingPages'?'読書中の本の一覧ページ':'本棚の一覧ページ');(id==='readingPages'?document.getElementById('readingRail'):grid).after(el);}el.replaceChildren();el.hidden=count<=n;if(el.hidden)return;const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');prev.textContent='‹ 前の一覧';next.textContent='次の一覧 ›';prev.disabled=current===0;next.disabled=(current+1)*n>=count;label.textContent=(current+1)+' / '+Math.ceil(count/n);prev.onclick=()=>change(current-1);next.onclick=()=>change(current+1);el.append(prev,label,next);}
 return {
 begin(){scope();total=0;mode=activeFolder||view!=='grid'?'books':'shelves';},
 groups(xs){scope();mode=activeFolder?'books':'shelves';if(activeFolder)return xs;return slice(xs,8);},
 items(xs){return activeFolder?slice(xs,72):xs.slice(0,12);},
 flow(xs){scope();mode='books';return slice(xs,72);},
 reading(xs){readingTotal=xs.length;readingPage=Math.max(0,Math.min(readingPage,Math.ceil(readingTotal/24)-1));return xs.slice(readingPage*24,(readingPage+1)*24);},
 more(xs,folder){return !activeFolder&&xs.length>12?'<button class="shelf-more" data-open-folder="'+encodeURIComponent(folder)+'">全'+xs.length+'冊を見る ›</button>':'';},
 bind(){
  document.querySelectorAll('[data-open-folder]').forEach(btn=>btn.onclick=()=>{activeFolder=decodeURIComponent(btn.dataset.openFolder);localStorage.setItem('dsbooks.activeFolder',activeFolder);render();});
  controls('libraryPages',total,size(),page,n=>{page=n;render();document.getElementById('shelfTitle').scrollIntoView({block:'start'});});
  controls('readingPages',readingTotal,24,readingPage,n=>{readingPage=n;render();document.getElementById('readingRail').scrollIntoView({block:'start'});});
 }
 };
})();
