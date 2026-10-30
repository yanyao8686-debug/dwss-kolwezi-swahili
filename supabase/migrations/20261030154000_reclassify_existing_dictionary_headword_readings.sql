-- Reclassify a literal built-in headword previously submitted through the sentence UI.
update public.shared_pronunciation_variants
set source_kind='dictionary',
    revision=revision+1
where normalized_chinese=public.dwss_normalize_chinese('11')
  and source_kind='translation';
