/* 1.0.0 full-screen reading: the reader's bars float over the page and show only when needed.
   Tap the middle of the page (or move the mouse to the top/bottom edge) to show them; they fade out a few seconds
   after the last touch. Edge taps stay with the page readers (turn pages). The bars are only faded, never removed,
   so keyboard paging (which clicks the visible Next/Prev buttons) keeps working.
   Setting: 設定 → 表示と読書 →「読書中も操作ボタンを常に表示」. */
window.DSReaderChrome=(()=>{
 'use strict';
 const F=DSFeatures,HIDE_MS=3500,BARS=':scope > .reader-top, :scope > .reader-tools, :scope > .reader-controls';
 const always=()=>!!F.prefs().chromeAlways;
 let root=null,timer=0;
 function show(stay){if(!root)return;root.classList.add('chrome-on');clearTimeout(timer);if(!stay)timer=setTimeout(hide,HIDE_MS);}
 function hide(){if(!root)return;const a=document.activeElement;if(document.querySelector('.reader-panel')||a&&root.contains(a)&&a.closest('.chrome-bar')&&a.matches('input,select,textarea'))return show();root.classList.remove('chrome-on');}
 function toggle(){root?.classList.contains('chrome-on')?(clearTimeout(timer),root.classList.remove('chrome-on')):show();}
 function attach(){
  const r=document.querySelector('#modal > .reader');root=null;clearTimeout(timer);
  if(!r||always()||r.classList.contains('digest-reader')||r.classList.contains('immersive'))return;
  const bars=[...r.querySelectorAll(BARS)];if(!bars.length)return;
  // Keep the bars' order: everything before the page goes into the top overlay, everything after into the bottom one.
  const vp=r.querySelector(':scope > .reader-viewport');if(!vp)return;
  const top=document.createElement('div'),bottom=document.createElement('div');top.className='chrome-bar chrome-top';bottom.className='chrome-bar chrome-bottom';
  for(const b of bars)(b.compareDocumentPosition(vp)&Node.DOCUMENT_POSITION_FOLLOWING?top:bottom).appendChild(b);
  r.appendChild(top);r.appendChild(bottom);r.classList.add('immersive');root=r;
  for(const bar of [top,bottom]){bar.addEventListener('pointerdown',()=>show(),true);bar.addEventListener('focusin',()=>show(true));bar.addEventListener('focusout',()=>show());}
  // On the reader (not the page), so the page's own handlers (edge taps that turn pages) run first.
  r.addEventListener('click',e=>{
   if(!vp.contains(e.target)||e.dsHandled||e.defaultPrevented||root!==r)return;
   if(e.target.closest('a,button,input,select,textarea,label,.md-wikilink,.digest-chip,.qa-reveal'))return;
   if(r.id==='epubReader'&&e.target.tagName==='IMG')return; // EPUB: tapping a picture opens it larger
   if(String(getSelection?.()||'').trim())return;
   toggle();
  });
  r.addEventListener('mousemove',e=>{if(e.sourceCapabilities?.firesTouchEvents)return;const b=r.getBoundingClientRect();if(e.clientY-b.top<64||b.bottom-e.clientY<84)show();});
  // Status lines ("loading…", errors) float as a small pill that shows when the text changes and then fades.
  r.querySelectorAll(':scope > .reader-status').forEach(st=>{let t=0;const flash=()=>{clearTimeout(t);st.classList.toggle('status-on',!!st.textContent.trim());t=setTimeout(()=>st.classList.remove('status-on'),2600);};new MutationObserver(flash).observe(st,{childList:true,characterData:true,subtree:true});flash();});
  show(); // briefly, so the bars are discoverable
 }
 const open=showReaderModal;
 showReaderModal=function(html){const out=open.apply(this,arguments);try{attach();}catch(e){}return out;};
 // Panels (notes, display, chapters) keep the bars up while open.
 new MutationObserver(()=>{if(root&&document.querySelector('.reader-panel'))show(true);else if(root&&root.classList.contains('chrome-on'))show();}).observe(document.getElementById('modal'),{childList:true});
 // Settings: opt out.
 const settings=F.settings;F.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet');if(!sheet)return;const box=document.createElement('section');
  box.innerHTML='<h3>表示：読書画面</h3><label><input type="checkbox" id="chromeAlways"> 読書中も操作ボタンを常に表示（オフ：ページの中央をタップした時だけ表示）</label>';
  sheet.appendChild(box);const c=document.getElementById('chromeAlways');c.checked=always();c.onchange=()=>F.savePrefs({...F.prefs(),chromeAlways:c.checked});};
 document.getElementById('settingsBtn').onclick=F.settings;document.getElementById('mobileSettings').onclick=F.settings;
 return {show,hide,toggle,get active(){return root;}};
})();
