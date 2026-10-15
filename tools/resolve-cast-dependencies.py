#!/usr/bin/env python3
"""Explicit maintainer command. Normal builds use the SHA256-pinned lockfile."""
import urllib.request,xml.etree.ElementTree as E,json,hashlib,re,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
folder=root/'third_party/androidx';lock=folder/'DEPENDENCIES.json'
old=json.loads(lock.read_text());selected={};models={};ns={'m':'http://maven.apache.org/POM/4.0.0'}
def base(g):return 'https://dl.google.com/dl/android/maven2/' if g.startswith(('androidx.','com.google.android.','com.google.firebase')) else 'https://repo.maven.apache.org/maven2/'
def url(g,a,v,ext):return base(g)+g.replace('.','/')+'/'+a+'/'+v+'/'+a+'-'+v+'.'+ext
def version(v):return tuple(int(x) if x.isdigit() else x for x in re.findall(r'\d+|[a-z]+',v.lower()))
queue=[]
for x in old:
 parts=x['url'].split('/');queue.append(('.'.join(parts[parts.index('maven2')+1:-3]),parts[-3],parts[-2]))
queue.append(('com.google.android.gms','play-services-cast-framework','22.1.0'))
def pom(item):
 g,a,v=item
 print('Resolve',g,a,v,flush=True)
 cached=folder/(a+'-'+v+'.pom')
 if cached.exists():data=cached.read_bytes()
 else:
  data=urllib.request.urlopen(url(g,a,v,'pom'),timeout=60).read();cached.write_bytes(data)
 return item,E.fromstring(data)
with concurrent.futures.ThreadPoolExecutor(8) as pool:
 while queue:
  batch=[]
  for g,a,v in queue:
   v=v.strip('[]()').split(',')[0];key=(g,a)
   if key in selected and version(selected[key])>=version(v):continue
   selected[key]=v;batch.append((g,a,v))
  queue=[]
  for item,p in pool.map(pom,batch):
   models[item]=p
   for d in p.findall('m:dependencies/m:dependency',ns):
    get=lambda x:d.findtext('m:'+x,default='',namespaces=ns)
    if get('scope') in ['test','provided'] or get('optional')=='true':continue
    if not get('version') or '${' in get('version'):raise ValueError('Unresolved Maven version '+str(item))
    queue.append((get('groupId'),get('artifactId'),get('version')))
def download(item):
 (g,a),v=item;p=models[(g,a,v)];ext=p.findtext('m:packaging',default='jar',namespaces=ns)
 if ext=='pom':return None
 u=url(g,a,v,ext);f=folder/(a+'-'+v+'.'+ext);print('Fetch',f.name,flush=True);data=f.read_bytes() if f.exists() else urllib.request.urlopen(u,timeout=60).read();f.write_bytes(data);return {'file':f.name,'url':u,'sha256':hashlib.sha256(data).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(8) as ex:items=[x for x in ex.map(download,sorted(selected.items())) if x]
lock.write_text(json.dumps(items,indent=2)+'\n');print('Pinned',len(items),'dependencies')
