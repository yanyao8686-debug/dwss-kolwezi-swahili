#!/usr/bin/env python3
"""DWSS 0.9.88: keep the pronunciation instruction typography and remove its frame."""
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

hp=need("index.html")
html=hp.read_text(encoding="utf-8")

instruction="输入听到却不懂意思的斯语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的斯语"
if html.count(instruction)!=1:
    raise SystemExit("Expected the current pronunciation instruction sentence exactly once.")
if '<div class="pronunciation-lookup-instruction" role="note">'+instruction+'</div>' not in html:
    raise SystemExit("The pronunciation instruction DOM element changed unexpectedly.")

style_pattern=r'<style id="dwss-pronunciation-instruction-frame-0978">([\s\S]*?)</style>'
matches=list(re.finditer(style_pattern,html))
if len(matches)!=1:
    raise SystemExit(f"Expected exactly one instruction style block; found {len(matches)}")
style=matches[0].group(1)

# Keep the reference image's actual typography; remove only the visible frame.
style=once(style,
           "border:1px solid #b7c8bf!important;",
           "border:0!important;",
           "instruction border")
style=once(style,
           "border-radius:18px!important;",
           "border-radius:0!important;",
           "instruction corner frame")
style=once(style,
           "color:#173b78!important;",
           "color:#173b78!important;",
           "instruction font color")
style=once(style,
           "font-size:14px!important;",
           "font-size:14px!important;",
           "instruction font size")

if "font-weight:700!important;" not in style:
    raise SystemExit("Reference font weight unexpectedly changed.")
if "text-align:center!important;" not in style:
    raise SystemExit("Reference text alignment unexpectedly changed.")
if "padding:12px 18px!important;" not in style:
    raise SystemExit("Instruction spacing unexpectedly changed.")

new_style='<style id="dwss-pronunciation-instruction-frame-0988">'+style+'</style>'
html=html[:matches[0].start()]+new_style+html[matches[0].end():]

# Preserve the input-before-instruction layout.
input_pos=html.find('<input id="pronunciationSearch"')
instruction_pos=html.find('<div class="pronunciation-lookup-instruction" role="note">')
if input_pos<0 or instruction_pos<0 or input_pos>instruction_pos:
    raise SystemExit("Pronunciation input must remain above its instruction.")

for old,new,label in (
    ('content="0.9.87">','content="0.9.88">',"HTML update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_87 -->","<!-- DWSS_AUTO_UPDATE_0_9_88 -->","HTML update marker"),
    ("版本 0.9.87 · 刚果金斯语翻译","版本 0.9.88 · 刚果金斯语翻译","visible version")
):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.87")
if count<3:
    raise SystemExit(f"Expected at least three versioned resource URLs; found {count}.")
html=html.replace("dwss-release=0.9.87","dwss-release=0.9.88")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=once(ap.read_text(encoding="utf-8"),"version:'0.9.87'","version:'0.9.88'","application metadata")
ap.write_text(app,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),
        "const APP_VERSION = '0.9.87';",
        "const APP_VERSION = '0.9.88';",
        "Service Worker version")
sp.write_text(sw,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.87","Version: 0.9.88","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+=(
    "\n0.9.88: Keep the pronunciation instruction text at #173b78, 14px, bold and centered, "
    "matching the supplied reference; remove only its green border and rounded frame. "
    "Preserve sentence wording, input order, spacing, pronunciation lookup, PWA update lifecycle, "
    "Lubumbashi daily announcement, vocabulary and all other components.\n"
)
vp.write_text(version,encoding="utf-8")

print("PASS: target instruction remains #173b78 and 14px, bold and centered.")
print("PASS: the instruction's green border and rounded frame are removed.")
print("PASS: input stays above the instruction; text content and all other page components remain.")
print("PASS: app and Service Worker metadata advanced to 0.9.88.")
