'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.env.DWSS_TEST_ROOT || 'public';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const app = read('app.js'), html = read('index.html'), sw = read('sw.js'), version = read('VERSION.txt');
function extractFunction(name) {
  const match = app.match(new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}', 'm'));
  assert(match, 'missing function: ' + name);
  return match[0];
}
function extractArrow(name) {
  const start = app.indexOf('const ' + name + '=delay=>{');
  assert(start >= 0, 'missing arrow: ' + name);
  const end = app.indexOf('\n};', start);
  assert(end > start, 'unterminated arrow: ' + name);
  return app.slice(start, end + 3);
}
assert(html.includes('content="0.9.57"><!-- DWSS_AUTO_UPDATE_0_9_57 -->'));
assert(html.includes('版本 0.9.57 · DWSS 智能翻译 PWA'));
assert(sw.includes("const APP_VERSION = '0.9.57';"));
assert(version.includes('Version: 0.9.57'));
const nav = html.match(/<nav class="tabs">([\s\S]*?)<\/nav>/);
assert(nav && (nav[1].match(/<button\b/g) || []).length === 3);
assert(app.includes("$('inputText').addEventListener('input',event=>{if(event&&event.isComposing)return;scheduleDwssLiveTranslation(420);scheduleMissingWordHandoff(1300);});"));
assert(app.includes("$('inputText').addEventListener('compositionend',()=>{scheduleDwssLiveTranslation(180);scheduleMissingWordHandoff(1300);});"));
assert(app.includes("$('clearBtn').addEventListener('click',clearAllInputs);"));
assert(!app.includes('summary.textContent=d.message'));
assert(app.includes("summary.textContent=SHARE_STATUS_LABELS[String(d.status||'')]||'共享词库：自动同步'"));

const els = {
 inputText:{value:'请查一下未知测试词'},
 newZh:{value:'',dataset:{}},
 newReading:{value:'旧读音'},
 newFrenchReadingZh:{value:'旧法语读音'},
 maintenanceMessage:{textContent:'',className:''},
 shareSyncSummary:{textContent:''},
 retrySharedSync:{hidden:true}
};
const panels = ['translate','maintenance','saved','dictionary'].map(id=>({id,active:id==='translate',classList:null}));
for (const panel of panels) panel.classList={toggle(name,force){if(name==='active')panel.active=!!force;},contains(name){return name==='active'&&panel.active;}};
const tabs=[{dataset:{tab:'maintenance'},classList:{toggle(){}}},{dataset:{tab:'saved'},classList:{toggle(){}}}];
let timerCallback=null;
const ctx={
 $:id=>els[id],
 tokenize:raw=>({segments:String(raw).includes('未知测试词')?[
  {type:'local',zh:'请查一下'},{type:'punct',text:' '},{type:'unknown',text:'未知测试词'},{type:'unknown',text:'未知测试词'}
 ]:[{type:'local',zh:String(raw)}]}),
 document:{
  querySelector:s=>s==='main .panel.active'?panels.find(p=>p.active)||null:null,
  querySelectorAll:s=>s==='.tab'?tabs:s==='.panel'?panels:[]
 },
 renderCustomList(){},
 clearEntryForm(){els.newZh.value='';els.newReading.value='';els.newFrenchReadingZh.value='';},
 setMessage(message,type){els.maintenanceMessage.textContent=message;els.maintenanceMessage.className='form-message '+(type||'');},
 renderTranslation(){},clearTimeout(){},setTimeout(fn){timerCallback=fn;return 1;},
 dwssInputTimer:null,dwssMissingHandoffTimer:null
};
const source=[
 extractFunction('getMissingChineseSegments'),
 extractFunction('switchTab'),
 extractFunction('handoffMissingChinese'),
 extractFunction('clearAllInputs'),
 extractArrow('scheduleMissingWordHandoff')
].join('\n')+'\nthis.getMissingChineseSegments=getMissingChineseSegments;this.handoffMissingChinese=handoffMissingChinese;this.clearAllInputs=clearAllInputs;this.scheduleMissingWordHandoff=scheduleMissingWordHandoff;';
vm.runInNewContext(source,ctx);
assert.deepEqual(Array.from(ctx.getMissingChineseSegments(els.inputText.value)),['未知测试词']);
ctx.scheduleMissingWordHandoff(1300);
assert.equal(typeof timerCallback,'function');
timerCallback();
assert.equal(panels.find(p=>p.active).id,'maintenance');
assert.equal(els.newZh.value,'未知测试词');
assert.match(els.maintenanceMessage.textContent,/自动填入/);

panels.forEach(p=>p.active=p.id==='translate');
els.newZh.value='我原来的草稿';
assert.equal(ctx.handoffMissingChinese(els.inputText.value),true);
assert.equal(panels.find(p=>p.active).id,'maintenance');
assert.equal(els.newZh.value,'我原来的草稿');
assert.match(els.maintenanceMessage.textContent,/草稿已保留/);

els.inputText.value='主翻译内容';els.newZh.value='新增中文';els.newReading.value='当地读音';els.newFrenchReadingZh.value='法语读音';
ctx.clearAllInputs();
assert.equal(els.inputText.value,'');
assert.equal(els.newZh.value,'');
assert.equal(els.newReading.value,'');
assert.equal(els.newFrenchReadingZh.value,'');
assert.equal(els.maintenanceMessage.textContent,'');
console.log('PASS: 0.9.57 version/cache markers');
console.log('PASS: automatic unknown-word handoff and phrase transfer');
console.log('PASS: existing new-word drafts are not overwritten');
console.log('PASS: clear-all resets translation and add-word input fields');
console.log('PASS: long success sentence is shown once; compact sync label is distinct');
console.log('PASS: original three-action navigation remains intact');
