begin;

revoke all privileges on table public.shared_terms from anon, authenticated;
grant select, insert on table public.shared_terms to anon;
grant select, insert, update, delete on table public.shared_terms to authenticated;

alter table public.shared_terms
  drop constraint shared_terms_language_content_check;

alter table public.shared_terms
  add constraint shared_terms_language_content_check
  check (
    (
      source_language = 'sw'
      and (local_text is null or char_length(btrim(local_text)) between 1 and 500)
    )
    or
    (
      source_language = 'fr'
      and french_text is not null
      and char_length(btrim(french_text)) between 1 and 500
    )
  );

alter table public.shared_terms
  add constraint shared_terms_local_text_length_check
  check (local_text is null or char_length(btrim(local_text)) between 1 and 500);

alter table public.shared_terms
  add constraint shared_terms_french_text_length_check
  check (french_text is null or char_length(btrim(french_text)) between 1 and 500);

alter table public.shared_terms
  add constraint shared_terms_category_length_check
  check (char_length(btrim(category)) between 1 and 80);

alter table public.shared_terms
  add constraint shared_terms_notes_length_check
  check (notes is null or char_length(notes) <= 1000);

alter table public.shared_terms enable row level security;

commit;
