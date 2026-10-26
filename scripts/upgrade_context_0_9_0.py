#!/usr/bin/env python3
"""Install DWSS 0.9.0 core app, context ranking and responsive styles."""
from pathlib import Path
import base64, gzip, hashlib, re

REPO = Path(__file__).resolve().parent.parent
PUBLIC = Path("public")
PARTS = REPO / "releases" / "0.9.0" / "app.js.gz.b64.parts-v2"
PART_NAMES = [
    "001.txt", "002.txt", "003.txt", "004-corrected.txt",
    "005.txt", "006.txt", "007.txt", "008.txt", "009.txt",
]

if not PUBLIC.is_dir():
    raise SystemExit("Pages public/ directory is missing")
encoded = "".join((PARTS / name).read_text(encoding="ascii").strip() for name in PART_NAMES)
if len(encoded) != 29236:
    raise SystemExit(f"DWSS 0.9.0 app payload length mismatch: {len(encoded)}")
try:
    app_bytes = gzip.decompress(base64.b64decode(encoded, validate=True))
    app = app_bytes.decode("utf-8")
except Exception as exc:
    raise SystemExit(f"Could not decode DWSS 0.9.0 app payload: {exc}")
required = [
    "version:'0.9.0'", "const CONTEXT_PROFILES", "function detectContext(",
    "function candidateContextScore(", "contextLabel", "sharedCount",
    "function bindSharedLexicon(", "origin:'builtin'", "origin:'shared'",
]
missing = [item for item in required if item not in app]
if missing:
    raise SystemExit("DWSS 0.9.0 app verification failed: " + ", ".join(missing))
(PUBLIC / "app.js").write_bytes(app_bytes)
print(f"Installed app.js 0.9.0 ({len(app_bytes)} bytes, sha256={hashlib.sha256(app_bytes).hexdigest()})")

# Retain the original top cover artwork and its sizing rules.
html_path = PUBLIC / "index.html"
html = html_path.read_text(encoding="utf-8")
if "DWSS 0.8.0 — precision interface layer" not in html:
    css = r'''/* DWSS 0.8.0 — precision interface layer; top brand artwork intentionally untouched */
:root{--bg:#f4f6fa;--paper:#fff;--ink:#17243b;--muted:#77839a;--line:#e5eaf2;--green:#173b78;--green2:#edf3ff;--shadow:0 8px 26px rgba(18,39,77,.055)}
body{background:linear-gradient(180deg,#edf2fa 0,#f6f7fa 340px,#f6f7fa 100%)}
.app{max-width:1040px}
.top{position:relative;overflow:hidden}
.top:after{content:"";position:absolute;inset:auto -55px -90px auto;width:210px;height:210px;border:1px solid rgba(255,255,255,.09);border-radius:50%;pointer-events:none}
.pwa-card{display:flex;flex-wrap:wrap;align-items:center;gap:5px 14px}
.pwa-card .sectionTitle{flex:1 1 100%}
.pwa-card #pwaMessage{flex:1 1 220px;margin:2px 0}
.pwa-card .actions{margin:0;flex:0 0 auto}
.tabs{padding:7px 5px;border:1px solid rgba(220,228,240,.8);border-radius:15px;box-shadow:0 5px 18px rgba(22,44,83,.035)}
.tab{letter-spacing:.015em}
.tab.active{box-shadow:0 4px 12px rgba(23,59,120,.16)}
.card{box-shadow:0 5px 20px rgba(20,42,82,.045)}
#translate>.card:first-child{padding:clamp(16px,2.4vw,23px)}
.textarea{min-height:148px;background:#fcfdff;border-color:#dce4f0}
#resultReading{font-weight:760;border-color:#dce6f6;background:linear-gradient(135deg,#f7f9fe,#eff4fc)}
.recommendation-item{gap:12px}
.recommendation-main{gap:4px}
.recommendation-main small{line-height:1.55}
.recommendation-item button{white-space:nowrap}
button:disabled{opacity:.48;cursor:not-allowed;transform:none}
input,textarea,select{accent-color:#2459a5}
::selection{background:#dce8fb;color:#142e5a}
@media(min-width:760px){
 .app{padding-bottom:56px}
 .panel#translate{display:none}
 .panel#translate.active{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr);gap:14px;align-items:start}
 .panel#translate>.card{margin-bottom:0}
 .panel#translate>.card:first-child{position:sticky;top:82px}
 .panel#translate>.card:nth-child(2){grid-column:1/-1}
 .panel#translate>#resultCard{grid-column:2;grid-row:1/span 2}
 .panel#translate>.card:nth-child(3){grid-column:1/-1}
}
@media(max-width:759px){.pwa-card{display:block}.pwa-card .actions{margin-top:8px}.tabs{gap:5px}.tab{font-size:12px}}
@media(max-width:420px){.toprow{gap:9px}.offline{font-size:9px}.actions button{padding:10px 11px}.recommendation-item{align-items:flex-start}.recommendation-item button{padding:7px 8px;font-size:10px}}
@media(prefers-contrast:more){.hint,.small-muted,.dictmeta{color:#53627a}.chip{color:#42516a;border-color:#c8d2e1}}
'''
    if "</style>" not in html:
        raise SystemExit("index.html has no style close tag for interface layer")
    html = html.replace("</style>", css + "\n</style>", 1)
html = re.sub(r"版本 0\\.6\\.11[^<]*", "版本 0.9.0 · DWSS 智能翻译 PWA", html, count=1)
html_path.write_text(html, encoding="utf-8")

sw_path = PUBLIC / "sw.js"
sw = sw_path.read_text(encoding="utf-8")
sw, count = re.subn(r"const APP_VERSION = '0\\.6\\.11';", "const APP_VERSION = '0.9.0';", sw, count=1)
if "const APP_VERSION = '0.9.0';" not in sw:
    raise SystemExit("Could not bump service-worker cache version to 0.9.0")
sw_path.write_text(sw, encoding="utf-8")

version_path = PUBLIC / "VERSION.txt"
version = version_path.read_text(encoding="utf-8") if version_path.exists() else ""
version, count = re.subn(r"Version: 0\\.6\\.11", "Version: 0.9.0", version, count=1)
if count == 0:
    version = "DWSS 科卢韦齐斯瓦希里语助手\nVersion: 0.9.0\nBuild: 2026-10-27\n"
version_path.write_text(version, encoding="utf-8")

print("DWSS 0.9.0 app, interface and service-worker version installed.")
