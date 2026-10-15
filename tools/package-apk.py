#!/usr/bin/env python3
"""Assemble one complete ZIP before alignment and signing."""
from pathlib import Path
import sys, zipfile
build = Path(sys.argv[1])
output = build / 'aligned-unsigned.apk'
with zipfile.ZipFile(build / 'unsigned.apk') as source, zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as dest:
    for entry in source.infolist():
        dest.writestr(entry, source.read(entry))
    for path in sorted((build / 'dex').glob('classes*.dex')):
        dest.write(path, path.name)
    for path in sorted((build / 'dependencies/native').rglob('*')):
        if path.is_file() and path.suffix == '.so' and not path.name.startswith('.'):
            dest.write(path, str(path.relative_to(build / 'dependencies/native')))
with zipfile.ZipFile(output) as result:
    bad = result.testzip()
    if bad:
        raise RuntimeError('Invalid APK ZIP entry: ' + bad)
print('APK ZIP verified', output.stat().st_size)
