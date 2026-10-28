'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DWSS_TEST_ROOT || path.join(process.cwd(), 'public');
const baseRoot = process.env.DWSS_BASE_ROOT;
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');
const html = read(root, 'index.html');
const app = read(root, 'app.js');
const sw = read(root, 'sw.js');
const version = read(root, 'VERSION.txt');

assert.equal((html.match(/<h2>斯语翻译中文谐音：<\/h2>/g) || []).length, 1,
  'requested heading must appear exactly once');
assert(!html.includes('<h2>翻译结果中文谐音：</h2>'),
  'old main-screen heading must be replaced');
assert(app.includes('翻译结果中文谐音会显示在这里'),
  'unrequested placeholder wording in the empty result state must remain unchanged');
assert(html.includes('中文谐音结果') && html.includes('复制谐音'),
  'other result labels must remain unchanged');
const navMatch = html.match(/<nav class="tabs">([\s\S]*?)<\/nav>/);
assert(navMatch, 'main navigation must exist');
assert.equal((navMatch[1].match(/<button\b/g) || []).length, 3,
  'main navigation must retain its two tabs and clear action');
assert(navMatch[1].includes('data-tab="maintenance"') &&
       navMatch[1].includes('data-tab="saved"') &&
       navMatch[1].includes('nav-clear-slot') &&
       !navMatch[1].includes('data-tab="dictionary"'),
  'main navigation must preserve the current three-action layout');
assert(html.includes('content="0.9.56"') && html.includes('DWSS_AUTO_UPDATE_0_9_56'),
  'automatic-update metadata must be bumped');
assert(sw.includes("const APP_VERSION = '0.9.56';"),
  'Service Worker cache revision must be bumped');
assert(version.includes('Version: 0.9.56'),
  'release metadata must be bumped');
assert(html.includes('id="openPublicPronunciationEditor"'),
  'public pronunciation editor must remain available');
assert(read(root, 'shared-lexicon.js').includes('dwss_shared_terms_queue_v1'),
  'offline shared-word queue must remain available');
assert(read(root, 'pwa.js').includes('registration.update()'),
  'automatic update checks must remain enabled');

if (baseRoot) {
  function replaceOnce(input, from, to, label) {
    assert.equal(input.split(from).length - 1, 1, label + ' baseline must have exactly one match');
    return input.replace(from, to);
  }
  const baseHtml = read(baseRoot, 'index.html');
  let expectedHtml = replaceOnce(baseHtml,
    '<h2>翻译结果中文谐音：</h2>',
    '<h2>斯语翻译中文谐音：</h2>',
    'heading');
  expectedHtml = replaceOnce(expectedHtml,
    '<meta name="dwss-auto-update" content="0.9.55"><!-- DWSS_AUTO_UPDATE_0_9_55 -->',
    '<meta name="dwss-auto-update" content="0.9.56"><!-- DWSS_AUTO_UPDATE_0_9_56 -->',
    'hidden PWA update marker');
  assert.equal(html, expectedHtml,
    'index.html may differ only by the requested heading and hidden PWA update marker');

  const baseSw = read(baseRoot, 'sw.js');
  const expectedSw = replaceOnce(baseSw,
    "const APP_VERSION = '0.9.55';",
    "const APP_VERSION = '0.9.56';",
    'Service Worker version');
  assert.equal(sw, expectedSw,
    'sw.js may differ only by the cache version');

  const baseVersion = read(baseRoot, 'VERSION.txt');
  let expectedVersion = replaceOnce(baseVersion, 'Version: 0.9.55', 'Version: 0.9.56',
    'release version');
  const note = '0.9.56: Change only the main translation result heading to “斯语翻译中文谐音：”; all other user-facing content and behavior are unchanged.';
  if (!expectedVersion.includes(note)) expectedVersion = expectedVersion.trimEnd() + '\n' + note + '\n';
  assert.equal(version, expectedVersion,
    'VERSION.txt may differ only by release version and a one-line release note');

  const baseNames = fs.readdirSync(baseRoot).sort();
  const currentNames = fs.readdirSync(root).sort();
  assert.deepEqual(currentNames, baseNames,
    'no assets may be added or removed as part of this one-text hotfix');
  for (const name of baseNames) {
    if (['index.html', 'sw.js', 'VERSION.txt'].includes(name)) continue;
    assert.deepEqual(fs.readFileSync(path.join(root, name)),
      fs.readFileSync(path.join(baseRoot, name)),
      name + ' must remain byte-for-byte identical');
  }
}
console.log('PASS: only the requested heading and required hidden update/cache metadata changed.');
