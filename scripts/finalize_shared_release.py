#!/usr/bin/env python3
"""Finalize DWSS 0.6.7 release files after unpacking the 0.6.4 archive."""
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
html = html.replace("版本 0.6.4", "版本 0.6.7").replace("版本 0.6.5", "版本 0.6.7")
write("index.html", html)

# Bump the Service Worker cache key and include cloud scripts in the core offline cache.
sw = read("sw.js")
if sw is None:
    raise SystemExit("sw.js is missing")
sw = sw.replace("const APP_VERSION = '0.6.4';", "const APP_VERSION = '0.6.7';").replace("const APP_VERSION = '0.6.5';", "const APP_VERSION = '0.6.7';").replace("const APP_VERSION = '0.6.6';", "const APP_VERSION = '0.6.7';")
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
mm = re.search(r"window\.SW_FRENCH\s*=\s*(\{.*?\})\s*;", fp, re.S)
rr = re.search(r"window\.SW_FRENCH_READINGS\s*=\s*(\{.*?\})\s*;", fp, re.S)
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

# Expanded practical DRC French fallback vocabulary (Chinese -> French).
extra.update({
 "早上好":"Bonjour.",
 "下午好":"Bon après-midi.",
 "晚上好":"Bonsoir.",
 "晚安":"Bonne nuit.",
 "再见":"Au revoir.",
 "明天见":"À demain.",
 "回头见":"À bientôt.",
 "请进":"Entrez, s'il vous plaît.",
 "请坐":"Asseyez-vous, s'il vous plaît.",
 "请稍等":"Veuillez patienter un instant.",
 "等一下":"Attendez un instant.",
 "请重复一遍":"Répétez, s'il vous plaît.",
 "请说慢一点":"Parlez plus lentement, s'il vous plaît.",
 "我听不懂":"Je ne comprends pas.",
 "我不明白":"Je ne comprends pas.",
 "你会说中文吗":"Parlez-vous chinois ?",
 "你会说法语吗":"Parlez-vous français ?",
 "我只会说一点法语":"Je parle seulement un peu français.",
 "请写下来":"Écrivez-le, s'il vous plaît.",
 "请给我看看":"Montrez-moi, s'il vous plaît.",
 "请帮帮我":"Aidez-moi, s'il vous plaît.",
 "我需要帮助":"J'ai besoin d'aide.",
 "我迷路了":"Je suis perdu.",
 "你叫什么名字":"Comment vous appelez-vous ?",
 "我叫":"Je m'appelle",
 "你来自哪里":"D'où venez-vous ?",
 "我来自中国":"Je viens de Chine.",
 "你住在哪里":"Où habitez-vous ?",
 "你住在科卢韦齐吗":"Vous habitez à Kolwezi ?",
 "你多大了":"Quel âge avez-vous ?",
 "你结婚了吗":"Êtes-vous marié ?",
 "你有孩子吗":"Avez-vous des enfants ?",
 "今天":"Aujourd'hui",
 "昨天":"Hier",
 "明天":"Demain",
 "现在":"Maintenant",
 "马上":"Tout de suite",
 "稍后":"Plus tard",
 "已经":"Déjà",
 "还没有":"Pas encore",
 "每天":"Tous les jours",
 "每周":"Chaque semaine",
 "每个月":"Chaque mois",
 "星期一":"Lundi",
 "星期二":"Mardi",
 "星期三":"Mercredi",
 "星期四":"Jeudi",
 "星期五":"Vendredi",
 "星期六":"Samedi",
 "星期日":"Dimanche",
 "几点了":"Quelle heure est-il ?",
 "现在几点":"Quelle heure est-il maintenant ?",
 "今天几号":"Quelle est la date d'aujourd'hui ?",
 "天气":"Le temps",
 "下雨了":"Il pleut.",
 "很热":"Il fait très chaud.",
 "很冷":"Il fait très froid.",
 "小心":"Attention !",
 "注意安全":"Faites attention à votre sécurité.",
 "危险":"Danger",
 "禁止进入":"Entrée interdite.",
 "禁止拍照":"Photographie interdite.",
 "禁止吸烟":"Défense de fumer.",
 "请出示证件":"Veuillez présenter vos pièces d'identité.",
 "身份证":"Carte d'identité",
 "护照":"Passeport",
 "工作证":"Badge professionnel",
 "通行证":"Laissez-passer",
 "登记":"Enregistrement",
 "登记姓名":"Enregistrer le nom",
 "签字":"Signer",
 "请签字":"Veuillez signer.",
 "请登记":"Veuillez vous enregistrer.",
 "检查一下":"Veuillez vérifier.",
 "检查车辆":"Contrôler le véhicule.",
 "检查行李":"Contrôler les bagages.",
 "打开后备箱":"Ouvrez le coffre.",
 "请下车":"Veuillez descendre du véhicule.",
 "请上车":"Veuillez monter dans le véhicule.",
 "请停车":"Veuillez arrêter le véhicule.",
 "停车场":"Parking",
 "入口":"Entrée",
 "出口":"Sortie",
 "大门":"Portail principal",
 "岗亭":"Poste de garde",
 "门卫":"Agent de sécurité",
 "保安":"Agent de sécurité",
 "值班":"Service de garde",
 "交接班":"Relève de service",
 "巡逻":"Patrouille",
 "巡逻路线":"Itinéraire de patrouille",
 "巡逻记录":"Rapport de patrouille",
 "监控室":"Salle de vidéosurveillance",
 "摄像头":"Caméra de surveillance",
 "监控":"Vidéosurveillance",
 "报警器":"Alarme",
 "警报":"Alerte",
 "紧急情况":"Situation d'urgence",
 "发生什么事了":"Que s'est-il passé ?",
 "谁负责":"Qui est responsable ?",
 "负责人":"Responsable",
 "主管":"Superviseur",
 "经理":"Directeur",
 "员工":"Employé",
 "工人":"Ouvrier",
 "访客":"Visiteur",
 "承包商":"Sous-traitant",
 "司机":"Chauffeur",
 "车辆":"Véhicule",
 "车牌号码":"Numéro d'immatriculation",
 "驾驶证":"Permis de conduire",
 "保险":"Assurance",
 "钥匙":"Clé",
 "手机":"Téléphone portable",
 "电话":"Téléphone",
 "请给我打电话":"Appelez-moi, s'il vous plaît.",
 "请发信息给我":"Envoyez-moi un message, s'il vous plaît.",
 "网络":"Réseau Internet",
 "没有信号":"Il n'y a pas de réseau.",
 "电":"Électricité",
 "停电":"Coupure d'électricité",
 "发电机":"Groupe électrogène",
 "水":"Eau",
 "饮用水":"Eau potable",
 "厕所":"Toilettes",
 "食堂":"Cantine",
 "办公室":"Bureau",
 "仓库":"Entrepôt",
 "宿舍":"Dortoir",
 "医院":"Hôpital",
 "药店":"Pharmacie",
 "警察局":"Commissariat de police",
 "消防队":"Pompiers",
 "救护车":"Ambulance",
 "火灾":"Incendie",
 "发生火灾":"Il y a un incendie.",
 "有人受伤":"Quelqu'un est blessé.",
 "有人生病":"Quelqu'un est malade.",
 "叫救护车":"Appelez une ambulance.",
 "叫警察":"Appelez la police.",
 "需要医生":"Nous avons besoin d'un médecin.",
 "急救":"Premiers secours",
 "受伤":"Blessé",
 "流血":"Saigner",
 "疼痛":"Douleur",
 "发烧":"Fièvre",
 "咳嗽":"Toux",
 "呼吸困难":"Difficulté à respirer",
 "过敏":"Allergie",
 "药":"Médicament",
 "请快一点":"Dépêchez-vous, s'il vous plaît.",
 "不要着急":"Ne vous inquiétez pas.",
 "保持冷静":"Restez calme.",
 "不要动":"Ne bougez pas.",
 "站在这里":"Restez ici.",
 "跟我来":"Suivez-moi.",
 "往前走":"Avancez.",
 "往后退":"Reculez.",
 "向左转":"Tournez à gauche.",
 "向右转":"Tournez à droite.",
 "停在这里":"Arrêtez-vous ici.",
 "离开这里":"Quittez cet endroit.",
 "马上离开":"Partez immédiatement.",
 "集合":"Rassemblement",
 "在这里集合":"Rassemblez-vous ici.",
 "清点人数":"Compter les personnes.",
 "人数":"Effectif",
 "名单":"Liste nominative",
 "报告":"Rapport",
 "写报告":"Rédiger un rapport.",
 "事故报告":"Rapport d'incident",
 "事故":"Incident",
 "交通事故":"Accident de la circulation",
 "盗窃":"Vol",
 "打架":"Bagarre",
 "冲突":"Conflit",
 "威胁":"Menace",
 "损坏":"Dégât",
 "丢失":"Perte",
 "找到":"Trouver",
 "没有找到":"Introuvable",
 "证据":"Preuve",
 "证人":"Témoin",
 "嫌疑人":"Suspect",
 "报警":"Alerter la police",
 "调查":"Enquête",
 "询问":"Interroger",
 "禁止":"Interdit",
 "允许":"Autorisé",
 "未经允许":"Sans autorisation",
 "未经许可不得进入":"Accès interdit sans autorisation.",
 "必须戴安全帽":"Le port du casque est obligatoire.",
 "必须穿反光背心":"Le port du gilet réfléchissant est obligatoire.",
 "必须穿安全鞋":"Le port des chaussures de sécurité est obligatoire.",
 "安全帽":"Casque de sécurité",
 "反光背心":"Gilet réfléchissant",
 "安全鞋":"Chaussures de sécurité",
 "手套":"Gants",
 "口罩":"Masque",
 "护目镜":"Lunettes de protection",
 "安全带":"Harnais de sécurité",
 "危险区域":"Zone dangereuse",
 "安全区域":"Zone de sécurité",
 "施工现场":"Chantier",
 "矿区":"Site minier",
 "矿山":"Mine",
 "矿石":"Minerai",
 "设备":"Équipement",
 "机器":"Machine",
 "工具":"Outil",
 "维修":"Réparation",
 "故障":"Panne",
 "损坏了":"C'est endommagé.",
 "不能使用":"Inutilisable",
 "可以使用":"Utilisable",
 "电池":"Batterie",
 "轮胎":"Pneu",
 "燃油":"Carburant",
 "柴油":"Gazole",
 "汽油":"Essence",
 "加油":"Faire le plein",
 "油箱":"Réservoir",
 "发动机":"Moteur",
 "刹车":"Freins",
 "方向盘":"Volant",
 "轮胎漏气":"Le pneu est dégonflé.",
 "车辆坏了":"Le véhicule est en panne.",
 "需要维修":"Il faut réparer.",
 "价格":"Prix",
 "太贵了":"C'est trop cher.",
 "便宜一点":"Un peu moins cher, s'il vous plaît.",
 "我没有钱":"Je n'ai pas d'argent.",
 "我有现金":"J'ai de l'argent liquide.",
 "找零":"Monnaie",
 "收据":"Reçu",
 "发票":"Facture",
 "买":"Acheter",
 "卖":"Vendre",
 "市场":"Marché",
 "商店":"Magasin",
 "食物":"Nourriture",
 "米饭":"Riz",
 "面包":"Pain",
 "肉":"Viande",
 "鱼":"Poisson",
 "鸡肉":"Poulet",
 "蔬菜":"Légumes",
 "水果":"Fruits",
 "盐":"Sel",
 "糖":"Sucre",
 "水瓶":"Bouteille d'eau",
 "我饿了":"J'ai faim.",
 "我渴了":"J'ai soif.",
 "我累了":"Je suis fatigué.",
 "我需要休息":"J'ai besoin de me reposer.",
 "我想回家":"Je veux rentrer à la maison.",
 "我在工作":"Je suis au travail.",
 "我下班了":"J'ai fini le travail.",
 "我迟到了":"Je suis en retard.",
 "我马上到":"J'arrive tout de suite.",
 "我已经到了":"Je suis déjà arrivé.",
 "我正在路上":"Je suis en route.",
 "等我一下":"Attendez-moi un instant.",
 "没有问题":"Il n'y a pas de problème.",
 "有问题":"Il y a un problème.",
 "解决问题":"Résoudre le problème.",
 "我会处理":"Je vais m'en occuper.",
 "请放心":"Soyez rassuré.",
 "这是我的责任":"C'est ma responsabilité.",
 "我需要确认":"Je dois confirmer.",
 "请确认":"Veuillez confirmer.",
 "请通知我":"Veuillez m'informer.",
 "请通知主管":"Veuillez informer le superviseur.",
 "我马上通知他":"Je vais l'informer immédiatement.",
 "他不在":"Il n'est pas là.",
 "他在办公室":"Il est au bureau.",
 "我们开始吧":"Commençons.",
 "会议":"Réunion",
 "开会":"Tenir une réunion",
 "会议室":"Salle de réunion",
 "计划":"Plan",
 "安排":"Organisation",
 "任务":"Mission",
 "完成":"Terminer",
 "还没完成":"Ce n'est pas encore terminé.",
 "已经完成":"C'est déjà terminé.",
 "准时":"À l'heure",
 "迟到":"En retard",
 "加班":"Heures supplémentaires",
 "工资":"Salaire",
 "休假":"Congé",
 "请假":"Demander un congé",
 "合同":"Contrat",
 "规定":"Règlement",
 "规则":"Règle",
 "遵守规定":"Respecter le règlement.",
 "违反规定":"Enfreindre le règlement.",
 "谢谢您的合作":"Merci de votre coopération.",
 "感谢您的理解":"Merci de votre compréhension.",
 "祝您一路平安":"Bon voyage.",
 "祝你好运":"Bonne chance.",
 "祝你生日快乐":"Joyeux anniversaire.",
 "祝你周末愉快":"Bon week-end."
})
# Approximate Chinese sound guides for the expanded, high-frequency French fallback.
pron.update({
 "Bonjour.":"邦茹赫","Bon après-midi.":"邦 阿普赫米迪","Bonsoir.":"邦斯瓦赫","Bonne nuit.":"邦 纽伊",
 "Au revoir.":"欧赫 伏瓦赫","À demain.":"阿 德曼","À bientôt.":"阿 比安托","Entrez, s'il vous plaît.":"昂特赫，西勒 武 普莱",
 "Asseyez-vous, s'il vous plaît.":"阿塞耶 武，西勒 武 普莱","Veuillez patienter un instant.":"武耶 帕西昂特 安 安斯唐",
 "Attendez un instant.":"阿唐德 安 安斯唐","Répétez, s'il vous plaît.":"赫佩特，西勒 武 普莱",
 "Parlez plus lentement, s'il vous plaît.":"帕赫莱 普吕 朗特芒，西勒 武 普莱",
 "Je ne comprends pas.":"热 讷 孔普杭 帕","Je ne comprends pas.":"热 讷 孔普杭 帕",
 "Parlez-vous chinois ?":"帕赫莱 武 希努瓦","Parlez-vous français ?":"帕赫莱 武 弗杭塞",
 "Je parle seulement un peu français.":"热 帕赫勒 瑟勒芒 安 珀 弗杭塞",
 "Écrivez-le, s'il vous plaît.":"埃克赫维耶 勒，西勒 武 普莱","Montrez-moi, s'il vous plaît.":"蒙特赫 姆瓦，西勒 武 普莱",
 "Aidez-moi, s'il vous plaît.":"埃德 姆瓦，西勒 武 普莱","J'ai besoin d'aide.":"热 贝赞 德德",
 "Je suis perdu.":"热 绥 佩赫迪","Comment vous appelez-vous ?":"科芒 武 扎普莱 武",
 "Je m'appelle":"热 马佩勒","D'où venez-vous ?":"杜 维内 武","Je viens de Chine.":"热 维安 德 希讷",
 "Où habitez-vous ?":"乌 阿比特 武","Vous habitez à Kolwezi ?":"武 扎比特 阿 科卢韦齐",
 "Quel âge avez-vous ?":"凯勒 阿日 阿韦 武","Êtes-vous marié ?":"埃特 武 马里耶","Avez-vous des enfants ?":"阿韦 武 德赞方",
 "Aujourd'hui":"奥茹赫迪","Hier":"伊耶赫","Demain":"德曼","Maintenant":"曼特南","Tout de suite":"图 德 绥特",
 "Plus tard":"普吕 塔赫","Déjà":"德扎","Pas encore":"帕赞科赫","Tous les jours":"图 莱 茹赫","Chaque semaine":"沙克 塞梅讷",
 "Chaque mois":"沙克 穆瓦","Lundi":"朗迪","Mardi":"马赫迪","Mercredi":"梅赫克赫迪","Jeudi":"热迪","Vendredi":"旺德赫迪",
 "Samedi":"萨姆迪","Dimanche":"迪芒什","Quelle heure est-il ?":"凯勒 厄赫 埃蒂勒","Quelle heure est-il maintenant ?":"凯勒 厄赫 埃蒂勒 曼特南",
 "Quelle est la date d'aujourd'hui ?":"凯勒 埃 拉 达特 多茹赫迪","Le temps":"勒 唐","Il pleut.":"伊勒 普勒","Il fait très chaud.":"伊勒 费 特赫 肖",
 "Il fait très froid.":"伊勒 费 特赫 弗赫瓦","Attention !":"阿唐西翁","Faites attention à votre sécurité.":"费特 阿唐西翁 阿 沃特赫 塞居赫იტे",
 "Danger":"当热","Entrée interdite.":"昂特赫 昂特赫迪特","Photographie interdite.":"佛托格赫阿菲 昂特赫迪特",
 "Défense de fumer.":"德方斯 德 菲梅","Veuillez présenter vos pièces d'identité.":"武耶 普赫赞特 武 皮耶斯 迪当蒂特",
 "Carte d'identité":"卡赫特 迪当蒂特","Passeport":"帕斯波赫","Badge professionnel":"巴日 普赫佛西奥内勒",
 "Laissez-passer":"莱塞 帕塞","Enregistrement":"昂赫日斯特赫芒","Enregistrer le nom":"昂赫日斯特赫 勒 诺姆",
 "Signer":"西涅","Veuillez signer.":"武耶 西涅","Veuillez vous enregistrer.":"武耶 武 昂赫日斯特赫",
 "Veuillez vérifier.":"武耶 韦赫里菲耶","Contrôler le véhicule.":"孔特赫罗莱 勒 韦伊居勒","Contrôler les bagages.":"孔特赫罗莱 莱 巴加日",
 "Ouvrez le coffre.":"乌弗赫 莱 科弗赫","Veuillez descendre du véhicule.":"武耶 德桑德赫 迪 韦伊居勒",
 "Veuillez monter dans le véhicule.":"武耶 蒙特赫 当 勒 韦伊居勒","Veuillez arrêter le véhicule.":"武耶 阿赫特 莱 韦伊居勒",
 "Parking":"帕赫金","Entrée":"昂特赫","Sortie":"索赫蒂","Portail principal":"波赫泰 普赫桑西帕勒",
 "Poste de garde":"波斯特 德 加赫德","Agent de sécurité":"阿让 德 塞居赫იტे","Service de garde":"塞赫维斯 德 加赫德",
 "Relève de service":"赫莱夫 德 塞赫维斯","Patrouille":"帕特赫乌伊","Itinéraire de patrouille":"伊蒂内赫赫 德 帕特赫乌伊",
 "Rapport de patrouille":"赫阿波赫 德 帕特赫乌伊","Salle de vidéosurveillance":"萨勒 德 维德奥 绥赫维扬斯","Caméra de surveillance":"卡梅赫阿 德 绥赫维扬斯",
 "Vidéosurveillance":"维德奥 绥赫维扬斯","Alarme":"阿拉赫姆","Alerte":"阿莱赫特","Situation d'urgence":"西图阿西翁 迪赫让斯",
 "Que s'est-il passé ?":"克 塞蒂勒 帕塞","Qui est responsable ?":"基 埃 赫斯蓬萨布勒","Responsable":"赫斯蓬萨布勒",
 "Superviseur":"叙佩赫维泽赫","Directeur":"迪赫克特赫","Employé":"昂普卢瓦耶","Ouvrier":"乌弗赫里耶","Visiteur":"维齐特赫",
 "Sous-traitant":"苏 特赫唐","Chauffeur":"肖弗赫","Véhicule":"韦伊居勒","Numéro d'immatriculation":"纽梅赫 罗 迪马特赫居拉西翁",
 "Permis de conduire":"佩赫米 德 孔迪伊赫","Assurance":"阿叙赫杭斯","Clé":"克莱","Téléphone portable":"特莱佛讷 波赫塔布勒",
 "Téléphone":"特莱佛讷","Appelez-moi, s'il vous plaît.":"阿普莱 姆瓦，西勒 武 普莱","Envoyez-moi un message, s'il vous plaît.":"昂瓦耶 姆瓦 安 梅萨日，西勒 武 普莱",
 "Réseau Internet":"赫泽 伊特赫内特","Il n'y a pas de réseau.":"伊勒 尼 亚 帕 德 赫泽","Électricité":"埃莱克特赫西特","Coupure d'électricité":"库佩赫 迪莱克特赫西特",
 "Groupe électrogène":"格赫乌普 埃莱克特赫奥日讷","Eau":"欧","Eau potable":"欧 波塔布勒","Toilettes":"图瓦莱特",
 "Cantine":"康廷","Bureau":"比赫罗","Entrepôt":"昂特赫波","Dortoir":"多赫图瓦赫","Hôpital":"奥皮塔勒","Pharmacie":"法赫马西",
 "Commissariat de police":"科米萨赫亚 德 波利斯","Pompiers":"蓬皮耶","Ambulance":"昂比于朗斯","Incendie":"安桑迪",
 "Il y a un incendie.":"伊勒 亚 安 安桑迪","Quelqu'un est blessé.":"凯勒坎 埃 布莱塞","Quelqu'un est malade.":"凯勒坎 埃 马拉德",
 "Appelez une ambulance.":"阿普莱 于讷 昂比于朗斯","Appelez la police.":"阿普莱 拉 波利斯","Nous avons besoin d'un médecin.":"努 扎翁 贝赞 德 安 梅德桑",
 "Premiers secours":"普赫米耶 瑟库赫","Blessé":"布莱塞","Saigner":"塞涅","Douleur":"杜勒赫","Fièvre":"菲耶弗赫","Toux":"图","Difficulté à respirer":"迪菲居尔泰 阿 赫斯皮赫",
 "Allergie":"阿莱赫日","Médicament":"梅迪卡芒","Dépêchez-vous, s'il vous plaît.":"德佩谢 武，西勒 武 普莱","Ne vous inquiétez pas.":"讷 武赞基耶泰 帕",
 "Restez calme.":"赫斯泰 卡勒姆","Ne bougez pas.":"讷 布热 帕","Restez ici.":"赫斯泰 伊西","Suivez-moi.":"绥韦 姆瓦","Avancez.":"阿旺塞",
 "Reculez.":"赫居莱","Tournez à gauche.":"图赫内 阿 戈什","Tournez à droite.":"图赫内 阿 德赫瓦特","Arrêtez-vous ici.":"阿赫泰 武 伊西",
 "Quittez cet endroit.":"基泰 塞 唐德赫瓦","Partez immédiatement.":"帕赫泰 伊梅迪亚特芒","Rassemblement":"赫阿桑布勒芒",
 "Rassemblez-vous ici.":"赫阿桑布莱 武 伊西","Compter les personnes.":"孔泰 莱 佩赫松","Effectif":"埃费克蒂夫","Liste nominative":"利斯特 诺米纳蒂夫",
 "Rapport":"赫阿波赫","Rédiger un rapport.":"赫迪热 安 赫阿波赫","Rapport d'incident":"赫阿波赫 丹桑当","Incident":"安桑当","Accident de la circulation":"阿克西当 德 拉 西赫居拉西翁",
 "Vol":"沃勒","Bagarre":"巴加赫","Conflit":"孔弗利","Menace":"默纳斯","Dégât":"德加","Perte":"佩赫特","Trouver":"特赫乌韦","Introuvable":"安特赫乌瓦布勒",
 "Preuve":"普赫弗","Témoin":"特穆安","Suspect":"叙斯佩克","Alerter la police":"阿莱赫泰 拉 波利斯","Enquête":"昂凯特","Interroger":"安特赫罗热",
 "Interdit":"安特赫迪","Autorisé":"奥托赫里泽","Sans autorisation":"桑佐托赫里扎西翁","Accès interdit sans autorisation.":"阿克塞 安特赫迪 桑佐托赫里扎西翁",
 "Le port du casque est obligatoire.":"勒 波赫 迪 卡斯克 埃 扑利加图瓦赫","Le port du gilet réfléchissant est obligatoire.":"勒 波赫 迪 日莱 赫埃弗莱希桑 埃 扑利加图瓦赫",
 "Le port des chaussures de sécurité est obligatoire.":"勒 波赫 德 肖叙赫 德 塞居赫იტे 埃 扑利加图瓦赫","Casque de sécurité":"卡斯克 德 塞居赫იტे",
 "Gilet réfléchissant":"日莱 赫埃弗莱希桑","Chaussures de sécurité":"肖叙赫 德 塞居赫იტे","Gants":"冈","Masque":"马斯克",
 "Lunettes de protection":"吕内特 德 普赫罗克西翁","Harnais de sécurité":"阿赫内 德 塞居赫იტे","Zone dangereuse":"宗 当热赫兹","Zone de sécurité":"宗 德 塞居赫იტे",
 "Chantier":"尚蒂耶","Site minier":"西特 米尼耶","Mine":"米讷","Minerai":"米讷赫埃","Équipement":"埃基普芒","Machine":"马希讷","Outil":"乌蒂",
 "Réparation":"赫帕赫阿西翁","Panne":"帕讷","C'est endommagé.":"塞 唐多马热","Inutilisable":"伊纽蒂利扎布勒","Utilisable":"于蒂利扎布勒",
 "Batterie":"巴特赫里","Pneu":"珀讷","Carburant":"卡赫比赫杭","Gazole":"加佐勒","Essence":"埃桑斯","Faire le plein":"费赫 勒 普兰",
 "Réservoir":"赫泽赫瓦赫","Moteur":"莫特赫赫","Freins":"弗赫安","Volant":"沃朗","Le pneu est dégonflé.":"勒 珀讷 埃 德贡弗莱",
 "Le véhicule est en panne.":"勒 韦伊居勒 埃 唐 帕讷","Il faut réparer.":"伊勒 佛 赫帕赫埃","Prix":"普赫里","C'est trop cher.":"塞 特赫罗 谢赫",
 "Un peu moins cher, s'il vous plaît.":"安 珀 穆安 谢赫，西勒 武 普莱","Je n'ai pas d'argent.":"热 奈 帕 达赫让","J'ai de l'argent liquide.":"热 德 拉赫让 利基德",
 "Monnaie":"莫内","Reçu":"赫叙","Facture":"法克蒂赫","Acheter":"阿什泰","Vendre":"旺德赫","Marché":"马赫谢","Magasin":"马加赞",
 "Nourriture":"努赫里蒂赫","Riz":"赫里","Pain":"潘","Viande":"维昂德","Poisson":"普瓦松","Poulet":"普莱","Légumes":"莱居姆",
 "Fruits":"弗赫吕伊","Sel":"塞勒","Sucre":"叙克赫","Bouteille d'eau":"布泰伊 欧","J'ai faim.":"热 芬","J'ai soif.":"热 苏瓦夫",
 "Je suis fatigué.":"热 绥 法蒂盖","J'ai besoin de me reposer.":"热 贝赞 德 默 赫波泽","Je veux rentrer à la maison.":"热 沃 杭特赫 阿 拉 梅宗",
 "Je suis au travail.":"热 绥 欧 特赫阿瓦伊","J'ai fini le travail.":"热 菲尼 勒 特赫阿瓦伊","Je suis en retard.":"热 绥 昂 赫塔赫",
 "J'arrive tout de suite.":"热 阿赫里夫 图 德 绥特","Je suis déjà arrivé.":"热 绥 德扎 阿赫里韦","Je suis en route.":"热 绥 昂 赫乌特",
 "Attendez-moi un instant.":"阿唐德 姆瓦 安 安斯唐","Il n'y a pas de problème.":"伊勒 尼 亚 帕 德 普赫罗布莱姆","Il y a un problème.":"伊勒 亚 安 普赫罗布莱姆",
 "Résoudre le problème.":"赫泽乌德赫 勒 普赫罗布莱姆","Je vais m'en occuper.":"热 韦 曼 诺居佩","Soyez rassuré.":"斯瓦耶 赫阿叙赫埃",
 "C'est ma responsabilité.":"塞 马 赫斯蓬萨比利泰","Je dois confirmer.":"热 杜瓦 孔菲赫梅","Veuillez confirmer.":"武耶 孔菲赫梅",
 "Veuillez m'informer.":"武耶 曼佛赫梅","Veuillez informer le superviseur.":"武耶 安佛赫梅 勒 叙佩赫维泽赫",
 "Je vais l'informer immédiatement.":"热 韦 兰佛赫梅 伊梅迪亚特芒","Il n'est pas là.":"伊勒 内 帕 拉","Il est au bureau.":"伊勒 埃 欧 比赫罗",
 "Commençons.":"科芒松","Réunion":"赫埃于尼翁","Tenir une réunion":"特尼赫 于讷 赫埃于尼翁","Salle de réunion":"萨勒 德 赫埃于尼翁",
 "Plan":"普朗","Organisation":"奥赫加尼扎西翁","Mission":"米西翁","Terminer":"泰赫米内","Ce n'est pas encore terminé.":"瑟 内 帕赞科赫 泰赫米内",
 "C'est déjà terminé.":"塞 德扎 泰赫米内","À l'heure":"阿 勒赫","En retard":"昂 赫塔赫","Heures supplémentaires":"厄赫叙普莱芒泰赫",
 "Salaire":"萨莱赫","Congé":"孔热","Demander un congé":"德芒德 安 孔热","Contrat":"孔特赫阿","Règlement":"赫格勒芒","Règle":"赫格勒",
 "Respecter le règlement.":"赫斯佩克泰 勒 赫格勒芒","Enfreindre le règlement.":"昂弗赫安德赫 勒 赫格勒芒",
 "Merci de votre coopération.":"梅赫西 德 沃特赫 科奥佩赫阿西翁","Merci de votre compréhension.":"梅赫西 德 沃特赫 孔普赫埃昂西翁",
 "Bon voyage.":"邦 沃瓦雅日","Bonne chance.":"邦 香斯","Joyeux anniversaire.":"茹瓦耶 扎尼韦赫塞赫","Bon week-end.":"邦 维肯德"
})

