'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const vm = require('vm');
const zlib = require('zlib');
const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }

const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const version = read('VERSION.txt');
const runtime = read('french-translation-runtime.js');
const extension = read('french-extension.js');
const shared = read('shared-lexicon.js');
const styleMatch = html.match(/<style id="dwss-ui-hidden-state-fix-0121">([\s\S]*?)<\/style>/);
assert(styleMatch, '0.9.142 visibility fix stylesheet missing');
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

const editorStart = extension.indexOf('function setupFrenchPronunciationEditor()');
const editorEnd = extension.indexOf('function splitPinyinInitial(', editorStart);
assert(editorStart >= 0 && editorEnd > editorStart, 'French inline editor block is missing');
const editorBlock = extension.slice(editorStart, editorEnd);
for (const token of [
  'wrap.className = "translation-correction-panel";',
  'class="translation-correction-actions"',
  'class="primary mini"',
  'id="dwssFrenchPronunciationSave"',
  '保存并同步所有用户',
  'const readingFromResult = String(output.value || "").trim()',
  'let reading = readingFromResult',
  'tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.word))',
  'tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.reading))',
  'output.insertAdjacentElement("afterend", wrap);',
  'output.readOnly = false;',
  'output.disabled = false;'
]) assert(editorBlock.includes(token), 'French must save directly from the editable result box: ' + token);
for (const forbidden of [
  'id="dwssFrenchPronunciationEdit"',
  'id="dwssFrenchPronunciationValue"',
  'id="dwssFrenchPronunciationPanel"',
  'id="dwssFrenchPronunciationCancel"',
  '<textarea'
]) assert(!editorBlock.includes(forbidden), 'French editor must not show a second edit field or edit button: ' + forbidden);
assert(extension.includes('api.submitFrenchPronunciationCorrection({') &&
       extension.includes('french_pronunciation_cn: values.reading') &&
       extension.includes('const rowsEdited = sameSource && rows.some(row =>') &&
       extension.includes('法语单词') && extension.includes('中文谐音：'),
  'one French save action must sync combined edits from the result box and each French/homophone row');
assert(runtime.includes('mirrorSwahiliResultStyle') &&
       runtime.includes('output.readOnly = false;') &&
       runtime.includes('output.disabled = false;'),
  'French result box must be editable and reuse the Swahili result box style');

const tokenizerStart = app.indexOf('function tokenize(raw){');
const tokenizerEnd = app.indexOf('function joinParts(parts){', tokenizerStart);
assert(tokenizerStart >= 0 && tokenizerEnd > tokenizerStart, 'Swahili tokenizer block is missing');
const swTokenizer = app.slice(tokenizerStart, tokenizerEnd);
assert(!swTokenizer.includes('lookupFrenchPronunciationAt') && !swTokenizer.includes('frenchFallback'),
  'Swahili tokenizer must not use French pronunciation as a fallback');
const separationNote = '斯语翻译只使用科卢韦齐当地斯语词条和对应中文谐音。法语词条及法语中文谐音只在法语翻译选项中使用，两种语言分别保存、互不替代。系统不会自动猜测当地读音。重要安保指令请当地人员复核。';
assert(html.includes(separationNote), 'the UI must explain strict Swahili/French language separation');
assert(!html.includes('才使用“添加新词”中手动填写的法语中文谐音作为替代'), 'obsolete French-as-Swahili fallback notice remains');

const instructions = [...doc.querySelectorAll('#pronunciation .pronunciation-lookup-instruction')];
assert(instructions.length === 2, 'expected one Swahili and one French mode-specific instruction in the DOM');
const swInstruction = instructions.find(el => !el.closest('#dwssFrenchQueryPanel'));
const frInstruction = instructions.find(el => el.closest('#dwssFrenchQueryPanel'));
assert(swInstruction && frInstruction, 'the two mode-specific instruction elements are not nested correctly');
assert(!swInstruction.hasAttribute('hidden'), 'Swahili instruction should be visible in the default mode');
assert(byId('dwssFrenchQueryPanel')[0].hasAttribute('hidden') && !frInstruction.hasAttribute('hidden'),
  'French instruction should be hidden together with the French query panel');

