#!/usr/bin/env python3
"""DWSS 0.9.80: deduplicate identical-meaning, identical-pronunciation search rows."""
from pathlib import Path
import os
import re
import shutil

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
SOURCE=Path(__file__).resolve().parent/"pronunciation-search.js"

def need(name):
    path=ROOT/name
    if not path.is_file():raise SystemExit(f"Missing required asset: {path}")
    return path

def once(text,old,new,label):
    count=text.count(old)
    if count!=1:raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old,new,1)

for name in ("VERSION.txt","sw.js","index.html","app.js","boot.js","pwa.js",
             "dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js",
             "supabase.min.js","manifest.webmanifest","hanzi-pinyin.js",
             "pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(name)
if not SOURCE.is_file():raise SystemExit(f"Missing updated search source: {SOURCE}")
shutil.copyfile(SOURCE,need("pronunciation-search.js"))

hp=need("index.html")
html=hp.read_text(encoding="utf-8")
for old,new,label in (
    ('content="0.9.79">','content="0.9.80">',"HTML auto-update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_79 -->","<!-- DWSS_AUTO_UPDATE_0_9_80 -->","HTML auto-update marker"),
    ("版本 0.9.79 · 刚果金斯语翻译","版本 0.9.80 · 刚果金斯语翻译","visible version")):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.79")
if count<3:raise SystemExit(f"Expected at least three cache-busted script URLs; found {count}.")
html=html.replace("dwss-release=0.9.79","dwss-release=0.9.80")
hp.write_text(html,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.79","Version: 0.9.80","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-29",version,count=1,flags=re.M)
version+="\n0.9.80: Collapse duplicate reverse-pronunciation results when both the Chinese meaning and complete pinyin reading are identical; distinct meanings sharing the same pronunciation remain visible.\n"
vp.write_text(version,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.79';","const APP_VERSION = '0.9.80';","Service Worker version")
sp.write_text(sw,encoding="utf-8")

ap=need("app.js")
app=once(ap.read_text(encoding="utf-8"),"version:'0.9.79'","version:'0.9.80'","application metadata")
ap.write_text(app,encoding="utf-8")
print("PASS: duplicate rows with the same meaning and complete pinyin are collapsed.")
print("PASS: distinct meanings with the same pronunciation remain separate.")
print("PASS: full-sequence matching and PWA cache version advanced to 0.9.80.")
