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
const queryEditor = read('pronunciation-query-editor.js');
const styleMatch = html.match(/<style id="dwss-ui-hidden-state-fix-0121">([\s\S]*?)<\/style>/);
assert(styleMatch, '0.9.151 visibility fix stylesheet missing');
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
  '保存并同步给所有用户',
  'const readingFromResult = String(output.value || "").trim()',
  'const reading = readingFromResult',
  'tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.word))',
  'glossHost.insertAdjacentElement("afterend", wrap);',
  'output.readOnly = false;',
  'output.disabled = false;'
]) assert(editorBlock.includes(token), 'French save must use the main-result homophone and sit below the word list: ' + token);
assert(!editorBlock.includes('output.insertAdjacentElement("afterend", wrap);'),
  'French save button must no longer sit below the main result');
assert(!editorBlock.includes('rows.map(row => row.reading)'),
  'per-word homophone input must not override the main-result homophone');
assert(!extension.includes('input class="dwss-french-word-edit dwss-french-word-pronunciation"') &&
       extension.includes('span class="dwss-french-word-pronunciation"'),
  'French word rows must display homophones as text, not editable inputs');
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
  'one French save action must sync the corrected French phrase and the main result box homophone');
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

assert(version.includes('Version: 0.9.151'), 'VERSION.txt mismatch');
assert(app.includes("version:'0.9.151'"), 'app metadata mismatch');
assert(sw.includes("const APP_VERSION = '0.9.151';"), 'Service Worker cache version mismatch');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_150'), 'automatic-update marker mismatch');
assert(html.includes('dwss-release=0.9.151'), 'cache-busted page assets were not advanced');
assert(html.includes('french-translation-runtime.js'), 'French translation runtime missing');
assert(html.includes('pronunciation-query-editor.js?dwss-release=0.9.151'),
  'inline pronunciation query editor is not loaded');
assert((html.match(/pronunciation-query-editor\.js\?dwss-release=0\.9\.150/g) || []).length === 1,
  'read-only pronunciation query script must be referenced exactly once');
const imeFallbackMatch = html.match(/<script id="dwss-input-ime-fallback-0150">([\s\S]*?)<\/script>/);
assert(imeFallbackMatch, 'Android Chinese-IME fallback script is missing');
assert(imeFallbackMatch[1].includes('compositionend') &&
       imeFallbackMatch[1].includes('isComposing') &&
       imeFallbackMatch[1].includes('1100'),
  'Android IME fallback must convert a stalled composition into a normal compositionend event');
assert(app.includes('scheduleDwssLiveTranslation(420)'), 'normal Swahili live-translation path must remain available');
assert(runtime.includes('scheduleCompositionFallback') && runtime.includes('compositionFallbackTimer'),
  'French IME composition fallback is missing');
assert(queryEditor.includes('DWSSPronunciationQueryReadOnly') &&
       queryEditor.includes('.pronunciation-maintenance-entry') &&
       queryEditor.includes('.dwss-query-inline-tools'),
  'read-only pronunciation query cleanup is missing');
for (const forbidden of ['DWSSDictionaryOverrides','submitFrenchPronunciationCorrection','修改结果','保存并同步给所有用户']) {
  assert(!queryEditor.includes(forbidden), 'pronunciation lookup must not expose correction controls: ' + forbidden);
}
assert(queryEditor.includes('#pronunciationResults .pronunciation-hit-actions') &&
       queryEditor.includes('#pronunciationFrenchResults .pronunciation-hit-actions'),
  'legacy copy buttons are not hidden in both query modes');
assert(!extension.includes('data-copy-french') &&
       !extension.includes('data-copy-french-reading') &&
       !extension.includes('复制法语') && !extension.includes('复制谐音'),
  'French query copy controls remain in the renderer');
assert(fs.existsSync(path.join(root, 'french-gloss-coverage.json')),
  'French glossary audit report is missing');
assert(fs.existsSync(path.join(root, 'french-CFDICT-ATTRIBUTION.txt')),
  'French glossary source attribution is missing');
const glossCoverage = JSON.parse(read('french-gloss-coverage.json'));
for (const key of [
  'uniqueNormalizedPronunciationForms',
  'formsWithChineseGlossBeforeSupplement',
  'exactSingleWordSupplementsAdded',
  'formsWithChineseGlossAfterSupplement',
  'formsStillWithoutChineseGloss'
]) assert(Number.isInteger(glossCoverage[key]) && glossCoverage[key] >= 0,
  'French gloss coverage counter is invalid: ' + key);
assert(glossCoverage.pinnedCFDICTCommit === 'ebf1d269182d84e4068d1ce383eaf272c7adff66',
  'French glossary supplement source is not pinned to the audited CFDICT commit');

assert(app.includes("french:String(t.french_text||'').trim()"), 'shared French sync ingestion changed');
assert(app.includes('window.DWSSRenderTranslation = () => renderTranslation({recordHistory:false});'),
  'switching back to Swahili must re-render the same Chinese input without adding duplicate history');
