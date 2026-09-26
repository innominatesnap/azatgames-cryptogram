-- CryptoGram host succession and household freeze.
-- Apply after 20260926160000_cryptogram_hint_catalog.sql. Do not edit earlier files.
-- Target project: kfbgjpqgywenkfkfcoqf. A human applies this. The app does not.
--
-- Applied by hand as postgres in one psql/SQL-editor session.
-- Do not run supabase db push.
-- Idempotent: create or replace / if not exists.
--
-- Do not re-apply 20260926120000_cryptogram_init.sql after this file.
-- Re-applying it would restore the old leave_household and join_household bodies.
--
-- Today a deleted login cascades the host membership away and leaves the
-- household with no host. leave_household used to promote the oldest other
-- member with no login check. Succession now lives in one place:
-- member_can_host, applied by settle_household_host from the member-delete
-- trigger (leave and login deletion) and from a rejoin.

-- ---------------------------------------------------------------------------
-- 1. Apply
-- ---------------------------------------------------------------------------

begin;

alter table cryptogram.households
  add column if not exists frozen_at timestamptz;

alter table cryptogram.households
  add column if not exists frozen_reason text;

comment on column cryptogram.households.frozen_at is
  'When members remain but none can host. Cleared by settle_household_host once an eligible host is in place. See 20260926180000_cryptogram_host_succession.sql.';

comment on column cryptogram.households.frozen_reason is
  'Why frozen_at is set. no_eligible_host until an eligible member can host. See 20260926180000_cryptogram_host_succession.sql.';

create index if not exists households_frozen_at_idx
  on cryptogram.households (frozen_at)
  where frozen_at is not null;

-- The one host rule. Callers are security definer; this is too, because it
-- reads auth.users. Not granted to clients.
create or replace function cryptogram.member_can_host(p_member cryptogram.household_members)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $fn$
  -- When an is_18_plus flag exists, require it here too.
  -- Do not invent that column and do not query the hub for it.
  -- cryptogram.profiles.age_ack is only 13plus and is NOT an 18+ flag. Do not use it.
  select
    p_member.user_id is not null
    and exists (
      select 1
      from auth.users u
      where u.id = p_member.user_id
        and coalesce(u.is_anonymous, false) = false
    );
$fn$;

