'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');
const pwa = fs.readFileSync('public/pwa.js', 'utf8');
const version = fs.readFileSync('public/VERSION.txt', 'utf8');

assert.match(html, /id="newZh"/, 'Chinese meaning input remains');
assert.match(html, /id="newReading"/, 'local Swahili Chinese homophone input remains');
assert.match(html, /id="newFrenchReadingZh"/, 'French Chinese homophone input remains');
assert.match(html, /id="entrySubmit"[^>]*>保存新词/, 'Save New Word button remains');
assert.doesNotMatch(html, /id="addWordLanguageHint"/, 'redundant explanatory note is removed');
assert.doesNotMatch(html, /中文意思必填；斯语中文谐音、法语中文谐音可单独填写/, 'the circled copy is absent');
assert.match(html, /版本 0\.9\.49 · DWSS/, 'visible page version is bumped');
assert.match(html, /DWSS_AUTO_UPDATE_0_9_49/, 'automatic update marker is bumped');
assert.match(app, /version:'0\.9\.49'/, 'app metadata version is bumped');
assert.match(sw, /const APP_VERSION = '0\.9\.49';/, 'service worker cache is bumped');
assert.match(pwa, /'newFrenchReadingZh'/, 'French homophone input remains preserved during update');
assert.match(version, /Version: 0\.9\.49/, 'VERSION file is bumped');
console.log('PASS 0.9.49: helper text removed; all three form fields, save button, and update persistence retained.');
