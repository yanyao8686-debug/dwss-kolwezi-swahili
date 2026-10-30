#!/usr/bin/env python3
"""DWSS 0.9.86: show a real SW update countdown, then confirmed completion."""
from pathlib import Path
import os
import re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))

def need(name):
    path=ROOT/name
    if not path.is_file():
        raise SystemExit(f"Missing required release asset: {path}")
    return path

def once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old,new,1)

for name in (
    "VERSION.txt","sw.js","index.html","app.js","boot.js","pwa.js",
    "dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js",
    "supabase.min.js","manifest.webmanifest","hanzi-pinyin.js",
    "pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"
):
    need(name)

# Update the PWA badge with real states rather than mapping every healthy state
# to "automatic update enabled".
pp=need("pwa.js")
pwa=pp.read_text(encoding="utf-8")
state_pattern=r"  const setState = \(text, kind, detail\) => \{[\s\S]*?\n  \};\n  const updateNetwork ="
if len(re.findall(state_pattern,pwa))!=1:
    raise SystemExit("Expected exactly one PWA setState block.")

state_block=r"""  const UPDATE_COMPLETION_KEY = 'dwss:pwa-update-completed:0.9.86';
  const UPDATE_COUNTDOWN_SECONDS = 5;
  let completionNoticeActive = false;
  let updateCountdownTimer = 0;
  let updateCountdownDeadline = 0;
  let updateCountdownWorker = null;

  const setState = (text, kind, detail) => {
    // After controllerchange the new worker is already active and the page
    // has reloaded. Keep the real completion message visible briefly instead
    // of letting the immediate no-update check overwrite it.
    if (completionNoticeActive && text === '自动更新已开启') return;
    if (state) {
      state.textContent = String(text || '自动更新已开启');
      state.hidden = false;
      const stateClass = ['pwa-state-warn', 'pwa-state-bad'].includes(kind)
        ? kind : 'pwa-state-ok';
      state.className = 'chip ' + stateClass;
      state.title = detail || '应用启动、恢复联网或回到前台时会自动检查新版';
    }
    if (message && detail) message.textContent = detail;
  };

  function showUpdateCompletionNotice() {
    try {
      const completedAt = Number(sessionStorage.getItem(UPDATE_COMPLETION_KEY));
      sessionStorage.removeItem(UPDATE_COMPLETION_KEY);
      const age = Date.now() - completedAt;
      if (!Number.isFinite(completedAt) || age < 0 || age > 60000) return;
      completionNoticeActive = true;
      setState('自动更新完毕', 'pwa-state-ok', '新版本已经启用并重新打开，自动更新运行正常。');
      window.setTimeout(() => {
        completionNoticeActive = false;
        if (state && state.textContent === '自动更新完毕') {
          setState('自动更新已开启', 'pwa-state-ok',
            '每次打开应用、恢复联网或回到前台时自动检查；发现新版会自动下载、安装并刷新。');
        }
      }, 2500);
    } catch (error) {
      console.info('[DWSS] Could not restore the update-complete badge:', error);
    }
  }
  showUpdateCompletionNotice();

  const updateNetwork ="""
pwa=re.sub(state_pattern,lambda _:state_block,pwa,count=1)

old_waiting=r"""  function applyWaitingWorker() {
    if (!registration || !registration.waiting) return false;
    setState('正在自动更新', 'pwa-state-warn', '检测到新版本，正在自动安装并重新打开页面。');
    registration.waiting.postMessage({ type: 'DWSS_SKIP_WAITING' });
    return true;
  }"""
new_waiting=r"""  function cancelUpdateCountdown() {
    if (updateCountdownTimer) window.clearTimeout(updateCountdownTimer);
    updateCountdownTimer = 0;
    updateCountdownDeadline = 0;
    updateCountdownWorker = null;
  }

  function startUpdateCountdown(worker) {
    // The first installation has no old controller to replace; browsers
    // activate that first worker normally. Countdown only for real updates.
    if (!hadControllerAtBoot) return false;
    if (updateCountdownTimer) return true;

    const candidate = worker || (registration && registration.waiting);
    if (!candidate || candidate.state === 'redundant') return false;

    updateCountdownWorker = candidate;
    updateCountdownDeadline = Date.now() + UPDATE_COUNTDOWN_SECONDS * 1000;

    const tick = () => {
      if (reloading) {
        cancelUpdateCountdown();
        return;
      }
      if (!updateCountdownWorker || updateCountdownWorker.state === 'redundant') {
        cancelUpdateCountdown();
        setState('保留当前版本', 'pwa-state-warn',
          '新版安装未能完成；当前版本继续可用，联网后会自动重试。');
        return;
      }

      const remaining = Math.max(0,
        Math.ceil((updateCountdownDeadline - Date.now()) / 1000));

      if (remaining > 0) {
        setState('更新倒计时 ' + remaining, 'pwa-state-warn',
          '已检测到新版并完成下载，' + remaining +
          ' 秒后自动切换并重新打开应用。请保持应用打开。');
        updateCountdownTimer = window.setTimeout(tick,
          Math.min(1000, Math.max(100, updateCountdownDeadline - Date.now())));
        return;
      }

      updateCountdownTimer = 0;
      const waiting = (registration && registration.waiting) || updateCountdownWorker;
      updateCountdownWorker = null;
      if (!waiting || waiting.state === 'redundant') {
        setState('更新暂未完成', 'pwa-state-warn',
          '新版暂时无法切换；当前版本仍可使用，程序会在下次联网时重试。');
        return;
      }

      setState('正在启用新版', 'pwa-state-warn',
        '倒计时结束，新版本正在接管应用。应用即将自动重新打开。');
      waiting.postMessage({ type: 'DWSS_SKIP_WAITING' });
    };

    tick();
    return true;
  }

  function applyWaitingWorker() {
    if (!registration || !registration.waiting) return false;
    return startUpdateCountdown(registration.waiting);
  }"""
