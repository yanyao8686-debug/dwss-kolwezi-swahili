-- DWSS: preserve same/near local pronunciations in one editable shared sound group.
alter table public.shared_pronunciation_variants
  add column if not exists pronunciation_aliases text[] not null default '{}'::text[],
  add column if not exists source_submission_ids uuid[] not null default '{}'::uuid[];

update public.shared_pronunciation_variants
set source_submission_ids = array[client_submit_id]
where cardinality(source_submission_ids) = 0
  and client_submit_id is not null;

alter table public.shared_pronunciation_variants
  drop constraint if exists shared_pronunciation_variants_aliases_limit_check;
alter table public.shared_pronunciation_variants
  add constraint shared_pronunciation_variants_aliases_limit_check
  check (cardinality(pronunciation_aliases) <= 20);

alter table public.shared_pronunciation_variants
  drop constraint if exists shared_pronunciation_variants_submission_ids_limit_check;
alter table public.shared_pronunciation_variants
  add constraint shared_pronunciation_variants_submission_ids_limit_check
  check (cardinality(source_submission_ids) <= 1000);

create unique index if not exists shared_pronunciation_variants_headword_source_pinyin_uidx
  on public.shared_pronunciation_variants(normalized_chinese, source_kind, pinyin_key)
  where pinyin_key is not null;

create index if not exists shared_pronunciation_variants_headword_source_status_idx
  on public.shared_pronunciation_variants(normalized_chinese, source_kind, status, updated_at desc);

