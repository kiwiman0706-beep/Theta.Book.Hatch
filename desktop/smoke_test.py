"""CI smoke test: start DSBooks (source or the built exe) in --serve-only mode and call the bridge."""
import json, os, re, subprocess, sys, tempfile, time, urllib.request
cmd = sys.argv[1:] or [sys.executable, os.path.join(os.path.dirname(__file__), "dsbooks_desktop.py")]
# --window: start the real windowed app (WebView2) and check it keeps running; otherwise serve only.
window = "--window" in cmd
cmd = [c for c in cmd if c != "--window"]
PORT = "47891" if window else "47890"
env = {**os.environ, "DSBOOKS_DESKTOP_HOME": tempfile.mkdtemp(), "DSBOOKS_DESKTOP_PORT": PORT}
proc = subprocess.Popen(cmd + ([] if window else ["--serve-only"]), env=env)
try:
    for _ in range(120):
        try:
            with urllib.request.urlopen("http://127.0.0.1:" + PORT + "/ping", timeout=1) as r:
                assert json.loads(r.read())["app"] == "dsbooks"
            break
        except Exception:
            time.sleep(0.5)
    else:
        raise SystemExit("server did not start")
    html = urllib.request.urlopen("http://127.0.0.1:" + PORT + "/").read().decode("utf-8")
    assert "desktop-bridge.js" in html and "app-menu.js" in html
    token = json.loads(re.search(r"__DSBOOKS_TOKEN=(\"[^\"]+\")", html).group(1))
    def bridge(method, *args):
        req = urllib.request.Request("http://127.0.0.1:" + PORT + "/bridge/" + method, data=json.dumps(args).encode(), headers={"X-DSBooks-Token": token})
        return json.loads(urllib.request.urlopen(req).read())["r"]
    assert bridge("getAppVersion").endswith("-desktop")
    assert json.loads(bridge("getStorageInfo"))["available"] is True
    for asset in ("desktop-bridge.js", "epub-reader.js", "ui-layout.css"):
        assert urllib.request.urlopen("http://127.0.0.1:" + PORT + "/" + asset).status == 200
    if window:
        time.sleep(8)
        assert proc.poll() is None, "window process exited (code %s)" % proc.returncode
    print("SMOKE OK", "window" if window else "serve-only", bridge("getAppVersion"))
finally:
    proc.terminate()
