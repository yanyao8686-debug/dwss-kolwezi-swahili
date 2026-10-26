#!/usr/bin/env python3
"""Finalize DWSS 0.6.6 release files after unpacking the 0.6.4 archive."""
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public")

def read(name):
    p = root / name
    return p.read_text(encoding="utf-8") if p.exists() else None

def write(name, content):
    (root / name).write_text(content, encoding="utf-8")

# Load the Supabase browser SDK before the shared panel script.
html = read("index.html")
if html is None:
    raise SystemExit("index.html is missing")
if "supabase.min.js" not in html or "shared-lexicon.js" not in html:
    boot = '<script src="boot.js"></script>'
    additions = '<script defer src="./supabase.min.js"></script>\n<script defer src="./shared-lexicon.js"></script>'
    if boot in html:
        html = html.replace(boot, boot + "\n" + additions, 1)
    else:
        html = html.replace("</body>", additions + "\n</body>", 1)
html = html.replace("版本 0.6.4", "版本 0.6.6").replace("版本 0.6.5", "版本 0.6.6")
write("index.html", html)

# Bump the Service Worker cache key and include cloud scripts in the core offline cache.
sw = read("sw.js")
if sw is None:
    raise SystemExit("sw.js is missing")
sw = sw.replace("const APP_VERSION = '0.6.4';", "const APP_VERSION = '0.6.6';").replace("const APP_VERSION = '0.6.5';", "const APP_VERSION = '0.6.6';")
start = sw.find("const PRECACHE_URLS = [")
end = sw.find("];", start)
if start < 0 or end < 0:
    raise SystemExit("Could not find PRECACHE_URLS in sw.js")
fragment = sw[start:end]
for asset in ("./shared-lexicon.js", "./supabase.min.js"):
    if asset not in fragment:
        prefix = sw[:end].rstrip()
        if not prefix.endswith(","):
            prefix += ","
        insertion = "\n  '" + asset + "',"
        sw = prefix + insertion + sw[end:]
        end = len(prefix + insertion)
        fragment = sw[start:end]
write("sw.js", sw)

# Update user-facing PWA offline diagnostics.
pwa = read("pwa.js")
if pwa is not None:
    pwa = pwa.replace(
        "核心程序、词库、封面和图标已由 Service Worker 缓存。",
        "核心程序、内置词库、共享词库组件、封面和图标已由 Service Worker 缓存。"
    )
    pwa = pwa.replace(
        "核心程序、当地词库、法语辅助词表、新封面和图标已缓存。",
        "核心程序、当地词库、法语辅助词表、云端共享词库组件、新封面和图标已缓存。"
    )
    write("pwa.js", pwa)

# Update release metadata.

# Extend high-frequency French fallback and fix full-phrase precedence.
import json, re
fp = read("french-fallback.js")
if fp is None:
    raise SystemExit("french-fallback.js is missing")
mm = re.search(r"window\\.SW_FRENCH\\s*=\\s*(\\{.*?\\})\\s*;", fp, re.S)
rr = re.search(r"window\\.SW_FRENCH_READINGS\\s*=\\s*(\\{.*?\\})\\s*;", fp, re.S)
if not mm or not rr:
    raise SystemExit("French maps could not be parsed")
