'use strict';
window.DSEpubSpeech={create(root){
 const segments=[];let text='',block=null;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){if(!n.data||n.parentElement.closest('script,style,rt,rp,[hidden],[aria-hidden="true"]'))return NodeFilter.FILTER_REJECT;const s=getComputedStyle(n.parentElement);return s.display==='none'||s.visibility==='hidden'?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
 while(w.nextNode()){const node=w.currentNode,next=node.parentElement.closest('p,div,h1,h2,h3,h4,h5,h6,li');if(block!==next&&text&&!text.endsWith('\n'))text+='\n';block=next;segments.push({node,start:text.length,end:text.length+node.length});text+=node.data;}
 let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 function range(start,end){const a=segments.find(s=>s.end>start),b=[...segments].reverse().find(s=>s.start<end);if(!a||!b||a.start>=end||b.end<=start)return null;const r=document.createRange();r.setStart(a.node,Math.max(0,start-a.start));r.setEnd(b.node,Math.min(b.node.length,end-b.start));return r;}
 return {text,signature:(hash>>>0)+':'+text.length,range,fromViewport(viewport){
  const box=viewport.getBoundingClientRect(),hit=r=>r.width>0&&r.height>0&&r.right>box.left+1&&r.left<box.right-1&&r.bottom>box.top+1&&r.top<box.bottom-1;
  for(const s of segments){if(!s.node.data.trim())continue;const r=document.createRange();r.selectNodeContents(s.node);if(![...r.getClientRects()].some(hit))continue;let lo=1,hi=s.node.length;while(lo<hi){const mid=(lo+hi)>>1;r.setEnd(s.node,mid);if([...r.getClientRects()].some(hit))hi=mid;else lo=mid+1;}let offset=lo-1;while(offset<s.node.length&&!s.node.data[offset].trim())offset++;if(offset>=s.node.length)continue;if(offset>0&&/[\uDC00-\uDFFF]/.test(s.node.data[offset]))offset--;const start=s.start+offset;return {text:text.slice(start),start,anchor:String(start)};}
  return {text:'',start:0,anchor:''};
 }};
},fromViewport(root,viewport){return this.create(root).fromViewport(viewport);},painter(viewport){
 const css=document.createElement('style');css.textContent='::highlight(dsbooks-speech){background:#ffe39b;color:#17241b}';document.head.appendChild(css);let overlay=null;
 function clear(){CSS.highlights?.delete('dsbooks-speech');overlay?.remove();overlay=null;}
 return {clear,show(range){clear();if(!range)return;if(window.Highlight&&CSS.highlights){CSS.highlights.set('dsbooks-speech',new Highlight(range));return;}overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:10001';const vp=viewport.getBoundingClientRect();for(const r of range.getClientRects()){const left=Math.max(vp.left,r.left),right=Math.min(vp.right,r.right),top=Math.max(vp.top,r.top),bottom=Math.min(vp.bottom,r.bottom);if(right<=left||bottom<=top)continue;const e=document.createElement('i');e.style.cssText=`position:absolute;left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px;background:#ffdc6b66`;overlay.appendChild(e);}document.body.appendChild(overlay);},dispose(){clear();css.remove();}};
}};
(()=>{const previous=window.onPlaybackState;window.onPlaybackState=s=>{previous(s);window.DSFeatures?.reader?.onSpeechState?.(s);};})();
