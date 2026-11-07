"""Desktop implementation of the Android `DSBooksNative` bridge (MainActivity.NativeBridge).

Same method names, arguments and callback names as Android, so the shared HTML/JS UI runs
unchanged. Callbacks are queued as events and delivered to the page by desktop-bridge.js.
Book files are only read, copied into the app's own folder, or deleted from that folder.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import secrets
import zipfile
from collections import deque
from pathlib import Path

import epub_content

APP_VERSION = "0.2.5-desktop"
SUPPORTED_IMPORT = ("pdf", "epub", "md", "m4a", "m4b", "cbz", "cbr", "jisui")
KIND = {"pdf": "PDF", "epub": "ePub", "md": "Markdown", "cbz": "Comic", "cbr": "Comic", "jisui": "Jisui"}
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def secrets_token() -> str:
    return secrets.token_hex(6)


def app_home() -> Path:
    override = os.environ.get("DSBOOKS_DESKTOP_HOME")
    if override:
        return Path(override)
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "DSBooks"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "DSBooks"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "DSBooks"


def digest(value: str) -> str:
    # Same as MainActivity.digest(): first 16 bytes of SHA-256, hex.
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def norm_nas(path: str) -> str:
    value = re.sub(r"/+", "/", (path or "").replace("\\", "/"))
    if not value.startswith("/"):
        value = "/" + value
    while len(value) > 1 and value.endswith("/"):
        value = value[:-1]
    return value


def valid_leaf(name: str) -> str:
    if not name or name in (".", "..") or "/" in name or "\\" in name or "\0" in name:
        raise ValueError("保存ファイル名が不正です")
    return name


def natural_key(name: str):
    return [(0, int(t), "") if t.isdigit() else (1, 0, t.lower()) for t in re.split(r"(\d+)", name) if t]


# ---------- credentials: Windows DPAPI (per-user), macOS Keychain, elsewhere a private file ----------
KEYCHAIN_SERVICE = "jp.shinwakai.dsbooks.desktop"
KEYCHAIN_ACCOUNT = "nas"


def _keychain():
    """The macOS Keychain (keyring's macOS backend, used directly so no entry-point discovery is needed)."""
    if sys.platform != "darwin":
        return None
    try:
        from keyring.backends import macOS
        return macOS.Keyring()
    except Exception:
        return None

def _dpapi(data: bytes, protect: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(data, len(data))
    blob_in, blob_out = BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), BLOB()
    fn = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    if not fn(ctypes.byref(blob_in), None, None, None, None, 0x1, ctypes.byref(blob_out)):
        raise OSError("DPAPI failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


class Bridge:
    def __init__(self, home: Path | None = None, window_provider=None):
        self.home = home or app_home()
        self.books = self.home / "books"
        self.thumbs = self.home / "thumbnails"
        for d in (self.books, self.thumbs):
            d.mkdir(parents=True, exist_ok=True)
        self.window = window_provider or (lambda: None)
        # Each page (main window, reader windows, a DeskHatch drawer) is a client with its own event queue.
        self.clients: dict[str, dict] = {}
        self.tls = threading.local()
        self.cv = threading.Condition()
        # Shared store for the page's "dsbooks.*" localStorage keys, so every window and the drawer
        # see one library. Written to storage.json shortly after each change.
        self.store: dict[str, str] = self._load_json("storage.json", {})
        self.store_versions: dict[str, int] = {}
        self.store_lock = threading.Lock()
        self.store_timer: threading.Timer | None = None
        # Native windows (set by dsbooks_desktop.py): open_window(url_query, title) -> handle
        self.open_window = None
        self.show_main = None
        self.quit_app = None
        self.background = False
        self.windows: dict[str, object] = {}
        self.book_windows: dict[str, str] = {}
        self.download_lock = threading.Lock()
        self.queue: list[dict] = []
        self.worker: threading.Thread | None = None
        self.paused = threading.Event()
        self.cancelled = False
        self.state = self._load_json("download-state.json", {})
        self.result = self._load_json("download-result.json", {})
        self.weights: dict[str, list[int]] = {}
        self.media_tokens: dict[str, Path] = {}
        self.current: dict = {}
        # Files opened where they are (a .jisui and its sidecar PDF): "ext-<id>" -> absolute path. Read only;
        # "delete" only forgets them, the user's file is never removed.
        self.external: dict[str, str] = self._load_json("external.json", {})
        self.pending_open: list[dict] = []
        self.viewer = False  # Theta.Jisui.Viewer: the same app without the NAS parts

    # ---------- plumbing ----------
    def _client(self) -> str | None:
        return getattr(self.tls, "client", None)

    def emit(self, callback: str, *args, to: str | None = None, skip: str | None = None):
        """Queue a callback for one client (`to`) or, when `to` is None, for every client except `skip`."""
        with self.cv:
            now = time.time()
            for cid in [c for c, v in self.clients.items() if now - v["seen"] > 120]:
                del self.clients[cid]  # pages that stopped polling (closed windows)
            targets = [to] if to else [c for c in self.clients if c != skip]
            for cid in targets:
                self.clients.setdefault(cid, {"q": deque(), "seen": now})["q"].append({"cb": callback, "args": list(args)})
            self.cv.notify_all()

    def take_events(self, client: str = "default", timeout: float = 25.0) -> list:
        with self.cv:
            entry = self.clients.setdefault(client, {"q": deque(), "seen": time.time()})
            entry["seen"] = time.time()
            if not entry["q"]:
                self.cv.wait(timeout)
            entry["seen"] = time.time()
            out = list(entry["q"])
            entry["q"].clear()
            return out

    def _load_json(self, name, default):
        try:
            return json.loads((self.home / name).read_text("utf-8"))
        except Exception:
            return default

    def _save_json(self, name, value):
        tmp = self.home / (name + ".tmp")
        tmp.write_text(json.dumps(value, ensure_ascii=False), "utf-8")
        tmp.replace(self.home / name)

    def log(self, *parts):
        """Download diagnostics without NAS addresses or session ids: %LOCALAPPDATA%\\DSBooks\\download.log."""
        try:
            path = self.home / "download.log"
            if path.exists() and path.stat().st_size > 512 * 1024:
                path.replace(self.home / "download.old.log")
            with open(path, "a", encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(p) for p in parts) + "\n")
        except Exception:
            pass

    def local(self, name: str) -> Path:
        if name.startswith("ext-") and name in self.external:
            return Path(self.external[name])
        path = (self.books / valid_leaf(name)).resolve()
        if path.parent != self.books.resolve():
            raise ValueError("保存先の範囲外です")
        return path

    def call(self, method: str, args: list, client: str | None = None):
        fn = getattr(self, "n_" + method, None)
        if fn is None:
            return ""  # Android-only features (widgets, Cast, TV) are no-ops on the desktop.
        self.tls.client = client
        try:
            return fn(*args)
        finally:
            self.tls.client = None

    def toast(self, text: str, to: str | None = None):
        self.emit("toast", text, to=to or self._client())

    # ---------- shared store ----------
    def n_storageSnapshot(self):
        with self.store_lock:
            return json.dumps(self.store, ensure_ascii=False)

    def n_storageGet(self, key):
        with self.store_lock:
            return self.store.get(key)

    def _store_changed(self, key, removed=False):
        self.store_versions[key] = self.store_versions.get(key, 0) + 1
        if self.store_timer:
            self.store_timer.cancel()
        self.store_timer = threading.Timer(0.5, self._store_flush)
        self.store_timer.daemon = True
        self.store_timer.start()
        # Others fetch the value when they need it; catalogs can be megabytes.
        self.emit("dsStorage", key, self.store_versions[key], removed, skip=self._client())

    def _store_flush(self):
        with self.store_lock:
            snapshot = dict(self.store)
        self._save_json("storage.json", snapshot)

    def n_storageSet(self, key, value):
        if not str(key).startswith("dsbooks."):
            return False
        with self.store_lock:
            if self.store.get(key) == value:
                return True
            self.store[key] = value
        self._store_changed(key)
        return True

    def n_storageRemove(self, key):
        with self.store_lock:
            if key not in self.store:
                return True
            del self.store[key]
        self._store_changed(key, True)
        return True

    # ---------- windows ----------
    def n_canOpenWindows(self): return self.open_window is not None

    def n_openReaderWindow(self, book_id, title):
        if self.open_window is None:
            return False
        wid = self.book_windows.get(str(book_id))
        win = self.windows.get(wid) if wid else None
        if win is not None:
            try:
                win.restore()
                win.show()
                return True
            except Exception:
                pass
        wid = secrets_token()
        self.windows[wid] = self.open_window("?reader=" + urllib.parse.quote(str(book_id)) + "&w=" + wid, title or "DSBooks")
        self.book_windows[str(book_id)] = wid
        return True

    def n_isBackground(self): return bool(self.background)

    def n_quitApp(self):
        if self.quit_app:
            threading.Thread(target=self.quit_app, daemon=True).start()
        return ""

    def n_closeWindow(self, wid):
        win = self.windows.pop(str(wid), None)
        for k, v in list(self.book_windows.items()):
            if v == str(wid):
                del self.book_windows[k]
        if win is not None:
            threading.Thread(target=win.destroy, daemon=True).start()
        return ""

    # ---------- basic info ----------
    def n_getAppVersion(self): return APP_VERSION
    def n_isDesktop(self): return True
    def n_isTelevision(self): return False
    def n_getNetworkStatus(self): return json.dumps({"connected": True, "vpn": False, "type": "desktop"})
    def n_libraryReady(self): return ""

    # ---------- credentials ----------
    def n_saveCredentials(self, base, account, password, sid):
        raw = json.dumps({"base": base, "account": account, "password": password, "sid": sid}).encode("utf-8")
        target = self.home / "credentials.bin"
        kc = _keychain()
        if kc is not None:
            try:
                kc.set_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, base64.b64encode(raw).decode("ascii"))
                target.unlink(missing_ok=True)
                return ""
            except Exception:
                pass  # Keychain refused (e.g. locked): fall back to the private file below
        if sys.platform == "win32":
            target.write_bytes(_dpapi(raw, True))
        else:
            target.write_bytes(base64.b64encode(raw))
            os.chmod(target, 0o600)
        return ""

    def n_loadCredentials(self):
        target = self.home / "credentials.bin"
        kc = _keychain()
        if kc is not None:
            try:
                value = kc.get_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
                if value:
                    return base64.b64decode(value).decode("utf-8")
            except Exception:
                pass
        try:
            data = target.read_bytes()
            raw = _dpapi(data, False) if sys.platform == "win32" else base64.b64decode(data)
            return raw.decode("utf-8")
        except Exception:
            return None

    def n_clearCredentials(self):
        kc = _keychain()
        if kc is not None:
            try:
                kc.delete_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            except Exception:
                pass
        try:
            (self.home / "credentials.bin").unlink()
        except FileNotFoundError:
            pass
        return ""

    # ---------- storage ----------
    def n_hasBook(self, name):
        try:
            if "\n" in name:
                container, entry = self._member(name)
                with zipfile.ZipFile(container) as z:
                    return self._zip_entry(z, entry) is not None
            return self.local(name).is_file()
        except Exception:
            return False

    def n_deleteBook(self, name):
        try:
            if name.startswith("ext-"):
                # A file opened in place belongs to the user: only forget it.
                self.external.pop(name, None)
                self._save_json("external.json", self.external)
                return True
            self.local(name).unlink()
            return True
        except Exception:
            return False

    def n_getStorageInfo(self):
        usage = shutil.disk_usage(self.books)
        loc = {"id": "internal", "label": "このPC", "available": True, "usable": usage.free, "total": usage.total, "removable": False, "path": str(self.books)}
        return json.dumps({"selected": "internal", "locations": [loc], **{k: loc[k] for k in ("label", "available", "usable", "total", "removable")}}, ensure_ascii=False)

    def n_setDownloadStorage(self, _id): return ""

    def n_checkSavedBooks(self, names_json):
        to = self._client()
        def run():
            names = json.loads(names_json or "[]")[:50000]
            self.emit("onSavedBooksChecked", {n: self.n_hasBook(n) for n in names}, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    # ---------- reading ----------
    def n_getEpubChapter(self, name, chapter):
        try:
            path = self.local(name)
            out = epub_content.read_chapter(str(path), int(chapter))
            key = "%s:%d:%d" % (path, path.stat().st_size, path.stat().st_mtime_ns)
            if key not in self.weights:
                self.weights[key] = epub_content.progress_weights(str(path))
            out["progressWeights"] = self.weights[key]
            return json.dumps(out, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e) or "章を読み込めませんでした"}, ensure_ascii=False)

    def n_saveLocalText(self, prefix, text):
        """A text the app made itself (an AI digest) saved as a local book. Never touches NAS files."""
        if not text or len(text) > 4 * 1024 * 1024:
            return None
        data = text.encode("utf-8")
        hx = hashlib.sha256(data).hexdigest()
        safe = prefix if re.fullmatch(r"[a-z]{1,16}", prefix or "") else "text"
        local = "%s-%s.md" % (safe, hx)
        target = self.books / local
        if not target.is_file():
            tmp = self.books / (local + ".part")
            tmp.write_bytes(data)
            tmp.replace(target)
        return json.dumps({"localName": local, "bookId": "sha256:" + hx, "size": len(data)})

    def n_readText(self, name):
        try:
            if "\n" in name:
                container, entry = self._member(name)
                with zipfile.ZipFile(container) as z:
                    info = self._zip_entry(z, entry)
                    if info is None or info.file_size > 4 * 1024 * 1024:
                        return None
                    return z.read(info).decode("utf-8", "replace")
            path = self.local(name)
            if path.stat().st_size > 4 * 1024 * 1024:
                return None
            return path.read_text("utf-8", "replace")
        except Exception:
            return None

    def n_renderPdfPage(self, name, page_index, token):
        to = self._client()
        def run():
            result = {}
            try:
                import fitz
                from PIL import Image
                with fitz.open(str(self._file_for(name))) as doc:
                    if doc.page_count < 1:
                        raise ValueError("PDFにページがありません")
                    index = max(0, min(int(page_index), doc.page_count - 1))
                    page = doc[index]
                    zoom = 1200 / max(1.0, page.rect.width)
                    if page.rect.height * zoom > 2400:
                        zoom = 2400 / max(1.0, page.rect.height)
                    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
                    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                    buf = io.BytesIO()
                    img.save(buf, "JPEG", quality=82)
                    result = {"ok": True, "page": index, "count": doc.page_count, "image": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}
            except Exception as e:
                result = {"ok": False, "error": str(e) or "PDFを表示できませんでした"}
            self.emit("onPdfPage", token, result, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    def _comic_pages(self, path: Path):
        with open(path, "rb") as f:
            magic = f.read(4)
        if magic[:2] != b"PK":
            try:
                import rarfile  # optional; needs an unrar tool on the PC
                archive = rarfile.RarFile(str(path))
            except Exception:
                raise ValueError("CBRはPC版ではまだ表示できません（CBZに対応）")
        else:
            archive = zipfile.ZipFile(path)
        names = sorted((n for n in archive.namelist() if n.lower().endswith(IMAGE_EXT) and not n.endswith("/")), key=natural_key)
        if not names:
            raise ValueError("JPEG・PNG・WebP・GIFのページ画像がありません")
        return archive, names

    def n_renderComicPage(self, name, requested, token):
        to = self._client()
        def run():
            o = {}
            try:
                archive, names = self._comic_pages(self.local(name))
                with archive:
                    index = max(0, min(int(requested), len(names) - 1))
                    data = archive.read(names[index])
                kind = epub_content.mime(names[index])
                o = {"ok": True, "page": index, "count": len(names), "name": names[index], "image": "data:%s;base64,%s" % (kind, base64.b64encode(data).decode())}
            except Exception as e:
                o = {"ok": False, "error": str(e) or "コミックを開けませんでした"}
            self.emit("onComicPage", token, o, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    def n_closeComic(self): return ""

    def n_getAudioChapters(self, name):
        try:
            from mutagen.mp4 import MP4
            chapters = MP4(str(self.local(name))).chapters or []
            return json.dumps([{"title": c.title or "", "timeMs": int(c.start * 1000)} for c in chapters], ensure_ascii=False)
        except Exception:
            return "[]"

    def media_url(self, name: str) -> str:
        path = self.local(name)
        token = digest(str(path) + str(time.time()))
        self.media_tokens[token] = path
        return "/media/" + token

    def n_mediaUrl(self, name):
        try:
            return self.media_url(name)
        except Exception:
            return ""

    # ---------- thumbnails ----------
    def _thumb_data(self, path: Path):
        if path.is_file() and 0 < path.stat().st_size <= 1024 * 1024:
            return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()
        return None

    def n_requestBookThumbnail(self, name):
        to = self._client()
        def run():
            data = None
            try:
                book = self.local(name)
                target = self.thumbs / (digest(name) + ".jpg")
                if not target.is_file():
                    import dsbooks_thumbnails as T
                    image = T.thumbnail(book)
                    if image is not None:
                        T.save_jpeg(image, target)
                data = self._thumb_data(target)
            except Exception:
                data = None
            self.emit("onBookThumbnail", name, data, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    def n_remoteThumbnailPath(self, book_path, roots_json):
        try:
            book = norm_nas(book_path)
            best = ""
            for root in json.loads(roots_json or "[]"):
                r = norm_nas(str(root))
                if r and book.startswith(r + "/") and len(r) > len(best):
                    best = r
            return best + "/_DSBooksCache/thumbs/" + digest(book) + ".jpg" if best else ""
        except Exception:
            return ""

    def dsm_download_url(self, base, api_path, version, sid, remote_path) -> str:
        endpoint = base.rstrip("/") + "/webapi/" + (api_path or "entry.cgi").lstrip("/")
        query = urllib.parse.urlencode({"api": "SYNO.FileStation.Download", "version": str(version or "2"), "method": "download",
                                        "path": json.dumps([remote_path], ensure_ascii=False), "mode": "download", "_sid": sid})
        return endpoint + "?" + query

    def n_requestRemoteBookThumbnail(self, base, api_path, version, sid, remote_path, cache_key):
        to = self._client()
        def run():
            target = self.thumbs / ("remote-" + digest(cache_key) + ".jpg")
            try:
                if not target.is_file() and base and sid:
                    with urllib.request.urlopen(self.dsm_download_url(base, api_path, version, sid, remote_path), timeout=20) as r:
                        kind = r.headers.get("Content-Type", "")
                        if 200 <= r.status < 300 and "json" not in kind and "html" not in kind:
                            data = r.read(1024 * 1024 + 1)
                            if len(data) <= 1024 * 1024 and data[:3] == b"\xff\xd8\xff":
                                target.write_bytes(data)
            except Exception:
                pass
            self.emit("onRemoteBookThumbnail", cache_key, self._thumb_data(target), to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    # ---------- downloads (one at a time, the rest wait in order) ----------
    def _publish_state(self, state, pct, done, total, error=None):
        self.state = {"id": self.current.get("bookId") or self.state.get("id", ""), "state": state, "percent": pct, "done": done, "total": total}
        if error:
            self.state["error"] = error
        self._save_json("download-state.json", self.state)
        self.emit("onNativeDownloadProgress", self.state["id"], pct, done, total)
        self.emit("onNativeDownloadState", self.state["id"], state)

    def _publish_queue(self):
        self.emit("onNativeDownloadQueue", [{"id": j["bookId"], "title": j["title"], "expectedSize": j["expectedSize"]} for j in self.queue])

    def n_getDownloadState(self):
        out = dict(self.state)
        out["result"] = self.result
        out["queue"] = [{"id": j["bookId"], "title": j["title"], "expectedSize": j["expectedSize"]} for j in self.queue]
        return json.dumps(out, ensure_ascii=False)

    def n_downloadBook(self, base, api_path, version, sid, remote_path, title, mime, book_id, expected_size):
        job = {"base": base, "apiPath": api_path, "version": version, "sid": sid, "remotePath": remote_path, "title": title or "本",
               "bookId": str(book_id or ""), "expectedSize": int(expected_size or 0)}
        with self.download_lock:
            if self.worker and self.worker.is_alive():
                if self.current["bookId"] != job["bookId"] and all(j["bookId"] != job["bookId"] for j in self.queue):
                    self.queue.append(job)
                    self.log("queued", job["bookId"], "behind", self.current.get("bookId"), "waiting", len(self.queue))
                else:
                    self.log("ignored duplicate request", job["bookId"])
                self._publish_queue()
                return ""
            self._start(job)
        return ""

    def _start(self, job):
        self.log("start", job["bookId"], "expected", job["expectedSize"])
        self.current = job
        self.cancelled = False
        self.paused.clear()
        self._publish_state("running", 0, 0, job["expectedSize"])
        self.worker = threading.Thread(target=self._run_download, args=(job,), daemon=True)
        self.worker.start()
        self._publish_queue()

    def _finish(self, ok, error=None, local_name=None, size=0):
        self.log("finish", self.current.get("bookId"), "ok" if ok else "failed", size, ("cancelled-by-request" if self.cancelled else "") , error or "")
        self.result = {"id": self.current["bookId"], "ok": ok, "size": size}
        if error:
            self.result["error"] = error
        if local_name:
            self.result["localName"] = local_name
        self._save_json("download-result.json", self.result)
        self.emit("onNativeDownload", self.result)
        self._publish_state("complete" if ok else ("cancelled" if self.cancelled else "error"), 100 if ok else -1, size, size, error)

    def _run_download(self, job):
        partial = None
        try:
            expected = job["expectedSize"]
            free = shutil.disk_usage(self.books).free
            if expected and free < expected + max(8 * 1024 * 1024, expected // 50):
                raise ValueError("このPCの空き容量が不足しています")
            remote = job["remotePath"] or job["title"]
            ext = ""
            leaf = remote.rsplit("/", 1)[-1]
            if "." in leaf:
                ext = re.sub(r"[^A-Za-z0-9.]", "", leaf[leaf.rindex("."):]).lower()
            filename = digest(remote) + ext
            target = self.books / filename
            partial = self.books / (filename + ".part")
            url = self.dsm_download_url(job["base"], job["apiPath"], job["version"], job["sid"], job["remotePath"])
            with urllib.request.urlopen(url, timeout=120) as r:
                kind = r.headers.get("Content-Type", "") or ""
                if "text/html" in kind or "application/json" in kind:
                    body = r.read(64 * 1024).decode("utf-8", "replace")
                    try:
                        code = (json.loads(body).get("error") or {}).get("code", -1)
                    except Exception:
                        code = -1
                    if code in (119, 106, 107):
                        raise ValueError("DSM_SESSION_EXPIRED")
                    raise ValueError("DSM APIエラー %s。接続し直してから再試行してください。" % code if code and code > 0 else "NASがファイルではなくログイン/API応答を返しました。NASへ再接続してください。")
                length = int(r.headers.get("Content-Length") or 0)
                total = length or expected
                done, last = 0, -1
                with open(partial, "wb") as out:
                    while True:
                        while self.paused.is_set() and not self.cancelled:
                            time.sleep(0.2)
                        if self.cancelled:
                            raise InterruptedError()
                        chunk = r.read(128 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)
                        done += len(chunk)
                        pct = min(99, done * 100 // total) if total else -1
                        if pct != last:
                            last = pct
                            self._publish_state("running", pct, done, total)
                    out.flush()
                    os.fsync(out.fileno())
            if length and done != length:
                raise ValueError("保存サイズが通信応答と一致しません。再試行してください。")
            if expected and done != expected:
                raise ValueError("保存サイズがNASの表示と一致しません（%d / %d bytes）。再試行してください。" % (done, expected))
            partial.replace(target)
            partial = None
            self._finish(True, None, filename, target.stat().st_size)
        except InterruptedError:
            self._finish(False, "ダウンロードをキャンセルしました")
        except Exception as e:
            self._finish(False, "ダウンロードをキャンセルしました" if self.cancelled else (str(e) or "ダウンロードに失敗しました"))
        finally:
            if partial is not None:
                try:
                    partial.unlink()
                except Exception:
                    pass
            with self.download_lock:
                self.worker = None
                if self.queue:
                    self._start(self.queue.pop(0))
                else:
                    self._publish_queue()

    def n_controlDownload(self, action):
        if not (self.worker and self.worker.is_alive()):
            return ""
        if action == "pause":
            self.paused.set()
            self._publish_state("paused", self.state.get("percent", 0), self.state.get("done", 0), self.state.get("total", 0))
        elif action == "resume":
            self.paused.clear()
            self._publish_state("running", self.state.get("percent", 0), self.state.get("done", 0), self.state.get("total", 0))
        elif action == "cancel":
            self.log("cancel requested", self.current.get("bookId"), "client", self._client())
            self.cancelled = True
            self.paused.clear()
        return ""

    def n_dequeueDownload(self, book_id):
        with self.download_lock:
            self.queue = [j for j in self.queue if j["bookId"] != str(book_id)]
        self._publish_queue()
        return ""

    # ---------- files and dialogs ----------
    def _dialog(self, kind, **kw):
        window = self.window()
        if window is None:
            # Test hook: DSBOOKS_TEST_DIALOG holds the paths a dialog would return.
            value = os.environ.get("DSBOOKS_TEST_DIALOG")
            return json.loads(value) if value else None
        import webview
        fd = getattr(webview, "FileDialog", None)  # pywebview 5.x: OPEN_DIALOG constants; 6.x: FileDialog enum
        mode = {"open": fd.OPEN if fd else webview.OPEN_DIALOG, "save": fd.SAVE if fd else webview.SAVE_DIALOG,
                "folder": fd.FOLDER if fd else webview.FOLDER_DIALOG}[kind]
        result = window.create_file_dialog(mode, **kw)
        if result is None:
            return None
        return [result] if isinstance(result, str) else list(result)

    # ---------- jisui-1 (.jisui = ZIP of a FullOCR vault); a member is "<container>\n<entry>" ----------
    def _member(self, name: str):
        container, entry = name.split("\n", 1)
        return self.local(container), entry

    @staticmethod
    def _zip_entry(z, entry: str):
        if not entry or entry.startswith("/") or "/../" in "/" + entry + "/":
            return None
        try:
            info = z.getinfo(entry)
        except KeyError:
            return None
        return None if info.is_dir() else info

    def _file_for(self, name: str) -> Path:
        """A real file for `name`: members (a PDF inside a .jisui) are streamed out to a small cache once."""
        if "\n" not in name:
            return self.local(name)
        container, entry = self._member(name)
        st = container.stat()
        key = hashlib.sha256(("%s|%s|%s|%s" % (container.resolve(), st.st_size, st.st_mtime, entry)).encode("utf-8")).hexdigest()
        cache = self.home / "cache" / "jisui"
        cache.mkdir(parents=True, exist_ok=True)
        target = cache / (key + Path(entry).suffix.lower())
        if not target.is_file():
            old = sorted(cache.glob("*"), key=lambda p: p.stat().st_mtime)
            for p in old[:-6]:
                p.unlink(missing_ok=True)
            with zipfile.ZipFile(container) as z:
                info = self._zip_entry(z, entry)
                if info is None:
                    raise ValueError("PDFが.jisuiの中に見つかりません")
                tmp = target.with_suffix(".part")
                with z.open(info) as src, open(tmp, "wb") as out:
                    shutil.copyfileobj(src, out, 1024 * 1024)
                tmp.replace(target)
        return target

    def n_jisuiEntries(self, name):
        try:
            with zipfile.ZipFile(self.local(name)) as z:
                return json.dumps([{"name": i.filename, "size": i.file_size} for i in z.infolist() if not i.is_dir()], ensure_ascii=False)
        except Exception:
            return None

    def n_jisuiImage(self, name):
        try:
            container, entry = self._member(name)
            with zipfile.ZipFile(container) as z:
                info = self._zip_entry(z, entry)
                if info is None or info.file_size > 8 * 1024 * 1024:
                    return None
                ext = Path(entry).suffix.lower()
                mime = {".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml"}.get(ext, "image/jpeg")
                return "data:%s;base64,%s" % (mime, base64.b64encode(z.read(info)).decode("ascii"))
        except Exception:
            return None

    def n_jisuiSidecar(self, name, sidecar):
        """sidecar mode: the PDF beside a .jisui opened in place (same folder). Returns its localName or None."""
        try:
            if not name.startswith("ext-") or not sidecar or "/" in sidecar or "\\" in sidecar:
                return None
            path = Path(self.external[name]).with_name(sidecar)
            return self._register_external(path)["localName"] if path.is_file() else None
        except Exception:
            return None

    def _register_external(self, path: Path) -> dict:
        path = path.resolve()
        ext = path.suffix.lower().lstrip(".")
        if ext not in SUPPORTED_IMPORT or not path.is_file():
            raise ValueError(path.name + "：対応形式ではありません")
        key = "ext-" + hashlib.sha256(str(path).encode("utf-8")).hexdigest()[:20]
        if self.external.get(key) != str(path):
            self.external[key] = str(path)
            self._save_json("external.json", self.external)
        return {"id": "file:" + key, "bookId": "file:" + key, "localName": key, "title": path.stem, "importName": path.name,
                "fileExt": ext.upper(), "size": path.stat().st_size, "type": KIND.get(ext, "Audio"), "offline": True,
                "folder": path.parent.name or "開いたファイル", "author": "", "cover": "c5", "progress": 0, "inPlace": True}

    def open_file(self, path: str) -> bool:
        """A file given on the command line / double-clicked / sent by a second launch: open it where it is."""
        try:
            book = self._register_external(Path(path)) if Path(path).suffix.lower() == ".jisui" else self._import(Path(path))
        except Exception as e:
            self.emit("onDataExchange", {"error": str(e) or "開けませんでした"})
            return False
        with self.cv:
            self.pending_open.append(book)
        self.emit("dsOpenPending")
        return True

    def n_takePendingOpen(self):
        with self.cv:
            books, self.pending_open = self.pending_open, []
        return json.dumps(books, ensure_ascii=False)

    def n_isViewer(self): return bool(self.viewer)

    def n_hasBundledFont(self):
        """The user's own Shuei Times is only in private builds (never in the viewer or public releases)."""
        assets = getattr(self, "assets", None)
        return bool(assets and not self.viewer and (Path(assets) / "fonts" / "ShueiTimes.ttf").is_file())

    def _import(self, source: Path) -> dict:
        ext = source.suffix.lower().lstrip(".")
        if ext not in SUPPORTED_IMPORT:
            raise ValueError(source.name + "：対応形式ではありません")
        h = hashlib.sha256()
        with open(source, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        hx = h.hexdigest()
        local = "import-%s.%s" % (hx, ext)
        target = self.books / local
        if not target.is_file():
            tmp = self.books / (local + ".part")
            shutil.copyfile(source, tmp)
            tmp.replace(target)
        kind = KIND.get(ext, "Audio")
        return {"id": "local:%s:%s" % (hx, ext), "bookId": "sha256:" + hx, "localName": local, "title": source.stem, "importName": source.name,
                "fileExt": ext.upper(), "size": target.stat().st_size, "type": kind, "offline": True, "folder": "端末から取り込み", "author": "", "cover": "c5", "progress": 0}

    def n_chooseBooks(self):
        to = self._client()
        def run():
            types = ("自炊本 (*.jisui)", "本 (*.jisui;*.epub;*.pdf;*.md;*.m4a;*.m4b;*.cbz;*.cbr)", "すべて (*.*)") if self.viewer else ("本 (*.epub;*.pdf;*.md;*.m4a;*.m4b;*.cbz;*.cbr;*.jisui)", "すべて (*.*)")
            paths = self._dialog("open", allow_multiple=True, file_types=types)
            if not paths:
                return
            books, errors = [], []
            for p in paths:
                try:
                    # A .jisui stays where it is (its sidecar PDF sits next to it); other books are copied in.
                    books.append(self._register_external(Path(p)) if Path(p).suffix.lower() == ".jisui" else self._import(Path(p)))
                except Exception as e:
                    errors.append(str(e) or "取り込み失敗")
            self.emit("onDataExchange", {"kind": "books", "books": books, "errors": errors}, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    def n_chooseReadingData(self):
        to = self._client()
        def run():
            paths = self._dialog("open", file_types=("JSON (*.json)", "すべて (*.*)"))
            if not paths:
                return
            try:
                data = Path(paths[0]).read_bytes()
                if len(data) > 8 * 1024 * 1024:
                    raise ValueError("JSONは8MB以下にしてください")
                self.emit("onDataExchange", {"kind": "data", "document": json.loads(data.decode("utf-8"))}, to=to)
            except Exception as e:
                self.emit("onDataExchange", {"error": str(e) or "読み込めませんでした"}, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    def _export(self, text: str, name: str):
        to = self._client()

        def run():
            paths = self._dialog("save", save_filename=name)
            if not paths:
                return
            try:
                Path(paths[0]).write_text(text, "utf-8")
                self.emit("onDataExchange", {"kind": "exported"}, to=to)
            except Exception as e:
                self.emit("onDataExchange", {"error": str(e) or "保存できませんでした"}, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    def n_exportReadingData(self, text): return self._export(text, "dsbooks-reading-%s.json" % time.strftime("%Y%m%d"))
    def n_exportText(self, text, name): return self._export(text, name or "dsbooks.txt")

    def n_exportBook(self, name, suggested, mime):
        to = self._client()
        def run():
            paths = self._dialog("save", save_filename=suggested or name)
            if paths:
                try:
                    shutil.copyfile(self.local(name), paths[0])
                    self.emit("onDataExchange", {"kind": "exported"}, to=to)
                except Exception as e:
                    self.emit("onDataExchange", {"error": str(e)}, to=to)
        threading.Thread(target=run, daemon=True).start()
        return ""

    def n_shareBook(self, name, mime): return self.n_exportBook(name, name, mime)
    def n_shareNamedBook(self, name, display, mime): return self.n_exportBook(name, display, mime)

    def _open_path(self, path: str):
        if sys.platform == "win32":
            os.startfile(path)  # noqa: S606 - opens with the user's associated app
        else:
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", path])

    def n_openBook(self, name, mime):
        try:
            self._open_path(str(self.local(name)))
            return True
        except Exception:
            return False

    def n_openAudioInVlc(self, name, display): return self.n_openBook(name, "")

    def n_copyText(self, text):
        self.emit("desktopCopy", text, to=self._client())
        return ""

    def n_shareText(self, text): return self.n_copyText(text)

    def n_openTailscale(self):
        candidates = [r"C:\Program Files\Tailscale\tailscale-ipn.exe", r"C:\Program Files (x86)\Tailscale\tailscale-ipn.exe", "/Applications/Tailscale.app"]
        for c in candidates:
            if os.path.exists(c):
                self._open_path(c)
                return ""
        self.toast("Tailscaleが見つかりません。タスクバーのTailscaleから接続してください")
        return ""

    def n_openSecureSignIn(self):
        self.toast("Secure SignInはスマートフォンのアプリです。スマートフォンで承認してください")
        return ""

    def n_openLibraryTools(self):
        """The cover-cache / metadata tool, as a separate window of the same program."""
        if getattr(sys, "frozen", False):
            cmd = [sys.executable, "--library-tools"]
        else:
            cmd = [sys.executable, str(Path(__file__).with_name("dsbooks_desktop.py")), "--library-tools"]
        subprocess.Popen(cmd, close_fds=True)
        return ""

    def n_openDataFolder(self):
        self._open_path(str(self.home))
        return ""

    def n_runSelfTest(self, files, token):
        to = self._client()
        def run():
            names = json.loads(files or "[]") if files else []
            saved = [n for n in (x.get("localName") if isinstance(x, dict) else x for x in names) if n]
            self.emit("onNativeSelfTest", token, {"platform": "desktop", "version": APP_VERSION, "files": len(saved),
                                                  "present": sum(1 for n in saved if self.n_hasBook(n))})
        threading.Thread(target=run, daemon=True).start()
        return ""
