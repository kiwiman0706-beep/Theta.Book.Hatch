"""Local HTTP server for the desktop viewer (127.0.0.1 only).

Serves the shared Android UI (app/src/main/assets) plus desktop-bridge.js, and offers:
  POST /bridge/<method>  synchronous bridge calls (JSON array of arguments)
  GET  /events           long-poll for bridge callbacks
  POST /proxy            relays the UI's NAS (DSM) requests; the webview would block them cross-origin
  GET  /media/<token>    a saved book file with Range support (audio)
  GET  /nas-stream       NAS audio relayed with Range (play while not saved)
Every API request must carry the per-run token embedded in the page, so other local pages can't use it.
"""
from __future__ import annotations

import json
import mimetypes
import re
import secrets
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

MIME = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
        ".json": "application/json", ".ttf": "font/ttf", ".png": "image/png", ".txt": "text/plain; charset=utf-8",
        ".m4b": "audio/mp4", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".pdf": "application/pdf", ".epub": "application/epub+zip"}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def make_server(bridge, assets: Path, web: Path, port: int):
    token = secrets.token_urlsafe(24)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):  # quiet; nothing sensitive is printed
            pass

        def _send(self, status, body: bytes, kind="application/json", extra=None):
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _authorized(self):
            if self.headers.get("X-DSBooks-Token") == token:
                return True
            q = parse_qs(urlparse(self.path).query)
            return q.get("t", [""])[0] == token

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(n) if n else b""

        # ----- static -----
        def do_GET(self):
            url = urlparse(self.path)
            path = unquote(url.path)
            if path == "/ping":
                return self._send(200, b'{"app":"dsbooks"}')
            if path == "/events":
                if not self._authorized():
                    return self._send(403, b"{}")
                return self._send(200, json.dumps(bridge.take_events(), ensure_ascii=False).encode("utf-8"))
            if path.startswith("/media/"):
                return self._media(bridge.media_tokens.get(path[7:]))
            if path == "/nas-stream":
                if not self._authorized():
                    return self._send(403, b"{}")
                return self._nas_stream(parse_qs(url.query).get("spec", [""])[0])
            if path in ("/", "/index.html"):
                html = (assets / "dsbooks-prototype.html").read_text("utf-8")
                inject = '<script>window.__DSBOOKS_TOKEN=%s;</script><script src="desktop-bridge.js"></script>' % json.dumps(token)
                html = html.replace("<head>", "<head>" + inject, 1)
                return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
            base = web if path == "/desktop-bridge.js" else assets
            target = (base / path.lstrip("/")).resolve()
            if not str(target).startswith(str(base.resolve())) or not target.is_file():
                return self._send(404, b"not found", "text/plain")
            return self._send(200, target.read_bytes(), MIME.get(target.suffix.lower(), mimetypes.guess_type(target.name)[0] or "application/octet-stream"))

        do_HEAD = do_GET

        def _range(self, size):
            m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
            if not m:
                return 0, size - 1, False
            start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
            end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
            return start, min(end, size - 1), True

        def _media(self, path: Path | None):
            if not path or not path.is_file():
                return self._send(404, b"", "text/plain")
            size = path.stat().st_size
            start, end, partial = self._range(size)
            if start > end:
                return self._send(416, b"", "text/plain", {"Content-Range": "bytes */%d" % size})
            self.send_response(206 if partial else 200)
            self.send_header("Content-Type", MIME.get(path.suffix.lower(), "application/octet-stream"))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            if partial:
                self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.end_headers()
            if self.command == "HEAD":
                return
            with open(path, "rb") as f:
                f.seek(start)
                left = end - start + 1
                try:
                    while left > 0:
                        chunk = f.read(min(256 * 1024, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def _nas_stream(self, spec_text):
            try:
                spec = json.loads(spec_text)
                url = bridge.dsm_download_url(spec["base"], spec.get("apiPath"), spec.get("version"), spec["sid"], spec["path"])
                req = urllib.request.Request(url, headers={"Range": self.headers["Range"]} if self.headers.get("Range") else {})
                upstream = urllib.request.urlopen(req, timeout=30)
            except Exception:
                return self._send(502, b"", "text/plain")
            with upstream:
                kind = upstream.headers.get("Content-Type", "")
                if "json" in kind or "html" in kind:
                    return self._send(502, b"", "text/plain")
                self.send_response(upstream.status)
                for h in ("Content-Length", "Content-Range", "Accept-Ranges"):
                    if upstream.headers.get(h):
                        self.send_header(h, upstream.headers[h])
                self.send_header("Content-Type", "audio/mp4")
                self.end_headers()
                try:
                    while True:
                        chunk = upstream.read(256 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def do_POST(self):
            path = urlparse(self.path).path
            if not self._authorized():
                return self._send(403, b"{}")
            if path.startswith("/bridge/"):
                method = path[8:]
                try:
                    args = json.loads(self._body() or b"[]")
                    result = bridge.call(method, args)
                    return self._send(200, json.dumps({"r": result}, ensure_ascii=False).encode("utf-8"))
                except Exception as e:
                    return self._send(200, json.dumps({"r": None, "error": str(e)}, ensure_ascii=False).encode("utf-8"))
            if path == "/proxy":
                return self._proxy(json.loads(self._body() or b"{}"))
            return self._send(404, b"{}")

        def _proxy(self, spec):
            url = spec.get("url", "")
            if not re.match(r"^https?://", url):
                return self._send(400, b"", "text/plain")
            body = spec.get("body")
            data = body.encode("utf-8") if isinstance(body, str) else None
            headers = {k: v for k, v in (spec.get("headers") or {}).items() if k.lower() not in ("host", "content-length", "origin", "referer")}
            req = urllib.request.Request(url, data=data, headers=headers, method=(spec.get("method") or ("POST" if data else "GET")).upper())
            try:
                with _opener.open(req, timeout=float(spec.get("timeout") or 60)) as r:
                    status, payload, kind = r.status, r.read(), r.headers.get("Content-Type", "application/octet-stream")
            except urllib.error.HTTPError as e:
                status, payload, kind = e.code, e.read(), e.headers.get("Content-Type", "text/plain")
            except Exception as e:
                return self._send(599, str(e).encode("utf-8"), "text/plain")
            return self._send(200, payload, kind, {"X-DSBooks-Status": str(status)})

    class Server(ThreadingHTTPServer):
        def handle_error(self, request, client_address):
            # A page reload drops the long-poll and media connections; that is normal, not an error.
            import sys
            if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
                return
            super().handle_error(request, client_address)

    server = Server(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, token
