(function(root){
'use strict';
function key(b){if(b.separateWork)return 'single:'+b.id;const path=b.path;if(path){const end=path.lastIndexOf('/'),name=path.slice(end+1).replace(/\.(epub|pdf|md|m4a|m4b|cbz|cbr)$/i,'').normalize('NFC');return 'nas:'+path.slice(0,end+1)+name;}if(String(b.id).startsWith('local:'))return 'local:'+(b.importName||b.title||'').replace(/\.(epub|pdf|md|m4a|m4b|cbz|cbr)$/i,'').normalize('NFC');return 'single:'+b.id;}
function groups(list){const m=new Map();for(const b of list){const k=key(b);if(!m.has(k))m.set(k,[]);m.get(k).push(b);}return m;}
function rank(b){return ({Audio:0,ePub:1,PDF:2,Markdown:3})[b.type]??4;}
function collapse(list){return [...groups(list).values()].map(items=>[...items].sort((a,b)=>rank(a)-rank(b)||String(a.id).localeCompare(String(b.id)))[0]);}
function notes(list){const m=new Map();for(const b of list)for(const x of Array.isArray(b.workNotes)?b.workNotes:[]){if(!x||typeof x.id!=='string')continue;if(!m.has(x.id)||(Number(x.updatedAt)||0)>(Number(m.get(x.id).updatedAt)||0))m.set(x.id,x);}return [...m.values()];}
root.DSWorkModel={key,groups,collapse,notes};if(typeof module!=='undefined')module.exports=root.DSWorkModel;
})(globalThis);
