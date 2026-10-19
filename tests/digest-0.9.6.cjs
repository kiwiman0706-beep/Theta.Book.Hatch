const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 0.9.6: theta-digest-1. FullOCR _digest.md view (summary/map/Q&A, PDF page + heading jumps) and generation with a
// mocked Gemini API (one call per section, pages from our anchors, not from the model). Mocked bridge and fetch.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('dsbooks.settingsOpen','all');window.calls=[];window.gemini=[];
  const filler=(w,n)=>Array.from({length:n},(_,i)=>w+'に関する本文の段落'+i+'。診察と評価の手順を述べる。').join('\n\n');
  const fence='```';
  window.texts={
   'idx.md':'---\ntitle: 神経内科の教科書\npage_anchors: fullocr-1\npdf_file: 神経内科の教科書_text.pdf\npage_offset: 8\n---\n# 神経内科の教科書\n',
   'ch1.md':'<!-- fullocr:page pdf=9 print="1" -->\n\n# 第1章 意識障害\n\n'+filler('意識障害',12)+'\n\n<!-- fullocr:page pdf=10 print="2" -->\n\n'+filler('GCS',12)+'\n',
   'ch2.md':'<!-- fullocr:page pdf=20 print="12" -->\n\n# 第2章 各論\n\n'+filler('総論',6)+'\n\n<!-- fullocr:page pdf=22 print="14" -->\n\n## 脳血管障害\n\n'+filler('脳卒中',10)+'\n',
   'dg.md':'<!-- theta:digest scheme="theta-digest-1" generator="fullocr" pdf="神経内科の教科書_text.pdf" -->\n# 神経内科の教科書 — ダイジェスト\n> FullOCR が生成。\n\n## 📖 構造化要約\n### 第1章 意識障害  [[神経内科の教科書_text.pdf#page=9|📄p.1]] ・[[神経内科の教科書#第1章 意識障害|§第1章 意識障害]]\n- 意識障害の初期対応はABCと血糖チェックが最優先\n- GCSは開眼・言語・運動の3軸で評価する\n\n## 🧠 マインドマップ\n'+fence+'mermaid\nmindmap\n  root((神経内科の教科書))\n    意識障害 ·p.1\n      ABC+血糖\n      GCS評価\n    脳卒中 ·p.3\n      t-PA適応\n'+fence+'\n\n## 🎴 一問一答\n### 第1章 意識障害  [[神経内科の教科書_text.pdf#page=9|📄p.1]]\n- **Q.** 意識障害で最初に評価するものは？  \n  **A.** ABC と血糖\n'};
  const mk=(id,file,type,localName)=>({id,path:'/B/神経内科/'+file,title:file.replace(/\.[^.]+$/,''),folder:'神経内科',remote:true,type,fileExt:type==='PDF'?'PDF':'MD',cover:'c1',size:1,localName,offline:true});
  localStorage.setItem('dsbooks.catalog',JSON.stringify([mk('idx','00_index.md','Markdown','idx.md'),mk('c1','01_第1章 意識障害.md','Markdown','ch1.md'),mk('c2','02_第2章 各論.md','Markdown','ch2.md'),
   mk('dg','神経内科の教科書_digest.md','Markdown','dg.md'),mk('pdf','神経内科の教科書_text.pdf','PDF','book.pdf')]));
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.9.6-claude',loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',
   hasBook:n=>!!n,readText:n=>texts[n]??null,exportText:(t,n)=>calls.push(['export',n]),
   saveLocalText:(prefix,t)=>{const n=prefix+'-'+t.length+'.md';texts[n]=t;calls.push(['save',n]);return JSON.stringify({localName:n,bookId:'sha256:'+t.length,size:t.length});},
   renderPdfPage:(n,p,t)=>{calls.push(['pdf',n,p]);setTimeout(()=>window.onPdfPage(t,{ok:true,count:452,page:p,image:'data:image/gif;base64,R0lGODlhAQABAAAAACw='}),5);}},{get:(o,k)=>o[k]||(()=> '')});
  window.geminiStatus=200;
  window.fetch=async(url,opt)=>{if(!String(url).includes('generativelanguage.googleapis.com'))throw new Error('unexpected '+url);const body=JSON.parse(opt.body);gemini.push({url:String(url),key:opt.headers['x-goog-api-key'],body});
   if(geminiStatus!==200)return {ok:false,status:geminiStatus,json:async()=>({})};
   const h=/節『(.+?)』/.exec(body.contents[0].parts[0].text)[1];
   // The model "claims" page 999; the digest must ignore it and use our anchor pages.
   const out={summary:[h+'の要点（p.999参照）'],qa:[{q:h+'で大事なことは？',a:'本文のとおり'}],map:{label:h,children:['子A','子B (補足)']}};
   return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'```json\n'+JSON.stringify(out)+'\n```'}]}}]})};};
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 const open=id=>page.evaluate(id=>openLocalBook(books.find(b=>b.id===id)),id);
 const lastPdf=()=>page.evaluate(()=>calls.filter(c=>c[0]==='pdf').pop());

 // ① FullOCR digest: parsed model.
 const model=await page.evaluate(()=>DSDigest.parse(texts['dg.md']));
 assert.equal(model.generator,'fullocr');assert.equal(model.title,'神経内科の教科書');assert.equal(model.summary[0].heading,'第1章 意識障害');
 assert.deepEqual([model.summary[0].pdf_page,model.summary[0].printed_page,model.summary[0].md_target,model.summary[0].md_heading],[9,'1','神経内科の教科書','第1章 意識障害']);
 assert.deepEqual(model.qa[0].qa,[{q:'意識障害で最初に評価するものは？',a:'ABC と血糖'}]);
 assert.deepEqual(model.map.children.map(c=>[c.label,c.page,c.children.length]),[['意識障害','1',2],['脳卒中','3',1]]);
 // View: three tabs; 📄 opens the PDF at physical page 9.
 await open('dg');await page.waitForSelector('#digestPage');
 assert.deepEqual(await page.locator('.digest-tabs [data-tab]').allTextContents(),['📖 要約','🧠 マップ','🎴 一問一答']);
 assert.equal(await page.locator('[data-pane=summary] li').count(),2);
 await page.locator('[data-pane=summary] .digest-chip[data-pdf]').click();await page.waitForSelector('#pdfImage');await page.waitForTimeout(30);assert.deepEqual(await lastPdf(),['pdf','book.pdf',8]);
 // Map: p.1 maps to the section's physical page; p.3 has no section → printed 3 + offset 8 = physical 11.
 await open('dg');await page.waitForSelector('#digestPage');await page.locator('[data-tab=map]').click();
 assert.match(await page.locator('[data-pane=map]').textContent(),/意識障害.*ABC\+血糖.*脳卒中.*t-PA適応/s);
 await page.locator('[data-mappage="3"]').click();await page.waitForSelector('#pdfImage');await page.waitForTimeout(30);assert.deepEqual(await lastPdf(),['pdf','book.pdf',10]);
 // Q&A: answer hidden until asked. § opens the chapter holding that heading.
 await open('dg');await page.waitForSelector('#digestPage');await page.locator('[data-tab=qa]').click();
 assert.equal(await page.locator('.qa .a').isHidden(),true);await page.locator('.qa-reveal').click();assert.equal(await page.locator('.qa .a').isVisible(),true);
 await page.locator('[data-tab=summary]').click();await page.locator('.digest-chip[data-md]').click();await page.waitForSelector('#mdPage');
 assert.match(await page.locator('.reader-top strong').textContent(),/01_第1章/);

 // ② Generation: button in an anchored book; nothing is sent before the explicit button; key not in synced storage.
 await page.locator('#mdDigest').click();assert.match(await page.locator('.reader-panel').textContent(),/2 件・3 節/);
 assert.match(await page.locator('.reader-panel').textContent(),/Gemini APIへ送信されます/);assert.equal(await page.evaluate(()=>gemini.length),0);
 await page.locator('#dgStart').click();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>gemini.length),0,'no key: nothing sent');
 await page.locator('#dgKey').fill('AIza-test-key');await page.locator('#dgStart').click();await page.waitForSelector('#digestPage',{timeout:5000});
 const sent=await page.evaluate(()=>gemini);assert.equal(sent.length,3,'one call per section');assert(sent.every(g=>g.key==='AIza-test-key'&&/gemini-2\.5-flash:generateContent$/.test(g.url)));
 assert.deepEqual(sent.map(g=>/節『(.+?)』/.exec(g.body.contents[0].parts[0].text)[1]),['第1章 意識障害','第2章 各論','脳血管障害']);
 assert(sent.every(g=>!/fullocr:page|<!--/.test(g.body.contents[0].parts[0].text)),'markers not sent');assert.equal(sent[0].body.generationConfig.responseMimeType,'application/json');
 const saved=await page.evaluate(()=>texts[calls.filter(c=>c[0]==='save').pop()[1]]);
 assert.match(saved,/^<!-- theta:digest scheme="theta-digest-1" generator="bookhatch" pdf="神経内科の教科書_text\.pdf" -->/);
 assert.match(saved,/### 脳血管障害\s+\[\[神経内科の教科書_text\.pdf#page=22\|📄p\.14\]\] ・\[\[02_第2章 各論#脳血管障害\|§脳血管障害\]\]/,'page from our anchor');
 assert.doesNotMatch(saved,/#page=999/);assert.match(saved,/子B （補足）/,'mermaid-safe node text');
 const re=await page.evaluate(t=>DSDigest.parse(t),saved);assert.equal(re.summary.length,3);assert.equal(re.qa.length,3);assert.equal(re.map.children.length,3);assert.equal(re.summary[2].pdf_page,22);
 assert.equal(await page.locator('.digest-note').textContent().then(t=>/このアプリで生成/.test(t)),true);
 const stored=await page.evaluate(()=>({k:localStorage.getItem('thetaBookHatch.geminiKey'),synced:Object.keys(localStorage).filter(k=>k.startsWith('dsbooks.')&&localStorage.getItem(k).includes('AIza-test-key'))}));
 assert.equal(stored.k,'AIza-test-key');assert.deepEqual(stored.synced,[],'key must not be in dsbooks.* (synced/mirrored) storage');
 const book=await page.evaluate(()=>books.find(b=>b.digestOf==='c1'));assert.equal(book.folder,'神経内科');assert.equal(book.digestDir,'/B/神経内科');
 // The new digest's links work from its own folder (digestDir), and it is listed next time.
 await page.locator('[data-pane=summary] .digest-chip[data-pdf]').nth(2).click();await page.waitForSelector('#pdfImage');await page.waitForTimeout(30);assert.deepEqual(await lastPdf(),['pdf','book.pdf',21]);
 await open('c2');await page.waitForSelector('#mdDigest');await page.locator('#mdDigest').click();assert.equal(await page.locator('[data-open-digest]').count(),2,'FullOCR digest + ours');
 // A rejected key stops at once with a clear message.
 await page.evaluate(()=>{localStorage.setItem('thetaBookHatch.geminiKey','bad');geminiStatus=403;gemini.length=0;});await page.locator('#dgStart').click();await page.waitForTimeout(150);
 assert.match(await page.locator('#dgStatus').textContent(),/APIキー/);assert.equal(await page.evaluate(()=>gemini.length),1);
 // Settings: key replace / delete.
 await page.evaluate(()=>{closeModal();DSFeatures.settings();});await page.locator('#geminiKey').fill('AIza-new');await page.locator('#geminiSave').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('thetaBookHatch.geminiKey')),'AIza-new');await page.locator('#geminiClear').click();assert.equal(await page.evaluate(()=>localStorage.getItem('thetaBookHatch.geminiKey')),null);
 for(const w of [320,390]){await page.setViewportSize({width:w,height:700});await page.evaluate(()=>closeModal());await open('dg');await page.waitForSelector('#digestPage');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.digest-tabs').getBoundingClientRect().right<=innerWidth+1),true,'fits '+w);}
 assert.deepEqual(errors,[]);console.log('PASS digest: parse FullOCR digest, tabs/summary/map/Q&A, PDF page + heading jumps, map page via offset, Gemini generation (consent, key, per-section calls, our pages not the model\'s, round-trip parse), key kept out of synced storage, 403 stop, settings, 320px');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
