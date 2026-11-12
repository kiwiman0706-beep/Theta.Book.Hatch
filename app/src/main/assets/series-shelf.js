/* Theta Hatch "アプリの棚" (Theta.Hatch.Series spec/THETA_SHARED_SETTINGS.md §4.2): the books Home shows in its
   "本" area. Each time the library is saved, up to 30 books (reading, then favourites, then recently opened; each
   book once) go to DSBooksNative.updateShelf, which keeps them for content://<applicationId>.theta/shelf.
   Only title, author/volume/page and the cached cover are shared: no text, notes, NAS address or account.
   Settings → "ウィジェット：Theta Home の本棚" chooses which sections are shown (dsbooks.shelfSections). */
window.DSShelf=(()=>{
 const N=()=>window.DSBooksNative||{};
 const SECTIONS=[['reading','読みかけ'],['favorites','お気に入り'],['recent','最近']];
 function enabled(){try{const v=JSON.parse(localStorage.getItem('dsbooks.shelfSections')||'null');if(v&&typeof v==='object')return v;}catch(e){}return {reading:true,favorites:true,recent:true};}
 function subtitle(b){const parts=[];if(b.author)parts.push(String(b.author));if(b.volume)parts.push(/^\d+$/.test(String(b.volume))?b.volume+'巻':String(b.volume));
  const page=Number(b.currentPage)||0,count=Number(b.pageCount)||0,p=Number(b.progress)||0;
  if(page>0&&count>0)parts.push(page+'/'+count+'ページ');else if(p>0&&p<100)parts.push(Math.round(p)+'%');else if(p>=100||b.readState==='finished')parts.push('読了');
  return parts.join('・').slice(0,120);}
 function row(b,section,title){const local=b.offline&&b.localName?String(b.localName):'';
  return {section,sectionTitle:title,id:String(b.id),title:String(b.title||'タイトル不明').slice(0,200),subtitle:subtitle(b),
   coverLocal:local,coverRemote:b.remote&&b.path?'remote:'+String(b.path)+'|'+String(b.modifiedAt||0):''};}
 /** The rows Home gets, in order (at most 30). */
 function rows(list,on=enabled()){const lib=(list||[]).filter(b=>b&&b.id!=null&&(typeof inLibrary!=='function'||inLibrary(b)));const seen=new Set(),out=[];
  const last=b=>Number(b.lastReadAt)||0;
  const pick={
   reading:()=>lib.filter(b=>Number(b.progress)>0&&Number(b.progress)<100&&b.readState!=='finished').sort((a,b)=>last(b)-last(a)),
   favorites:()=>lib.filter(b=>b.favorite).sort((a,b)=>last(b)-last(a)),
   recent:()=>lib.filter(b=>last(b)>0).sort((a,b)=>last(b)-last(a))};
  const limit={reading:12,favorites:12,recent:12};
  for(const [key,title] of SECTIONS){if(!on[key])continue;let n=0;for(const b of pick[key]()){if(out.length>=30||n>=limit[key])break;const id=String(b.id);if(seen.has(id))continue;seen.add(id);out.push(row(b,key,title));n++;}}
  return out;}
 let last='';
 function publish(){if(!N().updateShelf)return;try{const json=JSON.stringify(rows(typeof books!=='undefined'?books:[]));if(json===last)return;last=json;N().updateShelf(json);}catch(e){}}
 if(typeof publishWidgetBooks==='function'){const o=publishWidgetBooks;publishWidgetBooks=function(){const r=o.apply(this,arguments);publish();return r;};}

 /* ---------- settings ---------- */
 const F=window.DSFeatures;
 if(F&&N().updateShelf&&/^app\.thetahatch\./.test(String(N().appPackageName?.()||''))){const settings=F.settings;F.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet');if(!sheet)return;const on=enabled(),box=document.createElement('section');
   box.innerHTML='<h3>ウィジェット：Theta Home の本棚</h3><p class="feature-hint">Theta Home Hatch の「本」に表紙と書名・何ページまでを見せます（本文・メモ・NAS の情報は渡しません）。</p><div class="feature-actions">'+
    SECTIONS.map(([k,t])=>`<label><input type="checkbox" data-shelf="${k}"${on[k]?' checked':''}> ${t}</label>`).join(' ')+'</div>';
   sheet.appendChild(box);
   box.querySelectorAll('[data-shelf]').forEach(c=>c.onchange=()=>{const v=enabled();v[c.dataset.shelf]=c.checked;localStorage.setItem('dsbooks.shelfSections',JSON.stringify(v));publish();});};
  const s=document.getElementById('settingsBtn'),m=document.getElementById('mobileSettings');if(s)s.onclick=F.settings;if(m)m.onclick=F.settings;}
 return {rows,publish,enabled,subtitle};
})();
