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

// Local-only storage + automatic completion capture.
assert(app.includes("safeStore('sw_history',next)"), 'history does not write to localStorage through safeStore');
assert(app.includes("readStoredArray('sw_history',200)"), 'local history capacity is not 200');
assert(app.includes("$('inputText').addEventListener('blur'"), 'leaving main input does not commit completed translation');
assert(app.includes('commitCurrentTranslationToLocalHistory();'), 'local history commit helper is not wired');
assert(app.includes("event.relatedTarget.id==='clearBtn'"), 'clear-input action may incorrectly save the cleared draft');
assert(app.includes("setTimeout(()=>renderTranslation({recordHistory:false}),delay)"), 'live typing still must avoid saving partial keystrokes');
assert(app.includes("window.addEventListener('pagehide'"), 'page close/background lifecycle safety save missing');
assert(app.includes("const next=[value,...h.filter(x=>norm(x)!==key)].slice(0,200)"), 'history is not normalized/deduplicated and capped');

// Local history search is interactive and uses only the local history array.
assert(html.includes('id="historySearch"'), 'local history search input missing');
assert(html.includes('历史记录只保存在当前设备，不会上传云端'), 'local-only notice missing');
assert(app.includes("$('historySearch').addEventListener('input',()=>renderSaved())"), 'history search does not refresh results');
assert(app.includes("allHistory.filter(phrase=>norm(phrase).includes(historyQuery))"), 'history search does not filter locally');
assert(app.includes('没有找到匹配的本机历史记录。'), 'empty search feedback missing');
assert(app.includes("$('clearHistory').addEventListener('click'"), 'clear local history feature removed');
assert(app.includes("$('inputText').value=b.dataset.use;switchTab('translate');renderTranslation();"), 're-query action removed');

// No translation-history cloud table/API has been introduced.
const saveStart = app.indexOf('function saveRecent(raw)');
const favStart = app.indexOf('function favs()', saveStart);
assert(saveStart >= 0 && favStart > saveStart, 'local history save function boundaries missing');
const saveFn = app.slice(saveStart, favStart);
assert(!/supabase|\.from\(|fetch\s*\(/i.test(saveFn), 'cloud call found in history save function');
assert(!/translation_history|history_events/i.test(app), 'new translation-history cloud integration found');

// Cache/version consistency.
assert(version.includes('Version: 0.9.114'), 'VERSION.txt not updated');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_114'), 'HTML update marker not updated');
assert(!html.includes('0.9.113'), 'stale HTML version markers remain');
assert(app.includes("version:'0.9.114'"), 'app metadata version not updated');
assert(sw.includes("const APP_VERSION = '0.9.114';"), 'service-worker cache version not updated');
assert(!sw.includes("APP_VERSION = '0.9.113'"), 'stale service-worker version remains');

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

console.log('PASS DWSS 0.9.114: local-only history commit on blur/pagehide; typing previews excluded; searchable 200-entry local history; clear and re-query preserved; no cloud history API; protected assets unchanged.');
