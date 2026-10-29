#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = path.resolve('www');
const gzipPath = path.join(root, 'dictionary.js.gz');
const dictionaryPath = path.join(root, 'dictionary.js');
const nativeBootPath = path.resolve('native/boot.js');
const deployedBootPath = path.join(root, 'boot.js');

for (const file of [gzipPath, nativeBootPath, path.join(root, 'index.html'), path.join(root, 'hanzi-pinyin.js'), path.join(root, 'pronunciation-search.js'), path.join(root, 'app.js'), path.join(root, 'sw.js'), path.join(root, 'VERSION.txt'), path.join(root, 'manifest.webmanifest')]) {
  assert(fs.existsSync(file), 'required Android web asset exists: ' + file);
}

const compressed = fs.readFileSync(gzipPath);
const dictionary = gunzipSync(compressed);
assert(dictionary.length > 1000, 'decompressed dictionary is not empty');
const dictionaryText = dictionary.toString('utf8');
assert(dictionaryText.includes('window.SW_DB'), 'dictionary exports window.SW_DB');
fs.writeFileSync(dictionaryPath, dictionary);
// Android's AAPT2 expands .gz assets to a .js entry. Keeping both files would
// create duplicate public/dictionary.js resources during Gradle asset merging.
fs.rmSync(gzipPath);
assert(fs.existsSync(dictionaryPath), 'uncompressed Android dictionary is retained');
assert(!fs.existsSync(gzipPath), 'compressed duplicate is removed before APK packaging');

const boot = fs.readFileSync(nativeBootPath, 'utf8');
assert(boot.includes("location.hostname === 'localhost'"), 'Android local-host path detection exists');
assert(boot.includes("'./dictionary.js'"), 'uncompressed Android dictionary path exists');
assert(boot.includes("'./dictionary.js.gz'"), 'compressed PWA fallback path exists');
assert(boot.includes("for (const src of ['./hanzi-pinyin.js', './pronunciation-search.js', './app.js', './dictionary-overrides.js', './pwa.js'])"), 'pinyin and pronunciation search load before the application');
fs.writeFileSync(deployedBootPath, boot);

// The Android WebView also installs the bundled service worker. Its precache
// manifest must reference the plain dictionary file, not the removed .gz asset.
const serviceWorkerPath = path.join(root, 'sw.js');
let serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
assert(serviceWorker.includes("'./dictionary.js.gz'"), 'website service worker originally precaches the gzip dictionary');
serviceWorker = serviceWorker.replace("'./dictionary.js.gz'", "'./dictionary.js'");
assert(!serviceWorker.includes('dictionary.js.gz'), 'Android service worker no longer references the removed gzip file');
fs.writeFileSync(serviceWorkerPath, serviceWorker);

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(index.includes('./boot.js'), 'index.html loads boot.js');

const installedBoot = fs.readFileSync(deployedBootPath, 'utf8');
assert(installedBoot.includes("location.hostname === 'localhost'"), 'installed bootstrap is the Android-compatible version');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert(worker.includes("'./dictionary.js'"), 'Android service worker precaches the uncompressed dictionary');
assert(!worker.includes('dictionary.js.gz'), 'Android service worker does not request the removed gzip dictionary');

const versionText = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const versionMatch = /^Version: (\d+\\.\d+\\.\d+)$/m.exec(versionText);
assert(versionMatch, 'website release version is present');
const webVersion = versionMatch[1];
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const workerSource = fs.readFileSync(serviceWorkerPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert(indexHtml.includes('content="' + webVersion + '">'), 'HTML auto-update version matches VERSION.txt');
assert(appSource.includes("version:'" + webVersion + "'"), 'application metadata matches VERSION.txt');
assert(workerSource.includes("const APP_VERSION = '" + webVersion + "';"), 'Service Worker cache version matches VERSION.txt');
assert(manifest.name === '刚果金斯语翻译', 'Android bundle keeps the official app name');
assert(indexHtml.includes('id="pronunciationSearch"'), 'reverse pronunciation query input is present');
assert(appSource.includes('function renderPronunciationLookup()'), 'reverse pronunciation query UI is present');
assert(installedBoot.indexOf('./hanzi-pinyin.js') < installedBoot.indexOf('./pronunciation-search.js'), 'pinyin map loads before pronunciation search');
assert(installedBoot.indexOf('./pronunciation-search.js') < installedBoot.indexOf('./app.js'), 'pronunciation engine loads before application UI');
for (const asset of ['./hanzi-pinyin.js', './pronunciation-search.js']) {
  assert(workerSource.includes("'" + asset + "'") || workerSource.includes('"' + asset + '"'), 'Service Worker keeps ' + asset);
}
console.log('PASS: Android source bundle matches website release ' + webVersion + ' and includes reverse-pronunciation modules.');

console.log('PASS: generated uncompressed dictionary.js (' + dictionary.length + ' bytes) and installed Android-specific boot.js.');
