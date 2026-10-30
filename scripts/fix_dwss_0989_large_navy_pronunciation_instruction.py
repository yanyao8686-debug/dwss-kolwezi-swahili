#!/usr/bin/env python3
"""DWSS 0.9.89: enlarge the pronunciation instruction to match the user's reference."""
from pathlib import Path
import os, re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
def need(name):
    p=ROOT/name
    if not p.is_file(): raise SystemExit(f"Missing required release asset: {p}")
    return p
def once(s,a,b,label):
    n=s.count(a)
    if n!=1: raise SystemExit(f"{label}: expected exactly one occurrence, found {n}")
    return s.replace(a,b,1)

for name in ("VERSION.txt","sw.js","index.html","app.js","boot.js","pwa.js",
             "dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js",
             "supabase.min.js","manifest.webmanifest","hanzi-pinyin.js",
             "pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(name)

hp=need("index.html")
html=hp.read_text(encoding="utf-8")
instruction="输入听到却不懂意思的斯语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的斯语"
if html.count(instruction)!=1:
    raise SystemExit("Expected the current pronunciation instruction exactly once.")
if '<div class="pronunciation-lookup-instruction" role="note">'+instruction+'</div>' not in html:
    raise SystemExit("Pronunciation instruction DOM changed unexpectedly.")

pattern=r'<style id="dwss-pronunciation-instruction-frame-0988">([\s\S]*?)</style>'
matches=list(re.finditer(pattern,html))
if len(matches)!=1:
    raise SystemExit(f"Expected exactly one 0.9.88 instruction style block; found {len(matches)}")

new_style='''<style id="dwss-pronunciation-instruction-style-0989">
.pronunciation-lookup-card .pronunciation-lookup-instruction{
 display:block!important;
 width:100%!important;
 max-width:100%!important;
 box-sizing:border-box!important;
 margin:8px auto 14px!important;
 padding:0 8px!important;
 border:none!important;
 border-width:0!important;
 outline:none!important;
 border-radius:0!important;
 box-shadow:none!important;
 background:transparent!important;
 color:#173b78!important;
 font-size:clamp(18px,5vw,38px)!important;
 font-weight:700!important;
 letter-spacing:.3px!important;
 line-height:1.75!important;
 text-align:center!important;
 white-space:normal!important;
 overflow-wrap:anywhere!important;
 word-break:normal!important;
}
</style>'''
html=html[:matches[0].start()]+new_style+html[matches[0].end():]
if "dwss-pronunciation-instruction-frame-0988" in html:
    raise SystemExit("Old instruction frame style remains.")
input_pos=html.find('<input id="pronunciationSearch"')
instruction_pos=html.find('<div class="pronunciation-lookup-instruction" role="note">')
if input_pos<0 or instruction_pos<0 or input_pos>instruction_pos:
    raise SystemExit("Pronunciation input must remain above the instruction.")

for old,new,label in (
    ('content="0.9.88">','content="0.9.89">',"HTML update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_88 -->","<!-- DWSS_AUTO_UPDATE_0_9_89 -->","HTML update marker"),
    ("版本 0.9.88 · 刚果金斯语翻译","版本 0.9.89 · 刚果金斯语翻译","visible version")
):
    html=once(html,old,new,label)
if html.count("dwss-release=0.9.88")<3:
    raise SystemExit("Expected at least three versioned resource URLs.")
html=html.replace("dwss-release=0.9.88","dwss-release=0.9.89")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
ap.write_text(once(ap.read_text(encoding="utf-8"),"version:'0.9.88'","version:'0.9.89'","application metadata"),encoding="utf-8")
sp=need("sw.js")
sp.write_text(once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.88';","const APP_VERSION = '0.9.89';","Service Worker version"),encoding="utf-8")
vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.88","Version: 0.9.89","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+=(
    "\n0.9.89: Match the reference image with large bold deep-navy (#173b78) responsive instruction text "
    "using clamp(18px,5vw,38px); remove its own border, outline, rounded frame, shadow and background. "
    "Keep the pronunciation input above the text and preserve lookup, vocabulary, update countdown, "
    "Lubumbashi daily announcement, offline assets and all other page components.\n"
)
vp.write_text(version,encoding="utf-8")
print("PASS: instruction is large, bold, centered, deep navy (#173b78), responsive 18px–38px and frameless.")
print("PASS: input remains above the instruction; existing functionality and other page components are preserved.")
print("PASS: website, app and Service Worker metadata advanced to 0.9.89.")
