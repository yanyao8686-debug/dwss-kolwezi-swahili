'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const version = read('VERSION.txt');

assert(!html.includes('id="copyReading"'), 'copyReading button remains in index.html');
assert(!html.includes('复制谐音'), 'visible copy label remains in index.html');
assert(!html.includes('.result-title-actions'), 'copy/status action wrapper styling remains');
assert(!html.includes('#copyReading'), 'copy button styling remains');
assert(!app.includes("$('copyReading')"), 'copyReading event reference remains in app.js');
assert(!html.includes('dwssCopyBound'), 'result textarea still receives click-to-copy binding');
assert(!html.includes('navigator.clipboard.writeText(value)'), 'result textarea clipboard handler remains');
assert(!html.includes("reading.addEventListener('click',copyReading)"), 'result textarea click handler remains');
assert(!html.includes("reading.addEventListener('keydown'"), 'result textarea key-to-copy handler remains');

assert(/<span id="resultState" hidden aria-hidden="true"><\/span>/.test(html), 'hidden resultState target missing');
assert(app.includes("$('resultState').textContent="), 'translation status updates were removed');
assert(html.includes('<h2>斯语翻译中文谐音：</h2>'), 'result heading changed');
assert(/<textarea[^>]*id="resultReading"/.test(html), 'editable result textarea missing');
assert(html.includes('可直接修改的斯语中文谐音'), 'result textarea accessibility label changed');
assert(html.includes('id="translationCorrectionPanel"'), 'main correction editor missing');
assert(html.includes('id="submitTranslationCorrection"'), 'save-and-sync action missing');
assert(html.includes('id="translationPronunciationCandidates"'), 'pronunciation candidates missing');

assert(app.includes('async function copyText('), 'general clipboard helper removed');
assert(app.includes("$('copyBackup').addEventListener('click'"), 'backup copy feature was changed');

assert(version.includes('Version: 0.9.113'), 'VERSION.txt was not updated');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_113'), 'HTML auto-update marker not updated');
assert(!html.includes('0.9.112'), 'stale HTML version marker remains');
assert(app.includes("version:'0.9.113'"), 'app metadata version not updated');
assert(sw.includes("const APP_VERSION = '0.9.113';"), 'service worker cache version not updated');
assert(!sw.includes("APP_VERSION = '0.9.112'"), 'stale service worker cache version remains');

const layoutStart = html.indexOf('<style id="dwss-button-layout-0112">');
const layoutEnd = html.indexOf('</style>', layoutStart);
assert(layoutStart >= 0 && layoutEnd > layoutStart, '0.9.112 approved button layout layer missing');
const layer = html.slice(layoutStart, layoutEnd);
for (const token of ['nav.tabs>.nav-clear-action', '.translation-pronunciation-pin', '.dict-edit-actions button', '.pronunciation-editor-restore', '#pronunciation .pronunciation-maintenance-entry']) {
  assert(layer.includes(token), 'Unrelated approved layout rule missing: ' + token);
}
assert(!layer.includes('copyReading') && !layer.includes('result-title-actions'), 'copy button styles were not removed from layout layer');

const protectedHashes = {
  'cover.webp': 'b6bce40baebb9b645e1d4ccac588e6c18291a0dca50fd8aa3aaca73fcb707a1a',
  'DWSS-Android-Installer.apk': '9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5',
  'dictionary.js.gz': 'a8ec3c5738cbac04bc0e8841d1521e1a04db1d255c5d8cae70d503b37b6109b3',
  'dictionary-overrides.js': 'aa02aaa70a6e9876bc347b716793dd13b1371b33fba4bce3f414625b4a305dbe',
  'shared-lexicon.js': '61b8802a6ce0d4e673f91a685a722f275048f0875424f1cb686550b1c60e2ad2',
  'pwa.js': '3073e4a808e3e296c625e928bb093120f2d52f9cd1b0adbb524c6ae6492f6d1f',
  'boot.js': 'f311e1e4ded4c17adda95927e5f58bdbd3a47ed872676389462664ee201f1ce5',
  'manifest.webmanifest': '3006fc878f2c0f26dad097c46165cf476817e02560a5fa5d0fe6403f2e6838df',
  'pronunciation-search.js': 'd68ad9bb5cc5a79e98e6147908cdce238e07babef1b26b7db2418be04e8fd30d',
  'dwss-pronunciation-controls.js': 'b0184efc5cae2c65423b04fa1e909f2baa5e11edf19458fd2e189a6d4c51d52c',
};
for (const [name, expected] of Object.entries(protectedHashes)) {
  assert(hash(name) === expected, 'Protected asset changed: ' + name);
}

console.log('PASS DWSS 0.9.113: copy button, gray state bubble, and result click-to-copy removed; hidden status target, editable result, backup copy, correction and cloud-sync controls preserved; unrelated layout and assets unchanged.');
