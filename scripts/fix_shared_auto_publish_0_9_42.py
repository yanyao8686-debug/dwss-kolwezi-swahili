from pathlib import Path

ROOT = Path("public")

def read(name):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit(f"Missing release file: {name}")
    return path.read_text(encoding="utf-8")

def write(name, value):
    (ROOT / name).write_text(value, encoding="utf-8")

def once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact match, found {count}")
    return source.replace(old, new, 1)

shared = read("shared-lexicon.js")
old_local = 'local_text: src === "sw" ? local : null,'
new_local = 'local_text: src === "sw" ? (local || null) : null,'
if old_local in shared:
    shared = shared.replace(old_local, new_local, 1)
elif new_local not in shared:
    raise SystemExit("Optional local_text payload is neither old nor normalized")
old_start = "function start() {\n  buildUi(); notifyApp();"
new_start = "function start() {\n  // Shared vocabulary is automatic; do not create a separate floating UI.\n  notifyApp();"
if old_start in shared:
    shared = shared.replace(old_start, new_start, 1)
elif new_start not in shared:
    raise SystemExit("Shared UI start() is neither old nor already removed")
if "dwss:personal-term-added" not in shared:
    raise SystemExit("Automatic personal-entry sharing listener is missing")
write("shared-lexicon.js", shared)

app = read("app.js")
app = once(app, "version:'0.9.41'", "version:'0.9.42'", "app runtime version")
write("app.js", app)

html = read("index.html")
if "DWSS 0.9.41" not in html:
    raise SystemExit("Expected DWSS 0.9.41 HTML base")
html = html.replace("DWSS 0.9.41", "DWSS 0.9.42")
# The legacy footer still displayed 0.9.32; advance it with the real bundle version.
html = html.replace("版本 0.9.32", "版本 0.9.42")
html = html.replace("版本 0.9.41", "版本 0.9.42")
write("index.html", html)

sw = once(read("sw.js"), "const APP_VERSION = '0.9.41';",
          "const APP_VERSION = '0.9.42';", "service-worker cache version")
write("sw.js", sw)

version = once(read("VERSION.txt"), "Version: 0.9.41",
               "Version: 0.9.42", "VERSION marker")
version += (
    "\n0.9.42 shared-entry repair: remove the independent floating shared-vocabulary panel; "
    "all Swahili terms are added from the main Add New Word form and automatically synced. "
    "Optional Latin spelling is normalized to SQL NULL when empty, matching the shared_terms "
    "database constraint; Realtime updates continue feeding the translation index.\n"
)
write("VERSION.txt", version)

assert 'local_text: src === "sw" ? (local || null) : null,' in shared
assert "buildUi(); notifyApp();" not in shared
assert "version:'0.9.42'" in app
assert "DWSS 0.9.42" in html
assert "const APP_VERSION = '0.9.42';" in sw
assert "Version: 0.9.42" in version
print("PASS: DWSS 0.9.42 single Add New Word flow, automatic sharing retained, optional spelling is SQL NULL.")
