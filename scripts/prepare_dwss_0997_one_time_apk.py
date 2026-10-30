from pathlib import Path
import hashlib
import re
import shutil

root=Path("public")
def read(name): return (root/name).read_text(encoding="utf-8")
def write(name,value): (root/name).write_text(value,encoding="utf-8")
def once(source,old,new,label):
    count=source.count(old)
    if count!=1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return source.replace(old,new,1)

# Keep the already installed native WebView shell. This is a stable first-install
# package and is intentionally NOT rebuilt for an ordinary website version bump.
apk=root/"DWSS-Android-0.9.80.apk"
if not apk.is_file(): raise SystemExit("Verified first-install APK is missing.")
data=apk.read_bytes()
if len(data)!=5806530: raise SystemExit(f"Unexpected APK size: {len(data)}")
if hashlib.sha256(data).hexdigest()!="9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5":
    raise SystemExit("First-install APK checksum does not match the approved stable package.")
shutil.copyfile(apk,root/"DWSS-Android-Installer.apk")

html=read("index.html")
html=once(
 html,
 '<p class="apk-meta">版本 0.9.80 · 约 5.81 MB</p>',
 '<p class="apk-meta">当前软件版本 <span id="apkWebVersion">0.9.97</span> · 首次安装包约 5.81 MB</p>',
 "remove stale fixed APK version display"
)
html=once(
 html,
 'href="./DWSS-Android-0.9.80.apk" download="刚果金斯语翻译-0.9.80.apk"',
 'href="./DWSS-Android-Installer.apk" download="刚果金斯语翻译-首次安装包.apk"',
 "use stable version-independent installer URL"
)
html=once(
 html,
 '<p class="apk-note">仅适用于 Android 手机</p>',
 '<p class="apk-note">首次安装一次即可；联网后软件自动更新，无需重新下载 APK</p>',
 "explain one-time install and in-app auto-update"
)
html=once(html,'content="0.9.96"','content="0.9.97"',"HTML release metadata")
html=once(html,'DWSS_AUTO_UPDATE_0_9_96','DWSS_AUTO_UPDATE_0_9_97',"HTML update marker")
html=html.replace("dwss-release=0.9.96","dwss-release=0.9.97")
html=once(html,'版本 0.9.96 · 刚果金斯语翻译','版本 0.9.97 · 刚果金斯语翻译',"HTML fallback visible version")
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.96'","version:'0.9.97'","application version")
write("app.js",app)

pwa=read("pwa.js")
old="""      const textNode = Array.from(footer.childNodes).find(node => node.nodeType === 3 && node.nodeValue.trim());
      if (textNode) textNode.nodeValue = '版本 ' + match[1] + ' · 刚果金斯语翻译';"""
new="""      const textNode = Array.from(footer.childNodes).find(node => node.nodeType === 3 && node.nodeValue.trim());
      if (textNode) textNode.nodeValue = '版本 ' + match[1] + ' · 刚果金斯语翻译';
      // The footer and installer card both display the live website/runtime
      // version. The APK itself is only the stable native first-install shell.
      const installerVersion = $('apkWebVersion');
      if (installerVersion) installerVersion.textContent = match[1];"""
pwa=once(pwa,old,new,"refresh APK card with live website version")
write("pwa.js",pwa)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.96';","const APP_VERSION = '0.9.97';","service worker cache version")
write("sw.js",sw)

version=read("VERSION.txt")
version=once(version,"Version: 0.9.96","Version: 0.9.97","VERSION file")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.97: Establish one-time Android installation and in-app web auto-update policy. Reuse the same verified native WebView APK; display the current website/runtime version from VERSION.txt in the footer and installer card. Ordinary website releases do not rebuild or replace the APK. The installer download uses a stable version-independent URL, and the app explains that subsequent web updates happen inside the app.\n"
write("VERSION.txt",version)

assert '当前软件版本 <span id="apkWebVersion">0.9.97</span>' in html
assert 'href="./DWSS-Android-Installer.apk"' in html
assert '首次安装一次即可；联网后软件自动更新，无需重新下载 APK' in html
assert 'DWSS_AUTO_UPDATE_0_9_97' in html
assert "version:'0.9.97'" in app
assert "const APP_VERSION = '0.9.97';" in sw
assert "const installerVersion = $('apkWebVersion');" in pwa
assert "installerVersion.textContent = match[1];" in pwa
assert (root/"DWSS-Android-Installer.apk").stat().st_size==5806530
assert hashlib.sha256((root/"DWSS-Android-Installer.apk").read_bytes()).hexdigest()=="9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5"
print("PASS DWSS 0.9.97: one stable APK; app/runtime version comes from live VERSION.txt; no APK rebuild for web-only releases.")
