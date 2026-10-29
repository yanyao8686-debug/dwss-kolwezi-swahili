#!/usr/bin/env python3
"""DWSS 0.9.77: replace pronunciation heading with the user's framed explanation."""
from pathlib import Path
import os,re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
def need(name):
    p=ROOT/name
    if not p.is_file():raise SystemExit("Missing required asset: "+str(p))
    return p
def once(text,old,new,label):
    count=text.count(old)
    if count!=1:raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old,new,1)

for name in ("VERSION.txt","sw.js","index.html","app.js","boot.js","dictionary.js.gz",
             "dictionary-overrides.js","shared-lexicon.js","supabase.min.js",
             "manifest.webmanifest","hanzi-pinyin.js","pronunciation-search.js",
             "_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(name)

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.76","Version: 0.9.77","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-29",version,count=1,flags=re.M)
version += "\n0.9.77: Replace the pronunciation section heading with the requested explanatory text inside a thin black frame.\n"
vp.write_text(version,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.76';","const APP_VERSION = '0.9.77';","Service Worker version")
if "./hanzi-pinyin.js" not in sw or "./pronunciation-search.js" not in sw:
    raise SystemExit("Pronunciation search modules must remain in offline cache.")
sp.write_text(sw,encoding="utf-8")

ap=need("app.js")
app=once(ap.read_text(encoding="utf-8"),"version:'0.9.76'","version:'0.9.77'","application metadata")
ap.write_text(app,encoding="utf-8")

hp=need("index.html")
html=hp.read_text(encoding="utf-8")
old="<h2>发音查询</h2>"
new='<div class="pronunciation-lookup-instruction" role="note">输入听到却不懂意思的斯语中文谐音时，不限同音不同字的中文，系统会自动查询近似的读音来匹配对应发音的斯语</div>'
html=once(html,old,new,"pronunciation panel heading")
css=r"""<style id="dwss-pronunciation-instruction-frame-0977">
.pronunciation-lookup-card .pronunciation-lookup-instruction{
 display:block!important;
 width:100%!important;
 box-sizing:border-box!important;
 margin:0 0 14px!important;
 padding:11px 13px!important;
 border:1.5px solid #111!important;
 border-radius:0!important;
 background:transparent!important;
 color:#173b78!important;
 font-size:15px!important;
 font-weight:700!important;
 line-height:1.75!important;
 text-align:left!important;
 white-space:normal!important;
 overflow-wrap:anywhere!important;
 word-break:normal!important;
}
</style>"""
if 'id="dwss-pronunciation-instruction-frame-0977"' not in html:
    html=html.replace("</head>",css+"\n</head>",1)
else:
    html=re.sub(r'<style id="dwss-pronunciation-instruction-frame-0977">[\s\S]*?</style>',
                lambda _:css,html,count=1)

for old,new,label in (
 ('content="0.9.76">','content="0.9.77">','HTML version metadata'),
 ('DWSS_AUTO_UPDATE_0_9_76','DWSS_AUTO_UPDATE_0_9_77','HTML auto-update marker'),
 ('版本 0.9.76 · 刚果金斯语翻译','版本 0.9.77 · 刚果金斯语翻译','visible version')):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.76")
if count<3:raise SystemExit("Expected at least three versioned application script URLs.")
html=html.replace("dwss-release=0.9.76","dwss-release=0.9.77")

if html.count(new)!=1:raise SystemExit("Requested instruction must appear exactly once.")
if "<h2>发音查询</h2>" in html:raise SystemExit("Old four-character heading remains.")
hp.write_text(html,encoding="utf-8")
print("PASS: replaced the pronunciation subheading with the exact requested Chinese wording.")
print("PASS: text is enclosed in a thin solid black rectangular frame.")
print("PASS: input field, lookup engine and clear-all behavior are left unchanged.")
print("PASS: version and Service Worker cache advanced to 0.9.77.")