for k,v in extra.items(): fm[k]=v
for k,v in pron.items(): fr[k]=v
fp=fp[:mm.start()]+"window.SW_FRENCH = "+json.dumps(fm,ensure_ascii=False,separators=(",",":"))+";"+fp[mm.end():]
rr=re.search(r"window\.SW_FRENCH_READINGS\s*=\s*(\{.*?\})\s*;",fp,re.S)
fp=fp[:rr.start()]+"window.SW_FRENCH_READINGS = "+json.dumps(fr,ensure_ascii=False,separators=(",",":"))+";"+fp[rr.end():]
write("french-fallback.js",fp)
app=read("app.js")
if app is None:
    raise SystemExit("app.js is missing")
# Mark the provenance of each local record so pronunciation selection follows the required tiers.
app=app.replace("version:'0.6.5'", "version:'0.6.7'")
app=app.replace(
 "variants:(item.variants||[]).map(v=>({...v}))",
 "variants:(item.variants||[]).map(v=>({...v,origin:'builtin'}))"
)
app=app.replace(
 "else grouped.get(k).variants.push(...(item.variants||[]).map(v=>({...v})));",
 "else grouped.get(k).variants.push(...(item.variants||[]).map(v=>({...v,origin:'builtin'})));"
)
app=app.replace("customId:c.id});", "customId:c.id,origin:'personal'});")
app=app.replace(
 "sharedId:c.id||c.client_submit_id||''",
 "sharedId:c.id||c.client_submit_id||'', origin:'shared'"
)
old_helpers="""function localReadingVariant(item){return (item.variants||[]).find(v=>v.reading)||null;}
function localLatinVariants(item){return (item.variants||[]).map(v=>v.latin).filter(Boolean);}"""
new_helpers="""function preferredLocalVariants(item){
 const variants=(item.variants||[]).filter(v=>v.reading||v.latin);
 // Priority is fixed: the two original source files, then community-shared local Swahili,
 // then personal local additions. French is never treated as a local-language hit.
 for(const origin of ['builtin','shared','personal']){
  const tier=variants.filter(v=>v.origin===origin);
  if(tier.length)return tier;
 }
 return variants;
}
function localReadingVariant(item){return preferredLocalVariants(item).find(v=>v.reading)||null;}
function localLatinVariants(item){return preferredLocalVariants(item).map(v=>v.latin).filter(Boolean);}
function localOrigin(item){
 for(const origin of ['builtin','shared','personal']){
  if((item.variants||[]).some(v=>v.origin===origin&&(v.reading||v.latin)))return origin;
 }
 return null;
}
function lookupLocalAt(input,index){
 let found=null,foundLen=0,foundRank=99;
 const rankOf={builtin:0,shared:1,personal:2};
 for(const item of keys){
  const k=item.zh;if(!k)continue;
  const origin=localOrigin(item);if(!origin)continue;
  const rank=rankOf[origin];
  if(rank>foundRank)continue;
  if(norm(input.slice(index,index+k.length))!==norm(k))continue;
  // Source priority comes first; longest matching phrase breaks ties within the same source tier.
  if(rank<foundRank||(rank===foundRank&&k.length>foundLen)){
   found=item;foundLen=k.length;foundRank=rank;
  }
 }
 return found?{item:found,length:foundLen,origin:localOrigin(found)}:null;
}
function lookupFrenchWithoutLocalOverlap(input,index){
 for(const key of FRENCH_KEYS){
  const raw=input.slice(index,index+key.length);
  if(norm(raw)!==key)continue;
  const end=index+key.length;
  let overlap=false;
  for(let pos=index+1;pos<end;pos++){
   if(lookupLocalAt(input,pos)){overlap=true;break;}
  }
  if(!overlap)return {key,french:FRENCH_MAP.get(key)};
 }
 return null;
}"""
if old_helpers not in app:
    raise SystemExit("local reading helper anchor missing")
