"""Fixtures for tests/desktop-jisui-0.9.7.cjs: real .jisui ZIPs (jisui-1) with an embedded PDF and with a sidecar PDF."""
import io, json, sys, zipfile
from pathlib import Path
import fitz
from PIL import Image

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
def pdf(pages):
    d = fitz.open()
    for i in range(pages):
        d.new_page().insert_text((72, 72), "page %d" % (i + 1))
    return d.tobytes()
png = io.BytesIO(); Image.new("RGB", (40, 30), (200, 30, 30)).save(png, "PNG")
filler = "\n\n".join("段落%d。発作の分類と診断。" % i for i in range(20))
def vault(pdfspec):
    return {
        "mimetype": "application/x-jisui",
        "theta-book.json": json.dumps({"format": "jisui-1", "title": "ねころんで読めるてんかん診療", "entry": "00_index.md", "pdf": pdfspec, "page_anchors": "fullocr-1", "page_offset": 8}, ensure_ascii=False),
        "00_index.md": "---\ntitle: ねころんで読めるてんかん診療\npage_anchors: fullocr-1\npdf_file: ねころん_text.pdf\npage_offset: 8\n---\n# ねころんで読めるてんかん診療\n\n- [[01_第1章#第1章 発作|第1章]]\n",
        "01_第1章.md": '<!-- fullocr:page pdf=9 print="1" -->\n\n# 第1章 発作\n\n![[p0009_fig1.png]]\n\n' + filler + '\n\n<!-- fullocr:page pdf=10 print="2" -->\n\n' + filler + "\n",
        "attachments/p0009_fig1.png": png.getvalue(),
    }
def write(path, files):
    # jisui-1 §2.1: mimetype first and stored; already-compressed binaries stored; text deflated.
    with zipfile.ZipFile(path, "w") as z:
        for name, data in sorted(files.items(), key=lambda kv: kv[0] != "mimetype"):
            stored = name == "mimetype" or name.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".epub", ".zip"))
            z.writestr(zipfile.ZipInfo(name), data if isinstance(data, bytes) else data.encode("utf-8"), compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
emb = vault({"mode": "embedded", "name": "ねころん_text.pdf"}); emb["ねころん_text.pdf"] = pdf(12)
write(out / "ねころん.jisui", emb)
write(out / "side.jisui", vault({"mode": "sidecar", "name": "ねころん_text.pdf", "sidecar": "side.pdf"}))
(out / "side.pdf").write_bytes(pdf(14))
print("ok")
