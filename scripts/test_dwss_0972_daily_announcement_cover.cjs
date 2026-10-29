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

assert.match(version, /^Version: 0\.9\.72$/m);
assert(sw.includes("const APP_VERSION = '0.9.72';"));
assert(sw.includes("'./dictionary.js.gz'") || sw.includes('"./dictionary.js.gz"'));
assert(!sw.includes("'./dictionary.js',") && !sw.includes('"./dictionary.js",'));
assert(boot.includes('dictionary.js.gz'));
assert(app.includes("version:'0.9.72'"));
assert(html.includes('content="0.9.72">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_72'));
assert(html.includes('版本 0.9.72 · 刚果金斯语翻译'));
assert(html.includes('loading="eager" fetchpriority="high" decoding="sync"'));
assert(html.includes('display:block!important'));
assert(html.includes('flex:none!important'));
assert(html.includes('aspect-ratio:1/1!important'));
assert(html.includes('object-fit:contain!important'));
assert(html.includes("timeZone:'Africa/Lubumbashi'"));
assert(html.includes("dwss:announcement-last-shown:"));
assert(html.includes("const platform=nativeAndroid?'android':'web'"));
assert(html.includes("if(lastDate!==today)"));
assert(html.includes("localStorage.setItem(key,today)"));
assert(html.includes('id="dwss-native-cover-top-v0972"'));
assert(html.includes("history.scrollRestoration='manual'"));
assert(html.includes('#e0ebcf') && html.includes('#cfdfba') && html.includes('#66885d'));
assert(!html.includes('dwss:announcement-dismissed:0.9.71:'));
assert(html.includes('© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利'));
for (const marker of ['一、开发目的','二、底版词库来源','三、云端共享词库',
                      '四、自动更新与离线使用','我已阅读，进入应用']) {
  assert(html.includes(marker), 'announcement content exists: ' + marker);
}
const swList=sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
assert(swList,'Service Worker precache list exists');
const urls=[...swList[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]);
assert(urls.includes('./dictionary.js.gz'));
assert(!urls.includes('./dictionary.js'));
for(const url of urls){
  const relative=url.replace(/^\.\//,'');
  if(relative && relative!=='.') assert(fs.existsSync(path.join(root,relative)),
    'all precache URLs exist: '+url);
}
zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz')));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');
console.log('PASS: 0.9.72 Service Worker pre-cache assets exist; gzip dictionary integrity verified.');
console.log('PASS: full-image cover sizing, eager image load and Android scroll reset present.');
console.log('PASS: announcement is once per Africa/Lubumbashi calendar day for web and Android separately.');
console.log('PASS: matcha-green announcement surfaces, unchanged announcement copy and PWA identity.');
