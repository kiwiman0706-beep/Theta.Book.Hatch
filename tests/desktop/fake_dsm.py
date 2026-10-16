"""Minimal fake DSM for desktop tests: SYNO.FileStation.Download and a JSON API reply."""
import json, sys, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
FILES = {}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _reply(self, status, body, kind):
        self.send_response(status); self.send_header('Content-Type', kind); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        if q.get('api', [''])[0] == 'SYNO.FileStation.Download':
            if q.get('_sid', [''])[0] != 'good':
                return self._reply(200, b'{"success":false,"error":{"code":119}}', 'application/json')
            path = json.loads(q['path'][0])[0]
            data = FILES.get(path)
            if data is None: return self._reply(404, b'', 'text/plain')
            rng = self.headers.get('Range')
            if rng:
                start = int(rng.split('=')[1].split('-')[0]); part = data[start:]
                self.send_response(206); self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, len(data) - 1, len(data)))
                self.send_header('Content-Type', 'application/octet-stream'); self.send_header('Content-Length', str(len(part))); self.end_headers(); self.wfile.write(part); return
            if '/slow' in path:
                # Throttled so a second download starts while this one is still running.
                self.send_response(200); self.send_header('Content-Type', 'application/octet-stream'); self.send_header('Content-Length', str(len(data))); self.end_headers()
                for i in range(0, len(data), 4096):
                    self.wfile.write(data[i:i + 4096]); self.wfile.flush(); time.sleep(0.05)
                return
            return self._reply(200, data, 'application/octet-stream')
        return self._reply(200, json.dumps({'success': True, 'data': {'echo': q.get('x', [''])[0]}}).encode(), 'application/json')
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0); body = self.rfile.read(n).decode()
        return self._reply(200, json.dumps({'success': True, 'data': {'posted': body}}).encode(), 'application/json')
def start(port, files):
    FILES.update(files); s = ThreadingHTTPServer(('127.0.0.1', port), H); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