assert(runtime.includes('const storedReading = String(item.reading || "").trim();') &&
       runtime.includes('const cue = storedReading && !/^(?:谐音待补|音标待补|读音待补)$/u.test(storedReading)'),
  'French translation must ignore a placeholder and use the same IPA fallback as the word-level gloss');
assert(runtime.includes('W: "IPA 自动拟音，待核对"'),
  'Wiktionary-generated pronunciations must be marked for human review');

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
       extension.includes('保存并同步给所有用户'),
  'French direct result editing and one-click save controls are missing');
assert(extension.includes('submitFrenchPronunciationCorrection') &&
       extension.includes('french_pronunciation_cn: values.reading') &&
       extension.includes('const reading = readingFromResult') &&
       extension.includes('tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.word))') &&
       !extension.includes('tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.reading))'),
  'French pronunciation correction must submit only the main-result homophone plus the reconstructed French spelling to the dedicated French fields');
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
       extension.includes("Math.max(5, Math.min(20, token.length + 2))") &&
       extension.includes('aria-label="法语单词') &&
       extension.includes('<div class="rd">法语：') &&
       !extension.includes('中文谐音：</span>') &&
       extension.includes('span class="dwss-french-word-pronunciation"') &&
       !extension.includes('input class="dwss-french-word-edit dwss-french-word-pronunciation"'),
  'French spelling alone must be editable; per-word Chinese homophones remain display-only');
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
assert(frenchRenderer.includes('<div class="rd">法语：') &&
       !frenchRenderer.includes('中文谐音：'),
  'French gloss right column must use the same compact language-label pattern as Swahili');
assert(frenchRenderer.includes('class="zh"><input class="dwss-french-word-edit dwss-french-word-original"') &&
       frenchRenderer.includes('type="text" maxlength="100"') &&
       frenchRenderer.includes('data-original-word=') &&
       frenchRenderer.includes('value='),
  'French word must remain directly editable in the Swahili-style left column');
const frenchPairStyleStart = html.indexOf('<style id="dwss-french-word-pairs-0132">');
const frenchPairStyleEnd = html.indexOf('</style>', frenchPairStyleStart);
const frenchPairStyle = frenchPairStyleStart >= 0 && frenchPairStyleEnd > frenchPairStyleStart
  ? html.slice(frenchPairStyleStart, frenchPairStyleEnd) : '';
assert(frenchPairStyle.includes('.dwss-french-word-original') &&
       frenchPairStyle.includes('background:#FFF9ED!important') &&
       frenchPairStyle.includes('border:1px solid #D5BE96!important') &&
       frenchPairStyle.includes('width:auto!important') &&
       frenchPairStyle.includes('padding:5px 8px!important') &&
       frenchPairStyle.includes('border-color:#A87423!important'),
  'French editable word field must appear as a compact, visible input box');
assert((editorBlock.match(/id="dwssFrenchPronunciationSave"/g) || []).length === 1 &&
       editorBlock.includes('glossHost.insertAdjacentElement("afterend", wrap);'),
  'all edited French words must use exactly one unified save-and-sync button below the list');
assert(!extension.includes('dwss-french-word-meaning-input') &&
       !extension.includes('dwss-french-word-meaning-save'),
  'per-word Chinese meaning fields or individual save buttons must not be added');
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
assert(extension.includes('function customQueryCandidates()') &&
       extension.includes('return activeRows().map(item => ({') &&
       extension.includes('candidates.push(...customQueryCandidates())') &&
       extension.includes('item.source_language === "fr"'),
  'French pronunciation lookup must merge base-index rows with saved local and shared corrections');

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
const placeholderFallback = frenchTools.getWordChineseReading({word:'bonjour',reading:'谐音待补',ipa:'bɔ̃.ʒuʁ'});
assert(placeholderFallback === frenchTools.ipaToChinese('bɔ̃.ʒuʁ') && placeholderFallback !== '谐音待补',
  'a placeholder must not suppress an IPA-derived Chinese homophone');
const placeholderTranslation = frenchTools.translateChinese('你好',new Map([['你好',[{word:'bonjour',reading:'谐音待补',ipa:'bɔ̃.ʒuʁ'}]]])); 
assert(placeholderTranslation.reading === placeholderFallback,
  'the main translation result must use the same IPA fallback as the word-level dictionary');
const placeholderPairs = frenchTools.buildFrenchWordPairs('bonjour',
  frenchTools.buildFrenchWordReadingLookup([{word:'bonjour',reading:'谐音待补',ipa:'bɔ̃.ʒuʁ'}]),[]);
assert(placeholderPairs.length===1&&placeholderPairs[0].reading===placeholderFallback,
  'the single-word gloss must display exactly the same IPA fallback as the main translation result');
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
console.log('PASS DWSS 0.9.151: French translation, language isolation, shared corrections and read-only pronunciation lookup validated.');
