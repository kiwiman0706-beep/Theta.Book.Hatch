#!/usr/bin/env python3
"""Portable document/manifest checks. --baseline additionally verifies the original 0.8.6 snapshot."""
from pathlib import Path
import argparse,json,hashlib,re,sys
r=Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--baseline',action='store_true');a=p.parse_args();errors=[]
for name in ['AGENTS.md','README.md','CHANGELOG.md','ROADMAP.md','docs/AI_HANDOFF.md','docs/CURRENT_STATE.md','docs/REQUIREMENTS.md','docs/BACKLOG.md','docs/KNOWN_ISSUES.md','docs/ARCHITECTURE.md','docs/DATA_AND_SYNC.md','docs/BUILD_AND_RELEASE.md','docs/TESTING.md','docs/GITHUB_IMPORT.md','docs/SCOPE_AND_GAPS.md','docs/SECURITY_AND_LICENSES.md']:
 if not (r/name).is_file():errors.append('Missing '+name)
for path in (r/'docs/reference').glob('*.json'):
 try:json.loads(path.read_text())
 except Exception as e:errors.append(str(path)+': '+str(e))
for path in r.rglob('*'):
 if any(x in {'.git','node_modules','build','.venv','venv'} for x in path.relative_to(r).parts):continue
 if path.is_file() and path.suffix.lower() in {'.keystore','.jks','.p12','.pfx'}:errors.append('Private-key file in source: '+str(path.relative_to(r)))
if a.baseline:
 for item in json.loads((r/'docs/reference/source-baseline.json').read_text())['entries']:
  path=r/item['handoffPath']
  if not path.is_file():errors.append('Missing baseline: '+item['handoffPath']);continue
  actual=hashlib.sha256(path.read_bytes()).hexdigest()
  if actual!=item['sha256']:errors.append('Baseline differs: '+item['handoffPath'])
if errors:print('\n'.join(errors));sys.exit(1)
print('PASS: handoff structure'+(' and original-source baseline' if a.baseline else ''))
