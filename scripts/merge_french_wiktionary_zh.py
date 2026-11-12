#!/usr/bin/env python3
"""Merge direct Chinese translations from French Wiktionary into DWSS indices."""
from __future__ import annotations
import argparse,gzip,hashlib,json,re,unicodedata
from collections import defaultdict
from pathlib import Path
from pypinyin import Style,lazy_pinyin

SOURCE_LABEL="French Wiktionary frwiktionary 2026-10-01 (CC BY-SA 4.0 / GFDL)"
SOURCE_NOTE="Wiktionary 2026-10-01；IPA 来源；中文近似音由程序转写，待人工核对"
CONFIDENCE="W"

def norm(s):
    s=unicodedata.normalize("NFKD",str(s or "").replace("’","'").replace("œ","oe").replace("æ","ae"))
    return re.sub(r"[^a-z0-9]","", "".join(c for c in s if not unicodedata.combining(c)).casefold())
def single_word(s):
    s=str(s or "").strip()
    return bool(s) and len(s)<=80 and re.fullmatch(r"[^\W\d_]+(?:[-'’][^\W\d_]+)*",s,re.UNICODE) is not None
def han(s):
    return any(0x3400<=ord(c)<=0x4DBF or 0x4E00<=ord(c)<=0x9FFF or 0xF900<=ord(c)<=0xFAFF or 0x20000<=ord(c)<=0x3134F for c in str(s or ""))
def clean_zh(s):
    s=re.sub(r"\s+","",str(s or "").replace("\t"," ").replace("\r"," ").replace("\n"," ").replace("¦"," "))
    s=s.strip("；;，,、")
    return s if s and len(s)<=80 and han(s) else ""
def translations(entry):
    yield from (x for x in (entry.get("translations") or []) if isinstance(x,dict))
    for sense in entry.get("senses") or []:
        if isinstance(sense,dict):
            yield from (x for x in (sense.get("translations") or []) if isinstance(x,dict))
def chinese_target(x):
    code=str(x.get("lang_code") or x.get("code") or "").lower().strip()
    lang=str(x.get("lang") or "").casefold().strip()
    return code in {"zh","zh-hans","zh-hant"} or lang in {"chinese","chinois","中文","chinois (mandarin)"}
def choose_ipa(entry):
    opts=[]
    for x in entry.get("sounds") or []:
        if not isinstance(x,dict) or not x.get("ipa"): continue
        tags=[str(t).casefold() for t in x.get("tags") or []]
        rank=0 if not tags else (1 if any("france" in t or "paris" in t for t in tags) else 2)
        opts.append((rank,len(str(x["ipa"])),str(x["ipa"]).strip()))
    return sorted(opts)[0][2] if opts else ""
def pinyin_key(reading):
    p=lazy_pinyin(str(reading or ""),style=Style.NORMAL,errors=lambda chars:list(chars))
    return " ".join(x.lower().replace("ü","v").replace("u:","v") for x in p if x and re.search(r"[a-züv]",x.lower()))

