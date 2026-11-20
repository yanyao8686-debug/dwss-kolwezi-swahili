/* DWSS 0.9.165 — all Swahili main-result corrections use the canonical shared headword. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('inputText');
  const result = $('resultReading');
  const bar = $('mainReadingCorrectionBar');
  const editButton = $('mainReadingEdit');
  const editor = $('mainReadingEditor');
  const editorValue = $('mainReadingValue');
  const saveButton = $('mainReadingSave');
  const cancelButton = $('mainReadingCancel');
  const restoreButton = $('mainReadingRestore');
  const status = $('mainReadingStatus');
  const badge = $('mainReadingSyncBadge');
  if (!input || !result || !bar || !editButton || !editor || !editorValue ||
      !saveButton || !cancelButton || !restoreButton || !status || !badge) return;

  const MAX_LENGTH = 500;
  const normalize = value => String(value || '').normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[，。！？；：、,.!?;:（）()“”"']/g, '')
    .toLowerCase();

  let editingChinese = '';
  let saving = false;

  function readDisplayedReading() {
    return String(('value' in result ? result.value : result.textContent) || '').trim();
  }
  function writeDisplayedReading(value) {
    const text = String(value || '');
    if ('value' in result) result.value = text;
    else result.textContent = text;
  }

  function getCanonical(chinese) {
    const api = window.DWSSSharedLexicon;
    if (!chinese || !api || typeof api.getTerms !== 'function') return null;
    const key = normalize(chinese);
    return api.getTerms().find(row => row && row.__canonical === true &&
      row.source_language === 'sw' && normalize(row.chinese_text) === key &&
      String(row.local_pronunciation_cn || '').trim()) || null;
  }

  function getLegacyOverride(chinese) {
    const key = normalize(chinese);
    const api = window.DWSSDictionaryOverrides;
    if (!key || !api || typeof api.getAll !== 'function') return null;
    return api.getAll().find(row => normalize(row.chinese_text) === key) || null;
  }

  function setStatus(message, kind = '') {
    status.textContent = message || '';
    status.className = 'main-reading-status' + (kind ? ' ' + kind : '');
    status.hidden = !message;
  }

  function closeEditor() {
    editor.hidden = true;
    editorValue.value = '';
    editingChinese = '';
    saveButton.disabled = false;
    saveButton.textContent = '保存并同步所有用户';
    saving = false;
  }

  function refreshUi() {
    const chinese = String(input.value || '').trim();
    const reading = readDisplayedReading();
    const emptyResult = !reading ||
      reading === '输入中文后，翻译结果中文谐音会显示在这里' ||
      reading === '未找到可用的中文谐音';
    const active = !!chinese && !emptyResult;
    bar.hidden = !active;
    if (!active) {
      editor.hidden = true;
      badge.hidden = true;
      return;
    }
    const canonical = getCanonical(chinese);
    const legacy = canonical ? null : getLegacyOverride(chinese);
    badge.hidden = false;
    badge.textContent = canonical ? '云端首选修正已启用' :
      legacy ? '旧公共修正待迁移' : '可现场修改并共享';
    // Canonical entries are edited by replacing the preferred headword, not by
    // deleting an unrelated legacy override row.
    restoreButton.hidden = !legacy;
  }

  function openEditor() {
    const chinese = String(input.value || '').trim();
    const reading = readDisplayedReading();
    if (!chinese || !reading) return;
    if (chinese.length > MAX_LENGTH) {
      setStatus('整句中文超过 500 字，暂时不能发布为公共修正。', 'error');
      return;
    }
    const canonical = getCanonical(chinese);
    const legacy = canonical ? null : getLegacyOverride(chinese);
    editingChinese = chinese;
    editorValue.value = canonical
      ? String(canonical.local_pronunciation_cn || '')
      : legacy ? String(legacy.local_pronunciation_cn || '') : reading;
    editor.hidden = false;
    restoreButton.hidden = !legacy;
    setStatus('修改后会立即成为该中文词头的云端首选读音，斯语翻译和发音查询统一使用它。', 'note');
    editorValue.focus();
    editorValue.setSelectionRange(editorValue.value.length, editorValue.value.length);
  }

  async function saveCorrection() {
    if (saving) return;
    const chinese = String(input.value || '').trim();
    const reading = String(editorValue.value || '').trim();
    if (!editingChinese || chinese !== editingChinese) {
      setStatus('主界面的中文输入已变化。请重新打开修改框，避免把读音存到错误的句子。', 'error');
      closeEditor();
      return;
    }
    if (!chinese || chinese.length > MAX_LENGTH || !/[\u3400-\u9fff\uf900-\ufaff]/.test(chinese)) {
      setStatus('请填写含中文字符、且不超过 500 字的中文词语或句子。', 'error');
      return;
    }
    if (!reading || reading.length > MAX_LENGTH) {
      setStatus('请填写 1–500 个字符的科卢韦齐当地斯语中文谐音。', 'error');
      return;
    }
    const api = window.DWSSSharedLexicon;
    if (!api || typeof api.submitQuickTranslationTerm !== 'function') {
      setStatus('统一首选词库服务尚未就绪。请联网刷新页面后重试。', 'error');
      return;
    }
    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = '正在保存并同步…';
    setStatus('正在写入该中文词头的云端首选词条…', 'note');
    try {
      const outcome = await api.submitQuickTranslationTerm({
        chinese_text: editingChinese,
        local_pronunciation_cn: reading,
        local_text: (getCanonical(chinese) || {}).local_text || null
      });
      // The shared API updates the active canonical queue/cache before resolving.
      // Paint the exact user-edited value immediately; the app renderer will keep
      // using the same canonical row on the next translation.
      writeDisplayedReading(reading);
      result.classList.remove('empty');
      result.dispatchEvent(new CustomEvent('dwss:main-reading-correction-saved', {
        bubbles: true, detail: { chinese_text: chinese, local_pronunciation_cn: reading }
      }));
      closeEditor();
      setStatus(outcome && outcome.queued
        ? '已立即生效并保存在本机队列；联网后自动同步所有用户。'
        : '保存成功！云端首选读音已更新，下一次翻译也会使用这条读音。',
        outcome && outcome.queued ? 'note' : 'success');
      refreshUi();
    } catch (error) {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = '保存并同步所有用户';
      setStatus(String(error && error.message || '保存失败，请检查网络后重试。'), 'error');
    }
  }

  async function restoreCorrection() {
    if (saving) return;
    const chinese = String(input.value || '').trim();
    if (getCanonical(chinese)) {
      setStatus('当前词条已有云端首选修正。请直接修改并保存新的首选读音。', 'note');
      return;
    }
    const override = getLegacyOverride(chinese);
    const api = window.DWSSDictionaryOverrides;
    if (!override) {
      setStatus('这段中文目前没有旧公共修正。', 'note');
      restoreButton.hidden = true;
      return;
    }
    if (!api || typeof api.restore !== 'function') {
      setStatus('旧公共修正服务尚未就绪，请联网刷新页面再试。', 'error');
      return;
    }
    restoreButton.disabled = true;
    setStatus('正在删除旧公共修正…', 'note');
    try {
      await api.restore({chinese_text: chinese});
      closeEditor();
      setStatus('旧公共修正已删除。', 'success');
      refreshUi();
    } catch (error) {
      setStatus(String(error && error.message || '恢复失败，请检查网络后重试。'), 'error');
    } finally {
      restoreButton.disabled = false;
    }
  }

  editButton.addEventListener('click', openEditor);
  saveButton.addEventListener('click', saveCorrection);
  cancelButton.addEventListener('click', () => {
    closeEditor();
    setStatus('', '');
    refreshUi();
  });
  restoreButton.addEventListener('click', restoreCorrection);

  input.addEventListener('input', () => {
    if (!editor.hidden && String(input.value || '').trim() !== editingChinese) closeEditor();
    setStatus('', '');
    window.setTimeout(refreshUi, 500);
  });
  window.addEventListener('dwss:dictionary-overrides-updated', refreshUi);
  window.addEventListener('dwss:shared-terms-updated', () => {
    refreshUi();
    if (!editor.hidden) return;
    const chinese = String(input.value || '').trim();
    const canonical = getCanonical(chinese);
    if (canonical) {
      writeDisplayedReading(canonical.local_pronunciation_cn);
      result.classList.remove('empty');
    }
  });

  const observer = new MutationObserver(refreshUi);
  observer.observe(result, {childList:true, characterData:true, subtree:true});
  result.addEventListener('input', refreshUi);
  result.addEventListener('change', refreshUi);
  window.addEventListener('dwss:translation-rendered', refreshUi);
  refreshUi();
  window.setTimeout(refreshUi, 500);
  console.info('[DWSS] Main translation correction is connected to the canonical shared dictionary.');
})();
