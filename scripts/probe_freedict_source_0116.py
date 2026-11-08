#!/usr/bin/env python3
from urllib.request import Request, urlopen
from pathlib import Path
import hashlib, tarfile, tempfile, re, json, xml.etree.ElementTree as ET

URL="https://download.freedict.org/dictionaries/fra-zho/2025.11.23/freedict-fra-zho-2025.11.23.src.tar.xz"
EXPECTED="3a101af1bdd523e29f217dd8612ade44dbc73b65b4ea1358ac778ebe155a2cd8b02e3816cb1a9f1dd6500937fa35825d1544db57c5a8aedf71a365c57cdf188a"
req=Request(URL,headers={"User-Agent":"DWSS-French-Lexicon-Build/0.9.116"})
with urlopen(req,timeout=120) as response: data=response.read()
actual=hashlib.sha512(data).hexdigest()
print("FREEDICT_BYTES",len(data),"SHA512_OK",actual==EXPECTED)
if actual!=EXPECTED: raise SystemExit("FreeDict archive SHA512 mismatch")
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp)/"freedict.tar.xz";p.write_bytes(data)
 with tarfile.open(p,"r:xz") as tar:
  members=[m for m in tar.getmembers() if m.isfile()]
  print("ARCHIVE_FILES",[(m.name,m.size) for m in members[:40]])
  for member in members:
   low=member.name.lower()
   if low.endswith((".tei",".xml")):
    b=tar.extractfile(member).read()
    print("XML_FILE",member.name,"BYTES",len(b))
    s=b.decode("utf-8",errors="replace")
    for token in ["<teiHeader","licence","license","availability","<orth","<quote","xml:lang","<pron"]:
     i=s.lower().find(token.lower())
     if i>=0: print("XML_SNIP",token,s[max(0,i-180):i+420].replace("\n"," ")[:650])
    try:
     root=ET.fromstring(b)
     entries=root.findall(".//{*}entry")
     print("ENTRY_COUNT",len(entries))
     if entries:
      for entry in entries[:4]:
       print("ENTRY_XML",ET.tostring(entry,encoding="unicode")[:2200])
    except Exception as e: print("XML_PARSE_ERROR",repr(e))
    break


IPA_URL="https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/fr_FR.txt"
req=Request(IPA_URL,headers={"User-Agent":"DWSS-French-Lexicon-Build/0.9.116"})
with urlopen(req,timeout=120) as response: ipa_data=response.read()
ipa_text=ipa_data.decode("utf-8")
ipa_lines=[line for line in ipa_text.splitlines() if "\t" in line and line.split("\t",1)[0].strip()]
print("IPA_DICT_BYTES",len(ipa_data),"IPA_DICT_ROWS",len(ipa_lines),"FIRST_ROWS",ipa_lines[:8])
print("IPA_DICT_SHA256",hashlib.sha256(ipa_data).hexdigest())

tokens=[line.split("\t",1)[0].strip() for line in ipa_lines]
single=[x for x in tokens if x and not re.search(r"\s",x)]
print("IPA_SINGLE_FORM_ROWS",len(single),"UNIQUE_CASEFOLD",len(set(x.casefold() for x in single)),"MULTIWORD_ROWS",len(tokens)-len(single))
print("IPA_UNIQUE_SAMPLE",list(dict.fromkeys(x.casefold() for x in single))[:20])
