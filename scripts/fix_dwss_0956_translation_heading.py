from pathlib import Path

ROOT = Path("public")

def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = ROOT / path
    content = file.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    file.write_text(content.replace(old, new, 1), encoding="utf-8")

# The only user-visible copy change in this hotfix.
replace_once(
    "index.html",
    "<h2>翻译结果中文谐音：</h2>",
    "<h2>斯语翻译中文谐音：</h2>",
    "translation-result heading",
)

# Hidden update metadata and cache revision: these ensure existing PWAs fetch
# the updated index.html automatically. No layout, styles, labels, logic or
# user data are changed.
replace_once(
    "index.html",
    '<meta name="dwss-auto-update" content="0.9.55"><!-- DWSS_AUTO_UPDATE_0_9_55 -->',
    '<meta name="dwss-auto-update" content="0.9.56"><!-- DWSS_AUTO_UPDATE_0_9_56 -->',
    "automatic-update metadata",
)
replace_once(
    "sw.js",
    "const APP_VERSION = '0.9.55';",
    "const APP_VERSION = '0.9.56';",
    "service-worker cache revision",
)
replace_once(
    "VERSION.txt",
    "Version: 0.9.55",
    "Version: 0.9.56",
    "release metadata",
)
version = ROOT / "VERSION.txt"
info = version.read_text(encoding="utf-8")
note = "0.9.56: Change only the main translation result heading to “斯语翻译中文谐音：”; all other user-facing content and behavior are unchanged.\n"
if note not in info:
    version.write_text(info.rstrip() + "\n" + note, encoding="utf-8")

print("PASS: changed the single requested main-screen heading and bumped only hidden PWA/cache metadata.")
