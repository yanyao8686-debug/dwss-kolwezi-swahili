'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const crypto = require('crypto');
const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const bytes = name => fs.readFileSync(path.join(root, name));
function assert(ok, message) { if (!ok) throw new Error(message); }

const html = read('index.html');
const app = read('app.js');
const shared = read('shared-lexicon.js');
const sw = read('sw.js');
const version = read('VERSION.txt');
const ext = read('french-extension.js');
const meta = JSON.parse(read('french-pronunciation-index.json'));

assert(version.includes('Version: 0.9.120'), 'VERSION.txt is not 0.9.120');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_120'), 'HTML auto-update marker not updated');
assert(!html.includes('DWSS_AUTO_UPDATE_0_9_118'), 'stale HTML auto-update marker remains');
assert(app.includes("version:'0.9.120'"), 'app metadata version mismatch');
assert(sw.includes("const APP_VERSION = '0.9.120';"), 'Service Worker version mismatch');
assert(sw.includes("'./french-gloss-index.tsv.gz'"), 'French gloss dictionary not precached');
assert(sw.includes("'./french-pronunciation-index.json'"), 'French pronunciation metadata not precached');
assert(!sw.includes("'./french-ipa-index.tsv.gz'"), 'obsolete monolithic IPA file remains in precache');
assert(sw.includes("cache.put(request, fresh.clone())"), 'Service Worker no longer runtime-caches requested pronunciation shards');
assert(ext.includes('SHARD_BASE') && ext.includes('loadPronunciationShard'), 'French runtime does not use on-demand shards');
assert(!ext.includes('firstRanges') && !ext.includes('rowsForFirst'), 'Old monolithic in-memory pronunciation lookup remains');
assert(ext.includes('confidenceLabel(variant.confidence)'), 'French result cards do not display pronunciation confidence');
assert(ext.includes('normalizeLeXiKPhone(ipa)'), 'IPA normalizer is not used by the transliterator');

for (const id of [
  'resultFrenchReading','dwssMainLanguagePicker','dwssMainFrMode',
  'pronunciationFrenchSearch','dwssPronunciationMode','dwssSaveFrenchCorrection'
]) {
  assert((html.match(new RegExp('id="' + id + '"','g')) || []).length === 1, 'missing or duplicated UI id: ' + id);
}
assert(html.includes('#resultCard #resultFrenchReading{display:block!important;align-items:initial!important;'), 'French result field no longer matches Swahili style');
assert(html.includes('约覆盖 212 万种词形') || html.includes('约覆盖 212 万种词形'.replace('212','212')), 'French coverage note missing');
assert(app.includes("french:String(t.french_text||'').trim()"), 'shared French spelling is not read from Supabase');
assert(app.includes("french:String(c.french||'').trim()"), 'shared French spelling is not retained in dictionary rebuild');
assert(app.includes("frenchReadingZh:String(c.frenchReadingZh||'').trim()"), 'shared French homophone is not retained in dictionary rebuild');

// Exercise LeXiK transcription cleanup and Chinese approximation.
const sandboxWindow = {};
vm.runInNewContext(ext, { window: sandboxWindow, document: null, console });
const tools = sandboxWindow.DWSSFrenchTools;
assert(tools && typeof tools.normalizeLeXiKPhone === 'function', 'LeXiK IPA normalizer not exported');
assert(tools.normalizeLeXiKPhone('dis[s>z;s>]') === 'dis', 'optional liaison note was not removed');
assert(tools.normalizeLeXiKPhone('*h*e.ʁo[z]') === 'e.ʁo', 'aspirated-h and optional liaison normalization failed');
assert(tools.normalizeLeXiKPhone('{ɛ|e}ɡ.zɔ̃.de') === 'ɛg.zɔ̃.de', 'IPA alternatives or g normalization failed');
assert(tools.ipaToChinese('bɔ̃.ʒuʁ') === '邦茹赫', 'bonjour IPA approximation must produce 邦茹赫');
assert(tools.ipaToChinese('mɛʁ.si') === '麦赫西', 'merci IPA approximation must produce 麦赫西');
assert(tools.ipaToChinese('t‿ɛl') === '泰勒', 'liaison normalization/transliteration failed');
assert(tools.confidenceLabel ? tools.confidenceLabel('G').includes('模型预测') : ext.includes('G · 模型预测'), 'G model-predicted confidence is not labelled');

// Validate the small Chinese-gloss dictionary, including an actual LeXiK-backed pronunciation.
const glossLines = zlib.gunzipSync(bytes('french-gloss-index.tsv.gz')).toString('utf8').split(/\r?\n/).filter(Boolean);
assert(glossLines.length >= 9000, 'French-Chinese gloss index is unexpectedly small');
let bonjourGloss = false;
let merciGloss = false;
for (const line of glossLines) {
  const f = line.split('\t');
  assert(f.length >= 6 && f[1] && f[2] && f[3] && f[4], 'French gloss row lacks spelling, IPA, Chinese reading or gloss');
  if (f[1].toLowerCase() === 'bonjour') {
    bonjourGloss = true;
    assert(f[2] && f[3], 'bonjour gloss lacks IPA/Chinese approximation');
  }
  if (f[1].toLowerCase() === 'merci') merciGloss = true;
}
assert(bonjourGloss && merciGloss, 'French-Chinese glossary missing core greeting words');

