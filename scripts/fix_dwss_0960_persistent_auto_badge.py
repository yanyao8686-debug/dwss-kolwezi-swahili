from pathlib import Path

ROOT = Path('public')

def replace_once(path, old, new, label):
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')

replace_once(
    'index.html',
    '<span class="chip pwa-state-warn" id="pwaState" role="status" aria-live="polite">自动更新初始化中</span>',
    '<span class="chip pwa-state-ok" id="pwaState" role="status" aria-live="polite" title="应用启动、恢复联网或回到前台时会自动检查新版">自动更新已开启</span>',
    'always-visible automatic update badge',
)

replace_once(
    'pwa.js',
    """  const setState = (text, kind, detail) => {
    if (state) {
      state.textContent = text;
      state.hidden = !text;
      state.className = 'chip ' + (kind || '');
    }
    if (message && detail) message.textContent = detail;
  };""",
    """  const setState = (text, kind, detail) => {
    if (state) {
      // This is a persistent feature badge, not a temporary progress message.
      // Keep it visible and keep the requested wording while automatic checks run.
      const unavailable = ['需要 HTTPS', '自动更新暂不可用', '暂时无法连接更新服务', '浏览器不支持自动更新'].includes(text);
      state.textContent = unavailable ? '自动更新暂不可用' : '自动更新已开启';
      state.hidden = false;
      state.className = 'chip ' + (unavailable ? 'pwa-state-bad' : 'pwa-state-ok');
      state.title = detail || '应用启动、恢复联网或回到前台时会自动检查新版';
    }
    if (message && detail) message.textContent = detail;
  };""",
    'persistent automatic-update state badge',
)

replace_once(
    'pwa.js',
    '  if (state) state.hidden = true;\n',
    '  // Do not hide the persistent automatic-update badge during initialization.\n',
    'remove unconditional badge hide',
)

replace_once('app.js', "version:'0.9.59'", "version:'0.9.60'", 'application version')
replace_once('index.html', 'content="0.9.59"><!-- DWSS_AUTO_UPDATE_0_9_59 -->', 'content="0.9.60"><!-- DWSS_AUTO_UPDATE_0_9_60 -->', 'PWA auto-update marker')
replace_once('index.html', '版本 0.9.58 · DWSS 智能翻译 PWA', '版本 0.9.60 · DWSS 智能翻译 PWA', 'visible version')
replace_once('sw.js', "const APP_VERSION = '0.9.59';", "const APP_VERSION = '0.9.60';", 'service worker cache version')
version = ROOT / 'VERSION.txt'
info = version.read_text(encoding='utf-8').replace('Version: 0.9.59', 'Version: 0.9.60', 1)
note = "0.9.60: Keep the right-side “自动更新已开启” badge visible from initial page render through startup, checks, offline mode, and update transitions; only show an unavailable label for unsupported or failed initialization.\n"
if note not in info:
    info = info.rstrip() + '\n' + note
version.write_text(info, encoding='utf-8')
print('PASS: DWSS 0.9.60 persistent automatic-update badge patch applied.')
