from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public")
index_path = root / "index.html"
sw_path = root / "sw.js"
version_path = root / "VERSION.txt"

for p in (index_path, sw_path, version_path):
    if not p.is_file():
        raise SystemExit(f"Missing release file: {p}")

version = version_path.read_text(encoding="utf-8")
if "Version: 0.9.105" not in version:
    if "Version: 0.9.106" in version:
        pass
    else:
        raise SystemExit("Unexpected source release version")
else:
    version = version.replace("Version: 0.9.105", "Version: 0.9.106", 1)
if "0.9.106: Remove the developer byline from the cover artwork display" not in version:
    version += "\n0.9.106: Remove the developer byline from the main cover and Android download thumbnail while preserving the DWSS mark, 斯语 title, globe artwork, bottom slogans, and copyright ownership notice.\n"
version_path.write_text(version, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
if "const APP_VERSION = '0.9.105';" in sw:
    sw = sw.replace("const APP_VERSION = '0.9.105';", "const APP_VERSION = '0.9.106';", 1)
elif "const APP_VERSION = '0.9.106';" not in sw:
    raise SystemExit("Unexpected Service Worker version")
sw_path.write_text(sw, encoding="utf-8")

html = index_path.read_text(encoding="utf-8")
old_marker = '<meta name="dwss-auto-update" content="0.9.105"><!-- DWSS_AUTO_UPDATE_0_9_105 -->'
new_marker = '<meta name="dwss-auto-update" content="0.9.106"><!-- DWSS_AUTO_UPDATE_0_9_106 -->'
if old_marker in html:
    html = html.replace(old_marker, new_marker, 1)
elif new_marker not in html:
    raise SystemExit("Cannot find the current HTML update marker")
html = html.replace('dwss-release=0.9.105', 'dwss-release=0.9.106')
html = html.replace('alt="DWSS 斯语 陈谍 品牌封面"', 'alt="DWSS 斯语品牌封面"')

old_signature = '<section class="owner-signature" aria-label="封面题字"><span class="owner-cover-author-backdrop" aria-hidden="true"></span><span class="owner-cover-author">陈谍</span><div class="owner-sides"><span>德行四海</span><span>威震八方</span></div></section>'
new_signature = '<section class="owner-signature" aria-hidden="true"><span class="owner-cover-author-backdrop" aria-hidden="true"></span></section>'
if old_signature in html:
    html = html.replace(old_signature, new_signature, 1)
elif new_signature not in html:
    raise SystemExit("Cannot locate the cover byline markup")

old_thumb = '<img class="apk-cover" src="./cover.webp" alt="DWSS 斯语应用封面" width="74" height="74" loading="lazy" decoding="async">'
new_thumb = '<span class="apk-cover-wrap"><img class="apk-cover" src="./cover.webp" alt="DWSS 斯语应用封面" width="74" height="74" loading="lazy" decoding="async"></span>'
if old_thumb in html:
    html = html.replace(old_thumb, new_thumb, 1)
elif new_thumb not in html:
    raise SystemExit("Cannot locate the Android thumbnail markup")

cover_css = r'''
<style id="dwss-cover-hide-developer-byline-0106">
/* Hide the two gold byline characters embedded in the artwork; keep all other artwork intact. */
.cover-frame .owner-signature{
  display:block!important;
  position:absolute!important;
  inset:0!important;
  z-index:6!important;
  margin:0!important;
  padding:0!important;
  pointer-events:none!important;
}
.cover-frame .owner-cover-author,
.cover-frame .owner-sides{
  display:none!important;
}
.cover-frame .owner-cover-author-backdrop{
  display:block!important;
  position:absolute!important;
  left:50%!important;
  top:81.3%!important;
  width:32%!important;
  height:8%!important;
  transform:translate(-50%,-50%)!important;
  border-radius:50%!important;
  background:radial-gradient(ellipse at center,
    rgba(3,20,64,1) 0%,
    rgba(3,20,64,1) 68%,
    rgba(3,20,64,0) 100%)!important;
  filter:blur(2px)!important;
}
#dwss-apk-download .apk-cover-wrap{
  position:relative!important;
  display:block!important;
  flex:none!important;
  width:58px!important;
  height:58px!important;
  overflow:hidden!important;
  border-radius:12px!important;
}
#dwss-apk-download .apk-cover-wrap .apk-cover{
  display:block!important;
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  border-radius:12px!important;
}
#dwss-apk-download .apk-cover-wrap::after{
  content:"";
  position:absolute;
  z-index:2;
  left:50%;
  top:81.3%;
  width:32%;
  height:8%;
  transform:translate(-50%,-50%);
  border-radius:50%;
  background:radial-gradient(ellipse at center,
    rgba(3,20,64,1) 0%,
    rgba(3,20,64,1) 68%,
    rgba(3,20,64,0) 100%);
  filter:blur(1px);
  pointer-events:none;
}
</style>
'''
if 'id="dwss-cover-hide-developer-byline-0106"' not in html:
    if "</head>" not in html:
        raise SystemExit("HTML head closing tag missing")
    html = html.replace("</head>", cover_css + "\n</head>", 1)

if "DWSS_AUTO_UPDATE_0_9_106" not in html or 'alt="DWSS 斯语 陈谍 品牌封面"' in html:
    raise SystemExit("Cover cleanup or version marker did not apply")
if 'class="owner-cover-author">陈谍</span>' in html:
    raise SystemExit("Developer byline remains in cover markup")
if 'class="apk-cover-wrap"' not in html:
    raise SystemExit("Android cover thumbnail wrapper missing")
index_path.write_text(html, encoding="utf-8")
print("PASS DWSS 0.9.106: developer byline removed from main cover and Android thumbnail; DWSS branding, title, background, mottos and copyright remain.")
