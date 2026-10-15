#!/usr/bin/env python3
"""D8 supporting Kotlin metadata in the pinned Cast dependency graph."""
from pathlib import Path
import urllib.request,hashlib
p=Path(__file__).resolve().parent.parent/'build/r8-8.9.35.jar'
sha='204b2fc2b0f4e888dc0ef748b58090def1bf4185068d36abbb94841dbc7107a8'
if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=sha:
 data=urllib.request.urlopen('https://dl.google.com/dl/android/maven2/com/android/tools/r8/8.9.35/r8-8.9.35.jar',timeout=180).read()
 assert hashlib.sha256(data).hexdigest()==sha
 p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
print('D8 compiler verified')
