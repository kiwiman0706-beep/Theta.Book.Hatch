const {chromium}=require('playwright'),assert=require('node:assert/strict');
// 0.9.3: sticky dark bar with ☰ menu; home/nav/NAS/settings from anywhere; Back closes the menu first. Mocked bridge.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.clear();window.calls=[];
  window.DSBooksNative=new Proxy({getAppVersion:()=> '0.9.3-claude',hasBook:()=>true,loadCredentials:()=> '{"u":1}',getPlaybackState:()=>'{"active":false}',getDownloadState:()=> '{}',
   openTailscale:()=>calls.push('tailscale'),openSecureSignIn:()=>calls.push('securesignin'),chooseBooks:()=>calls.push('choose')},{get:(o,k)=>o[k]||(()=> '')});
  localStorage.setItem('dsbooks.catalog',JSON.stringify(Array.from({length:60},(_,i)=>({id:'b'+i,path:'/B/'+(i%3)+'/'+i+'.epub',title:'本'+i,folder:'棚'+(i%3),remote:true,type:'ePub',fileExt:'EPUB',cover:'c1',size:1}))));});
 await page.goto('file://'+process.cwd()+'/app/src/main/assets/dsbooks-prototype.html');await page.waitForFunction(()=>DSBoot.readyMs!==undefined);
 assert.equal(await page.locator('#syncBtn').isHidden(),true);assert.equal(await page.locator('#versionLabel').isHidden(),true);
 assert.equal(await page.locator('#connectBtn').isHidden(),true,'NAS button hidden once registered');
 // Bar stays at the top while scrolling.
 await page.evaluate(()=>scrollTo(0,1500));await page.waitForTimeout(100);
 assert.equal(Math.round(await page.locator('.topbar').evaluate(e=>e.getBoundingClientRect().top)),0);assert.equal(await page.locator('#appMenuBtn').isVisible(),true);
 // Enter a folder, then go home from the menu while scrolled.
 await page.evaluate(()=>{activeFolder='棚1';render();scrollTo(0,800);});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>activeFolder),'棚1');
 const pick=async k=>{await page.locator('#appMenuBtn').click();assert.equal(await page.locator('#appMenu').isVisible(),true);await page.locator(`[data-menu="${k}"]`).click();assert.equal(await page.locator('#appMenu').isHidden(),true);};
 await pick('home');assert.equal(await page.evaluate(()=>activeFolder),'');
 await pick('recent');assert.equal(await page.locator('.bottomnav [data-nav="recent"]').getAttribute('class'),'active');
 await pick('home');assert.equal(await page.locator('.bottomnav [data-nav="home"]').getAttribute('class'),'active');
 await pick('tailscale');await pick('securesignin');await pick('import');assert.deepEqual(await page.evaluate(()=>calls),['tailscale','securesignin','choose']);
 await pick('settings');assert.match(await page.locator('#modal h2').first().textContent(),/設定/);
 assert.equal(await page.locator('details[data-group=display] #swipeTurnSetting').count(),1);await page.locator('details[data-group=display] summary').click();
 await page.locator('#swipeTurnSetting').selectOption('right');assert.equal(await page.evaluate(()=>DSFeatures.prefs().swipeTurn),'right');
 await page.evaluate(()=>closeModal());await pick('downloads');assert.equal(await page.locator('#downloadManager').count(),1);await page.evaluate(()=>closeModal());
 // Brand returns home; Back and Escape close the menu before anything else.
 await page.evaluate(()=>{activeFolder='棚2';render();});await page.locator('.mobile-brand').click();assert.equal(await page.evaluate(()=>activeFolder),'');
 await page.locator('#appMenuBtn').click();assert.equal(await page.evaluate(()=>dsbooksHandleBack()),true);assert.equal(await page.locator('#appMenu').isHidden(),true);
 await page.locator('#appMenuBtn').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#appMenu').isHidden(),true);
 // The pinned bar must never cover a dialog or the reader.
 await page.evaluate(()=>openBook('b1'));await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>{const c=document.querySelector('#modal .close'),r=c.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===c;}),true,'bar covers dialog close');await page.evaluate(()=>closeModal());
 for(const w of [320,390,1280]){await page.setViewportSize({width:w,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow '+w);}
 assert.deepEqual(errors,[]);console.log('PASS app menu: sticky bar, home from folder while scrolled, nav tabs, Tailscale/Secure SignIn/import/settings/downloads, swipe setting, brand home, Back/Escape, 320–1280px');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
