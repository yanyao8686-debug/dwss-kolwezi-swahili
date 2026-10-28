#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const stringsPath = path.resolve('android/app/src/main/res/values/strings.xml');
const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
const activityPath = path.resolve('android/app/src/main/java/com/dwss/kolwezi/MainActivity.java');
const buildGradle = [
  path.resolve('android/app/build.gradle'),
  path.resolve('android/app/build.gradle.kts')
].find(fs.existsSync);
assert(fs.existsSync(stringsPath), 'strings.xml exists');
assert(fs.existsSync(manifestPath), 'AndroidManifest.xml exists');
assert(fs.existsSync(activityPath), 'custom WebView MainActivity exists');
assert(buildGradle, 'app Gradle file exists');

const strings = fs.readFileSync(stringsPath, 'utf8');
assert.match(strings, /<string\s+name="app_name"[^>]*>刚果金斯语翻译<\/string>/);
assert.match(strings, /<string\s+name="title_activity_main"[^>]*>刚果金斯语翻译<\/string>/);

const manifest = fs.readFileSync(manifestPath, 'utf8');
assert.match(manifest, /android\.permission\.INTERNET/);
assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
assert.match(manifest, /android:usesCleartextTraffic="false"/);
assert.match(manifest, /android:name="\.MainActivity"/);

const activity = fs.readFileSync(activityPath, 'utf8');
assert.match(activity, /https:\/\/yanyao8686-debug\.github\.io\/dwss-kolwezi-swahili\//);
assert.match(activity, /ServiceWorkerController\.getInstance\(\)/);
assert.match(activity, /setDomStorageEnabled\(true\)/);
assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
assert.match(activity, /showOfflinePage\(\)/);
assert.match(activity, /android\.webkit\.WebView/);
assert.doesNotMatch(activity, /BridgeActivity/);

const gradle = fs.readFileSync(buildGradle, 'utf8');
assert.match(gradle, /applicationId\s+["']com\.dwss\.kolwezi["']/);
assert.match(gradle, /versionCode\s+\d+/);
assert.match(gradle, /versionName\s+["']0\.9\.\d+["']/);

for (const file of [
  'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'
]) assert(fs.existsSync(file), 'launcher icon exists: ' + file);

console.log('PASS: Android label, package ID, version, HTTPS-only WebView, Service Worker support, offline fallback and all launcher icon densities.');
