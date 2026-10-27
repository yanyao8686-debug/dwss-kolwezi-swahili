begin;
alter table public.shared_terms
  add column if not exists french_pronunciation_cn text;
alter table public.shared_terms
  alter column local_pronunciation_cn drop not null;
alter table public.shared_terms
  drop constraint if exists shared_terms_local_pronunciation_cn_check;
alter table public.shared_terms
  add constraint shared_terms_local_pronunciation_cn_check
  check (
    local_pronunciation_cn is null
    or char_length(btrim(local_pronunciation_cn)) between 1 and 500
  );
alter table public.shared_terms
  drop constraint if exists shared_terms_french_pronunciation_cn_check;
alter table public.shared_terms
  add constraint shared_terms_french_pronunciation_cn_check
  check (
    french_pronunciation_cn is null
    or char_length(btrim(french_pronunciation_cn)) between 1 and 500
  );
alter table public.shared_terms
  drop constraint if exists shared_terms_language_content_check;
alter table public.shared_terms
  add constraint shared_terms_language_content_check
  check (
    (
      source_language = 'sw'
      and local_pronunciation_cn is not null
      and char_length(btrim(local_pronunciation_cn)) between 1 and 500
    )
    or
    (
      source_language = 'fr'
      and (
        (
          french_pronunciation_cn is not null
          and char_length(btrim(french_pronunciation_cn)) between 1 and 500
        )
        or
        (
          french_text is not null
          and char_length(btrim(french_text)) between 1 and 500
          and local_pronunciation_cn is not null
          and char_length(btrim(local_pronunciation_cn)) between 1 and 500
        )
      )
    )
  );
commit;
