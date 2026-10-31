'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html'),app=read('app.js'),shared=read('shared-lexicon.js'),sw=read('sw.js'),version=read('VERSION.txt');
assert.match(version,/^Version: 0\.9\.110$/m);
assert.match(html,/DWSS_AUTO_UPDATE_0_9_110/);
assert.match(html,/content="0\.9\.110"/);
assert.match(app,/version:'0\.9\.110'/);
assert.match(sw,/APP_VERSION = '0\.9\.110'/);
for(const id of ['translationCorrectionPanel','submitTranslationCorrection','resultReading',
 'translationPronunciationCandidates','translationPronunciationCandidateList'])
 assert.ok(html.includes('id="'+id+'"'),'missing core control '+id);
for(const old of ['dwss-pronunciation-more','更多读音操作','restoreTranslationCorrection',
 'viewTranslationCorrectionHistory','viewWithdrawnVariants','修改历史','已撤回读音','恢复自动翻译'])
 assert.ok(!html.includes(old),'low-frequency controls remain in HTML: '+old);
assert.match(app,/data-dwss-pin/);
assert.match(app,/aria-label="将 .* 置顶为所有用户的首选读音"/);
assert.match(app,/await submitTranslationCorrection\(\)/);
assert.match(app,/function renderTranslationPronunciationCandidates/);
assert.match(app,/submitQuickTranslationTerm/);
assert.match(app,/const correctionHistoryButton=\$\('viewTranslationCorrectionHistory'\);if\(correctionHistoryButton\)/);
assert.match(app,/const withdrawnHistoryButton=\$\('viewWithdrawnVariants'\);if\(withdrawnHistoryButton\)/);
assert.match(app,/const restoreCorrectionButton=\$\('restoreTranslationCorrection'\);if\(restoreCorrectionButton\)/);
assert.match(shared,/async function pinQuickTranslationPrimary/);
assert.match(shared,/pinQuickTranslationPrimary\(client, payload/);
assert.match(shared,/dwss-edit-dictionary-pronunciation/);
assert.match(shared,/async function submitQuickTranslationTerm/);
assert.match(shared,/dwss-submit-pronunciation-variant/);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual([...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))],[],'HTML IDs must be unique');
for(const file of ['app.js','shared-lexicon.js','sw.js','boot.js','dwss-pronunciation-controls.js','dictionary-overrides.js']){
 const cp=require('node:child_process').spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
 assert.equal(cp.status,0,file+' syntax error: '+(cp.stderr||cp.stdout));
}
const crypto=require('node:crypto');
const apk=fs.readFileSync(path.join(root,'DWSS-Android-Installer.apk'));
assert.equal(crypto.createHash('sha256').update(apk).digest('hex'),'9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5','Android installer must remain byte-identical');
console.log('PASS DWSS 0.9.110: no More Actions UI; one main save; different-reading candidates and per-candidate cloud pin retained; history data code remains; unique IDs; JS syntax; unchanged APK.');