assert(version.includes('Version: 0.9.142'), 'VERSION.txt mismatch');
assert(app.includes("version:'0.9.142'"), 'app metadata mismatch');
assert(sw.includes("const APP_VERSION = '0.9.142';"), 'Service Worker cache version mismatch');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_142'), 'automatic-update marker mismatch');
assert(html.includes('dwss-release=0.9.142'), 'cache-busted page assets were not advanced');
assert(html.includes('french-translation-runtime.js'), 'French translation runtime missing');
assert(app.includes("french:String(t.french_text||'').trim()"), 'shared French sync ingestion changed');
assert(app.includes('window.DWSSRenderTranslation = () => renderTranslation({recordHistory:false});'),
  'switching back to Swahili must re-render the same Chinese input without adding duplicate history');
assert(app.includes("const frenchModeButton=document.getElementById('dwssMainFrMode');"),
  'the Swahili renderer must be isolated while French mode is active');
assert(app.includes("if(options.recordHistory===true){const currentDraft=document.getElementById('inputText');if(currentDraft)saveRecent(currentDraft.value);}return;"),
  'French mode input/blur must retain local history but not overwrite French output');

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
assert(!runtime.includes('await autoCheckFrenchGrammar(french, requestId)'),
  'French output must not wait for a second third-party grammar request');
assert(runtime.includes('action: "check"') && runtime.includes('autoCheckFrenchGrammar'),
  'automatic grammar-check endpoint call is missing');
assert(runtime.includes('法语优先使用本机词库；未收录内容联网后调用机器翻译服务。'),
  'French local-first / online-miss notice missing');
assert(!runtime.includes('grammarButton') && !runtime.includes('runGrammarCheck') &&
       !runtime.includes('"检查法语语法"'),
  'manual grammar button/code must be removed');
assert(!runtime.includes('combinedOutput.addEventListener("blur"'),
  'shared correction submission must not happen implicitly on blur');
assert(!html.includes('id="dwssFrenchCorrectionPanel"') &&
       !html.includes('id="dwssSaveFrenchCorrection"'),
  'The retired French correction panel must remain removed from static HTML');
assert(extension.includes('function setupFrenchPronunciationEditor()') &&
       extension.includes('id="dwssFrenchPronunciationSave"') &&
       extension.includes('const readingFromResult = String(output.value || "").trim()') &&
       !extension.includes('id="dwssFrenchPronunciationEdit"') &&
       !extension.includes('id="dwssFrenchPronunciationValue"') &&
       extension.includes('保存并同步所有用户'),
  'French direct result editing and one-click save controls are missing');
assert(extension.includes('submitFrenchPronunciationCorrection') &&
       extension.includes('dwss:french-result-updated'),
  'French pronunciation editor is not bound to the shared queue and translated result');
const frenchEditorStart = extension.indexOf('function setupFrenchPronunciationEditor()');
const frenchEditorEnd = extension.indexOf('function splitPinyinInitial(', frenchEditorStart);
const frenchEditorBlock = extension.slice(frenchEditorStart, frenchEditorEnd);
assert(!frenchEditorBlock.includes('translation-correction-hint') &&
       !frenchEditorBlock.includes('可直接修改上方中文谐音') &&
       !frenchEditorBlock.includes('离线时先保存在本机'),
  'French save panel explanatory paragraph must be removed');
assert(html.includes('id="dwss-save-sync-clean-0142"') &&
       html.includes('#translationCorrectionPanel .translation-correction-hint') &&
       html.includes('#dwssFrenchPronunciationEditor .translation-correction-hint') &&
       html.includes('border:0!important') &&
       html.includes('margin-top:0!important;margin-bottom:0!important') &&
       html.includes('#translationCorrectionPanel[hidden]') &&
       html.includes('#dwssFrenchPronunciationEditor[hidden]{display:none!important}') ,
  'both save-and-sync panels must be borderless, hide explanatory copy, and move buttons up');
assert(extension.includes('id="dwssFrenchPronunciationStatus"') &&
       extension.includes('role="status"'),
  'post-save success/error feedback must remain available');
assert(shared.includes('async function submitFrenchPronunciationCorrection(entry)') &&
       shared.includes('french_pronunciation_cn: reading') &&
       shared.includes('queue.unshift(payload)') &&
       shared.includes('submitFrenchPronunciationCorrection,'),
  'French corrections must be saved to the French field and offline-first queue');
