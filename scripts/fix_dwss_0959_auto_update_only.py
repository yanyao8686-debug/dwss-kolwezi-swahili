from pathlib import Path
import re

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
    '.status-strip #checkUpdateBtn{flex:0 0 auto;margin:0!important;padding:8px 12px;font-size:12px;white-space:nowrap}',
    '.status-strip #pwaState{flex:0 0 auto;margin-left:auto!important;padding:8px 12px;font-size:12px;white-space:nowrap;text-align:center}',
    'right-side automatic-update badge style',
)
replace_once(
    'index.html',
    '.status-strip #checkUpdateBtn{padding:7px 9px;font-size:11px}',
    '.status-strip #pwaState{padding:7px 9px;font-size:11px}',
    'mobile automatic-update badge style',
)
replace_once(
    'index.html',
    '<section class="status-strip" aria-label="运行状态"><div class="status-items"><span class="offline" id="networkBadge">检查状态…</span><span class="chip" id="pwaState" hidden>正在检查</span></div><button class="soft mini" id="checkUpdateBtn" type="button">检查更新</button><p class="hint" id="pwaMessage" hidden>状态信息</p><button id="installAppBtn" type="button" hidden>安装到手机桌面</button></section>',
    '<section class="status-strip" aria-label="运行状态"><div class="status-items"><span class="offline" id="networkBadge">检查状态…</span></div><span class="chip pwa-state-warn" id="pwaState" role="status" aria-live="polite">自动更新初始化中</span><p class="hint" id="pwaMessage" hidden>状态信息</p><button id="installAppBtn" type="button" hidden>安装到手机桌面</button></section>',
    'remove manual check button and place update badge at its former position',
)
replace_once(
    'index.html',
    'content="0.9.58"><!-- DWSS_AUTO_UPDATE_0_9_58 -->',
    'content="0.9.59"><!-- DWSS_AUTO_UPDATE_0_9_59 -->',
    'automatic update release marker',
)

pwa = ROOT / 'pwa.js'
s = pwa.read_text(encoding='utf-8')
replace_map = [
    ("  const installButton = $('installAppBtn'), updateButton = $('checkUpdateBtn');", "  const installButton = $('installAppBtn');", 'remove manual button reference'),
    ("  if (updateButton) {\n    updateButton.disabled = true;\n    updateButton.title = 'DWSS 已开启自动更新；也可手动检查';\n  }\n", '', 'remove initial manual button setup'),
    ("        if (updateButton) {\n          updateButton.disabled = false;\n          updateButton.title = 'DWSS 已自动检查更新；点击可立即再次检查';\n        }\n", '', 'remove manual button readiness handling'),
    ("        if (updateButton) updateButton.disabled = true;\n", '', 'remove manual button error handling'),
    ("    if (updateButton) updateButton.addEventListener('click', () => checkForUpdates(true));\n", '', 'remove manual check click handler'),
    ("    if (updateButton) updateButton.disabled = true;\n", '', 'remove unsupported browser manual button handling'),
]
for old, new, label in replace_map:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    s = s.replace(old, new, 1)

pattern = r"  async function checkForUpdates\(manual\) \{[\s\S]*?\n  \}\n\n  window\.addEventListener\('online'"
replacement = """  async function checkForUpdates() {
    if (!updateServiceReady || !registration || !navigator.onLine) return;
    const now = Date.now();
    if (checkingUpdate || now - lastUpdateCheck < 60000) return;
    checkingUpdate = true;
    lastUpdateCheck = now;
    try {
      await registration.update();
      if (registration.waiting) {
        applyWaitingWorker();
      } else if (registration.installing) {
        setState('正在下载新版本', 'pwa-state-warn', '检测到新版本，正在后台下载并自动安装。');
      } else if (reloading) {
        // Keep the update-complete state while the automatic reload is queued.
      } else if (!hadControllerAtBoot) {
        setState('首次缓存初始化', 'pwa-state-ok', '首次打开正在缓存应用；以后每次打开都会自动检查更新。');
      } else {
        setState('自动更新已开启', 'pwa-state-ok', '每次打开应用、恢复联网或回到前台时自动检查；发现新版会自动下载、安装并刷新。');
      }
    } catch (error) {
      console.warn('[DWSS] Automatic update check failed; keeping the cached version:', error);
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        setState('已使用缓存版本', 'pwa-state-warn', '本次未能连接更新服务器；恢复联网或下次打开时会自动重试。');
      } else {
        setState('自动更新暂不可用', 'pwa-state-warn', '更新服务暂时无法连接；请保持联网并重新打开，程序会自动重试。');
      }
    } finally {
      checkingUpdate = false;
    }
  }

  window.addEventListener('online'"""
s2, n = re.subn(pattern, replacement, s, count=1)
if n != 1:
    raise SystemExit(f'updater function: expected exactly one block, got {n}')
s = s2.replace('checkForUpdates(false)', 'checkForUpdates()')
if 'checkUpdateBtn' in s or 'updateButton' in s or 'checkForUpdates(true)' in s or 'manual' in s:
    raise SystemExit('manual-update remnants remain in pwa.js')
pwa.write_text(s, encoding='utf-8')

replace_once(
    'boot.js',
    '更新版本请点击“检查更新”后重新打开；清除网站数据会删除本机自定义词条，请先导出备份。',
    '更新版本会在重新联网或重新打开应用时自动检测并安装；清除网站数据会删除本机自定义词条，请先导出备份。',
    'bootstrap update guidance',
)
replace_once('app.js', "version:'0.9.58'", "version:'0.9.59'", 'application version')
replace_once('sw.js', "const APP_VERSION = '0.9.58';", "const APP_VERSION = '0.9.59';", 'service worker cache version')
version = ROOT / 'VERSION.txt'
info = version.read_text(encoding='utf-8').replace('Version: 0.9.58', 'Version: 0.9.59', 1)
note = ('0.9.59: Remove the manual “检查更新” button; automatic update is verified to run on app open, network reconnection, return to foreground and focus. Move the live automatic-update state badge to the button\\'s former right-side position. Preserve draft-safe automatic Service Worker replacement.\n')
if note not in info:
    info = info.rstrip() + '\n' + note
version.write_text(info, encoding='utf-8')
print('PASS: DWSS 0.9.59 automatic-update-only UI patch applied.')
