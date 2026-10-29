/* DWSS Android bootstrap.
 * Capacitor's Android APK contains the uncompressed dictionary as dictionary.js.
 * The public website continues to serve dictionary.js.gz.
 */
(async function () {
  'use strict';

  const showError = (message) => {
    const box = document.createElement('div');
    box.style.cssText = 'margin:16px;padding:16px;border:1px solid #a33;border-radius:12px;background:#fff4f2;color:#7a2118;font:16px/1.6 system-ui,sans-serif';
    box.textContent = message;
    document.body.prepend(box);
  };

  try {
    const isCapacitorLocalApp =
      location.hostname === 'localhost' ||
      location.protocol === 'capacitor:';

    // Android's packaged asset is the plain JS file. The public PWA uses gzip.
    const candidates = isCapacitorLocalApp
      ? ['./dictionary.js', './dictionary.js.gz']
      : ['./dictionary.js.gz', './dictionary.js'];

    let dictionaryResponse = null;
    let dictionaryPath = '';
    let lastStatus = 404;

    for (const candidate of candidates) {
      const response = await fetch(candidate);
      lastStatus = response.status;
      if (response.ok) {
        dictionaryResponse = response;
        dictionaryPath = candidate;
        break;
      }
      if (response.status !== 404) {
        throw new Error('词库文件请求失败（HTTP ' + response.status + '）：' + candidate);
      }
    }

    if (!dictionaryResponse) {
      throw new Error('词库文件下载失败（HTTP ' + lastStatus + '）。请联网重新加载 DWSS。');
    }

    let source;
    if (dictionaryPath.endsWith('.gz')) {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('当前浏览器版本过旧，无法读取压缩词库。请更新 Chrome。');
      }
      const decompressed = dictionaryResponse.body.pipeThrough(new DecompressionStream('gzip'));
      source = await new Response(decompressed).text();
    } else {
      source = await dictionaryResponse.text();
    }

    if (!source.includes('window.SW_DB')) {
      throw new Error('词库文件内容无效，请重新安装或联网更新 DWSS。');
    }

    const blobUrl = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = blobUrl;
      script.onload = resolve;
      script.onerror = () => reject(new Error('词库加载失败，请重新打开软件。'));
      document.body.appendChild(script);
    });
    URL.revokeObjectURL(blobUrl);

    for (const src of ['./hanzi-pinyin.js', './pronunciation-search.js', './app.js', './dictionary-overrides.js', './pwa.js']) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('软件模块加载失败：' + src));
        document.body.appendChild(script);
      });
    }
  } catch (error) {
    console.error('[DWSS] bootstrap error', error);
    showError('DWSS 暂时无法启动：' + (error && error.message ? error.message : String(error)) + '。首次打开请联网后刷新。更新版本会在重新联网或重新打开应用时自动检测并安装；清除网站数据会删除本机自定义词条，请先导出备份。');
  }
})();
