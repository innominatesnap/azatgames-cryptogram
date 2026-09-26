-- Invite code visible to hosts only.
-- apply after merge, as postgres, one session. Never supabase db push. Do not re-apply older files.
--
-- Apply after 20260926160000_cryptogram_hint_catalog.sql.
-- Do not depend on 20260926180000_cryptogram_host_succession.sql (PR-CGM-8).
-- Target project: kfbgjpqgywenkfkfcoqf. A human applies this. The app does not.
--
-- Members can no longer SELECT cryptogram.households.invite_code. The only read
-- path is cryptogram.household_invite_code(uuid), and only for the current host.
-- Host means household_members.role = 'host'. This file does not call
-- member_can_host or require_household_host. If households.frozen_at exists
-- when the RPC runs, a frozen household is refused with the same generic error.
--
-- Least disruptive mechanism: keep the households table and its RLS policy.
-- Revoke table-level SELECT from anon, authenticated, and public, then grant
-- SELECT on every current column except invite_code to authenticated.
-- Table-level SELECT is what made select * include invite_code. Column
-- privileges do not. PostgreSQL rejects SELECT * (and PostgREST's default
-- select=*) unless the role can read every column, so a client must list
-- id, name, and created_at. A view would be a second object the client has
-- to switch to. A secrets table would move the column and rewrite
-- create_household and join_household. Neither is needed: no client reads
-- households today.
--
-- household_invite_code is not granted to authenticated. There is no household
-- UI yet, so a future UI has to make that grant itself. The simulation below
-- grants EXECUTE only inside a transaction that rolls back.
--
-- Live lockdown, applied 9:24 AM MT 2026-09-26: EXECUTE on
-- cryptogram.create_household(text), cryptogram.join_household(text), and
-- cryptogram.leave_household(uuid) is revoked from authenticated, anon, and
-- PUBLIC. This file re-states those revokes. It does not grant them.
-- is_household_member stays executable by authenticated because the RLS
-- select policies call it.
--
-- Audit of functions that touch invite_code:
--   create_household returns inviteCode only to the caller it just inserted
--   as host. It is not granted to browser roles.
--   join_household looks up a code the caller already typed and returns id
--   and name only. It does not return the code.
-- No other function returns invite_code.

-- ---------------------------------------------------------------------------
-- 1. Apply
-- ---------------------------------------------------------------------------

begin;

create or replace function cryptogram.household_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_code text;
  v_host boolean;
  v_has_frozen boolean;
  v_frozen boolean;
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;

  select exists (
    select 1
    from cryptogram.household_members m
    where m.household_id = p_household_id
      and m.user_id = auth.uid()
      and m.role = 'host'
  )
  into v_host;

  if not coalesce(v_host, false) then
    raise exception 'not allowed';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'cryptogram'
      and c.relname = 'households'
      and a.attname = 'frozen_at'
      and a.attnum > 0
      and not a.attisdropped
  )
  into v_has_frozen;

  if coalesce(v_has_frozen, false) then
    execute
      'select h.frozen_at is not null from cryptogram.households h where h.id = $1'
      into v_frozen
      using p_household_id;
    if coalesce(v_frozen, false) then
      raise exception 'not allowed';
    end if;
  end if;

  select h.invite_code
  into v_code
  from cryptogram.households h
  where h.id = p_household_id;

  if v_code is null then
    raise exception 'not allowed';
  end if;

  return v_code;
end;
$fn$;

comment on function cryptogram.household_invite_code(uuid) is
  'Invite code for the current host when the household is not frozen. Not granted to authenticated until a household UI calls it.';

-- create or replace keeps an earlier EXECUTE grant. Revoke after replace.
revoke all on function cryptogram.household_invite_code(uuid) from public, anon, authenticated;

-- Live lockdown. create or replace is not used on these three here, but a
-- re-apply of this file must not be the thing that opens them again.
revoke execute on function cryptogram.create_household(text) from public, anon, authenticated;
revoke execute on function cryptogram.join_household(text) from public, anon, authenticated;
revoke execute on function cryptogram.leave_household(uuid) from public, anon, authenticated;

-- RLS policy households_select_member calls this. Do not revoke it.
grant execute on function cryptogram.is_household_member(uuid) to authenticated;

revoke select on table cryptogram.households from public, anon, authenticated;

do $grant$
declare
  v_cols text;
