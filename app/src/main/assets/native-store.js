/* Large page data outside localStorage (Android). The WebView gives localStorage a few MB per origin; the library
   catalog of a big NAS (≈15,000 books) does not fit ("exceeded the quota"). Where the app offers a native store
   (DSBooksNative.nativeStoreVersion() ≥ 1), the keys in BIG are kept there (files/store/<key>.json) and the page keeps
   using localStorage.getItem/setItem/removeItem as before. A value already in localStorage moves to the native store
   once and leaves localStorage, freeing its quota. Elsewhere (desktop, browser, tests) nothing changes. */
window.DSStore=(()=>{
 const N=window.DSBooksNative,BIG=new Set(['dsbooks.catalog']);
 let ok=false;try{ok=!!N&&Number(N.nativeStoreVersion?.())>=1;}catch(e){}
 if(!ok)return {native:false,keys:()=>[],big:BIG};
 const P=Storage.prototype,get=P.getItem,set=P.setItem,remove=P.removeItem,cache=new Map();
 const mine=(store,k)=>store===window.localStorage&&BIG.has(String(k));
 // Move what is already in localStorage (older versions) to the native store, once.
 for(const k of BIG){try{const old=get.call(localStorage,k);if(old!=null){if(N.storeGet(k)==null)N.storeSet(k,old);remove.call(localStorage,k);}}catch(e){}}
 P.getItem=function(k){if(!mine(this,k))return get.call(this,k);k=String(k);if(!cache.has(k)){let v=null;try{v=N.storeGet(k);}catch(e){}cache.set(k,v==null?null:String(v));}return cache.get(k);};
 P.setItem=function(k,v){if(!mine(this,k))return set.call(this,k,v);k=String(k);v=String(v);if(N.storeSet(k,v)===false)throw new Error('保存できませんでした: '+k);cache.set(k,v);};
 P.removeItem=function(k){if(!mine(this,k))return remove.call(this,k);k=String(k);N.storeRemove(k);cache.set(k,null);};
 /** Keys held natively (they do not appear in localStorage.key(i)). */
 function keys(){return [...BIG].filter(k=>localStorage.getItem(k)!=null);}
 return {native:true,keys,big:BIG};
})();