assert(shared.includes('french_pronunciation_cn: src === "fr" ? pron : null') &&
       shared.includes('local_pronunciation_cn: src === "sw" ? pron : null'),
  'French and Swahili shared pronunciation fields must remain isolated');
assert(shared.includes('normalizeSharedText(item.french_pronunciation_cn) === normalizeSharedText(reading)') &&
       !shared.includes('french_pronunciation_cn || item.local_pronunciation_cn'),
  'French correction matching must never read the Swahili pronunciation column');
assert(shared.includes('local_pronunciation_cn: null') && shared.includes('french_pronunciation_cn: reading'),
  'French corrections must write only to the dedicated French pronunciation field');
assert(runtime.includes('action: "translate"') && runtime.includes('action: "check"'),
  'translation or grammar-check action was removed');
assert(runtime.includes('setFrenchResult(local.reading)') &&
       runtime.includes('setFrenchResult(enriched.reading)'),
  'local and final word-index pronunciation results must both update the Chinese approximate reading output');
assert(runtime.includes('function formatCombinedResult(_french, reading)') &&
       runtime.includes('return String(reading || "").trim();'),
  'French result field must contain only the Chinese approximate pronunciation');
assert(runtime.includes('output.placeholder = "输入中文后翻译结果中文谐音会显示在这里";'),
  'French result placeholder must describe Chinese approximate pronunciation only');
assert(extension.includes('output.placeholder = "输入中文后翻译结果中文谐音会显示在这里";'),
  'French empty-state renderer must use the same requested placeholder text');
assert(runtime.includes('glossTools.renderSingleGloss(lastChinese, french);'),
  'complete French original must be passed to the lower single-word gloss renderer');
assert(runtime.includes('enrichedGlossTools.renderSingleGloss(lastChinese, french, enriched.wordReadings);'),
  'background pronunciation enrichment must refresh every word in the lower French word grid');
assert(runtime.includes('status.hidden = !visibleText'), 'empty grammar status is not hidden');
assert(html.includes('id="dwss-french-single-result-0123"'), 'single French result layout style missing');
assert(html.includes('id="dwss-french-ux-0125"'), '0.9.142 French result UI stylesheet missing');
assert(html.includes('id="singleReadingGlossLabel"'), 'language-aware single-word gloss title must be present exactly once');
assert((html.match(/id="singleReadingGlossLabel"/g) || []).length === 1,
  'single-word gloss title ID must not be duplicated');
assert(html.includes('id="dwss-dual-language-gloss-0126"'), 'dual-language gloss layout stylesheet missing');
assert(html.includes('id="dwss-french-original-in-gloss-0128"'),
  'French original sentence styling in the lower gloss area is missing');
assert(html.includes('id="dwss-french-gloss-visible-0129"'),
  'French pronunciation Chinese meanings must have a visible and readable style');
assert(html.includes('id="dwss-french-word-pairs-0132"'),
  'compact French word-pair grid styles are missing');
assert(html.includes('.dwss-french-word-edit') && html.includes('.dwss-french-word-original') &&
       html.includes('.dwss-french-word-pronunciation'),
  'French word and homophone controls must use inline editable fields with the Swahili-style row layout');
assert(html.includes('.dwss-french-word-edit:focus'),
  'French word and homophone fields must have a visible edit focus state');
assert(html.includes('.dwss-french-word-original{') && html.includes('border:1px solid #D5BE96!important') &&
       html.includes('background:#FFF9ED!important'),
  'French spelling field must have a persistent visible border and warm background');
assert(html.includes('.dwss-french-edit-hint') &&
       extension.includes('可直接修改框内法语单词和中文谐音'),
  'the word-by-word French area must explain that both French spelling and Chinese homophones are editable');
const frenchPairStyleStart = html.indexOf('<style id="dwss-french-word-pairs-0132">');
const frenchPairStyleEnd = html.indexOf('</style>', frenchPairStyleStart);
const frenchPairStyle = frenchPairStyleStart >= 0 && frenchPairStyleEnd > frenchPairStyleStart
  ? html.slice(frenchPairStyleStart, frenchPairStyleEnd) : '';
assert(!!frenchPairStyle && !frenchPairStyle.includes('grid-template-columns'),
  'the French-only word-pair style must not impose a card grid on the Swahili-style rows');

