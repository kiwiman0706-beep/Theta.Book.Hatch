(()=>{'use strict';
const $=id=>document.getElementById(id);
const settings=DSFeatures.settings;
DSFeatures.settings=()=>{settings();const sheet=document.querySelector('.feature-sheet');if(!sheet)return;
 const box=document.createElement('section');box.id='downloadStorageSettings';box.innerHTML='<h3>ダウンロード・取り込みの保存先</h3><p id="storageCurrent" class="feature-hint"></p><label>保存先フォルダ<select id="downloadStorageSelect" style="display:block;width:100%;max-width:100%;margin-top:8px;padding:12px"></select></label><p id="storageSpace" class="feature-hint"></p><div class="feature-actions"><button class="primary" id="applyDownloadStorage">この保存先を使う</button><button class="secondary" id="refreshDownloadStorage">再確認</button></div><p class="feature-hint">本体またはSDカード等のDSBooks専用フォルダを選べます。以降のダウンロード・取り込みに適用されます。保存済みの本は移動せず、元の場所から開きます。実行中の保存先も変わりません。</p><p class="feature-hint">SDカードを外すと、その中の本は開けません。再挿入後に再確認してください。専用フォルダのファイルはアプリのアンインストールで削除されます。残したい本は事前に「ファイルを保存」で書き出してください。</p><p class="feature-hint" id="storageCardHint"></p>';
 sheet.appendChild(box);let info={};
 const describe=()=>{const choice=(info.locations||[]).find(x=>x.id===$('downloadStorageSelect').value);$('applyDownloadStorage').disabled=!choice?.available;$('storageSpace').textContent=choice?(choice.available?'空き容量 '+formatBytes(choice.usable||0):'未接続・読み取り専用のため保存できません')+' · '+choice.label:'';};
 const refresh=()=>{try{info=JSON.parse(DSBooksNative.getStorageInfo()||'{}');}catch(_){info={};}
  const select=$('downloadStorageSelect');select.replaceChildren();for(const x of info.locations||[]){const option=document.createElement('option');option.value=x.id;option.textContent=x.label+(x.available?'':'（利用不可）');select.appendChild(option);}select.value=info.selected||'internal';
  $('storageCurrent').textContent='現在：'+(info.label||'本体')+(info.available===false?'（利用できません）':'');$('storageCardHint').textContent=(info.locations||[]).some(x=>x.removable&&x.available)?'':'SDカードが一覧にない場合は、端末の設定で認識されているか確認してください。';describe();
  // Re-evaluate availability while retaining references/reading positions for absent cards.
  for(const b of books)if(b.localName)b.offline=!!DSBooksNative.hasBook(b.localName);saveCatalog();render();
 };
 $('downloadStorageSelect').onchange=describe;$('refreshDownloadStorage').onclick=refresh;
 $('applyDownloadStorage').onclick=()=>{const error=DSBooksNative.setDownloadStorage($('downloadStorageSelect').value);if(error){toast(error);refresh();return;}toast('今後の保存先を変更しました');refresh();};refresh();
};
$('settingsBtn').onclick=DSFeatures.settings;$('mobileSettings').onclick=DSFeatures.settings;
})();
