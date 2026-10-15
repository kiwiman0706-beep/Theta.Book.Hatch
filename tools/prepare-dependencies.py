#!/usr/bin/env python3
import hashlib,json,shutil,urllib.request,zipfile,time
from pathlib import Path
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
items=[(root/'third_party/androidx'/x['file'],x['url'],x['sha256']) for x in json.loads((root/'third_party/androidx/DEPENDENCIES.json').read_text())]
items.append((root/'third_party/libvlc/libvlc-all-3.7.1.aar','https://repo.maven.apache.org/maven2/org/videolan/android/libvlc-all/3.7.1/libvlc-all-3.7.1.aar','bc1e14d4344c90e4931ad524671024e9605d599d8ca22a894f709e3c0887fb48'))
out=root/'build/dependencies'
if out.exists(): shutil.rmtree(out)
out.mkdir(parents=True)
jars=[];res=[];packages=[]
for file,url,sha in items:
 file.parent.mkdir(parents=True,exist_ok=True)
 if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest()!=sha:
  for attempt in range(4):
   try:
    print('Fetching',file.name,flush=True)
    # Optional Maven Central mirror (e.g. https://repo1.maven.org/maven2); the pinned SHA-256 still decides.
    import os;fetch=url.replace('https://repo.maven.apache.org/maven2',os.environ['DSBOOKS_MAVEN_CENTRAL'].rstrip('/')) if os.environ.get('DSBOOKS_MAVEN_CENTRAL') else url
    with urllib.request.urlopen(fetch,timeout=180) as r,open(str(file)+'.part','wb') as w: shutil.copyfileobj(r,w)
    if hashlib.sha256(Path(str(file)+'.part').read_bytes()).hexdigest()!=sha: raise ValueError('Checksum mismatch')
    Path(str(file)+'.part').replace(file);break
   except Exception:
    if attempt==3: raise
    time.sleep(2)
 if file.suffix=='.jar': jars.append(str(file));continue
 dest=out/file.stem
 with zipfile.ZipFile(file) as z:z.extractall(dest)
 if (dest/'classes.jar').exists():jars.append(str(dest/'classes.jar'))
 if (dest/'res').exists():
  # AAPT1 requires resource IDs in item form. Patch extracted copies, never pinned AARs.
  import re
  for xml in (dest/'res').glob('values*/*.xml'):
   source=xml.read_text();source=re.sub(r'<id\s+name="([^"]+)"\s*/>',r'<item type="id" name="\1"/>',source);xml.write_text(source)
  res.append(str(dest/'res'))
  packages.append(ET.parse(dest/'AndroidManifest.xml').getroot().attrib['package'])
 if (dest/'jni').exists():shutil.copytree(dest/'jni',out/'native/lib',dirs_exist_ok=True)
(out/'jars.txt').write_text('\n'.join(jars)+'\n')
(out/'resources.txt').write_text('\n'.join(res)+'\n')
(out/'packages.txt').write_text(':'.join(packages))
print('Dependencies verified',len(items),flush=True)
