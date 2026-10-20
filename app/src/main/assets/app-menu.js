/* 0.9.3 app shell: the dark top bar stays on screen and carries a ☰ menu, so home, NAS reconnect,
   sync and settings are reachable from anywhere in a long library. Existing buttons are reused, not rebuilt. */
window.DSMenu=(()=>{
 'use strict';
 const $=id=>document.getElementById(id),F=DSFeatures,N=()=>window.DSConnection,native=()=>window.DSBooksNative||{};
 const bar=document.querySelector('.topbar');if(!bar)return {};
 bar.classList.add('app-bar');
 const btn=document.createElement('button');btn.id='appMenuBtn';btn.className='app-menu-btn';btn.type='button';btn.setAttribute('aria-label','メニュー');btn.setAttribute('aria-haspopup','dialog');btn.innerHTML='<span></span><span></span><span></span>';
 bar.prepend(btn);
 // The brand returns to the shelf home, like most apps.
 const brand=bar.querySelector('.mobile-brand');if(brand){brand.setAttribute('role','button');brand.tabIndex=0;brand.title='本棚ホームへ';brand.onclick=()=>goHome();brand.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();goHome();}};}
 // Sync and version move into the menu; the bar keeps menu, brand, search and the download chip.
 $('syncBtn')?.classList.add('app-bar-moved');$('versionLabel')?.classList.add('app-bar-moved');

 /* Top of home: one line of title, the NAS button only while no NAS is registered. */
 const hero=document.querySelector('.hero');hero?.classList.add('app-hero');
 function registered(){try{return native().loadCredentials?.()&&native().loadCredentials()!=='null';}catch(e){return false;}}
 function syncHero(){const cta=$('connectBtn');let live=false;try{live=!!dsmConn;}catch(e){}if(cta)cta.hidden=registered()||live;}

 const drawer=document.createElement('div');drawer.id='appMenu';drawer.className='app-menu';drawer.hidden=true;drawer.setAttribute('role','dialog');drawer.setAttribute('aria-label','メニュー');
 document.body.appendChild(drawer);
 const items=[
  ['本棚',[['home','▦','本棚ホーム'],['recent','◷','最近読んだ本'],['downloaded','↓','保存済みの本'],['audio','♫','音声本'],['downloads','⇣','ダウンロード一覧']]],
  ['NAS',[['reconnect','⟲','NASに再接続'],['rescan','⟳','蔵書を更新'],['sync','⇅','読書データを今すぐ同期'],['tailscale','⇄','Tailscaleを開く'],['securesignin','✔','Secure SignInを開く'],['connect','⚙','NASの接続設定']]],
  ['その他',[['import','＋','端末の本を追加'],['settings','⚙','設定']]]];
 // Theta.Jisui.Viewer: no NAS, no downloads; "add" opens files where they are.
 if(window.DSJisui?.viewer){items.splice(1,1);items[0][1]=items[0][1].filter(x=>!['downloaded','downloads'].includes(x[0]));items[1][1]=items[1][1].map(x=>x[0]==='import'?['import','📂','ファイルを開く（.jisui）']:x);}
 // PC/Mac: the cover-cache tool and the data folder live in the same app.
 let desktop=false;try{desktop=!!native().isDesktop?.();}catch(e){}
 if(desktop){const pc=[['libraryTools','▤','ライブラリ管理（表紙キャッシュ作成）'],['dataFolder','▣','データフォルダを開く']].filter(x=>!(window.DSJisui?.viewer&&x[0]==='libraryTools'));let bg=false;try{bg=!!native().isBackground?.();}catch(e){}if(bg)pc.push(['quitApp','⏻','DSBooksを終了']);items.splice(2,0,['PC',pc]);}
 function render(){
  const state=$('nasState')?.textContent?.trim()||'',version=$('versionLabel')?.textContent?.trim()||'';
  drawer.innerHTML='<div class="app-menu-backdrop" data-close></div><nav class="app-menu-panel"><div class="app-menu-head"><strong>'+(window.DSJisui?.viewer?'Theta.Jisui.Viewer':'DSBooks')+'</strong><small>'+escapeHtml(state)+'</small><button type="button" class="app-menu-close" data-close aria-label="閉じる">×</button></div>'
   +items.map(([title,list])=>'<h3>'+title+'</h3><ul>'+list.map(([k,i,t])=>`<li><button type="button" data-menu="${k}"><span aria-hidden="true">${i}</span>${t}</button></li>`).join('')+'</ul>').join('')
   +'<p class="app-menu-version">'+escapeHtml(version)+'</p></nav>';
 }
 function goHome(){closeModal?.();$('libraryHome')?.click();window.scrollTo({top:0,behavior:'smooth'});}
 const nav=k=>{const b=document.querySelector(`.bottomnav [data-nav="${k}"]`)||document.querySelector(`[data-nav="${k}"]`);b?.click();window.scrollTo({top:0});};
 const actions={
  home:goHome,recent:()=>nav('recent'),downloaded:()=>nav('downloaded'),audio:()=>nav('audio'),downloads:()=>window.DSDownloads?.open(),
  reconnect:async()=>{toast('NASに再接続しています…');const ok=await N()?.ensure?.(true,true);if(ok)toast('NASに接続しました');},
  rescan:()=>$('syncBtn')?.click(),sync:()=>window.DSSync?.run?.(true),
  tailscale:()=>native().openTailscale?.(),securesignin:()=>native().openSecureSignIn?.(),connect:()=>openConnectModal(),
  import:()=>native().chooseBooks?.(),settings:()=>F.settings(),libraryTools:()=>native().openLibraryTools?.(),dataFolder:()=>native().openDataFolder?.(),quitApp:()=>native().quitApp?.()};
 let last=null;
 function open(){last=document.activeElement;render();drawer.hidden=false;document.body.classList.add('app-menu-open');requestAnimationFrame(()=>drawer.querySelector('[data-menu]')?.focus());}
 function close(){if(drawer.hidden)return false;drawer.hidden=true;document.body.classList.remove('app-menu-open');try{last?.focus?.();}catch(e){}return true;}
 btn.onclick=open;
 drawer.addEventListener('click',e=>{if(e.target.closest('[data-close]')){close();return;}const b=e.target.closest('[data-menu]');if(!b)return;close();actions[b.dataset.menu]?.();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.hidden){e.preventDefault();close();}});
 const back=window.dsbooksHandleBack;window.dsbooksHandleBack=()=>close()||back();

 /* Settings: global swipe direction, shared by EPUB and comic readers (the reader panel edits the same value). */
 const settings=F.settings;F.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet');if(!sheet)return;const p=F.prefs(),box=document.createElement('section');
  box.innerHTML='<h3>表示：ページめくり</h3><label>スワイプでめくる方向<select id="swipeTurnSetting"><option value="auto">自動（本の向きに合わせる）</option><option value="left">右から左へ払うと次</option><option value="right">左から右へ払うと次</option></select></label>';
  sheet.appendChild(box);const sel=$('swipeTurnSetting');sel.value=p.swipeTurn||'auto';sel.onchange=()=>F.savePrefs({...F.prefs(),swipeTurn:sel.value});};
 $('settingsBtn').onclick=F.settings;$('mobileSettings').onclick=F.settings;

 syncHero();setInterval(syncHero,4000);
 return {open,close,goHome};
})();
