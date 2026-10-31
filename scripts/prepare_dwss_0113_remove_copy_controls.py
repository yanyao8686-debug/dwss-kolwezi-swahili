#!/usr/bin/env python3
"""Remove only the redundant result-heading copy button and adjacent state pill."""
from __future__ import annotations
import hashlib
import os
import sys
import re
from pathlib import Path

VERSION_OLD = "0.9.112"
VERSION_NEW = "0.9.113"
root = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DWSS_PUBLIC_DIR", "public")).resolve()
if not root.is_dir():
    raise SystemExit(f"DWSS public directory not found: {root}")
required = ["index.html", "app.js", "sw.js", "VERSION.txt"]
for name in required:
    if not (root / name).is_file():
        raise SystemExit(f"Missing required DWSS asset: {name}")

protected = [
    "cover.webp", "DWSS-Android-Installer.apk", "dictionary.js.gz",
    "dictionary-overrides.js", "shared-lexicon.js", "pwa.js", "boot.js",
    "manifest.webmanifest", "pronunciation-search.js", "dwss-pronunciation-controls.js",
]
protected_hashes = {}
for name in protected:
    path = root / name
    if not path.is_file():
        raise SystemExit(f"Missing protected DWSS asset: {name}")
    protected_hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()

def read(name: str) -> str:
    return (root / name).read_text(encoding="utf-8")

def write(name: str, value: str) -> None:
    (root / name).write_text(value, encoding="utf-8", newline="\n")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

html = read("index.html")
app = read("app.js")
sw = read("sw.js")
version_file = read("VERSION.txt")

# Keep the internal result-state target because app.js writes translation status to it,
# but hide it completely and remove the user-facing gray chip and copy button.
old_heading = (
    '<div class="sectionTitle"><h2>斯语翻译中文谐音：</h2>'
    '<div class="result-title-actions"><span class="chip" id="resultState"></span>'
    '<button class="soft mini" id="copyReading" type="button" '
    'aria-label="复制当前斯语中文谐音">复制谐音</button></div></div>'
)
new_heading = (
    '<div class="sectionTitle"><h2>斯语翻译中文谐音：</h2>'
    '<span id="resultState" hidden aria-hidden="true"></span></div>'
)
html = replace_once(html, old_heading, new_heading, "result heading controls")

html = replace_once(html, "#copyReading{min-height:34px!important}\n", "", "legacy copy button sizing")
html = replace_once(
    html,
    "#resultCard #resultReading{background:#fff!important;border:0!important;box-shadow:none!important;cursor:pointer}",
    "#resultCard #resultReading{background:#fff!important;border:0!important;box-shadow:none!important;cursor:text}",
    "result textarea cursor",
)

# Remove only the copy-specific CSS introduced in the previous release; preserve the
# other approved button refinements and the mobile heading typography.
html = replace_once(
    html,
    "/* 3. Copy is beside the result heading, separate from the editable textarea. */\n"
    "#resultCard .sectionTitle{display:flex!important;align-items:center!important;gap:8px!important}\n"
    "#resultCard .sectionTitle h2{flex:1 1 auto!important;min-width:0!important}\n"
    ".result-title-actions{display:flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:6px;min-width:0}\n"
    "#resultCard .result-title-actions .chip{flex:0 0 auto!important}\n"
    "#copyReading{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:40px!important;min-width:72px!important;padding:8px 10px!important;border-radius:10px!important;font-size:12px!important;white-space:nowrap!important}\n",
    "",
    "copy-specific button-layout CSS",
)
html = replace_once(
    html,
    "@media(max-width:360px){#resultCard .sectionTitle{gap:5px!important}#resultCard .sectionTitle h2{font-size:15px!important}.result-title-actions{gap:4px}#copyReading{min-width:68px!important;padding:7px 8px!important;font-size:11px!important}}",
    "@media(max-width:360px){#resultCard .sectionTitle{gap:5px!important}#resultCard .sectionTitle h2{font-size:15px!important}}",
    "mobile copy-specific CSS",
)

# Keep the style-only surface treatment, but remove the invisible click-to-copy behavior
# so the pronunciation textarea is again an ordinary editable/selectable text field.
script_pattern = re.compile(r'<script id="dwss-simple-result-ui">.*?</script>', re.S)
style_only_script = '''<script id="dwss-simple-result-ui">
(function(){
  function apply(){
    const card=document.getElementById('resultCard');
    if(!card)return;
    const reading=document.getElementById('resultReading');
    if(!reading)return;
    reading.classList.add('dwss-result-surface');
    if(reading.parentElement&&reading.parentElement!==card)reading.parentElement.classList.add('dwss-result-surface');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>'''
html, n = script_pattern.subn(style_only_script, html, count=1)
if n != 1:
    raise SystemExit(f"simple result UI copy handler: expected one block, found {n}")

# Keep the general copy helper because the independent backup-copy button still uses it.
app = replace_once(
    app,
    "$('copyReading').addEventListener('click',()=>copyText($('resultReading').value,'copyReading','复制谐音'));\n",
    "",
    "copy-reading event binding",
)

html_count = html.count(VERSION_OLD)
if html_count < 4:
    raise SystemExit(f"index.html version markers incomplete: found {html_count} occurrences of {VERSION_OLD}")
html = html.replace(VERSION_OLD, VERSION_NEW)
html = replace_once(html, "DWSS_AUTO_UPDATE_0_9_112", "DWSS_AUTO_UPDATE_0_9_113", "automatic update marker")
app = replace_once(app, "version:'0.9.112'", "version:'0.9.113'", "application version metadata")
sw = replace_once(sw, "const APP_VERSION = '0.9.112';", "const APP_VERSION = '0.9.113';", "service worker cache version")
version_file = replace_once(version_file, "Version: 0.9.112", "Version: 0.9.113", "VERSION.txt current version")
version_file = version_file.rstrip() + (
    "\n\n0.9.113: Remove the standalone ‘复制谐音’ button and the adjacent gray status pill beside the result heading. "
    "Retain the hidden result-state target for existing translation status code. Remove implicit click-to-copy from the result textarea, "
    "restoring normal editing and text selection. No other layout, translation, dictionary, pronunciation, cloud-sync, cover, or APK changes.\n"
)

write("index.html", html)
write("app.js", app)
write("sw.js", sw)
write("VERSION.txt", version_file)

for name, expected in protected_hashes.items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(f"Protected asset changed unexpectedly: {name}")
print("PASS: removed only the result-heading copy button, gray status chip, and implicit click-to-copy; updated release/cache identity; protected assets unchanged.")
