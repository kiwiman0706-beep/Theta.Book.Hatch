"""DSBooks for Windows/Mac — entry point.

  DSBooks.exe                    the library viewer (Android UI in a native window)
  DSBooks.exe --library-tools    the cover-cache / Obsidian-metadata tool (former PC helper)
  python dsbooks_desktop.py --serve-only   development/test: serve the UI without a window
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

# A windowed exe has no console; printing (e.g. progress in the cover tool) must not crash it.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

HERE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
REPO = Path(__file__).resolve().parent.parent


def resource(*candidates: Path) -> Path:
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError(candidates[0])


ASSETS = resource(HERE / "assets", REPO / "app" / "src" / "main" / "assets")
WEB = resource(HERE / "web", Path(__file__).resolve().parent / "web")
# The cover-cache tool's modules (bundled as plain modules in the frozen app).
for helper in (HERE / "helper", REPO / "thumbnail-helper-release"):
    if helper.is_dir():
        sys.path.insert(0, str(helper))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# A fixed port keeps the page origin (and so its saved library, positions and settings) stable.
PORT = int(os.environ.get("DSBOOKS_DESKTOP_PORT", "47817"))


def already_running() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/ping" % PORT, timeout=1) as r:
            return json.loads(r.read()).get("app") == "dsbooks"
    except Exception:
        return False


def library_tools():
    import dsbooks_thumbnail_gui
    dsbooks_thumbnail_gui.main()


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--library-tools", action="store_true")
    parser.add_argument("--serve-only", action="store_true")
    args, _ = parser.parse_known_args()
    if args.library_tools:
        library_tools()
        return 0

    from bridge import Bridge, app_home
    from server import make_server

    if already_running():
        if not args.serve_only:
            import webview
            webview.create_window("DSBooks", html="<p style='font-family:sans-serif;padding:24px'>DSBooksはすでに起動しています。タスクバーのDSBooksを開いてください。</p>", width=420, height=160)
            webview.start()
        return 1

    window_ref = {}
    bridge = Bridge(window_provider=lambda: window_ref.get("w"))
    server, _token = make_server(bridge, ASSETS, WEB, PORT)
    url = "http://127.0.0.1:%d/" % PORT
    if args.serve_only:
        print(url, flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        return 0

    import webview
    window = webview.create_window("DSBooks", url, width=1200, height=820, min_size=(380, 560), background_color="#101814")
    window_ref["w"] = window

    # Reading positions are saved on every page turn, so nothing has to run while the window closes.
    storage = app_home() / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    webview.start(private_mode=False, storage_path=str(storage))
    server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
