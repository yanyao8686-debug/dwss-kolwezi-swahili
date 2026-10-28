const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DWSS_TEST_ROOT || 'public';
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pwa = fs.readFileSync(path.join(root, 'pwa.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert(html.includes('版本 0.9.67 · 刚果金斯语翻译'), 'build-time version label is accurate');
assert(html.includes('<meta name="dwss-auto-update" content="0.9.67">'), 'auto-update metadata bumped');
assert(html.includes('<!-- DWSS_AUTO_UPDATE_0_9_67 -->'), 'auto-update marker bumped');
assert(version.includes('Version: 0.9.67'), 'VERSION.txt bumped');
assert(version.includes('0.9.67: Automatically read the current VERSION.txt'), 'release notes describe dynamic label feature');

assert(pwa.includes("fetch('./VERSION.txt?dwss-version-check=' + Date.now(), { cache: 'no-store' })'), 'PWA reads fresh live VERSION.txt at startup');
assert(pwa.includes("textNode.nodeValue = '版本 ' + match[1] + ' · 刚果金斯语翻译';"), 'visible label uses the server version and fixed app name');
assert(pwa.includes('refreshDisplayedVersion();'), 'version refresh is called automatically');

assert(sw.includes("const APP_VERSION = '0.9.67';"), 'Service Worker cache version bumped');
assert(sw.includes("'./VERSION.txt'"), 'VERSION.txt is precached for offline fallback');
assert(sw.includes("if (url.pathname.endsWith('/VERSION.txt'))"), 'VERSION.txt has a dedicated fetch route');
assert(sw.includes("fetch(request, { cache: 'no-store' })"), 'version endpoint is fetched network-first');
assert(sw.includes("cache.put(latestUrl, fresh.clone())"), 'last successful version response is cached');
assert(sw.includes("cache.match(latestUrl)"), 'offline mode falls back to last cached version');
assert(sw.includes("return (await cache.match(latestUrl)) || fresh || Response.error();"), 'HTTP errors also fall back to the last cached version');

assert(html.includes('© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利'), 'approved ownership stamp retained');
assert(!html.includes('词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。'), 'removed disclaimer remains absent');
assert(!html.includes('软件版权、品牌归属与授权说明'), 'removed legal accordion remains absent');
console.log('PASS: DWSS 0.9.67 dynamic version, offline version fallback, cache update and approved footer regression tests.');
