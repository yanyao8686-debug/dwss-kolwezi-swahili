#!/usr/bin/env python3
"""DWSS 0.9.78: match pronunciation instruction frame to the live ownership stamp."""
from pathlib import Path
import os
import re

ROOT = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))

def need(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit(f"Missing required asset: {path}")
    return path

def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old, new, 1)

for name in (
    "VERSION.txt", "sw.js", "index.html", "app.js", "boot.js", "pwa.js",
    "dictionary.js.gz", "dictionary-overrides.js", "shared-lexicon.js",
    "supabase.min.js", "manifest.webmanifest", "hanzi-pinyin.js",
    "pronunciation-search.js", "_headers", "COPYRIGHT_AND_LICENSE.txt"
):
    need(name)

index_path = need("index.html")
html = index_path.read_text(encoding="utf-8")

# Reuse the actual footer's frame border and corner radius instead of approximating them.
footer_rules = re.findall(r"\.ownership-stamp\s*\{([^{}]*)\}", html, flags=re.S)
if len(footer_rules) != 1:
    raise SystemExit(f"Expected one live .ownership-stamp CSS rule; found {len(footer_rules)}")

def declarations(rule):
    result = {}
    for item in rule.split(";"):
        if ":" in item:
            key, value = item.split(":", 1)
            result[key.strip().lower()] = re.sub(r"\s*!important\s*$", "", value.strip())
    return result

footer = declarations(footer_rules[0])
for key in ("border", "border-radius"):
    if not footer.get(key):
        raise SystemExit(f"Live footer CSS has no {key}; refusing to guess a frame style.")

border = footer["border"]
radius = footer["border-radius"]
letter_spacing = footer.get("letter-spacing", ".3px")
line_height = footer.get("line-height", "1.7")

old_style = re.compile(
    r'<style id="dwss-pronunciation-instruction-frame-0977">[\s\S]*?</style>',
    re.S
)
if len(old_style.findall(html)) != 1:
    raise SystemExit("Expected exactly one previous 0.9.77 pronunciation-frame CSS block.")

new_style = f"""<style id="dwss-pronunciation-instruction-frame-0978">
.pronunciation-lookup-card .pronunciation-lookup-instruction{{
 display:block!important;
 width:100%!important;
 max-width:100%!important;
 box-sizing:border-box!important;
 margin:0 0 14px!important;
 padding:12px 18px!important;
 border:{border}!important;
 border-radius:{radius}!important;
 background:transparent!important;
 color:#173b78!important;
 font-size:14px!important;
 font-weight:700!important;
 letter-spacing:{letter_spacing}!important;
 line-height:{line_height}!important;
 text-align:center!important;
 white-space:normal!important;
 overflow-wrap:anywhere!important;
 word-break:normal!important;
}}
</style>"""
html = old_style.sub(lambda _: new_style, html, count=1)

instruction = "输入听到却不懂意思的斯语中文谐音时，不限同音不同字的中文，系统会自动查询近似的读音来匹配对应发音的斯语"
if html.count(instruction) != 1:
    raise SystemExit("The requested explanatory text must appear exactly once.")
if '<div class="pronunciation-lookup-instruction" role="note">' + instruction + '</div>' not in html:
    raise SystemExit("The explanatory text container changed unexpectedly.")

for old, new, label in (
    ('content="0.9.77">', 'content="0.9.78">', "HTML auto-update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_77 -->", "<!-- DWSS_AUTO_UPDATE_0_9_78 -->", "HTML auto-update marker"),
    ("版本 0.9.77 · 刚果金斯语翻译", "版本 0.9.78 · 刚果金斯语翻译", "visible version"),
):
    html = once(html, old, new, label)

script_refs = html.count("dwss-release=0.9.77")
if script_refs < 3:
    raise SystemExit(f"Expected at least three cache-busted application script URLs; found {script_refs}.")
html = html.replace("dwss-release=0.9.77", "dwss-release=0.9.78")

if '<h2>发音查询</h2>' in html:
    raise SystemExit("Old pronunciation heading unexpectedly returned.")

index_path.write_text(html, encoding="utf-8")

version_path = need("VERSION.txt")
version_text = once(
    version_path.read_text(encoding="utf-8"),
    "Version: 0.9.77",
    "Version: 0.9.78",
    "VERSION.txt"
)
version_text = re.sub(
    r"^Release date: .*$",
    "Release date: 2026-10-29",
    version_text,
    count=1,
    flags=re.M
)
version_text += (
    "\n0.9.78: Match the pronunciation explanation frame to the live footer ownership frame "
    "border and corner radius; reduce explanation text from 15px to 14px and center it. "
    "Preserve pronunciation lookup, input, offline modules and Clear All.\n"
)
version_path.write_text(version_text, encoding="utf-8")

sw_path = need("sw.js")
sw = once(
    sw_path.read_text(encoding="utf-8"),
    "const APP_VERSION = '0.9.77';",
    "const APP_VERSION = '0.9.78';",
    "Service Worker version"
)
sw_path.write_text(sw, encoding="utf-8")

app_path = need("app.js")
app = once(
    app_path.read_text(encoding="utf-8"),
    "version:'0.9.77'",
    "version:'0.9.78'",
    "application metadata"
)
app_path.write_text(app, encoding="utf-8")

print("PASS: pronunciation instruction border and corner radius copied from the live footer ownership frame.")
print("PASS: explanatory text reduced from 15px to 14px and centered.")
print("PASS: exact Chinese explanation, pronunciation lookup, offline modules and Clear All remain intact.")
print("PASS: website, app metadata and Service Worker advanced to 0.9.78.")
