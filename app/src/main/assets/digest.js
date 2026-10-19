/* 0.9.6 Theta digest (`theta-digest-1`, docs/THETA_DIGEST.md): AI summary / mind map / Q&A.
   ① A `_digest.md` (FullOCR or ours) opens as a digest view whose items jump to the PDF page / the text heading.
   ② "AI要約" in a FullOCR book (fullocr-1 anchors) asks Gemini, one call per section, with the user's own key.
   Grounding rule of the spec: the page of every item is the page we cut the section at, never one the model says.
   Text leaves the device only after the user presses the button in a dialog that says so (never automatically). */
window.DSDigest=(()=>{
 'use strict';
 const $=id=>document.getElementById(id),A=window.DSMdAnchors,F=DSFeatures;
 const MARK=/<!--\s*theta:digest\s+scheme="([^"]+)"(?:\s+generator="([^"]*)")?(?:\s+pdf="([^"]*)")?\s*-->/;
 const KEY='thetaBookHatch.geminiKey',MODEL='thetaBookHatch.geminiModel',DEFAULT_MODEL='gemini-2.5-flash';
 const esc=s=>escapeHtml(s);
 const store={get:k=>{try{return localStorage.getItem(k)||'';}catch(e){return '';}},set:(k,v)=>{try{v?localStorage.setItem(k,v):localStorage.removeItem(k);}catch(e){}}};

 /* ---------- ① parse ---------- */
 const LINK=/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
 function headingLine(line){
  const sec={heading:'',pdf_page:0,printed_page:'',pdf_file:'',md_target:'',md_heading:'',summary:[],qa:[]};
  for(const m of line.matchAll(LINK)){const [file,frag='']=m[1].split('#');const alias=m[2]||'';
   const page=/^page=(\d+)$/.exec(frag.trim());
   if(page){sec.pdf_page=Number(page[1]);sec.pdf_file=file.trim();const p=/p\.\s*([^\s\]]+)/.exec(alias);sec.printed_page=p?p[1]:'';}
   else{sec.md_target=file.trim();sec.md_heading=frag.trim();}}
  sec.heading=line.replace(/^###\s+/,'').replace(LINK,'').replace(/[\s・·|]+$/,'').trim();
  return sec;
 }
 function mapTree(lines){
  // mermaid mindmap: indentation is the tree; node shapes ((x)) (x) [x] {{x}} are decoration; " ·p.X" is the page note.
  const root={label:'',page:'',children:[]},stack=[{indent:-1,node:root}];
  for(const raw of lines){if(!raw.trim()||/^\s*mindmap\s*$/.test(raw)||/^\s*%%/.test(raw))continue;
   const indent=raw.match(/^\s*/)[0].length;let text=raw.trim().replace(/^[\w-]*(\(\(|\(|\[|\{\{|\)\)|\))/,'').replace(/(\)\)|\)|\]|\}\}|\(\()$/,'').trim();
   let page='';const pm=/\s*·\s*p\.\s*(\S+)$/.exec(text);if(pm){page=pm[1];text=text.slice(0,pm.index).trim();}
   const node={label:text,page,children:[]};while(stack.length>1&&stack[stack.length-1].indent>=indent)stack.pop();
   stack[stack.length-1].node.children.push(node);stack.push({indent,node});}
  return root.children.length===1?root.children[0]:{label:'',page:'',children:root.children};
 }
 function parse(text){
  const m=MARK.exec(text);if(!m)return null;
  const d={scheme:m[1],generator:m[2]||'',pdf:m[3]||'',title:'',summary:[],qa:[],map:null};
  const lines=String(text).split(/\r?\n/);let block='',sec=null,inMap=false,mapLines=[],lastQ=null;
  for(const line of lines){
   if(inMap){if(/^\s*```/.test(line)){inMap=false;d.map=mapTree(mapLines);}else mapLines.push(line);continue;}
   if(!d.title&&/^#\s+/.test(line)){d.title=line.replace(/^#\s+/,'').replace(/\s+[—–-]+\s*ダイジェスト\s*$/,'').trim();continue;}
   if(/^##\s+/.test(line)&&!/^###/.test(line)){block=/構造化要約/.test(line)?'summary':/マインドマップ/.test(line)?'map':/一問一答/.test(line)?'qa':'';sec=null;continue;}
   if(block==='map'&&/^\s*```\s*mermaid/.test(line)){inMap=true;mapLines=[];continue;}
   if((block==='summary'||block==='qa')&&/^###\s+/.test(line)){sec=headingLine(line);d[block].push(sec);lastQ=null;continue;}
   if(!sec)continue;
   const q=/^\s*[-*]\s+\*\*Q\.\*\*\s*(.*?)\s*$/.exec(line),a=/^\s*\*\*A\.\*\*\s*(.*?)\s*$/.exec(line);
   if(block==='qa'&&q){lastQ={q:q[1],a:''};sec.qa.push(lastQ);continue;}
   if(block==='qa'&&a&&lastQ){lastQ.a=a[1];continue;}
   if(block==='qa'&&lastQ&&lastQ.a&&/^\s{2,}\S/.test(line)){lastQ.a+=' '+line.trim();continue;}
   const li=/^\s*[-*]\s+(.+?)\s*$/.exec(line);if(block==='summary'&&li)sec.summary.push(li[1]);
  }
  if(inMap)d.map=mapTree(mapLines);
  return d;
 }

 /* ---------- ① view ---------- */
 const inline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
 function chips(sec){
  let h='';if(sec.pdf_page)h+=`<button class="digest-chip" data-pdf="${sec.pdf_page}" data-file="${esc(sec.pdf_file)}">📄 p.${esc(sec.printed_page||sec.pdf_page)}</button>`;
  if(sec.md_target||sec.md_heading)h+=`<button class="digest-chip" data-md="${esc(sec.md_target)}" data-heading="${esc(sec.md_heading)}" data-page="${sec.pdf_page||0}">§ 本文</button>`;
  return h?'<span class="digest-chips">'+h+'</span>':'';
 }
 function mapHtml(n,depth=0){if(!n)return '';const kids=(n.children||[]).map(c=>mapHtml(c,depth+1)).join('');
  const label=n.label?`<span class="map-node d${Math.min(depth,3)}">${inline(n.label)}${n.page?` <button class="digest-chip small" data-mappage="${esc(n.page)}">p.${esc(n.page)}</button>`:''}</span>`:'';
  return depth===0&&!n.label?`<ul class="digest-map">${kids}</ul>`:(depth===0?`<ul class="digest-map"><li>${label}${kids?'<ul>'+kids+'</ul>':''}</li></ul>`:`<li>${label}${kids?'<ul>'+kids+'</ul>':''}</li>`);}
 function view(b,d,source){
  const tabs=[['summary','📖 要約',d.summary.length],['map','🧠 マップ',!!d.map],['qa','🎴 一問一答',d.qa.length]].filter(t=>t[2]);
  const gen=d.generator==='bookhatch'?'このアプリで生成':d.generator==='fullocr'?'FullOCRで生成':'';
  showReaderModal(`<div class="reader digest-reader"><div class="reader-top"><button class="close">×</button><strong>${esc(d.title||b.title)}</strong><button class="tool-btn" id="digestExport" title="Markdownとして書き出す">⇩</button></div>
   <nav class="digest-tabs" role="tablist">${tabs.map(([k,t],i)=>`<button role="tab" data-tab="${k}" aria-selected="${i===0}">${t}</button>`).join('')}</nav>
   <div class="reader-viewport"><article class="page digest-page" id="digestPage">
    <p class="digest-note">要約文はAI、引用ページは原データに基づきます${gen?'（'+gen+'）':''}。</p>
    <section data-pane="summary">${d.summary.map(s=>`<div class="digest-card"><h3>${inline(s.heading)}</h3>${chips(s)}<ul>${s.summary.map(x=>'<li>'+inline(x)+'</li>').join('')}</ul></div>`).join('')}</section>
    <section data-pane="map" hidden>${mapHtml(d.map)}</section>
    <section data-pane="qa" hidden><div class="feature-actions"><button class="secondary" id="qaRevealAll">答えをすべて表示</button></div>${d.qa.map(s=>`<div class="digest-card"><h3>${inline(s.heading)}</h3>${chips(s)}${s.qa.map(x=>`<div class="qa"><p class="q">Q. ${inline(x.q)}</p><button class="qa-reveal">答えを見る</button><p class="a" hidden>A. ${inline(x.a)}</p></div>`).join('')}</div>`).join('')}</section>
   </article></div></div>`);
  const page=$('digestPage');const show=k=>{document.querySelectorAll('.digest-tabs [data-tab]').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===k)));page.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==k);};
  document.querySelectorAll('.digest-tabs [data-tab]').forEach(t=>t.onclick=()=>show(t.dataset.tab));if(tabs[0])show(tabs[0][0]);
  page.querySelectorAll('.qa-reveal').forEach(btn=>btn.onclick=()=>{btn.hidden=true;btn.nextElementSibling.hidden=false;});
  $('qaRevealAll')&&($('qaRevealAll').onclick=()=>page.querySelectorAll('.qa-reveal').forEach(x=>x.click()));
  $('digestExport').onclick=()=>DSBooksNative.exportText(source,(d.title||b.title||'digest')+'_digest.md');
  const meta=()=>A.settings(b,{});const pdfMeta=file=>({...meta(),pdf_file:file||d.pdf||meta().pdf_file});
  page.addEventListener('click',e=>{const c=e.target.closest('.digest-chip');if(!c)return;
   if(c.dataset.pdf){if(!A.openPdfPage(b,pdfMeta(c.dataset.file),Number(c.dataset.pdf)))toast('原文のPDFが同じフォルダに見つかりません');return;}
   if(c.dataset.md!==undefined){if(!A.openMd(b,c.dataset.md,c.dataset.heading,Number(c.dataset.page)||0))toast('本文のMarkdownが見つかりません（端末に保存してください）');return;}
   if(c.dataset.mappage){const x=c.dataset.mappage,all=[...d.summary,...d.qa];const s=all.find(s=>s.printed_page===x&&s.pdf_page)||all.find(s=>!s.printed_page&&String(s.pdf_page)===x);
    const m=meta(),off=Number(m.page_offset),n=s?s.pdf_page:(/^\d+$/.test(x)?Number(x)+(Number.isFinite(off)&&m.page_offset!==undefined?off:0):0);
    if(!n||!A.openPdfPage(b,pdfMeta(s?.pdf_file),n))toast('このページへ移動できません');}});
 }

 /* ---------- ② generate with Gemini ---------- */
 const natural=(a,b)=>a.localeCompare(b,'ja',{numeric:true});
 function sourceFiles(b){
  const all=[b,...A.siblings(b).filter(x=>x.type==='Markdown')].filter(x=>!/^00_index\.md$/i.test(A.fileOf(x))&&!/_digest\.md$/i.test(A.fileOf(x))&&!x.digestDir);
  const files=[],missing=[];for(const f of all){const t=A.readLocal(f);if(t==null){missing.push(f);continue;}if(MARK.test(t)||!A.anchorsOf(t).length)continue;files.push({book:f,text:t});}
  files.sort((x,y)=>natural(A.fileOf(x.book),A.fileOf(y.book)));return {files,missing};
 }
 const clean=s=>s.replace(/<!--[\s\S]*?-->/g,'').replace(/%%[\s\S]*?%%/g,'').replace(/\n{3,}/g,'\n\n').trim();
 // Cut the book into sections whose first physical page we know: headings (#/##); a section longer than
 // 2×window pages, or a book without headings, is cut into windows of `windowPages` pages.
 function units(files,windowPages=8){
  const raw=[];
  for(const {book,text} of files){
   const file=A.stem(A.fileOf(book));let cur=null,page=0,print='';
   const start=(heading,real)=>{cur={heading,real,file,lines:[]};raw.push(cur);};
   for(const line of A.frontMatter(text).body.split(/\r?\n/)){
    const m=/<!--\s*fullocr:page\s+pdf=(\d+)(?:\s+print="([^"]*)")?\s*-->/.exec(line);
    if(m){page=Number(m[1]);print=m[2]||'';continue;}
    const h=/^(#{1,2})\s+(.+?)\s*$/.exec(line);if(h){start(h[2].trim(),true);}else if(!cur)start(file,false);
    if(page)cur.lines.push({page,print,line});}
  }
  const out=[];
  for(const u of raw){
   const pages=[...new Set(u.lines.map(l=>l.page))];if(!pages.length)continue;
   const groups=pages.length>windowPages*2?Array.from({length:Math.ceil(pages.length/windowPages)},(_,i)=>pages.slice(i*windowPages,(i+1)*windowPages)):[pages];
   groups.forEach((g,i)=>{const lines=u.lines.filter(l=>g.includes(l.page)),text=clean(lines.map(l=>l.line).join('\n'));if(text.replace(/^#.*$/gm,'').trim().length<40)return;
    out.push({heading:groups.length>1?u.heading+'（'+(i+1)+'/'+groups.length+'）':u.heading,mdHeading:u.real?u.heading:'',file:u.file,page_start:lines[0].page,print:lines[0].print,text});});
  }
  return out;
 }
 const clip=t=>t.length<=6000?t:t.slice(0,4000)+'\n…（中略）…\n'+t.slice(-2000);
 async function callGemini(key,model,heading,text,kinds,signal){
  const props={};if(kinds.summary)props.summary={type:'array',items:{type:'string'}};
  if(kinds.qa)props.qa={type:'array',items:{type:'object',properties:{q:{type:'string'},a:{type:'string'}},required:['q','a']}};
  if(kinds.map)props.map={type:'object',properties:{label:{type:'string'},children:{type:'array',items:{type:'string'}}}};
  const want=[kinds.summary&&'要点の箇条書き（summary）',kinds.qa&&'一問一答（qa）',kinds.map&&'マインドマップの主題と子概念（map）'].filter(Boolean).join('、');
  const body={systemInstruction:{parts:[{text:'あなたは専門書の編集者です。与えられた節の本文だけを根拠に、正確で簡潔な日本語の要約素材を作ります。本文に無い情報は足さない。出力は指定スキーマのJSONのみ。'}]},
   contents:[{role:'user',parts:[{text:`次の節『${heading}』の本文を読み、${want}を作ってください。\n\n=== 本文 ===\n${text}\n=== ここまで ===`}]}],
   generationConfig:{temperature:0.2,responseMimeType:'application/json',responseSchema:{type:'object',properties:props}}};
  for(let attempt=0;;attempt++){
   const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal});
   if(res.ok){const data=await res.json();const raw=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';const m=raw.match(/\{[\s\S]*\}/);try{return m?JSON.parse(m[0]):{};}catch(e){return {};}}
   if((res.status===429||res.status>=500)&&attempt<2){await new Promise(r=>setTimeout(r,attempt?15000:5000));continue;}
   const err=new Error(res.status===400||res.status===401||res.status===403?'APIキーまたはモデル名が受け付けられませんでした（'+res.status+'）':res.status===429?'利用上限に達しました（429）。時間をおいて再試行してください':'Gemini APIエラー（'+res.status+'）');err.fatal=res.status!==500;throw err;}
 }
 const node=s=>String(s||'').replace(/[()[\]{}]/g,c=>({'(':'（',')':'）','[':'［',']':'］','{':'｛','}':'｝'}[c])).replace(/\s+/g,' ').trim();
 function assemble(title,pdfName,meta,results){
  const label=u=>A.label({pdf:u.page_start,print:u.print||''},meta).replace(/^p\./,'').replace(/（PDF通し）$/,'');
  const links=(u,withMd)=>`${pdfName?` [[${pdfName}#page=${u.page_start}|📄p.${label(u)}]]`:''}${withMd&&u.mdHeading?` ・[[${u.file}#${u.mdHeading}|§${u.mdHeading}]]`:''}`;
  let md=`<!-- theta:digest scheme="theta-digest-1" generator="bookhatch" pdf="${(pdfName||'').replace(/"/g,'')}" -->\n# ${title} — ダイジェスト\n> Theta.Book.Hatch（DSBooks）が Gemini で生成。要約文はAI、引用ページは原データに基づきます。\n`;
  const sum=results.filter(r=>r.out.summary?.length),qa=results.filter(r=>r.out.qa?.length),map=results.filter(r=>r.out.map?.label);
  if(sum.length)md+='\n## 📖 構造化要約\n'+sum.map(r=>`### ${r.u.heading} ${links(r.u,true)}\n`+r.out.summary.map(x=>'- '+String(x).replace(/\n+/g,' ')).join('\n')).join('\n\n')+'\n';
  if(map.length)md+='\n## 🧠 マインドマップ\n```mermaid\nmindmap\n  root(('+node(title)+'))\n'+map.map(r=>`    ${node(r.out.map.label)} ·p.${label(r.u)}\n`+(r.out.map.children||[]).map(c=>'      '+node(c)).join('\n')).join('\n')+'\n```\n';
  if(qa.length)md+='\n## 🎴 一問一答\n'+qa.map(r=>`### ${r.u.heading} ${links(r.u,false)}\n`+r.out.qa.map(x=>`- **Q.** ${String(x.q).replace(/\n+/g,' ')}  \n  **A.** ${String(x.a).replace(/\n+/g,' ')}`).join('\n')).join('\n\n')+'\n';
  return md;
 }
 function saveDigest(from,title,md){
  let saved=null;try{saved=JSON.parse(DSBooksNative.saveLocalText?.('digest',md)||'null');}catch(e){}
  if(!saved?.localName){toast('ダイジェストを保存できませんでした');return null;}
  let book=books.find(x=>x.bookId===saved.bookId);
  if(!book){book={id:'local:'+saved.bookId.replace(/^sha256:/,'')+':md',bookId:saved.bookId,title:title+' — ダイジェスト',author:'',type:'Markdown',fileExt:'MD',cover:'c5',progress:0,genre:'ダイジェスト',label:'AIダイジェスト',folder:from.folder||'端末から取り込み'};books.push(book);}
  Object.assign(book,{localName:saved.localName,size:saved.size,offline:true,digestDir:A.dir(from),digestOf:from.id,modifiedAt:Date.now()});saveCatalog();render();return book;
 }
 function existing(b){const d=A.dir(b);return books.filter(x=>x.type==='Markdown'&&((x.digestDir&&x.digestDir===d)||(d&&A.dir(x)===d&&/_digest\.md$/i.test(A.fileOf(x)))));}
 function panel(b){
  const key=store.get(KEY),{files,missing}=sourceFiles(b),list=units(files),chars=list.reduce((n,u)=>n+clip(u.text).length,0),meta=A.settings(b,{}),pdf=A.pdfFor(b,meta);
  const have=existing(b);
  F.panel('AI要約（ダイジェスト）',`${have.length?'<h3>作成済み</h3><div class="feature-actions">'+have.map(x=>`<button class="secondary" data-open-digest="${esc(x.id)}">${esc(x.title)}</button>`).join('')+'</div>':''}
   <h3>Geminiで作成</h3>
   <p class="feature-hint">章ファイル ${files.length} 件・${list.length} 節（約${chars.toLocaleString()}字、入力 約${Math.round(chars/1.8).toLocaleString()}トークン）。節ごとに1回、計${list.length}回 Gemini API を呼びます。${missing.length?`<br>端末に未保存の章 ${missing.length} 件は含まれません。`:''}${pdf?'':'<br>原文PDFが見つからないため、ページへのリンクは付きません。'}</p>
   <label><input type="checkbox" id="dgSummary" checked> 構造化要約</label><label><input type="checkbox" id="dgMap" checked> マインドマップ</label><label><input type="checkbox" id="dgQa" checked> 一問一答</label>
   ${key?'<p class="feature-hint">APIキー：設定済み（設定 →「AI要約（Gemini）」で変更）</p>':'<label>Gemini APIキー<input id="dgKey" type="password" autocomplete="off" placeholder="AIza…"></label>'}
   <p class="feature-hint digest-warn">押すと、上記の本文（節ごと）がGoogleのGemini APIへ送信されます。料金はあなたのAPIキーに対して発生します。自動では送信しません。</p>
   <div class="feature-actions"><button class="primary" id="dgStart" ${list.length?'':'disabled'}>本文を送信して作成</button><button class="secondary" id="dgCancel" hidden>中止</button></div><p class="feature-hint" id="dgStatus" aria-live="polite"></p>`);
  document.querySelectorAll('[data-open-digest]').forEach(x=>x.onclick=()=>{const d=books.find(y=>String(y.id)===x.dataset.openDigest);if(d)A.openOther(d);});
  let ctrl=null;$('dgCancel').onclick=()=>ctrl?.abort();
  $('dgStart').onclick=async()=>{
   const k=store.get(KEY)||($('dgKey')?.value||'').trim();if(!k){toast('Gemini APIキーを入力してください');return;}if(!store.get(KEY))store.set(KEY,k);
   const kinds={summary:$('dgSummary').checked,map:$('dgMap').checked,qa:$('dgQa').checked};if(!kinds.summary&&!kinds.map&&!kinds.qa){toast('作るものを1つ以上選んでください');return;}
   const model=store.get(MODEL)||DEFAULT_MODEL,st=$('dgStatus');ctrl=new AbortController();$('dgStart').disabled=true;$('dgCancel').hidden=false;const results=[];let failed=0;
   try{for(let i=0;i<list.length;i++){const u=list[i];st.textContent=`${i+1} / ${list.length} 節：${u.heading}`;
     try{results.push({u,out:await callGemini(k,model,u.heading,clip(u.text),kinds,ctrl.signal)});}catch(e){if(e.name==='AbortError')throw e;if(e.fatal)throw e;failed++;results.push({u,out:{}});}}
    const title=meta.title||b.folder||A.stem(A.fileOf(b)),md=assemble(title,pdf?A.fileOf(pdf):'',meta,results);
    const saved=saveDigest(b,title,md);if(saved){st.textContent='作成しました'+(failed?`（${failed}節は失敗のため空）`:'');F.closePanel?.();A.openOther(saved);}
   }catch(e){st.textContent=e.name==='AbortError'?'中止しました（送信済みの節の結果は保存していません）':e.message;}
   finally{if($('dgStart')){$('dgStart').disabled=false;$('dgCancel').hidden=true;}ctrl=null;}};
 }

 /* ---------- hooks ---------- */
 const md=markdownReader;
 markdownReader=function(b){
  let text=null;try{text=b.localName?DSBooksNative.readText(b.localName):null;}catch(e){}
  const d=text&&MARK.test(text.slice(0,4096))?parse(text):null;
  if(d){b.progress=b.progress||1;saveCatalog();view(b,d,text);return;}
  md(b);
  if(document.querySelector('#mdPage .fo-anchor')){const btn=document.createElement('button');btn.className='tool-btn md-original';btn.id='mdDigest';btn.textContent='✦ AI要約';btn.title='AI要約・マインドマップ・一問一答';btn.onclick=()=>panel(b);document.querySelector('.reader-top')?.appendChild(btn);}
 };
 const settings=F.settings;F.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet');if(!sheet)return;const box=document.createElement('section');
  box.innerHTML=`<h3>AI要約（Gemini）</h3><p class="feature-hint">FullOCRの本で「✦ AI要約」を押した時だけ、本文（節ごと）をあなたのAPIキーでGoogleのGemini APIへ送ります。キーはこの端末だけに保存し、同期・診断・書き出しには含めません。</p>
   <label>APIキー<input id="geminiKey" type="password" autocomplete="off" placeholder="${store.get(KEY)?'設定済み（変更する時だけ入力）':'AIza…'}"></label><label>モデル<input id="geminiModel" value="${esc(store.get(MODEL)||DEFAULT_MODEL)}"></label>
   <div class="feature-actions"><button class="primary" id="geminiSave">保存</button><button class="secondary" id="geminiClear">キーを削除</button></div>`;
  sheet.appendChild(box);$('geminiSave').onclick=()=>{const k=$('geminiKey').value.trim();if(k)store.set(KEY,k);store.set(MODEL,$('geminiModel').value.trim()===DEFAULT_MODEL?'':$('geminiModel').value.trim());$('geminiKey').value='';toast('保存しました');};
  $('geminiClear').onclick=()=>{store.set(KEY,'');toast('APIキーを削除しました');};};
 $('settingsBtn').onclick=F.settings;$('mobileSettings').onclick=F.settings;

 return {parse,units,assemble,MARK};
})();
