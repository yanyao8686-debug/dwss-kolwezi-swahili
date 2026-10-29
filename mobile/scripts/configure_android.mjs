// DWSS_ANDROID_WEB_PARITY_0970: keep native launches on the current, revalidated website release.
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('android/app');
const resourcesRoot = path.join(root, 'src/main/res');
const strings = path.join(resourcesRoot, 'values/strings.xml');
const manifest = path.join(root, 'src/main/AndroidManifest.xml');
const javaRoot = path.join(root, 'src/main/java');
const gradle = [
  path.join(root, 'build.gradle'),
  path.join(root, 'build.gradle.kts')
].find(fs.existsSync);

if (!fs.existsSync(strings) || !fs.existsSync(manifest) || !gradle) {
  throw new Error('Generated Android project is missing strings.xml, AndroidManifest.xml, or app Gradle file.');
}

const valueDirs = fs.readdirSync(resourcesRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && /^values(?:-.+)?$/.test(entry.name))
  .map(entry => path.join(resourcesRoot, entry.name));
let patchedStringFiles = 0;
let foundDefaultAppName = false;
let foundDefaultActivityTitle = false;
for (const dir of valueDirs) {
  const file = path.join(dir, 'strings.xml');
  if (!fs.existsSync(file)) continue;
  let xml = fs.readFileSync(file, 'utf8');
  for (const name of ['app_name', 'title_activity_main']) {
    const re = new RegExp('(<string\\s+name="' + name + '"[^>]*>)[\\s\\S]*?(<\\/string>)');
    if (!re.test(xml)) continue;
    xml = xml.replace(re, '$1刚果金斯语翻译$2');
    if (dir === path.join(resourcesRoot, 'values')) {
      if (name === 'app_name') foundDefaultAppName = true;
      if (name === 'title_activity_main') foundDefaultActivityTitle = true;
    }
  }
  fs.writeFileSync(file, xml, 'utf8');
  patchedStringFiles++;
}
if (!foundDefaultAppName || !foundDefaultActivityTitle || patchedStringFiles === 0) {
  throw new Error('Default app_name/title_activity_main or Android localized strings.xml resources are missing.');
}

let gradleText = fs.readFileSync(gradle, 'utf8');
const version = process.env.DWSS_WEB_VERSION || '0.9.63';
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) throw new Error('Invalid web version: ' + version);
const [, major, minor, patch] = match.map(Number);
const versionCode = major * 1000000 + minor * 1000 + patch;
if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new Error('Invalid Android versionCode.');

if (!/versionCode\s+\d+/.test(gradleText)) throw new Error('Android versionCode not found.');
if (!/versionName\s+["'][^"']+["']/.test(gradleText)) throw new Error('Android versionName not found.');
gradleText = gradleText.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode);
gradleText = gradleText.replace(/versionName\s+["'][^"']+["']/, 'versionName "' + version + '"');
fs.writeFileSync(gradle, gradleText, 'utf8');

let manifestText = fs.readFileSync(manifest, 'utf8');
const setLabel = tag => {
  if (/android:label="[^"]*"/.test(tag)) {
    return tag.replace(/android:label="[^"]*"/, 'android:label="@string/app_name"');
  }
  return tag.replace(/\/?>$/, ' android:label="@string/app_name"$&');
};
let applicationFound = false;
manifestText = manifestText.replace(/<application\b[^>]*>/, tag => {
  applicationFound = true;
  return setLabel(tag);
});
let launcherActivityFound = false;
manifestText = manifestText.replace(/<activity\b[^>]*>/g, tag => {
  if (/android:name="(?:\.MainActivity|com\.dwss\.kolwezi\.MainActivity)"/.test(tag)) {
    launcherActivityFound = true;
    return setLabel(tag);
  }
  return tag;
});
if (!applicationFound || !launcherActivityFound) {
  throw new Error('Could not apply the exact app name to both Android application and launcher activity labels.');
}
if (!manifestText.includes('android:usesCleartextTraffic=')) {
  manifestText = manifestText.replace('<application', '<application android:usesCleartextTraffic="false"');
}
if (!manifestText.includes('android.permission.INTERNET')) {
  manifestText = manifestText.replace(/<application\b/, '<uses-permission android:name="android.permission.INTERNET" />\n    <application');
}

