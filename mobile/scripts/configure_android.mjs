#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('android/app');
const strings = path.join(root, 'src/main/res/values/strings.xml');
const manifest = path.join(root, 'src/main/AndroidManifest.xml');
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

const manifestText = fs.readFileSync(manifest, 'utf8');
if (!manifestText.includes('android:label="@string/app_name"') &&
    !manifestText.includes('android:label="@string/title_activity_main"')) {
  throw new Error('Launcher label reference not found in AndroidManifest.xml.');
}
console.log('PASS: Android app label and activity title set to 刚果金斯语翻译; version ' + version + ' (' + versionCode + ').');
