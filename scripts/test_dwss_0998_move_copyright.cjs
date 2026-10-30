'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html'),app=read('app.js'),sw=read('sw.js'),version=read('VERSION.txt');
const stamp='<span class="ownership-stamp">© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利</span>';
assert.match(version,/^Version: 0\.9\.98$/m);
assert.match(html,/DWSS_AUTO_UPDATE_0_9_98/);
assert.match(html,/content="0\.9\.98"/);
assert.equal((html.match(/class="ownership-banner"/g)||[]).length,1);
assert.equal((html.match(/© 2026 刚果金斯语翻译\/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利/g)||[]).length,1,
  'copyright text must be present once only');
assert.ok(html.indexOf('class="cover-frame"')<html.indexOf('class="ownership-banner"'),
  'copyright box must follow the cover');
assert.ok(html.indexOf('class="ownership-banner"')<html.indexOf('class="status-strip"'),
  'copyright box must appear before the status strip');
const footer=html.split('<div class="footer">')[1].split('</div>')[0];
assert.match(footer,/版本 0\.9\.98/);
assert.doesNotMatch(footer,/© 2026|ownership-stamp/,'original copyright box must be removed from old footer');
const banner=html.split('<div class="ownership-banner"')[1].split('</div>')[0];
assert.ok(banner.includes('class="ownership-stamp"'),'bordered copyright stamp is moved intact');
assert.match(html,/\.ownership-banner\{[^}]*justify-content:center/);
assert.match(html,/\.ownership-banner \.ownership-stamp\{[^}]*width:min\(100%,570px\)/);
assert.match(app,/version:'0\.9\.98'/);
assert.match(sw,/APP_VERSION = '0\.9\.98'/);
assert.match(html,/id="dwss-apk-download"/);
assert.match(html,/href="\.\/DWSS-Android-Installer\.apk"/);
assert.match(html,/id="translationPronunciationCandidates"/);
assert.doesNotMatch(html,/id="installAppBtn"/);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepEqual([...new Set(duplicates)],[],'no duplicate IDs');
const manifest=JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name,'刚果金斯语翻译');
console.log('PASS DWSS 0.9.98: copyright box appears once below cover, bottom footer has version only, and page identity/features preserved.');
