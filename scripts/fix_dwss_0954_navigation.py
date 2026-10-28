from pathlib import Path

P = Path("public")
def read(name): return (P / name).read_text(encoding="utf-8")
def write(name, content): (P / name).write_text(content, encoding="utf-8")
def once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)

html = read("index.html")
html = once(html,
    "grid-template-columns:repeat(4,minmax(0,1fr));gap:10px!important",
    "grid-template-columns:repeat(3,minmax(0,1fr));gap:10px!important",
    "restore three-column tab layout")
html = once(html,
    "grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important",
    "grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important",
    "restore three-column main navigation")
html = once(html,
    '<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="saved"><span>历史记录</span></button><button class="tab" data-tab="dictionary"><span>词库</span></button><button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button></nav>',
    '<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="saved"><span>历史记录</span></button><button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button></nav>',
    "remove standalone dictionary tab")
html = once(html,
    '<div class="compact-sync-status"><span id="shareSyncSummary" role="status">云端词库：自动同步</span><button id="retrySharedSync" class="soft mini" type="button" hidden>重试同步</button></div>',
    '<div class="compact-sync-status"><span id="shareSyncSummary" role="status">云端词库：自动同步</span><button id="retrySharedSync" class="soft mini" type="button" hidden>重试同步</button></div><div class="actions pronunciation-maintenance-entry"><button class="plain mini" id="openPublicPronunciationEditor" type="button">查找并修改已收录词条读音</button></div>',
    "provide secondary public pronunciation editor entry")
html = once(html,
    "['maintenance','saved'].forEach(panelId=>{",
    "['maintenance','saved','dictionary'].forEach(panelId=>{",
    "add return-to-translation link to dictionary editor")
html = once(html, 'content="0.9.53"', 'content="0.9.54"', "auto-update meta version")
html = once(html, "DWSS_AUTO_UPDATE_0_9_53", "DWSS_AUTO_UPDATE_0_9_54", "auto-update marker")
html = once(html, "版本 0.9.53 · DWSS 智能翻译 PWA", "版本 0.9.54 · DWSS 智能翻译 PWA", "visible app version")
html = once(html,
    "/* DWSS 0.9.53 — return-to-translation link matches the orange underlined result heading */",
    "/* DWSS 0.9.54 — keep three original main actions; public pronunciation editing stays under Add New Word */",
    "release comment")
html = once(html,
    "<!-- DWSS 0.9.52 add navigation entry to public dictionary editor -->",
    "<!-- DWSS 0.9.54 public dictionary editor stays accessible without a standalone navigation tab -->",
    "remove stale navigation comment")
html += '\n<style>.pronunciation-maintenance-entry{margin-top:9px}.pronunciation-maintenance-entry button{width:100%;text-align:center}</style>\n'
write("index.html", html)

app = read("app.js")
app = once(app, "version:'0.9.53'", "version:'0.9.54'", "app version")
app = once(app,
    "document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));",
    "document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));$('openPublicPronunciationEditor').addEventListener('click',()=>{switchTab('dictionary');$('dictSearch').value='';dictVisibleLimit=250;renderDictionary();renderPublicPronunciationOverrides();});",
    "wire public pronunciation editor entry point")
write("app.js", app)

sw = once(read("sw.js"), "const APP_VERSION = '0.9.53';", "const APP_VERSION = '0.9.54';", "service worker cache version")
write("sw.js", sw)

version = once(read("VERSION.txt"), "Version: 0.9.53", "Version: 0.9.54", "release version")
version = once(version, "Release date: 2026-10-27", "Release date: 2026-10-28", "release date")
version += "\n0.9.54: Removed the standalone 词库 navigation item and restored the original three-action navigation. Public pronunciation maintenance remains accessible from the 添加新词 page through a secondary link; the dictionary editor keeps shared update/restore and now has the same return-to-translation link. Offline shared-word queue, idempotency, and automatic online retry are preserved.\n"
write("VERSION.txt", version)
print("PASS: 0.9.54 removes the 词库 tab, restores three actions, and keeps public editor reachable under 添加新词.")
