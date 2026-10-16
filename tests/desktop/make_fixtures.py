"""Create small test books: EPUB (image cover + text, rtl spine), PDF (2 pages), CBZ (3 pages)."""
import sys, zipfile
from pathlib import Path
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[2]; png = (root / 'tests/fixtures/comics/pages/page1.png').read_bytes()
with zipfile.ZipFile(out / 'novel.epub', 'w') as z:
    z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip')
    z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    z.writestr('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/><item id="img" href="cover.png" media-type="image/png"/></manifest><spine page-progression-direction="rtl"><itemref idref="cover"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>')
    z.writestr('OEBPS/cover.xhtml', '<?xml version="1.0"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>表紙</title></head><body><img src="cover.png" alt="表紙"/></body></html>')
    para = ''.join('<p>第%d段落。雨の日に図書館で本を読みました。&nbsp;窓の外では静かに雨が降っています。</p>' % i for i in range(60))
    z.writestr('OEBPS/c1.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><h1>第一章</h1>' + para + '</body></html>')
    z.writestr('OEBPS/c2.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章</title></head><body><h1>第二章</h1><p>おしまい。<ruby>雨<rt>あめ</rt></ruby></p></body></html>')
    z.writestr('OEBPS/cover.png', png)
import fitz
d = fitz.open()
for i in range(2):
    p = d.new_page(); p.insert_text((72, 72), 'Page %d' % (i + 1), fontsize=40)
d.save(str(out / 'doc.pdf'))
with zipfile.ZipFile(out / 'comic.cbz', 'w') as z:
    for n in ('page10.png', 'page2.png', 'page1.png'):
        z.write(root / 'tests/fixtures/comics/pages' / n, n)
print(out)