app=app.replace(old_helpers,new_helpers,1)
app=app.replace(
 "if(item && (localReadingVariant(item)||localLatinVariants(item).length||frenchFor(item)))",
 "if(item && (localReadingVariant(item)||localLatinVariants(item).length))"
)
tok=app.find("function tokenize(raw)")
start=app.find("  let found=null,foundLen=0;",tok)
end=app.find("  let j=i+1;",start)
if tok<0 or start<0 or end<0:
    raise SystemExit("tokenizer matching block anchors missing")
new_match="""  const localMatch=lookupLocalAt(input,i);
  const found=localMatch?localMatch.item:null;
  const foundLen=localMatch?localMatch.length:0;
  // Local-language synonyms are considered only when no longer exact local entry exists.
  const alias=lookupLocalSynonymAt(input,i);
  if(alias && !localMatch){
   const localV=localReadingVariant(alias.item),latin=localLatinVariants(alias.item);
   if(localV){segments.push({type:'local',zh:input.slice(i,i+alias.alias.length),canonical:alias.target,reading:localV.reading,latin,source:localV.source||'原始资料',item:alias.item,matchedBy:'近义替代',originalTerm:alias.alias});localChars+=alias.alias.length;localHits++;}
   else if(latin.length){segments.push({type:'latinOnly',zh:input.slice(i,i+alias.alias.length),canonical:alias.target,latin,source:'近义替代',matchedBy:'近义替代'});unknownChars+=alias.alias.length;}
   else {segments.push({type:'unknown',text:input.slice(i,i+alias.alias.length)});unknownChars+=alias.alias.length;}
   i+=alias.alias.length;continue;
  }
  // Any original/shared local match wins before a French match, even if French has a longer phrase.
  if(found){
   const localV=localReadingVariant(found),latin=localLatinVariants(found),fr=localFrenchOverride(found)||frenchFor(found);
   if(localV){segments.push({type:'local',zh:input.slice(i,i+foundLen),canonical:found.zh,reading:localV.reading,latin,source:localV.source||'原始资料',item:found,french:fr});localChars+=foundLen;localHits++;}
   else if(latin.length){segments.push({type:'latinOnly',zh:input.slice(i,i+foundLen),canonical:found.zh,latin,source:'已核验拉丁拼写'});unknownChars+=foundLen;}
   else {segments.push({type:'unknown',text:input.slice(i,i+foundLen)});unknownChars+=foundLen;}
   i+=foundLen;continue;
  }
  // French may fill only a gap; it cannot consume a later local-language match.
  const fr=lookupFrenchWithoutLocalOverlap(input,i);
  if(fr){const pron=frenchReadingFor(fr.french);segments.push({type:'french',zh:input.slice(i,i+fr.key.length),canonical:fr.key,french:fr.french,frenchReadingZh:pron,source:'DWSS 法语辅助词表'});frenchChars+=fr.key.length;frenchHits++;i+=fr.key.length;continue;}
"""
app=app[:start]+new_match+app[end:]
old_unknown="""   for(const it of keys){if(it.zh.length>0&&norm(input.slice(j,j+it.zh.length))===norm(it.zh)){exists=true;break;}}
   if(!exists&&lookupFrenchAt(input,j))exists=true;"""
