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

for (const file of [gzipPath, nativeBootPath, path.join(root, 'index.html')]) {
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
assert(boot.includes("for (const src of ['./app.js', './dictionary-overrides.js', './pwa.js'])"), 'all application modules load after dictionary');
fs.writeFileSync(deployedBootPath, boot);

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(index.includes('./boot.js'), 'index.html loads boot.js');

const installedBoot = fs.readFileSync(deployedBootPath, 'utf8');
assert(installedBoot.includes("location.hostname === 'localhost'"), 'installed bootstrap is the Android-compatible version');
console.log('PASS: generated uncompressed dictionary.js (' + dictionary.length + ' bytes) and installed Android-specific boot.js.');
