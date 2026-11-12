#!/usr/bin/env python3
import gzip,json,tempfile,unittest
from pathlib import Path
from merge_french_wiktionary_zh import ipa_to_chinese,merge_dictionary

class FrenchWiktionaryMergeTests(unittest.TestCase):
    def test_existing_ipa_to_reading_mapping(self):
        self.assertEqual(ipa_to_chinese("bɔ̃.ʒuʁ"),"邦茹赫")
    def test_direct_translation_adds_gloss_and_new_pronunciation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/"public"
            for folder in ("french-word-shards","french-pronunciation-shards"): (root/folder).mkdir(parents=True)
            def gz(path,rows):
                with path.open("wb") as raw:
                    with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0) as out:
                        out.write(("\n".join(rows)+("\n" if rows else "")).encode())
            gz(root/"french-gloss-index.tsv.gz",[])
            gz(root/"french-word-shards"/"bo.tsv.gz",["bonjour\tbonjour\tbɔ̃.ʒuʁ\t邦茹\tA\t词形"])
            gz(root/"french-pronunciation-shards"/"bang.tsv.gz",["bonjour\tbɔ̃.ʒuʁ\t邦茹\tA\t词形"])
            gz(root/"french-pronunciation-shards"/"mo.tsv.gz",["mot\t\t莫\tC\t词形"])
            (root/"french-word-index.json").write_text(json.dumps({"wordFormsWithIpa":1,"prefixes":["bo"]}))
            (root/"french-pronunciation-index.json").write_text(json.dumps({"uniqueForms":2,"indexedRows":2,"formsWithIpa":1,"formsWithoutIpa":1,"confidenceCounts":{"A":1,"C":1},"kindCounts":{"词形":2},"firstKeys":["bang","mo"]}))
            (root/"french-lexicon-sources.txt").write_text("Existing\n")
            src=Path(tmp)/"tiny.jsonl.gz"
            items=[
              {"word":"bonjour","lang_code":"fr","sounds":[{"ipa":"bɔ̃.ʒuʁ"}],"translations":[{"lang_code":"zh","word":"你好"}]},
              {"word":"inédit","lang_code":"fr","sounds":[{"ipa":"i.ne.di"}],"translations":[{"lang_code":"zh","word":"新颖"}]},
              {"word":"not imported phrase","lang_code":"fr","translations":[{"lang_code":"zh","word":"不要导入"}]},
              {"word":"wordwithoutzh","lang_code":"fr","sounds":[{"ipa":"bɔ̃"}],"translations":[]},
              {"word":"mot","lang_code":"fr","translations":[{"lang_code":"zh","word":"词"}]},
              {"word":"foreign","lang_code":"en","translations":[{"lang_code":"zh","word":"外来词"}]}
            ]
            with src.open("wb") as raw:
                with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0) as out:
                    out.write(("\n".join(json.dumps(x,ensure_ascii=False) for x in items)+"\n").encode())
            report=merge_dictionary(src,root,"2026-10-01","")
            self.assertEqual(report["uniqueFrenchSingleWordHeadwords"],4)
            self.assertEqual(report["uniqueFrenchHeadwordsWithChineseTranslations"],3)
            self.assertEqual(report["uniqueFrenchHeadwordsWithoutChineseTranslations"],1)
            self.assertEqual(report["newGlossWordEntries"],3)
            self.assertEqual(report["newFrenchWordIndexRows"],3)
            self.assertEqual(report["newFrenchPronunciationRows"],2)
            with gzip.open(root/"french-gloss-index.tsv.gz","rt",encoding="utf-8") as f: gloss=f.read()
            self.assertIn("bonjour",gloss); self.assertIn("你好",gloss)
            self.assertIn("inédit",gloss); self.assertIn("新颖",gloss); self.assertIn("mot",gloss); self.assertIn("词",gloss)
            self.assertNotIn("wordwithoutzh",gloss)
            self.assertIn("待人工核对",gloss)
            wm=json.loads((root/"french-word-index.json").read_text())
            self.assertIn("in",wm["prefixes"]); self.assertIn("wo",wm["prefixes"]); self.assertIn("mo",wm["prefixes"]); self.assertEqual(wm["wordFormsWithIpa"],3)
            with gzip.open(root/"french-word-shards"/"mo.tsv.gz","rt",encoding="utf-8") as stream:
                self.assertTrue(any(row.split("\t")[0]=="mot" and row.split("\t")[3]=="莫" for row in stream))
            pm=json.loads((root/"french-pronunciation-index.json").read_text())
            self.assertGreaterEqual(pm["indexedRows"],4)
            self.assertEqual(pm["formsWithIpa"],3)
            self.assertEqual(pm["formsWithoutIpa"],1)
            self.assertIn("yi", pm["firstKeys"])
            self.assertFalse(any(x.endswith(".tsv") for x in wm["prefixes"] + pm["firstKeys"]))
            self.assertTrue((root/"french-WIKTIONARY-ATTRIBUTION.txt").is_file())
if __name__=="__main__": unittest.main()
