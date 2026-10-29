#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = process.env.DWSS_PUBLIC_DIR || 'public';
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const boot = read('boot.js');
const sw = read('sw.js');
const version = read('VERSION.txt');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert.match(version, /^Version: 0\.9\.79$/m);
assert(sw.includes("const APP_VERSION = '0.9.79';"));
assert(html.includes('content="0.9.79">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_79'));
assert(html.includes('版本 0.9.79 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.79/g) || []).length >= 3);
assert.equal((html.match(/dwss-release=0\.9\.78/g) || []).length, 0);
assert(app.includes("version:'0.9.79'"));

const pinyinContext = {window:{}};
vm.runInNewContext(read('hanzi-pinyin.js'), pinyinContext);
const pinyin = pinyinContext.window.DWSS_HANZI_PINYIN;
assert(Object.keys(pinyin).length > 18000, 'full CJK pinyin map exists');

const searchContext = {window:{DWSS_HANZI_PINYIN:pinyin}};
vm.runInNewContext(read('pronunciation-search.js'), searchContext);
const engine = searchContext.window.DWSSPronunciationSearch;
assert(engine && typeof engine.search === 'function');
assert.equal(typeof engine.fullSequenceMatch, 'function');

// The three user examples are homophones: different Hanzi, same four pinyin syllables.
const expected = 'ma qiu ma qiu';
for (const phrase of ['麻球麻球', '麻丘麻丘', '马球马球']) {
  assert.equal(engine.toSyllables(phrase, true).join(' '), expected, phrase + ' maps to the same pinyin');
}
const lookEntry = [{zh:'看',category:'测试',variants:[{reading:'麻球麻球',source:'测试词库'}]}];
for (const phrase of ['麻球麻球', '麻丘麻丘', '马球马球']) {
  const matches = engine.search(phrase, lookEntry, {limit:10});
  assert.equal(matches.length, 1, phrase + ' finds the same pronunciation entry');
  assert.equal(matches[0].zh, '看');
  assert.equal(matches[0].score, 1);
}

// A short query must not match only a segment inside a longer phrase.
const longerOnly = [
  {zh:'四音节词条',variants:[{reading:'我毛豆我',source:'测试'}]},
  {zh:'重复四音节词条',variants:[{reading:'毛豆毛豆',source:'测试'}]},
  {zh:'前后带词条',variants:[{reading:'大家毛豆',source:'测试'}]}
];
assert.equal(engine.search('毛豆', longerOnly, {limit:20}).length, 0);

// Full exact homophone matching still works, including a different character.
const exactHomophones = [
  {zh:'毛豆',variants:[{reading:'毛豆',source:'测试'}]},
  {zh:'猫豆',variants:[{reading:'猫豆',source:'测试'}]}
];
const exactMatches = engine.search('毛豆', exactHomophones, {limit:20});
assert.equal(exactMatches.length, 2, 'same-pinyin different Hanzi entries are found');
assert(exactMatches.every(item => item.score === 1));

// Similar but genuinely different syllables are not treated as homophones.
const unrelated = [
  {zh:'不同声母',variants:[{reading:'爸豆',source:'测试'}]},
  {zh:'不同整段',variants:[{reading:'麻球麻球',source:'测试'}]}
];
assert.equal(engine.search('毛豆', unrelated, {limit:20}).length, 0);

// Unmapped Han characters cannot be skipped to create a false shorter reading.
assert.equal(engine.toSyllables('毛' + String.fromCodePoint(0x1F4A0) + '豆', true).length, 0);
assert.equal(engine.search('毛' + String.fromCodePoint(0x1F4A0) + '豆', exactHomophones, {limit:20}).length, 0);

// Test every actual result against the full active bundled source dictionary.
const dictionaryContext = {window:{}};
const dictionarySource = zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8');
vm.runInNewContext(dictionarySource, dictionaryContext);
const db = dictionaryContext.window.SW_DB;
assert(Array.isArray(db) && db.length >= 2000, 'full original vocabulary loaded');
const entries = db.map(item => ({zh:item.zh,category:'词库',variants:item.variants||[]}));
const liveResults = engine.search('毛豆', entries, {limit:50});
const querySyllables = engine.toSyllables('毛豆', true);
for (const result of liveResults) {
  const resultSyllables = engine.toSyllables(result.matchedReading, false);
  assert.equal(resultSyllables.length, querySyllables.length, 'every result has the same complete syllable count');
  assert(engine.fullSequenceMatch(querySyllables, resultSyllables), 'every result matches from the first to last syllable');
}
assert(liveResults.every(result => result.score >= 0.90), 'all returned results clear the stricter full-phrase threshold');

// Personal and shared terms continue using the same engine.
const extras = engine.search('麻丘麻丘', [
  {zh:'个人新增词',variants:[{reading:'麻球麻球',source:'个人词库'}]},
  {zh:'共享词条',variants:[{reading:'马球马球',source:'共享词库'}]}
], {limit:10});
assert.equal(extras.length, 2);

assert(boot.indexOf('./hanzi-pinyin.js') < boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js') < boot.indexOf('./app.js'));
assert(sw.includes("'./hanzi-pinyin.js'") || sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'") || sw.includes('"./pronunciation-search.js"'));
assert(sw.includes("'./dictionary.js.gz'") || sw.includes('"./dictionary.js.gz"'));
assert(!sw.includes("'./dictionary.js',") && !sw.includes('"./dictionary.js",'));
assert.equal(manifest.id, './?app=dwss-kolwezi-swahili');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.name, '刚果金斯语翻译');

console.log('PASS: "麻球麻球"、"麻丘麻丘"、"马球马球" all map to ma qiu ma qiu and find the same meaning.');
console.log('PASS: "毛豆" no longer matches a two-syllable fragment inside any longer pronunciation.');
console.log('PASS: exact homophones with different Hanzi still match; genuinely different sounds are filtered.');
console.log('PASS: unmapped characters are rejected instead of silently disappearing.');
console.log('PASS: all actual dictionary results align over the full phrase and preserve personal/shared lookup.');
console.log('PASS: DWSS 0.9.79 metadata, PWA identity and offline cache remain valid.');
