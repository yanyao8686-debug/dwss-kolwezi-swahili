from pathlib import Path

P = Path("public")
def read(name):
    path = P / name
    if not path.is_file(): raise SystemExit(f"Missing {path}")
    return path.read_text(encoding="utf-8")
def write(name, value): (P / name).write_text(value, encoding="utf-8")
def once(source, old, new, label):
    count = source.count(old)
    if count != 1: raise SystemExit(f"{label}: expected one anchor, found {count}")
    return source.replace(old, new, 1)

pwa = r'''/* DWSS PWA update manager — automatic update check and safe reload. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = $('pwaState'), message = $('pwaMessage'), networkBadge = $('networkBadge');
  const installButton = $('installAppBtn'), updateButton = $('checkUpdateBtn');
  const toast = $('pwaToast');
  const RESUME_KEY = 'dwss:pwa-resume:0.9.44';
  const hadControllerAtBoot = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  let deferredInstallPrompt = null, registration = null, reloading = false;
  let updateServiceReady = false, checkingUpdate = false, lastUpdateCheck = 0;
  let toastTimer = 0;

  const showFeedback = text => {
    if (!toast || !text) return;
    toast.textContent = text;
    toast.hidden = false;
    toast.classList.add('visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('visible'); toast.hidden = true;
    }, 4200);
  };
  const setState = (text, kind, detail) => {
    if (state) {
      state.textContent = text;
      state.hidden = !text;
      state.className = 'chip ' + (kind || '');
    }
    if (message && detail) message.textContent = detail;
  };
  const updateNetwork = () => {
    const online = navigator.onLine;
    if (networkBadge) {
      networkBadge.textContent = online ? '● 网络已连接' : '● 当前离线';
      networkBadge.style.borderColor = online ? '#c9d9d3' : '#e6c98b';
      networkBadge.style.color = online ? '#245c48' : '#9a6a1e';
    }
    if (!online && navigator.serviceWorker && navigator.serviceWorker.controller) {
      setState('离线运行中', 'pwa-state-ok', '当前使用已缓存版本；联网后会自动检查更新。');
    }
  };

  function preserveDraftBeforeReload() {
    try {
      const values = {};
      ['inputText', 'newZh', 'newReading'].forEach(id => {
        const el = $(id);
        if (el) values[id] = el.value || '';
      });
      const activeTab = document.querySelector('nav.tabs .tab.active');
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({
        savedAt: Date.now(), values,
        activeTab: activeTab && activeTab.dataset ? activeTab.dataset.tab : 'translate'
      }));
    } catch (error) {
      console.warn('[DWSS] Could not preserve the current draft for automatic update:', error);
    }
  }
  function restoreDraftAfterReload() {
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (!raw) return;
      sessionStorage.removeItem(RESUME_KEY);
      const snapshot = JSON.parse(raw);
      if (!snapshot || !snapshot.savedAt || Date.now() - snapshot.savedAt > 2 * 60 * 60 * 1000) return;
      const values = snapshot.values || {};
      Object.keys(values).forEach(id => {
        const el = $(id);
        if (el && !el.value) el.value = String(values[id] || '');
      });
      if (values.inputText) {
        const input = $('inputText');
        if (input) input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const tabName = ['translate', 'saved', 'maintenance'].includes(snapshot.activeTab)
        ? snapshot.activeTab : 'translate';
      const tab = Array.from(document.querySelectorAll('nav.tabs .tab'))
        .find(el => el.dataset && el.dataset.tab === tabName);
      if (tab && typeof tab.click === 'function') tab.click();
    } catch (error) {
      console.warn('[DWSS] Could not restore the current draft after automatic update:', error);
    }
  }

  function applyWaitingWorker() {
    if (!registration || !registration.waiting) return false;
    setState('正在自动更新', 'pwa-state-warn', '检测到新版本，正在自动安装并重新打开页面。');
    registration.waiting.postMessage({ type: 'DWSS_SKIP_WAITING' });
    return true;
  }

  async function checkForUpdates(manual) {
    if (!updateServiceReady || !registration) {
      if (manual) setState('更新服务正在初始化', 'pwa-state-warn', '更新服务仍在启动，请稍后重试。');
      return;
    }
    if (!navigator.onLine) {
      if (manual) {
        setState('当前离线', 'pwa-state-warn', '离线状态无法检查更新；已缓存版本仍可使用。');
        showFeedback(message && message.textContent);
      }
      return;
    }
    const now = Date.now();
    if (checkingUpdate || (!manual && now - lastUpdateCheck < 60000)) return;
    checkingUpdate = true;
    lastUpdateCheck = now;
    if (manual) updateButton.disabled = true;
    if (manual) setState('正在检查更新', 'pwa-state-warn', '正在连接更新服务器…');
    try {
      await registration.update();
      if (registration.waiting) {
        applyWaitingWorker();
      } else if (registration.installing) {
        setState('正在下载新版本', 'pwa-state-warn', '检测到新版本，正在后台下载并自动安装。');
      } else if (manual) {
        setState('当前已是最新版本', 'pwa-state-ok', '当前已是最新版本。');
        showFeedback(message && message.textContent);
      } else if (reloading) {
        // Keep the "update complete" state while the automatic reload is queued.
      } else if (!hadControllerAtBoot) {
        setState('首次缓存初始化', 'pwa-state-ok', '首次打开正在缓存应用；以后每次打开都会自动检查更新。');
      } else {
        setState('自动更新已开启', 'pwa-state-ok', '每次打开应用都会检查更新；发现新版会自动下载、安装并刷新。');
      }
    } catch (error) {
      console.warn('[DWSS] Automatic update check failed; keeping the cached version:', error);
      if (manual) {
        setState('暂时无法检查更新', 'pwa-state-warn', '更新服务器暂时无法连接；当前版本仍可使用，联网后会自动重试。');
        showFeedback(message && message.textContent);
      } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        setState('已使用缓存版本', 'pwa-state-ok', '本次未能连接更新服务器；联网或下次打开时会自动重试。');
      }
    } finally {
      checkingUpdate = false;
      if (manual && updateButton) updateButton.disabled = false;
    }
  }

  window.addEventListener('online', () => {
    updateNetwork();
    checkForUpdates(false);
  });
  window.addEventListener('offline', updateNetwork);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates(false);
  });
  window.addEventListener('focus', () => checkForUpdates(false));

  if (state) state.hidden = true;
  if (updateButton) {
    updateButton.disabled = true;
    updateButton.title = 'DWSS 已开启自动更新；也可手动检查';
  }
  if (installButton) {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.hidden = false;
      installButton.textContent = '安装到手机桌面';
    });
    installButton.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });
  }
  window.addEventListener('appinstalled', () => {
    if (installButton) installButton.hidden = true;
    setState('安装完成', 'pwa-state-ok', '已添加到桌面；以后打开会自动检查更新。');
  });

  // Reload only when an existing controlling worker is replaced. First installation
  // does not force a reload. The user's current translation/add-word draft is restored.
  navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtBoot || reloading) return;
    reloading = true;
    preserveDraftBeforeReload();
    setState('更新完成，正在刷新', 'pwa-state-ok', '新版本已启用，正在重新打开 DWSS。');
    window.setTimeout(() => window.location.reload(), 80);
  });

  restoreDraftAfterReload();
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    setState('需要 HTTPS', 'pwa-state-bad', '请使用官方 HTTPS 地址，以启用离线缓存和自动更新。');
  } else if ('serviceWorker' in navigator) {
    const initializeUpdateService = async () => {
      try {
        registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
        updateServiceReady = true;
        if (updateButton) {
          updateButton.disabled = false;
          updateButton.title = 'DWSS 已自动检查更新；点击可立即再次检查';
        }
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(granted => {
            if (granted) console.info('[DWSS] Browser granted persistent storage.');
          }).catch(() => {});
        }
        if (registration.waiting && hadControllerAtBoot) applyWaitingWorker();

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          if (hadControllerAtBoot) {
            setState('发现新版本', 'pwa-state-warn', '正在自动下载并安装新版本，请保持页面打开。');
          }
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setState('正在自动更新', 'pwa-state-warn', '新版本已下载，正在自动切换。');
              applyWaitingWorker();
            } else if (worker.state === 'redundant' && hadControllerAtBoot) {
              setState('保留当前版本', 'pwa-state-warn', '新版下载未完成；原有应用和个人词条不受影响，下次联网会重试。');
            }
          });
        });

        if (navigator.serviceWorker.controller) {
          setState('自动更新已开启', 'pwa-state-ok', '每次打开应用都会检查更新；发现新版会自动下载、安装并刷新。');
        } else {
          setState('离线缓存初始化', 'pwa-state-warn', '首次打开正在缓存应用，请保持联网。');
        }
        updateNetwork();
        // registration.update() forces a fresh check on every app open.
        await checkForUpdates(false);
      } catch (error) {
        console.error('[DWSS] Service Worker initialization failed:', error);
        if (updateButton) updateButton.disabled = true;
        setState('暂时无法连接更新服务', 'pwa-state-warn', '已缓存版本仍可使用；检查网络后重新打开，程序会自动重试。');
      }
    };
    if (document.readyState === 'complete') initializeUpdateService();
    else window.addEventListener('load', initializeUpdateService, { once: true });
    if (updateButton) updateButton.addEventListener('click', () => checkForUpdates(true));
  } else {
    if (updateButton) updateButton.disabled = true;
    setState('浏览器不支持自动更新', 'pwa-state-bad', '请使用最新版 Chrome 或 Safari 打开 DWSS。');
  }
  updateNetwork();
})();
'''
write("pwa.js", pwa)

