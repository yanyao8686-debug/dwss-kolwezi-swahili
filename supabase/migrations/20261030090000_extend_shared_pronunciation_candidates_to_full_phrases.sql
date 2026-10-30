-- Extend existing pronunciation candidates from dictionary headwords to full main-translation phrases.
alter table public.shared_pronunciation_variants
  add column if not exists source_kind text not null default 'dictionary';

alter table public.shared_pronunciation_variants
  drop constraint if exists shared_pronunciation_variants_chinese_check,
  drop constraint if exists shared_pronunciation_variants_normalized_chinese_check,
  drop constraint if exists shared_pronunciation_variants_pronunciation_check,
  drop constraint if exists shared_pronunciation_variants_normalized_pronunciation_check,
  drop constraint if exists shared_pronunciation_variants_pinyin_key_check;

alter table public.shared_pronunciation_variants
  add constraint shared_pronunciation_variants_chinese_check check (char_length(btrim(chinese_text)) between 1 and 2000),
  add constraint shared_pronunciation_variants_normalized_chinese_check check (char_length(btrim(normalized_chinese)) between 1 and 2000),
  add constraint shared_pronunciation_variants_pronunciation_check check (char_length(btrim(pronunciation_cn)) between 1 and 2000),
  add constraint shared_pronunciation_variants_normalized_pronunciation_check check (char_length(btrim(normalized_pronunciation)) between 1 and 2000),
  add constraint shared_pronunciation_variants_pinyin_key_check check (pinyin_key is null or char_length(btrim(pinyin_key)) between 1 and 16000),
  add constraint shared_pronunciation_variants_source_kind_check check (source_kind in ('dictionary','translation'));

comment on table public.shared_pronunciation_variants is
'DWSS shared pronunciation candidates. Same Mandarin pinyin sequence is deduplicated; distinct/near pronunciation sequences remain separate. Word entries are dictionary candidates; full main-translation phrases are translation candidates. New submissions are pending until reviewed, while confirmed/common candidates are preferred for subsequent exact-phrase translation.';
