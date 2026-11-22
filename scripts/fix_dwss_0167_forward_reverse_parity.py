#!/usr/bin/env python3
"""DWSS 0.9.167: make reverse lookup use exactly the same accepted readings as forward translation."""
from pathlib import Path
import os

ROOT = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))
app_path = ROOT / "app.js"
if not app_path.is_file():
    raise SystemExit("DWSS build app.js is missing.")
app = app_path.read_text(encoding="utf-8")

old_entries = """ const entries=engine.includeTranslationOverrides(all.map(item=>({zh:item.zh,category:item.category,variants:pronunciationLookupVariants(item).map(v=>({
  reading:v.reading,latin:v.latin||'',source:v.source||'词库记录',kind:v.kind||'',
  status:v.variantStatus||'canonical',dialect:v.dialect||''
 }))})),publicPronunciationOverrides);
 const results=engine.search(query,entries,{limit:20});"""
new_entries = """ const entries=all.map(item=>({zh:item.zh,category:item.category,variants:preferredLocalVariants(item).map(v=>({
  reading:v.reading,latin:v.latin||'',source:v.source||'词库记录',kind:v.kind||'',
  status:v.variantStatus||'canonical',dialect:v.dialect||''
 }))}));
 const results=engine.search(query,entries,{limit:20});"""

if old_entries in app:
    app = app.replace(old_entries, new_entries, 1)
elif new_entries not in app:
    raise SystemExit("Cannot find the reverse lookup builder to unify with forward accepted readings.")

old_readings = "  const readings=[...(item?pronunciationLookupVariants(item).map(v=>String(v.reading||'').trim()).filter(Boolean):[]),result.matchedReading].filter(Boolean);"
new_readings = "  const readings=item?preferredLocalVariants(item).map(v=>String(v.reading||'').trim()).filter(Boolean):[result.matchedReading];"
if old_readings in app:
    app = app.replace(old_readings, new_readings, 1)
elif new_readings not in app:
    raise SystemExit("Cannot find the reverse lookup reading renderer to unify its displayed candidates.")

if "variants:preferredLocalVariants(item).map(v=>({" not in app:
    raise SystemExit("The reverse index is not using the forward translation's accepted pronunciation resolver.")
if "engine.includeTranslationOverrides(all.map" in app:
    raise SystemExit("A reverse-only translation override path remains active.")
if "const readings=item?preferredLocalVariants(item).map(" not in app:
    raise SystemExit("The reverse result display is not using the same accepted pronunciation resolver.")
app_path.write_text(app, encoding="utf-8")

# Advance every browser cache/version marker together so old cached modules cannot mix with this fix.
for name in ("VERSION.txt", "index.html", "app.js", "sw.js"):
    path = ROOT / name
    if not path.is_file():
        raise SystemExit("Missing release asset: " + str(path))
    content = path.read_text(encoding="utf-8")
    content = content.replace("0.9.166", "0.9.167")
    path.write_text(content, encoding="utf-8")

print("PASS: reverse lookup now consumes the same preferredLocalVariants() readings as forward Swahili translation.")
print("PASS: reverse-only legacy translation overrides are no longer presented as translatable Swahili headwords.")
print("PASS: release cache markers advanced to DWSS 0.9.167.")