assert(html.includes('#pronunciationFrenchResults .pronunciation-hit-meaning'),
  'Chinese meaning result row styling is missing');

assert(html.includes('dwss-release=0.9.142'), 'French pronunciation update cache-busting version missing');
assert(html.includes('#resultCard .dwss-secondary-details{display:block!important}'),
  'the mobile-moved single-word gloss wrapper must remain visible in both modes');

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
assert(extension.includes('machine.scheduleTranslation(50)'), 'French mode must refresh the French result from the retained Chinese input');
assert(extension.includes('glossSegments.push({ type: "match", zh: matched, record });'),
  'French word-level matches must retain dictionary word, IPA, reading and Chinese meaning data');
assert(extension.includes('renderFrenchSingleGloss'), 'French mode must render its own single-word gloss list');
assert(extension.includes('单个法语读法释义：'), 'French gloss title must change with the selected language');
assert(extension.includes('window.DWSSRenderTranslation();'), 'Swahili mode must redraw from the retained Chinese input');
assert(extension.includes('machine.scheduleTranslation(50)'), 'French mode must refresh the French result from the retained Chinese input');
assert(extension.includes('glossSegments.push({ type: "match", zh: matched, record });'),
  'French word-level matches must retain dictionary word, IPA, reading and Chinese meaning data');
assert(extension.includes('if (frenchCorrectionPanel) frenchCorrectionPanel.hidden = true;') &&
       !extension.includes('frenchCorrectionButton') &&
       extension.includes('function setupFrenchPronunciationEditor()'),
  'French mode must hide the retired static panel and use the new inline pronunciation editor');
assert(extension.includes('formatCombinedFrenchResult(result.words, result.reading)'),
  'legacy French dictionary extension did not merge its results');
assert(extension.includes('submitFrenchPronunciationCorrection') &&
       extension.includes('french_pronunciation_cn: values.reading') &&
       extension.includes('let reading = readingFromResult') &&
       extension.includes('tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.word))') &&
       extension.includes('tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.reading))'),
  'French pronunciation correction must submit the original result-box edit or reconstructed word-level edits to the dedicated French fields');
assert(extension.includes('renderSingleGloss: renderFrenchSingleGloss'),
  'French single-word glossary renderer must be exposed for regression testing');
assert(extension.includes('function renderFrenchSingleGloss(raw, frenchOriginal, enrichedWordReadings)'),
  'single-word gloss renderer must accept the original French sentence separately');
assert(extension.includes('function getWordChineseReading(record)') &&
       extension.includes('getWordChineseReading(record)'),
  'each French word gloss must resolve its own Chinese approximate pronunciation');
assert(extension.includes('function tokenizeFrenchPhrase(value)') &&
       extension.includes('function buildFrenchWordReadingLookup(sourceRows)') &&
       extension.includes('function buildFrenchWordPairs(phrase, wordLookup, glossSegments, enrichedWordReadings)'),
  'word-level French tokenization and pronunciation lookup helpers are missing');
assert(extension.includes('buildFrenchWordPairs(phrase, frenchWordReadingByWord, result.glossSegments, enrichedWordReadings)'),
  'the glossary must pair each actual French sentence word with its own pronunciation');
assert(extension.includes('dwss-french-word-pair') && extension.includes('dwss-french-word-original') &&
       extension.includes('dwss-french-word-pronunciation') &&
       extension.includes('type="text" maxlength="100"') &&
       extension.includes('type="text" maxlength="200"') &&
       extension.includes('aria-label="法语单词') &&
       extension.includes('aria-label="法语单词') && extension.includes('中文谐音：'),
  'each French word and its Chinese approximate pronunciation must be editable inline');
assert(extension.includes('host.classList.remove("dwss-french-word-grid")') &&
       extension.includes('class="seg dwss-french-word-pair"'),
  'French gloss output must use the same stacked segment-row presentation as Swahili');
assert(extension.includes('const GLOSS_URL = "./french-gloss-index.tsv.gz";') &&
       extension.includes('const META_URL = "./french-pronunciation-index.json";'),
  'French pronunciation search must load the dedicated glossary and pronunciation metadata');
assert(extension.includes('buildFrenchGlossLookup(meaningRows)'),
  'French Chinese meanings are not indexed by normalized French spelling');
