#!/usr/bin/env python3
"""DWSS 0.9.88: match pronunciation instruction to reference style and remove its frame."""
from pathlib import Path
import os, re
ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
def need(name):
    p=ROOT/name
    if not p.is_file(): raise SystemExit(f"Missing required asset: {p}")
    return p
def once(s,a,b,label):
    n=s.count(a)
    if n!=1: raise SystemExit(f"{label}: expected one occurrence, found {n}")
    return s.replace(a,b,1)
for name in ("VERSION.txt","sw.js","index.html","app.js","boot.js","pwa.js","dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js","supabase.min.js","manifest.webmanifest","hanzi-pinyin.js","pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(name)
hp=need("index.html"); html=hp.read_text(encoding="utf-8")
target="输入听到却不懂意思的斯语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的斯语"
if html.count(target)!=1: raise SystemExit("Expected exact pronunciation instruction once.")
old=re.compile(r'<style id="dwss-pronunciation-instruction-frame-0978">[\s\S]*?</style>')
if len(old.findall(html))!=1: raise SystemExit("Expected existing framed instruction style exactly once.")
css='''<style id="dwss-pronunciation-instruction-style-0988">
.pronunciation-lookup-card .pronunciation-lookup-instruction{
 display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;
 margin:8px auto 14px!important;padding:0 8px!important;border:none!important;border-width:0!important;
 outline:none!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;
 color:#173b78!important;font-size:clamp(18px,5vw,38px)!important;font-weight:700!important;
 letter-spacing:.3px!important;line-height:1.75!important;text-align:center!important;
 white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;
}
</style>'''
html=old.sub(lambda _:css,html,count=1)
if "dwss-pronunciation-instruction-frame-0978" in html: raise SystemExit("Old frame CSS remains.")
ip=html.find('<input id="pronunciationSearch"'); tp=html.find('<div class="pronunciation-lookup-instruction" role="note">')
if ip<0 or tp<0 or ip>tp: raise SystemExit("Input must remain above instruction.")
for a,b,label in (('content="0.9.87">','content="0.9.88">',"HTML metadata"),("<!-- DWSS_AUTO_UPDATE_0_9_87 -->","<!-- DWSS_AUTO_UPDATE_0_9_88 -->","update marker"),("版本 0.9.87 · 刚果金斯语翻译","版本 0.9.88 · 刚果金斯语翻译","visible version")):
    html=once(html,a,b,label)
if html.count("dwss-release=0.9.87")<3: raise SystemExit("Expected versioned asset URLs.")
html=html.replace("dwss-release=0.9.87","dwss-release=0.9.88")
hp.write_text(html,encoding="utf-8")
ap=need("app.js"); ap.write_text(once(ap.read_text(encoding="utf-8"),"version:'0.9.87'","version:'0.9.88'","app version"),encoding="utf-8")
sp=need("sw.js"); sp.write_text(once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.87';","const APP_VERSION = '0.9.88';","service worker version"),encoding="utf-8")
vp=need("VERSION.txt"); version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.87","Version: 0.9.88","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+="\\n0.9.88: Large responsive bold navy (#173b78) pronunciation instruction (18px–38px); remove its own frame, outline, radius, shadow and background. Input remains above instruction; existing lookup, vocabulary, update countdown and Lubumbashi daily announcement are preserved.\\n"
vp.write_text(version,encoding="utf-8")
print("PASS: exact instruction retained; large responsive navy type; no separate frame; input order preserved; release 0.9.88.")