create or replace function private.dwss_pinyin_syllable_near(p_left text, p_right text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  v_left text := replace(lower(btrim(p_left)), 'ü', 'v');
  v_right text := replace(lower(btrim(p_right)), 'ü', 'v');
  v_left_initial text := '';
  v_right_initial text := '';
  v_left_final text;
  v_right_final text;
  v_pair text[];
begin
  if v_left = v_right then return true; end if;
  if v_left = '' or v_right = '' then return false; end if;
  if left(v_left, 2) in ('zh','ch','sh') then
    v_left_initial := left(v_left, 2);
  elsif left(v_left, 1) ~ '^[bpmfdtnlgkhjqxrzcswy]$' then
    v_left_initial := left(v_left, 1);
  end if;
  if left(v_right, 2) in ('zh','ch','sh') then
    v_right_initial := left(v_right, 2);
  elsif left(v_right, 1) ~ '^[bpmfdtnlgkhjqxrzcswy]$' then
    v_right_initial := left(v_right, 1);
  end if;
  v_left_final := substr(v_left, length(v_left_initial) + 1);
  v_right_final := substr(v_right, length(v_right_initial) + 1);
  if v_left_initial = v_right_initial then
    foreach v_pair slice 1 in array array[
      ['an','ang'], ['en','eng'], ['in','ing'], ['ian','iang'],
      ['uan','uang'], ['un','ong'], ['e','ei'], ['ai','ei'],
      ['ao','ou'], ['o','uo'], ['iu','iou'], ['ui','uei']
    ] loop
      if (v_left_final = v_pair[1] and v_right_final = v_pair[2])
         or (v_left_final = v_pair[2] and v_right_final = v_pair[1]) then
        return true;
      end if;
    end loop;
  end if;
  if v_left_final = v_right_final then
    foreach v_pair slice 1 in array array[
      ['z','zh'], ['c','ch'], ['s','sh'], ['n','l'], ['l','r'],
      ['f','h'], ['g','k'], ['j','q'], ['zh','j'], ['ch','q'],
      ['sh','x'], ['b','p'], ['d','t']
    ] loop
      if (v_left_initial = v_pair[1] and v_right_initial = v_pair[2])
         or (v_left_initial = v_pair[2] and v_right_initial = v_pair[1]) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$function$;

create or replace function private.dwss_pinyin_keys_near(p_left text, p_right text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  v_left text[];
  v_right text[];
  v_len integer;
  v_i integer;
  v_different integer := 0;
begin
  if lower(regexp_replace(btrim(p_left), '\s+', ' ', 'g')) =
     lower(regexp_replace(btrim(p_right), '\s+', ' ', 'g')) then
    return true;
  end if;
  v_left := pg_catalog.string_to_array(lower(regexp_replace(btrim(p_left), '\s+', ' ', 'g')), ' ');
  v_right := pg_catalog.string_to_array(lower(regexp_replace(btrim(p_right), '\s+', ' ', 'g')), ' ');
  if pg_catalog.cardinality(v_left) = 0
     or pg_catalog.cardinality(v_left) <> pg_catalog.cardinality(v_right)
     or pg_catalog.cardinality(v_left) > 40 then
    return false;
  end if;
  v_len := pg_catalog.cardinality(v_left);
  for v_i in 1..v_len loop
    if v_left[v_i] = v_right[v_i] then continue; end if;
    if not private.dwss_pinyin_syllable_near(v_left[v_i], v_right[v_i]) then return false; end if;
    v_different := v_different + 1;
    if v_different > 1 then return false; end if;
  end loop;
  return v_different = 1;
end;
$function$;

create or replace function public.dwss_resolve_pronunciation_variant(
  p_client_submit_id uuid,
  p_chinese_text text,
  p_pronunciation_cn text,
  p_pinyin_key text,
  p_dialect text,
  p_source_note text,
  p_source_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_normalized text;
  v_pinyin text;
  v_row public.shared_pronunciation_variants%rowtype;
  v_found boolean := false;
  v_exact boolean := false;
  v_aliases text[];
  v_submission_ids uuid[];
begin
  if p_source_kind not in ('dictionary','translation') then
    raise exception 'INVALID_SOURCE_KIND' using errcode = '22023';
  end if;
  if p_client_submit_id is null then
    raise exception 'INVALID_SUBMIT_ID' using errcode = '22023';
  end if;
  v_normalized := public.dwss_normalize_chinese(p_chinese_text);
  v_pinyin := lower(regexp_replace(btrim(p_pinyin_key), '\s+', ' ', 'g'));
  if v_normalized = '' or v_pinyin = '' then
    raise exception 'INVALID_PRONUNCIATION' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_normalized || ':' || p_source_kind, 0)
  );
  select * into v_row
  from public.shared_pronunciation_variants
  where client_submit_id = p_client_submit_id
     or p_client_submit_id = any(source_submission_ids)
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'duplicate', true, 'merged', false, 'variant', pg_catalog.to_jsonb(v_row)
    );
  end if;
  select * into v_row
  from public.shared_pronunciation_variants
  where normalized_chinese = v_normalized
    and source_kind = p_source_kind
    and p_pinyin_key is not null
    and (pinyin_key = v_pinyin or private.dwss_pinyin_keys_near(pinyin_key, v_pinyin))
  order by case when pinyin_key = v_pinyin then 0 else 1 end, created_at asc
  limit 1
  for update;
  v_found := found;
  if v_found then
    v_exact := coalesce(v_row.pinyin_key = v_pinyin, false);
    v_aliases := coalesce(v_row.pronunciation_aliases, array[]::text[]);
    if p_pronunciation_cn <> v_row.pronunciation_cn
       and not (p_pronunciation_cn = any(v_aliases)) then
      if cardinality(v_aliases) >= 20 then
        raise exception 'TOO_MANY_PRONUNCIATION_ALIASES' using errcode = '22023';
      end if;
      v_aliases := pg_catalog.array_append(v_aliases, p_pronunciation_cn);
    end if;
    v_submission_ids := coalesce(v_row.source_submission_ids, array[]::uuid[]);
    if not (p_client_submit_id = any(v_submission_ids)) then
      v_submission_ids := pg_catalog.array_append(v_submission_ids, p_client_submit_id);
    end if;
    update public.shared_pronunciation_variants
    set pronunciation_aliases = v_aliases,
        source_submission_ids = v_submission_ids,
        status = case when status = 'rejected' then 'pending' else status end,
        reviewed_at = case when status = 'rejected' then null else reviewed_at end,
        reviewed_by = case when status = 'rejected' then null else reviewed_by end,
        review_note = case when status = 'rejected' then '收到新的同音/近音提交，重新加入候选' else review_note end,
        revision = revision + 1
    where id = v_row.id
    returning * into v_row;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'duplicate', v_exact, 'merged', not v_exact,
      'variant', pg_catalog.to_jsonb(v_row)
    );
  end if;
  insert into public.shared_pronunciation_variants (
    client_submit_id, chinese_text, normalized_chinese, pronunciation_cn,
    normalized_pronunciation, pinyin_key, dialect, source_note, status,
    source_kind, contributor_id, reviewed_at, reviewed_by, review_note,
    revision, pronunciation_aliases, source_submission_ids
  )
  values (
    p_client_submit_id, btrim(p_chinese_text), v_normalized, btrim(p_pronunciation_cn),
    public.dwss_normalize_chinese(p_pronunciation_cn), v_pinyin,
    coalesce(nullif(btrim(p_dialect),''),'加丹加斯瓦希里语（科卢韦齐）'),
    nullif(btrim(p_source_note),''), 'pending', p_source_kind, null,
    null, null, null, 1, array[]::text[], array[p_client_submit_id]
  )
  returning * into v_row;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'duplicate', false, 'merged', false, 'variant', pg_catalog.to_jsonb(v_row)
  );