const packageDir = path.join(javaRoot, 'com', 'dwss', 'kolwezi');
fs.mkdirSync(packageDir, { recursive: true });
for (const candidate of [
  path.join(packageDir, 'MainActivity.kt'),
  path.join(packageDir, 'MainActivity.java')
]) {
  if (fs.existsSync(candidate)) fs.rmSync(candidate);
}
const mainActivity = "package com.dwss.kolwezi;\n\nimport android.app.Activity;\nimport android.content.ActivityNotFoundException;\nimport android.content.Intent;\nimport android.graphics.Color;\nimport android.net.Uri;\nimport android.os.Build;\nimport android.os.Bundle;\nimport android.webkit.CookieManager;\nimport android.webkit.ServiceWorkerController;\nimport android.webkit.ServiceWorkerWebSettings;\nimport android.webkit.WebChromeClient;\nimport android.webkit.WebResourceError;\nimport android.webkit.WebResourceRequest;\nimport android.webkit.WebSettings;\nimport android.webkit.WebView;\nimport android.webkit.WebViewClient;\nimport android.webkit.ValueCallback;\nimport android.widget.FrameLayout;\nimport java.util.HashMap;\nimport java.util.Map;\n\npublic class MainActivity extends Activity {\n    private static final String APP_URL = \"https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/\";\n    private static final int FILE_CHOOSER_REQUEST = 7104;\n    private WebView webView;\n    private ValueCallback<Uri[]> fileChooserCallback;\n\n    @Override\n    protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n\n        // Force network revalidation for WebView and Service Worker fetches.\n        // The DWSS Cache API still supplies the last good shell when offline.\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {\n            ServiceWorkerWebSettings serviceWorkerSettings =\n                ServiceWorkerController.getInstance().getServiceWorkerWebSettings();\n            serviceWorkerSettings.setBlockNetworkLoads(false);\n            serviceWorkerSettings.setCacheMode(WebSettings.LOAD_NO_CACHE);\n        }\n\n        CookieManager.getInstance().setAcceptCookie(true);\n        webView = new WebView(this);\n        webView.setBackgroundColor(Color.rgb(246, 247, 250));\n        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);\n\n        WebSettings settings = webView.getSettings();\n        settings.setJavaScriptEnabled(true);\n        settings.setDomStorageEnabled(true);\n        settings.setDatabaseEnabled(true);\n        settings.setLoadsImagesAutomatically(true);\n        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);\n        settings.setAllowFileAccess(false);\n        settings.setAllowContentAccess(false);\n        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);\n        settings.setSupportZoom(false);\n        settings.setBuiltInZoomControls(false);\n        settings.setJavaScriptCanOpenWindowsAutomatically(false);\n        settings.setSupportMultipleWindows(false);\n\n        webView.setWebViewClient(new WebViewClient() {\n            @Override\n            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {\n                return routeUrl(request.getUrl());\n            }\n\n            @SuppressWarnings(\"deprecation\")\n            @Override\n            public boolean shouldOverrideUrlLoading(WebView view, String url) {\n                return routeUrl(Uri.parse(url));\n            }\n\n            @Override\n            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {\n                super.onReceivedError(view, request, error);\n                if (request.isForMainFrame()) showOfflinePage();\n            }\n        });\n\n        webView.setWebChromeClient(new WebChromeClient() {\n            @Override\n            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {\n                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);\n                fileChooserCallback = callback;\n                try {\n                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);\n                    return true;\n                } catch (ActivityNotFoundException error) {\n                    fileChooserCallback = null;\n                    callback.onReceiveValue(null);\n                    return false;\n                }\n            }\n        });\n\n        setContentView(webView, new FrameLayout.LayoutParams(\n            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));\n        if (savedInstanceState != null) webView.restoreState(savedInstanceState);\n        // Always revalidate the release at cold start, including after process restore.\n        loadLatestDwss();\n    }\n\n    private String buildLaunchUrl() {\n        String nativeVersion = \"unknown\";\n        try {\n            android.content.pm.PackageInfo info =\n                getPackageManager().getPackageInfo(getPackageName(), 0);\n            if (info.versionName != null) nativeVersion = info.versionName;\n        } catch (Exception ignored) {\n            // The website can still identify the native app without version metadata.\n        }\n        return Uri.parse(APP_URL).buildUpon()\n            .appendQueryParameter(\"dwss-native-app\", \"1\")\n            .appendQueryParameter(\"dwss-native-version\", nativeVersion)\n            .appendQueryParameter(\"dwss-launch\", Long.toString(System.currentTimeMillis()))\n            .build().toString();\n    }\n\n    private void loadLatestDwss() {\n        Map<String, String> headers = new HashMap<>();\n        headers.put(\"Cache-Control\", \"no-cache\");\n        headers.put(\"Pragma\", \"no-cache\");\n        webView.loadUrl(buildLaunchUrl(), headers);\n    }\n\n    private boolean routeUrl(Uri uri) {\n        String scheme = uri.getScheme() == null ? \"\" : uri.getScheme().toLowerCase();\n        // Keep all HTTP/HTTPS navigation inside this app's native WebView.\n        // Never hand redirects or in-app web links to Chrome.\n        if (\"https\".equals(scheme) || \"http\".equals(scheme)) return false;\n        if (\"mailto\".equals(scheme) || \"tel\".equals(scheme)) {\n            try {\n                startActivity(new Intent(Intent.ACTION_VIEW, uri));\n            } catch (ActivityNotFoundException ignored) {\n                // No compatible mail or phone app is installed.\n            }\n        }\n        return true;\n    }\n\n    private void showOfflinePage() {\n        String retryUrl = buildLaunchUrl();\n        String html = \"<!doctype html><html lang='zh-CN'><meta charset='utf-8'>\"\n            + \"<meta name='viewport' content='width=device-width,initial-scale=1'>\"\n            + \"<body style='font:16px/1.7 system-ui,sans-serif;background:#f4f6fa;color:#24344f;padding:28px'>\"\n            + \"<h2>DWSS 暂时无法连接</h2><p>如果这是第一次打开，请先连接互联网，让应用完成首次缓存。</p>\"\n            + \"<p>如果以前已经打开并完成缓存，请检查网络后点击重新连接；已缓存版本不会因更新失败而被主动清除。</p>\"\n            + \"<button style='padding:12px 20px;border:0;border-radius:10px;background:#173b78;color:white;font-size:16px' \"\n            + \"onclick=\\\"location.href='\" + retryUrl + \"'\\\">重新连接</button></body></html>\";\n        webView.loadDataWithBaseURL(APP_URL, html, \"text/html\", \"UTF-8\", null);\n    }\n\n    @Override\n    protected void onActivityResult(int requestCode, int resultCode, Intent data) {\n        super.onActivityResult(requestCode, resultCode, data);\n        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {\n            fileChooserCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));\n            fileChooserCallback = null;\n        }\n    }\n\n    @Override\n    protected void onSaveInstanceState(Bundle outState) {\n        if (webView != null) webView.saveState(outState);\n        super.onSaveInstanceState(outState);\n    }\n\n    @Override\n    @SuppressWarnings(\"deprecation\")\n    public void onBackPressed() {\n        if (webView != null && webView.canGoBack()) webView.goBack();\n        else super.onBackPressed();\n    }\n\n    @Override\n    protected void onDestroy() {\n        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);\n        if (webView != null) {\n            webView.stopLoading();\n            webView.destroy();\n            webView = null;\n        }\n        super.onDestroy();\n    }\n}";
fs.writeFileSync(path.join(packageDir, 'MainActivity.java'), mainActivity, 'utf8');

fs.writeFileSync(manifest, manifestText, 'utf8');

console.log('PASS: all localized Android string resources use 刚果金斯语翻译.');
console.log('PASS: application and launcher activity labels both use @string/app_name.');
console.log('PASS: all HTTP/HTTPS navigation remains inside the native WebView; only mailto/tel can leave the app.');
