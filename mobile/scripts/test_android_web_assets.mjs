#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve('www');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const versionText = read('VERSION.txt');
const versionMatch = /^Version: (\d+\\.\d+\\.\d+)$/m.exec(versionText);
assert(versionMatch, 'VERSION.txt contains a valid web version');
const version = versionMatch[1];

const html = read('index.html');
const app = read('app.js');
const boot = read('boot.js');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert(html.includes('content="' + version + '">'), 'HTML metadata matches the web release');
assert(app.includes("version:'" + version + "'"), 'app.js metadata matches the web release');
assert(sw.includes("const APP_VERSION = '" + version + "';"), 'Service Worker version matches the web release');
assert.equal(manifest.name, '刚果金斯语翻译');
assert(html.includes('id="pronunciationSearch"'), 'reverse pronunciation input exists');
assert(app.includes('function renderPronunciationLookup()'), 'reverse pronunciation UI exists');
assert(boot.indexOf('./hanzi-pinyin.js') < boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js') < boot.indexOf('./app.js'));
assert(fs.existsSync(path.join(root, 'hanzi-pinyin.js')));
assert(fs.existsSync(path.join(root, 'pronunciation-search.js')));
assert(fs.existsSync(path.join(root, 'dictionary.js')));

const precache = sw.match(/const PRECACHE_URLS = \\[([\s\\S]*?)\\];/);
assert(precache, 'Service Worker precache list exists');
for (const file of ['./dictionary.js', './hanzi-pinyin.js', './pronunciation-search.js']) {
  assert(precache[1].includes("'" + file + "'") || precache[1].includes('"' + file + '"'), 'offline precache contains ' + file);
}
assert(!precache[1].includes('dictionary.js.gz'), 'Android precache does not request removed gzip dictionary');

const pinyinContext = {window:{}};
vm.runInNewContext(read('hanzi-pinyin.js'), pinyinContext);
const pinyin = pinyinContext.window.DWSS_HANZI_PINYIN;
assert(pinyin && Object.keys(pinyin).length > 18000);
const searchContext = {window:{DWSS_HANZI_PINYIN:pinyin}};
vm.runInNewContext(read('pronunciation-search.js'), searchContext);
const engine = searchContext.window.DWSSPronunciationSearch;
assert(engine && typeof engine.search === 'function');

for (const phrase of ['麻球麻球','麻丘麻丘','马球马球']) {
  assert.equal(engine.toSyllables(phrase,true).join(' '), 'ma qiu ma qiu');
}
const testEntry = [{zh:'测试释义',variants:[{reading:'麻球麻球'}]}];
for (const phrase of ['麻球麻球','麻丘麻丘','马球马球']) {
  const result = engine.search(phrase,testEntry,{limit:10});
  assert.equal(result.length,1);
  assert.equal(result[0].score,1);
}
assert.equal(engine.search('毛豆',[
  {zh:'内部片段',variants:[{reading:'我毛豆我'}]},
  {zh:'重复长读音',variants:[{reading:'毛豆毛豆'}]}
],{limit:10}).length,0);

console.log('PASS: Android web assets are all version ' + version + '.');
console.log('PASS: reverse-pronunciation engine, Hanzi pinyin map and offline cache are bundled.');
console.log('PASS: three different Hanzi spellings for the same sound return the same pronunciation candidate.');
console.log('PASS: short search terms cannot match only a segment of a longer reading.');
