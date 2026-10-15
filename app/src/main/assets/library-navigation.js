/* Library navigation and presentation. No book or NAS file is changed here. */
(()=>{'use strict';
const $=id=>document.getElementById(id),F=DSFeatures;
const styles=document.createElement('style');styles.textContent=`
.library-tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:8px 0}
.library-tools button,.library-tools select{font:inherit;font-size:11px;border:1px solid var(--line);border-radius:9px;padding:8px;background:var(--paper);color:var(--ink)}
.library-tools [hidden]{display:none}
.folder-detail[data-density="compact"] .shelf-rail{grid-template-columns:repeat(auto-fill,minmax(105px,1fr))}
.folder-detail[data-density="large"] .shelf-rail{grid-template-columns:repeat(auto-fill,minmax(185px,1fr))}
.folder-detail[data-density="large"] .cover-wrap{max-width:240px}
.series-jump{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}
.series-jump h3{font-size:14px;margin:0 0 8px;overflow-wrap:anywhere}
.series-jump .feature-actions>button{flex:1;min-width:0;overflow-wrap:anywhere}
@media(max-width:520px){.folder-detail[data-density="compact"] .shelf-rail{grid-template-columns:repeat(auto-fill,minmax(75px,1fr))}.folder-detail[data-density="large"] .shelf-rail{grid-template-columns:repeat(auto-fill,minmax(135px,1fr))}}
`;document.head.appendChild(styles);
const tools=document.createElement('div');tools.className='library-tools';tools.innerHTML='<button id="libraryHome">‹ 本棚ホーム</button><button id="clearLibraryFilters">絞り込みを解除</button><select id="coverDensity" aria-label="フォルダ内の表紙サイズ"><option value="compact">表紙：小</option><option value="normal">表紙：標準</option><option value="large">表紙：大</option></select>';$('bookGrid').before(tools);
const density=$('coverDensity'),sort=$('sort');density.value=['compact','normal','large'].includes(localStorage.getItem('dsbooks.coverDensity'))?localStorage.getItem('dsbooks.coverDensity'):'normal';
const savedSort=localStorage.getItem('dsbooks.sort');if([...sort.options].some(o=>o.value===savedSort))sort.value=savedSort;
sort.addEventListener('change',()=>localStorage.setItem('dsbooks.sort',sort.value));
density.onchange=()=>{localStorage.setItem('dsbooks.coverDensity',density.value);render();};
function hasFilters(){return !!query||activeType!=='all'||!!activeGenre||F.hasLibraryFilters();}
function clearFilters(){query='';$('search').value='';activeType='all';activeGenre='';F.resetLibraryFilters();document.querySelectorAll('.filter').forEach(el=>el.classList.toggle('selected',el.dataset.type==='all'));}
function home(){activeFolder='';activeNav='home';localStorage.setItem('dsbooks.activeFolder','');$('folderFilter').value='';clearFilters();document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav==='home'));render();}
$('libraryHome').onclick=home;$('allFolders').onclick=home;
$('clearLibraryFilters').onclick=()=>{clearFilters();render();};
// Modal/reader and nested panels always get the first chance to consume Back.
const back=window.dsbooksHandleBack;window.dsbooksHandleBack=()=>{if(back())return true;if(activeFolder||activeNav!=='home'||hasFilters()){home();return true;}return false;};
// Tabs start with a clean scope, matching their labels.
document.querySelectorAll('[data-nav]').forEach(btn=>{const old=btn.onclick;btn.onclick=e=>{clearFilters();localStorage.setItem('dsbooks.activeFolder','');old(e);};});
function updateCounts(){
 const collapse=xs=>window.DSWork?DSWork.collapse(xs):xs;
 const totals=[collapse(books.filter(inLibrary)).length,collapse(books.filter(b=>b.offline)).length,collapse(books.filter(b=>inLibrary(b)&&b.progress>0&&b.progress<100&&b.readState!=='finished')).length,collapse(books.filter(b=>inLibrary(b)&&b.type==='Audio')).length];
 document.querySelectorAll('.summary .pill b').forEach((e,i)=>{e.textContent=totals[i]+'冊';});
 for(const [nav,n]of [['home',totals[0]],['downloaded',totals[1]]]){const e=document.querySelector('.sidebar [data-nav="'+nav+'"] .count');if(e)e.textContent=n;}
}
const reading=renderReading;renderReading=function(){reading();updateCounts();};
// Cache scroll positions by view only in this session. Returning to a shelf keeps its place.
const positions=new Map();let context=null,epoch=0;
function key(){return JSON.stringify([view,$('sort').value,$('sortDirection')?.value,$('pinReading')?.checked,activeFolder,activeNav,activeGenre,activeType,query,$('readingFilter').value,$('tagFilter').value]);}
function rails(){return [...document.querySelectorAll('.folder-shelf')].map(el=>({el:el.querySelector('.shelf-rail'),name:el.querySelector('h3')?.textContent||''}));}
const baseRender=render;render=function(){if(DSBoot.loading)return;
 if(context!==null)positions.set(context,{y:scrollY,rails:rails().map(x=>[x.name,x.el.scrollLeft])});
 baseRender();const next=key(),old=context;context=next;const run=++epoch;
 $('bookGrid').dataset.density=density.value;$('libraryHome').hidden=!activeFolder&&activeNav==='home';$('clearLibraryFilters').hidden=!hasFilters();density.hidden=!activeFolder||view!=='grid';
 // Existing headings enter a folder; make the action accessible to keyboards too.
 document.querySelectorAll('.folder-shelf-name h3').forEach(h=>{if(!activeFolder){h.tabIndex=0;h.setAttribute('role','button');h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();h.click();}};}});
 const pos=positions.get(next);requestAnimationFrame(()=>{if(run!==epoch)return;if(pos){const byName=new Map(pos.rails);rails().forEach(x=>{x.el.scrollLeft=byName.get(x.name)||0;});window.scrollTo(0,pos.y);}else if(old!==null&&old!==next)window.scrollTo(0,activeFolder?Math.max(0,$('shelfTitle').getBoundingClientRect().top+scrollY-8):0);});
 updateCounts();
};
// Adjacent volumes stay inside the same folder and series. Grouped PDF/audio stays one work.
const detail=DSWork.detail;DSWork.detail=function(b){detail(b);if(!b.series)return;
 const items=DSWork.collapse(books.filter(x=>visibleInLibrary(x)&&x.folder===b.folder&&x.series===b.series)).sort((a,c)=>String(a.volume||a.title).localeCompare(String(c.volume||c.title),'ja',{numeric:true})||String(a.id).localeCompare(String(c.id)));
 const i=items.findIndex(x=>DSWork.members(x).some(m=>String(m.id)===String(b.id)));if(i<0||items.length<2)return;
 const section=document.createElement('section');section.className='series-jump';const heading=document.createElement('h3');heading.textContent=b.series+' · '+(i+1)+' / '+items.length+'冊';section.appendChild(heading);
 const actions=document.createElement('div');actions.className='feature-actions';for(const [dir,label]of [[-1,'‹ 前巻'],[1,'次巻 ›']]){const btn=document.createElement('button');btn.className='secondary';btn.dataset.seriesDirection=dir;btn.textContent=label;btn.disabled=!items[i+dir];btn.onclick=()=>openBook(items[i+dir].id);actions.appendChild(btn);}section.appendChild(actions);
 const list=document.createElement('button');list.className='secondary';list.textContent='巻一覧';list.id='seriesVolumes';list.onclick=()=>{F.panel('巻一覧','<div id="seriesVolumeList"></div>');for(const item of items){const btn=document.createElement('button');btn.className='secondary series-list';btn.textContent=(item.volume?item.volume+' · ':'')+item.title+(item.id===items[i].id?'（表示中）':'');btn.onclick=()=>openBook(item.id);$('seriesVolumeList').appendChild(btn);}};section.appendChild(list);document.querySelector('#modal .feature-sheet').appendChild(section);
};
render();
})();
