from pathlib import Path
P = Path("public")
def read(n): return (P/n).read_text(encoding='utf-8')
def write(n,s): (P/n).write_text(s,encoding='utf-8')
def once(s,a,b,label):
    n=s.count(a)
    if n!=1: raise SystemExit(f'{label}: expected one match, found {n}')
    return s.replace(a,b,1)

pwa=read('pwa.js')
pwa=once(pwa,
"['inputText', 'newZh', 'newReading', 'newFrenchReadingZh'].forEach(id => {",
"['inputText', 'newZh', 'newReading', 'newFrenchReadingZh', 'dictSearch', 'pronunciationEditorValue'].forEach(id => {",
'preserve editor and dictionary search fields')
pwa=once(pwa,
"""      const activeTab = document.querySelector('nav.tabs .tab.active');
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({
        savedAt: Date.now(), values,
        activeTab: activeTab && activeTab.dataset ? activeTab.dataset.tab : 'translate'
      }));""",
"""      const activeTab = document.querySelector('nav.tabs .tab.active');
      const activePanel = document.querySelector('main .panel.active');
      const editor = $('pronunciationEditor');
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({
        savedAt: Date.now(), values,
        activeTab: activeTab && activeTab.dataset ? activeTab.dataset.tab : 'translate',
        activePanel: activePanel && activePanel.id ? activePanel.id : 'translate',
        publicEditor: {
          word: ($('pronunciationEditorWord') || {}).textContent || '',
          open: !!(editor && editor.open)
        }
      }));""",
'capture active panel and public editor state')
pwa=once(pwa,
"""      const tabName = ['translate', 'saved', 'maintenance'].includes(snapshot.activeTab)
        ? snapshot.activeTab : 'translate';
      const tab = Array.from(document.querySelectorAll('nav.tabs .tab'))
        .find(el => el.dataset && el.dataset.tab === tabName);
      if (tab && typeof tab.click === 'function') tab.click();""",
"""      const panelName = ['translate', 'saved', 'maintenance', 'dictionary'].includes(snapshot.activePanel)
        ? snapshot.activePanel
        : (['translate', 'saved', 'maintenance'].includes(snapshot.activeTab) ? snapshot.activeTab : 'translate');
      if (panelName === 'dictionary') {
        document.querySelectorAll('main .panel').forEach(panel => panel.classList.toggle('active', panel.id === 'dictionary'));
        document.querySelectorAll('nav.tabs .tab').forEach(tab => tab.classList.remove('active'));
        const search = $('dictSearch');
        if (search) search.dispatchEvent(new Event('input', { bubbles: true }));
        const editorState = snapshot.publicEditor || {};
        const editor = $('pronunciationEditor');
        if (editor && editorState.open && editorState.word) {
          $('pronunciationEditorWord').textContent = String(editorState.word);
          if (typeof editor.showModal === 'function' && !editor.open) editor.showModal();
          else if (!editor.open) editor.setAttribute('open', '');
        }
      } else {
        const tab = Array.from(document.querySelectorAll('nav.tabs .tab'))
          .find(el => el.dataset && el.dataset.tab === panelName);
        if (tab && typeof tab.click === 'function') tab.click();
        else document.querySelectorAll('main .panel').forEach(panel => panel.classList.toggle('active', panel.id === panelName));
      }""",
'restore dictionary panel and open pronunciation editor')
write('pwa.js',pwa)

html=read('index.html')
html=once(html,'content="0.9.54"','content="0.9.55"','meta version')
html=once(html,'DWSS_AUTO_UPDATE_0_9_54','DWSS_AUTO_UPDATE_0_9_55','automatic update marker')
html=once(html,'版本 0.9.54 · DWSS 智能翻译 PWA','版本 0.9.55 · DWSS 智能翻译 PWA','visible version')
write('index.html',html)
app=once(read('app.js'),"version:'0.9.54'","version:'0.9.55'",'app version')
write('app.js',app)
sw=once(read('sw.js'),"const APP_VERSION = '0.9.54';","const APP_VERSION = '0.9.55';",'service worker version')
write('sw.js',sw)
version=once(read('VERSION.txt'),'Version: 0.9.54','Version: 0.9.55','release version')
version += '\n0.9.55: Automatic update draft protection now also preserves the hidden dictionary editor panel, the search query, and an open public-pronunciation edit dialog/value across service-worker refreshes. The original three-action navigation and offline shared-word synchronization remain unchanged.\n'
write('VERSION.txt',version)
print('PASS: 0.9.55 preserves public-pronunciation drafts and dictionary editor state across automatic PWA updates.')
