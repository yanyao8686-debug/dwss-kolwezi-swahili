const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = process.env.DWSS_PUBLIC_DIR || 'public';
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const boot = read('boot.js');
const sw = read('sw.js');
const version = read('VERSION.txt');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert.match(version, /^Version: 0\.9\.71$/m);
assert(sw.includes("const APP_VERSION = '0.9.71';"));
assert(sw.includes("'./dictionary.js.gz'") || sw.includes('"./dictionary.js.gz"'));
assert(!sw.includes("'./dictionary.js',") && !sw.includes('"./dictionary.js",'));
assert(boot.includes('dictionary.js.gz'), 'web bootstrap uses the deployed gzip dictionary');
assert(app.includes("version:'0.9.71'"));
assert(html.includes('content="0.9.71">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_71'));
assert(html.includes('版本 0.9.71 · 刚果金斯语翻译'));
assert(html.includes("get('dwss-native-app')==='1'"));
assert(html.includes("dwss:announcement-dismissed:0.9.71:"));
assert(html.includes("(nativeAndroid?'android':'web')"));
assert(!html.includes('dwss:announcement-dismissed:0.9.70:'));

const precache = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
assert(precache, 'pre-cache URL list exists');
const urls = [...precache[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
assert(urls.includes('./dictionary.js.gz'));
assert(!urls.includes('./dictionary.js'));
for (const url of urls) {
  const relative = url.replace(/^\.\//, '');
  if (relative && relative !== '.') {
    assert(fs.existsSync(path.join(root, relative)),
      'every pre-cache URL must be deployed: ' + url);
  }
}
zlib.gunzipSync(fs.readFileSync(path.join(root, 'dictionary.js.gz')));

for (const marker of ['一、开发目的','二、底版词库来源','三、云端共享词库',
                      '四、自动更新与离线使用','我已阅读，进入应用']) {
  assert(html.includes(marker), 'announcement content exists: ' + marker);
}
assert(html.includes('© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利'));
assert((html.match(/dwss-release=0\.9\.71/g) || []).length >= 3);
assert.equal(manifest.id, './?app=dwss-kolwezi-swahili');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.name, '刚果金斯语翻译');

console.log('PASS: every pre-cache URL exists; dictionary.js.gz integrity verified.');
console.log('PASS: 0.9.71 cache version, footer, announcement and Android-specific state verified.');
console.log('PASS: existing PWA identity preserved.');