assert(extension.includes('findFrenchGloss(result.zh)'),
  'French pronunciation results do not retrieve the Chinese meaning by headword');
assert(extension.includes('pronunciation-hit-meaning') &&
       extension.includes('该法语词形暂未收录中文释义（法中词典没有对应词条）'),
  'result cards must show either the Chinese meaning or a clear not-in-gloss marker');
assert(extension.includes('const candidates = rowsForShards(shardLines, 24000);') &&
       extension.includes('loadPronunciationShard'),
  'French pronunciation search must use the pinyin-sharded index on demand');
assert(!extension.includes('const DATA_URL =') && !extension.includes('firstRanges') &&
       !extension.includes('rowsForFirst'),
  'French pronunciation search must not fall back to the old monolithic loader');
const frenchRendererStart = extension.indexOf('function renderFrenchSingleGloss(raw, frenchOriginal, enrichedWordReadings)');
const frenchRendererEnd = extension.indexOf('function normalizeFrenchGlossKey(value)', frenchRendererStart);
const frenchRenderer = extension.slice(frenchRendererStart, frenchRendererEnd);
assert(frenchRenderer.includes('host.innerHTML = pairs.map((pair, index) =>'),
  'French sentence must render in editable word-by-word segment rows');
for (const removedDetail of ['originalMarkup','法语原文：','中文释义：','IPA：','rd-detail','法语中文谐音：']) {
  assert(!frenchRenderer.includes(removedDetail), 'unwanted verbose detail remains in the French word list: ' + removedDetail);
}
assert(extension.includes('renderFrenchSingleGloss(currentChinese);'),
  'a new Chinese input must not temporarily reuse the previous French original');
assert(runtime.includes('await renderPronunciation(french, requestId)') &&
       runtime.includes('setFrenchResult(enriched.reading)'),
  'machine translation must render the local pronunciation and replace it with the completed word-index pronunciation');
assert(extension.includes('translateOfflineChinese(raw)') &&
       extension.includes('getPhraseWordPairs(phrase)') &&
       extension.includes('refreshActiveMeaningIndex()') &&
       extension.includes('activeRowsSignature') &&
       extension.includes('item.source_language === "fr"') &&
       extension.includes('item.french_pronunciation_cn || item.frenchReadingZh') &&
       extension.includes('api.frenchReading(word)') &&
       extension.includes('chineseMatcherCache = new WeakMap()'),
  'fast local Chinese-to-French dictionary translation helpers are missing');
for (const token of ['showInstantLocalDraft(chinese)','localPreviewCompleteChinese','misses.length === 0','await localTools.prepareOfflineChinese(chinese)','PERSISTED_CACHE_KEY',
  'restorePersistentTranslations()','persistTranslations()',
  'buildLocalPhraseReading(french)','scheduleTranslation(60)','expandFrenchNumerals(rawFrench)','numeralTools.isNumericExpression(chinese)','const immediate = tools.translateOfflineChinese(chinese)',
  'navigator.onLine === false']) {
  assert(runtime.includes(token), 'fast/offline French translation feature is missing: ' + token);
}
for (const asset of ['french-gloss-index.tsv.gz','french-pronunciation-index.json','french-word-index.json']) {
  assert(sw.includes(asset), 'French base dictionary asset missing from offline Service Worker cache: ' + asset);
}

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
const pronunciationSearchSource = read('pronunciation-search.js');
const pronunciationSandbox = {
  window: {
    DWSS_HANZI_PINYIN: {
      '邦':'bang','帮':'bang','旁':'pang','茫':'mang',
      '茹':'ru','如':'ru','儒':'ru','乳':'ru',
      '猫':'mao','鱼':'yu'
    }
  }
};
vm.runInNewContext(pronunciationSearchSource, pronunciationSandbox);
const pronunciationEngine = pronunciationSandbox.window.DWSSPronunciationSearch;
assert(pronunciationEngine && typeof pronunciationEngine.syllableDistance === 'function',
  'shared pinyin pronunciation engine must be available for French lookup');

const extensionSandbox = { window: {}, document: null };
vm.runInNewContext(extension, extensionSandbox);
const meaningTools = extensionSandbox.window.DWSSFrenchMeaningTools;
assert(meaningTools && typeof meaningTools.buildLookup === 'function',
  'normalized French meaning lookup helper is not exported');
