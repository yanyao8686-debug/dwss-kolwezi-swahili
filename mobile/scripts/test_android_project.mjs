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

const defaultStringsPath = path.join(resourcesRoot, 'values/strings.xml');
assert(fs.existsSync(defaultStringsPath), 'default strings.xml exists');
const defaultStrings = fs.readFileSync(defaultStringsPath, 'utf8');
assert.match(defaultStrings, /<string\\s+name="app_name"[^>]*>刚果金斯语翻译<\\/string>/);
assert.match(defaultStrings, /<string\\s+name="title_activity_main"[^>]*>刚果金斯语翻译<\\/string>/);

const valueDirs = fs.readdirSync(resourcesRoot, {withFileTypes:true})
  .filter(entry => entry.isDirectory() && /^values(?:-.+)?$/.test(entry.name))
  .map(entry => path.join(resourcesRoot, entry.name));
let localizedFiles = 0;
for (const dir of valueDirs) {
  const file = path.join(dir, 'strings.xml');
  if (!fs.existsSync(file)) continue;
  localizedFiles++;
  const xml = fs.readFileSync(file, 'utf8');
  for (const name of ['app_name', 'title_activity_main']) {
    const re = new RegExp('<string\\\\s+name="' + name + '"[^>]*>([\\\\s\\\\S]*?)<\\\\/string>');
    const match = re.exec(xml);
    if (match) assert.equal(match[1], '刚果金斯语翻译', dir + '/' + name + ' must use the correct Chinese app name');
  }
}
assert(localizedFiles > 0, 'Android locale resource files were audited');

const manifest = fs.readFileSync(manifestPath, 'utf8');
assert.match(manifest, /android\\.permission\\.INTERNET/);
assert.match(manifest, /android:icon="@mipmap\\/ic_launcher"/);
assert.match(manifest, /android:usesCleartextTraffic="false"/);
const applicationTag = manifest.match(/<application\\b[^>]*>/)?.[0] || '';
const activityTags = manifest.match(/<activity\\b[^>]*>/g) || [];
const launcherTag = activityTags.find(tag => /android:name="(?:\\.MainActivity|com\\.dwss\\.kolwezi\\.MainActivity)"/.test(tag)) || '';
assert(applicationTag.includes('android:label="@string/app_name"'), 'application label is forced to app_name');
assert(launcherTag.includes('android:label="@string/app_name"'), 'launcher activity label is forced to app_name');

const activity = fs.readFileSync(activityPath, 'utf8');
assert.match(activity, /https:\\/\\/yanyao8686-debug\\.github\\.io\\/dwss-kolwezi-swahili\\//);
assert.match(activity, /ServiceWorkerController\\.getInstance\\(\\)/);
assert.match(activity, /setDomStorageEnabled\\(true\\)/);
assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
assert.match(activity, /setSupportMultipleWindows\\(false\\)/);
assert.match(activity, /android\\.webkit\\.WebView/);
assert.doesNotMatch(activity, /APP_HOST/, 'no host-only route that can send site redirects to Chrome');
assert.doesNotMatch(activity, /startActivity\\(new Intent\\(Intent\\.ACTION_VIEW, uri\\)\\).*https/s, 'HTTPS navigation must not launch a browser');

const routeStart = activity.indexOf('private boolean routeUrl(Uri uri)');
const routeEnd = activity.indexOf('private void showOfflinePage()', routeStart);
assert(routeStart >= 0 && routeEnd > routeStart, 'routeUrl method is present');
const route = activity.slice(routeStart, routeEnd);
assert.match(route, /if \\("https"\\.equals\\(scheme\\) \\|\\| "http"\\.equals\\(scheme\\)\\) return false;/, 'all web URLs stay in WebView');
assert.match(route, /"mailto"\\.equals\\(scheme\\) \\|\\| "tel"\\.equals\\(scheme\\)/, 'only mail/phone protocols are external-app actions');

const gradle = fs.readFileSync(buildGradle, 'utf8');
assert.match(gradle, /applicationId\\s+["']com\\.dwss\\.kolwezi["']/);
assert.match(gradle, /versionCode\\s+\\d+/);
assert.match(gradle, /versionName\\s+["']0\\.9\\.\\d+["']/);

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
