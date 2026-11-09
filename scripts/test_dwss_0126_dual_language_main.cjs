'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const vm = require('vm');
const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }

const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const version = read('VERSION.txt');
const runtime = read('french-translation-runtime.js');
const extension = read('french-extension.js');
const styleMatch = html.match(/<style id="dwss-ui-hidden-state-fix-0121">([\s\S]*?)<\/style>/);
assert(styleMatch, '0.9.126 visibility fix stylesheet missing');
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
  'pronunciationSearch','pronunciationResults',
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

assert(version.includes('Version: 0.9.126'), 'VERSION.txt mismatch');
assert(app.includes("version:'0.9.126'"), 'app metadata mismatch');
assert(sw.includes("const APP_VERSION = '0.9.126';"), 'Service Worker cache version mismatch');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_126'), 'automatic-update marker mismatch');
assert(html.includes('dwss-release=0.9.126'), 'cache-busted page assets were not advanced');
assert(html.includes('french-translation-runtime.js'), 'French translation runtime missing');
assert(app.includes("french:String(t.french_text||'').trim()"), 'shared French sync ingestion changed');
assert(app.includes('window.DWSSRenderTranslation = () => renderTranslation({recordHistory:false});'),
  'switching back to Swahili must re-render the same Chinese input without adding duplicate history');
assert(fs.existsSync(path.join(root, 'french-extension.js')), 'French pronunciation extension missing');
assert(fs.existsSync(path.join(root, 'french-translation-runtime.js')), 'French sentence translation runtime missing');
const pronMeta = JSON.parse(read('french-pronunciation-index.json'));
const wordMeta = JSON.parse(read('french-word-index.json'));
for (const key of pronMeta.firstKeys) {
  assert(fs.existsSync(path.join(root, 'french-pronunciation-shards', key + '.tsv.gz')),
    'French reverse-pronunciation shard missing: ' + key);
}
for (const key of wordMeta.prefixes) {
  assert(fs.existsSync(path.join(root, 'french-word-shards', key + '.tsv.gz')),
    'French translated-word pronunciation shard missing: ' + key);
}
assert(fs.existsSync(path.join(root, 'french-gloss-index.tsv.gz')), 'French-Chinese gloss index missing');
assert(fs.existsSync(path.join(root, 'french-LEXIK-LICENSE.txt')), 'LeXiK licence file missing');
assert(html.includes('id="dwss-french-compact-ui-0122"'), 'compact French UI stylesheet missing');
assert(html.includes('#resultCard #dwssFrenchIpaMeta{display:none!important}'), 'verbose provider/IPA meta should be hidden');
assert(runtime.includes('await autoCheckFrenchGrammar(french, requestId)'),
  'French translation must run grammar checking automatically');
assert(runtime.includes('action: "check"') && runtime.includes('autoCheckFrenchGrammar'),
  'automatic grammar-check endpoint call is missing');
assert(runtime.includes('翻译时自动检查法语语法，译文会发送至外部服务。'),
  'automatic grammar/privacy note missing');
assert(!runtime.includes('grammarButton') && !runtime.includes('runGrammarCheck') &&
       !runtime.includes('"检查法语语法"'),
  'manual grammar button/code must be removed');
assert(!runtime.includes('combinedOutput.addEventListener("blur"'),
  'shared correction submission must not happen implicitly on blur');
assert(!html.includes('id="dwssFrenchCorrectionPanel"') &&
       !html.includes('id="dwssSaveFrenchCorrection"') &&
       !html.includes('提交法语修正并同步所有用户'),
  'French shared-correction submit control must be removed from the interface');
assert(runtime.includes('action: "translate"') && runtime.includes('action: "check"'),
  'translation or grammar-check action was removed');
assert(runtime.includes('setFrenchResult(formatCombinedResult(french, pronunciation.reading))'),
  'Chinese approximate pronunciation generation was removed');
assert(runtime.includes('status.hidden = !visibleText'), 'empty grammar status is not hidden');
assert(html.includes('id="dwss-french-single-result-0123"'), 'single French result layout style missing');
assert(html.includes('id="dwss-french-ux-0125"'), '0.9.126 French result UI stylesheet missing');
assert(html.includes('id="singleReadingGlossLabel"'), 'language-aware single-word gloss title must be present exactly once');
assert((html.match(/id="singleReadingGlossLabel"/g) || []).length === 1,
  'single-word gloss title ID must not be duplicated');
assert(html.includes('id="dwss-dual-language-gloss-0126"'), 'dual-language gloss layout stylesheet missing');
assert(html.includes('#resultCard .dwss-secondary-details{display:block!important}'),
  'the mobile-moved single-word gloss wrapper must remain visible in both modes');

for (const selector of [
  '#resultCard[data-dwss-lang="fr"] > .stats',
  '#resultCard[data-dwss-lang="fr"] > .quality-note',
  '#resultCard[data-dwss-lang="fr"] > .resultlabel',
  '#resultCard[data-dwss-lang="fr"] > .segmentlist'
]) assert(html.includes(selector), 'French view must hide Swahili-only content: ' + selector);
for (const styleToken of [
  'border:1px solid #E4D1A5!important',
  'border-radius:16px!important',
  'background:#FFF0D2!important',
  'font-size:clamp(24px,4.8vw,28px)!important',
  'min-height:112px!important'
]) assert(html.includes(styleToken), 'French result style must match Swahili: ' + styleToken);
assert(html.includes('#resultCard #dwssFrenchSpellingBlock{display:none!important}'),
  'separate French original-text box is not hidden');
