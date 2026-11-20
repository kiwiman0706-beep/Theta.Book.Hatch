const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 1.1.2: FullOCR output shapes found in real-book tests — a table image followed by its OCR text in a folded
// Obsidian callout (`> [!info]- 表のテキスト`), and display math `$$…$$` (LaTeX from FullOCR's math preset).
// Mocked bridge; checks the rendered DOM only (no LaTeX typesetting — the source is shown as a formula block).
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();
  window.texts={'ch.md':[
   '<!-- fullocr:page pdf=11 print="3" -->','',
   '# 表1 CKDの病期','',
   '![[attachments/p11_table.png]]','',
   '> [!info]- 表のテキスト','> | 病期 | GFR |','> | 1 | ≧90 |','> | 2 | 60~89 *注 |','',
   'この表から分かるように、病期は5段階に分けられる。','',
   '$$','2 \\, H _ { 2 } + O _ { 2 } \\longrightarrow 2 \\, H _ { 2 } O','$$','',
   '<!-- fullocr:page pdf=12 print="4" -->','',
   '> [!note] 開いた枠','> 本文です。','',
   '> ふつうの引用','',
   '最後の段落。'].join('\n')};
  localStorage.setItem('dsbooks.catalog',JSON.stringify([{id:'ch',path:'/B/本/01_章.md',title:'01_章',folder:'本',remote:true,type:'Markdown',fileExt:'MD',cover:'c1',size:1,localName:'ch.md',offline:true}]));
  window.DSBooksNative=new Proxy({getAppVersion:()=> '1.1.2',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',
   hasBook:n=>!!n,readText:n=>texts[n]??null},{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 await page.evaluate(()=>openLocalBook(books.find(b=>b.id==='ch')));await page.waitForSelector('#mdPage');
 const md=page.locator('#mdPage');
 // Folded callout: a closed <details> titled by the callout, with the lines inside (no "[!info]" or "> " left over).
 const box=md.locator('details.md-callout').first();
 assert.equal(await md.locator('details.md-callout').count(),2);
 assert.equal(await box.locator('summary').textContent(),'表のテキスト');
 assert.equal(await box.evaluate(d=>d.open),false,'`-` = folded');
 assert.match(await box.locator('.md-callout-body').innerHTML(),/\| 病期 \| GFR \|<br>\| 1 \| ≧90 \|<br>\| 2 \| 60~89 \*注 \|/);
 assert.equal(await md.locator('details.md-callout').nth(1).evaluate(d=>d.open),true,'no fold mark = open');
 const text=await md.textContent();assert.doesNotMatch(text,/\[!info\]|\[!note\]|\$\$|⟦/);
 assert.equal(await md.locator('details p, p details, p .md-math').count(),0,'blocks are not nested in <p>');
 // Display math: one formula block holding the LaTeX verbatim (not italicised / not split by the inline rules).
 assert.equal(await md.locator('.md-math code').textContent(),'2 \\, H _ { 2 } + O _ { 2 } \\longrightarrow 2 \\, H _ { 2 } O');
 // Ordinary quote and paragraphs still render; anchors still work around the new blocks.
 assert.equal(await md.locator('blockquote').count(),1);assert.match(text,/この表から分かるように/);assert.match(text,/最後の段落。/);
 assert.equal(await md.locator('.fo-anchor').count(),2);assert.equal(await page.locator('#mdOriginal').textContent(),'原文 p.3');
 for(const w of [320,390]){await page.setViewportSize({width:w,height:700});
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.md-math,.md-callout')].every(e=>e.getBoundingClientRect().right<=innerWidth+1)),true,'fits '+w);}
 assert.deepEqual(errors,[]);console.log('PASS md callout/math: folded table-text callout as closed <details>, open callout, $$LaTeX$$ block verbatim, quotes/anchors untouched, 320px');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
