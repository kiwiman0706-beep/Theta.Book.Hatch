#!/usr/bin/env python3
"""Restore the separately supplied personal-use font. Never overwrite a different file."""
from pathlib import Path
import argparse,hashlib,shutil
repo=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=repo.parent/'private-assets/ShueiTimes.ttf');args=p.parse_args()
expected='c1349e4b7f32c98b7b761ad1524e32831b61b1d3fbe345f89633c8c841ee6cbb'
if not args.source.is_file():raise SystemExit('Font missing. Supply --source /path/to/ShueiTimes.ttf; consult docs/SECURITY_AND_LICENSES.md.')
if hashlib.sha256(args.source.read_bytes()).hexdigest()!=expected:raise SystemExit('Source font checksum differs; nothing copied.')
target=repo/'app/src/main/assets/fonts/ShueiTimes.ttf'
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=expected:raise SystemExit('Target is different; refusing overwrite.')
target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(args.source,target)
print('Restored:',target)
