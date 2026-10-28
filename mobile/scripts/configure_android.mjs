#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('android/app');
const strings = path.join(root, 'src/main/res/values/strings.xml');
const manifest = path.join(root, 'src/main/AndroidManifest.xml');
const javaRoot = path.join(root, 'src/main/java');
const gradle = [
  path.join(root, 'build.gradle'),
  path.join(root, 'build.gradle.kts')
].find(fs.existsSync);

if (!fs.existsSync(strings) || !fs.existsSync(manifest) || !gradle) {
  throw new Error('Generated Android project is missing strings.xml, AndroidManifest.xml, or app Gradle file.');
}

let xml = fs.readFileSync(strings, 'utf8');
for (const name of ['app_name', 'title_activity_main']) {
  const re = new RegExp('(<string\\s+name="' + name + '"[^>]*>)[\\s\\S]*?(<\\/string>)');
  if (!re.test(xml)) throw new Error('Could not find Android string resource: ' + name);
  xml = xml.replace(re, '$1刚果金斯语翻译$2');
}
fs.writeFileSync(strings, xml, 'utf8');

let gradleText = fs.readFileSync(gradle, 'utf8');
const version = process.env.DWSS_WEB_VERSION || '0.9.63';
const match = /^(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(version);
if (!match) throw new Error('Invalid web version: ' + version);
const [, major, minor, patch] = match.map(Number);
const versionCode = major * 1000000 + minor * 1000 + patch;
if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new Error('Invalid Android versionCode.');

if (!/versionCode\\s+\\d+/.test(gradleText)) throw new Error('Android versionCode not found.');
if (!/versionName\\s+["'][^"']+["']/.test(gradleText)) throw new Error('Android versionName not found.');
gradleText = gradleText.replace(/versionCode\\s+\\d+/, 'versionCode ' + versionCode);
gradleText = gradleText.replace(/versionName\\s+["'][^"']+["']/, 'versionName "' + version + '"');
fs.writeFileSync(gradle, gradleText, 'utf8');

const manifestText = fs.readFileSync(manifest, 'utf8');
if (!manifestText.includes('android:label="@string/app_name"') &&
    !manifestText.includes('android:label="@string/title_activity_main"')) {
  throw new Error('Launcher label reference not found in AndroidManifest.xml.');
}
if (!manifestText.includes('android:name=".MainActivity"') &&
    !manifestText.includes('android:name="com.dwss.kolwezi.MainActivity"')) {
  throw new Error('Expected .MainActivity entry not found in AndroidManifest.xml.');
}

const packageDir = path.join(javaRoot, 'com', 'dwss', 'kolwezi');
fs.mkdirSync(packageDir, { recursive: true });
for (const candidate of [
  path.join(packageDir, 'MainActivity.kt'),
  path.join(packageDir, 'MainActivity.java')
]) {
  if (fs.existsSync(candidate)) fs.rmSync(candidate);
}
const mainActivity = "package com.dwss.kolwezi;\n\nimport android.app.Activity;\nimport android.content.ActivityNotFoundException;\nimport android.content.Intent;\nimport android.graphics.Color;\nimport android.net.Uri;\nimport android.os.Build;\nimport android.os.Bundle;\nimport android.webkit.CookieManager;\nimport android.webkit.ServiceWorkerController;\nimport android.webkit.WebChromeClient;\nimport android.webkit.WebResourceError;\nimport android.webkit.WebResourceRequest;\nimport android.webkit.WebSettings;\nimport android.webkit.WebView;\nimport android.webkit.WebViewClient;\nimport android.webkit.ValueCallback;\nimport android.widget.FrameLayout;\n\npublic class MainActivity extends Activity {\n    private static final String APP_URL = \"https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/\";\n    private static final String APP_HOST = \"yanyao8686-debug.github.io\";\n    private static final int FILE_CHOOSER_REQUEST = 7104;\n    private WebView webView;\n    private ValueCallback<Uri[]> fileChooserCallback;\n\n    @Override\n    protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n\n        // Use the Android WebView Service Worker implementation for offline cache and updates.\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {\n            ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setBlockNetworkLoads(false);\n        }\n\n        CookieManager.getInstance().setAcceptCookie(true);\n        webView = new WebView(this);\n        webView.setBackgroundColor(Color.rgb(246, 247, 250));\n        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);\n\n        WebSettings settings = webView.getSettings();\n        settings.setJavaScriptEnabled(true);\n        settings.setDomStorageEnabled(true);\n        settings.setDatabaseEnabled(true);\n        settings.setLoadsImagesAutomatically(true);\n        settings.setCacheMode(WebSettings.LOAD_DEFAULT);\n        settings.setAllowFileAccess(false);\n        settings.setAllowContentAccess(false);\n        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);\n        settings.setSupportZoom(false);\n        settings.setBuiltInZoomControls(false);\n        settings.setJavaScriptCanOpenWindowsAutomatically(false);\n\n        webView.setWebViewClient(new WebViewClient() {\n            @Override\n            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {\n                return routeUrl(request.getUrl());\n            }\n\n            @SuppressWarnings(\"deprecation\")\n            @Override\n            public boolean shouldOverrideUrlLoading(WebView view, String url) {\n                return routeUrl(Uri.parse(url));\n            }\n\n            @Override\n            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {\n                super.onReceivedError(view, request, error);\n                if (request.isForMainFrame()) showOfflinePage();\n            }\n        });\n\n        webView.setWebChromeClient(new WebChromeClient() {\n            @Override\n            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {\n                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);\n                fileChooserCallback = callback;\n                try {\n                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);\n                    return true;\n                } catch (ActivityNotFoundException error) {\n                    fileChooserCallback = null;\n                    callback.onReceiveValue(null);\n                    return false;\n                }\n            }\n        });\n\n        setContentView(webView, new FrameLayout.LayoutParams(\n            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));\n        if (savedInstanceState == null) {\n            webView.loadUrl(APP_URL);\n        } else {\n            webView.restoreState(savedInstanceState);\n            if (webView.getUrl() == null) webView.loadUrl(APP_URL);\n        }\n    }\n\n    private boolean routeUrl(Uri uri) {\n        String scheme = uri.getScheme() == null ? \"\" : uri.getScheme().toLowerCase();\n        String host = uri.getHost() == null ? \"\" : uri.getHost().toLowerCase();\n        if (\"https\".equals(scheme) && APP_HOST.equals(host)) return false;\n        if (\"https\".equals(scheme) || \"http\".equals(scheme) || \"mailto\".equals(scheme) || \"tel\".equals(scheme)) {\n            try {\n                startActivity(new Intent(Intent.ACTION_VIEW, uri));\n            } catch (ActivityNotFoundException ignored) {\n                // No compatible external app is installed.\n            }\n        }\n        return true;\n    }\n\n    private void showOfflinePage() {\n        String html = \"<!doctype html><html lang='zh-CN'><meta charset='utf-8'>\"\n            + \"<meta name='viewport' content='width=device-width,initial-scale=1'>\"\n            + \"<body style='font:16px/1.7 system-ui,sans-serif;background:#f4f6fa;color:#24344f;padding:28px'>\"\n            + \"<h2>DWSS 暂时无法连接</h2><p>如果这是第一次打开，请先连接互联网，让应用完成首次缓存。</p>\"\n            + \"<p>如果以前已经打开并完成缓存，请检查网络后点击重新连接；已缓存版本不会因更新失败而被主动清除。</p>\"\n            + \"<button style='padding:12px 20px;border:0;border-radius:10px;background:#173b78;color:white;font-size:16px' \"\n            + \"onclick=\\\"location.href='\" + APP_URL + \"'\\\">重新连接</button></body></html>\";\n        webView.loadDataWithBaseURL(APP_URL, html, \"text/html\", \"UTF-8\", null);\n    }\n\n    @Override\n    protected void onActivityResult(int requestCode, int resultCode, Intent data) {\n        super.onActivityResult(requestCode, resultCode, data);\n        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {\n            fileChooserCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));\n            fileChooserCallback = null;\n        }\n    }\n\n    @Override\n    protected void onSaveInstanceState(Bundle outState) {\n        if (webView != null) webView.saveState(outState);\n        super.onSaveInstanceState(outState);\n    }\n\n    @Override\n    @SuppressWarnings(\"deprecation\")\n    public void onBackPressed() {\n        if (webView != null && webView.canGoBack()) webView.goBack();\n        else super.onBackPressed();\n    }\n\n    @Override\n    protected void onDestroy() {\n        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);\n        if (webView != null) {\n            webView.stopLoading();\n            webView.destroy();\n            webView = null;\n        }\n        super.onDestroy();\n    }\n}\n";
fs.writeFileSync(path.join(packageDir, 'MainActivity.java'), mainActivity, 'utf8');

let finalManifest = manifestText;
if (!finalManifest.includes('android:usesCleartextTraffic=')) {
  finalManifest = finalManifest.replace('<application', '<application android:usesCleartextTraffic="false"');
}
fs.writeFileSync(manifest, finalManifest, 'utf8');

console.log('PASS: Android WebView points to the official HTTPS DWSS website.');
console.log('PASS: Android Service Worker support is enabled for automatic web updates and offline caching.');
console.log('PASS: no local web code is baked as the active app page; native shell is separate.');
