#!/usr/bin/env python3
"""Theta.Jisui.Viewer for Android: the DSBooks APK as a separate app without the NAS parts.

Writes <out>/AndroidManifest.xml (own label, application id provider authority and versionName; no widgets, no
Android Auto) and <out>/assets (the same screens, but never the user's Shuei Times font: the viewer is distributed
with FullOCR). The Java code is shared; the app tells itself apart by its package name (isViewer)."""
import re, shutil, sys
from pathlib import Path

root, out, app_id, version = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
src = (root / "app/src/main/AndroidManifest.xml").read_text("utf-8")
m = src
m = m.replace('android:label="DSBooks Claude"', 'android:label="Theta.Jisui.Viewer"', 1)
m = re.sub(r'android:authorities="[^"]+\.files"', 'android:authorities="%s.files"' % app_id, m, count=1)
m = re.sub(r'android:versionName="[^"]+"', 'android:versionName="%s"' % version, m, count=1)
# Home-screen widgets and Android Auto belong to the NAS library app.
m = re.sub(r'\s*<receiver android:name="\.ReadingWidgetProvider".*?</receiver>', "", m, flags=re.S)
m = re.sub(r'\s*<receiver android:name="\.RichReadingWidgetProvider".*?</receiver>', "", m, flags=re.S)
m = re.sub(r'\s*<service android:name="\.ReadingWidgetService"[^>]*/>', "", m)
m = re.sub(r'\s*<service android:name="\.CarBrowserService".*?</service>', "", m, flags=re.S)
m = re.sub(r'\s*<meta-data android:name="com\.google\.android\.gms\.car\.application"[^>]*/>', "", m)
for gone in ("ReadingWidgetProvider", "RichReadingWidgetProvider", "ReadingWidgetService", "CarBrowserService", "gms.car.application"):
    assert gone not in m, gone
assert 'android:label="Theta.Jisui.Viewer"' in m and ('android:authorities="%s.files"' % app_id) in m
if out.exists():
    shutil.rmtree(out)
(out / "assets").mkdir(parents=True)
(out / "AndroidManifest.xml").write_text(m, "utf-8")
shutil.copytree(root / "app/src/main/assets", out / "assets", dirs_exist_ok=True, ignore=shutil.ignore_patterns("ShueiTimes*"))
assert not list((out / "assets").rglob("ShueiTimes*")), "the user's font must not be in the viewer"
print("viewer variant", app_id, version)