def ipa_to_chinese(ipa):
    # Conservative port of the app's IPA-to-Chinese approximation table.
    vowels=["ɑ̃","ɛ̃","ɔ̃","œ̃","ɑ","a","e","ɛ","i","o","ɔ","u","y","ø","œ","ə"]
    onset={"b":"波","p":"普","t":"特","d":"德","k":"克","g":"格","f":"夫","v":"维","s":"斯","z":"兹","ʃ":"施","ʒ":"日","m":"姆","n":"呢","l":"勒","ʁ":"赫","j":"耶","w":"乌","ɥ":"于","ɲ":"尼","ŋ":"昂"}
    rime={"ɑ̃":"昂","ɛ̃":"安","ɔ̃":"翁","œ̃":"恩","ɑ":"阿","a":"阿","e":"诶","ɛ":"艾","i":"伊","o":"欧","ɔ":"奥","u":"乌","y":"于","ø":"厄","œ":"厄","ə":"呃"}
    coda={"ʁ":"赫","ʃ":"施","s":"斯","z":"兹","t":"特","d":"德","k":"克","g":"格","p":"普","b":"波","m":"姆","n":"恩","l":"勒","f":"夫","v":"维","j":"伊","ɲ":"尼","ŋ":"昂"}
    cv={
      "bɑ̃":"邦","bɔ̃":"邦","ba":"巴","bɑ":"巴","bo":"波","bɔ":"博","bu":"布","be":"贝","bɛ":"贝","bɛ̃":"班","bi":"比","by":"比",
      "pɑ̃":"庞","pɔ̃":"旁","pa":"帕","pɑ":"帕","po":"坡","pɔ":"泊","pu":"普","pe":"佩","pɛ":"派","pɛ̃":"潘","pi":"皮","py":"匹",
      "tɑ̃":"唐","tɔ̃":"通","ta":"塔","tɑ":"塔","to":"托","tɔ":"托","tu":"图","te":"特","tɛ":"泰","tɛ̃":"滩","ti":"提","ty":"提",
      "dɑ̃":"当","dɔ̃":"东","da":"达","dɑ":"达","do":"多","dɔ":"多","du":"杜","de":"德","dɛ":"代","dɛ̃":"丹","di":"迪","dy":"迪",
      "kɑ̃":"康","kɔ̃":"空","ka":"卡","kɑ":"卡","ko":"科","kɔ":"科","ku":"库","ke":"克","kɛ":"凯","kɛ̃":"开","ki":"基","ky":"基",
      "gɑ̃":"刚","gɔ̃":"公","ga":"嘎","gɑ":"嘎","go":"戈","gɔ":"戈","gu":"古","ge":"格","gɛ":"盖","gɛ̃":"干","gi":"吉","gy":"吉",
      "fɑ̃":"方","fɔ̃":"丰","fa":"法","fɑ":"法","fo":"佛","fɔ":"佛","fu":"夫","fe":"费","fɛ":"费","fɛ̃":"芬","fi":"菲","fy":"菲",
      "vɑ̃":"汪","vɔ̃":"翁","va":"瓦","vɑ":"瓦","vo":"沃","vɔ":"沃","vu":"乌","ve":"维","vɛ":"韦","vɛ̃":"万","vi":"维","vy":"维",
      "sɑ̃":"桑","sɔ̃":"松","sa":"萨","sɑ":"萨","so":"索","sɔ":"索","su":"苏","se":"塞","sɛ":"赛","sɛ̃":"森","si":"西","sy":"西",
      "zɑ̃":"藏","zɔ̃":"宗","za":"扎","zɑ":"扎","zo":"佐","zɔ":"佐","zu":"祖","ze":"泽","zɛ":"宅","zɛ̃":"赞","zi":"兹","zy":"兹",
      "ʃɑ̃":"尚","ʃɔ̃":"尚","ʃa":"沙","ʃɑ":"沙","ʃo":"肖","ʃɔ":"肖","ʃu":"舒","ʃe":"谢","ʃɛ":"谢","ʃɛ̃":"山","ʃi":"西","ʃy":"许",
      "ʒɑ̃":"让","ʒɔ̃":"让","ʒa":"扎","ʒɑ":"扎","ʒo":"热","ʒɔ":"若","ʒu":"茹","ʒe":"热","ʒɛ":"热","ʒɛ̃":"让","ʒi":"日","ʒy":"茹",
      "mɑ̃":"芒","mɔ̃":"蒙","ma":"马","mɑ":"马","mo":"莫","mɔ":"莫","mu":"姆","me":"梅","mɛ":"麦","mɛ̃":"曼","mi":"米","my":"米",
      "nɑ̃":"南","nɔ̃":"农","na":"纳","nɑ":"纳","no":"诺","nɔ":"诺","nu":"努","ne":"内","nɛ":"奈","nɛ̃":"南","ni":"尼","ny":"纽",
      "lɑ̃":"朗","lɔ̃":"隆","la":"拉","lɑ":"拉","lo":"洛","lɔ":"洛","lu":"卢","le":"勒","lɛ":"莱","lɛ̃":"兰","li":"里","ly":"吕",
      "ʁɑ̃":"让","ʁɔ̃":"让","ʁa":"拉","ʁɑ":"拉","ʁo":"若","ʁɔ":"若","ʁu":"赫","ʁe":"热","ʁɛ":"赖","ʁɛ̃":"兰","ʁi":"里","ʁy":"于",
      "wa":"瓦","wɑ":"瓦","wɛ":"韦","wi":"威","wɔ":"沃","wo":"沃","ɥi":"于伊","ɥɛ":"于艾","ja":"亚","jɑ":"亚","je":"耶","jɛ":"耶","jo":"约","ju":"优","jy":"于"
    }
    raw=str(ipa or "").strip().lower().replace("ˈ","").replace("ˌ","").replace("ː","").replace("ˑ","").replace("‿","")
    raw=raw.strip("/[]{} ").split(";")[0].split(",")[0]
    phonemes=["tʃ","dʒ","ʁ","ʃ","ʒ","ɲ","ŋ","ɥ","j","w","b","p","t","d","k","g","f","v","s","z","m","n","l","h"]
    def tok(s):
        out=[]; i=0
        while i<len(s):
            p=next((x for x in phonemes if s.startswith(x,i)),None)
            if p: out.append(p); i+=len(p)
            else: out.append(s[i]); i+=1
        return out
    out=[]
    for syl in re.split(r"[.\s]+",raw):
        if not syl: continue
        nucleus=""; pos=-1
        for i in range(len(syl)):
            v=next((x for x in vowels if syl.startswith(x,i)),None)
            if v: nucleus=v; pos=i; break
        if pos<0: out.append("".join(coda.get(x,"") for x in tok(syl)) or "呃"); continue
        onset_text=syl[:pos]; coda_text=syl[pos+len(nucleus):]
        rendered=cv.get(onset_text+nucleus)
        if not rendered:
            rendered=onset.get(onset_text,"".join(onset.get(x,"") for x in tok(onset_text)))+rime.get(nucleus,"")
        rendered+="".join(coda.get(x,"") for x in tok(coda_text))
        out.append(rendered or "呃")
    return "".join(out)

