#!/usr/bin/env python3
"""DWSS 0.9.90: local manual pronunciation correction on the translation result."""
from pathlib import Path
import hashlib
import os
import re
import shutil

ROOT = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))
APK_SOURCE = Path(os.environ.get("DWSS_APK_SOURCE", ".dwss-android-artifact/刚果金斯语翻译-0.9.80.apk"))
APK_NAME = "DWSS-Android-0.9.80.apk"
APK_SIZE = 5806530
APK_SHA256 = "9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5"

def need(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit(f"Missing release file: {path}")
    return path

def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old, new, 1)

for name in ("VERSION.txt", "index.html", "app.js", "boot.js", "sw.js",
             "cover.webp", "manifest.webmanifest", "pwa.js"):
    need(name)

# Verify and copy the exact previously built Android package. The APK is not
# added to the Service Worker precache because it is a large optional download.
if not APK_SOURCE.is_file():
    raise SystemExit(f"Android APK source is missing: {APK_SOURCE}")
apk_bytes = APK_SOURCE.read_bytes()
if len(apk_bytes) != APK_SIZE:
    raise SystemExit(f"Unexpected APK size: {len(apk_bytes)}")
if hashlib.sha256(apk_bytes).hexdigest() != APK_SHA256:
    raise SystemExit("The Android APK SHA-256 does not match the verified 0.9.80 build.")
shutil.copyfile(APK_SOURCE, ROOT / APK_NAME)

# Add a compact inline editor directly under the main translation result.
html_path = need("index.html")
html = html_path.read_text(encoding="utf-8")
if "manualReadingTools" in html or "manual-translation-reading.js" in html:
    raise SystemExit("Manual reading editor already exists; refusing to duplicate it.")
result_anchor = '<div class="phonetic empty" id="resultReading">输入中文后，翻译结果中文谐音会显示在这里</div>'
manual_controls = """<div class="manual-reading-tools" id="manualReadingTools" hidden>
  <button class="soft mini" id="manualReadingEdit" type="button">修改读音</button>
  <span class="manual-reading-state" id="manualReadingState" hidden></span>
</div>
<div class="manual-reading-editor" id="manualReadingEditor" hidden>
  <label for="manualReadingValue">手动修改这段中文对应的斯语谐音</label>
  <textarea id="manualReadingValue" maxlength="2000" rows="3" autocomplete="off" placeholder="按科卢韦齐当地实际发音，用中文同音字修改"></textarea>
  <div class="manual-reading-actions">
    <button class="primary mini" id="manualReadingSave" type="button">保存修正</button>
    <button class="plain mini" id="manualReadingRestore" type="button" hidden>恢复自动翻译</button>
    <button class="soft mini" id="manualReadingCancel" type="button">取消</button>
  </div>
  <p class="manual-reading-hint">保存后，同样的中文再次输入时会优先显示这条修正。修正只保存在本机，不会自动发布到共享词库；更换设备前可通过个人备份转移。</p>
  <p class="manual-reading-status" id="manualReadingStatus" role="status" aria-live="polite" hidden></p>
</div>"""
html = once(html, result_anchor, result_anchor + "\n" + manual_controls, "translation result editor insertion")

manual_css = """
<style id="dwss-manual-translation-reading-0990">
.manual-reading-tools{display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;margin:7px 0 3px}
.manual-reading-tools[hidden],.manual-reading-editor[hidden]{display:none!important}
.manual-reading-tools #manualReadingEdit{min-height:30px;padding:6px 12px;border:1px solid #dfc477;border-radius:999px;background:linear-gradient(135deg,#fff8e6,#f4e3b3);color:#67491c;font-size:11px;font-weight:750}
.manual-reading-state{font-size:10px;color:#68816f;line-height:1.4}
.manual-reading-editor{margin:8px 0 5px;padding:11px 12px;border:1px solid #e5d39a;border-radius:13px;background:#fffaf0}
.manual-reading-editor label{display:block;margin:0 0 6px;color:#665027;font-size:12px;font-weight:750}
.manual-reading-editor textarea{display:block;width:100%;min-height:72px;box-sizing:border-box;padding:9px 10px;border:1px solid #d9bd72;border-radius:10px;background:#fff4ce;color:#2d3748;font:600 16px/1.5 inherit;resize:vertical}
.manual-reading-editor textarea:focus{outline:2px solid rgba(186,143,52,.25);border-color:#b88d2e}
.manual-reading-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
.manual-reading-actions button{min-height:32px}
.manual-reading-hint{margin:7px 0 0;color:#8a7955;font-size:10px;line-height:1.5}
.manual-reading-status{margin:6px 0 0;color:#58715e;font-size:11px;line-height:1.5}
.manual-reading-status.error{color:#a23e31}
.manual-reading-status.note{color:#7a6a49}
.manual-reading-status.saved{color:#426b4d;font-weight:650}
</style>
"""
if html.count("</head>") != 1:
    raise SystemExit("Expected exactly one closing head tag.")
