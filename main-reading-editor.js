/* DWSS 0.9.90 — edit the main translation pronunciation and publish it to all users. */
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

  function getOverride(chinese) {
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
    const reading = String(result.textContent || '').trim();
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
    const override = getOverride(chinese);
    badge.hidden = false;
    badge.textContent = override ? '云端共享修正已启用' : '可现场修改并共享';
    restoreButton.hidden = !override;
  }

  function openEditor() {
    const chinese = String(input.value || '').trim();
    const reading = String(result.textContent || '').trim();
    if (!chinese || !reading) return;
    if (chinese.length > MAX_LENGTH) {
      setStatus('整句中文超过 500 字，暂时不能发布为公共修正。', 'error');
      return;
    }
    const override = getOverride(chinese);
    editingChinese = chinese;
    editorValue.value = override
      ? String(override.local_pronunciation_cn || '')
      : reading;
    editor.hidden = false;
    restoreButton.hidden = !override;
    setStatus('这是公共修正：保存后所有用户都会使用；其他用户也可以再次修订。', 'note');
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
    const api = window.DWSSDictionaryOverrides;
    if (!api || typeof api.update !== 'function') {
      setStatus('云端修正服务尚未就绪。请联网后刷新页面再试。', 'error');
      return;
    }
    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = '正在保存并同步…';
    setStatus('正在提交到云端公共词库…', 'note');
    try {
      await api.update({
        chinese_text: editingChinese,
        local_pronunciation_cn: reading
      });
      closeEditor();
      setStatus('保存成功！云端公共读音已更新，其他用户会实时同步；下次输入相同中文也会自动使用这条读音。', 'success');
      refreshUi();
    } catch (error) {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = '保存并同步所有用户';
      setStatus(String(error && error.message || '云端保存失败，请检查网络后重试。'), 'error');
    }
  }

  async function restoreCorrection() {
    if (saving) return;
    const chinese = String(input.value || '').trim();
    const override = getOverride(chinese);
    const api = window.DWSSDictionaryOverrides;
    if (!override) {
      setStatus('这段中文目前没有公共人工修正。', 'note');
      restoreButton.hidden = true;
      return;
    }
    if (!api || typeof api.restore !== 'function') {
      setStatus('云端修正服务尚未就绪，请联网刷新页面再试。', 'error');
      return;
    }
    restoreButton.disabled = true;
    setStatus('正在删除公共修正并恢复自动词库结果…', 'note');
    try {
      await api.restore({chinese_text: chinese});
      closeEditor();
      setStatus('已恢复自动词库匹配结果，其他用户也会同步恢复。', 'success');
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
  window.addEventListener('dwss:dictionary-overrides-updated', () => {
    refreshUi();
    if (editor.hidden) setStatus('', '');
  });

  const observer = new MutationObserver(refreshUi);
  observer.observe(result, {childList:true, characterData:true, subtree:true});
  refreshUi();
  window.setTimeout(refreshUi, 500);
  console.info('[DWSS] Main translation cloud pronunciation editor ready.');
})();