const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DWSS_TEST_ROOT || 'public';
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert(html.includes('<meta name="apple-mobile-web-app-title" content="刚果金斯语翻译">'), 'mobile web-app title updated');
assert(html.includes('<meta name="application-name" content="刚果金斯语翻译">'), 'application-name metadata updated');
assert(html.includes('<title>刚果金斯语翻译</title>'), 'browser/document title updated');
assert(!html.includes('DWSS斯语助手'), 'old PWA name removed from HTML');
assert(!html.includes('DWSS 科卢韦齐斯瓦西里语助手'), 'old long app name removed from HTML');

assert.equal(manifest.name, '刚果金斯语翻译', 'PWA full name updated');
assert.equal(manifest.short_name, '刚果金斯语翻译', 'PWA launcher name updated');
assert.equal(manifest.id, './?app=dwss-kolwezi-swahili', 'existing PWA identity preserved');
assert.equal(manifest.display, 'standalone', 'PWA remains standalone');

assert(html.includes('版本 0.9.68 · 刚果金斯语翻译'), 'version label updated');
assert(html.includes('<meta name="dwss-auto-update" content="0.9.68">'), 'auto-update metadata bumped');
assert(html.includes('<!-- DWSS_AUTO_UPDATE_0_9_68 -->'), 'auto-update marker bumped');
assert(version.includes('Version: 0.9.68'), 'VERSION.txt bumped');
assert(version.startsWith('刚果金斯语翻译'), 'VERSION.txt product name updated');
assert(sw.includes("const APP_VERSION = '0.9.68';"), 'Service Worker cache version bumped');

assert(html.includes('© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利'), 'approved ownership statement retained');
assert(!html.includes('词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。'), 'previously removed disclaimer remains absent');
assert(!html.includes('软件版权、品牌归属与授权说明'), 'previously removed legal accordion remains absent');
console.log('PASS: DWSS 0.9.68 PWA display name, standalone installation identity, live version, and footer regression checks.');
