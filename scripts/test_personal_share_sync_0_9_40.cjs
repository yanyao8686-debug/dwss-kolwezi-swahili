'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const shared=fs.readFileSync('public/shared-lexicon.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
assert(app.includes("version:'0.9.40'"),'app version');
assert(app.includes('function customShareStatusLabel(entry)'), 'visible status helper');
assert(app.includes('共享状态：'),'status rendered in local list');
assert(app.includes('retrySharedSync'),'retry button wired');
assert(html.includes('id="retrySharedSync"'),'retry button exists');
assert(html.includes('当地斯语中文谐音（共享必填）'),'required pronunciation explained');
assert(shared.includes('retryPending: retryPendingSync'),'retry API exposed');
assert(shared.includes('共享词条被数据库拒绝'),'server error is surfaced');
assert(shared.includes('result.error.code || "UNKNOWN"'),'error code is surfaced');
assert(shared.includes('if (!save(QUEUE_KEY, queue))'),'queue persistence checked');
function extractFunction(source,name){
 const start=source.indexOf('function '+name+'(');assert(start>=0,'function '+name);
 const brace=source.indexOf('{',start);let depth=0,quote=null,escaped=false;
 for(let i=brace;i<source.length;i++){const ch=source[i];if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote=null;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0)return source.slice(start,i+1);}
 throw new Error('function extraction failed');
}
const fn=extractFunction(shared,'buildPersonalPayload');
const sandbox={window:{KolweziSwahili:{frenchReading:()=> '法语读音'}}};vm.createContext(sandbox);
vm.runInContext(fn+'\nglobalThis.buildPayload=buildPersonalPayload;',sandbox);
const sw=sandbox.buildPayload({id:'s',zh:'检查车辆',reading:'揭给 摸多嘎',latin:'kagua gari',french:'',category:'安保与工作'},'11111111-1111-4111-8111-111111111111');
assert.equal(sw.payload.source_language,'sw');assert.equal(sw.payload.local_text,'kagua gari');assert.equal(sw.payload.local_pronunciation_cn,'揭给 摸多嘎');assert.equal(sw.payload.notes,null);
const latin=sandbox.buildPayload({id:'l',zh:'检查车辆',reading:'',latin:'kagua gari',french:''},'22222222-2222-4222-8222-222222222222');
assert.equal(latin.payload,undefined);assert.match(latin.error,/当地斯语中文谐音/);
const fr=sandbox.buildPayload({id:'f',zh:'集合',reading:'',latin:'',french:'rassembler',frenchReadingZh:'法语读音'},'33333333-3333-4333-8333-333333333333');
assert.equal(fr.payload.source_language,'fr');assert.equal(fr.payload.french_text,'rassembler');
assert(shared.includes('setPersonalStatus(entry.id, "needs-info", submitId, built.error, "offline")'),'incomplete entry status');
assert(shared.includes('const connected = await connectCloud();'),'retry connects first');
assert(shared.includes('await syncPendingPersonalTerms();'),'pending sync retried');
console.log('PASS: DWSS 0.9.40 payload mapping, local-only distinction, retry and error reporting.');