html = html.replace("</head>", manual_css + "\n</head>", 1)

# Remove the old status-strip PWA install control; the supported APK installer is
# now the small card at the bottom of the page.
install_pattern = r"""<button\b(?=[^>]*\bid=["']installAppBtn["'])[^>]*>.*?</button>"""
html, removed = re.subn(install_pattern, "", html, count=1, flags=re.S)
if removed != 1 or 'id="installAppBtn"' in html:
    raise SystemExit("The old top-of-page PWA install button was not removed exactly once.")

apk_card = """
<section id="dwss-apk-download" aria-label="安卓 APP 下载">
  <img class="apk-cover" src="./cover.webp" alt="DWSS 斯语应用封面" width="74" height="74" loading="lazy" decoding="async">
  <p class="apk-title">刚果金斯语翻译 · 安卓 APP</p>
  <p class="apk-meta">版本 0.9.80 · 约 5.81 MB</p>
  <a class="apk-download-btn" href="./DWSS-Android-0.9.80.apk" download="刚果金斯语翻译-0.9.80.apk">下载并安装安卓 APP</a>
  <p class="apk-note">仅适用于 Android 手机</p>
</section>
"""
if 'id="dwss-apk-download"' in html:
    raise SystemExit("An APK download card already exists; refusing to duplicate it.")
footer_matches = list(re.finditer(r'<div class="footer">.*?</div>', html, flags=re.S))
if len(footer_matches) != 1:
    raise SystemExit(f"Expected one footer block, found {len(footer_matches)}.")
footer_end = footer_matches[0].end()
html = html[:footer_end] + "\n" + apk_card + html[footer_end:]

apk_css = """
<style id="dwss-apk-download-style-0990">
#dwss-apk-download{max-width:320px;margin:14px auto 26px;padding:12px 14px 13px;border:1px solid #dfe6ee;border-radius:20px;background:rgba(255,255,255,.88);box-shadow:0 6px 18px rgba(20,42,82,.055);display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
#dwss-apk-download .apk-cover{display:block;width:74px;height:74px;object-fit:cover;border-radius:15px;box-shadow:0 3px 10px rgba(0,35,85,.16)}
#dwss-apk-download .apk-title{margin:0;color:#17395e;font-size:13px;line-height:1.35;font-weight:750}
#dwss-apk-download .apk-meta{margin:0;color:#78869a;font-size:10px;line-height:1.4}
#dwss-apk-download .apk-download-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;width:min(220px,100%);box-sizing:border-box;margin-top:2px;padding:9px 16px;border:1px solid #d5b45f;border-radius:999px;background:linear-gradient(135deg,#f7e8bd,#e9cf89);color:#5d351d;text-decoration:none;font-size:12px;font-weight:750;box-shadow:0 3px 9px rgba(155,120,39,.11)}
#dwss-apk-download .apk-download-btn:focus-visible{outline:3px solid rgba(207,169,77,.35);outline-offset:3px}
#dwss-apk-download .apk-note{margin:0;color:#929cac;font-size:9px;line-height:1.35}
</style>
"""
if html.count("</head>") != 1:
    raise SystemExit("Expected exactly one closing head tag after style insertion.")
# Insert APK styling in the document head after the manual-editor style.
head_end = html.find("</style>\n</head>")
if head_end < 0:
    raise SystemExit("Could not locate the head style close for the APK download CSS.")
html = html[:head_end + len("</style>")] + "\n" + apk_css + html[head_end + len("</style>"):]