const meaningFixture = meaningTools.buildLookup([
  {word:'Bonjour', meanings:['你好','您好']},
  {word:'Merci', meanings:['谢谢']},
  {word:'École', meanings:['学校']}
]);
assert(meaningFixture.get(meaningTools.normalizeWord('BONJOUR'))?.includes('你好'),
  'Chinese meaning lookup must be case insensitive for French headwords');
assert(meaningFixture.get(meaningTools.normalizeWord('école'))?.includes('学校'),
  'Chinese meaning lookup must normalize French accents');

const glossBytes = fs.readFileSync(path.join(root, 'french-gloss-index.tsv.gz'));
const glossText = zlib.gunzipSync(glossBytes).toString('utf8');
const glossRows = glossText.split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
assert(glossRows.length >= 9000, 'French-Chinese gloss index must contain at least 9,000 entries');
for (const headword of ['bonjour','merci']) {
  assert(glossRows.some(fields => String(fields[1] || '').toLowerCase() === headword && String(fields[4] || '').trim()),
    'French-Chinese gloss index must contain a Chinese meaning for ' + headword);
}
const realLookup = meaningTools.buildLookup(glossRows.map(fields => ({
  word:fields[1], meanings:String(fields[4] || '').split('¦').filter(Boolean)
})));
assert((realLookup.get('bonjour') || []).length > 0,
  'real French gloss index must return a Chinese meaning for bonjour');
assert((realLookup.get('merci') || []).length > 0,
  'real French gloss index must return a Chinese meaning for merci');
const frenchQueryTools = extensionSandbox.window.DWSSFrenchQueryTools;
assert(frenchQueryTools && typeof frenchQueryTools.search === 'function' &&
       typeof frenchQueryTools.nearFirstKeys === 'function',
  'French homophone/near-sound query tools must be exported');
assert(extension.includes('输入听到却不懂意思的法语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的法语'),
  'French pronunciation query instruction text is missing');
assert(extension.includes('const results = searchFrenchCandidates(query, candidates, engine, 20);'),
  'French pronunciation input must use the tolerant French matcher, not the strict generic search');

const firstBuckets = frenchQueryTools.nearFirstKeys('bang', pronunciationEngine, ['bang','pang','mang','mao']);
assert(firstBuckets.includes('bang') && firstBuckets.includes('pang'),
  'an exact first syllable must not suppress close pronunciation buckets');

const pronunciationEntries = [
  {zh:'Bonjour homophone',category:'法语',variants:[{reading:'帮儒',latin:'bɔ̃.ʒuʁ',source:'test'}]},
  {zh:'Bonjour close sound',category:'法语',variants:[{reading:'旁茹',latin:'bɔ̃.ʒuʁ',source:'test'}]},
  {zh:'Unrelated sound',category:'法语',variants:[{reading:'猫鱼',latin:'mɑo.yu',source:'test'}]}
];
const matchedPronunciations = frenchQueryTools.search('邦茹',pronunciationEntries,pronunciationEngine,20);
assert(matchedPronunciations.some(item=>item.zh==='Bonjour homophone' && item.score===1),
  'same-sound Chinese characters must match with a 100% score');
assert(matchedPronunciations.some(item=>item.zh==='Bonjour close sound' && item.score<1 && item.score>=0.84),
  'near-sound Chinese syllables must be matched and ranked below the exact homophone');
assert(!matchedPronunciations.some(item=>item.zh==='Unrelated sound'),
  'unrelated pronunciations must not pollute the French query results');
const frenchTools = extensionSandbox.window.DWSSFrenchTools;
assert(frenchTools && typeof frenchTools.translateChinese === 'function',
  'French word-level dictionary matcher must be available');
assert(typeof frenchTools.numberToFrench === 'function' && typeof frenchTools.isNumericExpression === 'function' &&
       typeof frenchTools.expandFrenchNumerals === 'function', 'French numeral helpers must be exported');
const numberCases=[['123','cent vingt-trois'],['2026','deux mille vingt-six'],['1,234','mille deux cent trente-quatre'],
  ['一百二十三','cent vingt-trois'],['二〇二六','deux mille vingt-six'],['三点五','trois virgule cinq'],['负三','moins trois']];
