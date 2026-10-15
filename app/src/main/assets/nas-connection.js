/* Bounded foreground recovery. Never scan/delete a catalog on connectivity changes. */
(()=>{'use strict';
 const N=window.DSConnection={},$=id=>document.getElementById(id);
 const expired=new Set([106,107,119]);
 let pending=null,lastGood=0,nextTry=0,failures=0,authBlocked=false,lastConnection=null,manualLogin=false,suspended=false;
 let state={status:'idle',message:''};
 function network(){try{return JSON.parse(window.DSBooksNative?.getNetworkStatus?.()||'{}');}catch(_){return {};}}
 function show(status,message){
  state={status,message};let box=$('nasConnectionNotice');
  if(!box){box=document.createElement('section');box.id='nasConnectionNotice';box.className='nas-connection-notice';box.setAttribute('aria-live','polite');document.querySelector('.topbar')?.after(box);}
  box.hidden=status==='connected'||status==='idle';
  box.replaceChildren();if(!box.hidden){const text=document.createElement('span');text.textContent=message;box.appendChild(text);
   const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;box.appendChild(b);};
   if(status!=='checking'){button('再接続',()=>N.ensure(true,true));if(status==='auth')button('ログイン',()=>openConnectModal());else button('Tailscaleを開く',()=>window.DSBooksNative?.openTailscale());}
  }
  if($('nasState'))$('nasState').textContent=status==='connected'?'● DSM接続中':status==='idle'?'NAS未接続':message;
  if($('nasSub'))$('nasSub').textContent=status==='connected'?'接続を確認しました':'保存済みの本はオフラインで読めます';
  if($('nasConnectionHelp'))$('nasConnectionHelp').textContent=message;
 }
 N.state=()=>({status:state.status,busy:!!pending,failures,authBlocked});
 function unreachable(){const net=network();return net.connected===false?'ネットワークに接続できません。保存済みの本は読めます。':net.vpn===false?'NASに届きません。Tailscaleがオフの場合はオンにしてください。':'NASに届きません。Tailscale・NASの電源・接続先を確認してください。';}
 const post=dsmPost;
 async function raw(url,params){return post(url,params);}
 N.ensure=function(force=false,manual=false){
  if(pending)return pending;if(!manual&&(suspended||document.hidden))return Promise.resolve(false);if(manualLogin)return Promise.resolve(!!dsmConn);
  const credentials=savedLogin,previous=dsmConn||lastConnection;
  if(!credentials&&!previous){if(manual)show('auth','NASへのログインが必要です。');return Promise.resolve(false);}
  if(authBlocked){if(manual)show('auth','確認コードまたはログイン情報を入力してください。');return Promise.resolve(false);}
  if(!force&&dsmConn&&Date.now()-lastGood<60000)return Promise.resolve(true);
  if(!force&&Date.now()<nextTry)return Promise.resolve(false);
  const base=credentials?.base||previous.base;
  pending=(async()=>{if(!dsmConn||manual)show('checking','NASに再接続しています…');
   try{
    const discovery=await raw(apiUrl(base,'entry.cgi'),{api:'SYNO.API.Info',version:'1',method:'query',query:'all'}),apis=discovery.data||{};
    const info=apis['SYNO.FileStation.List'];if(!info)throw Error('File Station APIを確認できません');
    let sid=credentials?.sid||previous?.sid;
    const probe=()=>raw(apiUrl(base,info.path),{api:'SYNO.FileStation.List',version:String(info.maxVersion||2),method:'list_share',_sid:sid||''});
    try{await probe();}catch(e){
     if(!expired.has(Number(e.dsmCode)))throw e;
     if(!credentials?.password||!apis['SYNO.API.Auth']){e.needsLogin=true;throw e;}
     const auth=apis['SYNO.API.Auth'];let result;
     try{result=await raw(apiUrl(base,auth.path),{api:'SYNO.API.Auth',version:String(Math.min(3,Number(auth.maxVersion)||3)),method:'login',account:credentials.account,passwd:credentials.password,session:'FileStation',format:'sid'});}catch(error){if(error.dsmCode)error.needsLogin=true;throw error;}
     sid=result.data?.sid;if(!sid){const e=Error('ログインが必要です');e.needsLogin=true;throw e;}await probe();
    }
    if(savedLogin!==credentials||manualLogin)return false;
    dsmConn={base,apis,sid};lastConnection=dsmConn;
    if(credentials&&credentials.sid!==sid){credentials.sid=sid;window.DSBooksNative?.saveCredentials(base,credentials.account,credentials.password,sid);}
    failures=0;nextTry=0;lastGood=Date.now();show('connected','NASに接続しました');return true;
   }catch(e){
    if(savedLogin!==credentials||manualLogin)return false;
    lastConnection=previous;dsmConn=null;failures++;nextTry=Date.now()+[10000,30000,60000][Math.min(2,failures-1)];
    if(e.needsLogin||expired.has(Number(e.dsmCode))){authBlocked=true;show('auth','確認コードまたはログイン情報を入力してください。');}
    else show('offline',unreachable());return false;
   }finally{pending=null;}
  })();return pending;
 };
 N.failed=()=>{lastGood=0;if(!authBlocked)show('offline',unreachable());};
 dsmCall=async function(apiName,method,params={}){
  if(!dsmConn&&!await N.ensure())throw Error(state.message||'NASに接続していません');
  const invoke=()=>{const c=dsmConn,info=c?.apis?.[apiName];if(!info)throw Error('NASのAPIを確認できません');return raw(apiUrl(c.base,info.path),{api:apiName,version:String(info.maxVersion||info.version||1),method,...params,_sid:c.sid});};
  try{return await invoke();}catch(e){
   if(expired.has(Number(e.dsmCode))){lastGood=0;if(['list','list_share','getinfo'].includes(method)&&await N.ensure(true))return invoke();}
   if(!e.dsmCode||expired.has(Number(e.dsmCode)))N.failed();throw e;
  }
 };
 resumeNasSession=async()=>{const ok=await N.ensure(true);if(ok)window.DSSync?.run();return ok;};
 const connect=connectNas;connectNas=async()=>{manualLogin=true;authBlocked=false;try{await connect();if(dsmConn){lastConnection=dsmConn;lastGood=Date.now();failures=0;show('connected','NASに接続しました');}else show('offline','接続できませんでした。入力内容とTailscaleの接続を確認してください。');}finally{manualLogin=false;}};
 const modal=openConnectModal;openConnectModal=()=>{modal();const status=$('connectStatus');if(!status)return;const box=document.createElement('div');box.className='nas-connection-help';box.innerHTML='<p id="nasConnectionHelp"></p><button class="secondary" id="nasOpenTailscale">Tailscaleを開く</button><button class="secondary" id="nasRetryConnection">保存したログインで再接続</button>';status.before(box);$('nasConnectionHelp').textContent=state.message||'Tailscaleをオンにしたら、この画面へ戻ってください。';$('nasOpenTailscale').onclick=()=>window.DSBooksNative?.openTailscale();$('nasRetryConnection').onclick=()=>N.ensure(true,true);};
 $('connectBtn').onclick=()=>openConnectModal();
 const scan=scanLibrary;scanLibrary=async(...args)=>{if(await N.ensure())return scan(...args);};
 $('syncBtn').onclick=async()=>{if(await N.ensure(true,true))scanLibrary(savedShares);};
 let downloadStarting=false;const download=startBookDownload;startBookDownload=async(b,openAfter)=>{if(downloadStarting)return;downloadStarting=true;try{if(await N.ensure(true,true))download(b,openAfter);}finally{downloadStarting=false;}};
 const startAudio=window.startNasAudio;if(startAudio)window.startNasAudio=async(b,save,reconnect)=>{if(b.localName&&window.DSBooksNative?.hasBook(b.localName))return startAudio(b,save,reconnect);if(await N.ensure(!!reconnect,true))return startAudio(b,save,false);};
 const sync=window.DSSync?.run;if(sync)DSSync.run=async manual=>{if(DSSync.config().enabled&&!await N.ensure(false,!!manual))return;return sync(manual);};
 let wakeTimer;const wake=()=>{suspended=false;clearTimeout(wakeTimer);wakeTimer=setTimeout(()=>{if(document.visibilityState!=='hidden')N.ensure(true).then(ok=>{if(ok)window.DSSync?.run();});},800);};
 window.dsbooksPaused=()=>{suspended=true;clearTimeout(wakeTimer);};window.dsbooksNetworkChanged=wake;window.dsbooksResumed=wake;window.addEventListener('online',wake);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wake();});
 setInterval(()=>{if(!suspended&&document.visibilityState!=='hidden'&&!authBlocked)N.ensure();},15000);
})();
