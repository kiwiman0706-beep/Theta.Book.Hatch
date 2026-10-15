/* Presentation preferences are local. No book metadata or NAS files are changed. */
window.DSList=(()=>{
 'use strict';
 const $=id=>document.getElementById(id),esc=escapeHtml;
 const textCompare=new Intl.Collator('ja',{numeric:true,sensitivity:'base'}).compare;
 const progress=b=>Math.max(0,Math.min(100,Number(b.progress)||0));
 const members=b=>window.DSWork?DSWork.members(b):[b];
 const reading=b=>progress(b)>0&&progress(b)<100&&b.readState!=='finished';
 function comparator(){
  const key=$('sort').value,dir=$('sortDirection').value==='asc'?1:-1,pin=$('pinReading').checked,cache=new Map();
  function values(b){if(cache.has(b))return cache.get(b);const xs=members(b),v={
   title:b.title||'',author:b.author||'',series:b.series||'',volume:b.volume||'',folder:b.folder||b.genre||'',
   recent:Math.max(...xs.map(x=>Number(x.modifiedAt)||0)),lastRead:Math.max(...xs.map(x=>Number(x.lastReadAt)||0)),
   progress:progress(b),size:xs.reduce((s,x)=>s+(Number(x.size)||0),0),format:fmt(b),pin:xs.some(reading)
  };cache.set(b,v);return v;}
  return (a,b)=>{const x=values(a),y=values(b);if(pin&&x.pin!==y.pin)return Number(y.pin)-Number(x.pin);
   // Unknown dates and series stay at the end in either direction.
   if(['recent','lastRead','series','author'].includes(key)&&!!x[key]!==!!y[key])return x[key]?-1:1;
   let d=typeof x[key]==='number'?x[key]-y[key]:textCompare(x[key]||'',y[key]||'');
   if(!d&&key==='series')d=textCompare(x.volume,y.volume);
   return dir*d||textCompare(x.title,y.title)||textCompare(String(a.id),String(b.id));
  };
 }
 function date(value){const n=Number(value);return n>0?new Date(n).toLocaleDateString('ja-JP'):'';}
 function row(b){
  const xs=members(b),p=progress(b),saved=xs.filter(x=>x.offline).length;
  // Reuse the same lazy thumbnail source as the shelf; never load whole books here.
  const template=document.createElement('template');template.innerHTML=card(b,false);
  const cover=template.content.querySelector('.cover-wrap');
  cover.querySelectorAll('.badge,.mini-progress,.vinyl-disc').forEach(x=>x.remove());
  const formats=[...new Set(xs.map(fmt))].join(' + '),folder=b.folder||'';
  const status=b.readState==='finished'||p===100?'読了':p>0?(b.type==='Audio'?'聴いている途中':'読書中'):'未読';
  const savedText=saved===xs.length?'保存済み':saved?`一部保存 ${saved}/${xs.length}`:b.remote?'NAS':'未保存';
  const dates=$('sort').value==='lastRead'?date(Math.max(...xs.map(x=>Number(x.lastReadAt)||0))):date(Math.max(...xs.map(x=>Number(x.modifiedAt)||0)));
  return `<article class="book-card book-list-row" data-id="${encodeURIComponent(b.id)}" tabindex="0" role="button" aria-label="${esc(b.title)}の詳細を開く">
   ${cover.outerHTML}<div class="book-list-copy"><div class="book-title">${xs.some(x=>x.favorite)?'<span class="list-star" aria-label="お気に入り">★ </span>':''}${esc(b.title)}</div>
   <div class="book-author">${esc(b.author||'')}${b.series?' · '+esc(b.series)+(b.volume?' / '+esc(String(b.volume)):''):''}</div>
   ${folder?`<button class="list-folder" data-list-folder="${encodeURIComponent(folder)}" title="このフォルダを開く">▣ ${esc(folder)}</button>`:''}
   <div class="list-tags"><span class="format ${b.type==='Audio'?'audio':b.type==='ePub'?'epub':''}">${esc(formats)}</span><span class="list-saved ${saved?'saved':''}">${saved?'✓ ':''}${savedText}</span>${b.stale||b.libraryExcluded?'<span>NAS未確認／対象外</span>':''}</div>
   </div><div class="book-list-status"><strong>${p}% <span>${status}</span></strong><div class="list-progress" role="progressbar" aria-label="${esc(fmt(b))}の進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i style="width:${p}%"></i></div>
   <small>${xs.length>1?esc(fmt(b))+'の進捗 · ':''}${formatBytes(xs.reduce((s,x)=>s+(Number(x.size)||0),0))}</small>${dates?'<small>'+($('sort').value==='lastRead'?'最終読書 ':'更新 ')+dates+'</small>':''}</div>
  </article>`;
 }
 function bind(){
  grid.querySelectorAll('.book-list-row').forEach(el=>el.onkeydown=e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openBook(decodeURIComponent(el.dataset.id));}});
  grid.querySelectorAll('[data-list-folder]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();activeFolder=decodeURIComponent(btn.dataset.listFolder);activeGenre='';localStorage.setItem('dsbooks.activeFolder',activeFolder);render();});
 }
 const options=[['recent','追加・更新日'],['title','タイトル'],['author','著者'],['series','シリーズ・巻'],['lastRead','最後に読んだ日'],['progress','進捗'],['folder','フォルダ'],['format','形式'],['size','容量']];
 const savedSort=localStorage.getItem('dsbooks.sort')||'recent';
 $('sort').innerHTML=options.map(([k,label])=>`<option value="${k}">${label}</option>`).join('');$('sort').value=options.some(x=>x[0]===savedSort)?savedSort:'recent';$('sort').setAttribute('aria-label','本の並べ替え');
 const bar=document.createElement('div');bar.className='list-display-tools';bar.innerHTML='<div class="list-view-buttons" role="group" aria-label="本棚の表示方法"><button data-library-view="grid">▦ 本棚</button><button data-library-view="list">☰ リスト</button><button data-library-view="flow">▱ 横並び</button></div><select id="sortDirection" aria-label="並べ替えの方向"><option value="asc">昇順 ↑</option><option value="desc">降順 ↓</option></select><label><input type="checkbox" id="pinReading"> 読みかけを先頭</label>';
 $('filters').after(bar);
 const oldToggle=document.querySelector('.viewtoggle');oldToggle.hidden=true;
 const defaultDir=()=>['recent','lastRead','progress','size'].includes($('sort').value)?'desc':'asc';
 $('sortDirection').value=['asc','desc'].includes(localStorage.getItem('dsbooks.sortDirection'))?localStorage.getItem('dsbooks.sortDirection'):defaultDir();
 $('pinReading').checked=localStorage.getItem('dsbooks.pinReading')!=='false';
 view=['grid','list','flow'].includes(localStorage.getItem('dsbooks.libraryView'))?localStorage.getItem('dsbooks.libraryView'):'grid';
 function sync(){document.querySelectorAll('[data-library-view]').forEach(btn=>{btn.classList.toggle('selected',btn.dataset.libraryView===view);btn.setAttribute('aria-pressed',String(btn.dataset.libraryView===view));});}
 bar.querySelectorAll('[data-library-view]').forEach(btn=>btn.onclick=()=>{view=btn.dataset.libraryView;localStorage.setItem('dsbooks.libraryView',view);sync();render();});
 $('sort').onchange=()=>{localStorage.setItem('dsbooks.sort',$('sort').value);$('sortDirection').value=defaultDir();localStorage.setItem('dsbooks.sortDirection',$('sortDirection').value);render();};
 $('sortDirection').onchange=()=>{localStorage.setItem('dsbooks.sortDirection',$('sortDirection').value);render();};
 $('pinReading').onchange=()=>{localStorage.setItem('dsbooks.pinReading',String($('pinReading').checked));render();};
 sync();return {comparator,row,bind};
})();