for(const [sourceNumber,expectedFrench] of numberCases)
  assert(frenchTools.numberToFrench(sourceNumber)===expectedFrench,'number conversion failed for '+sourceNumber);
assert(frenchTools.isNumericExpression('123')&&frenchTools.isNumericExpression('一百二十三')&&!frenchTools.isNumericExpression('123个人'),
  'pure numerals must be distinguished from mixed sentences');
const arabicDraft=frenchTools.translateChinese('123',new Map());
assert(arabicDraft.words==='cent vingt-trois'&&arabicDraft.reading.length>0&&arabicDraft.misses.length===0,
  'Arabic numerals must translate locally with a Chinese pronunciation');
const chineseDraft=frenchTools.translateChinese('一百二十三',new Map());
assert(chineseDraft.words==='cent vingt-trois'&&chineseDraft.reading.length>0,
  'Chinese numerals must yield the same immediate French result');
assert(frenchTools.expandFrenchNumerals("J'ai 123 et 1,5")==="J'ai cent vingt-trois et un virgule cinq",
  'numbers in machine-translated French must be expanded to spoken French');
const numericPairs=frenchTools.buildFrenchWordPairs('cent vingt-trois',frenchTools.buildFrenchWordReadingLookup([]),[]);
assert(numericPairs.length===3&&numericPairs.every(x=>x.reading&&x.reading!=='谐音待补'),
  'all generated French number words must have an immediate word pronunciation');
assert(typeof frenchTools.getWordChineseReading === 'function',
  'word-specific Chinese approximate pronunciation helper must be exported');
assert(frenchTools.getWordChineseReading({word:'Bonjour',reading:'邦茹',ipa:'bɔ̃.ʒuʁ'}) === '邦茹',
  'a French word must use its own dictionary Chinese approximate pronunciation');
const ipaFallback = frenchTools.getWordChineseReading({word:'Bonjour',reading:'',ipa:'bɔ̃.ʒuʁ'});
assert(ipaFallback === frenchTools.ipaToChinese('bɔ̃.ʒuʁ') && ipaFallback.length > 0,
  'a French word without a stored reading must derive its own Chinese approximation from its IPA');
assert(frenchTools.getWordChineseReading({word:'Unknown',reading:'',ipa:''}) === '',
  'an unpronounced word must not borrow another word pronunciation');
assert(typeof frenchTools.tokenizeFrenchPhrase === 'function' &&
       typeof frenchTools.replaceFrenchPhraseWords === 'function' &&
       typeof frenchTools.buildFrenchWordReadingLookup === 'function' &&
       typeof frenchTools.buildFrenchWordPairs === 'function',
  'compact French word pairing helpers must be exported');
const editedPhrase = frenchTools.replaceFrenchPhraseWords('«Bonjour, comment allez-vous !»',
  ['Salut','comment','parlez','vous']);
assert(editedPhrase === '«Salut, comment parlez-vous !»',
  'edited French word spellings and pronunciations must reconstruct the full phrase while preserving punctuation and separators');
const editedReadings = frenchTools.replaceFrenchPhraseWords('«Bonjour, comment allez-vous !»',
  ['邦茹','科芒','阿莱','乌']);
assert(editedReadings === '«邦茹, 科芒 阿莱-乌 !»',
  'edited Chinese homophones must reconstruct in the same word order with punctuation preserved');
const frenchTokens = frenchTools.tokenizeFrenchPhrase('«Bonjour, comment allez-vous !»');
assert(frenchTokens.map(x => x.word).join('|') === 'Bonjour|comment|allez|vous',
  'French sentence tokenizer must retain every word in original order');
assert(frenchTokens.map(x => x.display).join('|') === '«Bonjour,|comment|allez-|vous!»',
  'French sentence tokenizer must keep punctuation with neighbouring words');
const wordIndex = frenchTools.buildFrenchWordReadingLookup([
  {word:'Bonjour',reading:'邦茹',ipa:'bɔ̃.ʒuʁ'},
  {word:'agent',reading:'阿让',ipa:'a.ʒɑ̃'},
  {word:'de',reading:'德',ipa:'də'},
  {word:'sécurité',reading:'塞居里泰',ipa:'se.ky.ʁi.te'},
  {word:'agent de sécurité',reading:'阿让 德 塞居里泰',ipa:'a.ʒɑ̃ də se.ky.ʁi.te'}
]);
const wordPairs = frenchTools.buildFrenchWordPairs('Bonjour, agent de sécurité ! Bonjour.', wordIndex, []);
assert(wordPairs.length === 5, 'the full French sentence must render every word, including repeats');
assert(wordPairs.map(x => x.word).join('|') === 'Bonjour,|agent|de|sécurité!|Bonjour.',
  'French words and punctuation must remain in source order');
