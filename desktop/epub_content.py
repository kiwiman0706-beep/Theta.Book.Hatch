"""Python port of EpubContent.java / EpubInspection.resolve for the desktop viewer.

Same output as the Android bridge's getEpubChapter: sanitized chapter HTML (an allow-list of
text tags, package-local images inlined as data URLs), imageOnly, direction and per-chapter
text weights. No EPUB script or style is executed; external resources are refused.
"""
from __future__ import annotations

import base64
import posixpath
import re
import zipfile
from urllib.parse import unquote, urlparse
from xml.etree import ElementTree as ET

IMAGE_LIMIT = 24 * 1024 * 1024
ALLOWED = {"p", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6", "em", "i", "strong", "b", "u", "blockquote",
           "ul", "ol", "li", "br", "hr", "pre", "code", "table", "thead", "tbody", "tr", "td", "th", "ruby", "rt", "rp"}
SKIP = {"head", "script", "style", "iframe", "object", "embed", "foreignobject", "audio", "video", "title", "desc"}
XLINK = "{http://www.w3.org/1999/xlink}href"


def _tag(el) -> str:
    t = el.tag if isinstance(el.tag, str) else ""
    return t.rsplit("}", 1)[-1].split(":")[-1].lower()


def _escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def mime(path: str) -> str:
    s = path.lower()
    if s.endswith(".png"): return "image/png"
    if s.endswith(".webp"): return "image/webp"
    if s.endswith(".gif"): return "image/gif"
    if s.endswith((".jpg", ".jpeg")): return "image/jpeg"
    return ""


def resolve(base: str, href: str) -> str:
    ref = urlparse(href.replace(" ", "%20"))
    if ref.scheme or ref.netloc:
        raise ValueError("EXTERNAL_RESOURCE")
    target = posixpath.normpath(posixpath.join("/" + posixpath.dirname(base), unquote(ref.path)))
    if not target.startswith("/") or "/../" in target or "\0" in target:
        raise ValueError("INVALID_PATH")
    return target[1:]


def _read(z: zipfile.ZipFile, path: str, limit: int) -> bytes:
    try:
        info = z.getinfo(path)
    except KeyError:
        raise ValueError("MISSING_ENTRY")
    if info.file_size > limit:
        raise ValueError("ENTRY_LIMIT")
    return z.read(info)


def _parse(data: bytes):
    # Strip a DOCTYPE so XHTML entities like &nbsp; do not abort parsing; never resolve external entities.
    text = data.decode("utf-8", "replace")
    text = re.sub(r"<!DOCTYPE[^>\[]*(\[[^\]]*\])?>", "", text, count=1, flags=re.I)
    text = text.replace("&nbsp;", " ")
    return ET.fromstring(text.encode("utf-8"))


def _package(z: zipfile.ZipFile):
    container = _parse(_read(z, "META-INF/container.xml", 1024 * 1024))
    roots = [e for e in container.iter() if _tag(e) == "rootfile"]
    if not roots:
        raise ValueError("EPUBに本文情報がありません")
    opf = roots[0].get("full-path")
    pkg = _parse(_read(z, opf, 4 * 1024 * 1024))
    manifest = {e.get("id"): e.get("href") for e in pkg.iter() if _tag(e) == "item"}
    spine = [e.get("idref") for e in pkg.iter() if _tag(e) == "itemref"]
    if not spine:
        raise ValueError("EPUBに本文がありません")
    direction = "ltr"
    for e in pkg.iter():
        if _tag(e) == "spine" and e.get("page-progression-direction") == "rtl":
            direction = "rtl"
        if _tag(e) == "meta" and e.get("name") == "primary-writing-mode" and e.get("content") == "horizontal-rl":
            direction = "rtl"
    return opf, manifest, spine, direction


class _Page:
    def __init__(self):
        self.images = 0
        self.image_bytes = 0
        self.text: list[str] = []
        self.out: list[str] = []


def _append(el, z, chapter: str, p: _Page):
    tag = _tag(el)
    if tag in SKIP:
        _tail(el, p)
        return
    if tag in ("img", "image"):
        href = el.get("src") or el.get("href") or el.get(XLINK) or el.get("xlink:href") or ""
        if not href:
            raise ValueError("ページ画像の参照先がありません")
        path = resolve(chapter, href)
        kind = mime(path)
        if not kind:
            raise ValueError("未対応の画像形式です（JPEG・PNG・WebP・GIFに対応）")
        data = _read(z, path, IMAGE_LIMIT)
        p.image_bytes += len(data)
        if p.image_bytes > 32 * 1024 * 1024:
            raise ValueError("このページの画像が大きすぎます")
        p.images += 1
        p.out.append('<img class="epub-image" alt="%s" src="data:%s;base64,%s">' % (_escape(el.get("alt") or ""), kind, base64.b64encode(data).decode("ascii")))
        _tail(el, p)
        return
    allowed = tag in ALLOWED
    if allowed:
        p.out.append("<%s>" % tag)
    if el.text:
        p.text.append(el.text)
        p.out.append(_escape(el.text))
    for child in el:
        _append(child, z, chapter, p)
    if allowed and tag not in ("br", "hr"):
        p.out.append("</%s>" % tag)
    _tail(el, p)


def _tail(el, p: _Page):
    if el.tail:
        p.text.append(el.tail)
        p.out.append(_escape(el.tail))


def read_chapter(path: str, requested: int) -> dict:
    with zipfile.ZipFile(path) as z:
        opf, manifest, spine, direction = _package(z)
        index = max(0, min(int(requested), len(spine) - 1))
        href = manifest.get(spine[index])
        if not href:
            raise ValueError("EPUB本文の参照先がありません")
        chapter = resolve(opf, href)
        doc = _parse(_read(z, chapter, 16 * 1024 * 1024))
        title = next(("".join(e.itertext()) for e in doc.iter() if _tag(e) == "title"), "")
        body = next((e for e in doc.iter() if _tag(e) == "body"), doc)
        p = _Page()
        if body.text:
            p.text.append(body.text)
            p.out.append(_escape(body.text))
        for child in body:
            _append(child, z, chapter, p)
        html = "".join(p.out)
        if not html.strip():
            raise ValueError("このページに表示できる本文・画像がありません")
        return {"ok": True, "index": index, "count": len(spine), "title": title, "html": html,
                "imageOnly": p.images == 1 and not "".join(p.text).strip(), "images": p.images, "direction": direction}


def progress_weights(path: str) -> list[int]:
    """Characters of body text per spine item (whitespace removed), minimum 1 — as readEpubProgressWeights."""
    out = []
    with zipfile.ZipFile(path) as z:
        opf, manifest, spine, _ = _package(z)
        for idref in spine:
            try:
                doc = _parse(_read(z, resolve(opf, manifest[idref]), 16 * 1024 * 1024))
                body = next((e for e in doc.iter() if _tag(e) == "body"), doc)
                out.append(max(1, len(re.sub(r"\s+", "", "".join(body.itertext())))))
            except Exception:
                out.append(1)
    return out