def hash_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()
def read_gz(path):
    if not path.exists(): return []
    with gzip.open(path,"rt",encoding="utf-8",newline="") as f: return [x.rstrip("\r\n") for x in f if x.strip()]
def write_gz(path,lines):
    path.parent.mkdir(parents=True,exist_ok=True); tmp=path.with_suffix(path.suffix+".tmp")
    with tmp.open("wb") as raw:
        with gzip.GzipFile(filename="",mode="wb",fileobj=raw,compresslevel=9,mtime=0) as out:
            out.write(("\n".join(lines)+("\n" if lines else "")).encode("utf-8"))
    tmp.replace(path)

def load_known(root,candidates,folder,kind):
    found={}
    for path in (root/folder).glob("*.tsv.gz"):
        with gzip.open(path,"rt",encoding="utf-8",newline="") as f:
            for line in f:
                a=line.rstrip("\r\n").split("\t")
                if kind=="word":
                    if len(a)<6: continue
                    key=norm(a[1]); row={"word":a[1],"ipa":a[2],"reading":a[3],"confidence":a[4],"kind":a[5]}
                else:
                    if len(a)<5: continue
                    key=norm(a[0]); row={"word":a[0],"ipa":a[1],"reading":a[2],"confidence":a[3],"kind":a[4]}
                if key in candidates and key not in found and row["reading"] and row["reading"]!="谐音待补": found[key]=row
    return found

