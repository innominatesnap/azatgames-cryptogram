-- CryptoGram adapter for the minigame core (AZGB-108).
-- Apply after 20260926190000_cryptogram_invite_code_host_only.sql. Do not edit
-- earlier files.
-- Target project: kfbgjpqgywenkfkfcoqf. A human applies this. The app does not.
--
-- Applied by hand as postgres in one psql/SQL-editor session.
-- Do not run supabase db push. Idempotent: create or replace.
--
-- Scope: adds two helpers for the core.mg_cryptogram_race_* game module
-- (azatgames-core / azattechpoker, vault #106, after vault #107's Letters
-- adapter and the cryptogram_race game module land) to call:
--   cryptogram.race_pick_quote(exclude_recent_days int default 7,
--                               exclude_quote_ids uuid[] default '{}')
--     returns table (quote_id uuid, plain_text text, code_key jsonb, coded jsonb)
--   cryptogram.check_mapping(code_key jsonb, mapping jsonb) returns boolean
-- No change to the daily game's tables, policies, functions, RLS, or grants.
-- Neither helper writes to cryptogram.puzzles or cryptogram.attempts: the
-- race's round state (the quote picked, the code_key, and each player's
-- mapping-in-progress) lives entirely in core.mg_rounds / core.mg_player_state
-- (core-spec.md section 4), never in a cryptogram table. Both helpers are
-- unreachable by anon, authenticated, and service_role: only `postgres` (the
-- owner of the core SECURITY DEFINER functions that call them, core-spec.md
-- section 0 and section 11 -- "owner postgres") can execute them.
-- search_path = '', schema-qualified pg_catalog calls (this file's own
-- convention, see 20260926180000_cryptogram_host_succession.sql). coalesce
-- is SQL syntax, not a pg_catalog function, so it stays unqualified.
--
-- race_pick_quote reuses cryptogram.encode_plain (unchanged) to build `coded`
-- and generates a fresh code_key with the same Fisher-Yates shuffle
-- cryptogram.assign_daily_puzzle already uses -- duplicated here, not
-- factored out, so this file cannot change assign_daily_puzzle's behavior.
-- It never persists a cryptogram.puzzles row (that table's unique
-- puzzle_date is the *daily* game's one-puzzle-per-calendar-day invariant;
-- a race can run many rounds in one day, so its quote picks cannot live
-- there). Its "no daily spoiler" rule excludes quotes used as the
-- *community daily* puzzle's quote_id in the trailing exclude_recent_days
-- days (inclusive of today, via cryptogram.puzzles). Repeats across the
-- rounds of a single race event are the caller's job: pass the quote_ids
-- already used this event in exclude_quote_ids (core holds that list in
-- its own round history; cryptogram has nothing to track it in).
--
-- check_mapping's design choice, spelled out because the Issue's two-arg
-- signature does not by itself say what "solved" means: code_key always
-- has all 26 letters (cryptogram.assign_daily_puzzle builds a full A-Z
-- key regardless of which letters a quote actually uses), but a short quote
-- never uses all 26, and the client only ever shows tiles for the numbers
-- that appear in `coded`. So check_mapping cannot require a full 26-entry
-- mapping -- most quotes could never be "solved". Instead it is a pure
-- no-wrong-guesses-yet oracle, the same check cryptogram.grade_mapping
-- already does against plain_text: for every number the caller's `mapping`
-- has an entry for, that entry must be the correct letter; a number with no
-- entry yet does not fail the check. The core move handler (which holds
-- `coded` in its own round secret and therefore knows which numbers are
-- active for this quote) decides "solved" by requiring every active number
-- to have an entry in `mapping` *and* check_mapping to return true for it --
-- the same two-step split cryptogram.confirm_solve makes today (grade first,
-- then decide finished), just with the finished-check moved to the caller
-- because this function is never told which numbers are active.

begin;

