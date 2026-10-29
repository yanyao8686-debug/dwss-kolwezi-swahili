#!/usr/bin/env python3
"""Repair the DWSS 0.9.69 Service Worker pre-cache asset mismatch."""
from pathlib import Path
import os
import re

ROOT = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))

def need(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit(f"Missing required release asset: {path}")
    return path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one marker, found {count}")
    return text.replace(old, new, 1)

for name in ("index.html", "app.js", "sw.js", "boot.js", "VERSION.txt",
             "dictionary.js.gz", "manifest.webmanifest"):
    need(name)

# Verify this patch is being applied to the exact live baseline.
version_file = need("VERSION.txt")
version = version_file.read_text(encoding="utf-8")
version = replace_once(version, "Version: 0.9.69", "Version: 0.9.70", "release version")
version = re.sub(r"^Release date: .*$", "Release date: 2026-10-29",
                 version, count=1, flags=re.M)
if "0.9.70:" not in version:
    version += "\n0.9.70: Fix Service Worker pre-cache path so web and Android WebView can install the new release; refresh the footer and first-open announcement state.\n"
version_file.write_text(version, encoding="utf-8")

# Root cause: the website ships dictionary.js.gz, not dictionary.js.
# A missing URL in cache.addAll rejects the entire Service Worker installation.
sw_path = need("sw.js")
sw = sw_path.read_text(encoding="utf-8")
sw = replace_once(sw, "const APP_VERSION = '0.9.69';",
                  "const APP_VERSION = '0.9.70';", "Service Worker release")
# The live 0.9.69 site may already have the correct gzip pre-cache path.
# Repair only the obsolete plain filename; never fail or rewrite an already-correct entry.
if "'./dictionary.js'," in sw:
    sw = replace_once(sw, "'./dictionary.js',", "'./dictionary.js.gz',",
                      "Service Worker dictionary pre-cache")
if "'./dictionary.js'," in sw or "'./dictionary.js.gz'," not in sw:
    raise SystemExit("Service Worker pre-cache dictionary path is still invalid.")
sw_path.write_text(sw, encoding="utf-8")

# The website boot script tries gzip first; keep Android's local dictionary.js fallback.
boot = need("boot.js").read_text(encoding="utf-8")
if "['./dictionary.js.gz', './dictionary.js']" not in boot:
    raise SystemExit("Unexpected boot.js web dictionary fallback; refusing a blind patch.")
boot = replace_once(boot, "|| '0.9.69';", "|| '0.9.70';", "bootstrap fallback version")
need("boot.js").write_text(boot, encoding="utf-8")

app_path = need("app.js")
app = app_path.read_text(encoding="utf-8")
app = replace_once(app, "version:'0.9.69'", "version:'0.9.70'", "application metadata")
app_path.write_text(app, encoding="utf-8")

html_path = need("index.html")
html = html_path.read_text(encoding="utf-8")
html = replace_once(html, 'content="0.9.69">', 'content="0.9.70">', "HTML release metadata")
html = replace_once(html, "DWSS_AUTO_UPDATE_0_9_69", "DWSS_AUTO_UPDATE_0_9_70",
                    "HTML update marker")
html = replace_once(html, "版本 0.9.69 · 刚果金斯语翻译",
                    "版本 0.9.70 · 刚果金斯语翻译", "visible footer version")
# Use separate persistent dismissal keys for the web app and native Android APP.
# A previous browser dismissal must never hide the announcement in Android.
controller = r"""<script id="dwss-announcement-controller">
(function(){
 'use strict';
 const overlay=document.getElementById('dwss-announcement-overlay');
 const button=document.getElementById('dwss-announcement-close');
 if(!overlay||!button)return;
 const nativeAndroid=new URLSearchParams(window.location.search).get('dwss-native-app')==='1';
 const key='dwss:announcement-dismissed:0.9.70:'+(nativeAndroid?'android':'web');
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
    lambda _: controller,
    html,
    count=1
)
if count != 1:
    raise SystemExit("Existing announcement controller was not found exactly once.")

script_count = html.count("dwss-release=0.9.69")
if script_count < 3:
    raise SystemExit(f"Expected at least three versioned entry scripts, found {script_count}.")
html = html.replace("dwss-release=0.9.69", "dwss-release=0.9.70")
footer = '<span class="ownership-stamp">© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利</span>'
if html.count(footer) != 1:
    raise SystemExit("The approved copyright footer text is missing or duplicated.")
for marker in ("dwss-announcement-overlay", "我已阅读，进入应用",
               "一、开发目的", "二、底版词库来源", "三、云端共享词库",
               "四、自动更新与离线使用"):
    if marker not in html:
        raise SystemExit("The approved first-open announcement is incomplete: " + marker)
html_path.write_text(html, encoding="utf-8")

print("PASS: Service Worker now pre-caches the deployed dictionary.js.gz file.")
print("PASS: all required assets exist for cache.addAll; no nonexistent dictionary.js request remains.")
print("PASS: release advanced to 0.9.70; footer and first-open announcement are refreshed.")
print("PASS: Android local dictionary.js fallback remains compatible.")
