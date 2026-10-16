"""Start the desktop server (no window) plus a fake DSM, for tests/desktop-0.1.0.cjs."""
import os, sys, time
from pathlib import Path
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'desktop')); sys.path.insert(0, str(root / 'thumbnail-helper-release')); sys.path.insert(0, str(Path(__file__).parent))
import fake_dsm
from bridge import Bridge
from server import make_server
book = Path(sys.argv[2]).read_bytes()
fake_dsm.start(int(sys.argv[3]), {'/Books/本/sample.pdf': book, '/Books/本/second.pdf': book})
b = Bridge(home=Path(sys.argv[1]))
make_server(b, root / 'app/src/main/assets', root / 'desktop/web', int(sys.argv[4]))
print('ready', flush=True)
while True: time.sleep(3600)
