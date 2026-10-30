'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const assert=require('node:assert/strict');
const root=process.env.DWSS_PUBLIC_DIR||'public',read=n=>fs.readFileSync(path.join(root,n),'utf8');
const app=read('app.js'),version=read('VERSION.txt'),sw=read('sw.js'),html=read('index.html');
assert.match(version,/^Version: 0\.9\.104$/m);
assert.ok(html.includes('DWSS_AUTO_UPDATE_0_9_104'));
assert.ok(sw.includes("const APP_VERSION = '0.9.104';"));
assert.match(app,/function sourceHeadwordAliases\(item\)/);
assert.match(app,/if\(!part\)continue;/);
const prefix='window.SW_DB = ',dt=zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8');
assert.ok(dt.startsWith(prefix));const DB=JSON.parse(dt.slice(prefix.length).trim().replace(/;$/,''));
function section(a,b){const s=app.indexOf(a);assert.ok(s>=0,'missing '+a);const e=app.indexOf(b,s);assert.ok(e>s,'missing '+b);return app.slice(s,e).trim();}
const normLine=app.split('\n').find(x=>x.startsWith('const norm = '));
const aliasLine=app.split('\n').find(x=>x.startsWith('const SOURCE_HEADWORD_ALIASES='));
const aliasIndexLine=app.split('\n').find(x=>x.startsWith('const SOURCE_HEADWORD_ALIAS_INDEX='));
assert.ok(normLine&&aliasLine&&aliasIndexLine);
const sandbox={console,VARIANT_SEPARATOR:'　｜　'};vm.createContext(sandbox);
const fns=[
 section('function sourceHeadwordAliases(item){','\nfunction rebuild(){'),
 section('function preferredLocalVariants(item){','\nfunction pronunciationLookupVariants'),
 section('function localLatinVariants(item){','\nfunction localOrigin(item){'),
 section('function localOrigin(item){','\nfunction normalizedInputSpan'),
 section('function normalizedInputSpan(input,index,target){','\nfunction lookupLocalAt'),
 section('function lookupLocalAt(input,index){','\nfunction preferredFrenchPronunciationVariants'),
 section('function preferredFrenchPronunciationVariants(item){','\nfunction lookupFrenchPronunciationAt'),
 section('function lookupFrenchPronunciationAt(input,index){','\nfunction translateFrenchHomophone'),
 section('function tokenize(raw){','\nfunction joinParts')
];
vm.runInContext(normLine+'\n'+aliasLine+'\n'+aliasIndexLine+'\n'+fns.join('\n')+'\nglobalThis.norm=norm;',sandbox);
const norm=sandbox.norm,grouped=new Map();
for(const row of DB){if(!row||!row.zh)continue;const k=norm(row.zh);if(!k)continue;
 if(!grouped.has(k))grouped.set(k,{zh:row.zh,variants:(row.variants||[]).map(v=>({...v,origin:'builtin'})),aliases:[]});
 else grouped.get(k).variants.push(...(row.variants||[]).map(v=>({...v,origin:'builtin'})));
}
const all=[...grouped.values()],map=new Map(all.map(x=>[norm(x.zh),x]));
const matchEntries=all.map(item=>({item,matchKey:item.zh,normalized:norm(item.zh)}));all.forEach(x=>x.aliases=[]);
const owners=new Map();
for(const item of all)for(const alias of sandbox.sourceHeadwordAliases(item)){
 const k=norm(alias);if(!k||map.has(k))continue;
 if(!owners.has(k))owners.set(k,{alias,item,items:[item]});
 else if(!owners.get(k).items.includes(item))owners.get(k).items.push(item);
}
for(const [k,o] of owners){if(map.has(k))continue;const alternatives=o.items.slice(1);map.set(k,o.item);o.item.aliases.push(o.alias);
 matchEntries.push({item:o.item,matchKey:o.alias,normalized:k,alternatives});}
sandbox.map=map;sandbox.keys=matchEntries.sort((a,b)=>b.normalized.length-a.normalized.length);
const broken=[];
for(const item of DB){if(!item||!item.zh)continue;const r=sandbox.tokenize(item.zh);
 if(r.unknownChars!==0||r.localHits+r.frenchHits===0)broken.push({zh:item.zh,unknown:r.unknownChars,local:r.localHits,french:r.frenchHits});
}
assert.equal(broken.length,0,'all builtin dictionary headwords must be tokenized: '+JSON.stringify(broken.slice(0,25)));
const aliases=[['他的','他(她)的'],['她的','他(她)的'],['她','他(她)'],['那位','那位、她'],['死掉','坏掉/死掉'],['修复','修理、修复'],['脑袋','头(脑袋)'],['亲属','亲戚(亲属)'],['抄袭','抄（抄袭、抄 写）'],['嘲弄','嘲（嘲弄、嘲 笑）'],['切断','切断/关掉']];
for(const [a,c] of aliases){const r=sandbox.tokenize(a),cs=r.segments.filter(s=>s.type==='local').map(s=>s.canonical),as=r.segments.flatMap(s=>s.alternatives||[]);
 assert.ok(r.unknownChars===0&&(cs.includes(c)||as.includes(c)),a+' should resolve to '+c);}
for(const sample of ['中国人','法国人','再见','星期日']){const r=sandbox.tokenize(sample);assert.ok(r.localHits+r.frenchHits>0,sample+' should not be uncollected');}
const punctuation=sandbox.tokenize('他的、她的/坏掉（死掉）');
assert.equal(punctuation.unknownChars,0,'mixed punctuation should be consumed consistently');
assert.ok(DB.some(x=>x.zh==='行'&&(x.variants||[]).some(v=>v.reading==='马累谢')),'PDF omitted term should remain present');
const crypto=require('node:crypto'),apk=fs.readFileSync(path.join(root,'DWSS-Android-Installer.apk'));
assert.equal(crypto.createHash('sha256').update(apk).digest('hex'),'9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5');
console.log('PASS DWSS 0.9.104: '+DB.length+' built-in rows, every exact headword tokenized, '+aliases.length+' source aliases, punctuation, French fallback and unchanged Android APK.');
