'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public',read=n=>fs.readFileSync(path.join(root,n),'utf8');
const app=read('app.js'),version=read('VERSION.txt'),html=read('index.html'),sw=read('sw.js');
assert.match(version,/^Version: 0\.9\.105$/m);assert.ok(html.includes('DWSS_AUTO_UPDATE_0_9_105'));assert.ok(sw.includes("const APP_VERSION = '0.9.105';"));
assert.match(app,/function sourceHeadwordAliases\(item\)/);assert.match(app,/function lookupSourceReviewAt\(input,index\)/);assert.ok(app.includes('原始资料待核对'));
const prefix='window.SW_DB = ',raw=zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8');assert.ok(raw.startsWith(prefix));
const DB=JSON.parse(raw.slice(prefix.length).trim().replace(/;$/,''));
function section(a,b){const s=app.indexOf(a);assert.ok(s>=0,'missing '+a);const e=app.indexOf(b,s);assert.ok(e>s,'missing '+b);return app.slice(s,e).trim();}
const normLine=app.split('\n').find(x=>x.startsWith('const norm = ')),aliasLine=app.split('\n').find(x=>x.startsWith('const SOURCE_HEADWORD_ALIASES=')),aliasIndexLine=app.split('\n').find(x=>x.startsWith('const SOURCE_HEADWORD_ALIAS_INDEX='));
const box={console,VARIANT_SEPARATOR:'　｜　'};vm.createContext(box);
const fns=[
 section('function sourceHeadwordAliases(item){','\nfunction rebuild(){'),
 section('function preferredLocalVariants(item){','\nfunction pronunciationLookupVariants'),
 section('function localLatinVariants(item){','\nfunction localOrigin(item){'),
 section('function localOrigin(item){','\nfunction normalizedInputSpan'),
 section('function normalizedInputSpan(input,index,target){','\nfunction lookupLocalAt'),
 section('function lookupLocalAt(input,index){','\nfunction preferredFrenchPronunciationVariants'),
 section('function preferredFrenchPronunciationVariants(item){','\nfunction lookupFrenchPronunciationAt'),
 section('function lookupFrenchPronunciationAt(input,index){','\nfunction translateFrenchHomophone'),
 section('function lookupSourceReviewAt(input,index){','\nfunction tokenize(raw){')
];
vm.runInContext(normLine+'\n'+aliasLine+'\n'+aliasIndexLine+'\n'+fns.join('\n')+'\nglobalThis.norm=norm;',box);
const norm=box.norm,map=new Map(),keys=[];
for(const row of DB){if(!row||!row.zh)continue;const k=norm(row.zh);if(!map.has(k))map.set(k,{zh:row.zh,variants:(row.variants||[]).map(v=>({...v,origin:'builtin'})),aliases:[]});else map.get(k).variants.push(...(row.variants||[]).map(v=>({...v,origin:'builtin'})));}
const all=[...map.values()];
for(const item of all)keys.push({item,matchKey:item.zh,normalized:norm(item.zh)});
for(const item of all)for(const alias of box.sourceHeadwordAliases(item)){const k=norm(alias);if(k&&!map.has(k)){map.set(k,item);item.aliases.push(alias);keys.push({item,matchKey:alias,normalized:k});}}
box.map=map;box.keys=keys.sort((a,b)=>b.normalized.length-a.normalized.length);
for(const [alias,canonical] of [['他的','他(她)的'],['她的','他(她)的'],['她','他(她)'],['死掉','坏掉/死掉'],['脑袋','头(脑袋)'],['亲属','亲戚(亲属)']]){const hit=box.lookupLocalAt(alias,0);assert.ok(hit&&norm(hit.item.zh)===norm(canonical),alias+' alias');}
for(const input of ['他的、她的/坏掉（死掉）','十亿','行']){let i=0;while(i<input.length){if(!norm(input[i])){i++;continue;}const hit=box.lookupLocalAt(input,i)||box.lookupFrenchPronunciationAt(input,i);assert.ok(hit&&hit.length>0,'punctuation normalization: '+input.slice(i));i+=hit.length;}}
for(const word of ['摩托罗拉','水桶']){const review=box.lookupSourceReviewAt(word,0),local=box.lookupLocalAt(word,0),fr=box.lookupFrenchPronunciationAt(word,0);assert.ok(review&&review.length===word.length);assert.ok(review.length>Math.max(local?local.length:0,fr?fr.length:0));}
const place=box.lookupLocalAt('那里',0),placeReview=box.lookupSourceReviewAt('那里',0);assert.ok(place&&place.item.variants.some(v=>v.reading==='巴雷'));assert.ok(placeReview&&placeReview.item.variants.some(v=>v.sourceWarning));
const marked=DB.flatMap(x=>(x.variants||[]).filter(v=>v.sourceWarning));assert.equal(marked.length,3);assert.ok(DB.some(x=>x.zh==='行'&&(x.variants||[]).some(v=>v.reading==='马累谢')));
assert.ok(app.includes('reviewMatch.length>bestVerifiedLength'));assert.ok(app.includes('待核对 \${r.reviewHits} 处'));assert.ok(app.includes('原始资料明确标注为法语，并非当地斯瓦希里语。'));
const apk=fs.readFileSync(path.join(root,'DWSS-Android-Installer.apk'));assert.equal(crypto.createHash('sha256').update(apk).digest('hex'),'9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5');
console.log('PASS DWSS 0.9.105: canonical dictionary matcher, aliases, punctuation, 3 source-warning records, suspect-reading suppression, valid alternative retention and unchanged Android APK.');
