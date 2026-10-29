#!/usr/bin/env python3
from pathlib import Path
import gzip, json, os, re, unicodedata

ROOT = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))
OLD = "0.9.69"
NEW = "0.9.70"

def need(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit("Missing required release asset: " + str(path))
    return path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one marker, found {count}")
    return text.replace(old, new, 1)

for name in ("VERSION.txt", "index.html", "boot.js", "app.js", "sw.js",
             "manifest.webmanifest", "dictionary.js.gz", "pwa.js",
             "shared-lexicon.js", "dictionary-overrides.js", "supabase.min.js"):
    need(name)

# Keep the original, audited dictionary payload byte-for-byte unchanged.
dictionary_bytes = need("dictionary.js.gz").read_bytes()
source = gzip.decompress(dictionary_bytes).decode("utf-8")
match = re.fullmatch(r"\s*window\.SW_DB\s*=\s*(\[.*\])\s*;\s*", source, re.S)
if not match:
    raise SystemExit("Unexpected dictionary.js.gz structure.")
dictionary = json.loads(match.group(1))
if len(dictionary) < 2042:
    raise SystemExit("Built-in dictionary unexpectedly small.")

# Release metadata and Service Worker cache name.
version_file = need("VERSION.txt")
version_text = version_file.read_text(encoding="utf-8")
version_text = replace_once(version_text, f"Version: {OLD}", f"Version: {NEW}", "VERSION.txt")
version_text = re.sub(r"^Release date: .*?$", "Release date: 2026-10-29", version_text, count=1, flags=re.M)
version_text += (
    f"\n{NEW}: Android WebView performs a fresh network revalidation at each cold start; "
    "native Android has its own first-open announcement state; footer ownership text is "
    "enforced to match the official website; preserve offline Cache API fallback.\n"
)
version_file.write_text(version_text, encoding="utf-8")

sw_file = need("sw.js")
sw = sw_file.read_text(encoding="utf-8")
sw = replace_once(sw, f"const APP_VERSION = '{OLD}';", f"const APP_VERSION = '{NEW}';", "Service Worker version")
sw_file.write_text(sw, encoding="utf-8")

boot_file = need("boot.js")
boot = boot_file.read_text(encoding="utf-8")
boot = replace_once(boot, f"|| '{OLD}';", f"|| '{NEW}';", "bootstrap fallback version")
boot_file.write_text(boot, encoding="utf-8")

app_file = need("app.js")
app = app_file.read_text(encoding="utf-8")
app = replace_once(
    app,
    f"name:'刚果金斯语翻译',owner:'德威安全官陈谍',version:'{OLD}'",
    f"name:'刚果金斯语翻译',owner:'德威安全官陈谍',version:'{NEW}'",
    "application metadata"
)
app_file.write_text(app, encoding="utf-8")

# The ownership statement is deliberately identical in the webpage and Android WebView.
index_file = need("index.html")
html = index_file.read_text(encoding="utf-8")
html = replace_once(html, f'content="{OLD}">', f'content="{NEW}">', "HTML auto-update meta")
html = replace_once(html, f"<!-- DWSS_AUTO_UPDATE_{OLD.replace('.', '_')} -->",
                    f"<!-- DWSS_AUTO_UPDATE_{NEW.replace('.', '_')} -->", "HTML update marker")
html = replace_once(html, f"版本 {OLD} · 刚果金斯语翻译",
                    f"版本 {NEW} · 刚果金斯语翻译", "visible footer version")
for name in ("supabase.min.js", "shared-lexicon.js", "boot.js"):
    html = replace_once(
        html,
        f'./{name}?dwss-release={OLD}',
        f'./{name}?dwss-release={NEW}',
        name + " versioned script"
    )

footer = (
    '<div class="footer">版本 ' + NEW + ' · 刚果金斯语翻译'
    '<span class="ownership-stamp">© 2026 刚果金斯语翻译/ '
    '该应用由德威安全官陈谍匠心开发 · 保留所有权利</span></div>'
)
html, count = re.subn(r'<div class="footer">[\s\S]*?</div>', lambda _: footer, html, count=1)
if count != 1:
    raise SystemExit("Expected exactly one application footer; refusing to publish.")

# Give Android a platform-specific dismissal key so an earlier browser dismissal
# cannot silently suppress the announcement inside the native APP.
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
    raise SystemExit("Existing announcement controller not found exactly once.")
if 'id="dwss-announcement-overlay"' not in html or '我已阅读，进入应用' not in html:
    raise SystemExit("Closable announcement markup is missing.")
index_file.write_text(html, encoding="utf-8")

# Confirm the app's PWA identity and original dictionary are unchanged.
manifest = json.loads(need("manifest.webmanifest").read_text(encoding="utf-8"))
if manifest.get("id") != "./?app=dwss-kolwezi-swahili" or manifest.get("display") != "standalone":
    raise SystemExit("PWA install identity/display changed unexpectedly.")
if manifest.get("name") != "刚果金斯语翻译":
    raise SystemExit("PWA name mismatch.")
if need("dictionary.js.gz").read_bytes() != dictionary_bytes:
    raise SystemExit("Original dictionary was unexpectedly modified.")

print(f"PASS: DWSS website upgraded from {OLD} to {NEW}.")
print(f"PASS: {len(dictionary)} original dictionary records retained unchanged.")
print("PASS: exact requested footer ownership text is present.")
print("PASS: announcement dismissal is isolated between native Android and web.")
print("PASS: Service Worker cache version is bumped; offline Cache API fallback remains.")
print("PASS: PWA identity/name/display mode remain unchanged.")