assert(wordPairs.map(x => x.reading).join('|') === '邦茹|阿让|德|塞居里泰|邦茹',
  'every word must use its own Chinese approximate pronunciation');
const phraseFallbackPairs = frenchTools.buildFrenchWordPairs('agent de sécurité',
  frenchTools.buildFrenchWordReadingLookup([]), [{type:'match',record:{word:'agent de sécurité',reading:'阿让 德 塞居里泰'}}]);
assert(phraseFallbackPairs.map(x => x.reading).join('|') === '阿让|德|塞居里泰',
  'phrase fallback may be split only when its reading is explicitly word-aligned');
const missingPair = frenchTools.buildFrenchWordPairs('motinconnu', frenchTools.buildFrenchWordReadingLookup([]), [])[0];
assert(missingPair.reading === '谐音待补',
  'an unknown word must be marked without inventing its pronunciation');
const enrichedWordPairs = frenchTools.buildFrenchWordPairs(
  'comment, comment!',
  frenchTools.buildFrenchWordReadingLookup([]),
  [],
  { get: key => key === 'comment' ? {word:'comment', reading:'科芒', ipa:'', confidence:'A'} : null }
);
assert(enrichedWordPairs.length === 2,
  'enriched word readings must preserve repeated French words');
assert(enrichedWordPairs.map(x => x.reading).join('|') === '科芒|科芒',
  'the final enriched pronunciation map must replace local pending word readings for every occurrence');

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
assert(combined === '邦茹', 'top French result must contain only Chinese approximate pronunciation');
const parsed = codec.parse(combined);
assert(parsed.french === '' && parsed.reading === '邦茹',
  'reading-only result parser must not invent a French original');
const legacyParsed = codec.parse('法语原文：Bonjour\n中文近似音：邦茹');
assert(legacyParsed.french === 'Bonjour' && legacyParsed.reading === '邦茹',
  'legacy combined result strings must remain readable for compatibility');

for (const verbose of ['法语整句来源：','逐词 IPA：','发音来源：LeXiK','查看校对建议',
  '使用免密公共翻译节点和第三方法语校对','整句已生成；建议点击']) {
  assert(!runtime.includes(verbose), 'verbose French UI text remains: ' + verbose);
}

for (const name of ['cover.webp','DWSS-Android-Installer.apk']) {
  const data = fs.readFileSync(path.join(root, name));
  assert(data.length > 10000, name + ' unexpectedly small');
}

// Exercise the French correction API while offline: local queue persistence is mandatory.
(async () => {
  const offlineDom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://dwss.test/', runScripts: 'outside-only'
  });
  Object.defineProperty(offlineDom.window.navigator, 'onLine', { value: false, configurable: true });
  offlineDom.window.eval(shared);
  const syncApi = offlineDom.window.DWSSSharedLexicon;
  assert(syncApi && typeof syncApi.submitFrenchPronunciationCorrection === 'function',
    'French offline correction API is not exposed');
  const outcome = await syncApi.submitFrenchPronunciationCorrection({
    chinese_text: '你好', french_text: 'bonjour', french_pronunciation_cn: '邦茹'
  });
  const queue = JSON.parse(offlineDom.window.localStorage.getItem('dwss_shared_terms_queue_v1') || '[]');
  assert(outcome.queued && queue.length === 1,
    'French pronunciation must be persisted locally when offline');
  assert(queue[0].source_language === 'fr' && queue[0].french_text === 'bonjour' &&
         queue[0].french_pronunciation_cn === '邦茹' && queue[0].local_pronunciation_cn === null,
    'Offline French pronunciation must be queued in French-only fields');
})().catch(error => { console.error(error); process.exitCode = 1; });
console.log('PASS DWSS 0.9.142: editable French word/homophone rows, punctuation-safe phrase reconstruction, offline French sync and base dictionary checks passed.');
