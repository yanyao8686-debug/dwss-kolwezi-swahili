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
html=once(
    html,
    '<div class="footer">版本 0.9.98 · 刚果金斯语翻译</div>',
    '',
    "remove red-circled footer version line"
)
compact_css="""
<style id="dwss-compact-apk-footer-0999">
/* The installation card now follows the translation area directly. */
#dwss-apk-download{
 max-width:320px!important;
 margin:0 auto 10px!important;
 padding:7px 12px 8px!important;
 border-radius:16px!important;
 gap:3px!important;
}
#dwss-apk-download .apk-cover{
 width:58px!important;
 height:58px!important;
 border-radius:12px!important;
}
#dwss-apk-download .apk-title{
 font-size:12px!important;
 line-height:1.25!important;
}
#dwss-apk-download .apk-meta{
 font-size:9px!important;
 line-height:1.25!important;
}
#dwss-apk-download .apk-download-btn{
 min-height:34px!important;
 width:min(210px,100%)!important;
 margin-top:0!important;
 padding:7px 13px!important;
 font-size:11px!important;
 line-height:1.2!important;
}
#dwss-apk-download .apk-note{
 font-size:8px!important;
 line-height:1.25!important;
}
</style>
"""
html=once(html,"</head>",compact_css+"\n</head>","compact installer layout CSS")
html=once(html,'content="0.9.98"','content="0.9.99"',"HTML release metadata")
html=once(html,'DWSS_AUTO_UPDATE_0_9_98','DWSS_AUTO_UPDATE_0_9_99',"HTML update marker")
html=html.replace("dwss-release=0.9.98","dwss-release=0.9.99")
html=html.replace('<span id="apkWebVersion">0.9.98</span>','<span id="apkWebVersion">0.9.99</span>')
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.98'","version:'0.9.99'","application version")
write("app.js",app)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.98';","const APP_VERSION = '0.9.99';","Service Worker cache version")
write("sw.js",sw)

pwa=read("pwa.js")
old="""      const footer = document.querySelector('.footer');
      if (!footer) return;
      const response = await fetch('./VERSION.txt?dwss-version-check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const content = await response.text();
      const match = content.match(/^Version:\\s*(\\d+\\.\\d+\\.\\d+)\\s*$/m);
      if (!match) return;
      const textNode = Array.from(footer.childNodes).find(node => node.nodeType === 3 && node.nodeValue.trim());
      if (textNode) textNode.nodeValue = '版本 ' + match[1] + ' · 刚果金斯语翻译';
      // The footer and installer card both display the live website/runtime
      // version. The APK itself is only the stable native first-install shell.
      const installerVersion = $('apkWebVersion');
      if (installerVersion) installerVersion.textContent = match[1];"""
new="""      const footer = document.querySelector('.footer');
      const response = await fetch('./VERSION.txt?dwss-version-check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const content = await response.text();
      const match = content.match(/^Version:\\s*(\\d+\\.\\d+\\.\\d+)\\s*$/m);
      if (!match) return;
      // The footer is intentionally removed from the compact page. Keep this
      // optional for compatibility and always refresh the installer version.
      if (footer) {
        const textNode = Array.from(footer.childNodes).find(node => node.nodeType === 3 && node.nodeValue.trim());
        if (textNode) textNode.nodeValue = '版本 ' + match[1] + ' · 刚果金斯语翻译';
      }
      const installerVersion = $('apkWebVersion');
      if (installerVersion) installerVersion.textContent = match[1];"""
pwa=once(pwa,old,new,"keep live version on installer after footer removal")
write("pwa.js",pwa)

version=read("VERSION.txt")
version=once(version,"Version: 0.9.98","Version: 0.9.99","VERSION file")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.99: Remove the standalone bottom version footer line. Compact the Android installer card vertically (smaller cover and tighter card/button spacing) and place it directly after the main content with no intervening footer. Keep live installer version refresh working from VERSION.txt even without a footer element.\n"
write("VERSION.txt",version)

assert '<div class="footer">' not in html
assert html.index('</main>') < html.index('id="dwss-apk-download"')
assert 'href="./DWSS-Android-Installer.apk"' in html
assert 'id="apkWebVersion"' in html
assert 'DWSS_AUTO_UPDATE_0_9_99' in html
assert "version:'0.9.99'" in app
assert "const APP_VERSION = '0.9.99';" in sw
assert "const installerVersion = $('apkWebVersion');" in pwa
assert "if (footer) {" in pwa
assert "installerVersion.textContent = match[1];" in pwa
assert "margin:0 auto 10px!important" in html
assert "width:58px!important" in html
assert "min-height:34px!important" in html
assert 'id="installAppBtn"' not in html
print("PASS DWSS 0.9.99: footer version removed, APK card compressed and moved directly under main content, live version remains dynamic.")
