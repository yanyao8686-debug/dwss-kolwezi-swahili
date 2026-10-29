const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DWSS_PUBLIC_DIR || 'public';
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const boot = read('boot.js');
const version = read('VERSION.txt');
const manifest = JSON.parse(read('manifest.webmanifest'));

const instruction = '输入听到却不懂意思的斯语中文谐音时，不限同音不同字的中文，系统会自动查询近似的读音来匹配对应发音的斯语';
assert.equal(html.split(instruction).length - 1, 1, 'exact explanation appears once');
assert(html.includes('<div class="pronunciation-lookup-instruction" role="note">' + instruction + '</div>'));
assert(!html.includes('<h2>发音查询</h2>'));

function rule(source, selector) {
  const escaped = selector.replaceAll('.', '\\\\.');
  const matches = [...source.matchAll(new RegExp(escaped + '\\\\s*\\\\{([^{}]*)\\\\}', 'gs'))];
  assert.equal(matches.length, 1, 'exactly one CSS rule for ' + selector);
  return matches[0][1];
}
function props(body) {
  const out = {};
  for (const item of body.split(';')) {
    const i = item.indexOf(':');
    if (i < 0) continue;
    out[item.slice(0, i).trim().toLowerCase()] = item.slice(i + 1).replace(/\\s*!important\\s*$/i, '').trim();
  }
  return out;
}
const footer = props(rule(html, '.ownership-stamp'));
const styleBlock = html.match(/<style id="dwss-pronunciation-instruction-frame-0978">([\\s\\S]*?)<\\/style>/);
assert(styleBlock, 'new pronunciation instruction CSS block exists');
const instructionCss = props(rule(styleBlock[1], '.pronunciation-lookup-card .pronunciation-lookup-instruction'));
assert.equal(instructionCss.border, footer.border, 'instruction border exactly matches footer border');
assert.equal(instructionCss['border-radius'], footer['border-radius'], 'instruction corner radius exactly matches footer corner radius');
assert.equal(instructionCss['font-size'], '14px', 'instruction font is reduced to 14px');
assert.equal(instructionCss['text-align'], 'center', 'instruction is centered');
assert.equal(instructionCss['background'], 'transparent', 'no mismatched solid card background');
assert(!styleBlock[1].includes('#111'), 'old black border is removed');
assert(!styleBlock[1].includes('border-radius:0'), 'old square corners are removed');

assert(html.includes('content="0.9.78">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_78'));
assert(html.includes('版本 0.9.78 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\\.9\\.78/g) || []).length >= 3);
assert.equal((html.match(/dwss-release=0\\.9\\.77/g) || []).length, 0);
assert.equal((version.match(/^Version: 0\\.9\\.78$/m) || []).length, 1);
assert(version.includes('0.9.78: Match the pronunciation explanation frame'));
assert(sw.includes("const APP_VERSION = '0.9.78';"));
assert(app.includes("version:'0.9.78'"));

assert(html.includes('<input id="pronunciationSearch"'));
assert(html.includes('<div id="pronunciationResults" aria-live="polite"></div>'));
assert(app.includes("pronunciationInput.value='';renderPronunciationLookup();"));
assert(app.includes('function renderPronunciationLookup()'));
assert(app.includes("const entries=all.map(item=>({zh:item.zh"));
assert(boot.indexOf('./hanzi-pinyin.js') < boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js') < boot.indexOf('./app.js'));
assert(sw.includes('./hanzi-pinyin.js') && sw.includes('./pronunciation-search.js'));
assert.equal(manifest.id, './?app=dwss-kolwezi-swahili');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.name, '刚果金斯语翻译');
console.log('PASS: 0.9.78 frame matches the live copyright frame border and corner radius.');
console.log('PASS: explanation font is 14px, centered, and preserves the exact wording.');
console.log('PASS: pronunciation input, lookup modules, PWA cache and Clear All are preserved.');