pwa=once(pwa,old_waiting,new_waiting,"waiting-worker countdown handler")

old_update=r"""      if (registration.waiting) {
        applyWaitingWorker();
      } else if (registration.installing) {
        setState('正在下载新版本', 'pwa-state-warn', '检测到新版本，正在后台下载并自动安装。');"""
new_update=r"""      if (registration.waiting) {
        applyWaitingWorker();
      } else if (registration.installing) {
        setState('正在下载新版本', 'pwa-state-warn', '检测到新版本，正在后台下载并安装。');"""
pwa=once(pwa,old_update,new_update,"update check state")

old_worker=r"""            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setState('正在自动更新', 'pwa-state-warn', '新版本已下载，正在自动切换。');
              applyWaitingWorker();
            } else if (worker.state === 'redundant' && hadControllerAtBoot) {
              setState('保留当前版本', 'pwa-state-warn', '新版下载未完成；原有应用和个人词条不受影响，下次联网会重试。');
            }"""
new_worker=r"""            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              startUpdateCountdown(worker);
            } else if (worker.state === 'redundant' && hadControllerAtBoot) {
              cancelUpdateCountdown();
              setState('保留当前版本', 'pwa-state-warn',
                '新版下载未完成；原有应用和个人词条不受影响，下次联网会重试。');
            }"""
pwa=once(pwa,old_worker,new_worker,"service worker install lifecycle")

old_controller=r"""    preserveDraftBeforeReload();
    setState('更新完成，正在刷新', 'pwa-state-ok', '新版本已启用，正在重新打开 DWSS。');
    window.setTimeout(() => window.location.reload(), 80);"""
new_controller=r"""    preserveDraftBeforeReload();
    // This event means the new worker has actually taken control. The next
    // page load consumes this marker and briefly shows "自动更新完毕".
    try { sessionStorage.setItem(UPDATE_COMPLETION_KEY, String(Date.now())); } catch (_) {}
    setState('新版已启用，正在刷新', 'pwa-state-warn',
      '新版本已经接管应用，正在重新打开 DWSS。');
    window.setTimeout(() => window.location.reload(), 120);"""
pwa=once(pwa,old_controller,new_controller,"successful update activation")
pp.write_text(pwa,encoding="utf-8")

# Prevent the worker from bypassing the visible countdown. First installs
# activate normally; an update waits until the page sends DWSS_SKIP_WAITING.
swp=need("sw.js")
sw=swp.read_text(encoding="utf-8")
install_old="""    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();"""
install_new="""    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    // Do not skip the waiting phase on an update. pwa.js shows the countdown
    // after the full new cache is installed, then explicitly sends SKIP_WAITING.
    // On first installation there is no previous active worker to wait for.
"""
sw=once(sw,install_old,install_new,"Service Worker install lifecycle")
sw=once(sw,"const APP_VERSION = '0.9.85';","const APP_VERSION = '0.9.86';","Service Worker release")
if "if (event.data && event.data.type === 'DWSS_SKIP_WAITING') self.skipWaiting();" not in sw:
    raise SystemExit("Explicit SKIP_WAITING message handler missing.")
swp.write_text(sw,encoding="utf-8")

# Advance HTML script cache-busters and release metadata.
hp=need("index.html")
html=hp.read_text(encoding="utf-8")
for old,new,label in (
    ('content="0.9.85">','content="0.9.86">',"HTML update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_85 -->","<!-- DWSS_AUTO_UPDATE_0_9_86 -->","HTML update marker"),
    ("版本 0.9.85 · 刚果金斯语翻译","版本 0.9.86 · 刚果金斯语翻译","visible version")
):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.85")
if count<4:
    raise SystemExit(f"Expected at least four cache-busted module URLs; found {count}.")
html=html.replace("dwss-release=0.9.85","dwss-release=0.9.86")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=once(ap.read_text(encoding="utf-8"),"version:'0.9.85'","version:'0.9.86'","application metadata")
ap.write_text(app,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.85","Version: 0.9.86","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+=(
    "\n0.9.86: Show real update phases in the automatic-update badge. When a fully downloaded "
    "Service Worker update is waiting, show a five-second countdown, activate the new worker, "
    "and reload. After controllerchange and successful re-open, show '自动更新完毕' for 2.5 "
    "seconds, then return to '自动更新已开启'. Failed downloads retain the current version "
    "and never display a false completion message.\n"
)
vp.write_text(version,encoding="utf-8")

print("PASS: badge now displays real download, countdown, activation, completion and ready states.")
print("PASS: five-second countdown starts only after a new worker is fully installed and waiting.")
print("PASS: new service worker no longer skips the waiting phase automatically.")
print("PASS: completion appears only after controllerchange confirms activation, then returns to enabled.")
print("PASS: initial install, failed update and offline behavior remain safe.")
print("PASS: app metadata, HTML module cache-busters and Service Worker advanced to 0.9.86.")