end;
$function$;

create or replace function public.dwss_update_pronunciation_variant(
  p_id uuid,
  p_expected_revision bigint,
  p_pronunciation_cn text,
  p_pinyin_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current public.shared_pronunciation_variants%rowtype;
  v_target public.shared_pronunciation_variants%rowtype;
  v_normalized text;
  v_pinyin text;
  v_aliases text[];
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_REVISION' using errcode = '22023';
  end if;
  if p_pronunciation_cn is null or btrim(p_pronunciation_cn) = ''
     or length(p_pronunciation_cn) > 2000 or p_pronunciation_cn ~ '[[:cntrl:]]' then
    raise exception 'INVALID_READING' using errcode = '22023';
  end if;
  v_pinyin := lower(regexp_replace(btrim(p_pinyin_key), '\s+', ' ', 'g'));
  if v_pinyin = '' or length(v_pinyin) > 16000
     or v_pinyin !~ '^[a-züv]+( [a-züv]+)*$' then
    raise exception 'INVALID_PINYIN' using errcode = '22023';
  end if;
  select * into v_current from public.shared_pronunciation_variants where id = p_id;
  if not found then raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_normalized := v_current.normalized_chinese;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_normalized || ':' || v_current.source_kind, 0)
  );
  select * into v_current from public.shared_pronunciation_variants where id = p_id for update;
  if v_current.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = '40001';
  end if;
  select * into v_target
  from public.shared_pronunciation_variants
  where normalized_chinese = v_current.normalized_chinese
    and source_kind = v_current.source_kind
    and id <> p_id
    and status <> 'rejected'
    and (pinyin_key = v_pinyin or private.dwss_pinyin_keys_near(pinyin_key, v_pinyin))
  order by case when pinyin_key = v_pinyin then 0 else 1 end, created_at asc
  limit 1
  for update;
  if found then
    v_aliases := coalesce(v_target.pronunciation_aliases, array[]::text[]);
    if p_pronunciation_cn <> v_target.pronunciation_cn
       and not (p_pronunciation_cn = any(v_aliases)) then
      if cardinality(v_aliases) >= 20 then
        raise exception 'TOO_MANY_PRONUNCIATION_ALIASES' using errcode = '22023';
      end if;
      v_aliases := pg_catalog.array_append(v_aliases, p_pronunciation_cn);
    end if;
    update public.shared_pronunciation_variants
    set pronunciation_aliases = v_aliases, revision = revision + 1
    where id = v_target.id returning * into v_target;
    update public.shared_pronunciation_variants
    set status = 'rejected', reviewed_at = null, reviewed_by = null,
        review_note = '这条修改已合并到同音/近音读音组', revision = revision + 1
    where id = p_id returning * into v_current;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'merged', true, 'variant', pg_catalog.to_jsonb(v_target),
      'retired_variant_id', p_id, 'revision', v_target.revision
    );
  end if;
  v_aliases := coalesce(v_current.pronunciation_aliases, array[]::text[]);
  v_aliases := array_remove(v_aliases, v_current.pronunciation_cn);
  v_aliases := array_remove(v_aliases, p_pronunciation_cn);
  update public.shared_pronunciation_variants
  set pronunciation_cn = btrim(p_pronunciation_cn), pinyin_key = v_pinyin,
      pronunciation_aliases = v_aliases, status = 'pending',
      reviewed_at = null, reviewed_by = null,
      review_note = '读音已修正，等待再次核实', revision = revision + 1
  where id = p_id returning * into v_current;
  return pg_catalog.jsonb_build_object('ok', true, 'merged', false, 'variant', pg_catalog.to_jsonb(v_current));
end;
$function$;

revoke all on function private.dwss_pinyin_syllable_near(text,text) from public, anon, authenticated;
revoke all on function private.dwss_pinyin_keys_near(text,text) from public, anon, authenticated;
revoke all on function public.dwss_resolve_pronunciation_variant(uuid,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.dwss_update_pronunciation_variant(uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.dwss_resolve_pronunciation_variant(uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.dwss_update_pronunciation_variant(uuid,bigint,text,text) to service_role;

update public.shared_pronunciation_variants
set source_kind = 'dictionary', revision = revision + 1
where normalized_chinese in (
  public.dwss_normalize_chinese('打开'),
  public.dwss_normalize_chinese('钥匙')
)
and source_kind = 'translation';

notify pgrst, 'reload schema';
