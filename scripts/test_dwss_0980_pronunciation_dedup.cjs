#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');

const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('index.html'),app=read('app.js'),boot=read('boot.js'),sw=read('sw.js');
const version=read('VERSION.txt'),manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.80$/m);
assert(sw.includes("const APP_VERSION = '0.9.80';"));
assert(html.includes('content="0.9.80">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_80'));
assert(html.includes('版本 0.9.80 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.80/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.79/g)||[]).length,0);
assert(app.includes("version:'0.9.80'"));

const pCtx={window:{}};
vm.runInNewContext(read('hanzi-pinyin.js'),pCtx);
const pinyin=pCtx.window.DWSS_HANZI_PINYIN;
assert(Object.keys(pinyin).length>18000);
const sCtx={window:{DWSS_HANZI_PINYIN:pinyin}};
vm.runInNewContext(read('pronunciation-search.js'),sCtx);
const engine=sCtx.window.DWSSPronunciationSearch;
assert(engine&&typeof engine.search==='function');

const target=[{zh:'看',variants:[{reading:'麻球麻球',source:'测试'}]}];
for(const phrase of ['麻球麻球','麻丘麻丘','马球马球']){
  const matches=engine.search(phrase,target,{limit:10});
  assert.equal(matches.length,1);
  assert.equal(matches[0].zh,'看');
  assert.equal(matches[0].score,1);
}

const longer=[{zh:'四音节词条',variants:[{reading:'我毛豆我'}]},{zh:'重复四音节词条',variants:[{reading:'毛豆毛豆'}]}];
assert.equal(engine.search('毛豆',longer,{limit:20}).length,0);

const duplicateSameMeaning=[
  {zh:'火',variants:[{reading:'毛斗',source:'来源一'}]},
  {zh:'火',variants:[{reading:'毛斗',source:'来源二'}]}
];
assert.equal(engine.search('毛豆',duplicateSameMeaning,{limit:20}).length,1,
  'same meaning and same pinyin from two sources are merged');

const homonymousMeanings=[
  {zh:'火',variants:[{reading:'毛斗',source:'来源一'}]},
  {zh:'火焰',variants:[{reading:'毛豆',source:'来源二'}]}
];
assert.equal(engine.search('毛豆',homonymousMeanings,{limit:20}).length,2,
  'different meanings with the same complete sound remain visible');

const dictCtx={window:{}};
vm.runInNewContext(zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8'),dictCtx);
const db=dictCtx.window.SW_DB;
assert(Array.isArray(db)&&db.length>=2000);
const entries=db.map(x=>({zh:x.zh,category:'词库',variants:x.variants||[]}));
const fire=engine.search('毛豆',entries,{limit:50});
const fireKeys=fire.map(x=>x.zh.normalize('NFKC').replace(/\s+/g,'').toLowerCase()+'|'+engine.toSyllables(x.matchedReading,false).join(' '));
assert.equal(new Set(fireKeys).size,fireKeys.length,'actual dictionary results contain no duplicate meaning/sound pairs');
assert.equal(fire.filter(x=>x.zh==='火').length,1,'duplicate 火/毛斗 rows collapse to one');
assert(fire.some(x=>x.zh==='火'&&x.score===1),'毛豆 sound finds the exact 毛斗 pronunciation entry');

const eyes=engine.search('麻球麻球',entries,{limit:50});
assert(eyes.some(x=>x.zh==='眼睛'&&x.matchedReading==='马秋马秋'),
  'real source lexicon returns the stored eye/eyes pronunciation row');
for(const phrase of ['麻球麻球','麻丘麻丘','马球马球']){
  const results=engine.search(phrase,entries,{limit:50});
  assert(results.some(x=>x.zh==='眼睛'&&x.matchedReading==='马秋马秋'));
}

assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(sw.includes("'./hanzi-pinyin.js'")||sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'")||sw.includes('"./pronunciation-search.js"'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

console.log('PASS: three different Hanzi inputs for ma qiu ma qiu find the same real dictionary reading.');
console.log('PASS: short homophone queries never match segments inside longer phrases.');
console.log('PASS: duplicate same-meaning/same-sound rows collapse; different meanings remain.');
console.log('PASS: real dictionary 毛豆 query returns the 火/毛斗 sound entry once.');
console.log('PASS: real dictionary 麻球麻球 / 麻丘麻丘 / 马球马球 matches 马秋马秋 (眼睛).');
console.log('PASS: DWSS 0.9.80 app metadata, offline modules and PWA identity remain intact.');