-- Loads the membership row and calls the row overload. No second copy of the rule.
create or replace function cryptogram.member_can_host(p_household uuid, p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $fn$
declare
  v_member cryptogram.household_members;
begin
  select m.*
  into v_member
  from cryptogram.household_members m
  where m.household_id = p_household
    and m.user_id = p_user;
  if not found then
    return false;
  end if;
  return cryptogram.member_can_host(v_member);
end;
$fn$;

create or replace function cryptogram.settle_household_host(p_household uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_current uuid;
  v_next uuid;
begin
  -- No members: the delete trigger removes the household. Do not touch it here.
  if not exists (
    select 1
    from cryptogram.household_members m
    where m.household_id = p_household
  ) then
    return;
  end if;

  select m.user_id
  into v_current
  from cryptogram.household_members m
  where m.household_id = p_household
    and m.role = 'host';

  if v_current is not null and cryptogram.member_can_host(p_household, v_current) then
    v_next := v_current;
  else
    select m.user_id
    into v_next
    from cryptogram.household_members m
    where m.household_id = p_household
      and cryptogram.member_can_host(m)
    order by m.joined_at, m.user_id
    limit 1;
  end if;

  if v_next is not null then
    -- household_one_host is a partial unique index. Demote before promote.
    if v_current is distinct from v_next then
      update cryptogram.household_members
      set role = 'member'
      where household_id = p_household
        and role = 'host';
      update cryptogram.household_members
      set role = 'host'
      where household_id = p_household
        and user_id = v_next;
    end if;
    update cryptogram.households
    set frozen_at = null,
        frozen_reason = null
    where id = p_household;
    return;
  end if;

  update cryptogram.household_members
  set role = 'member'
  where household_id = p_household
    and role = 'host';

  update cryptogram.households
  set frozen_at = coalesce(frozen_at, now()),
      frozen_reason = coalesce(frozen_reason, 'no_eligible_host')
  where id = p_household;
end;
$fn$;

-- Records households already being deleted so member cascades do not recurse.
create or replace function cryptogram.note_household_deleting()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  deleting text;
begin
  deleting := coalesce(current_setting('cryptogram.household_deleting', true), '');
  if deleting = '' then
    deleting := ',';
  elsif right(deleting, 1) <> ',' then
    deleting := deleting || ',';
  end if;
  perform set_config(
    'cryptogram.household_deleting',
    deleting || old.id::text || ',',
    true
  );
  return old;
end;
$fn$;

create or replace function cryptogram.handle_deleted_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
begin
  if position(
    ',' || old.household_id::text || ','
    in ',' || coalesce(current_setting('cryptogram.household_deleting', true), '') || ','
  ) > 0 then
    return null;
  end if;

  if not exists (
    select 1
    from cryptogram.households h
    where h.id = old.household_id
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from cryptogram.household_members m
    where m.household_id = old.household_id
  ) then
    delete from cryptogram.households
    where id = old.household_id;
    return null;
  end if;

  perform cryptogram.settle_household_host(old.household_id);
  return null;
end;
$fn$;

drop trigger if exists households_before_delete_note on cryptogram.households;
create trigger households_before_delete_note
  before delete on cryptogram.households
  for each row
  execute function cryptogram.note_household_deleting();

drop trigger if exists household_members_after_delete_host on cryptogram.household_members;
create trigger household_members_after_delete_host
  after delete on cryptogram.household_members
  for each row
  execute function cryptogram.handle_deleted_member();

-- Auth-scoped. Deletes only the caller's row. The trigger settles, freezes, or
-- deletes an empty household. This must not promote a member who fails member_can_host.
create or replace function cryptogram.leave_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  if not exists (
    select 1
    from cryptogram.household_members m
    where m.household_id = p_household
      and m.user_id = uid
  ) then
    return;
  end if;
  delete from cryptogram.household_members
  where household_id = p_household
    and user_id = uid;
end;
$fn$;

-- Frozen houses look like an unknown code to anyone who is not already inside.
-- A member who rejoins runs settle, which can unfreeze. Never returns invite_code.
create or replace function cryptogram.join_household(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  uid uuid := auth.uid();
  hid uuid;
  hname text;
  frozen timestamptz;
  existing_role text;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  select h.id, h.name, h.frozen_at
  into hid, hname, frozen
  from cryptogram.households h
  where h.invite_code = upper(btrim(p_code));
  if hid is null then
    raise exception 'invite code not found';
  end if;
  select m.role
  into existing_role
  from cryptogram.household_members m
  where m.household_id = hid
    and m.user_id = uid;
  if existing_role is not null then
    perform cryptogram.settle_household_host(hid);
    select m.role
    into existing_role
    from cryptogram.household_members m
    where m.household_id = hid
      and m.user_id = uid;
    return jsonb_build_object('id', hid, 'name', hname, 'role', existing_role);
  end if;
  if frozen is not null then
    raise exception 'invite code not found';
  end if;
  insert into cryptogram.household_members (household_id, user_id, role)
  values (hid, uid, 'member')
  on conflict (household_id, user_id) do nothing;
  return jsonb_build_object('id', hid, 'name', hname, 'role', 'member');
end;
$fn$;

-- Every later host-only RPC must call this before it does anything else.
-- Do not add a host-only RPC that skips it. Not granted to clients.
create or replace function cryptogram.require_household_host(p_household uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  uid uuid := auth.uid();
  v_frozen timestamptz;
  v_role text;
begin
  -- Every later host-only RPC must call cryptogram.require_household_host.
  if uid is null then
    raise exception 'sign in required';
  end if;
  select h.frozen_at
  into v_frozen
  from cryptogram.households h
  where h.id = p_household;
  if v_frozen is not null then
    raise exception 'This household has no host right now.';
  end if;
  select m.role
  into v_role
  from cryptogram.household_members m
  where m.household_id = p_household
    and m.user_id = uid;
  if v_role is distinct from 'host' then
    raise exception 'only the host can do that';
  end if;
end;
$fn$;

revoke all on function cryptogram.member_can_host(cryptogram.household_members) from public, anon, authenticated;
revoke all on function cryptogram.member_can_host(uuid, uuid) from public, anon, authenticated;
revoke all on function cryptogram.settle_household_host(uuid) from public, anon, authenticated;
revoke all on function cryptogram.require_household_host(uuid) from public, anon, authenticated;
revoke all on function cryptogram.note_household_deleting() from public, anon, authenticated;
revoke all on function cryptogram.handle_deleted_member() from public, anon, authenticated;

-- Login deletion runs as supabase_auth_admin and cascades into household_members.
-- The trigger functions have to be executable by that role and by service_role.
grant execute on function cryptogram.note_household_deleting() to service_role, supabase_auth_admin;
grant execute on function cryptogram.handle_deleted_member() to service_role, supabase_auth_admin;

-- create or replace keeps the existing authenticated grant. State it again so a
-- re-apply still ends with authenticated execute and no anon execute.
revoke all on function cryptogram.leave_household(uuid) from public, anon, authenticated;
revoke all on function cryptogram.join_household(text) from public, anon, authenticated;
grant execute on function cryptogram.leave_household(uuid) to authenticated;
grant execute on function cryptogram.join_household(text) to authenticated;

-- Harmless when no households exist. Re-runs stay correct.
do $settle$
declare
  hid uuid;
begin
  for hid in select h.id from cryptogram.households h
  loop
    perform cryptogram.settle_household_host(hid);
  end loop;
end
$settle$;

comment on table cryptogram.households is
  'Household circle. frozen_at and frozen_reason are maintained by cryptogram.settle_household_host. See supabase/migrations/20260926180000_cryptogram_host_succession.sql.';

comment on table cryptogram.household_members is
  'Membership. household_members_after_delete_host settles, freezes, or deletes an empty household, including when a login is deleted. See supabase/migrations/20260926180000_cryptogram_host_succession.sql.';

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 2. Verify (read-only). Pass conditions are in the comments.
-- ---------------------------------------------------------------------------

-- PASS: two rows, frozen_at timestamp with time zone and frozen_reason text.
select column_name, data_type
from information_schema.columns
where table_schema = 'cryptogram'
  and table_name = 'households'
  and column_name in ('frozen_at', 'frozen_reason')
order by column_name;

-- PASS: one row. Partial index on frozen_at where frozen_at is not null.
select indexname, indexdef
from pg_indexes
where schemaname = 'cryptogram'
  and indexname = 'households_frozen_at_idx';

-- PASS: the household_members row overload. prosrc contains is_anonymous
-- and the is_18_plus hook comment. The uuid overload only loads the row.
select pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'cryptogram'
  and p.proname = 'member_can_host'
  and p.prosrc like '%is_anonymous%'
  and p.prosrc like '%is_18_plus%';

-- PASS: anon_exec and authenticated_exec are false on every row.
-- service_role_exec and auth_admin_exec are true only for the two trigger functions.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'execute') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_exec,
  has_function_privilege('supabase_auth_admin', p.oid, 'execute') as auth_admin_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'cryptogram'
  and p.proname in (
    'member_can_host',
    'settle_household_host',
    'require_household_host',
    'handle_deleted_member',
    'note_household_deleting'
  )
order by p.proname, args;

-- PASS: three rows, authenticated_exec true, anon_exec false.
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
  has_function_privilege('anon', p.oid, 'execute') as anon_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'cryptogram'
  and p.proname in ('leave_household', 'join_household', 'create_household')
order by p.proname;

-- PASS: household_members_after_delete_host, after delete for each row,
-- executes cryptogram.handle_deleted_member().
select pg_get_triggerdef(t.oid) as triggerdef
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'cryptogram'
  and c.relname = 'household_members'
  and not t.tgisinternal
  and t.tgname = 'household_members_after_delete_host';

-- ---------------------------------------------------------------------------
-- 3. Simulation. Inserts auth users and households, then rolls back.
-- This is not the live database. Safe to run in the same session as the apply:
-- the begin/rollback below does not undo the committed migration.
-- Every text[] append is cast ::text. A bare v_cols || 'email' fails with
-- "malformed array literal".
-- ---------------------------------------------------------------------------

begin;

create or replace function pg_temp.seed_auth_user(p_email text)
returns uuid
language plpgsql
as $seed$
declare
  v_id uuid := gen_random_uuid();
  v_cols text[] := array['id']::text[];
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
      v_cols := v_cols || 'email'::text;
      v_vals := v_vals || quote_literal(p_email)::text;
    elsif col.column_name = 'is_anonymous' then
      v_cols := v_cols || 'is_anonymous'::text;
      v_vals := v_vals || 'false'::text;
    elsif col.column_name = 'aud' then
      v_cols := v_cols || 'aud'::text;
      v_vals := v_vals || quote_literal('authenticated')::text;
    elsif col.column_name = 'role' then
      v_cols := v_cols || 'role'::text;
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

create or replace function pg_temp.act_as(p_uid uuid)
returns void
language plpgsql
as $act$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$act$;

do $sim$
declare
  v_host uuid;
  v_anon uuid;
  v_real uuid;
  v_stranger uuid;
  v_solo uuid;
  v_ghost uuid;
  v_member uuid;
  v_joiner uuid;
  v_e_host uuid;
  v_e_real uuid;
  v_d_anon uuid;
  v_hid uuid;
  v_code text;
  v_created jsonb;
  v_joined jsonb;
  v_err_frozen text;
  v_err_missing text;
  v_err text;
  v_member_id uuid;
  v_host_now uuid;
begin
  v_host := pg_temp.seed_auth_user('cgm-succession-host@example.test');
  v_anon := pg_temp.seed_auth_user('cgm-succession-anon@example.test');
  v_real := pg_temp.seed_auth_user('cgm-succession-real@example.test');
  v_stranger := pg_temp.seed_auth_user('cgm-succession-stranger@example.test');
  v_solo := pg_temp.seed_auth_user('cgm-succession-solo@example.test');
  v_ghost := pg_temp.seed_auth_user('cgm-succession-ghost@example.test');
  v_member := pg_temp.seed_auth_user('cgm-succession-member@example.test');
  v_joiner := pg_temp.seed_auth_user('cgm-succession-joiner@example.test');
  v_e_host := pg_temp.seed_auth_user('cgm-succession-ehost@example.test');
  v_e_real := pg_temp.seed_auth_user('cgm-succession-ereal@example.test');
  v_d_anon := pg_temp.seed_auth_user('cgm-succession-danon@example.test');
  update auth.users set is_anonymous = true where id in (v_anon, v_d_anon);

  -- (a) Oldest other member is anonymous. A newer member has a real login.
  perform pg_temp.act_as(v_host);
  v_created := cryptogram.create_household('Case A');
  if not (v_created ? 'inviteCode') or coalesce(v_created ->> 'inviteCode', '') = '' then
    raise exception 'FAIL: create_household must still return inviteCode to the host, got %', v_created;
  end if;
  v_hid := (v_created ->> 'id')::uuid;
  v_code := v_created ->> 'inviteCode';
  perform pg_temp.act_as(v_anon);
  perform cryptogram.join_household(v_code);
  perform pg_temp.act_as(v_real);
  perform cryptogram.join_household(v_code);
  update cryptogram.household_members
  set joined_at = timestamptz '2026-01-01 00:00:00+00'
  where household_id = v_hid and user_id = v_anon;
  update cryptogram.household_members
  set joined_at = timestamptz '2026-06-01 00:00:00+00'
  where household_id = v_hid and user_id = v_real;
  update cryptogram.household_members
  set joined_at = timestamptz '2026-09-01 00:00:00+00'
  where household_id = v_hid and user_id = v_host;
  perform pg_temp.act_as(v_host);
  perform cryptogram.leave_household(v_hid);
  select m.user_id into v_host_now
  from cryptogram.household_members m
  where m.household_id = v_hid and m.role = 'host';
  if v_host_now is distinct from v_real then
    raise exception 'FAIL: case a expected real-login host %, got %', v_real, v_host_now;
  end if;
  if not exists (
    select 1 from cryptogram.household_members m
    where m.household_id = v_hid and m.user_id = v_anon and m.role = 'member'
  ) then
    raise exception 'FAIL: case a anonymous member should remain a member';
  end if;
  if exists (
    select 1 from cryptogram.households h
    where h.id = v_hid and (h.frozen_at is not null or h.frozen_reason is not null)
  ) then
    raise exception 'FAIL: case a household should not be frozen';
  end if;

  -- (b) Only an anonymous member remains.
  perform pg_temp.act_as(v_host);
  v_created := cryptogram.create_household('Case B');
  v_hid := (v_created ->> 'id')::uuid;
  v_code := v_created ->> 'inviteCode';
  perform pg_temp.act_as(v_anon);
  perform cryptogram.join_household(v_code);
  perform pg_temp.act_as(v_host);
  perform cryptogram.leave_household(v_hid);
  if exists (
    select 1 from cryptogram.household_members m
    where m.household_id = v_hid and m.role = 'host'
  ) then
    raise exception 'FAIL: case b frozen household should have no host';
  end if;
  if not exists (
    select 1 from cryptogram.household_members m
    where m.household_id = v_hid and m.user_id = v_anon and m.role = 'member'
  ) then
    raise exception 'FAIL: case b anonymous member should still be a member';
  end if;
  if not exists (
    select 1 from cryptogram.households h
    where h.id = v_hid
      and h.frozen_at is not null
      and h.frozen_reason = 'no_eligible_host'
  ) then
    raise exception 'FAIL: case b expected frozen_at and no_eligible_host';
  end if;

  -- Second ineligible member, still frozen, for "any member" in case d.
  insert into cryptogram.household_members (household_id, user_id, role)
  values (v_hid, v_d_anon, 'member');
  perform cryptogram.settle_household_host(v_hid);

  -- (c) Stranger join matches the unknown-code error exactly.
  perform pg_temp.act_as(v_stranger);
  begin
    perform cryptogram.join_household(v_code);
    raise exception 'FAIL: case c frozen join should raise';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
      v_err_frozen := sqlerrm;
  end;
  begin
    perform cryptogram.join_household('NOSUCH1');
    raise exception 'FAIL: case c missing code should raise';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
      v_err_missing := sqlerrm;
  end;
  if v_err_frozen is distinct from 'invite code not found'
     or v_err_missing is distinct from 'invite code not found'
     or v_err_frozen is distinct from v_err_missing then
    raise exception 'FAIL: case c errors frozen=% missing=%', v_err_frozen, v_err_missing;
  end if;
  if exists (
    select 1 from cryptogram.household_members m
    where m.household_id = v_hid and m.user_id = v_stranger
  ) then
    raise exception 'FAIL: case c stranger should not have joined';
  end if;

  -- (d) require_household_host raises the no-host error for any member.
  for v_member_id in
    select m.user_id
    from cryptogram.household_members m
    where m.household_id = v_hid
  loop
    perform pg_temp.act_as(v_member_id);
    begin
      perform cryptogram.require_household_host(v_hid);
      raise exception 'FAIL: case d require_household_host should raise';
    exception
      when others then
        if sqlerrm like 'FAIL:%' then
          raise;
        end if;
        v_err := sqlerrm;
    end;
    if v_err is distinct from 'This household has no host right now.' then
      raise exception 'FAIL: case d message for % was %', v_member_id, v_err;
    end if;
  end loop;

  -- (e) Deleting the host login promotes a remaining real login via the trigger.
  perform pg_temp.act_as(v_e_host);
  v_created := cryptogram.create_household('Case E');
  v_hid := (v_created ->> 'id')::uuid;
  v_code := v_created ->> 'inviteCode';
  perform pg_temp.act_as(v_e_real);
  perform cryptogram.join_household(v_code);
  delete from auth.users where id = v_e_host;
  select m.user_id into v_host_now
  from cryptogram.household_members m
  where m.household_id = v_hid and m.role = 'host';
  if v_host_now is distinct from v_e_real then
    raise exception 'FAIL: case e expected promoted host %, got %', v_e_real, v_host_now;
  end if;
  if exists (
    select 1 from cryptogram.household_members m
    where m.user_id = v_e_host
  ) then
    raise exception 'FAIL: case e deleted login should have no membership';
  end if;
  if exists (
    select 1 from cryptogram.households h
    where h.id = v_hid and h.frozen_at is not null
  ) then
    raise exception 'FAIL: case e household should not be frozen';
  end if;

  -- (f) Last member leaves. Household is deleted.
  perform pg_temp.act_as(v_solo);
  v_created := cryptogram.create_household('Case F');
  v_hid := (v_created ->> 'id')::uuid;
  perform cryptogram.leave_household(v_hid);
  if exists (select 1 from cryptogram.households h where h.id = v_hid) then
    raise exception 'FAIL: case f household should be deleted';
  end if;
  if exists (
    select 1 from cryptogram.household_members m where m.household_id = v_hid
  ) then
    raise exception 'FAIL: case f membership should be gone';
  end if;

  -- (g) Non-host leaves. Host unchanged.
  perform pg_temp.act_as(v_host);
  v_created := cryptogram.create_household('Case G');
  v_hid := (v_created ->> 'id')::uuid;
  v_code := v_created ->> 'inviteCode';
  perform pg_temp.act_as(v_member);
  perform cryptogram.join_household(v_code);
  perform cryptogram.leave_household(v_hid);
  select m.user_id into v_host_now
  from cryptogram.household_members m
  where m.household_id = v_hid and m.role = 'host';
  if v_host_now is distinct from v_host then
    raise exception 'FAIL: case g host changed to %', v_host_now;
  end if;
  if exists (
    select 1 from cryptogram.household_members m
    where m.household_id = v_hid and m.user_id = v_member
  ) then
    raise exception 'FAIL: case g leaver should be gone';
  end if;
  if (
    select count(*) from cryptogram.household_members m where m.household_id = v_hid
  ) <> 1 then
    raise exception 'FAIL: case g household should still have exactly the host';
  end if;

  -- (h) join_household never returns an invite code key for a non-host.
  perform pg_temp.act_as(v_joiner);
  v_joined := cryptogram.join_household(v_code);
  if v_joined ? 'inviteCode' or v_joined ? 'invite_code' or v_joined ? 'code' then
    raise exception 'FAIL: case h join response has an invite key %', v_joined;
  end if;
  if v_joined::text ilike '%' || v_code || '%' then
    raise exception 'FAIL: case h join response contains the invite code %', v_joined;
  end if;
  if (v_joined ->> 'id')::uuid is distinct from v_hid or v_joined ->> 'name' is distinct from 'Case G' then
    raise exception 'FAIL: case h join response id/name mismatch %', v_joined;
  end if;
  v_joined := cryptogram.join_household(v_code);
  if v_joined ? 'inviteCode' or v_joined ? 'invite_code' or v_joined::text ilike '%' || v_code || '%' then
    raise exception 'FAIL: case h rejoin response leaked the invite code %', v_joined;
  end if;

  raise notice 'VERIFY PASS cryptogram host succession';
end
$sim$;

rollback;

-- ---------------------------------------------------------------------------
-- 4. Rollback notes. Do not run these as part of apply.
-- Restore the previous leave_household and join_household bodies from
-- 20260926120000_cryptogram_init.sql first, then drop triggers and functions,
-- then drop columns last. create or replace keeps the authenticated grants.
-- The restored leave_household promotes the next member before the old host
-- row is removed. household_one_host can reject that update. That is the
-- init behavior this file replaces.
-- ---------------------------------------------------------------------------
-- begin;
--
-- create or replace function cryptogram.join_household(p_code text)
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = pg_catalog
-- as $fn$
-- declare
--   uid uuid := auth.uid();
--   hid uuid;
--   hname text;
-- begin
--   if uid is null then
--     raise exception 'sign in required';
--   end if;
--   select h.id, h.name into hid, hname
--   from cryptogram.households h
--   where h.invite_code = upper(btrim(p_code));
--   if hid is null then
--     raise exception 'invite code not found';
--   end if;
--   insert into cryptogram.household_members (household_id, user_id, role)
--   values (hid, uid, 'member')
--   on conflict (household_id, user_id) do nothing;
--   return jsonb_build_object('id', hid, 'name', hname);
-- end;
-- $fn$;
--
-- create or replace function cryptogram.leave_household(p_household uuid)
-- returns void
-- language plpgsql
-- security definer
-- set search_path = pg_catalog
-- as $fn$
-- declare
--   uid uuid := auth.uid();
--   current_role text;
--   next_host uuid;
-- begin
--   if uid is null then
--     raise exception 'sign in required';
--   end if;
--   select m.role into current_role
--   from cryptogram.household_members m
--   where m.household_id = p_household and m.user_id = uid;
--   if current_role is null then
--     return;
--   end if;
--   if current_role = 'host' then
--     select m.user_id into next_host
--     from cryptogram.household_members m
--     where m.household_id = p_household and m.user_id <> uid
--     order by m.joined_at, m.user_id
--     limit 1;
--     if next_host is null then
--       delete from cryptogram.households where id = p_household;
--       return;
--     end if;
--     update cryptogram.household_members
--     set role = 'host'
--     where household_id = p_household and user_id = next_host;
--   end if;
--   delete from cryptogram.household_members
--   where household_id = p_household and user_id = uid;
-- end;
-- $fn$;
--
-- drop trigger if exists household_members_after_delete_host on cryptogram.household_members;
-- drop trigger if exists households_before_delete_note on cryptogram.households;
-- drop function if exists cryptogram.handle_deleted_member();
-- drop function if exists cryptogram.note_household_deleting();
-- drop function if exists cryptogram.require_household_host(uuid);
-- drop function if exists cryptogram.settle_household_host(uuid);
-- drop function if exists cryptogram.member_can_host(uuid, uuid);
-- drop function if exists cryptogram.member_can_host(cryptogram.household_members);
-- drop index if exists cryptogram.households_frozen_at_idx;
-- alter table cryptogram.households drop column if exists frozen_reason;
-- alter table cryptogram.households drop column if exists frozen_at;
--
-- commit;
-- notify pgrst, 'reload schema';