// Verify every single pronunciation shard and every published row, not just a sample.
assert(Array.isArray(meta.firstKeys) && meta.firstKeys.length >= 100, 'LeXiK shard key list missing or too small');
assert(meta.formsWithIpa >= 2000000 && meta.indexedRows === meta.formsWithIpa, 'LeXiK form coverage is below the expected range');
assert(meta.formsWithoutIpa >= 0 && meta.uniqueForms >= meta.formsWithIpa, 'LeXiK missing-pronunciation accounting is invalid');
assert(meta.confidenceCounts && meta.confidenceCounts.G > 0, 'LeXiK model-predicted confidence population missing');
assert(meta.confidenceCounts.A > 0 && meta.confidenceCounts.B > 0, 'LeXiK source-validated pronunciations missing');
let indexedRows = 0;
let seenFirstKeys = new Set();
let foundBonjour = false;
let foundMerci = false;
let sawModelPredicted = false;
for (const key of meta.firstKeys) {
  assert(!seenFirstKeys.has(key), 'duplicate first-pinyin shard key: ' + key);
  seenFirstKeys.add(key);
  const filename = path.join('french-pronunciation-shards', key + '.tsv.gz');
  const lines = zlib.gunzipSync(bytes(filename)).toString('utf8').split(/\r?\n/).filter(Boolean);
  assert(lines.length > 0, 'empty LeXiK shard: ' + key);
  for (const line of lines) {
    const f = line.split('\t');
    assert(f.length === 5, 'invalid LeXiK shard row shape');
    assert(f[0] && f[1] && f[2] && f[3] && f[4], 'included French form is missing IPA/Chinese approximation/confidence');
    assert(!f[2].includes('【读音待校】'), 'unsupported IPA was silently presented as a pronunciation');
    if (f[0].toLowerCase() === 'bonjour') {
      foundBonjour = true;
      assert(f[2] === '邦茹赫', 'LeXiK bonjour Chinese approximation differs from the IPA mapping');
    }
    if (f[0].toLowerCase() === 'merci') {
      foundMerci = true;
      assert(f[2] === '麦赫西', 'LeXiK merci Chinese approximation differs from the IPA mapping');
    }
    if (f[3] === 'G') {
      sawModelPredicted = true;
    }
    indexedRows += 1;
  }
}
assert(indexedRows === meta.indexedRows, 'LeXiK sharded row count does not match metadata');
assert(foundBonjour && foundMerci, 'LeXiK pronunciation index missing bonjour or merci');
assert(sawModelPredicted, 'No G records were found to test low-confidence labelling');

// Confirm phrase composition still uses the bilingual glossary and returns the exact IPA source.
const meaningIndex = new Map([
  ['你好', [{ word: 'bonjour', ipa: 'bɔ̃.ʒuʁ', reading: '邦茹赫', confidence: 'B' }]],
  ['谢谢', [{ word: 'merci', ipa: 'mɛʁ.si', reading: '麦赫西', confidence: 'A' }]]
]);
const phrase = tools.translateChinese('你好，谢谢', meaningIndex);
assert(phrase.reading.includes('邦茹赫') && phrase.reading.includes('麦赫西'), 'Chinese-to-French phrase composition failed');
assert(phrase.ipa.includes('/bɔ̃.ʒuʁ/') && phrase.ipa.includes('/mɛʁ.si/'), 'Chinese-to-French result lost original IPA for verification');
assert(phrase.ipa.includes('多个独立来源一致') || phrase.ipa.includes('单一来源，经独立校验'), 'Chinese-to-French result lost pronunciation confidence label');


// Validate the French spelling-indexed shards used to pronounce machine-translated sentences.
const runtime = read('french-translation-runtime.js');
const wordMeta = JSON.parse(read('french-word-index.json'));
assert(runtime.includes('dwss-french-language'), 'French translation Edge Function endpoint missing');
assert(runtime.includes('action: "translate"'), 'Chinese-to-French sentence translation action missing');
assert(runtime.includes('action: "check"'), 'manual French grammar-check action missing');
assert(runtime.includes('addEventListener("click", runGrammarCheck)'), 'LanguageTool proofreading is not user-triggered');
assert(runtime.includes('languagetool.org'), 'LanguageTool attribution link missing');
assert(Array.isArray(wordMeta.prefixes) && wordMeta.prefixes.includes('bo') && wordMeta.prefixes.includes('me'),
  'French word-prefix index misses bonjour/merci prefixes');
