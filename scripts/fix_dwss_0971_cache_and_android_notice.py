#!/usr/bin/env python3
"""DWSS 0.9.71 cache repair and Android-specific announcement refresh."""
from pathlib import Path
import os
import re

ROOT = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))

def need(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit("Missing required release asset: " + str(path))
    return path

def bump(text, old, new, label):
    if old in text:
        if text.count(old) != 1:
            raise SystemExit(label + ": duplicate old version marker")
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(label + ": neither expected old nor new version marker found")

for name in ("index.html", "app.js", "boot.js", "pwa.js", "sw.js",
             "VERSION.txt", "dictionary.js.gz", "dictionary-overrides.js",
             "shared-lexicon.js", "supabase.min.js", "manifest.webmanifest",
             "icon-192.png", "icon-512.png", "apple-touch-icon.png",
             "favicon-32.png", "cover.webp", "cover.jpg",
             "COPYRIGHT_AND_LICENSE.txt", "_headers"):
    need(name)

# Release metadata: the real deployed website is 0.9.70; allow safe reruns on 0.9.71.
vp = need("VERSION.txt")
version = vp.read_text(encoding="utf-8")
if "Version: 0.9.70" in version:
    version = bump(version, "Version: 0.9.70", "Version: 0.9.71", "VERSION.txt")
elif "Version: 0.9.71" not in version:
    raise SystemExit("Expected live website version 0.9.70 or 0.9.71.")
version = re.sub(r"^Release date: .*$", "Release date: 2026-10-29",
                 version, count=1, flags=re.M)
if "0.9.71:" not in version:
    version += "\n0.9.71: Repair Service Worker pre-cache, force Android WebView revalidation, and show the first-open announcement independently in Android and web.\n"
vp.write_text(version, encoding="utf-8")

# Ensure the website pre-caches an asset that actually exists on GitHub Pages.
# A failed cache.addAll rejects the new worker and leaves the previous UI in control.
swp = need("sw.js")
sw = swp.read_text(encoding="utf-8")
sw = bump(sw, "const APP_VERSION = '0.9.70';",
          "const APP_VERSION = '0.9.71';", "Service Worker version")
plain = list(re.finditer(r"""(['"])\./dictionary\.js\1""", sw))
if len(plain) > 1:
    raise SystemExit("More than one obsolete dictionary.js pre-cache path exists.")
if plain:
    m = plain[0]
    quote = m.group(1)
    sw = sw[:m.start()] + quote + "./dictionary.js.gz" + quote + sw[m.end():]
if re.search(r"""(['"])\./dictionary\.js\1""", sw):
    raise SystemExit("Nonexistent dictionary.js is still present in Service Worker.")
if not re.search(r"""(['"])\./dictionary\.js\.gz\1""", sw):
    raise SystemExit("Service Worker does not pre-cache dictionary.js.gz.")
swp.write_text(sw, encoding="utf-8")

# Bump the bootstrap fallback version when present; preserve its existing platform logic.
bp = need("boot.js")
boot = bp.read_text(encoding="utf-8")
if "dictionary.js.gz" not in boot:
    raise SystemExit("Web bootstrap no longer references the published gzip dictionary.")
if "|| '0.9.70';" in boot:
    boot = bump(boot, "|| '0.9.70';", "|| '0.9.71';", "bootstrap fallback version")
bp.write_text(boot, encoding="utf-8")

ap = need("app.js")
app = ap.read_text(encoding="utf-8")
app = bump(app, "version:'0.9.70'", "version:'0.9.71'", "application metadata")
ap.write_text(app, encoding="utf-8")

hp = need("index.html")
html = hp.read_text(encoding="utf-8")
for old, new, label in (
    ('content="0.9.70">', 'content="0.9.71">', "HTML update meta"),
    ("DWSS_AUTO_UPDATE_0_9_70", "DWSS_AUTO_UPDATE_0_9_71", "HTML update marker"),
    ("版本 0.9.70 · 刚果金斯语翻译", "版本 0.9.71 · 刚果金斯语翻译", "visible footer version"),
):
    html = bump(html, old, new, label)

# Each platform has its own dismissal key so reading the web announcement
# does not suppress the Android application's first-open announcement.
controller = r"""<script id="dwss-announcement-controller">
(function(){
 'use strict';
 const overlay=document.getElementById('dwss-announcement-overlay');
 const button=document.getElementById('dwss-announcement-close');
 if(!overlay||!button)return;
 const nativeAndroid=new URLSearchParams(window.location.search).get('dwss-native-app')==='1';
 const key='dwss:announcement-dismissed:0.9.71:'+(nativeAndroid?'android':'web');
 let dismissed=false;
 try{dismissed=localStorage.getItem(key)==='1';}catch(_){}
 function close(){overlay.hidden=true;try{localStorage.setItem(key,'1');}catch(_){}}
 button.addEventListener('click',close);
 overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)close();});
 if(!dismissed)overlay.hidden=false;
})();
</script>"""
html, count = re.subn(
    r'<script id="dwss-announcement-controller">[\s\S]*?</script>',
    lambda _: controller, html, count=1
)
if count != 1:
    raise SystemExit("Could not locate the existing announcement controller exactly once.")

old_queries = html.count("dwss-release=0.9.70")
if old_queries:
    html = html.replace("dwss-release=0.9.70", "dwss-release=0.9.71")
else:
    if html.count("dwss-release=0.9.71") < 3:
        raise SystemExit("Expected at least three versioned entry scripts.")
footer = '<span class="ownership-stamp">© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利</span>'
if html.count(footer) != 1:
    raise SystemExit("The approved copyright footer text is missing or duplicated.")
for marker in ("dwss-announcement-overlay", "我已阅读，进入应用",
               "一、开发目的", "二、底版词库来源", "三、云端共享词库",
               "四、自动更新与离线使用"):
    if marker not in html:
        raise SystemExit("First-open announcement is incomplete: " + marker)
hp.write_text(html, encoding="utf-8")

# Preserve the established PWA installation identity.
import json
manifest = json.loads(need("manifest.webmanifest").read_text(encoding="utf-8"))
if manifest.get("id") != "./?app=dwss-kolwezi-swahili" or manifest.get("display") != "standalone":
    raise SystemExit("Existing PWA install identity/display mode must remain unchanged.")

print("PASS: Service Worker now pre-caches the existing dictionary.js.gz website asset.")
print("PASS: new cache version 0.9.71 forces old Android/WebView shells to update.")
print("PASS: screenshot-matching copyright footer and first-open announcement retained.")
print("PASS: Android and web announcement dismissal state are independent.")
