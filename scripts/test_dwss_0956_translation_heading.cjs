const fs = require('fs');
const path = require('path');
const root = process.env.DWSS_TEST_ROOT || path.join(process.cwd(), 'public');
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) process.exitCode = 1;
}
const html = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const version = read('VERSION.txt');

check('requested heading appears exactly once', (html.match(/<h2>斯语翻译中文谐音：<\/h2>/g) || []).length === 1);
check('old heading is fully replaced', !html.includes('<h2>翻译结果中文谐音：</h2>'));
check('unrequested placeholder text is unchanged', app.includes('翻译结果中文谐音会显示在这里'));
check('the other translation result labels remain', html.includes('中文谐音结果') && html.includes('复制谐音'));
check('three-action navigation remains; no standalone dictionary tab', (html.match(/<button[^>]*class="tab/g) || []).length === 3 && !html.includes('data-tab="dictionary"'));
check('PWA auto-update marker is bumped', html.includes('content="0.9.56"') && html.includes('DWSS_AUTO_UPDATE_0_9_56'));
check('Service Worker cache revision is bumped', sw.includes("const APP_VERSION = '0.9.56';"));
check('release metadata is bumped', version.includes('Version: 0.9.56'));
check('public pronunciation editor remains', html.includes('id="openPublicPronunciationEditor"'));
check('shared offline sync queue remains', read('shared-lexicon.js').includes('dwss_shared_terms_queue_v1'));
check('automatic update remains configured', read('pwa.js').includes('registration.update()'));
if (process.exitCode) process.exit(1);
