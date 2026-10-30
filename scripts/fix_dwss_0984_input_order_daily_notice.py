#!/usr/bin/env python3
"""DWSS 0.9.84: move reverse-lookup input above its explanation and enforce daily Lubumbashi notice."""
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

hp=need("index.html")
html=hp.read_text(encoding="utf-8")

# Put the input first so the user's primary action is visible before the help text.
pattern=(
    r'(?P<instruction><div class="pronunciation-lookup-instruction" role="note">[\s\S]*?</div>)'
    r'\s*(?P<input><input id="pronunciationSearch"[^>]*>)'
)
matches=list(re.finditer(pattern,html))
if len(matches)!=1:
    raise SystemExit(f"Expected one pronunciation input/instruction pair; found {len(matches)}")
match=matches[0]
html=html[:match.start()]+match.group("input")+"\n  "+match.group("instruction")+html[match.end():]

# Keep the announcement open until explicit acknowledgement. It is shown on
# the first app opening of each Africa/Lubumbashi calendar date. If the app
# remains in the background across midnight, it is shown on the first resume.
controller_pattern=r'<script id="dwss-announcement-controller">[\s\S]*?</script>'
if len(re.findall(controller_pattern,html))!=1:
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
     // Lubumbashi is UTC+02:00 and does not use daylight-saving changes.
     // Do not fall back to the phone's possibly unrelated configured zone.
     const local=new Date(Date.now()+2*60*60*1000);
     return local.getUTCFullYear()+'-'+String(local.getUTCMonth()+1).padStart(2,'0')+'-'+String(local.getUTCDate()).padStart(2,'0');
   }
 }
 function getDismissedDate(){
   try{return localStorage.getItem(dismissedKey);}catch(_){return null;}
 }
 function refreshForLocalDay(){
   // Displaying is not a dismissal. Only the explicit button records today's date.
   if(getDismissedDate()!==todayKey())overlay.hidden=false;
 }
 // Old last-shown markers were written merely by displaying the notice, so
 // they are not reliable evidence that the user read and closed it.
 try{localStorage.removeItem(obsoleteShownKey);}catch(_){}
 refreshForLocalDay();

 button.addEventListener('click',function(){
   try{localStorage.setItem(dismissedKey,todayKey());}catch(_){}
   overlay.hidden=true;
 });
 // Re-check on every app/page return. A date change while the app was in the
 // background must trigger the new day's notice when the user opens it again.
 window.addEventListener('pageshow',refreshForLocalDay);
 window.addEventListener('focus',refreshForLocalDay);
 document.addEventListener('visibilitychange',function(){
   if(document.visibilityState==='visible')refreshForLocalDay();
 });
 // No timer, backdrop click or Escape handler closes the announcement.
})();
</script>"""
html,n=re.subn(controller_pattern,lambda _:controller,html,count=1)
if n!=1:
    raise SystemExit("Could not replace the announcement controller.")

for marker in ("id=\"dwss-announcement-overlay\"","id=\"dwss-announcement-close\"",
               "Africa/Lubumbashi","dwss:announcement-dismissed-date:",
               "visibilitychange","pageshow","focus"):
    if marker not in html:
        raise SystemExit("Required announcement behavior missing: "+marker)
if "newVariantNote" in html or "听到的地区或场景" in html:
    raise SystemExit("The clean 0.9.82 add-word form regressed.")

for old,new,label in (
    ('content="0.9.83">','content="0.9.84">',"HTML auto-update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_83 -->","<!-- DWSS_AUTO_UPDATE_0_9_84 -->","HTML update marker"),
    ("版本 0.9.83 · 刚果金斯语翻译","版本 0.9.84 · 刚果金斯语翻译","visible version")
):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.83")
if count<3:
    raise SystemExit(f"Expected at least three versioned application asset URLs; found {count}.")
html=html.replace("dwss-release=0.9.83","dwss-release=0.9.84")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=once(ap.read_text(encoding="utf-8"),"version:'0.9.83'","version:'0.9.84'","application metadata")
ap.write_text(app,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.83","Version: 0.9.84","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+=(
    "\n0.9.84: Move the pronunciation reverse-lookup input above its instruction text. "
    "Announcement is shown on the first app opening of each Africa/Lubumbashi calendar day "
    "until explicit confirmation; re-check the local date on page show, focus and foreground "
    "resume so a new local day is handled when returning from background. UTC+02:00 fallback "
    "is independent of the handset time zone. Preserve clean add-word form and lookup behavior.\n"
)
vp.write_text(version,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.83';","const APP_VERSION = '0.9.84';","Service Worker version")
sp.write_text(sw,encoding="utf-8")

print("PASS: pronunciation input is now above the explanatory frame.")
print("PASS: daily announcement follows Africa/Lubumbashi local date.")
print("PASS: first open per local date displays until explicit confirmation.")
print("PASS: returning to foreground after local midnight re-checks and displays the new day's notice.")
print("PASS: time-zone fallback is fixed to UTC+02:00 rather than the phone's arbitrary local zone.")
print("PASS: clean form, search modules and offline assets are preserved; release is 0.9.84.")
