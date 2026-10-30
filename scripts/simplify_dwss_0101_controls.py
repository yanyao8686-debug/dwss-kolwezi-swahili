from pathlib import Path
import re

root = Path("public")
def read(name): return (root / name).read_text(encoding="utf-8")
def write(name, value): (root / name).write_text(value, encoding="utf-8")
def once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return source.replace(old, new, 1)

html = read("index.html")
required = [
    'id="translationCorrectionPanel"',
    'id="submitTranslationCorrection"',
    'id="viewTranslationCorrectionHistory"',
    'id="viewWithdrawnVariants"',
    'id="sharedVariantEditorDialog"',
    'id="sharedVariantHistoryDialog"',
    'id="translationOverrideHistoryDialog"',
    'id="resultReading"',
]
for token in required:
    if token not in html:
        raise SystemExit("Missing correction UI element: " + token)
html = once(html, 'content="0.9.100"', 'content="0.9.101"', "HTML release metadata")
html = once(html, "DWSS_AUTO_UPDATE_0_9_100", "DWSS_AUTO_UPDATE_0_9_101", "HTML automatic-update marker")
html = html.replace("dwss-release=0.9.100", "dwss-release=0.9.101")
html = html.replace('<span id="apkWebVersion">0.9.100</span>', '<span id="apkWebVersion">0.9.101</span>')
if html.count("</head>") != 1:
    raise SystemExit("Expected exactly one closing head tag")
html = html.replace("</head>", '<!-- DWSS 0.9.101 compact pronunciation controls -->\n</head>', 1)
write("index.html", html)

app = read("app.js")
app = once(app, "version:'0.9.100'", "version:'0.9.101'", "application version")
write("app.js", app)

boot = read("boot.js")
old_modules = "'./dictionary-overrides.js', './pwa.js'"
new_modules = "'./dictionary-overrides.js', './pwa.js', './dwss-pronunciation-controls.js'"
boot = once(boot, old_modules, new_modules, "load compact pronunciation controls after app modules")
write("boot.js", boot)

sw = read("sw.js")
sw = once(sw, "const APP_VERSION = '0.9.100';", "const APP_VERSION = '0.9.101';", "Service Worker cache version")
marker = "  './pronunciation-search.js',"
if sw.count(marker) != 1:
    raise SystemExit("Expected one pronunciation-search precache entry")
sw = sw.replace(marker, marker + "\n  './dwss-pronunciation-controls.js',", 1)
write("sw.js", sw)

source = Path("scripts/dwss-pronunciation-controls.js").read_text(encoding="utf-8")
(root / "dwss-pronunciation-controls.js").write_text(source, encoding="utf-8")

version = read("VERSION.txt")
version = once(version, "Version: 0.9.100", "Version: 0.9.101", "VERSION file")
version += "\n0.9.101: Consolidate pronunciation maintenance into two visible entries: 管理读音 and 历史记录. Main-reading correction, alternate-reading addition, edit history, withdrawn-reading recovery, restore actions, server synchronization, and Android/web parity keep their original handlers and data paths.\n"
write("VERSION.txt", version)

# Validate the final assets before deployment.
for name, token in [
    ("index.html", "DWSS_AUTO_UPDATE_0_9_101"),
    ("app.js", "version:'0.9.101'"),
    ("boot.js", "dwss-pronunciation-controls.js"),
    ("sw.js", "APP_VERSION = '0.9.101'"),
    ("sw.js", "'./dwss-pronunciation-controls.js'"),
    ("VERSION.txt", "Version: 0.9.101"),
]:
    if token not in read(name):
        raise SystemExit(f"Release marker missing from {name}: {token}")
print("PASS DWSS 0.9.101: pronunciation controls compacted; original correction/history/sync functions retained.")