assert(wordMeta.wordFormsWithIpa >= 1000000, 'French orthographic pronunciation coverage unexpectedly small');
const helperWindow = {};
vm.runInNewContext(runtime, { window: helperWindow, document: null, console });
const helper = helperWindow.DWSSFrenchMachineTranslation;
assert(helper && helper.normalizeFrenchWord('École') === 'ecole', 'French accent normalization failed');
assert(helper.normalizeFrenchWord("l’été") === 'lete', 'French apostrophe normalization failed');
assert(helper.wordPrefix('bonjour') === 'bo' && helper.wordPrefix('merci') === 'me', 'French orthographic prefix selection failed');
assert(helper.wordPrefix('à') === 'a_', 'single-letter French form shard selection failed');

let wordRows = 0;
let sawBonjour = false;
let sawMerci = false;
for (const prefix of wordMeta.prefixes) {
  const filename = path.join('french-word-shards', prefix + '.tsv.gz');
  const lines = zlib.gunzipSync(bytes(filename)).toString('utf8').split(/\r?\n/).filter(Boolean);
  assert(lines.length > 0, 'empty French orthographic pronunciation shard: ' + prefix);
  let previous = '';
  for (const line of lines) {
    const f = line.split('\t');
    assert(f.length === 6 && f.every(Boolean), 'invalid French spelling-index row shape');
    assert(f[0].startsWith(prefix.replace(/_$/, '')), 'French orthographic shard contains a wrong prefix');
    if (f[0] === 'bonjour') {
      sawBonjour = true;
      assert(f[2] && f[3], 'bonjour is missing LeXiK IPA or Chinese reading');
    }
    if (f[0] === 'merci') {
      sawMerci = true;
      assert(f[2] && f[3], 'merci is missing LeXiK IPA or Chinese reading');
    }
    wordRows += 1;
  }
}
assert(wordRows === wordMeta.wordFormsWithIpa, 'French orthographic shard row count mismatch');
assert(sawBonjour && sawMerci, 'French orthographic pronunciation index is missing sample words');
assert(sw.includes("'./french-word-index.json'"), 'word-index bootstrap not precached');
assert(sw.includes("'./french-translation-runtime.js'"), 'machine-translation runtime not precached');
assert(html.includes('french-translation-runtime.js'), 'machine-translation runtime is not loaded by the page');

// Official LeXiK attribution and licence are included.
assert(fs.existsSync(path.join(root, 'french-LEXIK-LICENSE.txt')), 'LeXiK licence text missing');
assert(read('french-lexicon-sources.txt').includes('LeXiK 1.0'), 'LeXiK attribution missing');
assert(read('french-lexicon-sources.txt').includes('CC BY-SA 4.0'), 'LeXiK licence attribution missing');

// Protected assets must remain exactly as in 0.9.118.
const protectedAssets = {
  'cover.webp': 'b6bce40baebb9b645e1d4ccac588e6c18291a0dca50fd8aa3aaca73fcb707a1a',
  'DWSS-Android-Installer.apk': '9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5',
  'dictionary.js.gz': 'a8ec3c5738cbac04bc0e8841d1521e1a04db1d255c5d8cae70d503b37b6109b3',
  'dictionary-overrides.js': 'aa02aaa70a6e9876bc347b716793dd13b1371b33fba4bce3f414625b4a305dbe',
  'pwa.js': '3073e4a808e3e296c625e928bb093120f2d52f9cd1b0adbb524c6ae6492f6d1f',
  'boot.js': 'f311e1e4ded4c17adda95927e5f58bdbd3a47ed872676389462664ee201f1ce5',
  'manifest.webmanifest': '3006fc878f2c0f26dad097c46165cf476817e02560a5fa5d0fe6403f2e6838df',
  'pronunciation-search.js': 'd68ad9bb5cc5a79e98e6147908cdce238e07babef1b26b7db2418be04e8fd30d',
  'dwss-pronunciation-controls.js': 'b0184efc5cae2c65423b04fa1e909f2baa5e11edf19458fd2e189a6d4c51d52c'
};
for (const [name, expected] of Object.entries(protectedAssets)) {
  const actual = crypto.createHash('sha256').update(bytes(name)).digest('hex');
  assert(actual === expected, 'protected pre-release asset changed: ' + name);
}
assert(bytes('cover.webp').length > 10000 && bytes('DWSS-Android-Installer.apk').length > 100000, 'cover or APK is unexpectedly empty');
console.log('PASS DWSS 0.9.120: ' + meta.formsWithIpa + ' French forms with IPA and Chinese approximate readings across ' + meta.firstKeys.length + ' on-demand shards; ' + glossLines.length + ' French-Chinese gloss entries; all shard rows checked; IPA cleanup, confidence labels, phrase composition, offline cache, cover and APK verified.');
