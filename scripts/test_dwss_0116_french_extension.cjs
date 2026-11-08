'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
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

// Exercise the production IPA-to-Chinese approximation and word lookup helper.
const sandboxWindow = {};
vm.runInNewContext(ext, { window: sandboxWindow, document: null, console });
const tools = sandboxWindow.DWSSFrenchTools;
assert(tools && typeof tools.ipaToChinese === 'function', 'French sound helper not exported');
assert(tools.ipaToChinese('bɔ̃.ʒuʁ') === '邦茹赫', "bonjour IPA approximation must produce 邦茹赫");
assert(tools.ipaToChinese('mɛʁ.si') === '麦赫西', 'merci IPA approximation is unexpected');
const meaningIndex = new Map([
  ['你好', [{ word: 'bonjour', ipa: 'bɔ̃.ʒuʁ', reading: '邦茹赫' }]],
  ['谢谢', [{ word: 'merci', ipa: 'mɛʁ.si', reading: '麦赫西' }]]
]);
const phrase = tools.translateChinese('你好，谢谢', meaningIndex);
assert(phrase.reading.includes('邦茹赫') && phrase.reading.includes('麦赫西'), 'Chinese-to-French homophone phrase composition failed');
assert(phrase.words.includes('bonjour') && phrase.words.includes('merci'), 'French spelling lookup not returned');

