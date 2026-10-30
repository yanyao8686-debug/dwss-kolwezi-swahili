-- DWSS 0.9.91: exact full-sentence cloud pronunciation corrections with immutable audit history.
alter table public.dictionary_pronunciation_overrides
  drop constraint if exists dictionary_pronunciation_overrides_chinese_check,
  drop constraint if exists dictionary_pronunciation_overrides_normalized_check,
  drop constraint if exists dictionary_pronunciation_overrides_reading_check;

alter table public.dictionary_pronunciation_overrides
  add column if not exists original_pronunciation_cn text,
  add column if not exists revision bigint not null default 1,
  add column if not exists source_kind text not null default 'dictionary';

alter table public.dictionary_pronunciation_overrides
  add constraint dictionary_pronunciation_overrides_chinese_check
    check (
      char_length(btrim(chinese_text)) between 1 and 2000
      and normalized_chinese = public.dwss_normalize_chinese(chinese_text)
      and chinese_text !~ '[[:cntrl:]]'
    ),
  add constraint dictionary_pronunciation_overrides_normalized_check
    check (char_length(btrim(normalized_chinese)) between 1 and 2000),
  add constraint dictionary_pronunciation_overrides_reading_check
    check (
      char_length(btrim(local_pronunciation_cn)) between 1 and 2000
      and local_pronunciation_cn !~ '[[:cntrl:]]'
    ),
  add constraint dictionary_pronunciation_overrides_original_check
    check (
      original_pronunciation_cn is null
      or (char_length(original_pronunciation_cn) <= 2000
          and original_pronunciation_cn !~ '[[:cntrl:]]')
    ),
  add constraint dictionary_pronunciation_overrides_source_kind_check
    check (source_kind in ('dictionary','translation')),
  add constraint dictionary_pronunciation_overrides_revision_check
    check (revision >= 1);

create table if not exists public.dictionary_pronunciation_override_history (
  id uuid primary key default gen_random_uuid(),
  normalized_chinese text not null,
  chinese_text text not null,
  source_kind text not null check (source_kind in ('dictionary','translation')),
  action text not null check (action in ('updated','restored')),
  original_pronunciation_cn text,
  previous_pronunciation_cn text,
  new_pronunciation_cn text,
  revision bigint not null,
  changed_at timestamptz not null default now(),
  constraint dictionary_pronunciation_override_history_normalized_check
    check (char_length(btrim(normalized_chinese)) between 1 and 2000),
  constraint dictionary_pronunciation_override_history_chinese_check
    check (char_length(btrim(chinese_text)) between 1 and 2000),
  constraint dictionary_pronunciation_override_history_new_reading_check
    check (new_pronunciation_cn is null or char_length(new_pronunciation_cn) <= 2000),
  constraint dictionary_pronunciation_override_history_previous_reading_check
    check (previous_pronunciation_cn is null or char_length(previous_pronunciation_cn) <= 2000)
);

alter table public.dictionary_pronunciation_override_history enable row level security;
revoke all on table public.dictionary_pronunciation_override_history from public, anon, authenticated;
grant all on table public.dictionary_pronunciation_override_history to service_role;
grant select, insert, update, delete on table public.dictionary_pronunciation_overrides to service_role;

create or replace function public.dwss_apply_pronunciation_override(
  p_normalized_chinese text,
  p_chinese_text text,
  p_original_pronunciation_cn text,
  p_local_pronunciation_cn text,
  p_action text,
  p_source_kind text,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_row public.dictionary_pronunciation_overrides%rowtype;
  v_original text;
  v_revision bigint;
  v_found boolean;
begin
  if p_action not in ('update','restore') then
    raise exception 'INVALID_ACTION' using errcode = '22023';
  end if;
  if p_source_kind not in ('dictionary','translation') then
    raise exception 'INVALID_SOURCE_KIND' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_normalized_chinese, 0)
  );

  select * into v_row
  from public.dictionary_pronunciation_overrides
  where normalized_chinese = p_normalized_chinese
  for update;
  v_found := found;

  if p_action = 'restore' then
    if not v_found then
      return pg_catalog.jsonb_build_object('ok', true, 'action', 'unchanged');
    end if;
    if p_expected_revision is not null and p_expected_revision <> v_row.revision then
      raise exception 'REVISION_CONFLICT' using errcode = '40001';
    end if;
    v_original := coalesce(v_row.original_pronunciation_cn, nullif(pg_catalog.btrim(p_original_pronunciation_cn), ''));
    v_revision := v_row.revision + 1;
    insert into public.dictionary_pronunciation_override_history
      (normalized_chinese,chinese_text,source_kind,action,original_pronunciation_cn,
       previous_pronunciation_cn,new_pronunciation_cn,revision)
    values
      (p_normalized_chinese,p_chinese_text,v_row.source_kind,'restored',v_original,
       v_row.local_pronunciation_cn,null,v_revision);
    delete from public.dictionary_pronunciation_overrides
    where normalized_chinese = p_normalized_chinese;
    return pg_catalog.jsonb_build_object('ok',true,'action','restored','revision',v_revision);
  end if;

  if p_local_pronunciation_cn is null or pg_catalog.btrim(p_local_pronunciation_cn) = '' then
    raise exception 'EMPTY_READING' using errcode = '22023';
  end if;

  if v_found then
    if p_expected_revision is not null and p_expected_revision <> v_row.revision then
      raise exception 'REVISION_CONFLICT' using errcode = '40001';
    end if;
    v_original := coalesce(v_row.original_pronunciation_cn, nullif(pg_catalog.btrim(p_original_pronunciation_cn), ''));
    v_revision := v_row.revision + 1;
    insert into public.dictionary_pronunciation_override_history
      (normalized_chinese,chinese_text,source_kind,action,original_pronunciation_cn,
       previous_pronunciation_cn,new_pronunciation_cn,revision)
    values
      (p_normalized_chinese,p_chinese_text,p_source_kind,'updated',v_original,
       v_row.local_pronunciation_cn,p_local_pronunciation_cn,v_revision);
    update public.dictionary_pronunciation_overrides
    set chinese_text = p_chinese_text,
        local_pronunciation_cn = p_local_pronunciation_cn,
        original_pronunciation_cn = v_original,
        source_kind = p_source_kind,
        revision = v_revision,
        updated_at = pg_catalog.now()
    where normalized_chinese = p_normalized_chinese;
  else
    if p_expected_revision is not null and p_expected_revision <> 0 then
      raise exception 'REVISION_CONFLICT' using errcode = '40001';
    end if;
    v_original := nullif(pg_catalog.btrim(p_original_pronunciation_cn), '');
    v_revision := 1;
    insert into public.dictionary_pronunciation_override_history
      (normalized_chinese,chinese_text,source_kind,action,original_pronunciation_cn,
       previous_pronunciation_cn,new_pronunciation_cn,revision)
    values
      (p_normalized_chinese,p_chinese_text,p_source_kind,'updated',v_original,
       null,p_local_pronunciation_cn,v_revision);
    insert into public.dictionary_pronunciation_overrides
      (normalized_chinese,chinese_text,local_pronunciation_cn,original_pronunciation_cn,
       source_kind,revision,updated_at)
    values
      (p_normalized_chinese,p_chinese_text,p_local_pronunciation_cn,v_original,
       p_source_kind,v_revision,pg_catalog.now());
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,'action','updated','revision',v_revision,
    'original_pronunciation_cn',v_original
  );
end;
$function$;

revoke all on function public.dwss_apply_pronunciation_override(text,text,text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.dwss_apply_pronunciation_override(text,text,text,text,text,text,bigint) to service_role;
