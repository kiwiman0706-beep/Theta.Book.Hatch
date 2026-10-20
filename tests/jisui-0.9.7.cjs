const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 0.9.7: jisui-1 (.jisui = ZIP of a FullOCR vault). Members hidden from the shelf, entry opens, chapter links,
// 原文 for embedded / sidecar / none, pictures inside the ZIP, digest member, "open with", viewer mode. Mocked bridge.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const run=async(viewer)=>{
  const page=await browser.newPage({viewport:{width:390,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(viewer=>{
   localStorage.clear();window.calls=[];
   const filler=n=>Array.from({length:n},(_,i)=>'段落'+i+'。発作の分類と診断。').join('\n\n');
   const vault=(pdf)=>({
    'jisui.json':JSON.stringify({format:'jisui-1',title:'ねころんで読めるてんかん診療',author:'中里 信和',entry:'00_index.md',pdf,page_anchors:'fullocr-1',digest:'theta-digest-1'}),
    '00_index.md':'---\ntitle: ねころんで読めるてんかん診療\npage_anchors: fullocr-1\npdf_file: ねころん_text.pdf\npage_offset: 8\n---\n# ねころんで読めるてんかん診療\n\n- [[01_第1章#第1章 発作|第1章]]\n',
    '01_第1章.md':'<!-- fullocr:page pdf=9 print="1" -->\n\n# 第1章 発作\n\n![[p0009_fig1.png]]\n\n'+filler(20)+'\n\n<!-- fullocr:page pdf=10 print="2" -->\n\n![図2](attachments/p0010_fig2.png)\n\n'+filler(20)+'\n',
    '_digest.md':'<!-- theta:digest scheme="theta-digest-1" generator="fullocr" pdf="ねころん_text.pdf" -->\n# ねころんで読めるてんかん診療 — ダイジェスト\n\n## 📖 構造化要約\n### 第1章 発作  [[ねころん_text.pdf#page=9|📄p.1]]\n- 発作は焦点性と全般性に分ける\n',
    'attachments/p0009_fig1.png':'PNG1','attachments/p0010_fig2.png':'PNG2'});
   window.zips={'emb.jisui':{...vault({mode:'embedded',name:'ねころん_text.pdf'}),'ねころん_text.pdf':'%PDF'},
    'side.jisui':vault({mode:'sidecar',name:'ねころん_text.pdf',sidecar:'ねころん.pdf'}),'none.jisui':vault({mode:'none'}),'bad.jisui':{'readme.txt':'x'}};
   const member=n=>{const i=n.indexOf('\n');return i<0?null:[n.slice(0,i),n.slice(i+1)];};
   const mk=(id,file,localName,extra)=>({id,title:file.replace(/\.[^.]+$/,''),type:'Jisui',fileExt:'JISUI',localName,offline:true,cover:'c1',size:1,folder:'自炊',...extra});
   localStorage.setItem('dsbooks.catalog',JSON.stringify([mk('E','ねころん.jisui','emb.jisui'),mk('S','ねころん.jisui','side.jisui',{path:'/N/自炊/ねころん.jisui',remote:true}),
    {id:'SP',title:'ねころん',type:'PDF',fileExt:'PDF',path:'/N/自炊/ねころん.pdf',remote:true,localName:'side.pdf',offline:true,cover:'c1',size:1,folder:'自炊'},
    mk('Z','none.jisui','none.jisui'),mk('B','bad.jisui','bad.jisui')]));
   window.DSBooksNative=new Proxy({getAppVersion:()=> '0.9.7-claude',isViewer:()=>viewer,loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',
    hasBook:n=>{const m=member(n);return m?!!zips[m[0]]?.[m[1]]:!!n;},
    readText:n=>{const m=member(n);calls.push(['read',n]);return m?(zips[m[0]]?.[m[1]]??null):null;},
    jisuiEntries:n=>zips[n]?JSON.stringify(Object.keys(zips[n]).map(k=>({name:k,size:zips[n][k].length}))):null,
    jisuiImage:n=>{const m=member(n);return m&&zips[m[0]]?.[m[1]]?'data:image/png;base64,'+btoa(zips[m[0]][m[1]]):null;},
    chooseBooks:()=>calls.push(['choose']),
    renderPdfPage:(n,p,t)=>{calls.push(['pdf',n,p]);setTimeout(()=>window.onPdfPage(t,{ok:true,count:200,page:p,image:'data:image/gif;base64,R0lGODlhAQABAAAAACw='}),5);}},{get:(o,k)=>o[k]||(()=> '')});
  },viewer);
  await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
  return {page,errors};
 };
 const open=(page,id)=>page.evaluate(id=>openLocalBook(books.find(b=>b.id===id)),id);
 const lastPdf=page=>page.evaluate(()=>calls.filter(c=>c[0]==='pdf').pop());

 const {page,errors}=await run(false);
 // Embedded: opens 00_index.md; members hidden from the shelf; the chapter link, pictures and 原文 work.
 await open(page,'E');await page.waitForSelector('#mdPage');assert.match(await page.locator('.reader-top strong').textContent(),/00_index/);
 assert.equal(await page.evaluate(()=>books.filter(b=>b.jisuiOf==='E').length),4,'3 Markdown + embedded PDF');
 assert.equal(await page.evaluate(()=>books.filter(b=>b.jisuiOf).some(b=>visibleInLibrary(b)||inLibrary(b))),false);
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.book-card')].some(c=>decodeURIComponent(c.dataset.id).includes('!'))),false,'members not on the shelf');
 await page.locator('.md-wikilink').click();await page.waitForSelector('#mdOriginal');assert.match(await page.locator('.reader-top strong').textContent(),/01_第1章/);
 assert.deepEqual(await page.locator('#mdPage img.md-figure').evaluateAll(xs=>xs.map(x=>atob(x.src.split(',')[1]))),['PNG1','PNG2'],'bare name found in attachments/, relative path resolved');
 assert.equal(await page.locator('#mdOriginal').textContent(),'原文 p.1');
 await page.locator('#mdOriginal').click();await page.waitForSelector('#pdfImage');await page.waitForTimeout(30);assert.deepEqual(await lastPdf(page),['pdf','emb.jisui\nねころん_text.pdf',8]);
 // PDF → back to the text; reopening the container resumes the last chapter.
 await page.locator('#pdfToMd').click();await page.waitForSelector('#mdPage');assert.match(await page.locator('.reader-top strong').textContent(),/01_第1章/);
 await page.evaluate(()=>closeModal());await open(page,'E');await page.waitForSelector('#mdPage');assert.match(await page.locator('.reader-top strong').textContent(),/01_第1章/,'resume last member');
 assert.equal(await page.evaluate(()=>books.find(b=>b.id==='E').title),'ねころんで読めるてんかん診療','title from manifest');
 // Digest member opens as a digest; its 📄 resolves through the manifest to the embedded PDF.
 await open(page,'E!_digest.md');await page.waitForSelector('#digestPage');await page.locator('.digest-chip[data-pdf]').click();await page.waitForSelector('#pdfImage');await page.waitForTimeout(30);
 assert.deepEqual(await lastPdf(page),['pdf','emb.jisui\nねころん_text.pdf',8]);
 // Sidecar on the NAS: <name>.pdf beside the .jisui (not the logical pdf.name) is used.
 await open(page,'S');await page.waitForSelector('#mdPage');await page.evaluate(()=>openLocalBook(books.find(b=>b.id==='S!01_第1章.md')));await page.waitForSelector('#mdOriginal');
 await page.locator('#mdOriginal').click();await page.waitForSelector('#pdfImage');await page.waitForTimeout(30);assert.deepEqual(await lastPdf(page),['pdf','side.pdf',8]);
 // None: a clear message, no PDF opened.
 await open(page,'Z');await page.waitForSelector('#mdPage');await page.evaluate(()=>openLocalBook(books.find(b=>b.id==='Z!01_第1章.md')));await page.waitForSelector('#mdOriginal');
 const before=(await page.evaluate(()=>calls.filter(c=>c[0]==='pdf').length));await page.locator('#mdOriginal').click();
 assert.match(await page.locator('#toast').textContent(),/原文PDFが入っていません/);assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='pdf').length),before);
 // Not a jisui-1 container.
 await page.evaluate(()=>closeModal());await open(page,'B');assert.match(await page.locator('#toast').textContent(),/jisui\.json/);
 // "Open with" (Android): the imported .jisui opens at once.
 await page.evaluate(()=>{zips['new.jisui']=zips['emb.jisui'];onDataExchange({kind:'books',open:true,books:[{id:'local:n:jisui',bookId:'sha256:n',localName:'new.jisui',title:'ねころん',type:'Jisui',fileExt:'JISUI',size:9,offline:true,folder:'端末から取り込み'}],errors:[]});});
 await page.waitForSelector('#mdPage');assert.equal(await page.evaluate(()=>books.some(b=>b.jisuiOf==='local:n:jisui')),true);
 await page.evaluate(()=>{closeModal();onDataExchange({kind:'books',open:true,books:[],errors:['x.zip：対応形式ではありません']});});await page.waitForTimeout(100);assert.match(await page.locator('#toast').textContent(),/対応形式ではありません/);
 assert.deepEqual(errors,[]);await page.close();

 // Viewer mode: no NAS anywhere; demo books gone; open-file button.
 const v=await run(true);
 assert.equal(await v.page.evaluate(()=>document.documentElement.classList.contains('viewer-mode')),true);
 assert.equal(await v.page.locator('#connectBtn').isHidden(),true);assert.equal(await v.page.locator('#openJisui').isVisible(),true);
 await v.page.locator('#openJisui').click();assert.deepEqual(await v.page.evaluate(()=>calls.filter(c=>c[0]==='choose')),[['choose']]);
 await v.page.locator('#appMenuBtn').click();const menu=await v.page.locator('#appMenu').textContent();
 assert.doesNotMatch(menu,/NAS|Tailscale|Secure SignIn|ダウンロード/);assert.match(menu,/Theta\.Jisui\.Viewer/);assert.match(menu,/ファイルを開く/);await v.page.keyboard.press('Escape');
 assert.equal(await v.page.evaluate(()=>books.some(b=>typeof b.id==='number')),false,'no demo books');
 await open(v.page,'E');await v.page.waitForSelector('#mdPage');await open(v.page,'E!01_第1章.md');await v.page.waitForSelector('#mdOriginal');assert.equal(await v.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(v.errors,[]);
 console.log('PASS jisui: manifest/members hidden, entry + chapter links, pictures in ZIP, 原文 embedded/sidecar/none, PDF→text, resume, digest member, invalid container, open-with, viewer mode (no NAS, open file)');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
