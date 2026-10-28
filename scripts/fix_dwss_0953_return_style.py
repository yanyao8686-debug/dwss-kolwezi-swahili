from pathlib import Path
P = Path("public")
def r(name): return (P / name).read_text(encoding="utf-8")
def w(name, content): (P / name).write_text(content, encoding="utf-8")
def once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)

html = r("index.html")
old_css = ".dwss-return-translation{display:flex;align-items:center;justify-content:flex-start;width:100%;margin:0 0 10px;padding:3px 2px 8px;background:transparent;color:#c49b43;font-size:13px;font-weight:750;text-align:left}"
new_css = ".dwss-return-translation{display:flex;align-items:center;justify-content:flex-start;width:100%;margin:0 0 10px;padding:3px 2px 8px;background:transparent;color:#ff4b12!important;font-size:16px!important;font-weight:800!important;line-height:1.2!important;letter-spacing:0!important;text-align:left;text-decoration-line:underline!important;text-decoration-color:#ff4b12!important;text-decoration-thickness:2px!important;text-underline-offset:4px!important;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important}"
html = once(html, old_css, new_css, "match return link appearance to translation result heading")
html = once(html, 'content="0.9.52"', 'content="0.9.53"', "auto-update meta version")
html = once(html, "DWSS_AUTO_UPDATE_0_9_52", "DWSS_AUTO_UPDATE_0_9_53", "auto-update marker")
html = once(html, "版本 0.9.52 · DWSS 智能翻译 PWA", "版本 0.9.53 · DWSS 智能翻译 PWA", "visible version")
html = once(html, "/* DWSS 0.9.52 — four navigation actions, default translation home and collapsed secondary details */", "/* DWSS 0.9.53 — return-to-translation link matches the orange underlined result heading */", "release CSS comment")
w("index.html", html)

app = once(r("app.js"), "version:'0.9.52'", "version:'0.9.53'", "app metadata version")
w("app.js", app)
sw = once(r("sw.js"), "const APP_VERSION = '0.9.52';", "const APP_VERSION = '0.9.53';", "service worker cache version")
w("sw.js", sw)

version = once(r("VERSION.txt"), "Version: 0.9.52", "Version: 0.9.53", "version file")
version += "\n0.9.53: the Add New Word return-to-translation link now uses the same orange (#ff4b12), 16px bold type, and 2px underline as the translation result heading. The existing offline shared-vocabulary queue was verified to retain pending terms locally, preserve a stable idempotency key, automatically upload on reconnection, clear after server acknowledgement, and avoid duplicate inserts on repeated reconnects.\n"
w("VERSION.txt", version)
print("PASS: return link style matched, and app/service-worker/release version bumped to 0.9.53.")
