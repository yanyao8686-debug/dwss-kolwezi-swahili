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
old='.translation-correction-hint{margin:0 0 2px;text-align:center;color:#887a5d;font-size:9px;line-height:1.4;font-weight:400}'
new='.translation-correction-hint{margin:0 0 2px;text-align:center;color:#808080;font-size:10px;line-height:1.4;font-weight:400}'
html=once(html,old,new,"correction helper font and color")
html=once(html,'content="0.9.94"','content="0.9.95"',"HTML auto-update version")
html=once(html,'DWSS_AUTO_UPDATE_0_9_94','DWSS_AUTO_UPDATE_0_9_95',"HTML auto-update marker")
html=html.replace('dwss-release=0.9.94','dwss-release=0.9.95')
html=once(html,'版本 0.9.94 · 刚果金斯语翻译','版本 0.9.95 · 刚果金斯语翻译',"visible version label")
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.94'","version:'0.9.95'","application version")
write("app.js",app)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.94';","const APP_VERSION = '0.9.95';","service worker cache version")
write("sw.js",sw)

version=read("VERSION.txt")
version=once(version,"Version: 0.9.94","Version: 0.9.95","VERSION file")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.95: Increase the correction helper text from 9px to 10px and change its color to neutral gray (#808080). Button label, alignment, candidate submission, cloud sync, and all other interface elements remain unchanged.\n"
write("VERSION.txt",version)

assert '.translation-correction-hint{margin:0 0 2px;text-align:center;color:#808080;font-size:10px;line-height:1.4;font-weight:400}' in html
assert '>提交修正并同步所有用户</button>' in html
assert '认为翻译结果错误可自行修改输入框内翻译结果' in html
assert 'content="0.9.95"' in html and 'DWSS_AUTO_UPDATE_0_9_95' in html
assert "version:'0.9.95'" in app
assert "const APP_VERSION = '0.9.95';" in sw
assert 'id="translationPronunciationCandidates"' in html
assert 'id="dwss-apk-download"' in html
assert 'id="installAppBtn"' not in html
print("PASS DWSS 0.9.95: helper is 10px gray; button label, centering, candidates, and bottom APK card preserved.")
