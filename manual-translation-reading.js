/* DWSS 0.9.165 — route every manual main-result correction to the canonical shared headword. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'dwss_manual_translation_readings_v1';
  const MAX_RECORDS = 500;
  const MAX_READING_LENGTH = 2000;
  const normalize = value => String(value || '').normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[，。！？；：、,.!?;:（）()“”"']/g, '')
    .toLowerCase();

  const input = $('inputText');
  const result = $('resultReading');
  const tools = $('manualReadingTools');
  const editButton = $('manualReadingEdit');
  const editor = $('manualReadingEditor');
  const editorValue = $('manualReadingValue');
  const saveButton = $('manualReadingSave');
  const cancelButton = $('manualReadingCancel');
  const restoreButton = $('manualReadingRestore');
  const status = $('manualReadingStatus');
  const state = $('manualReadingState');
  if (!input || !result || !tools || !editButton || !editor || !editorValue ||
      !saveButton || !cancelButton || !restoreButton || !status || !state) return;

  let unreadable = false;
  let records = [];
  let lastSourceKey = '';
  let lastAutoReading = '';
  let lastDisplayedReading = '';
  let editingKey = '';
  let applyingDisplay = false;

  function validateRecords(value) {
    if (!Array.isArray(value)) throw new Error('修正记录格式不是数组');
    return value.filter(item => item && typeof item === 'object' &&
      typeof item.zh === 'string' && item.zh.trim() &&
      typeof item.reading === 'string' && item.reading.trim())
      .map(item => ({
        key: normalize(item.zh),
        zh: item.zh.trim().slice(0, 2000),
        reading: item.reading.trim().slice(0, MAX_READING_LENGTH),
        updatedAt: String(item.updatedAt || '')
      }))
      .filter(item => item.key && item.reading);
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      records = raw ? validateRecords(JSON.parse(raw)) : [];
    } catch (error) {
      unreadable = true;
      records = [];
      console.error('[DWSS] Manual reading corrections are unreadable; writes are disabled to protect the original data.', error);
    }
  }

  function saveRecords(next) {
    if (unreadable) return false;
    try {
      if (next.length > MAX_RECORDS) {
        showStatus('最多保存 500 条人工修正。请先恢复或整理不再需要的修正。', 'error');
        return false;
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      records = next;
      return true;
    } catch (error) {
      console.error('[DWSS] Could not save manual reading corrections:', error);
      showStatus('保存失败：设备存储空间不足或浏览器限制了写入。原有修正没有被覆盖。', 'error');
      return false;
    }
  }

  function currentKey() {
    return normalize(input.value.trim());
  }

  function findRecord(key) {
    return records.find(item => item.key === key) || null;
  }

  function findCanonicalRecord(key) {
    const api = window.DWSSSharedLexicon;
    if (!key || !api || typeof api.getTerms !== 'function') return null;
    return api.getTerms().find(item => item && item.__canonical === true &&
      item.source_language === 'sw' && normalize(item.chinese_text) === key &&
      String(item.local_pronunciation_cn || '').trim()) || null;
  }

  function showStatus(message, kind) {
    status.textContent = message || '';
    status.className = 'manual-reading-status' + (kind ? ' ' + kind : '');
    status.hidden = !message;
  }

  function setDisplayedReading(value, key) {
    const text = String(value || '').trim();
    if (!text) return;
    lastDisplayedReading = text;
    lastSourceKey = key || currentKey();
    applyingDisplay = true;
    result.textContent = text;
    applyingDisplay = false;
    result.classList.remove('empty');
  }

  function refreshControls() {
    const key = currentKey();
    const text = String(result.textContent || '').trim();
    const valid = !!key && !!text && text !== '输入中文后，翻译结果中文谐音会显示在这里';
    tools.hidden = !valid;
    if (!valid) {
      editor.hidden = true;
      return;
    }
    const canonical = findCanonicalRecord(key);
    const saved = findRecord(key);
    editButton.textContent = canonical ? '修改云端首选读音' : saved ? '修改我的旧修正' : '修改读音';
    state.textContent = canonical ? '已使用云端首选修正' : saved ? '旧本机修正（仅作兼容）' : '可修改并同步';
    state.hidden = false;
    // A canonical shared record outranks any historical device-local correction.
    restoreButton.hidden = !!canonical || !saved;
  }

  function applySavedCorrection() {
    if (applyingDisplay) return;
    const key = currentKey();
    const text = String(result.textContent || '').trim();
    if (!key || !text || text === '输入中文后，翻译结果中文谐音会显示在这里') {
      tools.hidden = true;
      editor.hidden = true;
      state.hidden = true;
      return;
    }

    // Capture the fresh app-rendered reading before applying either type of saved
    // correction. The cloud canonical headword is always authoritative; the
    // legacy localStorage record is fallback-only and can never shadow it.
    if (key !== lastSourceKey || text !== lastDisplayedReading) {
      lastAutoReading = text;
      lastSourceKey = key;
      lastDisplayedReading = text;
    }

    const canonical = findCanonicalRecord(key);
    if (canonical) {
      const preferred = String(canonical.local_pronunciation_cn || '').trim();
      if (preferred && text !== preferred) setDisplayedReading(preferred, key);
      else {
        lastDisplayedReading = text;
        lastSourceKey = key;
      }
      showStatus('已自动使用云端首选读音；其他设备和发音查询也使用同一条修正。', 'saved');
      refreshControls();
      return;
    }

    const saved = findRecord(key);
    if (saved) {
      if (text !== saved.reading) setDisplayedReading(saved.reading, key);
      else {
        lastDisplayedReading = text;
        lastSourceKey = key;
      }
      showStatus('检测到旧本机修正；新修改请通过统一共享入口保存。', 'note');
    } else {
      lastDisplayedReading = text;
      lastSourceKey = key;
      showStatus('', '');
    }
    refreshControls();
  }
  function openEditor() {
    const key = currentKey();
    if (!key) return;
    const canonical = findCanonicalRecord(key);
    const saved = findRecord(key);
    const text = String(result.textContent || '').trim();
    editingKey = key;
    editorValue.value = canonical
      ? String(canonical.local_pronunciation_cn || '')
      : saved ? saved.reading : (text || lastAutoReading);
    editor.hidden = false;
    restoreButton.hidden = !!canonical || !saved;
    showStatus('修改后立即成为该中文词头的云端首选读音，并同步用于后续翻译。', 'note');
    editorValue.focus();
    editorValue.setSelectionRange(editorValue.value.length, editorValue.value.length);
  }

  function closeEditor() {
    editor.hidden = true;
    editingKey = '';
    editorValue.value = '';
  }

  async function saveCorrection() {
    const key = currentKey();
    const chinese = input.value.trim();
    const reading = String(editorValue.value || '').trim();
    if (!key || key !== editingKey) {
      showStatus('输入的中文已改变，请重新打开“修改读音”。', 'error');
      closeEditor();
      return;
    }
    if (!reading || reading.length > MAX_READING_LENGTH) {
      showStatus('请填写 1–2000 个字符的中文谐音。', 'error');
      return;
    }
    const api = window.DWSSSharedLexicon;
    if (!api || typeof api.submitQuickTranslationTerm !== 'function') {
      showStatus('统一云端首选词库尚未就绪，请刷新页面后重试。', 'error');
      return;
    }

    saveButton.disabled = true;
    showStatus('正在保存并同步到云端首选词库…', 'note');
    try {
      const outcome = await api.submitQuickTranslationTerm({
        chinese_text: chinese,
        local_pronunciation_cn: reading,
        local_text: (findCanonicalRecord(key) || {}).local_text || null
      });
      // Retain the former local correction only as a compatibility backup. Since
      // canonical is preferred, this old row cannot replace the new shared value.
      const next = records.filter(item => item.key !== key);
      if (!unreadable) saveRecords(next);
      lastAutoReading = lastAutoReading || String(result.textContent || '').trim();
      setDisplayedReading(reading, key);
      closeEditor();
      showStatus(outcome && outcome.queued
        ? '修改已立即生效并保存在本机队列；联网后自动同步所有用户。'
        : '保存成功！云端首选读音已更新，重新翻译也会使用这条结果。',
        outcome && outcome.queued ? 'note' : 'saved');
      refreshControls();
    } catch (error) {
      showStatus('保存失败：' + String(error && error.message || error), 'error');
    } finally {
      saveButton.disabled = false;
    }
  }
  function restoreAutomatic() {
    const key = currentKey();
    if (!key) return;
    const next = records.filter(item => item.key !== key);
    if (next.length === records.length) {
      closeEditor();
      showStatus('当前没有保存过人工修正。', 'note');
      return;
    }
    if (!saveRecords(next)) return;
    closeEditor();
    const automatic = lastSourceKey === key ? lastAutoReading : '';
    if (automatic) {
      setDisplayedReading(automatic, key);
      showStatus('已恢复词库自动匹配的原始谐音。', 'note');
      refreshControls();
    } else {
      showStatus('已删除人工修正，正在重新显示词库原始结果。', 'note');
      input.dispatchEvent(new Event('input', {bubbles: true}));
      window.setTimeout(applySavedCorrection, 800);
    }
  }

  editButton.addEventListener('click', openEditor);
  saveButton.addEventListener('click', saveCorrection);
  cancelButton.addEventListener('click', () => {
    closeEditor();
    showStatus('', '');
    refreshControls();
  });
  restoreButton.addEventListener('click', restoreAutomatic);

  input.addEventListener('input', () => {
    if (editor.hidden === false && currentKey() !== editingKey) closeEditor();
    tools.hidden = true;
    state.hidden = true;
    showStatus('', '');
    window.setTimeout(applySavedCorrection, 760);
  });

  const observer = new MutationObserver(() => {
    if (!applyingDisplay) applySavedCorrection();
  });
  observer.observe(result, {childList: true, characterData: true, subtree: true});
  window.addEventListener('dwss:shared-terms-updated', applySavedCorrection);

  // Add manual corrections to the existing personal-dictionary backup JSON.
  // Imported older backups without this field remain fully compatible.
  function closestId(node, id) {
    while (node && node !== document) {
      if (node.id === id) return node;
      node = node.parentNode;
    }
    return null;
  }

  document.addEventListener('click', event => {
    if (!closestId(event.target, 'exportCustom')) return;
    window.setTimeout(() => {
      const output = $('backupText');
      if (!output || !output.value.trim()) return;
      try {
        const data = JSON.parse(output.value);
        if (!data || Array.isArray(data) || typeof data !== 'object') return;
        data.manualTranslationOverrides = records;
        output.value = JSON.stringify(data, null, 2);
      } catch (error) {
        console.warn('[DWSS] Could not add manual corrections to the backup JSON:', error);
      }
    }, 0);
  }, true);

  document.addEventListener('click', event => {
    if (!closestId(event.target, 'importCustom')) return;
    const source = $('restoreText');
    if (!source || !source.value.trim()) return;
    let data;
    try { data = JSON.parse(source.value); }
    catch (_) { return; }
    if (!data || !Array.isArray(data.manualTranslationOverrides)) return;

    try {
      const imported = validateRecords(data.manualTranslationOverrides);
      const merged = new Map(records.map(item => [item.key, item]));
      imported.forEach(item => merged.set(item.key, item));
      const next = [...merged.values()];
      if (!saveRecords(next)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showStatus('人工修正没有导入成功，因此已取消本次恢复，原有词库和修正均未改变。', 'error');
        return;
      }
      window.setTimeout(applySavedCorrection, 50);
    } catch (error) {
      console.warn('[DWSS] Ignored invalid manual correction backup data:', error);
      event.preventDefault();
      event.stopImmediatePropagation();
      showStatus('备份中的人工修正格式不正确，已取消恢复，原有数据没有改变。', 'error');
    }
  }, true);

  loadRecords();
  refreshControls();
  window.setTimeout(applySavedCorrection, 0);
  console.info('[DWSS] Manual translation reading correction is ready.');
})();