// Check the generated offline data pack.
const raw = zlib.gunzipSync(bytes('french-ipa-index.tsv.gz')).toString('utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
assert(lines.length >= 200000, 'French IPA row count is below expected coverage');
const fields = lines.map(line => line.split('\t'));
assert(fields.every(x => x.length >= 5 && x[0] && x[1] && x[2] && x[3]), 'French IPA TSV has malformed rows');
const forms = new Set(fields.map(x => x[1].toLocaleLowerCase('fr')));
assert(forms.size >= 240000, 'unique French single-word/inflected forms are below expected coverage');
const withGloss = fields.filter(x => x[4]).length;
assert(withGloss >= 9000, 'French-Chinese glossary count is below expected coverage');
assert(fields.some(x => x[1].toLowerCase() === 'bonjour' && x[4]), 'bonjour French-Chinese headword is missing');
assert(fields.some(x => x[1].toLowerCase() === 'merci' && x[4]), 'merci French-Chinese headword is missing');
const keys = fields.map(x => x[0]);
assert(keys.every((x, i) => i === 0 || keys[i - 1] <= x), 'French data rows are not sorted by pronunciation key (first-letter lookup index broken)');
const sourceNote = read('french-lexicon-sources.txt');
assert(sourceNote.includes('FreeDict+WikDict') && sourceNote.includes('CC BY-SA 3.0') && sourceNote.includes('IPA'), 'source attribution/license note missing');
assert(bytes('french-FREEDICT-COPYING.txt').length > 1000, 'FreeDict license text missing');
assert(bytes('french-IPA-LICENSE.txt').length > 1000, 'IPA dictionary license text missing');

// UI and visual parity controls.
for (const id of [
  'dwssMainLanguagePicker','dwssMainSwMode','dwssMainFrMode','resultFrenchReading',
  'dwssFrenchSpelling','dwssFrenchIpaMeta','dwssFrenchCorrectionPanel','dwssSaveFrenchCorrection',
  'dwssPronunciationMode','dwssPronSwMode','dwssPronFrMode','pronunciationFrenchSearch',
  'pronunciationFrenchResults','resultReading','pronunciationSearch'
]) {
  assert(html.includes('id="' + id + '"'), 'French extension UI element missing: ' + id);
}
assert(html.includes('DWSS_AUTO_UPDATE_0_9_116'), 'HTML auto-update marker not updated');
assert(!html.includes('DWSS_AUTO_UPDATE_0_9_115'), 'stale HTML auto-update marker remains');
assert(html.includes('#resultCard #resultFrenchReading'), 'French result field does not share the main result styling layer');
assert(html.includes('#dwssFrenchSpelling') && html.includes('text-decoration'), 'French spelling style block missing');
assert((html.match(/id="resultFrenchReading"/g) || []).length === 1, 'French result field id is duplicated');
assert((html.match(/id="pronunciationFrenchSearch"/g) || []).length === 1, 'French pronunciation query id is duplicated');
assert((html.match(/id="dwssMainLanguagePicker"/g) || []).length === 1, 'Main selector id duplicated');
assert((html.match(/id="dwssPronunciationMode"/g) || []).length === 1, 'Pronunciation selector id duplicated');
assert(version.includes('Version: 0.9.116'), 'VERSION.txt not updated');

// Correction/sync must preserve French word spelling and sound, not only the Chinese gloss.
assert(app.includes("french:String(c.french_text||'').trim()"), 'synced French spelling is not merged back into the local lexicon');
assert(app.includes("french=String(data.french||'').trim()"), 'user French spelling is discarded by validation');
assert(app.includes('french,frenchReadingZh,category:'), 'custom French spelling is not returned from validation');
assert(shared.includes('french_text: french || null'), 'French spelling is not included in cloud payload');
assert(shared.includes('normalizeSharedText(t.french_text) === normalizeSharedText(payload.french_text)'), 'cloud duplicate detection does not include French spelling');
assert(app.includes("frenchReadingZh:String(c.french_pronunciation_cn||c.frenchReadingZh||'').trim()"), 'cloud French pronunciation not loaded');

assert(sw.includes("const APP_VERSION = '0.9.116';"), 'Service Worker not at 0.9.116');
assert(sw.includes("'./french-extension.js'"), 'French runtime is missing from SW precache');
assert(sw.includes("'./french-ipa-index.tsv.gz'"), 'French lexicon data is missing from SW precache');
assert(sw.includes("'./french-lexicon-sources.txt'"), 'French source note is missing from SW precache');
assert(app.includes("version:'0.9.116'"), 'app metadata version mismatch');

const protectedAssets = {
  'cover.webp': 'b6bce40baebb9b645e1d4ccac588e6c18291a0dca50fd8aa3aaca73fcb707a1a',
  'DWSS-Android-Installer.apk': '9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5',
  'dictionary.js.gz': 'a8ec3c5738cbac04bc0e8841d1521e1a04db1d255c5d8cae70d503b37b6109b3',
  'dictionary-overrides.js': 'aa02aaa70a6e9876bc347b716793dd13b1371b33fba4bce3f414625b4a305dbe',
  'pwa.js': '3073e4a808e3e296c625e928bb093120f2d52f9cd1b0adbb524c6ae6492f6d1f',
  'boot.js': 'f311e1e4ded4c17adda95927e5f58bdbd3a47ed872676389462664ee201f1ce5',
  'manifest.webmanifest': '3006fc878f2c0f26dad097c46165cf476817e02560a5fa5d0fe6403f2e6838df',
  'pronunciation-search.js': 'd68ad9bb5cc5a79e98e6147908cdce238e07babef1b26b7db2418be04e8fd30d',
  'dwss-pronunciation-controls.js': 'b0184efc5cae2c65423e08ba1f909f2baa5e11edf19458fd2e189a6d4c51d52c'
};
const crypto = require('crypto');
for (const [name, expected] of Object.entries(protectedAssets)) {
  const actual = crypto.createHash('sha256').update(bytes(name)).digest('hex');
  assert(actual === expected, 'protected pre-release asset changed: ' + name);
}
assert(bytes('cover.webp').length > 10000 && bytes('DWSS-Android-Installer.apk').length > 100000, 'cover or APK is unexpectedly empty');

console.log('PASS DWSS 0.9.116 French extension: ' + lines.length + ' IPA records, ' + withGloss + ' entries with Chinese glosses; phrase composition, IPA sound hints, French UI, local/cloud correction sync, SW offline precache, versions and protected assets all verified.');