def merge_dictionary(raw_path,root,dump_date,source_sha256=""):
    if dump_date!="2026-10-01": raise ValueError("Unexpected frwiktionary dump date: "+dump_date)
    if not raw_path.is_file() or (source_sha256 and raw_path.stat().st_size<500_000_000):
        raise ValueError("French Wiktionary raw dataset is missing or unexpectedly small.")
    digest=hash_file(raw_path)
    if source_sha256 and digest!=source_sha256: raise ValueError("French Wiktionary raw dataset SHA-256 mismatch.")
    candidates={}; french_entries=0; entries_zh=0; translations_seen=0; words_without_ipa=0
    with gzip.open(raw_path,"rt",encoding="utf-8",errors="replace") as f:
        for number,line in enumerate(f,1):
            if not line.strip(): continue
            try: entry=json.loads(line)
            except json.JSONDecodeError: raise ValueError(f"Invalid Wiktionary JSONL at line {number}")
            if not isinstance(entry,dict) or entry.get("lang_code")!="fr": continue
            french_entries+=1
            word=str(entry.get("word") or "").strip()
            if not single_word(word): continue
            key=norm(word)
            if not key: continue
            ipa=choose_ipa(entry)
            if not ipa: words_without_ipa+=1
            meanings=[]
            for x in translations(entry):
                if not chinese_target(x): continue
                translations_seen+=1
                for v in (x.get("word"),x.get("alt")):
                    z=clean_zh(v)
                    if z and z not in meanings: meanings.append(z)
            if meanings: entries_zh+=1
            row=candidates.setdefault(key,{"word":word,"meanings":[],"ipa":""})
            if not row["ipa"] and ipa: row["ipa"]=ipa
            for z in meanings:
                if z not in row["meanings"] and len(row["meanings"])<10: row["meanings"].append(z)
    if not candidates: raise ValueError("No single-word French headwords were found in the Wiktionary source.")
    words_without_ipa=sum(1 for item in candidates.values() if not item["ipa"])
    keys=set(candidates)
    known_words=load_known(root,keys,"french-word-shards","word")
    known_prons=load_known(root,keys,"french-pronunciation-shards","pron")
    known={**known_prons,**known_words}
    gloss_path=root/"french-gloss-index.tsv.gz"
    gloss_rows=[x.split("\t") for x in read_gz(gloss_path)]
    gloss_indices=defaultdict(list); gloss_meanings=defaultdict(set)
    for i,row in enumerate(gloss_rows):
        if len(row)<5: continue
        k=norm(row[1])
        if not k: continue
        gloss_indices[k].append(i); gloss_meanings[k].update(x for x in row[4].split("¦") if x)
    new_word=defaultdict(list); new_pron=defaultdict(list)
    new_gloss=merged_meanings=skipped=0
    for key,item in candidates.items():
        old=known.get(key); ipa=(old or {}).get("ipa") or item["ipa"]
        stored_reading=(old or {}).get("reading") or ""
        auto_generated=not stored_reading or stored_reading=="谐音待补"
        reading=ipa_to_chinese(ipa) if auto_generated and ipa else stored_reading
        if not reading or reading=="谐音待补": skipped+=1; continue
        confidence=CONFIDENCE if auto_generated else ((old or {}).get("confidence") or "I")
        source_note=SOURCE_NOTE if auto_generated else "Wiktionary 2026-10-01 中文直译；沿用 DWSS 已有中文近似音"
        word=(old or {}).get("word") or item["word"]; kind=(old or {}).get("kind") or "词形"
        pkey=pinyin_key(reading)
        if not pkey: skipped+=1; continue
        first=pkey.split()[0]; prefix=key[:2] if len(key)>1 else key+"_"
        if key not in known_words: new_word[prefix].append("\t".join((key,word,ipa,reading,confidence,kind)))
        if key not in known_prons: new_pron[first].append("\t".join((word,ipa,reading,confidence,kind)))
        if item["meanings"]:
            if key not in gloss_indices:
                gloss_rows.append([pkey,word,ipa,reading,"¦".join(item["meanings"]),confidence,source_note])
                gloss_indices[key].append(len(gloss_rows)-1); gloss_meanings[key].update(item["meanings"]); new_gloss+=1
            else:
                idx=gloss_indices[key][0]; additions=[m for m in item["meanings"] if m not in gloss_meanings[key]]
                if additions:
                    gloss_rows[idx][4]="¦".join(list(dict.fromkeys(gloss_rows[idx][4].split("¦")+additions))[:12])
                    existing_source=gloss_rows[idx][6] if len(gloss_rows[idx])>6 else ""
                    if SOURCE_LABEL not in existing_source:
                        source=(existing_source+"; " if existing_source else "")+SOURCE_LABEL+" / "+source_note
                        if len(gloss_rows[idx])>6: gloss_rows[idx][6]=source
                        else: gloss_rows[idx].append(source)
                    gloss_meanings[key].update(additions); merged_meanings+=len(additions)
    # Upsert word rows; preserve every existing verified LeXiK reading.
    added_word=0; updated_word=0; added_word_with_ipa=0
    for prefix,rows in new_word.items():
        path=root/"french-word-shards"/(prefix+".tsv.gz")
        old=read_gz(path); positions={}
        for i,line in enumerate(old):
            a=line.split("\t")
            if len(a)>=6: positions[norm(a[0])]=i
        changed=False
        for line in rows:
            a=line.split("\t"); key=norm(a[0])
            if key in positions:
                idx=positions[key]; previous=old[idx].split("\t")
                if len(previous)>=6 and (not previous[3] or previous[3]=="谐音待补"):
                    old[idx]="\t".join((previous[0],previous[1] or a[1],previous[2] or a[2],a[3],a[4],previous[5] or a[5]))
                    changed=True; updated_word+=1
                    if len(previous)>=3 and not previous[2] and a[2]: added_word_with_ipa+=1
            else:
                positions[key]=len(old); old.append(line); added_word+=1; changed=True
                if a[2]: added_word_with_ipa+=1
        if changed: write_gz(path,old)
    if new_word:
        path=root/"french-word-index.json"; meta=json.loads(path.read_text(encoding="utf-8"))
        meta["prefixes"]=sorted({p.name[:-7] for p in (root/"french-word-shards").glob("*.tsv.gz")})
        meta["prefixCount"]=len(meta["prefixes"])
        meta["wordFormsWithIpa"]=int(meta.get("wordFormsWithIpa") or 0)+added_word_with_ipa
        meta["wiktionaryFrenchZhDumpDate"]=dump_date
        path.write_text(json.dumps(meta,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")

    # Delete stale placeholder rows for entries being completed, even if their old
    # pinyin prefix differs from the generated pronunciation new prefix.
    missing_pron_keys={norm(line.split("\t",1)[0]) for rows in new_pron.values() for line in rows}
    if missing_pron_keys:
        for path in (root/"french-pronunciation-shards").glob("*.tsv.gz"):
            old=read_gz(path); filtered=[]
            for line in old:
                a=line.split("\t"); key=norm(a[0]) if a else ""
                if key in missing_pron_keys and (len(a)<5 or not a[2] or a[2]=="谐音待补"):
                    continue
                filtered.append(line)
            if len(filtered)!=len(old): write_gz(path,filtered)

    added_pron=0
    for first,rows in new_pron.items():
        path=root/"french-pronunciation-shards"/(first+".tsv.gz")
        old=read_gz(path); existing={norm(x.split("\t",1)[0]) for x in old}
        for line in rows:
            key=norm(line.split("\t",1)[0])
            if key not in existing:
                old.append(line); existing.add(key); added_pron+=1
        if old: write_gz(path,old)

    if new_pron:
        path=root/"french-pronunciation-index.json"; meta=json.loads(path.read_text(encoding="utf-8"))
        all_rows=0; all_words=set(); counts=defaultdict(int); kinds=defaultdict(int); first_keys=[]
        for shard in sorted((root/"french-pronunciation-shards").glob("*.tsv.gz")):
            first_keys.append(shard.name[:-7])
            for line in read_gz(shard):
                a=line.split("\t")
                if len(a)<5: continue
                all_rows+=1; key=norm(a[0])
                if key: all_words.add(key)
                counts[a[3] or "I"]+=1; kinds[a[4] or "词形"]+=1
        meta["firstKeys"]=first_keys; meta["indexedRows"]=all_rows
        meta["uniqueForms"]=len(all_words); meta["confidenceCounts"]=dict(counts)
        meta["kindCounts"]=dict(kinds); meta["formsWithIpa"]=sum(1 for shard in (root/"french-pronunciation-shards").glob("*.tsv.gz") for line in read_gz(shard) if len(line.split("\t"))>=5 and line.split("\t")[1])
        meta["formsWithoutIpa"]=all_rows-meta["formsWithIpa"]; meta["wiktionaryFrenchZhDumpDate"]=dump_date
        path.write_text(json.dumps(meta,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")

    write_gz(gloss_path,["\t".join(x) for x in gloss_rows])
    src=root/"french-lexicon-sources.txt"; source_text=src.read_text(encoding="utf-8")
    if SOURCE_LABEL not in source_text:
        src.write_text(source_text.rstrip()+"\n\nDWSS French Wiktionary Chinese translations\nSource: https://kaikki.org/frwiktionary/rawdata.html\nDump: 2026-10-01; extracted 2026-11-02 with Wiktextract.\nFields: all single-word lang_code=fr headwords with a usable IPA or existing DWSS reading; direct lang_code=zh translations are attached when available; phrases are excluded.\nLicense: CC BY-SA 4.0 and GFDL. See french-WIKTIONARY-ATTRIBUTION.txt.\nNew Chinese approximations are generated from source IPA and marked W for human review.\n",encoding="utf-8")
    (root/"french-WIKTIONARY-ATTRIBUTION.txt").write_text(
        "DWSS 法语中文释义与发音补充来源\n来源：法语版 Wiktionary 的 Wiktextract JSONL 数据，由 kaikki.org 发布。\n数据页：https://kaikki.org/frwiktionary/Fran%C3%A7ais/index.html\n原始数据页：https://kaikki.org/frwiktionary/rawdata.html\nDump 日期：2026-10-01；提取日期：2026-11-02。\n本次 raw-wiktextract-data.jsonl.gz SHA-256："+digest+"\n规则：收录 lang_code=fr 的单词词头；有 lang_code=zh 的直接中文翻译时一并写入释义。没有中文译项的单词仍可作为发音词条收录，但不编造中文释义；不导入短语词头。\n发音：优先沿用 DWSS/LeXiK 已有 IPA 和中文近似音；如果已有 IPA 但缺少中文近似音，则按 IPA 自动生成并标记 W（自动拟音待人工核对）。对于 Wiktionary 有 IPA 的新词，使用来源 IPA；没有 IPA 但 DWSS 已有可靠中文谐音的词仍可收录。\n许可证：Wiktionary 内容按 CC BY-SA 4.0 与 GNU Free Documentation License (GFDL) 发布。保留本来源说明并遵循相应署名、相同方式共享要求；本次抽取、整理的衍生词条数据按 CC BY-SA 4.0 与 GFDL 的相同方式共享要求发布。\n学术引用：Tatu Ylonen, Wiktextract: Wiktionary as Machine-Readable Structured Data, LREC 2022。\n注意：本文件及其自动拟音不表示读音已经由法语母语者逐条核验。\n",encoding="utf-8")
    report={
      "source":"French Wiktionary via Kaikki/Wiktextract","sourceDumpDate":dump_date,"sourceSha256":digest,
      "frenchEntriesExamined":french_entries,"frenchHeadwordsWithChineseTranslations":entries_zh,
      "chineseTranslationRecordsSeen":translations_seen,"uniqueFrenchSingleWordHeadwords":len(candidates),
      "uniqueFrenchHeadwordsWithChineseTranslations":sum(1 for x in candidates.values() if x["meanings"]),
      "uniqueFrenchHeadwordsWithoutChineseTranslations":sum(1 for x in candidates.values() if not x["meanings"]),
      "headwordsWithoutSourceIPA":words_without_ipa,"newFrenchWordIndexRows":added_word,"updatedFrenchWordIndexRows":updated_word,
      "newFrenchPronunciationRows":added_pron,"newGlossWordEntries":new_gloss,
      "additionalMeaningsMergedIntoExistingGlossEntries":merged_meanings,"headwordsSkippedWithoutReliableIPAOrReading":skipped,
      "finalGlossRows":len(gloss_rows),"confidenceCodeForNewAutomaticReadings":CONFIDENCE,
      "readingNotice":"Chinese approximations are automatically derived from IPA and require human verification."
    }
    (root/"french-wiktionary-coverage.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return report

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",type=Path,required=True); p.add_argument("--public",type=Path,required=True)
    p.add_argument("--dump-date",required=True); p.add_argument("--sha256",default="")
    a=p.parse_args()
    print("French Wiktionary merge: "+json.dumps(merge_dictionary(a.source,a.public,a.dump_date,a.sha256),ensure_ascii=False))
if __name__=="__main__": main()
