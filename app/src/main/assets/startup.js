(()=>{'use strict';
 const css=document.createElement('style');css.textContent='.library-pages{display:flex;justify-content:center;align-items:center;gap:12px;padding:12px}.library-pages[hidden]{display:none}.library-pages button,.shelf-more{background:#193a29;color:#fff;border:1px solid #66816e;border-radius:8px;padding:12px}.shelf-more{flex:0 0 130px;align-self:center}.library-pages button:disabled{opacity:.45}';document.head.appendChild(css);
 let searchTimer;document.getElementById('search').oninput=e=>{query=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(render,180);};
 window.onSavedBooksChecked=result=>{let changed=false;for(const b of books){if(!b.localName||!(b.localName in result))continue;const value=!!result[b.localName];if(b.offline!==value){b.offline=value;changed=true;}}if(changed){saveCatalog();if(!DSFeatures.reader)render();}};
 requestAnimationFrame(()=>setTimeout(()=>{
  try{DSBoot.loading=false;render();DSBoot.readyMs=Math.round(performance.now()-DSBoot.started);DSBoot.initialCards=document.querySelectorAll('.book-card').length;
   if(DSBoot.catalogError){document.getElementById('nasSub').textContent='本棚情報を読み込めませんでした。元のデータは保持しています。';}
   window.DSBooksNative?.libraryReady?.();
   setTimeout(()=>{if(DSBoot.needsSave){saveCatalog();DSBoot.needsSave=false;}else publishWidgetBooks();const names=[...new Set(books.filter(b=>b.localName).map(b=>b.localName))];window.DSBooksNative?.checkSavedBooks?.(JSON.stringify(names));},900);
  }catch(e){DSBoot.error=String(e?.name||'Error');const message=document.createElement('p');message.textContent='本棚を表示できませんでした。アプリを開き直してください。保存データは削除していません。';grid.replaceChildren(message);window.DSBooksNative?.libraryReady?.();console.error(e);}
 },0));
})();
