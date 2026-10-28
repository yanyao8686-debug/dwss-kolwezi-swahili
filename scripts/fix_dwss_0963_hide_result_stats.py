from pathlib import Path

ROOT = Path("public")

def replace_once(path, old, new, label):
    file = ROOT / path
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, got {count}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")

old = """#resultCard .dwss-secondary-details .stats,
#resultCard .dwss-secondary-details .quality-note,
#resultCard .dwss-secondary-details details.hint,
#resultCard .dwss-secondary-details .hint{display:none!important;margin:0!important;padding:0!important}"""
new = """/* These legacy status nodes stay in the DOM for the translation engine, but are not part of the visible result. */
#resultCard>.stats,
#resultCard>details.quality-note,
#resultCard>details.hint,
#resultCard .dwss-secondary-details .stats,
#resultCard .dwss-secondary-details .quality-note,
#resultCard .dwss-secondary-details details.hint,
#resultCard .dwss-secondary-details .hint{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important}"""
replace_once("index.html", old, new, "hide top-level coverage pills and explanation disclosures")

replace_once("index.html", 'content="0.9.62"><!-- DWSS_AUTO_UPDATE_0_9_62 -->', 'content="0.9.63"><!-- DWSS_AUTO_UPDATE_0_9_63 -->', "PWA release marker")
replace_once("index.html", "版本 0.9.62 · DWSS 智能翻译 PWA", "版本 0.9.63 · DWSS 智能翻译 PWA", "visible release version")
replace_once("app.js", "version:'0.9.62'", "version:'0.9.63'", "application version")
replace_once("sw.js", "const APP_VERSION = '0.9.62';", "const APP_VERSION = '0.9.63';", "service-worker cache version")
version = ROOT / "VERSION.txt"
info = version.read_text(encoding="utf-8").replace("Version: 0.9.62", "Version: 0.9.63", 1)
note = "0.9.63: Extend the hidden result-metadata rules to the top-level coverage and match-status elements, while retaining their DOM IDs for translation calculations. This removes the two red-box status pills without breaking the translation engine.\n"
if note not in info:
    info = info.rstrip() + "\n" + note
version.write_text(info, encoding="utf-8")
print("PASS: DWSS 0.9.63 hides result metadata at both top level and nested levels.")