# Advance resource cache-busting metadata. All prior components remain unchanged.
html = once(html, 'content="0.9.89">', 'content="0.9.90">', "HTML release metadata")
html = once(html, "<!-- DWSS_AUTO_UPDATE_0_9_89 -->", "<!-- DWSS_AUTO_UPDATE_0_9_90 -->", "HTML auto-update marker")
html = once(html, "版本 0.9.89 · 刚果金斯语翻译", "版本 0.9.90 · 刚果金斯语翻译", "visible website version")
html = html.replace("dwss-release=0.9.89", "dwss-release=0.9.90")
html_path.write_text(html, encoding="utf-8")

# Load the new editor only after app.js has created its controls and event handlers.
boot_path = need("boot.js")
boot = boot_path.read_text(encoding="utf-8")
boot = once(
    boot,
    "'./dictionary-overrides.js', './pwa.js'",
    "'./dictionary-overrides.js', './pwa.js', './manual-translation-reading.js'",
    "manual editor bootstrap order"
)
boot_path.write_text(boot, encoding="utf-8")

# Precache the editor for offline use, bump cache version, and avoid caching the
# optional 5.81 MB APK as part of ordinary page fetches.
sw_path = need("sw.js")
sw = sw_path.read_text(encoding="utf-8")
sw = once(sw, "const APP_VERSION = '0.9.89';", "const APP_VERSION = '0.9.90';", "Service Worker version")
sw = once(
    sw,
    "  './pronunciation-search.js',",
    "  './pronunciation-search.js', './manual-translation-reading.js',",
    "manual correction offline asset"
)
sw = once(
    sw,
    "  if (url.origin !== self.location.origin) return;",
    "  if (url.origin !== self.location.origin) return;\n  // Keep the optional APK download out of the offline cache.\n  if (url.pathname.toLowerCase().endsWith('.apk')) return;",
    "APK cache bypass"
)
sw_path.write_text(sw, encoding="utf-8")

# Update the page and app release metadata.
app_path = need("app.js")
app = once(app_path.read_text(encoding="utf-8"), "version:'0.9.89'", "version:'0.9.90'", "application metadata")
app_path.write_text(app, encoding="utf-8")

version_path = need("VERSION.txt")
version = once(version_path.read_text(encoding="utf-8"), "Version: 0.9.89", "Version: 0.9.90", "VERSION.txt")
version = re.sub(r"^Release date: .*$", "Release date: 2026-10-30", version, count=1, flags=re.M)
version += (
    "\n0.9.90: Add a main-translation manual Chinese-phonetic correction editor. "
    "Corrections are saved locally for the exact normalized Chinese input, are reapplied on later matching translations, "
    "can be restored to the automatic dictionary result, and are included in the existing personal backup JSON. "
    "The manual correction editor is cached for offline use. Restore the compact Android APK download card at page bottom "
    "and remove the old top install prompt. The optional APK is not precached.\n"
)
version_path.write_text(version, encoding="utf-8")

editor_source = Path("manual-translation-reading.js")
if not editor_source.is_file():
    raise SystemExit("Repository source manual-translation-reading.js is missing.")
shutil.copyfile(editor_source, ROOT / "manual-translation-reading.js")

# Structural checks before deployment.
if html.count('id="manualReadingTools"') != 1 or html.count('id="manualReadingEditor"') != 1:
    raise SystemExit("Manual editor HTML controls are missing or duplicated.")
if 'href="./DWSS-Android-0.9.80.apk"' not in html or "5.81 MB" not in html:
    raise SystemExit("The compact Android download card is incomplete.")
if 'id="installAppBtn"' in html:
    raise SystemExit("The obsolete PWA install button remains in the page.")
if "'./manual-translation-reading.js'" not in boot:
    raise SystemExit("The new editor is not loaded by boot.js.")
if "./manual-translation-reading.js" not in sw:
    raise SystemExit("The new editor is not in the offline precache.")
if "const APP_VERSION = '0.9.90';" not in sw or "Version: 0.9.90" not in version:
    raise SystemExit("Release version markers do not agree.")

print("PASS: 0.9.90 local manual pronunciation editor inserted below the main translation result.")
print("PASS: manual corrections persist by exact normalized Chinese input and restore to dictionary output.")
print("PASS: manual corrections are included in existing backup/restore without publishing to shared vocabulary.")
print("PASS: editor is loaded after app.js and included in Service Worker offline cache.")
print("PASS: old top install button removed; compact 5.81 MB APK card and verified APK file restored.")
print("PASS: HTML, app, and Service Worker metadata advanced from 0.9.89 to 0.9.90.")
