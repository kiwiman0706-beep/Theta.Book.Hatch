const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 0.9.0 layout: moved controls keep ids/handlers; sheet, settings groups and tiles. Mocked bridge only.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.nativeCalls=[];
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.9.0-claude',hasBook:()=>true,loadCredentials:()=> 'null',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}'},{get:(o,k)=>o[k]||((...a)=>{window.nativeCalls.push(String(k));return '';})});
  if(localStorage.getItem('dsbooks.catalog'))return;
  const xs=Array.from({length:30},(_,i)=>({id:'/B/'+(i%2?'小説':'音声')+'/本'+i,path:'/B/'+(i%2?'小説':'音声')+'/本'+i+'.epub',title:'本 '+i,folder:i%2?'小説':'音声',remote:true,type:'ePub',fileExt:'EPUB',cover:'c1',size:1000,progress:i===3?30:0,tags:i===5?['SF']:[],offline:i===1,localName:i===1?'a.epub':null}));
  localStorage.setItem('dsbooks.catalog',JSON.stringify(xs));
 });
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 // Library: chips + view + one sort/filter button; old rows are gone from view.
 assert.equal(await page.locator('.lib-chips .filter').count(),7);
 assert.equal(await page.locator('.lib-chips').evaluate(e=>getComputedStyle(e).flexWrap),'nowrap');
 assert.equal(await page.locator('.list-display-tools').isHidden(),true);
 assert.equal(await page.locator('#allFolders').isHidden(),true);
 assert.equal(await page.locator('#libraryControls').isHidden(),true);
 assert.match(await page.locator('#libraryControlsOpen').textContent(),/追加・更新日/);
 for(const id of ['sort','sortDirection','pinReading','folderFilter','readingFilter','tagFilter','coverDensity'])assert.equal(await page.locator('#libraryControls #'+id).count(),1,id+' moved into sheet');
 await page.locator('#libraryControlsOpen').click();assert.equal(await page.locator('#libraryControls').isVisible(),true);
 await page.locator('#sort').selectOption('title');await page.locator('#readingFilter').selectOption('reading');
 assert.match(await page.locator('#libraryControlsOpen').textContent(),/タイトル ↑/);assert.match(await page.locator('#libraryControlsOpen').textContent(),/絞り込み 1/);
 // Back closes only the sheet; the filter stays.
 assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);assert.equal(await page.locator('#libraryControls').isHidden(),true);assert.equal(await page.locator('#readingFilter').inputValue(),'reading');
 assert.equal(await page.locator('#resultCount').textContent(),'1冊');
 await page.locator('#libraryControlsOpen').click();await page.locator('#tagFilter').fill('SF');await page.locator('#libraryControlsReset').click();
 assert.equal(await page.locator('#readingFilter').inputValue(),'all');assert.equal(await page.locator('#tagFilter').inputValue(),'');assert.equal(await page.locator('#libraryControlsOpen .lib-filter-count').isHidden(),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#libraryControls').isHidden(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('dsbooks.sort')),'title');
 for(const v of ['list','flow','grid']){await page.locator(`[data-library-view="${v}"]`).click();assert.equal(await page.locator(`[data-library-view="${v}"]`).getAttribute('aria-pressed'),'true');}
 for(const width of [320,360,390,800,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow at '+width);}
 await page.setViewportSize({width:390,height:844});
 // Book detail: primary action card and labelled tiles, favourite star shown once.
 await page.locator('.book-card').first().click();await page.waitForTimeout(50);
 assert.equal(await page.locator('#modal .asset-card .asset-main').count(),1);
 assert.equal(await page.locator('#workFavorite').textContent(),'お気に入り');assert.equal(await page.locator('#workFavorite').getAttribute('data-icon'),'☆');
 await page.locator('#workFavorite').click();assert.equal(await page.locator('#workFavorite').textContent(),'お気に入り解除');assert.equal(await page.locator('#workFavorite').getAttribute('data-icon'),'★');
 assert.equal(await page.locator('#modal .feature-actions.action-tiles').count()>=1,true);
 await page.evaluate(()=>closeModal());
 // Settings: shortcuts + groups; every original control is still present and wired.
 await page.locator('#mobileSettings').click();await page.waitForTimeout(50);
 assert.deepEqual(await page.locator('.settings-group').evaluateAll(xs=>xs.map(x=>x.dataset.group)),['display','sync','storage','devices','ai','about']);
 assert.equal(await page.locator('.feature-sheet > :not(h2):not(.close):not(.settings-quick):not(details):not([hidden])').count(),0,'nothing left ungrouped');
 for(const id of ['importBooks','launchTailscale','keepAwake','seriesStacks','exportReading','importReading','settingsSleep','groupSameFiles','selfTest','downloadStorageSelect','nasAutoSync','runNasSync','pinCoverWidget','systemCast'])assert.equal(await page.locator('#modal #'+id).count(),1,id);
 assert.equal(await page.locator('details[data-group=display] #keepAwake').count(),1);assert.equal(await page.locator('details[data-group=display] #groupSameFiles').count(),1);
 assert.equal(await page.locator('details[data-group=sync] #nasAutoSync').count(),1);assert.equal(await page.locator('details[data-group=storage] #downloadStorageSelect').count(),1);assert.equal(await page.locator('details[data-group=about] #selfTest').count(),1);
 await page.locator('#quickImport').click();assert(await page.evaluate(()=>nativeCalls.includes('chooseBooks')));
 await page.locator('#quickTailscale').click();assert(await page.evaluate(()=>nativeCalls.includes('openTailscale')));
 await page.locator('details[data-group=display] summary').click();await page.locator('#keepAwake').uncheck();assert.equal(await page.evaluate(()=>DSFeatures.prefs().keepAwake),false);
 await page.locator('details[data-group=sync] summary').click();assert.equal(await page.locator('details[data-group=display]').evaluate(e=>e.open),false,'one group open at a time');
 // Reopen keeps the remembered group and does not duplicate tiles.
 await page.evaluate(()=>closeModal());await page.locator('#mobileSettings').click();await page.waitForTimeout(50);
 assert.equal(await page.locator('.settings-quick').count(),1);assert.equal(await page.locator('details[data-group=sync]').evaluate(e=>e.open),true);
 assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);assert.equal(await page.locator('#modalBg.open').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS ui-layout: chips/view/sort sheet, Back/Escape, badge, reset, moved ids, 320–1280px, detail tiles/favourite, settings groups/shortcuts/persistence');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
