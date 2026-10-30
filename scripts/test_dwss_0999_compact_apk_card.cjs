'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html'),app=read('app.js'),pwa=read('pwa.js'),sw=read('sw.js'),version=read('VERSION.txt');
assert.match(version,/^Version: 0\.9\.99$/m);
assert.match(html,/DWSS_AUTO_UPDATE_0_9_99/);
assert.match(html,/content="0\.9\.99"/);
assert.doesNotMatch(html,/<div class="footer">/,'the red-circled version footer must be removed entirely');
assert.ok(html.indexOf('</main>')<html.indexOf('id="dwss-apk-download"'),
  'the installer must remain immediately after the main app content');
assert.match(html,/href="\.\/DWSS-Android-Installer\.apk"/);
assert.match(html,/id="apkWebVersion"/);
assert.match(html,/当前软件版本/);
assert.match(html,/首次安装一次即可；联网后软件自动更新，无需重新下载 APK/);
const compact=html.split('id="dwss-compact-apk-footer-0999"')[1];
assert.ok(compact,'compact installer style must exist');
for(const rule of [
 'margin:0 auto 10px!important',
 'padding:7px 12px 8px!important',
 'width:58px!important',
 'height:58px!important',
 'min-height:34px!important',
 'font-size:11px!important'
]) assert.ok(compact.includes(rule),'Missing compact installer rule '+rule);
assert.match(pwa,/const footer = document\.querySelector\('\.footer'\)/);
assert.match(pwa,/if \(footer\) \{/,'footer version refresh must be optional');
assert.match(pwa,/const installerVersion = \$\('apkWebVersion'\)/);
assert.match(pwa,/installerVersion\.textContent = match\[1\]/);
assert.match(app,/version:'0\.9\.99'/);
assert.match(sw,/APP_VERSION = '0\.9\.99'/);
assert.match(sw,/endsWith\('\.apk'\)/);
assert.doesNotMatch(html,/id="installAppBtn"/);
assert.match(html,/id="translationPronunciationCandidates"/);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const duplicate=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepEqual([...new Set(duplicate)],[],'no duplicate IDs');
const manifest=JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name,'刚果金斯语翻译');
console.log('PASS DWSS 0.9.99: no footer version, compact bottom installer, unchanged stable APK URL and live version refresh.');
