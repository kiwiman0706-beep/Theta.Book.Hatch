const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 0.9.5: FullOCR page anchors (fullocr-1). Hidden markers/front matter/comments, printed page label, MD→PDF at the page,
// PDF→MD across chapter files, wikilinks between files. Mocked bridge; the PDF renderer only reports the page asked for.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();window.calls=[];
  const filler=n=>Array.from({length:n},(_,i)=>'本文の段落'+i+'。神経学的診察の基本は……').join('\n\n');
  window.texts={
   'idx.md':'---\ntitle: 神経内科の教科書\npages: 452\npage_anchors: fullocr-1\npdf_file: 神経内科の教科書_text.pdf\npage_offset: 8\ntags: [fullocr]\n---\n# 神経内科の教科書\n\n## 目次\n\n- [[01_第1章 総論#第1章 総論|第1章 総論]]\n- [[02_第2章 各論|第2章]]\n\n<!-- fullocr:page pdf=5 print="iv" -->\n\n%%\n目次（印刷）……\n\n<!-- fullocr:page pdf=6 print="v" -->\n\n第1章……1\n%%\n',
   'ch1.md':'<!-- fullocr:page pdf=9 print="1" -->\n\n# 第1章 総論\n\n'+filler(30)+'\n\n<!-- fullocr:page pdf=10 print="2" -->\n\n意識障害は救急で最も……\n\n'+filler(30)+'\n\n<!-- fullocr:page pdf=11 -->\n\n## 第1節\n\n'+filler(30)+'\n',
   'ch2.md':'<!-- fullocr:page pdf=20 print="12" -->\n\n# 第2章 各論\n\n'+filler(30)+'\n\n<!-- fullocr:page pdf=22 print="14" -->\n\n## 脳血管障害\n\n'+filler(30)+'\n',
   'plain.md':'# ふつうのノート\n\n<!-- 隠しコメント -->\n\n本文です。\n',
   'lone.md':'<!-- fullocr:page pdf=3 -->\n\n# 単独\n\n本文\n'};
  const mk=(id,file,type,localName)=>({id,path:'/B/神経内科/'+file,title:file.replace(/\.[^.]+$/,''),folder:'神経内科',remote:true,type,fileExt:type==='PDF'?'PDF':'MD',cover:'c1',size:1,localName,offline:true});
  localStorage.setItem('dsbooks.catalog',JSON.stringify([mk('idx','00_index.md','Markdown','idx.md'),mk('c1','01_第1章 総論.md','Markdown','ch1.md'),mk('c2','02_第2章 各論.md','Markdown','ch2.md'),
   mk('pdf','神経内科の教科書_text.pdf','PDF','book.pdf'),mk('scan','神経内科の教科書_scan.pdf','PDF','scan.pdf'),
   {...mk('plain','ノート.md','Markdown','plain.md'),path:'/C/ノート.md'},{...mk('lone','単独.md','Markdown','lone.md'),path:'/D/単独.md'}]));
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.9.5-claude',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',
   hasBook:n=>!!n,readText:n=>(calls.push(['read',n]),texts[n]??null),
   renderPdfPage:(n,p,t)=>{calls.push(['pdf',n,p]);setTimeout(()=>window.onPdfPage(t,{ok:true,count:452,page:p,image:'data:image/gif;base64,R0lGODlhAQABAAAAACw='}),5);}},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 const open=id=>page.evaluate(id=>openLocalBook(books.find(b=>b.id===id)),id);
 const label=()=>page.locator('#mdOriginal').textContent();
 const scrollToAnchor=pdf=>page.evaluate(pdf=>{const v=document.querySelector('.reader-viewport'),e=document.querySelector(`.fo-anchor[data-pdf="${pdf}"]`);v.scrollTop+=e.getBoundingClientRect().top-v.getBoundingClientRect().top+2;v.dispatchEvent(new Event('scroll'));},pdf).then(()=>page.waitForTimeout(80));

 // Chapter file: markers are invisible, the outline is untouched, the pill shows the printed page.
 await open('c1');await page.waitForSelector('#mdPage');
 const text=await page.locator('#mdPage').textContent();assert.doesNotMatch(text,/fullocr|<!--|&lt;/);
 assert.equal(await page.locator('#mdPage .fo-anchor').count(),3);assert.deepEqual(await page.locator('#mdPage h1,#mdPage h2').allTextContents(),['第1章 総論','第1節']);
 assert.equal(await label(),'原文 p.1');
 await scrollToAnchor(10);assert.equal(await label(),'原文 p.2','print attribute wins');
 await scrollToAnchor(11);assert.equal(await label(),'原文 p.3','no print: pdf - page_offset (from 00_index.md)');
 // 原文: opens the declared PDF (not the scan) at physical page 11 (0-based 10).
 await page.locator('#mdOriginal').click();await page.waitForSelector('#pdfImage');await page.waitForTimeout(50);
 assert.deepEqual(await page.evaluate(()=>calls.filter(c=>c[0]==='pdf').pop()),['pdf','book.pdf',10]);
 // PDF → Markdown: page 23 lives in chapter 2 (anchor pdf=22).
 await page.evaluate(()=>{const b=books.find(x=>x.id==='pdf');pdfReader(b,22);});await page.waitForTimeout(50);
 assert.equal(await page.locator('#pdfToMd').count(),1);await page.locator('#pdfToMd').click();await page.waitForSelector('#mdPage');await page.waitForTimeout(80);
 assert.match(await page.locator('.reader-top strong').textContent(),/02_第2章/);assert.equal(await label(),'原文 p.14','scrolled to the page-23 position');
 // Index file: front matter and %% hidden TOC are not shown, its markers stay; wikilinks open the chapter at its heading.
 await open('idx');await page.waitForSelector('#mdPage');const idx=await page.locator('#mdPage').textContent();
 assert.doesNotMatch(idx,/page_anchors|---|目次（印刷）|%%|\[\[/);assert.equal(await page.locator('#mdPage .fo-anchor').count(),2);assert.equal(await label(),'原文 p.iv');
 assert.deepEqual(await page.locator('.md-wikilink').allTextContents(),['第1章 総論','第2章']);
 await page.locator('.md-wikilink').nth(1).click();await page.waitForTimeout(80);assert.match(await page.locator('.reader-top strong').textContent(),/02_第2章/);
 // Ordinary Markdown: no pill, plain HTML comments hidden.
 await open('plain');await page.waitForSelector('#mdPage');assert.equal(await page.locator('#mdOriginal').count(),0);assert.doesNotMatch(await page.locator('#mdPage').textContent(),/隠しコメント|&lt;!--/);
 // Markers without a declaration or PDF: PDF-sequence label, and a clear message instead of a wrong file.
 await open('lone');await page.waitForSelector('#mdPage');assert.equal(await label(),'原文 p.3（PDF通し）');
 await page.locator('#mdOriginal').click();assert.match(await page.locator('#toast').textContent(),/PDF.*見つかりません/);
 // A PDF opened from the shelf with no anchored Markdown beside it gets no "本文へ".
 await page.evaluate(()=>{books.find(x=>x.id==='scan').path='/E/x.pdf';pdfReader(books.find(x=>x.id==='scan'),0);});await page.waitForTimeout(30);assert.equal(await page.locator('#pdfToMd').count(),0);
 // Reference regex from the spec agrees with the parser.
 assert.deepEqual(await page.evaluate(()=>DSMdAnchors.anchorsOf('<!-- fullocr:page pdf=23 print="15" -->\n\n<!--fullocr:page pdf=24-->')),[{pdf:23,print:'15'},{pdf:24,print:''}]);
 for(const w of [320,390]){await page.setViewportSize({width:w,height:700});await open('c1');await page.waitForSelector('#mdOriginal');assert.equal(await page.evaluate(()=>{const r=document.getElementById('mdOriginal').getBoundingClientRect();return r.right<=innerWidth+1;}),true,'pill fits '+w);}
 assert.deepEqual(errors,[]);console.log('PASS md anchors: hidden markers/front matter/%%/comments, print & offset labels, MD→PDF page, PDF→MD across files, wikilinks, plain MD untouched, missing PDF message, 320px');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