assert(extension.includes('if (machineRuntime && typeof machineRuntime.translateCurrentChinese === "function") return;'),
  'legacy French glossary must not race with the sentence-level machine translation runtime');
assert(extension.includes('renderFrenchSingleGloss'), 'French mode must render its own single-word gloss list');
assert(extension.includes('单个法语读法释义：'), 'French gloss title must change with the selected language');
assert(extension.includes('window.DWSSRenderTranslation();'), 'Swahili mode must redraw from the retained Chinese input');
assert(extension.includes('machine.scheduleTranslation(80)'), 'French mode must refresh the French result from the retained Chinese input');
assert(extension.includes('glossSegments.push({ type: "match", zh: matched, record });'),
  'French word-level matches must retain dictionary word, IPA, reading and Chinese meaning data');
assert(extension.includes('if (frenchCorrectionPanel) frenchCorrectionPanel.hidden = true;') &&
       extension.includes('if (frenchCorrectionButton) frenchCorrectionButton.addEventListener'),
  'legacy extension must tolerate removal of the French shared-correction panel');
assert(extension.includes('formatCombinedFrenchResult(result.words, result.reading)'),
  'legacy French dictionary extension did not merge its results');
assert(extension.includes('DWSSFrenchCombinedResult.parse'),
  'French correction save no longer reads both fields from the combined result');
assert(extension.includes('renderSingleGloss: renderFrenchSingleGloss'),
  'French single-word glossary renderer must be exposed for regression testing');
assert(runtime.includes('formatCombinedResult(french, pronunciation.reading)'),
  'machine translation no longer writes both fields into the combined result');
assert(runtime.includes('mirrorSwahiliResultStyle'),
  'French result no longer inherits Swahili result styling');
assert(runtime.includes('output.readOnly = false;') && runtime.includes('output.disabled = false;'),
  'combined French result field must remain editable for user corrections');
assert(runtime.includes('combinedOutput.addEventListener("input"'),
  'editing the combined field no longer updates its French source');
assert(runtime.includes('output.readOnly = false;') && runtime.includes('output.disabled = false;'),
  'combined French result must remain directly editable');
assert(runtime.includes('output.style.setProperty') || runtime.includes('mirrorSwahiliResultStyle'),
  'French result must inherit styling from the Swahili result field');
assert(extension.includes('$("dwssFrenchSpellingBlock").hidden = true'),
  'separate spelling block is not hidden in French mode');
const extensionSandbox = { window: {}, document: null };
vm.runInNewContext(extension, extensionSandbox);
const frenchTools = extensionSandbox.window.DWSSFrenchTools;
assert(frenchTools && typeof frenchTools.translateChinese === 'function',
  'French word-level dictionary matcher must be available');
const fixture = new Map([
  ['你好', [{word:'Bonjour', ipa:'bɔ̃.ʒuʁ', reading:'邦茹', meanings:['你好'], source:'test'}]],
  ['保安', [{word:'agent de sécurité', ipa:'a.ʒɑ̃ də se.ky.ʁi.te', reading:'阿让 德 塞居里泰', meanings:['保安'], source:'test'}]]
]);
const frenchGloss = frenchTools.translateChinese('你好，保安', fixture);
assert(frenchGloss.glossSegments.length === 2, 'one-word gloss should preserve every matched Chinese segment');
assert(frenchGloss.glossSegments[0].record.word === 'Bonjour' &&
       frenchGloss.glossSegments[0].record.reading === '邦茹',
  'French gloss should expose the matching French word and Chinese approximate pronunciation');
assert(frenchGloss.glossSegments[1].record.word === 'agent de sécurité',
  'second matched Chinese segment should switch to the corresponding French dictionary item');
const sandbox = { window: {}, document: null };
vm.runInNewContext(runtime, sandbox);
const codec = sandbox.window.DWSSFrenchCombinedResult;
assert(codec && typeof codec.format === 'function' && typeof codec.parse === 'function',
  'combined result formatter/parser is not exported');
const combined = codec.format('Bonjour', '邦茹');
assert(combined.includes('\\n中文近似音：') === false, 'combined result contains a literal backslash-n');
assert(combined.includes('\n中文近似音：'), 'combined result line separator is missing');
const parsed = codec.parse(combined);
assert(parsed.french === 'Bonjour' && parsed.reading === '邦茹',
  'combined result cannot recover the original French and Chinese pronunciation independently');

for (const verbose of ['法语整句来源：','逐词 IPA：','发音来源：LeXiK','查看校对建议',
  '使用免密公共翻译节点和第三方法语校对','整句已生成；建议点击']) {
  assert(!runtime.includes(verbose), 'verbose French UI text remains: ' + verbose);
}

for (const name of ['cover.webp','DWSS-Android-Installer.apk']) {
  const data = fs.readFileSync(path.join(root, name));
  assert(data.length > 10000, name + ' unexpectedly small');
}
console.log('PASS DWSS 0.9.126: one Chinese draft switches between Swahili and French result and matching single-word glosses without re-entry.');
