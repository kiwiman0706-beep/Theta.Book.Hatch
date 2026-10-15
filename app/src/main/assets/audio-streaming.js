/* Streaming owns no passwords, catalog entries or temporary-file cache. Native service owns HTTP. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
let starting=false;
const ready=b=>!!(b.localName&&DSBooksNative.hasBook(b.localName));
function downloadState(){try{return JSON.parse(DSBooksNative.getDownloadState()||'{}')}catch(_){return {}}}
window.startNasAudio=async(b,save=false,reconnect=false)=>{
 if(starting)return;
 starting=true;
 try{
  if(reconnect||!dsmConn){if(savedLogin?.sid){toast('NASに再接続しています');await resumeNasSession();}else{toast('NASに接続してください');openConnectModal();return;}}
  if(!dsmConn){toast('NASの接続・確認コードを確認してください');openConnectModal();return;}
  const api=dsmConn.apis['SYNO.FileStation.Download'];if(!api){toast('音声の取得APIが見つかりません');return;}
  const spec={base:dsmConn.base,apiPath:api.path||'entry.cgi',version:api.maxVersion||api.version||2,sid:dsmConn.sid,path:b.path,bookId:String(b.id),size:Number(b.size)||0,title:b.title,subtitle:b.author||''};
  b.lastReadAt=Date.now();saveCatalog();
  audio(b,{stream:spec,restart:reconnect});
  if(save){const ds=downloadState();if(['running','paused'].includes(ds.state)&&String(ds.id)!==String(b.id))toast('別の本を保存中のため、今回は再生だけ開始しました');else{startBookDownload(b,false);updateSave(b);}}
 }finally{starting=false;}
};
const detail=DSWork.detail;
DSWork.detail=b=>{detail(b);const assets=DSWork.members(b);document.querySelectorAll('.work-asset').forEach((row,i)=>{
 const asset=assets[i];if(!asset||asset.type!=='Audio'||!asset.remote)return;
 const box=document.createElement('div');box.className='feature-actions stream-actions';
 for(const [label,save]of (ready(asset)?[['NASから聴く',false]]:[['今すぐ聴く',false],['保存しながら聴く',true]])){const button=document.createElement('button');button.className=save?'secondary':'primary';button.textContent=label;button.onclick=()=>startNasAudio(asset,save);box.appendChild(button);}
 row.appendChild(box);const hint=document.createElement('p');hint.className='feature-hint';hint.textContent='NAS接続が必要です。保存しながら聴く場合は再生と保存が別通信になり、通信量が増えます。';row.appendChild(hint);
});};
function updateSave(b){
 if(!$('streamSaveStatus')||audioBook!==b)return;
 const ds=downloadState(),complete=ready(b),mine=String(ds.id)===String(b.id),busy=mine&&['running','paused'].includes(ds.state);
 $('streamSaveStatus').textContent=complete?'保存完了。端末の保存に切り替えるとオフラインで聴けます。':busy?`端末への保存 ${Math.max(0,Number(ds.percent)||0)}% · ${ds.state==='paused'?'一時停止中':'保存中'}`:mine&&ds.state==='error'?'保存に失敗しました。再生と保存は独立しているため、再生は続けられます。':'再生と保存は別通信です。保存後はオフラインで聴けます。';
 $('streamSave').textContent=complete?'端末の保存に切り替える':'オフライン用に保存';$('streamSave').disabled=busy;
 $('streamPauseSave').hidden=!busy;$('streamCancelSave').hidden=!busy;
 $('streamPauseSave').textContent=ds.state==='paused'?'保存を再開':'保存を一時停止';
}
const baseAudio=audio;
audio=function(b,options){baseAudio(b,options);const root=document.querySelector('.audio-modal');if(!root||!(options?.stream||(audioMatches(b)&&playbackSnapshot.streaming)))return;
 const box=document.createElement('section');box.className='stream-save feature-sheet';box.style.padding='12px 0';
 box.innerHTML='<p id="streamSaveStatus" class="feature-hint"></p><div class="feature-actions"><button class="secondary" id="streamSave">オフライン用に保存</button><button class="secondary" id="streamPauseSave" hidden>保存を一時停止</button><button class="secondary" id="streamCancelSave" hidden>保存を中止</button></div><button class="secondary" id="streamRetry">NASに再接続して再試行</button>';
 root.appendChild(box);
 $('streamSave').onclick=async()=>{if(ready(b)){b.audioPosition=Number(playbackSnapshot.position)||Number(b.audioPosition)||0;DSBooksNative.playbackAction('stop',0,1);playbackSnapshot={active:false};audio(b);return;}if(!dsmConn&&savedLogin?.sid)await resumeNasSession();const ds=downloadState();if(['running','paused'].includes(ds.state)&&String(ds.id)!==String(b.id)){toast('別の本の保存が完了してからお試しください');return;}startBookDownload(b,false);updateSave(b);};
 $('streamPauseSave').onclick=()=>DSBooksNative.controlDownload(downloadState().state==='paused'?'resume':'pause');
 $('streamCancelSave').onclick=()=>DSBooksNative.controlDownload('cancel');
 $('streamRetry').onclick=()=>{b.audioPosition=Number(playbackSnapshot.position)||Number(b.audioPosition)||0;startNasAudio(b,false,true);};
 updateSave(b);
};
const playback=window.onPlaybackState;window.onPlaybackState=s=>{if(s.active&&s.kind==='audio'&&s.sourceId){const b=books.find(x=>String(x.id)===s.sourceId);if(b){audioBook=b;activeAudioToken=s.token;}}playback(s);if(audioBook)updateSave(audioBook);};
for(const key of ['onNativeDownload','onNativeDownloadProgress','onNativeDownloadState']){const old=window[key];window[key]=(...args)=>{old?.(...args);if(key==='onNativeDownload'&&args[0]?.ok)window.restoreDownloadState({result:args[0]});if(audioBook)updateSave(audioBook);};}
})();
