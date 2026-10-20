/* 0.9.5 FullOCR page anchors (`fullocr-1`, docs/FULLOCR_PAGE_ANCHORS.md).
   FullOCR writes one invisible `<!-- fullocr:page pdf=N print="15" -->` line before each PDF page's text and
   declares `page_anchors: fullocr-1` / `pdf_file` / `page_offset` in 00_index.md's front matter.
   The Markdown reader hides the markers, shows the current printed page, and "原文" opens the PDF at page N;
   the PDF reader can jump back to the Markdown at the same page (across chapter files of the same folder).
   Also hides front matter, HTML comments and Obsidian %%comments%%, and makes [[wikilinks]] open sibling files. */
window.DSMdAnchors=(()=>{
 'use strict';
 const MARKER=/<!--\s*fullocr:page\s+pdf=(\d+)(?:\s+print="([^"]*)")?\s*-->/g;
 const $=id=>document.getElementById(id);
 let last=null,pending=null,back=null;
 const pdfResolvers=[];  // e.g. jisui-1: the PDF of a .jisui (embedded / sidecar) for its members
 const textCache=new Map();

 /* ---------- parsing ---------- */
 function frontMatter(text){
  const m=/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);if(!m)return {meta:{},body:text};
  const meta={};for(const line of m[1].split(/\r?\n/)){const kv=/^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(line);if(!kv)continue;let v=kv[2].replace(/\s+#.*$/,'');if(/^(["']).*\1$/.test(v))v=v.slice(1,-1);meta[kv[1]]=v;}
  return {meta,body:text.slice(m[0].length)};
 }
 function anchorsOf(text){const out=[];MARKER.lastIndex=0;let m;while((m=MARKER.exec(text)))out.push({pdf:Number(m[1]),print:m[2]||''});return out;}
 // Markdown source -> source with tokens the (escaping) renderer keeps as-is, plus what the tokens stand for.
 function prepare(source){
  const {meta,body}=frontMatter(String(source).replace(/^﻿/,''));const anchors=[],links=[];
  let text=body.replace(MARKER,(_,pdf,print)=>'⟦FO:'+(anchors.push({pdf:Number(pdf),print:print||''})-1)+'⟧');
  // Obsidian %%comments%% (FullOCR hides the printed table of contents this way): hidden, but their page markers stay.
  text=text.replace(/%%[\s\S]*?%%/g,s=>(s.match(/⟦FO:\d+⟧/g)||[]).join('\n\n'));
  text=text.replace(/<!--[\s\S]*?-->/g,'');
  // Pictures: kept as tokens with their vault path; a container that can read them (jisui-1) shows them, others show the name.
  const images=[];const img=(src,alt)=>'⟦IM:'+(images.push({src:src.trim(),alt:(alt||src).trim()})-1)+'⟧';
  text=text.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(_,t,alt)=>img(t,alt&&!/^\d+(x\d+)?$/.test(alt)?alt:t.split('/').pop()));
  text=text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,(_,alt,src)=>/^[a-z]+:/i.test(src)?'［画像：'+(alt||src)+'］':img(decodeURIComponent(src),alt||src.split('/').pop()));
  text=text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,target,alias)=>{const [file,heading]=target.split('#');return '⟦WL:'+(links.push({file:file.trim(),heading:(heading||'').trim(),label:(alias||heading||file).trim()})-1)+'⟧';});
  text=text.replace(/\n{3,}/g,'\n\n');
  return last={text,meta,anchors,links,images};
 }
 function html(markup){
  const p=last;if(!p)return markup;
  const anchor=i=>{const a=p.anchors[i];return a?`<span class="fo-anchor" data-pdf="${a.pdf}" data-print="${escapeHtml(a.print)}"></span>`:'';};
  return markup.replace(/<p>((?:\s|<br>)*⟦FO:\d+⟧(?:\s|<br>)*)+<\/p>/g,s=>(s.match(/⟦FO:(\d+)⟧/g)||[]).map(t=>anchor(Number(t.slice(4,-1)))).join(''))
   .replace(/⟦FO:(\d+)⟧/g,(_,i)=>anchor(Number(i)))
   .replace(/⟦IM:(\d+)⟧/g,(_,i)=>{const m=(p.images||[])[Number(i)];return m?`<span class="md-image" data-src="${escapeHtml(m.src)}">［画像：${escapeHtml(m.alt)}］</span>`:'';})
   .replace(/⟦WL:(\d+)⟧/g,(_,i)=>{const l=p.links[Number(i)];return l?`<a class="md-wikilink" href="#" data-wl="${i}">${escapeHtml(l.label)}</a>`:'';});
 }

 /* ---------- books of the same folder ---------- */
 const dir=b=>{if(b?.digestDir)return b.digestDir;const s=String(b?.path||'');const i=s.lastIndexOf('/');return i>0?s.slice(0,i):null;};
 const base=s=>{s=String(s||'');return s.slice(s.lastIndexOf('/')+1);};
 const fileOf=b=>b.fileName||base(b.path)||base(b.localName)||(b.title||'')+'.'+String(b.fileExt||'').toLowerCase();
 const stem=s=>base(s).replace(/\.[^.]+$/,'');
 const local=b=>!!(b&&b.localName&&window.DSBooksNative&&DSBooksNative.hasBook(b.localName));
 function siblings(b){const d=dir(b);return d?books.filter(x=>x!==b&&dir(x)===d):[];}
 function readLocal(b){if(!local(b))return null;const key=b.localName+'|'+(b.modifiedAt||b.size||'');if(textCache.has(key))return textCache.get(key);const t=DSBooksNative.readText(b.localName);if(t==null)return null;if(textCache.size>40)textCache.clear();textCache.set(key,t);return t;}
 // The book (folder) settings live in 00_index.md; the current file may be it.
 function settings(b,own){
  if(own.page_anchors)return own;
  const idx=siblings(b).find(x=>x.type==='Markdown'&&/^00_index\.md$/i.test(fileOf(x)));
  const t=idx&&readLocal(idx);return t?frontMatter(t).meta:{};
 }
 function pdfFor(b,meta){
  for(const r of pdfResolvers){const hit=r(b,meta);if(hit!==undefined)return hit;}
  const name=meta.pdf_file?base(meta.pdf_file):'';const pdfs=siblings(b).filter(x=>x.type==='PDF');
  if(name){const hit=pdfs.find(x=>fileOf(x)===name)||books.find(x=>x.type==='PDF'&&fileOf(x)===name);if(hit)return hit;}
  return pdfs.find(x=>/_text\.pdf$/i.test(fileOf(x)))||(pdfs.length===1?pdfs[0]:null);
 }
 function label(a,meta){
  if(!a)return '';if(a.print)return 'p.'+a.print;
  const off=Number(meta.page_offset);if(meta.page_offset!==undefined&&meta.page_offset!==''&&Number.isFinite(off)&&a.pdf-off>0)return 'p.'+(a.pdf-off);
  return 'p.'+a.pdf+'（PDF通し）';
 }

 /* ---------- Markdown reader ---------- */
 function current(viewport,els){
  const top=viewport.getBoundingClientRect().top+24;let lo=0,hi=els.length-1,found=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(els[mid].getBoundingClientRect().top<=top){found=mid;lo=mid+1;}else hi=mid-1;}
  return els[Math.max(0,found)];
 }
 function scrollTo(viewport,el){if(!el)return;viewport.scrollTop+=el.getBoundingClientRect().top-viewport.getBoundingClientRect().top-4;}
 function openOther(b){if(local(b))openLocalBook(b);else openBook(b.id);}
 // Open the source PDF of `from`'s folder at physical page n (1-based); false when there is no such PDF.
 function openPdfPage(from,meta,n){const pdf=pdfFor(from,meta);if(!pdf)return false;pdf.currentPage=Math.max(0,n-1);saveCatalog();back={md:from.id,pdf:pdf.id};openOther(pdf);return true;}
 // Open a Markdown file of `from`'s folder (by file stem, or the file holding that heading) at a heading or a physical page.
 function openMd(from,file,heading,pdfPage){
  const mds=siblings(from).filter(x=>x.type==='Markdown');let target=file?mds.find(x=>stem(fileOf(x))===stem(file)):null;
  if(!target&&heading){const re=new RegExp('^#{1,6}\\s+'+heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$','m');target=mds.find(x=>{const t=readLocal(x);return t!=null&&re.test(t);});}
  if(!target&&pdfPage){let best=null;for(const md of mds){const t=readLocal(md);if(t==null)continue;for(const a of anchorsOf(t))if(a.pdf<=pdfPage&&(!best||a.pdf>best.pdf))best={md,pdf:a.pdf};}target=best?.md;heading=null;}
  if(!target)return false;pending={id:target.id,heading:heading||'',pdf:heading?0:pdfPage};openOther(target);return true;
 }
 const wrapped=markdownReader;
 markdownReader=function(b){
  last=null;wrapped(b);const page=$('mdPage'),p=last;if(!page||!p)return;
  const viewport=page.closest('.reader-viewport');
  page.querySelectorAll('.md-wikilink').forEach(a=>a.onclick=e=>{e.preventDefault();const l=p.links[Number(a.dataset.wl)];
   if(!l.file||stem(l.file)===stem(fileOf(b))){const h=[...page.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x=>x.textContent.trim()===l.heading);if(h)scrollTo(viewport,h);return;}
   const target=siblings(b).find(x=>x.type==='Markdown'&&stem(fileOf(x))===stem(l.file));
   if(!target){toast('「'+l.file+'」が同じフォルダに見つかりません');return;}pending={id:target.id,heading:l.heading};openOther(target);});
  const els=[...page.querySelectorAll('.fo-anchor')];
  if(els.length){
   const meta=settings(b,p.meta);
   const btn=document.createElement('button');btn.className='tool-btn md-original';btn.id='mdOriginal';btn.title='原文（PDF）のこのページを開く';
   document.querySelector('.reader-top')?.appendChild(btn);
   const at=()=>{const el=current(viewport,els);return {pdf:Number(el.dataset.pdf),print:el.dataset.print||''};};
   let raf=0;const update=()=>{raf=0;btn.textContent='原文 '+label(at(),meta);};
   viewport.addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(update);},{passive:true});
   btn.onclick=()=>{if(!openPdfPage(b,meta,at().pdf))toast(window.DSJisui?.pdfMissing?.(b)||'原文のPDF'+(meta.pdf_file?'「'+base(meta.pdf_file)+'」':'')+'が同じフォルダに見つかりません');};
   update();
  }
  // Arrived from the PDF ("本文へ") or a wikilink: go to that page / heading.
  if(pending&&String(pending.id)===String(b.id)){const want=pending;pending=null;
   requestAnimationFrame(()=>{if(want.pdf){let el=null;for(const e of els){if(Number(e.dataset.pdf)<=want.pdf)el=e;else break;}scrollTo(viewport,el||els[0]);}
    else if(want.heading){const h=[...page.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x=>x.textContent.trim()===want.heading);scrollTo(viewport,h);}
    els.length&&viewport.dispatchEvent(new Event('scroll'));});}
 };

 /* ---------- PDF reader: back to the Markdown at the same page ---------- */
 function mdFilesFor(pdf){
  const own=back&&String(back.pdf)===String(pdf.id)?books.find(x=>String(x.id)===String(back.md)):null;
  const mds=siblings(pdf).filter(x=>x.type==='Markdown');
  if(!own){const idx=mds.find(x=>/^00_index\.md$/i.test(fileOf(x)));const t=idx&&readLocal(idx);const m=t?frontMatter(t).meta:{};if(!m.page_anchors||(m.pdf_file&&base(m.pdf_file)!==fileOf(pdf)))return [];}
  return [...new Set([own,...mds].filter(Boolean))];
 }
 const wrappedPdf=pdfReader;
 pdfReader=function(b,start){
  wrappedPdf(b,start);const files=mdFilesFor(b);if(!files.length||!$('pdfImage'))return;
  const btn=document.createElement('button');btn.className='tool-btn md-back';btn.id='pdfToMd';btn.textContent='本文へ';btn.title='このページの本文（Markdown）へ';
  document.querySelector('.reader-top')?.appendChild(btn);
  btn.onclick=()=>{const n=(Number(b.currentPage)||0)+1;let best=null,missing=0;
   for(const md of files){const t=readLocal(md);if(t==null){missing++;continue;}for(const a of anchorsOf(t)){if(a.pdf<=n&&(!best||a.pdf>best.pdf))best={md,pdf:a.pdf};}}
   if(!best){toast(missing?'本文のMarkdownを先に端末へ保存してください':'このページに対応する本文が見つかりません');return;}
   pending={id:best.md.id,pdf:n};back={md:best.md.id,pdf:b.id};openLocalBook(best.md);};
 };

 return {pdfResolvers,prepare,html,anchorsOf,frontMatter,label,settings,pdfFor,siblings,fileOf,stem,base,dir,local,readLocal,openOther,openPdfPage,openMd,get pending(){return pending;}};
})();