begin
  select pg_catalog.string_agg(pg_catalog.format('%I', a.attname), ', ' order by a.attnum)
  into v_cols
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'cryptogram'
    and c.relname = 'households'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname <> 'invite_code';

  if v_cols is null or v_cols = '' then
    raise exception 'households has no columns to grant';
  end if;

  execute format(
    'grant select (%s) on table cryptogram.households to authenticated',
    v_cols
  );
end;
$grant$;

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Rollback (do not run as part of apply). Restores the previous table-level
-- SELECT on cryptogram.households, which includes invite_code, and drops the
-- host-only RPC. Does not grant create_household, join_household, or
-- leave_household. Those stay revoked to match the live lockdown.
-- ---------------------------------------------------------------------------
-- begin;
-- revoke all on table cryptogram.households from authenticated;
-- grant select on table cryptogram.households to authenticated;
-- drop function if exists cryptogram.household_invite_code(uuid);
-- commit;

-- ---------------------------------------------------------------------------
-- 2. Read-only verify
-- ---------------------------------------------------------------------------

-- PASS: invite_code is false. Every other column is true.
select
  a.attname,
  has_column_privilege('authenticated', 'cryptogram.households', a.attname, 'SELECT') as authenticated_select
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'cryptogram'
  and c.relname = 'households'
  and a.attnum > 0
  and not a.attisdropped
order by a.attnum;

-- PASS: false. Column grants are not a table-level SELECT.
select has_table_privilege('authenticated', 'cryptogram.households', 'SELECT') as authenticated_table_select;

-- PASS: anon_execute false, public_execute false.
-- authenticated_execute is also false until a future UI grant.
select
  has_function_privilege('anon', 'cryptogram.household_invite_code(uuid)', 'EXECUTE') as anon_execute,
  has_function_privilege('public', 'cryptogram.household_invite_code(uuid)', 'EXECUTE') as public_execute,
  has_function_privilege('authenticated', 'cryptogram.household_invite_code(uuid)', 'EXECUTE') as authenticated_execute;

-- PASS: proconfig contains search_path="". prosecdef is true.
select
  p.prosecdef,
  p.proconfig
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'cryptogram'
  and p.proname = 'household_invite_code';

-- PASS: create/join/leave false for anon, authenticated, and public.
-- is_household_member true for authenticated only.
select
  has_function_privilege('anon', 'cryptogram.create_household(text)', 'EXECUTE') as create_anon,
  has_function_privilege('authenticated', 'cryptogram.create_household(text)', 'EXECUTE') as create_authenticated,
  has_function_privilege('public', 'cryptogram.create_household(text)', 'EXECUTE') as create_public,
  has_function_privilege('anon', 'cryptogram.join_household(text)', 'EXECUTE') as join_anon,
  has_function_privilege('authenticated', 'cryptogram.join_household(text)', 'EXECUTE') as join_authenticated,
  has_function_privilege('public', 'cryptogram.join_household(text)', 'EXECUTE') as join_public,
  has_function_privilege('anon', 'cryptogram.leave_household(uuid)', 'EXECUTE') as leave_anon,
  has_function_privilege('authenticated', 'cryptogram.leave_household(uuid)', 'EXECUTE') as leave_authenticated,
  has_function_privilege('public', 'cryptogram.leave_household(uuid)', 'EXECUTE') as leave_public,
  has_function_privilege('anon', 'cryptogram.is_household_member(uuid)', 'EXECUTE') as member_fn_anon,
  has_function_privilege('authenticated', 'cryptogram.is_household_member(uuid)', 'EXECUTE') as member_fn_authenticated,
  has_function_privilege('public', 'cryptogram.is_household_member(uuid)', 'EXECUTE') as member_fn_public;

do $verify$
declare
  v_bad text;
