"""DSBooks for Windows/Mac — entry point.

  DSBooks.exe                    the library viewer (Android UI in a native window)
  DSBooks.exe --library-tools    the cover-cache / Obsidian-metadata tool (former PC helper)
  DSBooks.exe --background       run without showing the shelf (for a DeskHatch drawer at
                                 http://127.0.0.1:47817/); starting DSBooks again shows it
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


def mac_app_events(show_main, quitting):
    """macOS: clicking the Dock icon (or opening the app again from Finder, which macOS turns into the same
    event instead of a second process) shows the shelf; ⌘Q / Dock "Quit" really quits even in background mode."""
    if sys.platform != "darwin":
        return
    try:
        import objc
        from webview.platforms.cocoa import BrowserView
    except Exception:
        return

    def reopen(self, app, flag):
        show_main()
        return True

    def terminate(self, app):
        quitting["now"] = True
        return 1  # NSTerminateNow

    for func, sel, sig in ((reopen, b"applicationShouldHandleReopen:hasVisibleWindows:", b"Z@:@Z"),
                           (terminate, b"applicationShouldTerminate:", b"Q@:@")):
        try:
            objc.classAddMethods(BrowserView.AppDelegate, [objc.selector(func, selector=sel, signature=sig)])
        except Exception:
            pass  # without these the app still works; only the Dock conveniences are missing


def library_tools_module():
    try:
        import dsbooks_thumbnail_gui
    except ImportError:
        # Only Windows imports a .pyw by name; elsewhere load the helper's GUI from its file.
        import importlib.machinery
        import importlib.util
        gui = resource(HERE / "helper" / "dsbooks_thumbnail_gui.pyw", REPO / "thumbnail-helper-release" / "dsbooks_thumbnail_gui.pyw")
        loader = importlib.machinery.SourceFileLoader("dsbooks_thumbnail_gui", str(gui))
        spec = importlib.util.spec_from_loader("dsbooks_thumbnail_gui", loader)
        dsbooks_thumbnail_gui = importlib.util.module_from_spec(spec)
        sys.modules["dsbooks_thumbnail_gui"] = dsbooks_thumbnail_gui
        loader.exec_module(dsbooks_thumbnail_gui)
    return dsbooks_thumbnail_gui


def library_tools():
    library_tools_module().main()


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--library-tools", action="store_true")
    parser.add_argument("--serve-only", action="store_true")
    parser.add_argument("--background", action="store_true")
    args, _ = parser.parse_known_args()
    if args.library_tools:
        library_tools()
        return 0

    from bridge import Bridge, app_home
    from server import make_server

    if already_running():
        # Already running (window, background or drawer server): bring its shelf forward instead.
        try:
            urllib.request.urlopen("http://127.0.0.1:%d/show" % PORT, timeout=2).read()
        except Exception:
            pass
        return 0

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
    window = webview.create_window("DSBooks", url, width=1200, height=820, min_size=(380, 560), background_color="#101814", hidden=args.background)
    window_ref["w"] = window

    def open_reader(query, title):
        # Each book gets its own window; they share the library through the bridge's store.
        return webview.create_window(title, url + query, width=900, height=1000, min_size=(360, 480), background_color="#101814")
    bridge.open_window = open_reader

    def show_main():
        try:
            window.show()
            window.restore()
        except Exception:
            pass
    bridge.show_main = show_main

    quitting = {"now": False}

    def quit_app():
        quitting["now"] = True
        for w in list(webview.windows):
            try:
                w.destroy()
            except Exception:
                pass
    bridge.quit_app = quit_app
    bridge.background = args.background

    mac_app_events(show_main, quitting)

    if args.background:
        # In background mode closing the shelf only hides it, so drawers and reader windows keep working.
        def closing():
            if quitting["now"]:
                return True
            window.hide()
            return False
        window.events.closing += closing

    # Reading positions are saved on every page turn, so nothing has to run while the window closes.
    storage = app_home() / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    webview.start(private_mode=False, storage_path=str(storage))
    server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
