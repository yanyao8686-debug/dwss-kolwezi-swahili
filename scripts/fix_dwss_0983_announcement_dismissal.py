#!/usr/bin/env python3
"""DWSS 0.9.83: keep the announcement open until the user explicitly confirms it."""
from pathlib import Path
import os
import re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))

def need(name):
    path=ROOT/name
    if not path.is_file():
        raise SystemExit(f"Missing required asset: {path}")
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

# Verify the clean form from 0.9.82 before preserving it in this release.
hp=need("index.html")
html=hp.read_text(encoding="utf-8")
for forbidden in ("newVariantNote","听到的地区或场景",
                  "若这个中文意思已经收录","新变体先待确认"):
    if forbidden in html:
        raise SystemExit(f"0.9.82 clean add-word form regressed: {forbidden}")
if '<input id="newZh"' not in html or '<input id="newReading"' not in html or '<input id="newFrenchReadingZh"' not in html:
    raise SystemExit("One of the three intended add-word inputs is missing.")

# The previous controller wrote last-shown state as soon as the dialog opened.
# An automatic PWA reload then interpreted that write as a user dismissal.
old_pattern=r'<script id="dwss-announcement-controller">[\s\S]*?</script>'
if len(re.findall(old_pattern,html))!=1:
    raise SystemExit("Expected exactly one announcement controller.")

controller=r"""<script id="dwss-announcement-controller">
(function(){
 'use strict';
 const overlay=document.getElementById('dwss-announcement-overlay');
 const button=document.getElementById('dwss-announcement-close');
 if(!overlay||!button)return;
 const nativeAndroid=new URLSearchParams(window.location.search).get('dwss-native-app')==='1';
 const platform=nativeAndroid?'android':'web';
 const dismissedKey='dwss:announcement-dismissed-date:'+platform;
 const obsoleteShownKey='dwss:announcement-last-shown:'+platform;

 function lubumbashiDateKey(){
   const parts=new Intl.DateTimeFormat('en-GB',{
     timeZone:'Africa/Lubumbashi',
     year:'numeric',month:'2-digit',day:'2-digit'
   }).formatToParts(new Date());
   const values={};
   for(const part of parts)values[part.type]=part.value;
   if(!values.year||!values.month||!values.day)throw new Error('Lubumbashi local date unavailable');
   return values.year+'-'+values.month+'-'+values.day;
 }
 function todayKey(){
   try{return lubumbashiDateKey();}
   catch(_){
     const now=new Date();
     return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
   }
 }

 // The old "last-shown" value was written on display, not on dismissal.
 // It cannot prove the user closed the dialog, so discard it during migration.
 try{localStorage.removeItem(obsoleteShownKey);}catch(_){}

 let dismissedDate=null;
 try{dismissedDate=localStorage.getItem(dismissedKey);}catch(_){}

 // Never mark the announcement as seen merely because it was displayed.
 // It remains visible through page reloads/automatic PWA updates until the
 // explicit confirmation button is pressed.
 overlay.hidden=(dismissedDate===todayKey());

 button.addEventListener('click',function(){
   try{localStorage.setItem(dismissedKey,todayKey());}catch(_){}
   overlay.hidden=true;
 });
 // Deliberately do not dismiss on backdrop taps, Escape, timers, or page reload.
})();
</script>"""

html,n=re.subn(old_pattern,lambda _:controller,html,count=1)
if n!=1:
    raise SystemExit("Could not replace the announcement controller.")

for old,new,label in (
    ('content="0.9.82">','content="0.9.83">',"HTML update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_82 -->","<!-- DWSS_AUTO_UPDATE_0_9_83 -->","HTML update marker"),
    ("版本 0.9.82 · 刚果金斯语翻译","版本 0.9.83 · 刚果金斯语翻译","visible version")
):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.82")
if count<3:
    raise SystemExit(f"Expected at least three versioned asset URLs; found {count}.")
html=html.replace("dwss-release=0.9.82","dwss-release=0.9.83")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=ap.read_text(encoding="utf-8")
app=once(app,"version:'0.9.82'","version:'0.9.83'","application metadata")
if "newVariantNote" in app:
    raise SystemExit("Removed region/context input is still referenced by JavaScript.")
ap.write_text(app,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.82","Version: 0.9.83","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += (
    "\n0.9.83: Fix announcement auto-dismissal. Store the daily dismissal date only "
    "after the explicit '我已阅读，进入应用' button is clicked; ignore and remove the "
    "old last-shown marker that was written merely on display. Automatic updates, reloads, "
    "backdrop taps and Escape no longer silently dismiss the notice. Preserve the clean 0.9.82 form.\n"
)
vp.write_text(version,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.82';","const APP_VERSION = '0.9.83';","Service Worker version")
sp.write_text(sw,encoding="utf-8")

print("PASS: announcement is not marked dismissed when displayed.")
print("PASS: only the explicit confirmation button stores the per-day dismissal.")
print("PASS: old last-shown values are discarded because they may be false dismissals.")
print("PASS: reloads, auto-updates, backdrop clicks, Escape and timers cannot dismiss the notice.")
print("PASS: clean add-word form from 0.9.82 is preserved.")
print("PASS: app, page, version and Service Worker advanced to 0.9.83.")
