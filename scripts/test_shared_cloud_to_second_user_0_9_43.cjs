'use strict';
const fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root='public',html=fs.readFileSync(root+'/index.html','utf8');
assert(html.includes('id="translationWorkspace"'),'main translator remains');
assert(!html.includes('添加说明</summary>')&&!html.includes('自动共享说明'),'long instructions removed');
assert(html.includes('id="newZh"')&&html.includes('id="newReading"'),'two required inputs remain');
assert(html.includes('id="newFrench"')&&html.includes('id="newCategory"'),'legacy JS hooks remain hidden');

const cloudRows=[],subscribers=[];let nextId=1;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const client={
 from(table){
  assert.equal(table,'shared_terms');
  return {
   select(){
    const q={id:null,order(){return this;},eq(col,val){assert.equal(col,'client_submit_id');this.id=val;return this;},
     async single(){const row=cloudRows.find(x=>x.client_submit_id===this.id);return row?{data:{...row},error:null}:{data:null,error:{code:'PGRST116',message:'not found'}};},
     async range(from,to){return {data:cloudRows.slice(from,to+1).map(x=>({...x})),count:cloudRows.length,error:null};}};
    return q;
   },
   insert(payload){return {select(){return {async single(){
    if(cloudRows.some(x=>x.client_submit_id===payload.client_submit_id))return {data:null,error:{code:'23505',message:'duplicate'}};
    const row={...payload,id:'cloud-'+(nextId++),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    cloudRows.unshift(row);subscribers.forEach(fn=>fn({new:{...row}}));return {data:{...row},error:null};
   }}}};}
  };
 },
 channel(){const c={on(event,filter,fn){this.fn=fn;return this;},subscribe(cb){if(this.fn)subscribers.push(this.fn);if(cb)cb('SUBSCRIBED');return this;}};return c;}
};
function bootUser(name){
 const els=new Map(),listeners={};
 class CL{add(){}remove(){}toggle(){return false;}contains(){return false;}}
 class El{constructor(id=''){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.dataset={};this.style={};this.className='';this.classList=new CL();this.handlers={};this.children=[];}
 addEventListener(t,f){(this.handlers[t]??=[]).push(f);}querySelectorAll(){return [];}querySelector(){return new El('query');}
 appendChild(x){this.children.push(x);return x;}prepend(x){this.children.unshift(x);}insertBefore(x){this.children.unshift(x);return x;}replaceWith(){}remove(){}reset(){}focus(){}select(){}setAttribute(){}insertAdjacentHTML(){}}
 const get=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id);};
 [...html.matchAll(/\bid="([^"]+)"/g)].forEach(m=>get(m[1]));
 const document={readyState:'complete',visibilityState:'visible',body:get('body'),head:get('head'),getElementById:get,querySelectorAll(){return [];},querySelector(){return null;},createElement(t){return new El(t);},execCommand(){return true;},addEventListener(t,f){(this.events??={})[t]=f;}};
 class CE{constructor(type,o={}){this.type=type;this.detail=o.detail||{};}}
 class Ev{constructor(type,o={}){this.type=type;Object.assign(this,o);}}
 let uuid=0;const cryptoObj={randomUUID:()=> '00000000-0000-4000-8000-'+String(++uuid).padStart(12,'0')};
 const window={SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},crypto:cryptoObj,confirm:()=>true,scrollTo(){},addEventListener(t,f){(listeners[t]??=[]).push(f);},dispatchEvent(e){(listeners[e.type]||[]).forEach(f=>f(e));return true;},setTimeout,clearTimeout};
 window.supabase={createClient:()=>client};
 const store=new Map(),localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
 const context={window,document,localStorage,navigator,location:{hash:''},CustomEvent:CE,Event:Ev,console,setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Array,Object,String,Number,RegExp,Error,Promise,Intl,parseInt,parseFloat,URL,Blob,FormData,crypto:cryptoObj};
 vm.createContext(context);
 vm.runInContext(zlib.gunzipSync(fs.readFileSync(root+'/dictionary.js.gz')).toString('utf8'),context,{filename:name+'-dictionary.js'});
 vm.runInContext(fs.readFileSync(root+'/french-fallback.js','utf8'),context,{filename:name+'-french.js'});
 vm.runInContext(fs.readFileSync(root+'/shared-lexicon.js','utf8'),context,{filename:name+'-shared.js'});
 vm.runInContext(fs.readFileSync(root+'/app.js','utf8'),context,{filename:name+'-app.js'});
 return {api:window.KolweziSwahili,els,window};
}
(async()=>{
 const a=bootUser('A');await pause(20);
 a.els.get('inputText').value='夜班';a.els.get('translateBtn').handlers.click[0]();
 assert(a.api.translate('夜班').segments.some(x=>x.type==='french'),'control: 夜班 initially uses French fallback');
 a.els.get('newZh').value='夜班';a.els.get('newReading').value='夜班本地读音测试';
 const submit=a.els.get('entryForm').handlers.submit[0];assert.equal(typeof submit,'function');
 submit({preventDefault(){}});await pause(80);
 assert.equal(cloudRows.length,1,'one real form submit writes one row');
 assert.equal(cloudRows[0].chinese_text,'夜班','Chinese field mapping correct');
 assert.equal(cloudRows[0].local_pronunciation_cn,'夜班本地读音测试','pronunciation field mapping correct');
 assert.equal(cloudRows[0].source_language,'sw','correct local language tag');
 assert.equal(cloudRows[0].local_text,null,'optional Latin spelling is SQL NULL');
 assert.equal(a.api.getCustom().find(x=>x.zh==='夜班').shareSyncStatus,'synced','submitter sees cloud-confirmed state');
 assert(a.api.translate('夜班').segments.some(x=>x.type==='local'&&x.reading==='夜班本地读音测试'),'submitter immediately translates local term');
 assert.equal(a.els.get('resultFrench').textContent,'本句没有使用法语补位。','current phrase rerenders without French fallback');

 const b=bootUser('B');await pause(40);
 assert.equal(b.api.customCount,0,'second user has no local custom terms');
 assert.equal(b.api.sharedCount,1,'second user SELECT/RANGE loads cloud term');
 const cloudTerm=b.api.translate('夜班');
 assert(cloudTerm.segments.some(x=>x.type==='local'&&x.reading==='夜班本地读音测试'&&x.source==='云端共享词库'),'second user translates cloud-only entry');
 assert(!cloudTerm.segments.some(x=>x.type==='french'),'shared Swahili entry outranks French');

 a.els.get('newZh').value='门岗夜间巡查';a.els.get('newReading').value='门岗巡查本地读音测试';submit({preventDefault(){}});await pause(80);
 assert.equal(cloudRows.length,2,'second form submit inserts another row');
 assert.equal(b.api.sharedCount,2,'open user receives realtime INSERT');
 assert(b.api.translate('门岗夜间巡查').segments.some(x=>x.type==='local'&&x.reading==='门岗巡查本地读音测试'),'realtime row becomes immediately translatable');
 console.log('PASS 0.9.43: form submit -> Supabase payload -> submitter index -> second user cloud SELECT/RANGE -> live Realtime insert.');
})().catch(e=>{console.error(e);process.exitCode=1;});
