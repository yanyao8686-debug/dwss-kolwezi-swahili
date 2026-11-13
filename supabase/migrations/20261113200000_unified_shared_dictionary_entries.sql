begin;

create table if not exists public.shared_dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  client_submit_id uuid not null unique default gen_random_uuid(),
  source_language text not null check (source_language in ('sw','fr')),
  normalized_chinese text not null check (char_length(normalized_chinese) between 1 and 500),
  chinese_text text not null check (char_length(btrim(chinese_text)) between 1 and 500),
  local_text text,
  local_pronunciation_cn text,
  french_text text,
  french_pronunciation_cn text,
  category text not null default '未分类',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_dictionary_entries_language_payload_check check (
    (source_language = 'sw'
      and local_pronunciation_cn is not null
      and char_length(btrim(local_pronunciation_cn)) between 1 and 500
      and (local_text is null or char_length(btrim(local_text)) between 1 and 500)
      and french_text is null
      and french_pronunciation_cn is null)
    or
    (source_language = 'fr'
      and french_text is not null
      and char_length(btrim(french_text)) between 1 and 500
      and french_pronunciation_cn is not null
      and char_length(btrim(french_pronunciation_cn)) between 1 and 500
      and local_text is null
      and local_pronunciation_cn is null)
  ),
  constraint shared_dictionary_entries_category_check check (char_length(btrim(category)) between 1 and 80),
  constraint shared_dictionary_entries_notes_check check (notes is null or char_length(notes) <= 1000)
);

create unique index if not exists shared_dictionary_entries_preferred_headword_uidx
  on public.shared_dictionary_entries(source_language, normalized_chinese);
create index if not exists shared_dictionary_entries_updated_at_idx
  on public.shared_dictionary_entries(updated_at desc);

alter table public.shared_dictionary_entries enable row level security;
revoke all privileges on table public.shared_dictionary_entries from anon, authenticated;
grant select on table public.shared_dictionary_entries to anon, authenticated;
drop policy if exists shared_dictionary_entries_public_read on public.shared_dictionary_entries;
create policy shared_dictionary_entries_public_read
  on public.shared_dictionary_entries for select to anon, authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_dictionary_entries'
  ) then
    alter publication supabase_realtime add table public.shared_dictionary_entries;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
