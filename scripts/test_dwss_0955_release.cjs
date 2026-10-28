'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.env.DWSS_TEST_ROOT || 'public';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const html = read('index.html'), app = read('app.js'), boot = read('boot.js');
const sw = read('sw.js'), pwa = read('pwa.js'), overrides = read('dictionary-overrides.js');
const shared = read('shared-lexicon.js'), version = read('VERSION.txt');
const nav = html.match(/<nav class="tabs">([\s\S]*?)<\/nav>/);
assert(nav);
assert.equal((nav[1].match(/<button\b/g)||[]).length,3);
assert(!nav[1].includes('data-tab="dictionary"'));
assert(nav[1].includes('data-tab="maintenance"') && nav[1].includes('data-tab="saved"') && nav[1].includes('nav-clear-slot'));
assert(html.includes('id="openPublicPronunciationEditor"'));
assert(html.includes('id="pronunciationEditor"') && html.includes('id="restoreBuiltinPronunciation"'));
assert(html.includes("['maintenance','saved','dictionary'].forEach(panelId=>{"));
assert.match(html,/\.dwss-return-translation\{[^}]*color:#ff4b12!important;[^}]*font-size:16px!important;[^}]*text-decoration-line:underline!important;/);
assert(html.includes('DWSS_AUTO_UPDATE_0_9_55') && html.includes('版本 0.9.55 · DWSS'));
assert(app.includes("version:'0.9.55'"));
assert(sw.includes("const APP_VERSION = '0.9.55';"));
assert(version.includes('Version: 0.9.55'));
assert(boot.includes("'./dictionary-overrides.js'"));
assert(overrides.includes('dwss-edit-dictionary-pronunciation'));
assert(!overrides.includes('SUPABASE_SERVICE_ROLE_KEY') && !overrides.includes('service_role'));
assert(shared.includes('dwss_shared_terms_queue_v1') && shared.includes('client_submit_id'));
assert(shared.includes('addEventListener("online", connectCloud)') && shared.includes('await flushQueue(client)'));
assert(pwa.includes('registration.update()') && pwa.includes('DWSS_SKIP_WAITING'));
assert(pwa.includes("'dictSearch', 'pronunciationEditorValue'"));
assert(pwa.includes('activePanel: activePanel && activePanel.id'));
assert(pwa.includes('publicEditor:'));
assert(pwa.includes("'dictionary'].includes(snapshot.activePanel)"));
assert(pwa.includes('editorState.open && editorState.word'));
assert(html.includes('id="newFrenchReadingZh"') && !html.includes('id="resultFrenchReading"'));

class ClassList {
  constructor(){this.set=new Set();}
  toggle(name,force){if(force===undefined)force=!this.set.has(name);if(force)this.set.add(name);else this.set.delete(name);return force;}
  remove(name){this.set.delete(name);}
  contains(name){return this.set.has(name);}
}
class El {
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.className='';this.style={};this.dataset={};this.classList=new ClassList();this.listeners={};this.open=false;this.dispatched=[];}
  addEventListener(k,fn){(this.listeners[k] ||= []).push(fn);}
  dispatchEvent(ev){this.dispatched.push(ev.type);for(const fn of this.listeners[ev.type]||[])fn(ev);return true;}
  showModal(){this.open=true;}
  setAttribute(k,v){if(k==='open')this.open=true;}
  removeAttribute(k){if(k==='open')this.open=false;}
  click(){this.dispatchEvent({type:'click'});}
}
function makeRestoreContext(snapshot){
  const ids=['inputText','newZh','newReading','newFrenchReadingZh','dictSearch','pronunciationEditorValue','pronunciationEditorWord','pronunciationEditor','pwaState','pwaMessage','networkBadge','installAppBtn','checkUpdateBtn','pwaToast'];
  const els=new Map(ids.map(id=>[id,new El(id)]));
  const panels=['translate','maintenance','saved','dictionary'].map(id=>{const e=new El(id);e.id=id;return e;});
  const tabs=['maintenance','saved'].map(tab=>{const e=new El(tab);e.dataset.tab=tab;return e;});
  const doc={readyState:'complete',visibilityState:'visible',getElementById:id=>els.get(id)||null,
    querySelector:sel=>sel==='main .panel.active'?panels.find(p=>p.classList.contains('active'))||null:null,
    querySelectorAll:sel=>sel==='main .panel'?panels:sel==='nav.tabs .tab'?tabs:[],
    addEventListener(){}};
  const store=new Map([['dwss:pwa-resume:0.9.44',JSON.stringify(snapshot)]]);
  const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const win={isSecureContext:true,addEventListener(){},setTimeout,clearTimeout,location:{reload(){}},scrollTo(){}};
  const nav={onLine:true};
  const context={window:win,document:doc,sessionStorage,navigator:nav,location:{hostname:'example.github.io'},Event:class Event{constructor(type){this.type=type;}},console,setTimeout,clearTimeout,Date,JSON,Array,Promise};
  vm.runInNewContext(pwa,context,{filename:'pwa.js'});
  return {els,panels,tabs,store};
}
const restored=makeRestoreContext({savedAt:Date.now(),values:{inputText:'检查车辆',dictSearch:'欢迎',pronunciationEditorValue:'噶里布新读法'},activePanel:'dictionary',activeTab:'translate',publicEditor:{word:'欢迎',open:true}});
assert.equal(restored.els.get('inputText').value,'检查车辆');
assert.equal(restored.els.get('dictSearch').value,'欢迎');
assert.equal(restored.els.get('pronunciationEditorValue').value,'噶里布新读法');
assert.equal(restored.els.get('pronunciationEditorWord').textContent,'欢迎');
assert.equal(restored.els.get('pronunciationEditor').open,true);
assert(restored.panels.find(p=>p.id==='dictionary').classList.contains('active'));
assert(restored.els.get('dictSearch').dispatched.includes('input'));
console.log('PASS: PWA restore returns to dictionary editor and restores an open public-pronunciation draft.');
console.log('PASS: DWSS 0.9.55 navigation, UI, public editor, offline sync, first-reading and automatic update gates.');