begin
  if has_column_privilege('authenticated', 'cryptogram.households', 'invite_code', 'SELECT') then
    raise exception 'VERIFY FAIL authenticated can select invite_code';
  end if;

  select pg_catalog.string_agg(a.attname, ', ' order by a.attnum)
  into v_bad
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'cryptogram'
    and c.relname = 'households'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname <> 'invite_code'
    and not has_column_privilege('authenticated', 'cryptogram.households', a.attname, 'SELECT');

  if v_bad is not null then
    raise exception 'VERIFY FAIL authenticated cannot select %', v_bad;
  end if;

  if has_column_privilege('anon', 'cryptogram.households', 'invite_code', 'SELECT')
     or has_column_privilege('anon', 'cryptogram.households', 'id', 'SELECT') then
    raise exception 'VERIFY FAIL anon can select households';
  end if;

  if has_function_privilege('anon', 'cryptogram.household_invite_code(uuid)', 'EXECUTE')
     or has_function_privilege('public', 'cryptogram.household_invite_code(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'cryptogram.household_invite_code(uuid)', 'EXECUTE') then
    raise exception 'VERIFY FAIL household_invite_code is executable by a browser role';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cryptogram'
      and p.proname = 'household_invite_code'
      and p.prosecdef
      and p.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'VERIFY FAIL proconfig must contain search_path=""';
  end if;

  if has_function_privilege('authenticated', 'cryptogram.create_household(text)', 'EXECUTE')
     or has_function_privilege('anon', 'cryptogram.create_household(text)', 'EXECUTE')
     or has_function_privilege('public', 'cryptogram.create_household(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'cryptogram.join_household(text)', 'EXECUTE')
     or has_function_privilege('anon', 'cryptogram.join_household(text)', 'EXECUTE')
     or has_function_privilege('public', 'cryptogram.join_household(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'cryptogram.leave_household(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'cryptogram.leave_household(uuid)', 'EXECUTE')
     or has_function_privilege('public', 'cryptogram.leave_household(uuid)', 'EXECUTE') then
    raise exception 'VERIFY FAIL household RPC lockdown is open';
  end if;

  if not has_function_privilege('authenticated', 'cryptogram.is_household_member(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'cryptogram.is_household_member(uuid)', 'EXECUTE')
     or has_function_privilege('public', 'cryptogram.is_household_member(uuid)', 'EXECUTE') then
    raise exception 'VERIFY FAIL is_household_member grant';
  end if;
end;
$verify$;

-- ---------------------------------------------------------------------------
-- 3. Simulation. Inserts auth users and one household, then rolls back.
-- Run as postgres. set local role authenticated plus request.jwt.claims.
-- Requires auth.uid() (present on the live project).
-- The begin/rollback below does not undo the committed migration.
-- EXECUTE on household_invite_code is granted only inside this transaction.
-- Every text[] append is cast ::text.
-- ---------------------------------------------------------------------------

begin;

create or replace function pg_temp.seed_auth_user(p_email text)
returns uuid
language plpgsql
as $seed$
declare
  v_id uuid := gen_random_uuid();
  v_cols text[] := array[quote_ident('id')]::text[];
  v_vals text[] := array[quote_literal(v_id::text)]::text[];
  col record;
begin
  for col in
    select
      c.column_name,
      c.data_type,
      c.udt_name,
      c.is_nullable,
      c.column_default,
      c.is_generated,
      c.is_identity
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
    order by c.ordinal_position
  loop
    if coalesce(col.is_generated, 'NEVER') = 'ALWAYS' or coalesce(col.is_identity, 'NO') = 'YES' then
      continue;
    end if;
    if col.column_name = 'id' then
      continue;
    elsif col.column_name = 'email' then
      v_cols := v_cols || quote_ident('email')::text;
      v_vals := v_vals || quote_literal(p_email)::text;
    elsif col.column_name = 'is_anonymous' then
      v_cols := v_cols || quote_ident('is_anonymous')::text;
      v_vals := v_vals || 'false'::text;
    elsif col.column_name = 'aud' then
      v_cols := v_cols || quote_ident('aud')::text;
      v_vals := v_vals || quote_literal('authenticated')::text;
    elsif col.column_name = 'role' then
      v_cols := v_cols || quote_ident('role')::text;
      v_vals := v_vals || quote_literal('authenticated')::text;
    elsif col.is_nullable = 'YES' or col.column_default is not null then
      continue;
    elsif col.data_type in ('character varying', 'text', 'character')
       or col.udt_name in ('varchar', 'text', 'citext', 'bpchar') then
      v_cols := v_cols || quote_ident(col.column_name)::text;
      v_vals := v_vals || quote_literal('')::text;
    elsif col.data_type = 'boolean' then
      v_cols := v_cols || quote_ident(col.column_name)::text;
      v_vals := v_vals || 'false'::text;
    elsif col.data_type = 'uuid' then
      v_cols := v_cols || quote_ident(col.column_name)::text;
      v_vals := v_vals || quote_literal(gen_random_uuid()::text)::text;
    elsif col.data_type in ('json', 'jsonb') then
      v_cols := v_cols || quote_ident(col.column_name)::text;
      v_vals := v_vals || (quote_literal('{}') || '::' || col.data_type)::text;
    elsif col.data_type in ('smallint', 'integer', 'bigint', 'numeric') then
      v_cols := v_cols || quote_ident(col.column_name)::text;
      v_vals := v_vals || '0'::text;
    elsif col.data_type like 'timestamp%' then
      v_cols := v_cols || quote_ident(col.column_name)::text;
      v_vals := v_vals || 'now()'::text;
    else
      raise exception 'seed_auth_user: unsupported required column % (%)', col.column_name, col.data_type;
    end if;
  end loop;

  execute format(
    'insert into auth.users (%s) values (%s)',
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', ')
  );
  return v_id;
end;
$seed$;

do $sim$
declare
  v_host uuid;
  v_member uuid;
  v_hid uuid;
  v_code text;
  v_id uuid;
  v_name text;
  v_created timestamptz;
  v_refused boolean;
  v_row cryptogram.households%rowtype;
begin
  v_host := pg_temp.seed_auth_user('cgm-invite-host@example.test');
  v_member := pg_temp.seed_auth_user('cgm-invite-member@example.test');

  insert into cryptogram.households (name, invite_code)
  values ('Host only proof', 'HOSTONLY1')
  returning id into v_hid;

  insert into cryptogram.household_members (household_id, user_id, role)
  values
    (v_hid, v_host, 'host'),
    (v_hid, v_member, 'member');

  -- Proof only. Rolled back with this transaction. The apply above does not
  -- grant this function to authenticated.
  grant execute on function cryptogram.household_invite_code(uuid) to authenticated;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  execute 'set local role authenticated';

  v_refused := false;
  begin
    perform h.invite_code from cryptogram.households h where h.id = v_hid;
  exception
    when insufficient_privilege then
      v_refused := true;
  end;
  if not v_refused then
    raise exception 'member select of invite_code was not refused';
  end if;

  v_refused := false;
  begin
    select h.* into v_row from cryptogram.households h where h.id = v_hid;
  exception
    when insufficient_privilege then
      v_refused := true;
  end;
  if not v_refused then
    raise exception 'member select * was not refused';
  end if;

  select h.id, h.name, h.created_at
  into v_id, v_name, v_created
  from cryptogram.households h
  where h.id = v_hid;

  if v_id is distinct from v_hid or v_name is distinct from 'Host only proof' or v_created is null then
    raise exception 'member select of other columns failed';
  end if;

  v_refused := false;
  begin
    perform cryptogram.household_invite_code(v_hid);
  exception
    when raise_exception then
      if sqlerrm <> 'not allowed' then
        raise;
      end if;
      v_refused := true;
  end;
  if not v_refused then
    raise exception 'non-host RPC call was not refused';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_host, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_host::text, true);

  v_refused := false;
  begin
    perform h.invite_code from cryptogram.households h where h.id = v_hid;
  exception
    when insufficient_privilege then
      v_refused := true;
  end;
  if not v_refused then
    raise exception 'host select of invite_code was not refused';
  end if;

  v_code := cryptogram.household_invite_code(v_hid);
  if v_code is distinct from 'HOSTONLY1' then
    raise exception 'host RPC returned an unexpected code';
  end if;

  execute 'reset role';

  alter table cryptogram.households add column frozen_at timestamptz;
  update cryptogram.households set frozen_at = pg_catalog.now() where id = v_hid;

  execute 'set local role authenticated';
  v_refused := false;
  begin
    perform cryptogram.household_invite_code(v_hid);
  exception
    when raise_exception then
      if sqlerrm <> 'not allowed' then
        raise;
      end if;
      v_refused := true;
  end;
  if not v_refused then
    raise exception 'frozen household was not refused';
  end if;

  execute 'reset role';
  update cryptogram.households set frozen_at = null where id = v_hid;
  execute 'set local role authenticated';

  v_code := cryptogram.household_invite_code(v_hid);
  if v_code is distinct from 'HOSTONLY1' then
    raise exception 'unfrozen host RPC returned an unexpected code';
  end if;

  execute 'reset role';
  alter table cryptogram.households drop column frozen_at;

  raise notice 'VERIFY PASS invite code host only';
end;
$sim$;

rollback;
