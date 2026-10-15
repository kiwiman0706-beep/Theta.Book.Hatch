from pathlib import Path
import struct

# Build the small WebView Activity class consumed by D8, without requiring javac.
cp = [None]
pool = {}
def u2(n): return struct.pack('>H', n)
def u4(n): return struct.pack('>I', n)
def utf(s):
    key=('u',s)
    if key in pool: return pool[key]
    b=s.encode('utf-8'); i=len(cp); cp.append(b'\x01'+u2(len(b))+b); pool[key]=i; return i
def cls(name):
    key=('c',name)
    if key in pool: return pool[key]
    x=utf(name); i=len(cp); cp.append(b'\x07'+u2(x)); pool[key]=i; return i
def nt(name,desc):
    key=('nt',name,desc)
    if key in pool: return pool[key]
    a=utf(name); b=utf(desc); i=len(cp); cp.append(b'\x0c'+u2(a)+u2(b)); pool[key]=i; return i
def method_ref(owner,name,desc):
    key=('m',owner,name,desc)
    if key in pool: return pool[key]
    c=cls(owner); n=nt(name,desc); i=len(cp); cp.append(b'\x0a'+u2(c)+u2(n)); pool[key]=i; return i
def string(value):
    key=('s',value)
    if key in pool: return pool[key]
    x=utf(value); i=len(cp); cp.append(b'\x08'+u2(x)); pool[key]=i; return i

this=cls('jp/shinwakai/dsbooks/preview/MainActivity')
superclass=cls('android/app/Activity')
code_name=utf('Code'); init_name=utf('<init>'); void_desc=utf('()V')
oncreate_name=utf('onCreate'); oncreate_desc=utf('(Landroid/os/Bundle;)V')
activity_init=method_ref('android/app/Activity','<init>','()V')
activity_oncreate=method_ref('android/app/Activity','onCreate','(Landroid/os/Bundle;)V')
webview=cls('android/webkit/WebView')
settings=cls('android/webkit/WebSettings')
web_init=method_ref('android/webkit/WebView','<init>','(Landroid/content/Context;)V')
get_settings=method_ref('android/webkit/WebView','getSettings','()Landroid/webkit/WebSettings;')
set_js=method_ref('android/webkit/WebSettings','setJavaScriptEnabled','(Z)V')
set_dom=method_ref('android/webkit/WebSettings','setDomStorageEnabled','(Z)V')
set_file=method_ref('android/webkit/WebSettings','setAllowFileAccess','(Z)V')
set_universal=method_ref('android/webkit/WebSettings','setAllowUniversalAccessFromFileURLs','(Z)V')
load_url=method_ref('android/webkit/WebView','loadUrl','(Ljava/lang/String;)V')
set_content=method_ref('android/app/Activity','setContentView','(Landroid/view/View;)V')
get_window=method_ref('android/app/Activity','getWindow','()Landroid/view/Window;')
add_window_flags=method_ref('android/view/Window','addFlags','(I)V')
asset=string('file:///android_asset/dsbooks-prototype.html')

def code_attr(name_index,desc_index,max_stack,max_locals,code):
    body=u2(max_stack)+u2(max_locals)+u4(len(code))+code+u2(0)+u2(0)
    attr=u2(code_name)+u4(len(body))+body
    return u2(1)+u2(name_index)+u2(desc_index)+u2(1)+attr

ctor=bytes([0x2a,0xb7])+u2(activity_init)+bytes([0xb1])
ins=bytearray([0x2a,0x2b,0xb7])+bytearray(u2(activity_oncreate))
ins+=bytes([0x2a,0xb6])+u2(get_window)+bytes([0x11,0x00,0x80,0xb6])+u2(add_window_flags)
ins+=bytes([0xbb])+u2(webview)+bytes([0x59,0x2a,0xb7])+u2(web_init)+bytes([0x4d])
ins+=bytes([0x2c,0xb6])+u2(get_settings)+bytes([0x4e])
for ref in (set_js,set_dom,set_file,set_universal):
    ins+=bytes([0x2d,0x04,0xb6])+u2(ref)
ins+=bytes([0x2c])
ins+=bytes([0x12,asset]) if asset<256 else bytes([0x13])+u2(asset)
ins+=bytes([0xb6])+u2(load_url)+bytes([0x2a,0x2c,0xb6])+u2(set_content)+bytes([0xb1])

out=bytearray(b'\xca\xfe\xba\xbe')+u2(0)+u2(49)+u2(len(cp))
for item in cp[1:]: out+=item
out+=u2(0x0021)+u2(this)+u2(superclass)+u2(0)+u2(0)+u2(2)
out+=code_attr(init_name,void_desc,1,1,ctor)
out+=code_attr(oncreate_name,oncreate_desc,3,4,bytes(ins))
out+=u2(0)
path=Path(__file__).parent.parent/'build/classes/jp/shinwakai/dsbooks/preview/MainActivity.class'
path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(out)
print(f'Wrote {path} ({len(out)} bytes)')
