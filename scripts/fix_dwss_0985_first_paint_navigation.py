#!/usr/bin/env python3
"""DWSS 0.9.85: prevent the uninitialized navigation placeholder from distorting the first paint."""
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

# The fourth item is only a temporary placeholder. It must already be styled
# before boot.js decompresses the dictionary and moves the real clear button.
old_slot='<button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button>'
new_slot='<button class="nav-clear-slot" type="button" disabled aria-label="清空信息" aria-disabled="true">清空信息</button>'
html=once(html,old_slot,new_slot,"initial navigation placeholder")

startup_css=r"""<style id="dwss-startup-navigation-0985">
/* First paint: the temporary clear slot must reserve exactly the same box as the real button. */
nav.tabs{
 display:grid!important;
 grid-template-columns:repeat(4,minmax(0,1fr))!important;
 grid-auto-rows:52px!important;
 align-items:stretch!important;
}
nav.tabs>.tab,
nav.tabs>.nav-clear-slot,
nav.tabs>.nav-clear-action{
 box-sizing:border-box!important;
 display:flex!important;
 flex-direction:row!important;
 align-items:center!important;
 justify-content:center!important;
 width:100%!important;
 min-width:0!important;
 height:52px!important;
 min-height:52px!important;
 max-height:52px!important;
 padding:8px 3px!important;
 line-height:1.15!important;
 white-space:nowrap!important;
 word-break:keep-all!important;
 overflow-wrap:normal!important;
 writing-mode:horizontal-tb!important;
 text-orientation:mixed!important;
 overflow:hidden!important;
 flex:none!important;
}
nav.tabs>.nav-clear-slot{
 border:1px solid #e1e7ed!important;
 border-radius:15px!important;
 background:linear-gradient(145deg,#f4f6f8,#e9eef3)!important;
 color:#425a73!important;
 font-size:clamp(13px,3.1vw,16px)!important;
 font-weight:700!important;
 box-shadow:0 2px 5px rgba(29,55,81,.045)!important;
 opacity:1!important;
 cursor:wait!important;
}
nav.tabs>.nav-clear-slot:disabled{
 opacity:1!important;
 filter:none!important;
}
@media(max-width:520px){
 nav.tabs{grid-auto-rows:48px!important}
 nav.tabs>.tab,
 nav.tabs>.nav-clear-slot,
 nav.tabs>.nav-clear-action{
   height:48px!important;
   min-height:48px!important;
   max-height:48px!important;
   padding:7px 2px!important;
 }
}
</style>"""
if 'id="dwss-startup-navigation-0985"' in html:
    raise SystemExit("0.9.85 startup-navigation style is already present.")
if "</head>" not in html:
    raise SystemExit("HTML head closing tag missing.")
html=html.replace("</head>",startup_css+"\n</head>",1)

# The boot loader has not run yet at first paint. Label both status pills
# honestly until pwa.js performs the real connectivity and update checks.
html=once(
    html,
    '<span class="offline" id="networkBadge">检查状态…</span>',
    '<span class="offline" id="networkBadge">● 正在检查网络…</span>',
    "initial network status"
)
html=once(
    html,
    '<span class="chip pwa-state-ok" id="pwaState" role="status" aria-live="polite" title="应用启动、恢复联网或回到前台时会自动检查新版">自动更新已开启</span>',
    '<span class="chip pwa-state-warn" id="pwaState" role="status" aria-live="polite" title="正在初始化自动更新服务">正在检查更新…</span>',
    "initial update status"
)

for old,new,label in (
    ('content="0.9.84">','content="0.9.85">',"HTML auto-update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_84 -->","<!-- DWSS_AUTO_UPDATE_0_9_85 -->","HTML update marker"),
    ("版本 0.9.84 · 刚果金斯语翻译","版本 0.9.85 · 刚果金斯语翻译","visible release version")
):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.84")
if count<3:
    raise SystemExit(f"Expected at least three cache-busted script URLs; found {count}.")
html=html.replace("dwss-release=0.9.84","dwss-release=0.9.85")

# Do not change any translation, pronunciation, dictionary, or form behavior.
if "clearSlot.replaceWith(clearButton)" not in html:
    raise SystemExit("Existing clear-button initialization hook missing.")
if "newVariantNote" in html or "听到的地区或场景" in html:
    raise SystemExit("Previously cleaned add-word form regressed.")
for required in (
    'id="pronunciationSearch"',
    'id="pronunciation-lookup-card"',
    'id="dwss-announcement-controller"',
    "timeZone:'Africa/Lubumbashi'"
):
    if required not in html:
        raise SystemExit("Existing feature missing: "+required)

hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=once(ap.read_text(encoding="utf-8"),"version:'0.9.84'","version:'0.9.85'","application metadata")
ap.write_text(app,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.84","Version: 0.9.85","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+=(
    "\n0.9.85: Fix first-paint navigation layout by styling the temporary clear button "
    "slot before JavaScript initialization; hold the mobile navigation row to a stable "
    "48px height; disable the placeholder until the functional clear button is moved "
    "into place. Show truthful network/update-checking states until pwa.js completes "
    "initialization. Preserve all translation, pronunciation lookup and daily notice behavior.\n"
)
vp.write_text(version,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.84';","const APP_VERSION = '0.9.85';","Service Worker version")
sp.write_text(sw,encoding="utf-8")

print("PASS: temporary clear slot has the correct first-paint style and fixed row height.")
print("PASS: placeholder is disabled until the real Clear button is moved into the nav.")
print("PASS: initial status labels now say that network/update checks are in progress.")
print("PASS: existing clear-button wiring, translation, pronunciation and announcement remain intact.")
print("PASS: release metadata and Service Worker cache advanced to 0.9.85.")
