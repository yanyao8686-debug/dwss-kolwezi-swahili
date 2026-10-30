/* DWSS 0.9.101 — consolidate pronunciation actions without changing their handlers. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const normalizeLabel = value => String(value || '').replace(/[\\s\\u00a0]+/g, '').trim();
  const panel = $('translationCorrectionPanel');
  const saveMain = $('submitTranslationCorrection');
  const restoreMain = $('restoreTranslationCorrection');
  const editHistory = $('viewTranslationCorrectionHistory');
  const withdrawnHistory = $('viewWithdrawnVariants');
  const otherReadingDialog = $('sharedVariantEditorDialog');

  const required = [
    ['translationCorrectionPanel', panel],
    ['submitTranslationCorrection', saveMain],
    ['viewTranslationCorrectionHistory', editHistory],
    ['viewWithdrawnVariants', withdrawnHistory],
    ['sharedVariantEditorDialog', otherReadingDialog],
    ['sharedVariantHistoryDialog', $('sharedVariantHistoryDialog')],
    ['translationOverrideHistoryDialog', $('translationOverrideHistoryDialog')]
  ];
  const missing = required.filter(([, element]) => !element).map(([id]) => id);
  if (missing.length) {
    console.error('[DWSS] Compact pronunciation controls not installed; missing:', missing.join(', '));
    return;
  }
  if (panel.dataset.dwssCompactControls === '1') return;
  panel.dataset.dwssCompactControls = '1';

  const style = document.createElement('style');
  style.id = 'dwss-compact-pronunciation-controls-style';
  style.textContent = `
    #dwss-pronunciation-entry-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 10px}
    #dwss-pronunciation-entry-actions button{flex:1 1 130px;min-height:38px;border-radius:12px;font-weight:750}
    #dwss-pronunciation-manager,#dwss-pronunciation-history-menu{width:min(430px,calc(100vw - 32px));max-width:430px;border:1px solid #dbe3ed;border-radius:18px;padding:18px;background:#fff;color:#17304b;box-shadow:0 18px 48px rgba(11,31,58,.22)}
    #dwss-pronunciation-manager::backdrop,#dwss-pronunciation-history-menu::backdrop{background:rgba(12,25,43,.48)}
    #dwss-pronunciation-manager h3,#dwss-pronunciation-history-menu h3{margin:0 0 8px;font-size:18px}
    #dwss-pronunciation-manager p,#dwss-pronunciation-history-menu p{margin:0 0 14px;color:#5d6d82;font-size:13px;line-height:1.55}
    .dwss-pronunciation-dialog-actions{display:grid;grid-template-columns:1fr;gap:8px}
    .dwss-pronunciation-dialog-actions button{min-height:40px;border-radius:11px;padding:9px 12px;font-weight:700}
    .dwss-pronunciation-dialog-actions .dwss-close{background:#f2f5f9;color:#35475d;border:1px solid #d9e0e9}
    .dwss-legacy-pronunciation-action{display:none!important}
    @media(max-width:380px){#dwss-pronunciation-entry-actions{gap:6px}#dwss-pronunciation-entry-actions button{flex-basis:120px;font-size:12px}}
  `;
  document.head.appendChild(style);

  const makeButton = (id, label, className) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = className || 'soft mini';
    button.textContent = label;
    return button;
  };
  const makeDialog = (id, title, description) => {
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.setAttribute('aria-labelledby', id + '-title');
    const heading = document.createElement('h3');
    heading.id = id + '-title';
    heading.textContent = title;
    const note = document.createElement('p');
    note.textContent = description;
    const actions = document.createElement('div');
    actions.className = 'dwss-pronunciation-dialog-actions';
    dialog.append(heading, note, actions);
    document.body.appendChild(dialog);
    return {dialog, actions};
  };
  const openDialog = dialog => {
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.hidden = false;
      dialog.setAttribute('open', '');
    }
  };
  const closeDialog = dialog => {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else { dialog.hidden = true; dialog.removeAttribute('open'); }
  };

  // Retain the original elements and event listeners; only replace their visible entry points.
  [saveMain, restoreMain, editHistory, withdrawnHistory].filter(Boolean)
    .forEach(button => button.classList.add('dwss-legacy-pronunciation-action'));

  const actions = document.createElement('div');
  actions.id = 'dwss-pronunciation-entry-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', '读音管理与历史记录');
  const manage = makeButton('dwss-open-pronunciation-manager', '管理读音', 'primary mini');
  const history = makeButton('dwss-open-pronunciation-history', '历史记录', 'soft mini');
  actions.append(manage, history);
  panel.insertBefore(actions, panel.firstChild);

  const manager = makeDialog(
    'dwss-pronunciation-manager',
    '管理读音',
    '修改主读音：请先编辑上方的中文谐音结果，再点“保存并同步”。添加其他读音不会覆盖当前主读音。'
  );
  const saveButton = makeButton('dwss-save-main-pronunciation', '保存并同步', 'primary mini');
  const addButton = makeButton('dwss-add-other-pronunciation', '添加其他读音', 'soft mini');
  manager.actions.append(saveButton, addButton);
  if (restoreMain) {
    const restoreButton = makeButton('dwss-restore-main-pronunciation', '恢复自动翻译', 'soft mini');
    manager.actions.appendChild(restoreButton);
    restoreButton.addEventListener('click', () => {
      closeDialog(manager.dialog);
      restoreMain.click();
    });
  }
  const closeManager = makeButton('dwss-close-pronunciation-manager', '关闭', 'dwss-close');
  manager.actions.appendChild(closeManager);

  const historyMenu = makeDialog(
    'dwss-pronunciation-history-menu',
    '历史记录',
    '选择要查看的记录。原有的查看、恢复和重新启用功能保持不变。'
  );
  const openEditHistory = makeButton('dwss-open-edit-history', '修改记录', 'soft mini');
  const openWithdrawnHistory = makeButton('dwss-open-withdrawn-history', '已撤回读音', 'soft mini');
  const closeHistory = makeButton('dwss-close-pronunciation-history', '关闭', 'dwss-close');
  historyMenu.actions.append(openEditHistory, openWithdrawnHistory, closeHistory);

  manage.addEventListener('click', () => openDialog(manager.dialog));
  history.addEventListener('click', () => openDialog(historyMenu.dialog));
  closeManager.addEventListener('click', () => closeDialog(manager.dialog));
  closeHistory.addEventListener('click', () => closeDialog(historyMenu.dialog));
  saveButton.addEventListener('click', () => {
    closeDialog(manager.dialog);
    if (!saveMain.disabled) saveMain.click();
  });
  addButton.addEventListener('click', () => {
    closeDialog(manager.dialog);
    openDialog(otherReadingDialog);
  });
  openEditHistory.addEventListener('click', () => {
    closeDialog(historyMenu.dialog);
    editHistory.click();
  });
  openWithdrawnHistory.addEventListener('click', () => {
    closeDialog(historyMenu.dialog);
    withdrawnHistory.click();
  });

  // Keep the original submit handler; simplify only the text shown to users.
  const simplifiedVariantLabel = '添加其他读音';
  otherReadingDialog.querySelectorAll('h1,h2,h3,h4,button').forEach(element => {
    if (normalizeLabel(element.textContent) === '新增为另一种当地读音') {
      element.textContent = simplifiedVariantLabel;
    }
  });
  [$('sharedVariantHistoryDialog'), $('translationOverrideHistoryDialog')].forEach(dialog => {
    if (!dialog) return;
    dialog.querySelectorAll('h1,h2,h3,h4').forEach(heading => {
      if (normalizeLabel(heading.textContent) === '修改历史') heading.textContent = '修改记录';
    });
  });
  // Hide obsolete duplicate launchers elsewhere; retain their handlers for the compact entries.
  document.querySelectorAll('button').forEach(button => {
    if (button.closest('#sharedVariantEditorDialog')) return;
    if (normalizeLabel(button.textContent) === '新增为另一种当地读音') {
      button.classList.add('dwss-legacy-pronunciation-action');
    }
  });
  console.info('[DWSS] Compact pronunciation controls ready: two main entry points; original actions preserved.');
})();
