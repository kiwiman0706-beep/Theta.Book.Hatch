/* 0.9.7 `.jisui` (jisui-1, docs/JISUI_FORMAT.md): one ZIP holding a FullOCR vault (+ digest, + optional PDF).
   Opening a .jisui puts its Markdown files on the catalog as hidden "members" (localName "<container>\n<entry>")
   that the Markdown reader, page anchors (fullocr-1) and digest (theta-digest-1) use like files of one folder.
   The source PDF is embedded (a member), a sidecar beside the .jisui, or none. The .jisui is never written to.
   Also: Theta.Jisui.Viewer mode (isViewer) hides the NAS parts; files opened with the app ("open with",
   double-click, a second launch) are opened here. */
window.DSJisui=(()=>{
 'use strict';
 const $=id=>document.getElementById(id),A=window.DSMdAnchors,N=()=>window.DSBooksNative||{};
 const viewer=(()=>{try{return !!N().isViewer?.();}catch(e){return false;}})();
 const manifests=new Map();
 const SEP='\n';
 const baseName=s=>String(s||'').split('/').pop();
 const isMember=b=>!!b?.jisuiOf;
 const containerOf=b=>books.find(x=>String(x.id)===String(b.jisuiOf));

 function manifest(c){
  if(manifests.has(c.localName))return manifests.get(c.localName);
  // jisui-1 names the manifest theta-book.json (the first draft called it jisui.json; both are read).
  let m=null;for(const name of ['theta-book.json','jisui.json']){try{m=JSON.parse(N().readText(c.localName+SEP+name)||'null');}catch(e){m=null;}if(m)break;}
  if(!m||!/^jisui-\d+$/.test(String(m.format||'')))m=null;
  manifests.set(c.localName,m);return m;
 }
 const folderKey=c=>A.dir(c)||'jisui:'+c.id;
 function upsert(fields){let b=books.find(x=>String(x.id)===String(fields.id));if(!b){b={progress:0,cover:'c5',author:'',genre:'自炊',label:'',offline:true,...fields};books.push(b);}else Object.assign(b,fields);return b;}
 // Make (or refresh) the hidden member books of a container. Returns the entry member, or null with a message.
 function members(c){
  const m=manifest(c);if(!m)return {error:'.jisui の目録（theta-book.json）を読めません。FullOCR の jisui-1 形式か確認してください'};
  let entries=[];try{entries=JSON.parse(N().jisuiEntries?.(c.localName)||'[]');}catch(e){}
  const key=folderKey(c),common={jisuiOf:c.id,digestDir:key,folder:c.folder,offline:true};let entry=null;
  for(const e of entries){const name=String(e.name||'');if(!/\.md$/i.test(name))continue;
   const mb=upsert({id:c.id+'!'+name,title:baseName(name).replace(/\.md$/i,''),type:'Markdown',fileExt:'MD',localName:c.localName+SEP+name,fileName:baseName(name),zipPath:name,size:e.size,...common});
   if(name===m.entry)entry=mb;}
  const pdf=m.pdf||{};
  if(pdf.mode==='embedded'&&pdf.name&&entries.some(e=>e.name===pdf.name))upsert({id:c.id+'!pdf',title:(m.title||c.title)+'（原文PDF）',type:'PDF',fileExt:'PDF',localName:c.localName+SEP+pdf.name,fileName:baseName(pdf.name),...common});
  if(pdf.mode==='sidecar'&&pdf.sidecar){const local=N().jisuiSidecar?.(c.localName,pdf.sidecar);if(local)upsert({id:c.id+'!sidecar',title:(m.title||c.title)+'（原文PDF）',type:'PDF',fileExt:'PDF',localName:local,fileName:baseName(pdf.name||pdf.sidecar),...common});}
  if(m.title&&c.title!==m.title&&!c.titleEdited){c.title=m.title;if(m.author)c.author=m.author;}
  saveCatalog();
  return {entry:entry||books.find(x=>x.jisuiOf===c.id&&x.type==='Markdown'),manifest:m};
 }
 // The source PDF for a member (or the container): embedded member, sidecar (in place / beside it on the NAS / picked by the user).
 function pdfOf(c){
  const m=manifest(c);if(!m)return undefined;const pdf=m.pdf||{};
  if(pdf.mode==='none')return null;
  if(pdf.mode==='embedded')return books.find(x=>x.id===c.id+'!pdf')||null;
  const side=pdf.sidecar||'';
  return books.find(x=>x.id===c.id+'!sidecar')
   ||(A.dir(c)?books.find(x=>x.type==='PDF'&&A.dir(x)===A.dir(c)&&A.fileOf(x)===side):null)
   ||books.find(x=>x.type==='PDF'&&!x.jisuiOf&&(x.importName===side||A.fileOf(x)===side))||null;
 }
 A.pdfResolvers.push(b=>{const c=isMember(b)?containerOf(b):b.type==='Jisui'?b:null;return c?pdfOf(c):undefined;});
 function pdfMissing(b){const c=isMember(b)?containerOf(b):null,m=c&&manifest(c);if(!m)return '';const pdf=m.pdf||{};
  if(pdf.mode==='none')return 'この .jisui には原文PDFが入っていません（PDFなしで作成）';
  if(pdf.mode==='sidecar')return `原文PDF「${pdf.sidecar}」が .jisui と同じフォルダに見つかりません`+(N().jisuiSidecar?'':'（設定 →「端末の本を追加」でそのPDFを選ぶと使えます）');
  return '原文PDFを .jisui の中に見つけられません';}

 /* ---------- open ---------- */
 function open(c){
  const r=members(c);if(r.error||!r.entry){toast(r.error||'.jisui に Markdown がありません');return;}
  c.lastReadAt=Date.now();c.progress=Math.max(1,Number(c.progress)||0);saveCatalog();
  const last=c.lastMember&&books.find(x=>x.id===c.lastMember);
  openLocalBook(last&&N().hasBook(last.localName)?last:r.entry);
 }
 const openLocal=openLocalBook;
 openLocalBook=function(b,...rest){
  if(b?.type==='Jisui'){if(!N().hasBook?.(b.localName)){return openLocal.call(this,b,...rest);}open(b);return;}
  if(isMember(b)){const c=containerOf(b);if(c){c.lastReadAt=Date.now();if(b.type==='Markdown')c.lastMember=b.id;}}
  return openLocal.call(this,b,...rest);
 };
 // Members are parts of one book: never on the shelf, in "reading", search or counts.
 const inLib=inLibrary;inLibrary=b=>!isMember(b)&&inLib(b);
 const visible=visibleInLibrary;visibleInLibrary=b=>!isMember(b)&&visible(b);

 /* ---------- pictures inside a .jisui ---------- */
 const md=markdownReader;
 markdownReader=function(b){
  md(b);if(!isMember(b))return;const c=containerOf(b);if(!c)return;
  const dir=String(b.zipPath||'').includes('/')?b.zipPath.slice(0,b.zipPath.lastIndexOf('/')+1):'';
  let names=null;const all=()=>names||(names=(()=>{try{return JSON.parse(N().jisuiEntries?.(c.localName)||'[]').map(e=>e.name);}catch(e){return [];}})());
  document.querySelectorAll('#mdPage .md-image[data-src]').forEach(span=>{const src=span.dataset.src;
   // Obsidian resolves a bare name anywhere in the vault; a path is relative to the note.
   const path=src.includes('/')?(dir+src).replace(/(^|\/)\.\//g,'$1'):(all().find(n=>n===src||n.endsWith('/'+src))||src);
   const url=N().jisuiImage?.(c.localName+SEP+path);if(!url)return;
   const im=document.createElement('img');im.className='md-figure';im.alt=span.textContent.replace(/^［画像：|］$/g,'');im.loading='lazy';im.src=url;span.replaceWith(im);});
 };

 /* ---------- files handed to the app (Android "open with", desktop double-click / second launch) ---------- */
 const ready=fn=>{(function wait(){if(window.DSBoot&&DSBoot.readyMs!==undefined)fn();else setTimeout(wait,60);})();};
 function adopt(list,openFirst){
  if(!list?.length)return;if(!remoteMode){books=books.filter(b=>b.localName&&!b.demo&&typeof b.id!=='number');remoteMode=true;}
  let first=null;for(const nb of list){let b=books.find(x=>x.bookId===nb.bookId);if(b)Object.assign(b,{localName:nb.localName,offline:true,size:nb.size});else{b={...nb,label:formatBytes(nb.size),genre:nb.type==='Jisui'?'自炊':'取り込み'};books.push(b);}manifests.delete(b.localName);first=first||b;}
  saveCatalog();render();if(openFirst&&first){closeModal?.();openLocalBook(first);}
 }
 const prevExchange=window.onDataExchange;
 window.onDataExchange=o=>{if(o&&o.open){ready(()=>{if(o.error||!o.books?.length){toast(o.error||o.errors?.[0]||'ファイルを開けませんでした');return;}adopt(o.books,true);});return;}return prevExchange?.(o);};
 const reader=new URLSearchParams(location.search).get('reader');
 window.dsOpenPending=()=>{if(reader)return;let list=[];try{list=JSON.parse(N().takePendingOpen?.()||'[]');}catch(e){}adopt(list,true);};
 ready(()=>window.dsOpenPending());

 /* ---------- Shuei Times only where it is bundled: never in the viewer (shipped with FullOCR) or public builds ---------- */
 if(viewer||(()=>{try{return N().hasBundledFont?.()===false;}catch(e){return false;}})()){
  const F=DSFeatures,fontOptions=F.fontOptions;F.fontOptions=v=>fontOptions(v==='shuei'?'serif':v).replace(/<option value="shuei"[^>]*>[^<]*<\/option>/,'');
  if(F.prefs().fontFace==='shuei')F.savePrefs({...F.prefs(),fontFace:'serif'});
 }
 /* ---------- Theta.Jisui.Viewer: the viewer without NAS ---------- */
 if(viewer){
  document.documentElement.classList.add('viewer-mode');document.title='Theta.Jisui.Viewer';

  ready(()=>{
   if(!remoteMode){books=books.filter(b=>b.localName&&typeof b.id!=='number');remoteMode=true;saveCatalog();render();}
   const hero=document.querySelector('.hero');if(hero&&!$('openJisui')){hero.querySelector('h1')&&(hero.querySelector('h1').textContent='自炊本');const p=hero.querySelector('p');if(p)p.textContent='FullOCR で作った .jisui を開いて読む・聞く・調べる。';
    const btn=document.createElement('button');btn.className='hero-cta';btn.id='openJisui';btn.textContent='📂 ファイルを開く';btn.onclick=()=>N().chooseBooks?.();hero.appendChild(btn);}
   const brand=document.querySelector('.mobile-brand');if(brand)brand.innerHTML='<span>▤</span> Jisui Viewer';
  });
 }
 // Book settings from the manifest (pdf name, page_offset) fill in what 00_index.md's front matter does not say.
 function settingsFor(b){const c=isMember(b)?containerOf(b):b?.type==='Jisui'?b:null,m=c&&manifest(c);if(!m)return null;const out={page_anchors:m.page_anchors||'',title:m.title||''};if(m.page_offset!==undefined&&m.page_offset!==null)out.page_offset=String(m.page_offset);if(m.pdf?.name)out.pdf_file=m.pdf.name;return out;}
 return {open,manifest,members,pdfOf,pdfMissing,settingsFor,viewer};
})();
