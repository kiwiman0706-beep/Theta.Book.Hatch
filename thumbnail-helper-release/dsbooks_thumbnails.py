#!/usr/bin/env python3
"""Create a small, incremental DSBooks cover cache for a mounted NAS folder.

The source folder is read-only. Generated files are written to
<source>/_DSBooksCache/{catalog.json,thumbs/*.jpg}.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import time
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree

from PIL import Image, ImageOps
from dsbooks_metadata import MetadataIndex

SUPPORTED = {".pdf", ".epub", ".m4a", ".m4b"}
CACHE_DIR = "_DSBooksCache"
MAX_EDGE = 480


def norm_remote(path: str) -> str:
    value = "/" + "/".join(part for part in path.replace("\\", "/").split("/") if part)
    return value if value != "//" else "/"


def digest(value: str) -> str:
    # Match MainActivity.digest() so the Android client can derive this path.
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def epub_cover(path: Path) -> Image.Image | None:
    try:
        with zipfile.ZipFile(path) as book:
            container = ElementTree.fromstring(book.read("META-INF/container.xml"))
            rootfile = next((n for n in container.iter() if n.tag.endswith("rootfile")), None)
            if rootfile is None:
                return None
            opf_path = rootfile.attrib.get("full-path", "")
            opf = ElementTree.fromstring(book.read(opf_path))
            base = PurePosixPath(opf_path).parent
            items = [n for n in opf.iter() if n.tag.endswith("item")]
            cover = next((n for n in items if "cover-image" in n.attrib.get("properties", "").split()), None)
            if cover is None:
                metas = [n for n in opf.iter() if n.tag.endswith("meta") and n.attrib.get("name", "").lower() == "cover"]
                cover_id = metas[0].attrib.get("content") if metas else ""
                cover = next((n for n in items if n.attrib.get("id") == cover_id), None)
            if cover is None:
                cover = next((n for n in items if n.attrib.get("media-type", "").startswith("image/") and any(w in n.attrib.get("href", "").lower() for w in ("cover", "title-page"))), None)
            if cover is None:
                cover = next((n for n in items if n.attrib.get("media-type", "").startswith("image/")), None)
            if cover is None:
                return None
            image_path = str(base / cover.attrib["href"])
            image_path = str(PurePosixPath(image_path))
            # EPUB hrefs may contain URL-escaped characters.
            from urllib.parse import unquote
            data = book.read(unquote(image_path))
            import io
            with Image.open(io.BytesIO(data)) as im:
                return ImageOps.exif_transpose(im).convert("RGB")
    except Exception:
        return None


def pdf_cover(path: Path) -> Image.Image | None:
    try:
        import fitz
        with fitz.open(path) as pdf:
            if not pdf.page_count:
                return None
            page = pdf.load_page(0)
            pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
            import io
            with Image.open(io.BytesIO(pix.tobytes("png"))) as im:
                return im.convert("RGB")
    except Exception:
        return None


def audio_cover(path: Path) -> Image.Image | None:
    try:
        from mutagen.mp4 import MP4
        tags = MP4(path).tags or {}
        covers = tags.get("covr") or []
        if not covers:
            return None
        import io
        with Image.open(io.BytesIO(bytes(covers[0]))) as im:
            return ImageOps.exif_transpose(im).convert("RGB")
    except Exception:
        return None


def thumbnail(source: Path) -> Image.Image | None:
    ext = source.suffix.lower()
    if ext == ".epub":
        return epub_cover(source)
    if ext == ".pdf":
        return pdf_cover(source)
    if ext in {".m4a", ".m4b"}:
        return audio_cover(source)
    return None


def save_jpeg(image: Image.Image, target: Path) -> int:
    image.thumbnail((MAX_EDGE * 2 // 3, MAX_EDGE), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (320, 480), "#f7f5ef")
    image.thumbnail((292, 452), Image.Resampling.LANCZOS)
    canvas.paste(image, ((320 - image.width) // 2, (480 - image.height) // 2))
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".cover-", suffix=".jpg", dir=target.parent)
    os.close(fd)
    try:
        canvas.save(temp_name, format="JPEG", quality=78, optimize=True, progressive=True)
        os.replace(temp_name, target)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    return target.stat().st_size


def generate_cache(source_root: Path, nas_root: str, cache_name: str = CACHE_DIR,
                   progress=None, log=None) -> dict:
    source_root = source_root.expanduser().resolve()
    if not source_root.is_dir():
        raise ValueError(f"選択したフォルダが見つかりません: {source_root}")
    if cache_name in {".", "..", ""} or "/" in cache_name or "\\" in cache_name:
        raise ValueError("キャッシュフォルダ名が正しくありません")
    remote_root = norm_remote(nas_root)
    cache_root = source_root / cache_name
    thumbs_dir = cache_root / "thumbs"
    catalog_path = cache_root / "catalog.json"
    try:
        previous = json.loads(catalog_path.read_text("utf-8")) if catalog_path.is_file() else {}
    except (OSError, json.JSONDecodeError):
        previous = {}
    old_by_path = {item.get("path"): item for item in previous.get("books", []) if item.get("path")}
    books = []
    metadata = MetadataIndex(source_root, remote_root, cache_root, previous)
    scanned = generated = reused = no_cover = 0
    errors = []
    for folder, dirs, files in os.walk(source_root):
        dirs[:] = sorted(d for d in dirs if d != cache_name and d not in {"#recycle", "@eaDir"})
        for filename in sorted(files):
            path = Path(folder) / filename
            ext = path.suffix.lower()
            if ext not in SUPPORTED:
                continue
            scanned += 1
            if progress:
                progress(scanned, path)
            rel = path.relative_to(source_root).as_posix()
            remote_path = norm_remote(str(PurePosixPath(remote_root) / PurePosixPath(rel)))
            try:
                stat = path.stat()
                old = old_by_path.get(remote_path, {})
                thumb_rel = f"thumbs/{digest(remote_path)}.jpg"
                thumb_file = cache_root / thumb_rel
                record = {"path": remote_path, "title": path.stem, "size": stat.st_size,
                          "mtime": int(stat.st_mtime), "thumbnail": f"{cache_name}/{thumb_rel}" if thumb_file.is_file() else None,
                          "format": ext[1:]}
                unchanged = old.get("size") == stat.st_size and old.get("mtime") == int(stat.st_mtime)
                if unchanged and (thumb_file.is_file() or old.get("thumbnail") is None):
                    if thumb_file.is_file():
                        record["thumbnail"] = f"{cache_name}/{thumb_rel}"
                    reused += 1
                else:
                    image = thumbnail(path)
                    if image is None:
                        no_cover += 1
                    else:
                        record["thumbnail"] = f"{cache_name}/{thumb_rel}"
                        record["thumbnailBytes"] = save_jpeg(image, thumb_file)
                        generated += 1
                metadata.enrich(path, record)
                books.append(record)
            except Exception as exc:
                errors.append(f"{path}: {exc}")
                if remote_path in old_by_path:
                    books.append(old_by_path[remote_path])
                if log:
                    log(f"処理失敗: {path.name} — {exc}")
    catalog = {"format": "dsbooks-catalog", "schema": 2, "generatedAt": int(time.time()), "source": str(remote_root), "books": books}
    cache_root.mkdir(parents=True, exist_ok=True)
    temp = catalog_path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temp, catalog_path)
    kept = {Path(item["thumbnail"]).name for item in books if item.get("thumbnail")}
    if thumbs_dir.is_dir():
        for old_thumb in thumbs_dir.glob("*.jpg"):
            if old_thumb.name not in kept:
                old_thumb.unlink(missing_ok=True)
    result = {"scanned": scanned, "generated": generated, "reused": reused,
              "no_cover": no_cover, "errors": errors, "catalog": catalog_path,
              "thumbnails": thumbs_dir}
    if log:
        log(f"完了: {scanned}冊 / 新規・更新 {generated}枚 / 再利用 {reused}冊 / 表紙なし {no_cover}冊")
        log(f"索引: {catalog_path}")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Create/update DSBooks cover thumbnails for a mounted NAS folder.")
    parser.add_argument("source", type=Path, help="NAS library folder mounted on this PC")
    parser.add_argument("--nas-root", required=True, help="Same folder's DSM File Station path, e.g. /8Books/⑧カメラ")
    parser.add_argument("--cache-name", default=CACHE_DIR, help=f"Cache directory name (default: {CACHE_DIR})")
    args = parser.parse_args()
    try:
        result = generate_cache(args.source, args.nas_root, args.cache_name,
                                progress=lambda count, path: print(f"処理中 {count}: {path.name}", flush=True),
                                log=print)
    except ValueError as exc:
        parser.error(str(exc))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
