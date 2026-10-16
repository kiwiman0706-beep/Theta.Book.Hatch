"""Start the desktop server (no window) plus a fake DSM, for tests/desktop-0.1.0.cjs."""
import os, sys, time
from pathlib import Path
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'desktop')); sys.path.insert(0, str(root / 'thumbnail-helper-release')); sys.path.insert(0, str(Path(__file__).parent))
import fake_dsm
from bridge import Bridge
from server import make_server
book = Path(sys.argv[2]).read_bytes()
fake_dsm.start(int(sys.argv[3]), {'/Books/本/sample.pdf': book, '/Books/本/second.pdf': book, '/Books/本/slow.pdf': book * 400, '/Books/本/slow2.pdf': book * 400})
b = Bridge(home=Path(sys.argv[1]))
if os.environ.get('DSBOOKS_TEST_WINDOWS'):
    # Record window requests instead of opening native windows.
    import json
    opened = []
    class FakeWindow:
        def __init__(self, q): self.q = q
        def destroy(self): opened.append('closed ' + self.q)
        def restore(self): opened.append('restored ' + self.q)
        def show(self): pass
    def open_window(query, title):
        opened.append(query); return FakeWindow(query)
    b.open_window = open_window
    b.n_testOpened = lambda: json.dumps(opened, ensure_ascii=False)
make_server(b, root / 'app/src/main/assets', root / 'desktop/web', int(sys.argv[4]))
print('ready', flush=True)
while True: time.sleep(3600)
