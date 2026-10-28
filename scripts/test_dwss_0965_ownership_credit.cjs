const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DWSS_TEST_ROOT || 'public';
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const oldStamp = '© 2026 DWSS / 陈谍 · 保留所有权利';
const newStamp = '© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利';

assert(!html.includes(oldStamp), 'old ownership statement removed');
assert.equal(html.split(newStamp).length - 1, 1, 'new ownership statement appears exactly once');
assert(html.includes('class="ownership-stamp">' + newStamp + '</span>'), 'new statement retains original ownership stamp element');
assert(html.includes('.ownership-stamp{display:inline-block;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:center;'), 'ownership statement can wrap on narrow phone screens');
assert(html.includes('版本 0.9.65 · DWSS 智能翻译 PWA'), 'visible app version bumped');
assert(html.includes('<meta name="dwss-auto-update" content="0.9.65">'), 'auto-update metadata bumped');
assert(html.includes('<!-- DWSS_AUTO_UPDATE_0_9_65 -->'), 'auto-update marker bumped');
assert(!html.includes('词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。'), 'previously removed disclaimer remains removed');
assert(!html.includes('软件版权、品牌归属与授权说明'), 'previously removed legal accordion remains removed');
assert(html.includes('© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利'), 'exact requested text retained');
assert(version.includes('Version: 0.9.65'), 'VERSION.txt bumped');
assert(version.includes('0.9.65: Replace the footer ownership statement'), 'release notes describe change');
assert(sw.includes("const APP_VERSION = '0.9.65';"), 'Service Worker cache version bumped');
console.log('PASS: DWSS 0.9.65 exact footer text, mobile wrapping, retained previous cleanup, and cache version tests.');
