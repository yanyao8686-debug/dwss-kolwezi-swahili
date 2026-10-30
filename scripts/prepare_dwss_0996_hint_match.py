from pathlib import Path
import re

root=Path("public")
def read(name): return (root/name).read_text(encoding="utf-8")
def write(name,value): (root/name).write_text(value,encoding="utf-8")
def once(source,old,new,label):
    count=source.count(old)
    if count!=1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return source.replace(old,new,1)

html=read("index.html")
old='.translation-correction-hint{margin:0 0 2px;text-align:center;color:#808080;font-size:10px;line-height:1.4;font-weight:400}'
new=""".translation-correction-hint{
 display:block!important;
 width:100%!important;
 max-width:100%!important;
 box-sizing:border-box!important;
 margin:0 0 2px!important;
 padding:0 8px!important;
 border:none!important;
 background:transparent!important;
 color:var(--muted)!important;
 font-size:13px!important;
 font-weight:700!important;
 letter-spacing:.3px!important;
 line-height:1.75!important;
 text-align:center!important;
 white-space:normal!important;
 overflow-wrap:anywhere!important;
 word-break:normal!important;
}"""
html=once(html,old,new,"match pronunciation lookup instruction typography")
html=once(html,'content="0.9.95"','content="0.9.96"',"HTML auto-update version")
html=once(html,'DWSS_AUTO_UPDATE_0_9_95','DWSS_AUTO_UPDATE_0_9_96',"HTML auto-update marker")
html=html.replace('dwss-release=0.9.95','dwss-release=0.9.96')
html=once(html,'版本 0.9.95 · 刚果金斯语翻译','版本 0.9.96 · 刚果金斯语翻译',"visible version label")
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.95'","version:'0.9.96'","application version")
write("app.js",app)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.95';","const APP_VERSION = '0.9.96';","service worker cache version")
write("sw.js",sw)

version=read("VERSION.txt")
version=once(version,"Version: 0.9.95","Version: 0.9.96","VERSION file")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.96: Match the main translation correction helper typography to the pronunciation lookup instruction: 13px bold muted blue-gray text, 0.3px letter spacing and 1.75 line height. Preserve centered placement, button label, candidate workflows, and all other UI.\n"
write("VERSION.txt",version)

assert ".translation-correction-hint{" in html
hint=html.split(".translation-correction-hint{",1)[1].split("}",1)[0]
for token in ("color:var(--muted)!important","font-size:13px!important","font-weight:700!important","letter-spacing:.3px!important","line-height:1.75!important","text-align:center!important"):
    assert token in hint, f"Missing typography rule: {token}"
reference=html.split(".pronunciation-lookup-card .pronunciation-lookup-instruction{",1)[1].split("}",1)[0]
for token in ("color:var(--muted)!important","font-size:13px!important","font-weight:700!important","letter-spacing:.3px!important","line-height:1.75!important","text-align:center!important"):
    assert token in reference and token in hint, f"Correction helper does not match reference property: {token}"
assert '>提交修正并同步所有用户</button>' in html
assert '认为翻译结果错误可自行修改输入框内翻译结果' in html
assert 'DWSS_AUTO_UPDATE_0_9_96' in html
assert "version:'0.9.96'" in app
assert "const APP_VERSION = '0.9.96';" in sw
assert 'id="translationPronunciationCandidates"' in html
assert 'id="dwss-apk-download"' in html
assert 'id="installAppBtn"' not in html
print("PASS DWSS 0.9.96: correction helper matches pronunciation lookup typography; button, cloud candidate UI, and footer APK card preserved.")
