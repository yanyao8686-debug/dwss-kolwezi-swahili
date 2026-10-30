#!/usr/bin/env python3
"""DWSS 0.9.81: refresh installed PWA cache and lock in the compact add-word form."""
from pathlib import Path
from html.parser import HTMLParser
import os, re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))

def need(name):
    p=ROOT/name
    if not p.is_file(): raise SystemExit(f"Missing required asset: {p}")
    return p

def once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise SystemExit(f"{label}: expected exactly one occurrence, found {n}")
    return text.replace(old,new,1)

for name in ("VERSION.txt","sw.js","index.html","app.js","boot.js","pwa.js",
             "dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js",
             "supabase.min.js","manifest.webmanifest","hanzi-pinyin.js",
             "pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(name)

index_path=need("index.html")
html=index_path.read_text(encoding="utf-8")
app_path=need("app.js")
app=app_path.read_text(encoding="utf-8")

class CompactFormAudit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth=0
        self.active=False
        self.inputs=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=="div":
            classes=attrs.get("class","").split()
            if not self.active and "compact-add-form" in classes:
                self.active=True
                self.depth=1
            elif self.active:
                self.depth+=1
        if self.active and tag=="input" and attrs.get("id"):
            self.inputs.append(attrs["id"])
    def handle_endtag(self,tag):
        if self.active and tag=="div":
            self.depth-=1
            if self.depth==0:
                self.active=False

audit=CompactFormAudit()
audit.feed(html)
expected=["newZh","newReading","newFrenchReadingZh"]
if audit.inputs!=expected:
    raise SystemExit("The compact add-word form must contain exactly Chinese meaning, local pronunciation, and French pronunciation inputs; found: "+repr(audit.inputs))

# These are the exact visible items circled by the user. They must not be present
# in the shipped page or executable UI code.
removed_phrases=(
    "若这个中文意思已经收录",
    "保存时会询问是否新增读法变体",
    "不会覆盖原读音",
    "新变体先待确认",
    "听到的地区或场景",
    "科卢韦齐市区常见说法"
)
for phrase in removed_phrases:
    if phrase in html or phrase in app:
        raise SystemExit("A red-circled legacy notice/context field remains in the application: "+phrase)

for old,new,label in (
    ('content="0.9.80">','content="0.9.81">',"HTML auto-update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_80 -->","<!-- DWSS_AUTO_UPDATE_0_9_81 -->","HTML auto-update marker"),
    ("版本 0.9.80 · 刚果金斯语翻译","版本 0.9.81 · 刚果金斯语翻译","visible version")
):
    html=once(html,old,new,label)

script_count=html.count("dwss-release=0.9.80")
if script_count<3:
    raise SystemExit(f"Expected at least three versioned script URLs; found {script_count}.")
html=html.replace("dwss-release=0.9.80","dwss-release=0.9.81")
index_path.write_text(html,encoding="utf-8")

version_path=need("VERSION.txt")
version=once(version_path.read_text(encoding="utf-8"),
              "Version: 0.9.80","Version: 0.9.81","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+="\n0.9.81: Refresh installed PWA assets and retain the compact add-word form without the redundant new-reading notice or optional region/context field. No dictionary or save behavior changed.\n"
version_path.write_text(version,encoding="utf-8")

sw_path=need("sw.js")
sw=once(sw_path.read_text(encoding="utf-8"),
        "const APP_VERSION = '0.9.80';",
        "const APP_VERSION = '0.9.81';",
        "Service Worker version")
sw_path.write_text(sw,encoding="utf-8")

app=once(app,"version:'0.9.80'","version:'0.9.81'","application metadata")
app_path.write_text(app,encoding="utf-8")

print("PASS: the add-word form contains only its three intended inputs.")
print("PASS: the red-circled explanatory notice and region/context field are absent from HTML and app code.")
print("PASS: PWA cache, visible version and app metadata advanced to 0.9.81.")
