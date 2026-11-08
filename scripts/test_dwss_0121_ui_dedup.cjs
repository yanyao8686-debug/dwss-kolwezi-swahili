'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');
const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }

const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const version = read('VERSION.txt');
const styleMatch = html.match(/<style id="dwss-ui-hidden-state-fix-0121">([\s\S]*?)<\/style>/);
assert(styleMatch, '0.9.121 visibility fix stylesheet missing');
assert((html.match(/id="dwss-ui-hidden-state-fix-0121"/g) || []).length === 1,
  'visibility stylesheet duplicated');
const css = styleMatch[1];
for (const selector of [
  '#resultCard #resultFrenchReading[hidden]',
  '#resultCard #resultFrenchReading.empty[hidden]',
  '#pronunciation .pronunciation-lookup-card .pronunciation-lookup-instruction[hidden]',
  '#pronunciation #dwssFrenchQueryPanel[hidden]'
]) assert(css.includes(selector), 'hidden override missing: ' + selector);

const dom = new JSDOM(html);
const doc = dom.window.document;
const byId = id => doc.querySelectorAll('#' + id);
for (const id of [
  'resultReading','resultFrenchReading','dwssFrenchSpellingBlock',
  'dwssFrenchCorrectionPanel','pronunciationSearch','pronunciationResults',
  'pronunciationFrenchSearch','pronunciationFrenchResults','dwssFrenchQueryPanel',
  'dwssPronSwMode','dwssPronFrMode'
]) assert(byId(id).length === 1, 'missing or duplicated UI element: ' + id);

const swReading = byId('resultReading')[0];
const frReading = byId('resultFrenchReading')[0];
assert(!swReading.hasAttribute('hidden'), 'Swahili result should remain visible by default');
assert(frReading.hasAttribute('hidden'), 'French result should be hidden when Swahili is selected by default');
assert(byId('dwssFrenchQueryPanel')[0].hasAttribute('hidden'),
  'French pronunciation panel should be hidden when Swahili lookup is selected by default');

const instructions = [...doc.querySelectorAll('#pronunciation .pronunciation-lookup-instruction')];
assert(instructions.length === 2, 'expected one Swahili and one French mode-specific instruction in the DOM');
const swInstruction = instructions.find(el => !el.closest('#dwssFrenchQueryPanel'));
const frInstruction = instructions.find(el => el.closest('#dwssFrenchQueryPanel'));
assert(swInstruction && frInstruction, 'the two mode-specific instruction elements are not nested correctly');
assert(!swInstruction.hasAttribute('hidden'), 'Swahili instruction should be visible in the default mode');
assert(byId('dwssFrenchQueryPanel')[0].hasAttribute('hidden') && !frInstruction.hasAttribute('hidden'),
  'French instruction should be hidden together with the French query panel');

assert(version.includes('Version: 0.9.121'), 'VERSION.txt mismatch');
assert(app.includes("version:'0.9.121'"), 'app metadata mismatch');
assert(sw.includes("const APP_VERSION = '0.9.121';"), 'Service Worker cache version mismatch');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_121'), 'automatic-update marker mismatch');
assert(html.includes('dwss-release=0.9.121'), 'cache-busted page assets were not advanced');
assert(html.includes('french-translation-runtime.js'), 'French translation runtime missing');
assert(app.includes("french:String(t.french_text||'').trim()'), 'shared French sync ingestion changed');
assert(fs.existsSync(path.join(root, 'french-extension.js')), 'French pronunciation extension missing');
assert(fs.existsSync(path.join(root, 'french-translation-runtime.js')), 'French sentence translation runtime missing');

for (const name of ['cover.webp','DWSS-Android-Installer.apk']) {
  const data = fs.readFileSync(path.join(root, name));
  assert(data.length > 10000, name + ' unexpectedly small');
}
console.log('PASS DWSS 0.9.121: DOM contains exactly one result field per language; hidden language field and inactive query note are correctly marked hidden; one matching explanation is shown per selected query mode.');