app = read("app.js")
app = once(app, "version:'0.9.43'", "version:'0.9.44'", "app version")
write("app.js", app)

sw = read("sw.js")
sw = once(sw, "const APP_VERSION = '0.9.43';", "const APP_VERSION = '0.9.44';", "service worker cache version")
write("sw.js", sw)

html = read("index.html")
html = once(html, "版本 0.9.42 · DWSS 智能翻译 PWA", "版本 0.9.44 · DWSS 智能翻译 PWA", "footer version")
if "DWSS_AUTO_UPDATE_0_9_44" not in html:
    html = once(html, "</head>", '<meta name="dwss-auto-update" content="0.9.44"><!-- DWSS_AUTO_UPDATE_0_9_44 --><!-- DWSS 0.9.44 automatic updates --></head>', "auto-update build marker")
write("index.html", html)

version = once(read("VERSION.txt"), "Version: 0.9.43", "Version: 0.9.44", "release version")
version += "\n0.9.44: every app open checks the current Service Worker; new resources are downloaded and activated automatically; controller changes reload the app safely; active translation/add-word drafts are restored from sessionStorage. Existing localStorage/IndexedDB personal terms and sync queue are not cleared.\n"
write("VERSION.txt", version)

assert "await registration.update();" in pwa
assert "visibilitychange" in pwa and "addEventListener('focus'" in pwa
assert "registration.waiting.postMessage({ type: 'DWSS_SKIP_WAITING' })" in pwa
assert "controllerchange" in pwa and "preserveDraftBeforeReload" in pwa
assert "restoreDraftAfterReload" in pwa
assert "version:'0.9.44'" in app
assert "const APP_VERSION = '0.9.44';" in sw
assert "Version: 0.9.44" in version
assert "DWSS_AUTO_UPDATE_0_9_44" in html
assert "DWSS 0.9.44" in html
print("PASS: DWSS 0.9.44 automatic update check, activation, safe reload, and draft restore.")