new_unknown="""   if(lookupLocalAt(input,j))exists=true;
   if(!exists&&lookupFrenchWithoutLocalOverlap(input,j))exists=true;"""
if old_unknown not in app:
    raise SystemExit("unknown-segment boundary anchor missing")
app=app.replace(old_unknown,new_unknown,1)
write("app.js",app)

version = read("VERSION.txt")
if version is None:
    raise SystemExit("VERSION.txt is missing")
version = version.replace("Version: 0.6.4", "Version: 0.6.7").replace("Version: 0.6.5", "Version: 0.6.7")
if "Shared vocabulary:" not in version:
    version += "\nShared vocabulary: cloud terms participate in main translation and dictionary search; real-time updates, offline cache and retry queue included.\n"
write("VERSION.txt", version)

# Keep release documentation consistent with the new shared behavior.
guide = read("README_部署与使用.md")
if guide is not None:
    guide = guide.replace("PWA 0.6.3", "PWA 0.6.7").replace("PWA 0.6.5", "PWA 0.6.7").replace("版本 0.6.3", "版本 0.6.7").replace("版本 0.6.5", "版本 0.6.7")
    marker = "## 备份与恢复"
    section = """## 云端共享词库

首页右下角的“共享词库”可以添加当地斯瓦西里语或法语补位词条。在线提交后，词条自动进入 DWSS 共享词库，其他在线设备会收到实时更新，并直接参与主翻译、短句拼配和词典搜索。内置基础词库与个人本地词库保持独立；共享词条在翻译结果中标注为“云端共享词库”。离线新增会暂存在本机，恢复网络后自动提交。清除浏览器站点数据前，请先确认离线队列已同步完成。

"""
    if "## 云端共享词库" not in guide:
        guide = guide.replace(marker, section + marker, 1)
    guide = guide.replace("个人新增词条只保存在当前设备，不会自动跨设备同步。", "个人“词库维护”新增词条仍保存在当前设备；需要跨设备共享时，请使用首页右下角的“共享词库”提交。")
    write("README_部署与使用.md", guide)

print("DWSS 0.6.7 release files finalized.")
