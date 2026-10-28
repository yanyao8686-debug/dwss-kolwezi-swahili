from pathlib import Path

P = Path("public")
def read(name):
    return (P / name).read_text(encoding="utf-8")
def write(name, value):
    (P / name).write_text(value, encoding="utf-8")
def once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)

html = read("index.html")
html = once(html, ".tabs{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1.22fr) minmax(0,1fr);", ".tabs{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));", "four-column tab bar")
html = once(html, "nav.tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;", "nav.tabs{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;", "four-column mobile navigation")
html = once(html, "/* DWSS 0.9.43 — three equal actions, default translation home and collapsed secondary details */", "/* DWSS 0.9.52 — four navigation actions, default translation home and collapsed secondary details */", "navigation style note")
html = once(html, '<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="saved"><span>历史记录</span></button><button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button></nav>', '<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="saved"><span>历史记录</span></button><button class="tab" data-tab="dictionary"><span>词库</span></button><button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button></nav>', "add visible dictionary navigation tab")
html = once(html, 'content="0.9.51"', 'content="0.9.52"', "automatic update version")
html = once(html, "DWSS_AUTO_UPDATE_0_9_51", "DWSS_AUTO_UPDATE_0_9_52", "automatic update marker")
html = once(html, "<!-- DWSS 0.9.51 first pronunciation only and public dictionary editor -->", "<!-- DWSS 0.9.52 add navigation entry to public dictionary editor -->", "release comment")
html = once(html, "版本 0.9.51 · DWSS 智能翻译 PWA", "版本 0.9.52 · DWSS 智能翻译 PWA", "visible release version")
for required in ['data-tab="maintenance"', 'data-tab="saved"', 'data-tab="dictionary"', 'class="nav-clear-slot"', 'id="dictionary"', 'id="publicPronunciationList"', 'id="pronunciationEditor"']:
    if required not in html:
        raise SystemExit(f"Required navigation/editor markup missing: {required}")
write("index.html", html)

app = read("app.js")
app = once(app, "version:'0.9.51'", "version:'0.9.52'", "app metadata version")
write("app.js", app)

sw = read("sw.js")
sw = once(sw, "const APP_VERSION = '0.9.51';", "const APP_VERSION = '0.9.52';", "service worker cache version")
write("sw.js", sw)

version = once(read("VERSION.txt"), "Version: 0.9.51", "Version: 0.9.52", "version file")
version += "\n0.9.52: add a visible top navigation tab named 词库 so all users can open the Chinese Dictionary, search any built-in Swahili headword, edit its public Chinese homophone, review current public changes, or restore the built-in reading. The existing other navigation actions remain available.\n"
write("VERSION.txt", version)
print("PASS: DWSS 0.9.52 adds the visible 词库 navigation tab, keeps the dictionary/editor panel, preserves other actions, and bumps automatic update cache version.")