create or replace function cryptogram.race_pick_quote(
  exclude_recent_days integer default 7,
  exclude_quote_ids uuid[] default '{}'
)
returns table (
  quote_id uuid,
  plain_text text,
  code_key jsonb,
  coded jsonb
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today    date := cryptogram.denver_today();
  v_quote_id uuid;
  v_plain    text;
  v_letters  text[] := array['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  v_numbers  int[] := array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];
  v_key      jsonb := '{}'::jsonb;
  v_coded    jsonb;
  i          int;
  j          int;
  v_tmp      int;
begin
  if exclude_recent_days is null or exclude_recent_days < 0 or exclude_recent_days > 3660 then
    raise exception 'cryptogram.race_pick_quote: exclude_recent_days must be between 0 and 3660 (got %)', exclude_recent_days;
  end if;

  select q.id, q.plain_text
  into v_quote_id, v_plain
  from cryptogram.quotes q
  where q.public_domain
    and not (q.id = any (coalesce(exclude_quote_ids, '{}'::uuid[])))
    and not exists (
      select 1
      from cryptogram.puzzles p
      where p.quote_id = q.id
        and p.puzzle_date >= v_today - exclude_recent_days
        and p.puzzle_date <= v_today
    )
  order by pg_catalog.random()
  limit 1;

  if v_quote_id is null then
    raise exception 'cryptogram.race_pick_quote: no eligible public-domain quote (exclude_recent_days=%, excluded=%)',
      exclude_recent_days, exclude_quote_ids;
  end if;

  -- Fisher-Yates, same algorithm as cryptogram.assign_daily_puzzle.
  i := 26;
  while i > 1 loop
    j := 1 + pg_catalog.floor(pg_catalog.random() * i)::int;
    v_tmp := v_numbers[i];
    v_numbers[i] := v_numbers[j];
    v_numbers[j] := v_tmp;
    i := i - 1;
  end loop;
  i := 1;
  while i <= 26 loop
    v_key := v_key || pg_catalog.jsonb_build_object(v_letters[i], v_numbers[i]);
    i := i + 1;
  end loop;

  v_coded := cryptogram.encode_plain(v_plain, v_key);

  return query select v_quote_id, v_plain, v_key, v_coded;
end;
$fn$;

revoke all on function cryptogram.race_pick_quote(integer, uuid[]) from public, anon, authenticated, service_role;
grant execute on function cryptogram.race_pick_quote(integer, uuid[]) to postgres;

create or replace function cryptogram.check_mapping(p_code_key jsonb, p_mapping jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  pair record;
begin
  if p_code_key is null or pg_catalog.jsonb_typeof(p_code_key) <> 'object' then
    raise exception 'cryptogram.check_mapping: code_key must be a JSON object';
  end if;
  if p_mapping is null or pg_catalog.jsonb_typeof(p_mapping) <> 'object' then
    return false;
  end if;

  for pair in
    select t.key as letter, t.value as number
    from pg_catalog.jsonb_each_text(p_code_key) as t(key, value)
  loop
    if p_mapping ? pair.number
       and pg_catalog.upper(coalesce(p_mapping ->> pair.number, '')) is distinct from pair.letter then
      return false;
    end if;
  end loop;

  return true;
end;
$fn$;

revoke all on function cryptogram.check_mapping(jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function cryptogram.check_mapping(jsonb, jsonb) to postgres;

commit;

notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Verify (read-only). Pass conditions are in the comments.
-- -----------------------------------------------------------------------------

-- Both helpers exist, security definer, with search_path = "".
-- PASS: two rows, prosecdef true, proconfig {"search_path=\"\""}.
select
  p.proname,
  p.prosecdef,
  p.proconfig,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'cryptogram'
  and p.proname in ('race_pick_quote', 'check_mapping')
order by p.proname;

-- Only postgres can execute either. PASS: every anon_/authenticated_/
-- public_/service_role_ column false, postgres_ column true, on both rows.
select
  p.proname,
  has_function_privilege('anon', p.oid, 'execute') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
  has_function_privilege('public', p.oid, 'execute') as public_exec,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_exec,
  has_function_privilege('postgres', p.oid, 'execute') as postgres_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'cryptogram'
  and p.proname in ('race_pick_quote', 'check_mapping')
order by p.proname;

-- -----------------------------------------------------------------------------
-- Simulation. Reads real cryptogram.quotes, writes one cryptogram.puzzles row
-- for today, then rolls back. Run this as postgres. The begin/rollback below
-- does not undo the committed migration above.
-- -----------------------------------------------------------------------------

begin;

do $verify$
declare
  v_today     date := cryptogram.denver_today();
  v_excl_id   uuid;
  v_daily_id  uuid;
  v_daily_plain text;
  v_stats     record;
  v_picked    record;
  v_all_ids   uuid[];
  i           int;
begin
  -- check_mapping.
  if not cryptogram.check_mapping('{"A":1,"B":2,"C":3}'::jsonb, '{}'::jsonb) then
    raise exception 'FAIL: check_mapping treated an empty guess as a mistake';
  end if;
  if not cryptogram.check_mapping('{"A":1,"B":2,"C":3}'::jsonb, '{"1":"A","2":"B"}'::jsonb) then
    raise exception 'FAIL: check_mapping rejected a correct partial guess';
  end if;
  if not cryptogram.check_mapping('{"A":1,"B":2,"C":3}'::jsonb, '{"1":"a","2":"B","3":"C"}'::jsonb) then
    raise exception 'FAIL: check_mapping is not case-insensitive';
  end if;
  if cryptogram.check_mapping('{"A":1,"B":2,"C":3}'::jsonb, '{"1":"B"}'::jsonb) then
    raise exception 'FAIL: check_mapping accepted a wrong letter';
  end if;
  if cryptogram.check_mapping('{"A":1,"B":2,"C":3}'::jsonb, '{"1":"A","2":"Z","3":"C"}'::jsonb) then
    raise exception 'FAIL: check_mapping accepted one wrong entry among otherwise-correct ones';
  end if;

  -- race_pick_quote: shape, and consistency with cryptogram.encode_plain.
  for i in 1..5 loop
    select * into v_picked from cryptogram.race_pick_quote(7, '{}');
    if v_picked.quote_id is null then
      raise exception 'FAIL: race_pick_quote returned no row';
    end if;
    if v_picked.plain_text is distinct from (
      select q.plain_text from cryptogram.quotes q where q.id = v_picked.quote_id
    ) then
      raise exception 'FAIL: race_pick_quote plain_text did not match its quote_id';
    end if;
    if v_picked.coded <> cryptogram.encode_plain(v_picked.plain_text, v_picked.code_key) then
      raise exception 'FAIL: race_pick_quote coded did not match encode_plain(plain_text, code_key)';
    end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(v_picked.code_key)) <> 26 then
      raise exception 'FAIL: race_pick_quote code_key did not cover all 26 letters';
    end if;
    if (select count(distinct value) from pg_catalog.jsonb_each_text(v_picked.code_key)) <> 26 then
      raise exception 'FAIL: race_pick_quote code_key numbers were not a bijection';
    end if;
  end loop;

  -- exclude_quote_ids: the caller's exclusion list is always honored.
  select q.id into v_excl_id from cryptogram.quotes q where q.sort_order = 1;
  for i in 1..10 loop
    select * into v_picked from cryptogram.race_pick_quote(7, array[v_excl_id]);
    if v_picked.quote_id = v_excl_id then
      raise exception 'FAIL: race_pick_quote returned an explicitly excluded quote_id';
    end if;
  end loop;

  -- Spoiler guard: a quote used by today's community daily puzzle is excluded.
  select q.id, q.plain_text into v_daily_id, v_daily_plain
  from cryptogram.quotes q where q.sort_order = 2;
  select * into v_stats from cryptogram.plain_stats(v_daily_plain);
  insert into cryptogram.puzzles (
    quote_id, puzzle_date, code_key, coded, unique_letter_count, letter_count, longest_word
  )
  values (
    v_daily_id, v_today, '{}'::jsonb, '{"words":[]}'::jsonb,
    v_stats.unique_letter_count, v_stats.letter_count, v_stats.longest_word
  )
  on conflict (puzzle_date) do update set quote_id = excluded.quote_id;

  for i in 1..10 loop
    select * into v_picked from cryptogram.race_pick_quote(7, '{}');
    if v_picked.quote_id = v_daily_id then
      raise exception 'FAIL: race_pick_quote served the quote used by today''s daily puzzle';
    end if;
  end loop;

  -- Exhaustion: excluding every quote raises.
  select pg_catalog.array_agg(q.id) into v_all_ids from cryptogram.quotes q;
  begin
    perform cryptogram.race_pick_quote(7, v_all_ids);
    raise exception 'FAIL: race_pick_quote did not raise once every quote was excluded';
  exception
    when others then
      if sqlerrm = 'FAIL: race_pick_quote did not raise once every quote was excluded' then
        raise;
      end if;
  end;

  raise notice 'VERIFY PASS CryptoGram race adapter';
end
$verify$;

rollback;

-- -----------------------------------------------------------------------------
-- Rollback notes. Do not run these as part of apply. Drops only the two
-- functions this file adds. No table, column, row, or grant on any other
-- function is touched.
--
-- begin;
-- drop function if exists cryptogram.check_mapping(jsonb, jsonb);
-- drop function if exists cryptogram.race_pick_quote(integer, uuid[]);
-- commit;
-- notify pgrst, 'reload schema';
-- -----------------------------------------------------------------------------
