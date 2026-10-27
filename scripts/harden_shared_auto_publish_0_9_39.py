from pathlib import Path
root=Path("public")
def read(name):
    p=root/name
    if not p.is_file(): raise SystemExit(f"Missing required release file: {name}")
    return p.read_text(encoding="utf-8")
def write(name,value): (root/name).write_text(value,encoding="utf-8")
def once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise SystemExit(f"{label}: expected exactly one anchor, found {n}")
    return text.replace(old,new,1)

app=read("app.js")
app=once(app,"version:'0.9.38'","version:'0.9.39'","application metadata version")
html=read("index.html")
marker_count=html.count("DWSS 0.9.38")
if marker_count < 1: raise SystemExit("No DWSS 0.9.38 HTML release markers found")
html=html.replace("DWSS 0.9.38","DWSS 0.9.39")
write("index.html",html)

sw=once(read("sw.js"),"const APP_VERSION = '0.9.38';","const APP_VERSION = '0.9.39';","Service Worker cache namespace")
write("sw.js",sw)
version=once(read("VERSION.txt"),"Version: 0.9.38","Version: 0.9.39","version file")
version += "\nShared vocabulary policy: all legacy personal terms with a local Swahili Chinese pronunciation are automatically checked and backfilled into the public shared lexicon; exact duplicates are linked, not reinserted. All future users' local Swahili additions auto-publish. Personal source and notes remain local and are not sent in automatic share payloads.\n"
write("VERSION.txt",version)

shared=read("shared-lexicon.js")
assert "function needsAutomaticShare(entry)" in shared
assert "return hasLocalSwahiliReading || [\"pending\", \"queued\"].includes(status);" in shared
assert "if (!needsAutomaticShare(entry)) continue;" in shared
assert shared.count("notes: null") >= 2
assert "entry.source" not in shared[shared.find("function buildPersonalPayload"):shared.find("async function submitPersonalTerm")]
assert "entry.note" not in shared[shared.find("function buildPersonalPayload"):shared.find("async function submitPersonalTerm")]
assert "Version: 0.9.39" in version
assert "const APP_VERSION = '0.9.39';" in sw
assert "version:'0.9.39'" in app
print("PASS: DWSS 0.9.39 legacy backfill, all-user auto-share, and private notes exclusion.")
