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
write("app.js",app)
html=read("index.html")
marker_count=html.count("DWSS 0.9.38")
if marker_count < 1: raise SystemExit("No DWSS 0.9.38 HTML release markers found")
html=html.replace("DWSS 0.9.38","DWSS 0.9.39")
html=once(html,"#resultCard .dwss-secondary-details>summary{list-style:none;cursor:pointer;color:#ff4b12!important;font-size:16px!important;font-weight:800!important;line-height:1.2;padding:5px 2px;text-decoration-line:underline!important;text-decoration-color:#ff4b12!important;text-decoration-thickness:2px!important;text-underline-offset:4px!important;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important}","#resultCard .dwss-secondary-details>summary{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;list-style:none;cursor:pointer;color:#ff4b12!important;font-size:clamp(10px,3.4vw,13px)!important;font-weight:800!important;line-height:1.35;padding:5px 0!important;letter-spacing:-.03em!important;text-decoration-line:underline!important;text-decoration-color:#ff4b12!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;overflow:visible!important;text-overflow:clip!important}","responsive details summary typography")
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
