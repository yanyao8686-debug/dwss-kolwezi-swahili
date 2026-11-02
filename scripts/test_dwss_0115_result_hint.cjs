'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const version = read('VERSION.txt');

const newHint = '认为翻译结果不正确可自行修改';
const oldHint = '输入中文后，翻译结果中文谐音会显示在这里';

// Exact copy change and placement.
assert(html.includes(newHint), 'new result hint is missing');
assert(!html.includes(oldHint), 'old result hint remains in HTML');
assert(html.split(newHint).length - 1 === 1, 'new result hint must appear exactly once');
assert(html.includes('id="resultReading"'), 'translation result field is missing');
assert(html.includes('id="translationCorrectionPanel"'), 'manual correction panel is missing');

// The existing main translation, history and pronunciation features remain present.
for (const token of [
  'id="inputText"',
  'id="historySearch"',
  'id="pronunciationResults"',
  'id="translationPronunciationCandidates"',
  'id="submitTranslationCorrection"',
  'id="dwss-apk-download"',
  'id="openPublicPronunciationEditor"',
  'DWSS_AUTO_UPDATE_0_9_115',
  '<h2>斯语翻译中文谐音：</h2>',
  '历史记录只保存在当前设备，不会上传云端'
]) {
  assert(html.includes(token), 'required existing page feature is missing: ' + token);
}
assert(!html.includes('DWSS_AUTO_UPDATE_0_9_114'), 'stale HTML cache marker remains');
assert(!html.includes('id="copyReading"'), 'removed result-copy control unexpectedly returned');
assert(!html.includes('复制谐音'), 'removed copy-reading label unexpectedly returned');

// Version/cache identity must be aligned to trigger normal PWA/WebView update.
assert(version.includes('Version: 0.9.115'), 'VERSION.txt is not 0.9.115');
assert(app.includes("version:'0.9.115'"), 'app.js version metadata was not updated');
assert(!app.includes("version:'0.9.114'"), 'stale app.js version metadata remains');
assert(sw.includes("const APP_VERSION = '0.9.115';"), 'Service Worker cache version was not updated');
assert(!sw.includes("APP_VERSION = '0.9.114'"), 'stale Service Worker cache version remains');

// Existing shared vocabulary, cover and installer are protected byte-for-byte.
const expectedHashes = {
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
  'supabase.min.js': null
};
for (const [name, expected] of Object.entries(expectedHashes)) {
  const actual = hash(name);
  if (expected) assert(actual === expected, 'protected baseline asset changed: ' + name);
}

console.log('PASS DWSS 0.9.115: exact requested hint is present once; old hint is absent; existing page features, version/cache update, shared vocabulary, cover and installer are verified.');
