#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { JSDOM } = require('jsdom');

const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name));
const text = name => read(name).toString('utf8');
const html = text('index.html');
const app = text('app.js');
const extension = text('french-extension.js');
const queryEditor = text('pronunciation-query-editor.js');
const sw = text('sw.js');
const version = text('VERSION.txt');
const boot = text('boot.js');
const pinyin = text('hanzi-pinyin.js');
const pronunciation = text('pronunciation-search.js');
const dictionary = zlib.gunzipSync(read('dictionary.js.gz')).toString('utf8');

assert(version.includes('Version: 0.9.156'), 'website version must be 0.9.156');
assert(app.includes("version:'0.9.156'"), 'app version must be 0.9.156');
assert(sw.includes("const APP_VERSION = '0.9.156';"), 'Service Worker cache must be 0.9.156');
assert(!sw.includes('precacheFrenchShardFamilies') && !sw.includes('frenchOfflineShardCount'),
  'optional French shards must not block Service Worker activation');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_155'), 'automatic-update marker must be 0.9.156');
for (const script of ['supabase.min.js','shared-lexicon.js','boot.js',
  'french-extension.js','french-translation-runtime.js','pronunciation-query-editor.js']) {
  assert(html.includes(script + '?dwss-release=0.9.156'),
    'deferred runtime script must be cache-pinned to 0.9.156: ' + script);
}
assert(extension.includes('dwss:app-ready') &&
       extension.includes('restoreSelectedModesAfterCoreReady'),
  'French extension must wait for the asynchronous Swahili core-ready event');
assert(boot.indexOf("'./hanzi-pinyin.js'") < boot.indexOf("'./pronunciation-search.js'") &&
       boot.indexOf("'./pronunciation-search.js'") < boot.indexOf("'./app.js'"),
  'boot loader must inject pinyin, pronunciation engine, then app in order');

// Production-order race: parser-deferred French extension executes while boot.js
// is still awaiting dictionary decompression. The user has already typed text,
// but none of the Swahili core globals/renderers exist yet.
const dom = new JSDOM(html, {
  url:'https://dwss.test/',
  runScripts:'outside-only',
  pretendToBeVisual:true
});
const win = dom.window;
Object.defineProperty(win.navigator, 'onLine', {value:false, configurable:true});
win.confirm = () => true;
win.alert = () => {};
win.scrollTo = () => {};

const input = win.document.getElementById('inputText');
const output = win.document.getElementById('resultReading');
const resultCard = win.document.getElementById('resultCard');
const queryInput = win.document.getElementById('pronunciationSearch');
const queryResults = win.document.getElementById('pronunciationResults');
const swMain = win.document.getElementById('dwssMainSwMode');
const frMain = win.document.getElementById('dwssMainFrMode');
const swQuery = win.document.getElementById('dwssPronSwMode');
const frQuery = win.document.getElementById('dwssPronFrMode');
assert(input && output && resultCard && queryInput && queryResults &&
       swMain && frMain && swQuery && frQuery,
  'production page is missing one or more translation/query controls');

input.value = '明天';
queryInput.value = '给晓';

// The deferred extension binds first and makes the initial UI selection, but it
// must not assume the dictionary/app is ready at this point.
win.eval(extension);
win.eval(queryEditor); // production deferred query cleanup must not delete required main-app controls
assert(win.document.getElementById('openPublicPronunciationEditor'),
  'read-only pronunciation cleanup must preserve the main-page dictionary maintenance button');
assert.equal((extension.match(/function restoreSelectedModesAfterCoreReady\(\)/g) || []).length, 1,
  'there must be exactly one Swahili startup reconciliation function');
if (win.document.readyState === 'loading') {
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', {bubbles:true}));
}
assert(win.document.getElementById('openPublicPronunciationEditor'),
  'read-only query cleanup must preserve the main dictionary-maintenance button after DOMContentLoaded');
assert(!win.KolweziSwahili && typeof win.DWSSRenderTranslation !== 'function',
  'test must exercise the real pre-core startup window');
assert(swMain.classList.contains('active') && !frMain.classList.contains('active'),
  'main mode must initially display Swahili');
assert(swQuery.classList.contains('active') && !frQuery.classList.contains('active'),
  'reverse lookup mode must initially display Swahili');

// boot.js now finishes dictionary decompression, then injects the remaining
// scripts one-by-one. app.js dispatches dwss:app-ready at the end of setup.
win.eval(dictionary);
win.eval(pinyin);
win.eval(pronunciation);
win.eval(app);

assert(win.KolweziSwahili && typeof win.DWSSRenderTranslation === 'function',
  'Swahili core did not announce readiness');
const row = win.SW_DB.find(item => item && item.zh === '明天' &&
  Array.isArray(item.variants) && item.variants.some(v => String(v.reading || '').trim()));
assert(row, 'real local dictionary row 明天 is missing');
const localTranslation = win.KolweziSwahili.translate('明天');
const localReading = localTranslation.segments.find(x => x.type === 'local' && x.reading);
assert(localReading, 'the local Swahili dictionary must provide a reading for 明天');

// Crucial assertions: no manual call to either renderer and no second user input.
// The app-ready handshake itself must render both already-populated controls.
assert(!output.hidden && output.value.includes(localReading.reading),
  'after app-ready, the actual Swahili result textarea must automatically contain its local homophone; got: ' + output.value);
assert(queryResults.textContent.includes('明天') && queryResults.textContent.includes('该小'),
  'after app-ready, the real reverse pronunciation list must automatically show 明天 / 该小; got: ' + queryResults.textContent);
assert(resultCard.dataset.dwssLang !== 'fr',
  'a stale French result-card marker must not survive Swahili core readiness');

// Verify the late pinyin map case independently; the matcher must not capture
// an empty global when script order is delayed by a WebView cache/network race.
const late = {window:{}};
vm.runInNewContext(pronunciation, late, {filename:'pronunciation-search-first.js'});
vm.runInNewContext(pinyin, late, {filename:'hanzi-pinyin-second.js'});
const lateHits = late.window.DWSSPronunciationSearch.search(
  '给晓', [{zh:'明天', variants:[{reading:'该小'}]}], {limit:10}
);
assert(lateHits.some(hit => hit.zh === '明天' && hit.score >= 0.90),
  'late pinyin map must still enable reverse pronunciation search');

win.close();
console.log('PASS DWSS 0.9.156: actual production load order (French extension first, async Swahili core second) automatically restores the main homophone result and reverse lookup.');
console.log('PASS DWSS 0.9.156: release-pinned deferred scripts prevent stale mixed runtime assets.');
console.log('PASS DWSS 0.9.156: late pinyin-map loading remains safe.');
