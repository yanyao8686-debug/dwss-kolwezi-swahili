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
            (root/"french-word-index.json").write_text(json.dumps({"wordFormsWithIpa":1,"prefixes":["bo"]}))
            (root/"french-pronunciation-index.json").write_text(json.dumps({"uniqueForms":1,"indexedRows":1,"confidenceCounts":{"A":1},"kindCounts":{"词形":1},"firstKeys":["bang"]}))
            (root/"french-lexicon-sources.txt").write_text("Existing\n")
            src=Path(tmp)/"tiny.jsonl.gz"
            items=[
              {"word":"bonjour","lang_code":"fr","sounds":[{"ipa":"bɔ̃.ʒuʁ"}],"translations":[{"lang_code":"zh","word":"你好"}]},
              {"word":"inédit","lang_code":"fr","sounds":[{"ipa":"i.ne.di"}],"translations":[{"lang_code":"zh","word":"新颖"}]},
              {"word":"not imported phrase","lang_code":"fr","translations":[{"lang_code":"zh","word":"不要导入"}]},
              {"word":"foreign","lang_code":"en","translations":[{"lang_code":"zh","word":"外来词"}]}
            ]
            with src.open("wb") as raw:
                with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0) as out:
                    out.write(("\n".join(json.dumps(x,ensure_ascii=False) for x in items)+"\n").encode())
            report=merge_dictionary(src,root,"2026-10-01","")
            self.assertEqual(report["uniqueFrenchHeadwordsWithChineseTranslations"],2)
            self.assertEqual(report["newGlossWordEntries"],2)
            self.assertEqual(report["newFrenchWordIndexRows"],1)
            self.assertEqual(report["newFrenchPronunciationRows"],1)
            with gzip.open(root/"french-gloss-index.tsv.gz","rt",encoding="utf-8") as f: gloss=f.read()
            self.assertIn("bonjour",gloss); self.assertIn("你好",gloss)
            self.assertIn("inédit",gloss); self.assertIn("新颖",gloss)
            self.assertIn("待人工核对",gloss)
            wm=json.loads((root/"french-word-index.json").read_text())
            self.assertIn("in",wm["prefixes"]); self.assertEqual(wm["wordFormsWithIpa"],2)
            pm=json.loads((root/"french-pronunciation-index.json").read_text())
            self.assertGreaterEqual(pm["indexedRows"],2)
            self.assertTrue((root/"french-WIKTIONARY-ATTRIBUTION.txt").is_file())
if __name__=="__main__": unittest.main()
