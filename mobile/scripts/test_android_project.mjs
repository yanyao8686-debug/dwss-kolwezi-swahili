#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('android/app');
const resourcesRoot = path.join(appRoot, 'src/main/res');
const manifestPath = path.join(appRoot, 'src/main/AndroidManifest.xml');
const activityPath = path.resolve('android/app/src/main/java/com/dwss/kolwezi/MainActivity.java');
const buildGradle = [
  path.join(appRoot, 'build.gradle'),
  path.join(appRoot, 'build.gradle.kts')
].find(fs.existsSync);

assert(fs.existsSync(resourcesRoot), 'Android resources directory exists');
assert(fs.existsSync(manifestPath), 'AndroidManifest.xml exists');
assert(fs.existsSync(activityPath), 'custom WebView MainActivity exists');
assert(buildGradle, 'app Gradle file exists');

function readAndroidString(xml, name) {
  const opening = '<string name="' + name + '"';
  const start = xml.indexOf(opening);
  if (start < 0) return null;
  const contentStart = xml.indexOf('>', start) + 1;
  const end = xml.indexOf('</string>', contentStart);
  if (contentStart <= 0 || end < 0) return null;
  return xml.slice(contentStart, end);
}

const defaultStringsPath = path.join(resourcesRoot, 'values/strings.xml');
assert(fs.existsSync(defaultStringsPath), 'default strings.xml exists');
const defaultStrings = fs.readFileSync(defaultStringsPath, 'utf8');
assert.equal(readAndroidString(defaultStrings, 'app_name'), '刚果金斯语翻译');
assert.equal(readAndroidString(defaultStrings, 'title_activity_main'), '刚果金斯语翻译');

const valueDirs = fs.readdirSync(resourcesRoot, {withFileTypes:true})
  .filter(entry => entry.isDirectory() && entry.name.startsWith('values'))
  .map(entry => path.join(resourcesRoot, entry.name));
let localizedFiles = 0;
for (const dir of valueDirs) {
  const file = path.join(dir, 'strings.xml');
  if (!fs.existsSync(file)) continue;
  localizedFiles++;
  const xml = fs.readFileSync(file, 'utf8');
  for (const name of ['app_name', 'title_activity_main']) {
    const value = readAndroidString(xml, name);
    if (value !== null) assert.equal(value, '刚果金斯语翻译', dir + '/' + name + ' must use the correct app name');
  }
}
assert(localizedFiles > 0, 'Android locale resource files were audited');

const manifest = fs.readFileSync(manifestPath, 'utf8');
assert(manifest.includes('android.permission.INTERNET'));
assert(manifest.includes('android:icon="@mipmap/ic_launcher"'));
assert(manifest.includes('android:usesCleartextTraffic="false"'));
const appStart = manifest.indexOf('<application');
const appEnd = manifest.indexOf('>', appStart);
assert(appStart >= 0 && appEnd > appStart, 'application tag is present');
const applicationTag = manifest.slice(appStart, appEnd + 1);
assert(applicationTag.includes('android:label="@string/app_name"'), 'application label is forced to app_name');

let launcherTag = '';
let cursor = 0;
while ((cursor = manifest.indexOf('<activity', cursor)) >= 0) {
  const end = manifest.indexOf('>', cursor);
  if (end < 0) break;
  const tag = manifest.slice(cursor, end + 1);
  if (tag.includes('android:name=".MainActivity"') || tag.includes('android:name="com.dwss.kolwezi.MainActivity"')) {
    launcherTag = tag;
    break;
  }
  cursor = end + 1;
}
assert(launcherTag, 'launcher activity tag is present');
assert(launcherTag.includes('android:label="@string/app_name"'), 'launcher activity label is forced to app_name');

const activity = fs.readFileSync(activityPath, 'utf8');
assert(activity.includes('https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/'));
assert(activity.includes('ServiceWorkerWebSettings'));
assert(activity.includes('serviceWorkerSettings.setCacheMode(WebSettings.LOAD_NO_CACHE)'), 'Service Worker network fetches bypass stale HTTP cache');
assert(activity.includes('settings.setCacheMode(WebSettings.LOAD_NO_CACHE)'), 'WebView network fetches bypass stale HTTP cache');
assert(activity.includes('appendQueryParameter("dwss-native-app", "1")'), 'native Android app is identified to the website');
assert(activity.includes('appendQueryParameter("dwss-native-version", nativeVersion)'), 'native app version is passed to the website');
assert(activity.includes('headers.put("Cache-Control", "no-cache")'), 'native app navigation revalidates the latest HTML');
assert(activity.includes('loadLatestDwss();'), 'every cold launch fetches the latest DWSS release');
assert(activity.includes('private boolean initialPagePositionSet = false;'), 'first page load scroll guard exists');
assert(activity.includes('public void onPageFinished(WebView view, String url)'), 'WebView first page completion is observed');
assert(activity.includes('view.post(() -> view.scrollTo(0, 0));'), 'native launch resets scroll position to the cover top after WebView layout');
assert(activity.includes('view.post(() -> view.scrollTo(0, 0));'), 'first page load is reset to the cover top after WebView layout');
assert(!activity.includes('webView.restoreState(savedInstanceState)'), 'stale saved scroll offsets are not restored on cold launch');
assert(activity.includes('ServiceWorkerController.getInstance()'));
assert(activity.includes('setDomStorageEnabled(true)'));
assert(activity.includes('MIXED_CONTENT_NEVER_ALLOW'));
assert(activity.includes('setSupportMultipleWindows(false)'));
assert(activity.includes('android.webkit.WebView'));
assert(!activity.includes('APP_HOST'), 'there is no host-only route that can send redirects to Chrome');
assert(!activity.includes('startActivity(new Intent(Intent.ACTION_VIEW, uri));') || activity.includes('"mailto".equals(scheme) || "tel".equals(scheme)'), 'external intents are limited to mail/phone protocols');

const routeStart = activity.indexOf('private boolean routeUrl(Uri uri)');
const routeEnd = activity.indexOf('private void showOfflinePage()', routeStart);
assert(routeStart >= 0 && routeEnd > routeStart, 'routeUrl method is present');
const route = activity.slice(routeStart, routeEnd);
assert(route.includes('if ("https".equals(scheme) || "http".equals(scheme)) return false;'), 'all HTTP/HTTPS navigations stay inside WebView');
assert(route.includes('"mailto".equals(scheme) || "tel".equals(scheme)'), 'only mail/phone protocols may open external apps');
assert(!route.includes('APP_HOST'), 'no host-only comparison may send HTTPS redirects to browser');

const gradle = fs.readFileSync(buildGradle, 'utf8');
assert(gradle.includes('applicationId "com.dwss.kolwezi"') || gradle.includes("applicationId 'com.dwss.kolwezi'"));
assert(gradle.includes('versionCode '));
assert(gradle.includes('versionName '));

for (const file of [
  'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'
]) assert(fs.existsSync(file), 'launcher icon exists: ' + file);

console.log('PASS: application and launcher labels are exact across all Android locales.');
console.log('PASS: all HTTP/HTTPS navigations stay in the native WebView, not Chrome.');
console.log('PASS: package ID, INTERNET permission, version, icon densities and Service Worker support.');
