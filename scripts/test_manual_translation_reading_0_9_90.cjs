'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = process.env.DWSS_PUBLIC_DIR || 'public';
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'boot.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const js = fs.readFileSync(path.join(root, 'manual-translation-reading.js'), 'utf8');
const apk = fs.readFileSync(path.join(root, 'DWSS-Android-0.9.80.apk'));

assert.match(version, /^Version: 0\.9\.90$/m);
assert.match(html, /DWSS_AUTO_UPDATE_0_9_90/);
assert.match(html, /content="0\.9\.90"/);
assert.match(html, /id="manualReadingTools"/);
assert.match(html, /id="manualReadingEditor"/);
assert.match(html, /id="manualReadingValue"/);
assert.match(html, /保存修正/);
assert.match(html, /恢复自动翻译/);
assert.match(html, /id="dwss-apk-download"/);
assert.match(html, /href="\.\/DWSS-Android-0\.9\.80\.apk"/);
assert.match(html, /5\.81 MB/);
assert.doesNotMatch(html, /id="installAppBtn"/);
assert.ok(boot.indexOf("'./pwa.js'") < boot.indexOf("'./manual-translation-reading.js'"),
  'manual editor must load after app and PWA modules');
assert.match(sw, /APP_VERSION = '0\.9\.90'/);
assert.match(sw, /'\.\/manual-translation-reading\.js'/);
assert.match(sw, /endsWith\('\.apk'\)/);
assert.doesNotMatch(sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/)[1], /DWSS-Android-0\.9\.80\.apk/);
assert.equal(apk.length, 5806530);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicates)], [], 'page must not add duplicate HTML ids');
new vm.Script(js, {filename:'manual-translation-reading.js'});

class Element {
  constructor(id, onMutation) {
    this.id = id;
    this.value = '';
    this.hidden = false;
    this.textContent = '';
    this.className = '';
    this.title = '';
    this.handlers = {};
    this.dataset = {};
    this.parentNode = null;
    this.classList = {add(){}, remove(){}};
    this.onMutation = onMutation;
  }
  addEventListener(type, fn) {
    (this.handlers[type] ||= []).push(fn);
  }
  click() {
    for (const fn of this.handlers.click || []) fn({target:this, preventDefault(){}, stopImmediatePropagation(){}});
  }
  focus() {}
  setSelectionRange() {}
  dispatchEvent() {
    for (const fn of this.handlers.input || []) fn({bubbles:true});
  }
}

function createHarness() {
  const data = new Map();
  const timers = [];
  let observerCallback = null;
  const observer = {
    observe(){},
    disconnect(){}
  };
  class FakeMutationObserver {
    constructor(callback){ observerCallback = callback; }
    observe(){}
  }
  const ids = [
    'inputText','resultReading','manualReadingTools','manualReadingEdit',
    'manualReadingEditor','manualReadingValue','manualReadingSave',
    'manualReadingCancel','manualReadingRestore','manualReadingStatus',
    'manualReadingState','backupText','restoreText'
  ];
  const elements = new Map();
  for (const id of ids) {
    const el = new Element(id, () => {});
    elements.set(id, el);
  }
  const document = {
    getElementById(id){ return elements.get(id) || null; },
    addEventListener(type, fn, capture){ (document.handlers[type] ||= []).push({fn,capture}); },
    handlers:{}
  };
  const localStorage = {
    getItem(key){ return data.has(key) ? data.get(key) : null; },
    setItem(key,value){ data.set(key,String(value)); },
    removeItem(key){ data.delete(key); }
  };
  const window = {
    setTimeout(fn){ timers.push(fn); return timers.length; },
    addEventListener(){},
  };
  const context = {
    document, window, localStorage, MutationObserver:FakeMutationObserver,
    Event:class { constructor(type, options){this.type=type;this.options=options;} },
    console:{info(){},warn(){},error(){}}
  };
  vm.createContext(context);
  vm.runInContext(js, context, {filename:'manual-translation-reading.js'});
  function runTimers(){
    let guard=0;
    while(timers.length && guard++<50) timers.shift()();
  }
  function notify(){
    if(observerCallback) observerCallback([]);
  }
  function clickDocument(id){
    const target={id,parentNode:document};
    const event={target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
    for(const item of document.handlers.click || []) if(item.capture) item.fn(event);
    return event;
  }
  return {elements,localStorage,data,runTimers,notify,clickDocument,observer};
}

const h = createHarness();
const el = id => h.elements.get(id);
el('inputText').value = '请你明天早上到办公室找我。';
el('resultReading').textContent = '自动匹配的原始读音';
h.notify();
assert.equal(el('manualReadingTools').hidden, false);
el('manualReadingEdit').click();
assert.equal(el('manualReadingEditor').hidden, false);
el('manualReadingValue').value = '我手动核对后的正确读音';
el('manualReadingSave').click();
assert.equal(el('resultReading').textContent, '我手动核对后的正确读音');
const saved = JSON.parse(h.localStorage.getItem('dwss_manual_translation_readings_v1'));
assert.equal(saved.length, 1);
assert.equal(saved[0].reading, '我手动核对后的正确读音');

// A fresh automatic render for the same Chinese input must be replaced by the saved correction.
el('resultReading').textContent = '再次自动匹配的读音';
h.notify();
assert.equal(el('resultReading').textContent, '我手动核对后的正确读音');

// Restoring removes only this exact phrase correction and reveals the automatic result.
el('manualReadingRestore').click();
assert.equal(el('resultReading').textContent, '再次自动匹配的读音');
assert.equal(JSON.parse(h.localStorage.getItem('dwss_manual_translation_readings_v1')).length, 0);

// Export adds the corrections to the existing personal JSON backup.
el('manualReadingEdit').click();
el('manualReadingValue').value = '备份用的人工修正读音';
el('manualReadingSave').click();
el('backupText').value = JSON.stringify({entries:[]});
h.clickDocument('exportCustom');
h.runTimers();
const backup = JSON.parse(el('backupText').value);
assert.equal(backup.manualTranslationOverrides.length, 1);
assert.equal(backup.manualTranslationOverrides[0].reading, '备份用的人工修正读音');

// Import merges correction records without requiring the older dictionary format to change.
const imported = createHarness();
imported.elements.get('restoreText').value = JSON.stringify(backup);
const event = imported.clickDocument('importCustom');
assert.equal(event.stopped, undefined);
const restored = JSON.parse(imported.localStorage.getItem('dwss_manual_translation_readings_v1'));
assert.equal(restored.length, 1);
assert.equal(restored[0].reading, '备份用的人工修正读音');

console.log('PASS: DWSS 0.9.90 manual translation correction, persistence, restore, backup and import.');
