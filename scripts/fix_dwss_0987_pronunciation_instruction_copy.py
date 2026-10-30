#!/usr/bin/env python3
"""DWSS 0.9.87: update the pronunciation lookup instruction copy only."""
from pathlib import Path
import os
import re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))

def need(name):
    path=ROOT/name
    if not path.is_file():
        raise SystemExit(f"Missing required release asset: {path}")
    return path

def once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old,new,1)

for name in (
    "VERSION.txt","sw.js","index.html","app.js","boot.js","pwa.js",
    "dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js",
    "supabase.min.js","manifest.webmanifest","hanzi-pinyin.js",
    "pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"
):
    need(name)

old_text="输入听到却不懂意思的斯语中文谐音时，不限同音不同字的中文，系统会自动查询近似的读音来匹配对应发音的斯语"
new_text="输入听到却不懂意思的斯语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的斯语"

hp=need("index.html")
html=hp.read_text(encoding="utf-8")
html=once(html,old_text,new_text,"pronunciation instruction copy")

# Preserve the existing field-before-instruction order and responsive card styles.
input_pos=html.find('<input id="pronunciationSearch"')
instruction_pos=html.find('<div class="pronunciation-lookup-instruction" role="note">')
if input_pos<0 or instruction_pos<0 or input_pos>instruction_pos:
    raise SystemExit("Pronunciation input must remain above its instruction.")
if html.count('class="pronunciation-lookup-instruction"')!=1:
    raise SystemExit("Expected one pronunciation instruction element.")

css=html.find('.pronunciation-lookup-card .pronunciation-lookup-instruction{')
if css<0:
    raise SystemExit("Existing responsive pronunciation instruction style missing.")
css_end=html.find('}',css)
css_rule=html[css:css_end+1]
for declaration in ("white-space:normal","overflow-wrap:anywhere","word-break:normal"):
    if declaration not in css_rule:
        raise SystemExit(f"Responsive text wrapping rule missing: {declaration}")

for old,new,label in (
    ('content="0.9.86">','content="0.9.87">',"HTML update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_86 -->","<!-- DWSS_AUTO_UPDATE_0_9_87 -->","HTML update marker"),
    ("版本 0.9.86 · 刚果金斯语翻译","版本 0.9.87 · 刚果金斯语翻译","visible version")
):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.86")
if count<3:
    raise SystemExit(f"Expected at least three versioned resource URLs; found {count}.")
html=html.replace("dwss-release=0.9.86","dwss-release=0.9.87")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=once(ap.read_text(encoding="utf-8"),"version:'0.9.86'","version:'0.9.87'","application metadata")
ap.write_text(app,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),
        "const APP_VERSION = '0.9.86';",
        "const APP_VERSION = '0.9.87';",
        "Service Worker version")
sp.write_text(sw,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.86","Version: 0.9.87","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+=(
    "\n0.9.87: Change only the pronunciation lookup instruction wording to the user's "
    "requested sentence using '即便是同音不同字的中文'. Preserve the input position, "
    "card styling, responsive wrapping, pronunciation search engine, vocabulary, "
    "automatic-update countdown and Lubumbashi daily announcement.\n"
)
vp.write_text(version,encoding="utf-8")

print("PASS: instruction copy replaced exactly once with the user's exact wording.")
print("PASS: input remains above instruction and mobile line wrapping styles remain intact.")
print("PASS: pronunciation search, automatic-update countdown, announcement and vocabulary assets are unchanged.")
print("PASS: website, app and Service Worker metadata advanced to 0.9.87.")
