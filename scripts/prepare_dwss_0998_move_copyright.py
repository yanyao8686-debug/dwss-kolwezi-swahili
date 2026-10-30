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
stamp='<span class="ownership-stamp">© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利</span>'
if html.count(stamp)!=1:
    raise SystemExit(f"Expected one original copyright box, found {html.count(stamp)}")
html=once(
    html,
    f'<div class="footer">版本 0.9.97 · 刚果金斯语翻译{stamp}</div>',
    '<div class="footer">版本 0.9.98 · 刚果金斯语翻译</div>',
    "remove copyright box from original footer while keeping the version label"
)
cover_boundary='</section>\n\n<section class="status-strip" aria-label="运行状态">'
moved='<div class="ownership-banner" aria-label="软件版权信息">'+stamp+'</div>'
html=once(html,cover_boundary,'</section>\n\n'+moved+'\n\n<section class="status-strip" aria-label="运行状态">',"place copyright box below cover")
banner_css="""
<style id="dwss-ownership-banner-0998">
.ownership-banner{
 display:flex;
 justify-content:center;
 align-items:center;
 width:100%;
 box-sizing:border-box;
 margin:-7px auto 10px;
 padding:0 8px;
}
.ownership-banner .ownership-stamp{
 display:block;
 width:min(100%,570px);
 box-sizing:border-box;
 margin:0;
 padding:5px 10px;
}
@media(min-width:700px){
 .ownership-banner{margin:0 auto 12px}
}
</style>
"""
html=once(html,"</head>",banner_css+"\n</head>","ownership banner styles")
html=once(html,'content="0.9.97"','content="0.9.98"',"HTML auto-update version")
html=once(html,'DWSS_AUTO_UPDATE_0_9_97','DWSS_AUTO_UPDATE_0_9_98',"HTML update marker")
html=html.replace("dwss-release=0.9.97","dwss-release=0.9.98")
# Version can also appear as the static fallback in the installer card.
html=html.replace('<span id="apkWebVersion">0.9.97</span>','<span id="apkWebVersion">0.9.98</span>')
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.97'","version:'0.9.98'","application version")
write("app.js",app)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.97';","const APP_VERSION = '0.9.98';","service worker cache version")
write("sw.js",sw)

version=read("VERSION.txt")
version=once(version,"Version: 0.9.97","Version: 0.9.98","VERSION file")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.98: Move the existing © 2026 ownership stamp as a whole from the bottom footer to immediately below the cover image, before the network/auto-update status bar. Keep the footer software version line in its original position and preserve the exact copyright wording and border.\n"
write("VERSION.txt",version)

assert html.count(stamp)==1
assert html.index('class="cover-frame"') < html.index('class="ownership-banner"') < html.index('class="status-strip"')
footer=html.split('<div class="footer">',1)[1].split('</div>',1)[0]
assert stamp not in footer and '版本 0.9.98' in footer
assert html.count('class="ownership-banner"')==1
assert 'DWSS_AUTO_UPDATE_0_9_98' in html
assert "version:'0.9.98'" in app
assert "const APP_VERSION = '0.9.98';" in sw
assert 'id="dwss-apk-download"' in html
assert 'href="./DWSS-Android-Installer.apk"' in html
assert 'id="installAppBtn"' not in html
print("PASS DWSS 0.9.98: exact original copyright box relocated below the cover; only the footer copyright removed; footer version retained.")
