'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const app=read('app.js');
const mod=read('dictionary-overrides.js');
const sw=read('sw.js');
const boot=read('boot.js');
const version=read('VERSION.txt');
const manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.91$/m);
assert.match(html,/DWSS_AUTO_UPDATE_0_9_91/);
assert.match(html,/content="0\.9\.91"/);
assert.match(html,/<textarea[^>]*id="resultReading"/,'the original result field itself must be editable');
assert.match(html,/id="translationCorrectionPanel"/);
assert.match(html,/id="submitTranslationCorrection"/);
assert.match(html,/id="restoreTranslationCorrection"/);
assert.doesNotMatch(html,/id="installAppBtn"/,'obsolete top PWA install button must be removed');
assert.match(html,/id="dwss-apk-download"/);
assert.match(html,/href="\.\/DWSS-Android-0\.9\.80\.apk"/);
assert.match(html,/5\.81 MB/);
assert.match(app,/source_kind==='translation'/,'sentence correction is exact-match only');
assert.match(app,/publicOverride=override&&override\.source_kind!=='translation'\?override:null/,
  'full sentence override must not contaminate token-level word matching');
assert.match(app,/updateTranslation\(/);
assert.match(app,/restoreTranslation\(/);
assert.match(app,/remoteConflict/,'Realtime conflict should protect the in-progress draft');
assert.match(app,/expected_revision:state\.revision/,'optimistic version is sent to cloud');
assert.match(app,/navigator\.onLine/,'cloud writes must not be falsely acknowledged while offline');
assert.match(mod,/original_pronunciation_cn,revision,source_kind/);
assert.match(mod,/postgres_changes/,'connected clients subscribe to Realtime updates');
assert.match(mod,/updateTranslation:data=>send\("update"/);
assert.match(mod,/restoreTranslation:data=>send\("restore"/);
assert.match(mod,/dwss-edit-dictionary-pronunciation/);
assert.match(sw,/APP_VERSION = '0\.9\.91'/);
assert.match(sw,/endsWith\('\.apk'\)/,'large APK downloads must bypass Service Worker cache');
const precache=sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
assert.ok(precache,'precache list exists');
assert.doesNotMatch(precache[1]/\.apk/i,'APK must not be precached');
assert.match(precache[1],/dictionary-overrides\.js/);
assert.match(boot,/dictionary-overrides\.js/);
assert.equal(manifest.name,'刚果金斯语翻译');
assert.equal(manifest.display,'standalone');

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepEqual([...new Set(duplicates)],[],'no duplicate HTML IDs');
const resultPos=html.indexOf('id="resultReading"');
const correctionPos=html.indexOf('id="translationCorrectionPanel"');
assert.ok(resultPos>=0&&correctionPos>resultPos,'correction controls are below the result field');
const footerPos=html.indexOf('<div class="footer">');
const apkPos=html.indexOf('id="dwss-apk-download"');
assert.ok(footerPos>=0&&apkPos>footerPos,'APK card stays at page bottom');

const apk=fs.readFileSync(path.join(root,'DWSS-Android-0.9.80.apk'));
assert.equal(apk.length,5806530,'exact previous Android APK size retained');
const crypto=require('node:crypto');
assert.equal(crypto.createHash('sha256').update(apk).digest('hex'),
 '9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5',
 'exact verified APK bytes retained');
console.log('PASS DWSS 0.9.91: editable sentence result, cloud submit/restore, Realtime, conflict protection, no duplicate IDs, offline assets and verified APK.');
