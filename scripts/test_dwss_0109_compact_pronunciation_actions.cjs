'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html'),app=read('app.js'),controls=read('dwss-pronunciation-controls.js'),sw=read('sw.js'),version=read('VERSION.txt');
assert.match(version,/^Version: 0\.9\.109$/m);
assert.match(html,/DWSS_AUTO_UPDATE_0_9_109/);
assert.match(html,/content="0\.9\.109"/);
assert.match(app,/version:'0\.9\.109'/);
assert.match(sw,/APP_VERSION = '0\.9\.109'/);
assert.match(html,/id="submitTranslationCorrection"/);
assert.match(html,/id="dwss-pronunciation-more"/);
for(const id of ['restoreTranslationCorrection','viewTranslationCorrectionHistory','viewWithdrawnVariants']){
 const detailsStart=html.indexOf('id="dwss-pronunciation-more"');
 const detailsEnd=html.indexOf('</details>',detailsStart);
 const at=html.indexOf('id="'+id+'"');
 assert.ok(at>detailsStart&&at<detailsEnd,id+' must be inside collapsed More Actions disclosure');
}
const mainStart=html.indexOf('id="translationCorrectionPanel"');
const mainEnd=html.indexOf('</div><div class="stats"',mainStart);
const main=html.slice(mainStart,mainEnd);
assert.equal((main.match(/id="submitTranslationCorrection"/g)||[]).length,1);
assert.match(main,/修改上方读音后点“保存并同步”；其他读音会列在下方，点“置顶”即可设为全体首选。/);
assert.doesNotMatch(main,/不同读音紧凑排列；点击“置顶”即可设为所有用户的首选/);
assert.match(app,/restoreTranslationCorrection/);
assert.match(app,/viewTranslationCorrectionHistory/);
assert.match(app,/viewWithdrawnVariants/);
assert.match(app,/restoreTranslationOverrideHistory/);
assert.match(app,/unwithdrawSharedVariant/);
assert.match(controls,/\['submitTranslationVariant'\]/);
assert.doesNotMatch(controls,/\['submitTranslationVariant','restoreTranslationCorrection'/);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual([...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))],[],'HTML IDs must be unique');
for(const file of ['app.js','sw.js','boot.js','dwss-pronunciation-controls.js','shared-lexicon.js','dictionary-overrides.js']){
 const cp=require('node:child_process').spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
 assert.equal(cp.status,0,file+' syntax error: '+(cp.stderr||cp.stdout));
}
const crypto=require('node:crypto');
const apk=fs.readFileSync(path.join(root,'DWSS-Android-Installer.apk'));
assert.equal(crypto.createHash('sha256').update(apk).digest('hex'),'9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5','Android installer must remain byte-identical');
console.log('PASS DWSS 0.9.109: one main save action, collapsed history/recovery actions, combined copy, retained handlers, unique IDs, JS syntax and unchanged APK.');
