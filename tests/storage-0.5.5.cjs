const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();window.cardId='vol-0123456789abcdef01234567';window.cardPresent=true;window.selected='internal';window.calls=[];
  localStorage.setItem('dsbooks.catalog',JSON.stringify([
   {id:'internal',path:'/Books/One.m4b',title:'本体の音声本',type:'Audio',fileExt:'M4B',localName:'old.m4b',remote:true,folder:'Audio',cover:'c1',audioPosition:45000,progress:30,size:100},
   {id:'sd',path:'/Books/Two.m4b',title:'SDの音声本',type:'Audio',fileExt:'M4B',localName:cardId+'--card.m4b',remote:true,folder:'Audio',cover:'c2',audioPosition:12000,progress:20,size:100}
  ]));
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.5.5-preview',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',loadCredentials:()=> 'null',getAudioChapters:()=> '[]',
   getStorageInfo:()=>{const locations=[{id:'internal',label:'本体（アプリ内・標準）',available:true,usable:999999999},{id:cardId,label:'SDカード（外部・専用フォルダ）',removable:true,available:cardPresent,usable:cardPresent?888888888:0}];return JSON.stringify({selected,locations,...locations.find(x=>x.id===selected)});},
   setDownloadStorage:id=>{calls.push(['select',id]);if(id===cardId&&!cardPresent)return 'SDカードを利用できません';selected=id;return '';},
   hasBook:file=>file==='old.m4b'||(file===cardId+'--card.m4b'&&cardPresent),
   playAudio:(file,token,pos)=>calls.push(['play',file,pos]),shareNamedBook:(...a)=>calls.push(['share',...a]),downloadBook:(...a)=>calls.push(['download',...a])
  },{get:(o,k)=>o[k]||(()=> '')});
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForTimeout(100);
 await page.evaluate(()=>DSFeatures.settings());assert.equal(await page.locator('#downloadStorageSelect option').count(),2);
 const card=await page.evaluate(()=>cardId);await page.locator('#downloadStorageSelect').selectOption(card);await page.locator('#applyDownloadStorage').click();assert.equal(await page.evaluate(()=>selected),card);assert.match(await page.locator('#storageCurrent').textContent(),/SDカード/);
 await page.evaluate(()=>{closeModal();DSFeatures.settings()});assert.equal(await page.locator('#downloadStorageSelect').inputValue(),card);
 // Removed cards cannot be saved to; original location and progress survive startup/recheck/open failures.
 await page.evaluate(()=>cardPresent=false);await page.locator('#refreshDownloadStorage').click();assert.equal(await page.locator('#applyDownloadStorage').isDisabled(),true);
 await page.evaluate(()=>{closeModal();loadCachedCatalog();openLocalBook(books.find(b=>b.id==='sd'));});
 assert.deepEqual(await page.evaluate(()=>{const b=books.find(b=>b.id==='sd');return[b.localName,b.audioPosition,b.progress,b.offline]}),[card+'--card.m4b',12000,20,false]);
 await page.evaluate(()=>{dsmConn={base:'http://nas.test',sid:'test',apis:{}};startBookDownload(books.find(b=>b.id==='sd'),false)});assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='download').length),0);
 // Changing future storage does not change where previously stored books open.
 await page.evaluate(()=>openLocalBook(books.find(b=>b.id==='internal')));assert.deepEqual(await page.evaluate(()=>calls.find(x=>x[0]==='play')),['play','old.m4b',45000]);
 await page.evaluate(()=>{closeModal();cardPresent=true;DSFeatures.settings()});await page.locator('#refreshDownloadStorage').click();assert.equal(await page.evaluate(()=>books.find(b=>b.id==='sd').offline),true);
 await page.evaluate(()=>{closeModal();openLocalBook(books.find(b=>b.id==='sd'))});assert.deepEqual(await page.evaluate(()=>calls.filter(x=>x[0]==='play').at(-1)),['play',card+'--card.m4b',12000]);
 await page.locator('#audioShare').click();assert.equal(await page.evaluate(()=>calls.find(x=>x[0]==='share')[1]),card+'--card.m4b');
 await page.evaluate(()=>{closeModal();DSFeatures.settings()});await page.locator('#downloadStorageSelect').selectOption('internal');await page.locator('#applyDownloadStorage').click();assert.equal(await page.evaluate(()=>selected),'internal');
 await page.locator('#downloadStorageSettings').scrollIntoViewIfNeeded();await page.screenshot({path:'tests/storage-0.5.5.png'});
 assert.deepEqual(errors,[]);console.log('PASS: storage settings/persistence, no SD fallback, old internal files, card removal/reinsert, progress/catalog retention, SD playback and share token');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
