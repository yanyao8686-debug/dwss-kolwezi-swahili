'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html'),app=read('app.js'),sw=read('sw.js'),version=read('VERSION.txt');
function block(selector){
 const marker=selector+'{';
 const at=html.indexOf(marker);
 assert.ok(at>=0,'Missing selector '+selector);
 const end=html.indexOf('}',at+marker.length);
 assert.ok(end>at,'Missing CSS block end for '+selector);
 return html.slice(at+marker.length,end);
}
function property(css,name){
 const match=css.match(new RegExp('(?:^|[;\\s])'+name+'\\s*:\\s*([^;]+)'));
 return match&&match[1].trim();
}
const helper=block('.translation-correction-hint');
const reference=block('.pronunciation-lookup-card .pronunciation-lookup-instruction');
for(const prop of ['color','font-size','font-weight','letter-spacing','line-height','text-align']){
 assert.equal(property(helper,prop),property(reference,prop),'helper '+prop+' must match the pronunciation lookup instruction');
}
assert.match(version,/^Version: 0\.9\.96$/m);
assert.match(html,/DWSS_AUTO_UPDATE_0_9_96/);
assert.match(html,/content="0\.9\.96"/);
assert.match(html,/>提交修正并同步所有用户<\/button>/);
assert.match(html,/认为翻译结果错误可自行修改输入框内翻译结果/);
assert.match(html,/id="translationPronunciationCandidates"/);
assert.match(html,/id="translationPronunciationCandidateList"/);
assert.match(html,/id="dwss-apk-download"/);
assert.doesNotMatch(html,/id="installAppBtn"/);
assert.match(app,/version:'0\.9\.96'/);
assert.match(app,/button\.textContent='提交修正并同步所有用户'/);
assert.match(app,/submitPronunciationVariant/);
assert.match(sw,/APP_VERSION = '0\.9\.96'/);
const precache=sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
assert.ok(precache);
assert.match(precache[1],/shared-lexicon\.js/);
assert.doesNotMatch(precache[1],/\.apk/i);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepEqual([...new Set(duplicates)],[],'no duplicate HTML ids');
console.log('PASS DWSS 0.9.96: helper typography exactly matches pronunciation lookup instruction and all existing features remain.');
