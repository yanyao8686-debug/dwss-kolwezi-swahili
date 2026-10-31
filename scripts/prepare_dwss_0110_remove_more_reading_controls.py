#!/usr/bin/env python3
"""DWSS 0.9.110: remove the low-frequency pronunciation-management UI from the main page."""
from pathlib import Path
import re, sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "public")

def need(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit(f"Missing required file: {path}")
    return path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old, new, 1)

html_path = need("index.html")
app_path = need("app.js")
sw_path = need("sw.js")
version_path = need("VERSION.txt")
for name in ("shared-lexicon.js", "dwss-pronunciation-controls.js", "DWSS-Android-Installer.apk"):
    need(name)

html = html_path.read_text(encoding="utf-8")
# Remove the full low-frequency disclosure, including its heading and three buttons.
html, n = re.subn(
    r'<style id="dwss-pronunciation-more-0109">.*?</style>\s*',
    '',
    html, count=1, flags=re.S
)
if n != 1:
    raise SystemExit("Could not find the 0.9.109 More Pronunciation Actions styles")
html, n = re.subn(
    r'\s*<details class="dwss-pronunciation-more" id="dwss-pronunciation-more">.*?</details>',
    '',
    html, count=1, flags=re.S
)
if n != 1:
    raise SystemExit("Could not find the More Pronunciation Actions disclosure")
# Remove its now-unused button styling.
html, n = re.subn(r'\n#restoreTranslationCorrection\{[^}]*\}', '', html, count=1)
if n != 1:
    raise SystemExit("Could not find unused restore-button CSS")
# Bump the visible PWA version and all versioned script URLs.
html = replace_once(html, 'content="0.9.109"><!-- DWSS_AUTO_UPDATE_0_9_109 -->',
                    'content="0.9.110"><!-- DWSS_AUTO_UPDATE_0_9_110 -->', "HTML auto-update marker")
url_count = html.count("dwss-release=0.9.109")
if url_count < 3:
    raise SystemExit(f"Expected at least 3 versioned script URLs; found {url_count}")
html = html.replace("dwss-release=0.9.109", "dwss-release=0.9.110")
for forbidden in ('dwss-pronunciation-more', '更多读音操作',
                  'id="restoreTranslationCorrection"',
                  'id="viewTranslationCorrectionHistory"',
                  'id="viewWithdrawnVariants"'):
    if forbidden in html:
        raise SystemExit("Low-frequency pronunciation UI remains in HTML: " + forbidden)
html_path.write_text(html, encoding="utf-8")

app = app_path.read_text(encoding="utf-8")
app = replace_once(app, "version:'0.9.109'", "version:'0.9.110'", "application metadata version")
# The UI nodes are intentionally removed. Make their optional event hooks null-safe.
app = replace_once(
    app,
    "$('viewWithdrawnVariants').addEventListener('click',openWithdrawnSharedVariants);",
    "const withdrawnHistoryButton=$('viewWithdrawnVariants');if(withdrawnHistoryButton)withdrawnHistoryButton.addEventListener('click',openWithdrawnSharedVariants);",
    "withdrawn history event hook"
)
app = replace_once(
    app,
    "$('viewTranslationCorrectionHistory').addEventListener('click',openTranslationOverrideHistory);",
    "const correctionHistoryButton=$('viewTranslationCorrectionHistory');if(correctionHistoryButton)correctionHistoryButton.addEventListener('click',openTranslationOverrideHistory);",
    "correction history event hook"
)
app = replace_once(
    app,
    "$('restoreTranslationCorrection').addEventListener('click',restoreTranslationCorrection);",
    "const restoreCorrectionButton=$('restoreTranslationCorrection');if(restoreCorrectionButton)restoreCorrectionButton.addEventListener('click',restoreTranslationCorrection);",
    "restore event hook"
)
# Confirm the pin workflow remains in the main candidate renderer and still invokes the shared save path.
for token in ("data-dwss-pin", "button.textContent='置顶中…'", "await submitTranslationCorrection()",
              "submitQuickTranslationTerm", "isStandaloneUnknown"):
    if token not in app:
        raise SystemExit("Required main editor / pin behavior missing: " + token)
app_path.write_text(app, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
sw = replace_once(sw, "const APP_VERSION = '0.9.109';",
                  "const APP_VERSION = '0.9.110';", "Service Worker version")
sw_path.write_text(sw, encoding="utf-8")

version = version_path.read_text(encoding="utf-8")
version = replace_once(version, "Version: 0.9.109", "Version: 0.9.110", "VERSION.txt")
version = re.sub(r"^Release date: .*$", "Release date: 2026-10-31", version, count=1, flags=re.M)
version += (
    "\n0.9.110: Remove the More Pronunciation Actions heading, container, and low-frequency "
    "restore/history/withdrawn-reading buttons from the main translation page. Preserve cloud "
    "revision/history records, shared candidate selection, and per-candidate pin-to-primary actions. "
    "Make legacy optional event hooks null-safe; Android APK remains unchanged.\n"
)
version_path.write_text(version, encoding="utf-8")

print("PASS DWSS 0.9.110: removed the entire low-frequency action area; retained the single main save, candidate list, cloud pin and revision safeguards.")