fm, fr = json.loads(mm.group(1)), json.loads(rr.group(1))
extra = {
 "我很高兴认识你":"Je suis ravi de faire votre connaissance.",
 "很高兴认识你":"Ravi de faire votre connaissance.",
 "认识":"Connaître / faire connaissance",
 "认识你":"Faire votre connaissance",
 "高兴":"Être heureux / être content",
 "很高兴":"Je suis très heureux.",
 "见面":"Rencontrer / se rencontrer",
 "见到你":"Vous voir",
 "欢迎":"Bienvenue.",
 "欢迎你":"Soyez le bienvenu.",
 "请问":"Excusez-moi, s'il vous plaît.",
 "告诉我":"Dites-moi.",
 "我想":"Je voudrais / je veux",
 "我需要":"J'ai besoin de",
 "我希望":"J'espère",
 "我觉得":"Je pense que",
 "我认为":"Je pense que",
 "我知道":"Je sais",
 "我同意":"Je suis d'accord.",
 "我不同意":"Je ne suis pas d'accord.",
 "为什么":"Pourquoi ?",
 "所以":"Donc / c'est pourquoi",
 "虽然":"Bien que",
 "没关系":"Ce n'est pas grave.",
 "当然":"Bien sûr",
 "真的":"Vraiment",
 "一点":"Un peu",
 "多少钱":"Combien ça coûte ?",
 "付款":"Payer",
 "现金":"Espèces",
 "医生":"Médecin",
 "生病":"Être malade",
 "头痛":"Mal de tête",
 "肚子痛":"Mal au ventre",
 "谢谢你":"Merci à vous.",
 "祝你今天愉快":"Je vous souhaite une bonne journée."
}
pron = {
 "Je suis ravi de faire votre connaissance.":"热 绥 哈维 德 费赫 沃特赫 科内桑斯",
 "Ravi de faire votre connaissance.":"哈维 德 费赫 沃特赫 科内桑斯",
 "Connaître / faire connaissance":"科内特赫 / 费赫 科内桑斯",
 "Faire votre connaissance":"费赫 沃特赫 科内桑斯",
 "Être heureux / être content":"埃特赫 厄赫厄 / 埃特赫 孔唐",
 "Je suis très heureux.":"热 绥 特赫诶 厄赫厄",
 "Rencontrer / se rencontrer":"杭孔特赫 / 瑟 杭孔特赫",
 "Bienvenue.":"比安维讷",
 "Soyez le bienvenu.":"斯瓦耶 勒 比安维讷",
 "Excusez-moi, s'il vous plaît.":"埃克斯居泽 姆瓦，西勒 武 普莱",
 "Dites-moi.":"迪特 姆瓦",
 "J'ai besoin de":"热 贝赞 德",
 "Je voudrais / je veux":"热 武德赫 / 热 沃",
 "J'espère":"热斯佩赫",
 "Je pense que":"热 庞斯 克",
 "Je sais":"热 塞",
 "Je suis d'accord.":"热 绥 达科赫",
 "Je ne suis pas d'accord.":"热 讷 绥 帕 达科赫",
 "Pourquoi ?":"普赫夸",
 "Donc / c'est pourquoi":"东克 / 塞 普赫夸",
 "Bien que":"比安 克",
 "Ce n'est pas grave.":"瑟 内 帕 格赫阿夫",
 "Bien sûr":"比安 绥赫",
 "Vraiment":"弗赫埃芒",
 "Un peu":"安 珀",
 "Combien ça coûte ?":"孔比安 萨 库特",
 "Payer":"佩耶",
 "Espèces":"埃斯佩斯",
 "Médecin":"梅德桑",
 "Être malade":"埃特赫 马拉德",
 "Mal de tête":"马勒 德 特特",
 "Mal au ventre":"马勒 欧 旺特赫",
 "Merci à vous.":"梅赫西 阿 武",
 "Je vous souhaite une bonne journée.":"热 武 苏埃特 于讷 邦尼 茹赫内"
}
for k,v in extra.items(): fm[k]=v
for k,v in pron.items(): fr[k]=v
fp=fp[:mm.start()]+"window.SW_FRENCH = "+json.dumps(fm,ensure_ascii=False,separators=(",",":"))+";"+fp[mm.end():]
rr=re.search(r"window\\.SW_FRENCH_READINGS\\s*=\\s*(\\{.*?\\})\\s*;",fp,re.S)
fp=fp[:rr.start()]+"window.SW_FRENCH_READINGS = "+json.dumps(fr,ensure_ascii=False,separators=(",",":"))+";"+fp[rr.end():]
write("french-fallback.js",fp)
app=read("app.js")
old="if(phraseFr && !found && phraseFr.key.length>foundLen){"
if old in app:
    app=app.replace(old,"if(phraseFr && phraseFr.key.length>foundLen){",1)
elif "if(phraseFr && phraseFr.key.length>foundLen){" not in app:
    raise SystemExit("French phrase precedence anchor missing")
write("app.js",app)

version = read("VERSION.txt")
if version is None:
    raise SystemExit("VERSION.txt is missing")
version = version.replace("Version: 0.6.4", "Version: 0.6.6").replace("Version: 0.6.5", "Version: 0.6.6")
if "Shared vocabulary:" not in version:
    version += "\nShared vocabulary: cloud terms participate in main translation and dictionary search; real-time updates, offline cache and retry queue included.\n"
write("VERSION.txt", version)

# Keep release documentation consistent with the new shared behavior.
guide = read("README_部署与使用.md")
if guide is not None:
    guide = guide.replace("PWA 0.6.3", "PWA 0.6.6").replace("PWA 0.6.5", "PWA 0.6.6").replace("版本 0.6.3", "版本 0.6.6").replace("版本 0.6.5", "版本 0.6.6")
    marker = "## 备份与恢复"
    section = """## 云端共享词库

首页右下角的“共享词库”可以添加当地斯瓦西里语或法语补位词条。在线提交后，词条自动进入 DWSS 共享词库，其他在线设备会收到实时更新，并直接参与主翻译、短句拼配和词典搜索。内置基础词库与个人本地词库保持独立；共享词条在翻译结果中标注为“云端共享词库”。离线新增会暂存在本机，恢复网络后自动提交。清除浏览器站点数据前，请先确认离线队列已同步完成。

"""
    if "## 云端共享词库" not in guide:
        guide = guide.replace(marker, section + marker, 1)
    guide = guide.replace("个人新增词条只保存在当前设备，不会自动跨设备同步。", "个人“词库维护”新增词条仍保存在当前设备；需要跨设备共享时，请使用首页右下角的“共享词库”提交。")
    write("README_部署与使用.md", guide)

print("DWSS 0.6.6 release files finalized.")
