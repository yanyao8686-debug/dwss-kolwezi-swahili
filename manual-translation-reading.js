/* DWSS 0.9.90 — manually correct the Chinese phonetic result for an exact input. */
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
    const saved = findRecord(key);
    editButton.textContent = saved ? '修改我的修正' : '修改读音';
    state.textContent = saved ? '已使用本机修正' : '可手动修正';
    state.hidden = false;
    restoreButton.hidden = !saved;
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

    // The app renderer writes the raw dictionary result first. A change that differs
    // from the last value set by this helper is therefore a fresh automatic result.
    if (key !== lastSourceKey || text !== lastDisplayedReading) {
      lastAutoReading = text;
      lastSourceKey = key;
      lastDisplayedReading = text;
    }

    const saved = findRecord(key);
    if (saved) {
      if (text !== saved.reading) setDisplayedReading(saved.reading, key);
      else {
        lastDisplayedReading = text;
        lastSourceKey = key;
      }
      showStatus('已自动使用你保存的本机修正。', 'saved');
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
    const saved = findRecord(key);
    const text = String(result.textContent || '').trim();
    editingKey = key;
    editorValue.value = saved ? saved.reading : (text || lastAutoReading);
    editor.hidden = false;
    restoreButton.hidden = !saved;
    showStatus('修改后的读音只保存在本机；更换设备前可通过个人备份转移。', 'note');
    editorValue.focus();
    editorValue.setSelectionRange(editorValue.value.length, editorValue.value.length);
  }

  function closeEditor() {
    editor.hidden = true;
    editingKey = '';
    editorValue.value = '';
  }

  function saveCorrection() {
    const key = currentKey();
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
    if (unreadable) {
      showStatus('检测到本机修正数据无法读取。为保护原始数据，已暂停写入。', 'error');
      return;
    }
    const next = records.filter(item => item.key !== key);
    next.push({key, zh: input.value.trim(), reading, updatedAt: new Date().toISOString()});
    if (!saveRecords(next)) return;
    lastAutoReading = lastAutoReading || String(result.textContent || '').trim();
    setDisplayedReading(reading, key);
    closeEditor();
    showStatus('已保存。下次输入相同中文时，会优先显示这条人工修正。', 'saved');
    refreshControls();
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
    showStatus('', '');
    window.setTimeout(applySavedCorrection, 760);
  });

  const observer = new MutationObserver(() => {
    if (!applyingDisplay) applySavedCorrection();
  });
  observer.observe(result, {childList: true, characterData: true, subtree: true});

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
