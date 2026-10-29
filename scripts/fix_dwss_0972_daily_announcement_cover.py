#!/usr/bin/env python3
"""DWSS 0.9.72: full Android cover, Lubumbashi daily notice, matcha dialog."""
from pathlib import Path
import os
import re
import json

ROOT = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))

def need(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit("Missing required live website asset: " + str(path))
    return path

def bump(text, old, new, label):
    if old in text:
        if text.count(old) != 1:
            raise SystemExit(label + ": expected one old version marker, found " + str(text.count(old)))
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(label + ": neither the old nor new version marker exists")

for name in ("index.html", "app.js", "boot.js", "pwa.js", "sw.js",
             "VERSION.txt", "dictionary.js.gz", "dictionary-overrides.js",
             "shared-lexicon.js", "supabase.min.js", "manifest.webmanifest",
             "icon-192.png", "icon-512.png", "apple-touch-icon.png",
             "favicon-32.png", "cover.webp", "cover.jpg",
             "COPYRIGHT_AND_LICENSE.txt", "_headers"):
    need(name)

# Bump the website/service-worker application release.
vp = need("VERSION.txt")
version = vp.read_text(encoding="utf-8")
if "Version: 0.9.71" in version:
    version = bump(version, "Version: 0.9.71", "Version: 0.9.72", "VERSION.txt")
elif "Version: 0.9.72" not in version:
    raise SystemExit("Expected a live 0.9.71 or already-patched 0.9.72 baseline.")
version = re.sub(r"^Release date: .*$", "Release date: 2026-10-29",
                 version, count=1, flags=re.M)
if "0.9.72:" not in version:
    version += "\n0.9.72: Fix Android cover clipping; show the announcement once per Lubumbashi calendar day in web and Android; use matcha-green announcement surfaces.\n"
vp.write_text(version, encoding="utf-8")

swp = need("sw.js")
sw = swp.read_text(encoding="utf-8")
sw = bump(sw, "const APP_VERSION = '0.9.71';",
          "const APP_VERSION = '0.9.72';", "Service Worker version")
if re.search(r"""(['"])\./dictionary\.js\1""", sw):
    raise SystemExit("Nonexistent plain dictionary.js is still in website precache.")
if not re.search(r"""(['"])\./dictionary\.js\.gz\1""", sw):
    raise SystemExit("Service Worker must precache the published dictionary.js.gz file.")
swp.write_text(sw, encoding="utf-8")

bp = need("boot.js")
boot = bp.read_text(encoding="utf-8")
if "dictionary.js.gz" not in boot:
    raise SystemExit("Website bootstrap no longer references dictionary.js.gz.")
if "|| '0.9.71';" in boot:
    boot = bump(boot, "|| '0.9.71';", "|| '0.9.72';", "bootstrap fallback version")
bp.write_text(boot, encoding="utf-8")

ap = need("app.js")
app = ap.read_text(encoding="utf-8")
app = bump(app, "version:'0.9.71'", "version:'0.9.72'", "application metadata")
ap.write_text(app, encoding="utf-8")

hp = need("index.html")
html = hp.read_text(encoding="utf-8")
for old, new, label in (
    ('content="0.9.71">', 'content="0.9.72">', "HTML release meta"),
    ("DWSS_AUTO_UPDATE_0_9_71", "DWSS_AUTO_UPDATE_0_9_72", "HTML update marker"),
    ("版本 0.9.71 · 刚果金斯语翻译", "版本 0.9.72 · 刚果金斯语翻译", "visible version"),
):
    html = bump(html, old, new, label)

# Keep the complete square cover visible on small Android WebView viewports.
# Switch the flex frame to a block and preserve the source image's 1:1 ratio.
cover_style = r"""
<style id="dwss-cover-daily-v0972">
.cover-frame{
  display:block!important;
  position:relative!important;
  flex:none!important;
  width:min(100%,690px)!important;
  max-width:690px!important;
  aspect-ratio:1/1!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  margin:0 auto 14px!important;
  overflow:hidden!important;
  box-sizing:border-box!important;
}
.cover-frame>.cover-image{
  display:block!important;
  width:100%!important;
  max-width:100%!important;
  height:auto!important;
  max-height:none!important;
  aspect-ratio:1/1!important;
  object-fit:contain!important;
  object-position:center center!important;
  flex:none!important;
  margin:0!important;
}
</style>
"""
if "id=\"dwss-cover-daily-v0972\"" not in html:
    html = html.replace("</head>", cover_style + "\n</head>", 1)
else:
    html = re.sub(r'<style id="dwss-cover-daily-v0972">[\s\S]*?</style>',
                  lambda _: cover_style.strip(), html, count=1)

# Prioritize and decode the complete cover before the lower page content.
img_pattern = r'<img class="cover-image"[^>]*>'
matches = list(re.finditer(img_pattern, html))
if len(matches) != 1:
    raise SystemExit("Expected exactly one official cover image; found " + str(len(matches)))
img = matches[0].group(0)
if 'src="cover.webp"' not in img:
    raise SystemExit("Official cover source is not cover.webp; refusing an unreviewed asset switch.")
img = re.sub(r'\sloading="[^"]*"', '', img)
img = re.sub(r'\sfetchpriority="[^"]*"', '', img)
img = re.sub(r'\sdecoding="[^"]*"', '', img)
img = img[:-1] + ' loading="eager" fetchpriority="high" decoding="sync">'
html = html[:matches[0].start()] + img + html[matches[0].end():]

# Invalidate versioned HTML script URLs so WebView and browsers do not retain v0.9.71 modules.
versioned_count = html.count("dwss-release=0.9.71") + html.count("dwss-release=0.9.72")
if versioned_count < 3:
    raise SystemExit("Expected at least three versioned application script URLs.")
html = html.replace("dwss-release=0.9.71", "dwss-release=0.9.72")

# Update the complete announcement theme without changing font family, size,
# weight, line-height, or any announcement wording.
match = re.search(r'<style id="dwss-announcement-style">[\s\S]*?</style>', html)
if not match:
    raise SystemExit("Announcement style block is missing.")
matcha_style = r"""<style id="dwss-announcement-style">
#dwss-announcement-overlay{position:fixed;inset:0;z-index:100000;background:rgba(12,24,42,.62);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
#dwss-announcement-overlay[hidden]{display:none}
#dwss-announcement-dialog{width:min(620px,100%);max-height:min(86vh,820px);display:flex;flex-direction:column;background:#e0ebcf;color:#24344b;border:1px solid #a9c197;border-radius:20px;box-shadow:0 24px 80px #08182c66;overflow:hidden}
#dwss-announcement-head{padding:20px 22px 13px;background:#e0ebcf;border-bottom:1px solid #c5d6b5}
#dwss-announcement-head h2{margin:0;color:#7e351e;font-size:23px;letter-spacing:2px}
#dwss-announcement-head p{margin:6px 0 0;color:#7a8793;font-size:13px}
#dwss-announcement-body{padding:16px 22px;overflow:auto;overscroll-behavior:contain;background:#e0ebcf;font-size:15px;line-height:1.85}
#dwss-announcement-body section{margin:0 0 14px}
#dwss-announcement-body h3{margin:0 0 5px;color:#8c4a21;font-size:16px}
#dwss-announcement-body p{margin:0}
#dwss-announcement-platform{margin-top:12px;padding:10px 12px;border-radius:12px;background:#cfdfba;color:#285b4b;font-size:13px}
#dwss-announcement-actions{padding:12px 18px 16px;border-top:1px solid #c5d6b5;background:#e0ebcf}
#dwss-announcement-close{width:100%;border:0;border-radius:12px;padding:13px 16px;background:#66885d;color:white;font-size:16px;font-weight:700;cursor:pointer}
@media(max-width:520px){#dwss-announcement-overlay{padding:9px}#dwss-announcement-dialog{max-height:88vh;border-radius:16px}#dwss-announcement-head{padding:17px 17px 11px}#dwss-announcement-body{padding:13px 17px;font-size:14px;line-height:1.8}}
</style>"""
html = html[:match.start()] + matcha_style + html[match.end():]

# Show once per Lubumbashi calendar day per surface. The day is calculated in
# Africa/Lubumbashi regardless of the handset/browser's configured time zone.
controller = r"""<script id="dwss-announcement-controller">
(function(){
 'use strict';
 const overlay=document.getElementById('dwss-announcement-overlay');
 const button=document.getElementById('dwss-announcement-close');
 if(!overlay||!button)return;
 const nativeAndroid=new URLSearchParams(window.location.search).get('dwss-native-app')==='1';
 const platform=nativeAndroid?'android':'web';
 const key='dwss:announcement-last-shown:'+platform;
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
 let lastDate=null;
 try{lastDate=localStorage.getItem(key);}catch(_){}
 let today;
 try{today=lubumbashiDateKey();}catch(_){
   const now=new Date();
   today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 }
 function close(){overlay.hidden=true;}
 button.addEventListener('click',close);
 overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)close();});
 if(lastDate!==today){
   try{localStorage.setItem(key,today);}catch(_){}
   overlay.hidden=false;
 }else{
   overlay.hidden=true;
 }
})();
</script>"""
controller_pattern = r'<script id="dwss-announcement-controller">[\s\S]*?</script>'
html, count = re.subn(controller_pattern, lambda _: controller, html, count=1)
if count != 1:
    raise SystemExit("Could not replace the existing announcement controller exactly once.")

# Force a native WebView top-of-page on first render too; the Android Activity
# performs the same reset after onPageFinished for defense in depth.
native_scroll = r"""<script id="dwss-native-cover-top-v0972">
(function(){
 if(new URLSearchParams(window.location.search).get('dwss-native-app')!=='1')return;
 if('scrollRestoration' in history)history.scrollRestoration='manual';
 function top(){window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;}
 top();
 window.addEventListener('pageshow',top,{once:true});
 window.addEventListener('load',top,{once:true});
})();
</script>"""
if 'id="dwss-native-cover-top-v0972"' not in html:
    html = html.replace("</body>", native_scroll + "\n</body>", 1)

# Ensure image and announcement structures are preserved exactly.
footer = '<span class="ownership-stamp">© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利</span>'
if html.count(footer) != 1:
    raise SystemExit("The approved copyright footer is missing or duplicated.")
for marker in ("dwss-announcement-overlay", "我已阅读，进入应用",
               "一、开发目的", "二、底版词库来源", "三、云端共享词库",
               "四、自动更新与离线使用"):
    if marker not in html:
        raise SystemExit("Announcement section missing: " + marker)
for color in ("#e0ebcf", "#cfdfba", "#66885d"):
    if color not in html:
        raise SystemExit("Matcha announcement surface missing: " + color)
for text_marker in ("Africa/Lubumbashi", "dwss:announcement-last-shown:", "scrollRestoration='manual'"):
    if text_marker not in html:
        raise SystemExit("Required daily/Android behavior missing: " + text_marker)

manifest = json.loads(need("manifest.webmanifest").read_text(encoding="utf-8"))
if manifest.get("id") != "./?app=dwss-kolwezi-swahili" or manifest.get("display") != "standalone":
    raise SystemExit("Existing PWA install identity/display mode must remain unchanged.")

hp.write_text(html, encoding="utf-8")
print("PASS: release advanced to 0.9.72 with a new Service Worker cache.")
print("PASS: Android and web cover image is a full, eager-loaded square, never flex-shrunk.")
print("PASS: native app launch forces scrollY=0; page-level Android scroll restoration is disabled.")
print("PASS: announcement shows once per Lubumbashi calendar day separately on web and Android.")
print("PASS: all announcement card surfaces use matcha green; typography and wording are unchanged.")
