#!/usr/bin/env python3
from pathlib import Path
import re
import os

root = Path(os.environ.get('DWSS_PUBLIC_DIR', 'public'))
index_path = root / 'index.html'
version_path = root / 'VERSION.txt'
sw_path = root / 'sw.js'

for path in (index_path, version_path, sw_path):
    if not path.is_file():
        raise SystemExit(f'Missing required baseline file: {path}')

html = index_path.read_text(encoding='utf-8')
notice = '词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。<br>'
if html.count(notice) != 1:
    raise SystemExit(f'Expected exactly one footer data/pronunciation notice; found {html.count(notice)}')
html = html.replace(notice, '', 1)

legal_pattern = re.compile(r'\s*<details class="legal-details">.*?</details>', re.S)
html, legal_count = legal_pattern.subn('', html, count=1)
if legal_count != 1:
    raise SystemExit(f'Expected exactly one software rights accordion; found {legal_count}')

style_pattern = re.compile(
    r'\.legal-details\{[^}]*\}\s*'
    r'\.legal-details summary\{[^}]*\}\s*'
    r'\.legal-body\{[^}]*\}\s*'
    r'\.legal-body strong\{[^}]*\}', re.S)
html, style_count = style_pattern.subn('', html, count=1)
if style_count != 1:
    raise SystemExit(f'Expected exactly one unused legal disclosure style block; found {style_count}')

for old, new, label in (
    ('<meta name="dwss-auto-update" content="0.9.63">', '<meta name="dwss-auto-update" content="0.9.64">', 'auto-update meta'),
    ('<!-- DWSS_AUTO_UPDATE_0_9_63 -->', '<!-- DWSS_AUTO_UPDATE_0_9_64 -->', 'auto-update marker'),
    ('版本 0.9.63 · DWSS 智能翻译 PWA', '版本 0.9.64 · DWSS 智能翻译 PWA', 'visible version'),
):
    count = html.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one occurrence, found {count}')
    html = html.replace(old, new, 1)

if '© 2026 DWSS / 陈谍 · 保留所有权利' not in html:
    raise SystemExit('Copyright stamp was not preserved')
if '词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。' in html:
    raise SystemExit('The requested source/pronunciation notice is still visible in HTML')
if '软件版权、品牌归属与授权说明' in html or 'class="legal-details"' in html:
    raise SystemExit('The requested software rights accordion is still present in HTML')

index_path.write_text(html, encoding='utf-8')

version_text = version_path.read_text(encoding='utf-8')
if version_text.count('Version: 0.9.63') != 1:
    raise SystemExit('Expected VERSION.txt to contain exactly one Version: 0.9.63 marker')
version_text = version_text.replace('Version: 0.9.63', 'Version: 0.9.64', 1)
version_text = re.sub(r'^Release date: .*$', 'Release date: 2026-10-29', version_text, count=1, flags=re.M)
version_text += '\n0.9.64: Remove the footer source/pronunciation disclaimer and the expanded software-rights accordion; retain the copyright stamp and visible version label.\n'
version_path.write_text(version_text, encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8')
if sw.count("const APP_VERSION = '0.9.63';") != 1:
    raise SystemExit('Expected exactly one Service Worker APP_VERSION 0.9.63 marker')
sw = sw.replace("const APP_VERSION = '0.9.63';", "const APP_VERSION = '0.9.64';", 1)
sw_path.write_text(sw, encoding='utf-8')

print('PASS: removed the footer disclaimer and legal accordion; retained copyright stamp; bumped PWA cache version to 0.9.64.')
