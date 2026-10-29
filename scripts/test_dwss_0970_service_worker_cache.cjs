const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = process.env.DWSS_PUBLIC_DIR || 'public';
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const boot = read('boot.js');
const version = read('VERSION.txt');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert.match(version, /^Version: 0\.9\.70$/m);
assert(sw.includes("const APP_VERSION = '0.9.70';"));
assert(/['"]\\.\\/dictionary\\.js\\.gz['"]/.test(sw), 'website dictionary gzip is pre-cached');
assert(!/['"]\\.\\/dictionary\\.js['"]/.test(sw), 'nonexistent plain dictionary must not be pre-cached');
assert.match(boot, /\['\.\/dictionary\.js\.gz', '\.\/dictionary\.js'\]/,
  'website loads gzip first; Android has a plain dictionary fallback');
assert(boot.includes("|| '0.9.70';"), 'bootstrap fallback version is current');

const precache = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
assert(precache, 'pre-cache URL list exists');
const urls = [...precache[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
assert(urls.includes('./dictionary.js.gz'));
for (const url of urls) {
  const local = path.join(root, url.replace(/^\.\//, ''));
  assert(fs.existsSync(local), 'every pre-cache URL exists in deployed website: ' + url);
}
zlib.gunzipSync(fs.readFileSync(path.join(root, 'dictionary.js.gz')));

assert(app.includes("version:'0.9.70'"));
assert(html.includes('content="0.9.70">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_70'));
assert(html.includes('版本 0.9.70 · 刚果金斯语翻译'));
assert(html.includes('dwss:announcement-dismissed:0.9.70'));
assert(html.includes("get('dwss-native-app')==='1'"), 'native Android gets its own first-open state');
assert(html.includes("(nativeAndroid?'android':'web')"), 'Android and web dismissal keys are independent');
assert(!html.includes('dwss:announcement-dismissed:0.9.69'));
for (const marker of ['一、开发目的','二、底版词库来源','三、云端共享词库','四、自动更新与离线使用','我已阅读，进入应用']) {
  assert(html.includes(marker), 'announcement content exists: ' + marker);
}
assert.equal((html.match(/dwss-announcement-overlay/g) || []).length >= 2, true);
assert(html.includes('© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利'));
assert((html.match(/dwss-release=0\.9\.70/g) || []).length >= 3);
assert.equal(manifest.id, './?app=dwss-kolwezi-swahili');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.name, '刚果金斯语翻译');

console.log('PASS: every Service Worker pre-cache URL exists in the live website asset directory.');
console.log('PASS: dictionary.js.gz is the only website dictionary pre-cache target; gzip integrity verified.');
console.log('PASS: 0.9.70 metadata, exact copyright footer, and fresh first-open announcement are present.');
console.log('PASS: existing PWA identity and Android local dictionary fallback are preserved.');
