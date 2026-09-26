-- CryptoGram Messenger initial schema.
-- Target project: kfbgjpqgywenkfkfcoqf (shared Azat database).
-- A human applies this file. Do not run it from the app.
--
-- Age gate: CryptoGram-only for this trial. The client asks with two cards,
-- "I am 13 or older" and "I am under 13". Under 13 stores nothing: no profile
-- row, no attempt, no cookie written by this product. profiles.age_ack accepts
-- only the value 13plus, so an under-13 answer cannot be stored.
-- A hub-level age gate for every Azat app is still an open question.
--
-- Answers stay server-side. quotes and puzzles are not granted to client roles.
-- puzzles_public returns the encoded form only. Plain text is returned by
-- confirm_solve, give_up, and solved_summary, and only after that player has
-- solved or given up.
--
-- Daily assignment: cryptogram.assign_daily_puzzle(cryptogram.denver_today()).
-- It is safe to call more than once. It only assigns the current Denver date.
-- A signed-in player may call it. The database owner may call it too, so a
-- later job can assign the day without a JWT. No pg_cron job is created here.

create schema if not exists cryptogram;

revoke all on schema cryptogram from public, anon;
grant usage on schema cryptogram to authenticated;

create table if not exists cryptogram.quotes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  plain_text text not null,
  author text not null,
  work_title text not null,
  published_year integer not null,
  source_note text not null,
  public_domain boolean not null default true,
  sort_order integer not null unique,
  created_at timestamptz not null default now(),
  constraint quotes_year_public_domain check (published_year <= 1930),
  constraint quotes_no_digits check (plain_text !~ '[0-9]'),
  constraint quotes_has_letters check (char_length(plain_text) > 0)
);

create table if not exists cryptogram.puzzles (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references cryptogram.quotes (id),
  puzzle_date date not null unique,
  code_key jsonb not null,
  coded jsonb not null,
  unique_letter_count integer not null,
  letter_count integer not null,
  longest_word integer not null,
  created_at timestamptz not null default now()
);

create table if not exists cryptogram.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  handle text,
  age_ack text,
  age_ack_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_age_ack_13plus check (age_ack is null or age_ack = '13plus'),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 40),
  constraint profiles_handle_shape check (
    handle is null
    or (
      char_length(handle) between 3 and 20
      and handle = lower(handle)
      and position(' ' in handle) = 0
    )
  )
);

create unique index if not exists profiles_handle_unique on cryptogram.profiles (handle) where handle is not null;

create table if not exists cryptogram.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  puzzle_id uuid not null references cryptogram.puzzles (id) on delete cascade,
  letter_mapping jsonb not null default '{}'::jsonb,
  hints_used integer not null default 0,
  elapsed_ms bigint not null default 0,
  solved boolean not null default false,
  gave_up boolean not null default false,
  stars integer,
  points integer,
  frequency_used boolean not null default false,
  revealed_numbers integer[] not null default '{}',
  started_at timestamptz not null default now(),
  solved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, puzzle_id),
  constraint attempts_stars check (stars is null or stars between 0 and 3),
  constraint attempts_hints check (hints_used >= 0),
  constraint attempts_elapsed check (elapsed_ms >= 0)
);

create index if not exists attempts_user_idx on cryptogram.attempts (user_id);

create table if not exists cryptogram.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  constraint households_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint households_code_len check (char_length(invite_code) between 6 and 12)
);

create table if not exists cryptogram.household_members (
  household_id uuid not null references cryptogram.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_role check (role in ('host', 'member'))
);

create unique index if not exists household_one_host
  on cryptogram.household_members (household_id)
  where role = 'host';

-- Later slice: friends. responded_at lets a future rule require the
-- friendship to be accepted for 24 hours before board points count.
create table if not exists cryptogram.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_status check (status in ('pending', 'accepted', 'denied', 'cancelled')),
  constraint friendships_distinct check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index if not exists friendships_addressee_idx on cryptogram.friendships (addressee_id);

create table if not exists cryptogram.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_distinct check (blocker_id <> blocked_id)
);

-- Coded delivery. Plain text lives in message_secrets, which clients cannot read.
-- screening_status is the extension point for server-side review before delivery.
create table if not exists cryptogram.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references cryptogram.households (id) on delete set null,
  coded jsonb not null default '{"words":[]}'::jsonb,
  screening_status text not null default 'pending',
  sender_revealed text[] not null default '{}',
  created_at timestamptz not null default now(),
  solved_at timestamptz,
  deleted_at timestamptz,
  constraint messages_screening check (screening_status in ('pending', 'cleared', 'held', 'blocked')),
  constraint messages_distinct check (sender_id <> recipient_id)
);

create index if not exists messages_recipient_created
  on cryptogram.messages (recipient_id, created_at desc);

create index if not exists messages_screening_queue
  on cryptogram.messages (screening_status, created_at)
  where screening_status in ('pending', 'held');

create table if not exists cryptogram.message_secrets (
  message_id uuid primary key references cryptogram.messages (id) on delete cascade,
  plain_text text not null,
  code_key jsonb not null,
  constraint message_secrets_no_digits check (plain_text !~ '[0-9]'),
  constraint message_secrets_cap check (char_length(plain_text) <= 400)
);

-- Reports are moderation evidence. They stay when the reporter, the reported
-- sender, or the message is deleted: those foreign keys are ON DELETE SET NULL,
-- and the row keeps the reason plus a snapshot of the message text and metadata.
-- Intentionally still ON DELETE CASCADE: friendships, blocks, profiles,
-- household membership, attempts, messages (and message_secrets), and
-- rate_limit_counters. A block or friendship is meaningless once either person
-- is gone. Rate-limit counters are operational, not evidence. The live message
-- is removed with its sender or recipient; this snapshot is the copy kept for review.
create table if not exists cryptogram.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  sender_id uuid references auth.users (id) on delete set null,
  message_id uuid references cryptogram.messages (id) on delete set null,
  reason text not null,
  note text,
  status text not null default 'open',
  message_text text not null,
  message_coded jsonb not null,
  message_screening_status text not null,
  message_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint reports_reason check (reason in ('bullying', 'sexual', 'hate', 'scam', 'danger', 'other')),
  constraint reports_status check (status in ('open', 'reviewing', 'closed')),
  constraint reports_message_text_len check (char_length(message_text) between 1 and 400),
  constraint reports_message_text_no_digits check (message_text !~ '[0-9]'),
  constraint reports_screening check (message_screening_status in ('pending', 'cleared', 'held', 'blocked'))
);

create index if not exists reports_status_idx on cryptogram.reports (status, created_at);

-- Later slice: per-sender daily caps (20 messages, 5 to one friend, 10 requests).
create table if not exists cryptogram.rate_limit_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  primary key (user_id, action, window_start),
  constraint rate_limit_hits check (hit_count >= 0)
);

create or replace view cryptogram.puzzles_public
with (security_invoker = false) as
select
  p.id,
  p.puzzle_date,
  p.coded,
  p.unique_letter_count,
  p.letter_count,
  p.longest_word
from cryptogram.puzzles p;

comment on view cryptogram.puzzles_public is
  'Encoded daily puzzle only. security_invoker is false so the owner can read puzzles while clients cannot. Do not add plain_text or code_key to this view.';

alter table cryptogram.quotes enable row level security;
alter table cryptogram.puzzles enable row level security;
alter table cryptogram.profiles enable row level security;
alter table cryptogram.attempts enable row level security;
alter table cryptogram.households enable row level security;
alter table cryptogram.household_members enable row level security;
alter table cryptogram.friendships enable row level security;
alter table cryptogram.blocks enable row level security;
alter table cryptogram.messages enable row level security;
alter table cryptogram.message_secrets enable row level security;
alter table cryptogram.reports enable row level security;
alter table cryptogram.rate_limit_counters enable row level security;

-- Quotes, puzzles, and message_secrets have no client policies on purpose.
-- Do not add a select policy on those tables.

create or replace function cryptogram.denver_today()
returns date
language sql
stable
set search_path = pg_catalog
as 'select (timezone(''America/Denver'', now()))::date';

create or replace function cryptogram.encode_plain(p_plain text, p_key jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as '
declare
  i int := 1;
  len int;
  ch text;
  words jsonb := ''[]''::jsonb;
  tiles jsonb := ''[]''::jsonb;
  num int;
begin
  len := char_length(p_plain);
  while i <= len loop
    ch := upper(substr(p_plain, i, 1));
    if ch = '' '' or ch = chr(10) or ch = chr(9) or ch = chr(13) then
      if jsonb_array_length(tiles) > 0 then
        words := words || jsonb_build_array(jsonb_build_object(''tiles'', tiles));
        tiles := ''[]''::jsonb;
      end if;
    elsif ch >= ''A'' and ch <= ''Z'' then
      num := (p_key ->> ch)::int;
      if num is null then
        raise exception ''missing code for letter'';
      end if;
      tiles := tiles || jsonb_build_array(jsonb_build_object(''kind'', ''letter'', ''number'', num));
    elsif ch >= ''0'' and ch <= ''9'' then
      raise exception ''digits are not allowed'';
    else
      tiles := tiles || jsonb_build_array(jsonb_build_object(''kind'', ''mark'', ''char'', substr(p_plain, i, 1)));
    end if;
    i := i + 1;
  end loop;
  if jsonb_array_length(tiles) > 0 then
    words := words || jsonb_build_array(jsonb_build_object(''tiles'', tiles));
  end if;
  return jsonb_build_object(''words'', words);
end;
';

create or replace function cryptogram.plain_stats(p_plain text)
returns table (unique_letter_count integer, letter_count integer, longest_word integer)
language plpgsql
immutable
set search_path = pg_catalog
as '
declare
  i int := 1;
  len int;
  ch text;
  seen text := '''';
  unique_count int := 0;
  letters int := 0;
  longest int := 0;
  current_word int := 0;
begin
  len := char_length(p_plain);
  while i <= len loop
    ch := upper(substr(p_plain, i, 1));
    if ch = '' '' or ch = chr(10) or ch = chr(9) or ch = chr(13) then
      if current_word > longest then
        longest := current_word;
      end if;
      current_word := 0;
    elsif ch >= ''A'' and ch <= ''Z'' then
      letters := letters + 1;
      current_word := current_word + 1;
      if position(ch in seen) = 0 then
        seen := seen || ch;
        unique_count := unique_count + 1;
      end if;
    end if;
    i := i + 1;
  end loop;
  if current_word > longest then
    longest := current_word;
  end if;
  unique_letter_count := unique_count;
  letter_count := letters;
  longest_word := longest;
  return next;
end;
';

create or replace function cryptogram.stars_for(
  p_hints integer,
  p_gave_up boolean,
  p_elapsed_ms bigint,
  p_unique integer
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as '
declare
  par_ms bigint;
  unique_count integer;
begin
  if p_gave_up then
    return 0;
  end if;
  if p_hints >= 2 then
    return 1;
  end if;
  unique_count := p_unique;
  if unique_count < 1 then
    unique_count := 1;
  end if;
  par_ms := unique_count * 20 * 1000;
  if p_hints = 1 or p_elapsed_ms > par_ms then
    return 2;
  end if;
  return 3;
end;
';

create or replace function cryptogram.points_for(
  p_stars integer,
  p_unique integer,
  p_longest integer,
  p_prereveals integer
)
returns integer
language sql
immutable
set search_path = pg_catalog
as 'select p_stars * greatest(1, p_unique + p_longest - p_prereveals * 2)';

create or replace function cryptogram.grade_mapping(p_plain text, p_key jsonb, p_mapping jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as '
declare
  i int := 1;
  len int;
  ch text;
  num text;
  guess text;
  wrong_count int := 0;
  wrong_numbers jsonb := ''[]''::jsonb;
  seen jsonb := ''{}''::jsonb;
begin
  len := char_length(p_plain);
  while i <= len loop
    ch := upper(substr(p_plain, i, 1));
    if ch >= ''A'' and ch <= ''Z'' then
      num := p_key ->> ch;
      guess := upper(coalesce(p_mapping ->> num, ''''));
      if guess is distinct from ch then
        wrong_count := wrong_count + 1;
        if guess <> '''' and not (seen ? num) then
          wrong_numbers := wrong_numbers || jsonb_build_array(num::int);
          seen := seen || jsonb_build_object(num, true);
        end if;
      end if;
    end if;
    i := i + 1;
  end loop;
  return jsonb_build_object(''wrongCount'', wrong_count, ''wrongNumbers'', wrong_numbers);
end;
';

create or replace function cryptogram.protect_attempt_score()
returns trigger
language plpgsql
set search_path = pg_catalog
as '
begin
  if coalesce(current_setting(''cryptogram.trusted_write'', true), '''') is distinct from ''on'' then
    if tg_op = ''INSERT'' then
      new.solved := false;
      new.gave_up := false;
      new.stars := null;
      new.points := null;
      new.hints_used := 0;
      new.solved_at := null;
      new.revealed_numbers := ''{}''::int[];
      new.frequency_used := false;
    else
      new.solved := old.solved;
      new.gave_up := old.gave_up;
      new.stars := old.stars;
      new.points := old.points;
      new.hints_used := old.hints_used;
      new.solved_at := old.solved_at;
      new.revealed_numbers := old.revealed_numbers;
      new.frequency_used := old.frequency_used;
      new.user_id := old.user_id;
      new.puzzle_id := old.puzzle_id;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
';

drop trigger if exists attempts_protect_score on cryptogram.attempts;
create trigger attempts_protect_score
  before insert or update on cryptogram.attempts
  for each row
  execute function cryptogram.protect_attempt_score();

create or replace function cryptogram.ensure_attempt(p_user uuid, p_puzzle uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as '
begin
  insert into cryptogram.attempts (user_id, puzzle_id)
  values (p_user, p_puzzle)
  on conflict (user_id, puzzle_id) do nothing;
end;
';

create or replace function cryptogram.quote_payload(p_puzzle uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as '
declare
  payload jsonb;
begin
  select jsonb_build_object(
    ''author'', q.author,
    ''work'', q.work_title,
    ''year'', q.published_year,
    ''plainText'', q.plain_text,
    ''sourceNote'', q.source_note
  )
  into payload
  from cryptogram.puzzles p
  join cryptogram.quotes q on q.id = p.quote_id
  where p.id = p_puzzle;
  return payload;
end;
';

create or replace function cryptogram.assign_daily_puzzle(p_date date)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  existing_id uuid;
  chosen_id uuid;
  plain text;
  letters text[] := array[''A'',''B'',''C'',''D'',''E'',''F'',''G'',''H'',''I'',''J'',''K'',''L'',''M'',''N'',''O'',''P'',''Q'',''R'',''S'',''T'',''U'',''V'',''W'',''X'',''Y'',''Z''];
  numbers int[] := array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];
  i int;
  j int;
  tmp int;
  key_json jsonb := ''{}''::jsonb;
  coded jsonb;
  stats record;
begin
  if current_setting(''request.jwt.claim.role'', true) in (''authenticated'', ''anon'')
     and auth.uid() is null then
    raise exception ''sign in required'';
  end if;
  if p_date is distinct from cryptogram.denver_today() then
    raise exception ''only the current Denver date can be assigned'';
  end if;
  select p.id into existing_id
  from cryptogram.puzzles p
  where p.puzzle_date = p_date;
  if existing_id is not null then
    return existing_id;
  end if;
  select q.id, q.plain_text into chosen_id, plain
  from cryptogram.quotes q
  where q.public_domain
  order by (
    select max(prev.puzzle_date) from cryptogram.puzzles prev where prev.quote_id = q.id
  ) nulls first, q.sort_order
  limit 1;
  if chosen_id is null then
    raise exception ''no public-domain quotes are loaded'';
  end if;
  i := 26;
  while i > 1 loop
    j := 1 + floor(random() * i)::int;
    tmp := numbers[i];
    numbers[i] := numbers[j];
    numbers[j] := tmp;
    i := i - 1;
  end loop;
  i := 1;
  while i <= 26 loop
    key_json := key_json || jsonb_build_object(letters[i], numbers[i]);
    i := i + 1;
  end loop;
  coded := cryptogram.encode_plain(plain, key_json);
  select * into stats from cryptogram.plain_stats(plain);
  begin
    insert into cryptogram.puzzles (
      quote_id, puzzle_date, code_key, coded, unique_letter_count, letter_count, longest_word
    )
    values (
      chosen_id, p_date, key_json, coded, stats.unique_letter_count, stats.letter_count, stats.longest_word
    )
    returning id into existing_id;
  exception
    when unique_violation then
      select p.id into existing_id from cryptogram.puzzles p where p.puzzle_date = p_date;
  end;
  return existing_id;
end;
';

create or replace function cryptogram.check_letters(p_puzzle_id uuid, p_mapping jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  plain text;
  key_json jsonb;
  graded jsonb;
  hints integer;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  select q.plain_text, p.code_key into plain, key_json
  from cryptogram.puzzles p
  join cryptogram.quotes q on q.id = p.quote_id
  where p.id = p_puzzle_id;
  if plain is null then
    raise exception ''puzzle not found'';
  end if;
  perform cryptogram.ensure_attempt(uid, p_puzzle_id);
  perform set_config(''cryptogram.trusted_write'', ''on'', true);
  update cryptogram.attempts
  set hints_used = hints_used + 1
  where user_id = uid and puzzle_id = p_puzzle_id and solved = false and gave_up = false
  returning hints_used into hints;
  if hints is null then
    select a.hints_used into hints
    from cryptogram.attempts a
    where a.user_id = uid and a.puzzle_id = p_puzzle_id;
  end if;
  graded := cryptogram.grade_mapping(plain, key_json, coalesce(p_mapping, ''{}''::jsonb));
  return jsonb_build_object(''wrongNumbers'', graded -> ''wrongNumbers'', ''hintsUsed'', hints);
end;
';

create or replace function cryptogram.reveal_letter(p_puzzle_id uuid, p_number integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  plain text;
  key_json jsonb;
  i int;
  len int;
  ch text;
  letter text;
  num_text text := p_number::text;
  hints integer;
  already boolean;
  old_map jsonb;
  new_map jsonb := ''{}''::jsonb;
  pair record;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  if p_number < 1 or p_number > 26 then
    raise exception ''number out of range'';
  end if;
  select q.plain_text, p.code_key into plain, key_json
  from cryptogram.puzzles p
  join cryptogram.quotes q on q.id = p.quote_id
  where p.id = p_puzzle_id;
  if plain is null then
    raise exception ''puzzle not found'';
  end if;
  len := char_length(plain);
  i := 1;
  while i <= len loop
    ch := upper(substr(plain, i, 1));
    if ch >= ''A'' and ch <= ''Z'' and (key_json ->> ch) = num_text then
      letter := ch;
      exit;
    end if;
    i := i + 1;
  end loop;
  if letter is null then
    raise exception ''that number is not in this puzzle'';
  end if;
  perform cryptogram.ensure_attempt(uid, p_puzzle_id);
  select a.letter_mapping, p_number = any (a.revealed_numbers)
  into old_map, already
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id
  for update;
  if upper(coalesce(old_map ->> num_text, '''')) = letter then
    already := true;
  end if;
  for pair in select t.key, t.value from jsonb_each_text(coalesce(old_map, ''{}''::jsonb)) as t(key, value)
  loop
    if pair.value is distinct from letter and pair.key is distinct from num_text then
      new_map := new_map || jsonb_build_object(pair.key, pair.value);
    end if;
  end loop;
  new_map := new_map || jsonb_build_object(num_text, letter);
  perform set_config(''cryptogram.trusted_write'', ''on'', true);
  update cryptogram.attempts
  set
    letter_mapping = new_map,
    hints_used = case when already or solved or gave_up then hints_used else hints_used + 1 end,
    revealed_numbers = case
      when p_number = any (revealed_numbers) then revealed_numbers
      else revealed_numbers || p_number
    end
  where user_id = uid and puzzle_id = p_puzzle_id
  returning hints_used into hints;
  return jsonb_build_object(''number'', p_number, ''letter'', letter, ''hintsUsed'', hints);
end;
';

create or replace function cryptogram.record_frequency_hint(p_puzzle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  hints integer;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  if not exists (select 1 from cryptogram.puzzles p where p.id = p_puzzle_id) then
    raise exception ''puzzle not found'';
  end if;
  perform cryptogram.ensure_attempt(uid, p_puzzle_id);
  perform set_config(''cryptogram.trusted_write'', ''on'', true);
  update cryptogram.attempts
  set
    hints_used = case when frequency_used or solved or gave_up then hints_used else hints_used + 1 end,
    frequency_used = true
  where user_id = uid and puzzle_id = p_puzzle_id
  returning hints_used into hints;
  return jsonb_build_object(''hintsUsed'', hints);
end;
';

create or replace function cryptogram.confirm_solve(
  p_puzzle_id uuid,
  p_mapping jsonb,
  p_elapsed_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  plain text;
  key_json jsonb;
  unique_count integer;
  longest integer;
  graded jsonb;
  wrong_count integer;
  hints integer;
  elapsed bigint;
  solved_flag boolean;
  gave_flag boolean;
  star_count integer;
  point_count integer;
  payload jsonb;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  select q.plain_text, p.code_key, p.unique_letter_count, p.longest_word
  into plain, key_json, unique_count, longest
  from cryptogram.puzzles p
  join cryptogram.quotes q on q.id = p.quote_id
  where p.id = p_puzzle_id;
  if plain is null then
    raise exception ''puzzle not found'';
  end if;
  perform cryptogram.ensure_attempt(uid, p_puzzle_id);
  select a.hints_used, a.elapsed_ms, a.solved, a.gave_up, a.stars, a.points
  into hints, elapsed, solved_flag, gave_flag, star_count, point_count
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id
  for update;
  if solved_flag or gave_flag then
    payload := cryptogram.quote_payload(p_puzzle_id);
    return payload || jsonb_build_object(
      ''solved'', solved_flag,
      ''gaveUp'', gave_flag,
      ''stars'', coalesce(star_count, 0),
      ''points'', coalesce(point_count, 0),
      ''hintsUsed'', hints,
      ''elapsedMs'', elapsed,
      ''ready'', true
    );
  end if;
  graded := cryptogram.grade_mapping(plain, key_json, coalesce(p_mapping, ''{}''::jsonb));
  wrong_count := (graded ->> ''wrongCount'')::int;
  if wrong_count > 0 then
    return jsonb_build_object(''solved'', false, ''wrongCount'', wrong_count);
  end if;
  elapsed := greatest(coalesce(p_elapsed_ms, 0), 0);
  star_count := cryptogram.stars_for(hints, false, elapsed, unique_count);
  point_count := cryptogram.points_for(star_count, unique_count, longest, 0);
  perform set_config(''cryptogram.trusted_write'', ''on'', true);
  update cryptogram.attempts
  set
    letter_mapping = coalesce(p_mapping, ''{}''::jsonb),
    elapsed_ms = elapsed,
    solved = true,
    gave_up = false,
    stars = star_count,
    points = point_count,
    solved_at = clock_timestamp()
  where user_id = uid and puzzle_id = p_puzzle_id;
  payload := cryptogram.quote_payload(p_puzzle_id);
  return payload || jsonb_build_object(
    ''solved'', true,
    ''gaveUp'', false,
    ''stars'', star_count,
    ''points'', point_count,
    ''hintsUsed'', hints,
    ''elapsedMs'', elapsed,
    ''ready'', true
  );
end;
';

create or replace function cryptogram.give_up(p_puzzle_id uuid, p_elapsed_ms bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  hints integer;
  elapsed bigint;
  solved_flag boolean;
  payload jsonb;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  if not exists (select 1 from cryptogram.puzzles p where p.id = p_puzzle_id) then
    raise exception ''puzzle not found'';
  end if;
  perform cryptogram.ensure_attempt(uid, p_puzzle_id);
  select a.hints_used, a.solved into hints, solved_flag
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id
  for update;
  if solved_flag then
    return cryptogram.confirm_solve(p_puzzle_id, ''{}''::jsonb, coalesce(p_elapsed_ms, 0));
  end if;
  elapsed := greatest(coalesce(p_elapsed_ms, 0), 0);
  perform set_config(''cryptogram.trusted_write'', ''on'', true);
  update cryptogram.attempts
  set
    gave_up = true,
    solved = false,
    stars = 0,
    points = 0,
    elapsed_ms = elapsed,
    solved_at = clock_timestamp()
  where user_id = uid and puzzle_id = p_puzzle_id;
  payload := cryptogram.quote_payload(p_puzzle_id);
  return payload || jsonb_build_object(
    ''solved'', false,
    ''gaveUp'', true,
    ''stars'', 0,
    ''points'', 0,
    ''hintsUsed'', hints,
    ''elapsedMs'', elapsed,
    ''ready'', true
  );
end;
';

create or replace function cryptogram.solved_summary(p_puzzle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  hints integer;
  elapsed bigint;
  solved_flag boolean;
  gave_flag boolean;
  star_count integer;
  point_count integer;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  select a.hints_used, a.elapsed_ms, a.solved, a.gave_up, a.stars, a.points
  into hints, elapsed, solved_flag, gave_flag, star_count, point_count
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id;
  if not found or (solved_flag = false and gave_flag = false) then
    return jsonb_build_object(''ready'', false);
  end if;
  return cryptogram.quote_payload(p_puzzle_id) || jsonb_build_object(
    ''ready'', true,
    ''solved'', solved_flag,
    ''gaveUp'', gave_flag,
    ''stars'', coalesce(star_count, 0),
    ''points'', coalesce(point_count, 0),
    ''hintsUsed'', hints,
    ''elapsedMs'', elapsed
  );
end;
';

create or replace function cryptogram.acknowledge_age()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  insert into cryptogram.profiles (user_id, age_ack, age_ack_at)
  values (uid, ''13plus'', clock_timestamp())
  on conflict (user_id) do update
  set
    age_ack = ''13plus'',
    age_ack_at = coalesce(cryptogram.profiles.age_ack_at, clock_timestamp());
end;
';

create or replace function cryptogram.is_household_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as 'select exists (
  select 1 from cryptogram.household_members m
  where m.household_id = p_household and m.user_id = auth.uid()
)';

create or replace function cryptogram.create_household(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  clean text;
  alphabet text := ''ABCDEFGHJKLMNPQRSTUVWXYZ23456789'';
  code text;
  i int;
  new_id uuid;
  tries int := 0;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  clean := btrim(p_name);
  if char_length(clean) < 1 or char_length(clean) > 80 then
    raise exception ''household name must be 1 to 80 characters'';
  end if;
  while tries < 5 loop
    code := '''';
    i := 0;
    while i < 8 loop
      code := code || substr(alphabet, 1 + floor(random() * char_length(alphabet))::int, 1);
      i := i + 1;
    end loop;
    begin
      insert into cryptogram.households (name, invite_code)
      values (clean, code)
      returning id into new_id;
      insert into cryptogram.household_members (household_id, user_id, role)
      values (new_id, uid, ''host'');
      return jsonb_build_object(''id'', new_id, ''inviteCode'', code, ''name'', clean);
    exception
      when unique_violation then
        tries := tries + 1;
    end;
  end loop;
  raise exception ''could not create an invite code'';
end;
';

create or replace function cryptogram.join_household(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  hid uuid;
  hname text;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  select h.id, h.name into hid, hname
  from cryptogram.households h
  where h.invite_code = upper(btrim(p_code));
  if hid is null then
    raise exception ''invite code not found'';
  end if;
  insert into cryptogram.household_members (household_id, user_id, role)
  values (hid, uid, ''member'')
  on conflict (household_id, user_id) do nothing;
  return jsonb_build_object(''id'', hid, ''name'', hname);
end;
';

create or replace function cryptogram.leave_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as '
declare
  uid uuid := auth.uid();
  current_role text;
  next_host uuid;
begin
  if uid is null then
    raise exception ''sign in required'';
  end if;
  select m.role into current_role
  from cryptogram.household_members m
  where m.household_id = p_household and m.user_id = uid;
  if current_role is null then
    return;
  end if;
  if current_role = ''host'' then
    select m.user_id into next_host
    from cryptogram.household_members m
    where m.household_id = p_household and m.user_id <> uid
    order by m.joined_at, m.user_id
    limit 1;
    if next_host is null then
      delete from cryptogram.households where id = p_household;
      return;
    end if;
    update cryptogram.household_members
    set role = ''host''
    where household_id = p_household and user_id = next_host;
  end if;
  delete from cryptogram.household_members
  where household_id = p_household and user_id = uid;
end;
';

do '
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = ''cryptogram''
  loop
    execute ''revoke all on function '' || fn.sig::text || '' from public, anon, authenticated'';
  end loop;
end
';

grant execute on function cryptogram.denver_today() to authenticated;
grant execute on function cryptogram.assign_daily_puzzle(date) to authenticated;
grant execute on function cryptogram.check_letters(uuid, jsonb) to authenticated;
grant execute on function cryptogram.reveal_letter(uuid, integer) to authenticated;
grant execute on function cryptogram.record_frequency_hint(uuid) to authenticated;
grant execute on function cryptogram.confirm_solve(uuid, jsonb, bigint) to authenticated;
grant execute on function cryptogram.give_up(uuid, bigint) to authenticated;
grant execute on function cryptogram.solved_summary(uuid) to authenticated;
grant execute on function cryptogram.acknowledge_age() to authenticated;
grant execute on function cryptogram.create_household(text) to authenticated;
grant execute on function cryptogram.join_household(text) to authenticated;
grant execute on function cryptogram.leave_household(uuid) to authenticated;
grant execute on function cryptogram.is_household_member(uuid) to authenticated;

revoke all on all tables in schema cryptogram from public, anon, authenticated;
grant select on cryptogram.puzzles_public to authenticated;
grant select, insert, update on cryptogram.attempts to authenticated;
grant select on cryptogram.profiles to authenticated;
grant select on cryptogram.households to authenticated;
grant select on cryptogram.household_members to authenticated;

drop policy if exists profiles_select_own on cryptogram.profiles;
create policy profiles_select_own on cryptogram.profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists attempts_select_own on cryptogram.attempts;
create policy attempts_select_own on cryptogram.attempts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists attempts_insert_own on cryptogram.attempts;
create policy attempts_insert_own on cryptogram.attempts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists attempts_update_own on cryptogram.attempts;
create policy attempts_update_own on cryptogram.attempts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists households_select_member on cryptogram.households;
create policy households_select_member on cryptogram.households
  for select to authenticated
  using (cryptogram.is_household_member(id));

drop policy if exists household_members_select_member on cryptogram.household_members;
create policy household_members_select_member on cryptogram.household_members
  for select to authenticated
  using (cryptogram.is_household_member(household_id));

-- Stub tables keep RLS on and have no policies yet, so clients cannot read them.
-- Later slices add RPCs for friendships, blocks, messages, reports, and rate limits.

insert into cryptogram.quotes (
  slug, plain_text, author, work_title, published_year, source_note, public_domain, sort_order
)
select
  v.slug, v.plain_text, v.author, v.work_title, v.published_year, v.source_note, v.public_domain, v.sort_order
from (
  values
    ('hamlet-to-be'::text, 'To be, or not to be, that is the question.'::text, 'William Shakespeare'::text, 'Hamlet'::text, 1604, 'US public domain. First published 1604. Public-domain edition.'::text, true, 1),
    ('hamlet-own-self', 'This above all: to thine own self be true.', 'William Shakespeare', 'Hamlet', 1604, 'US public domain. First published 1604. Public-domain edition.', true, 2),
    ('as-you-like-it-stage', 'All the world''s a stage, and all the men and women merely players.', 'William Shakespeare', 'As You Like It', 1623, 'US public domain. First published 1623. Public-domain edition.', true, 3),
    ('julius-caesar-ears', 'Friends, Romans, countrymen, lend me your ears.', 'William Shakespeare', 'Julius Caesar', 1623, 'US public domain. First published 1623. Public-domain edition.', true, 4),
    ('tempest-dreams', 'We are such stuff as dreams are made on, and our little life is rounded with a sleep.', 'William Shakespeare', 'The Tempest', 1623, 'US public domain. First published 1623. Public-domain edition.', true, 5),
    ('merchant-mercy', 'The quality of mercy is not strained.', 'William Shakespeare', 'The Merchant of Venice', 1600, 'US public domain. First published 1600. Public-domain edition.', true, 6),
    ('henry-band', 'We few, we happy few, we band of brothers.', 'William Shakespeare', 'Henry the Fifth', 1623, 'US public domain. First published 1623. Public-domain edition.', true, 7),
    ('macbeth-toil', 'Double, double toil and trouble.', 'William Shakespeare', 'Macbeth', 1623, 'US public domain. First published 1623. Public-domain edition.', true, 8),
    ('romeo-parting', 'Parting is such sweet sorrow.', 'William Shakespeare', 'Romeo and Juliet', 1599, 'US public domain. First published 1599. Public-domain edition.', true, 9),
    ('hamlet-brevity', 'Brevity is the soul of wit.', 'William Shakespeare', 'Hamlet', 1604, 'US public domain. First published 1604. Public-domain edition.', true, 10),
    ('franklin-early', 'Early to bed and early to rise makes a man healthy, wealthy, and wise.', 'Benjamin Franklin', 'Poor Richard Almanack', 1735, 'US public domain. Printed in Poor Richard Almanack between 1732 and 1758.', true, 11),
    ('franklin-lost-time', 'Lost time is never found again.', 'Benjamin Franklin', 'Poor Richard Almanack', 1748, 'US public domain. Printed in Poor Richard Almanack between 1732 and 1758.', true, 12),
    ('franklin-well-done', 'Well done is better than well said.', 'Benjamin Franklin', 'Poor Richard Almanack', 1737, 'US public domain. Printed in Poor Richard Almanack between 1732 and 1758.', true, 13),
    ('franklin-oaks', 'Little strokes fell great oaks.', 'Benjamin Franklin', 'Poor Richard Almanack', 1758, 'US public domain. Printed in Poor Richard Almanack between 1732 and 1758.', true, 14),
    ('austen-truth', 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', 'Jane Austen', 'Pride and Prejudice', 1813, 'US public domain. First published 1813. Public-domain edition.', true, 15),
    ('austen-tenderness', 'There is no charm equal to tenderness of heart.', 'Jane Austen', 'Emma', 1815, 'US public domain. First published 1815. Public-domain edition.', true, 16),
    ('austen-reading', 'I declare after all there is no enjoyment like reading!', 'Jane Austen', 'Pride and Prejudice', 1813, 'US public domain. First published 1813. Public-domain edition.', true, 17),
    ('declaration-equal', 'We hold these truths to be self-evident, that all men are created equal.', 'Continental Congress', 'Declaration of Independence', 1776, 'United States federal government work, 1776. Not protected by US copyright.', true, 18),
    ('paine-crisis', 'These are the times that try men''s souls.', 'Thomas Paine', 'The American Crisis', 1776, 'US public domain. First published 1776. Public-domain edition.', true, 19),
    ('lincoln-gettysburg', 'Four score and seven years ago our fathers brought forth on this continent a new nation, conceived in liberty, and dedicated to the proposition that all men are created equal.', 'Abraham Lincoln', 'Gettysburg Address', 1863, 'US public domain. First published 1863. Public-domain edition.', true, 20),
    ('lincoln-malice', 'With malice toward none, with charity for all.', 'Abraham Lincoln', 'Second Inaugural Address', 1865, 'US public domain. First published 1865. Public-domain edition.', true, 21),
    ('douglass-narrative', 'You have seen how a man was made a slave; you shall see how a slave was made a man.', 'Frederick Douglass', 'Narrative of the Life of Frederick Douglass', 1845, 'US public domain. First published 1845. Public-domain edition.', true, 22),
    ('dickens-cities', 'It was the best of times, it was the worst of times.', 'Charles Dickens', 'A Tale of Two Cities', 1859, 'US public domain. First published 1859. Public-domain edition.', true, 23),
    ('dickens-carol', 'God bless us, every one!', 'Charles Dickens', 'A Christmas Carol', 1843, 'US public domain. First published 1843. Public-domain edition.', true, 24),
    ('thoreau-desperation', 'The mass of men lead lives of quiet desperation.', 'Henry David Thoreau', 'Walden', 1854, 'US public domain. First published 1854. Public-domain edition.', true, 25),
    ('thoreau-woods', 'I went to the woods because I wished to live deliberately.', 'Henry David Thoreau', 'Walden', 1854, 'US public domain. First published 1854. Public-domain edition.', true, 26),
    ('dickinson-hope', 'Hope is the thing with feathers that perches in the soul.', 'Emily Dickinson', 'Poems', 1890, 'US public domain. First published 1890. Public-domain edition.', true, 27),
    ('whitman-multitudes', 'I am large, I contain multitudes.', 'Walt Whitman', 'Leaves of Grass', 1855, 'US public domain. First published 1855. Public-domain edition.', true, 28),
    ('poe-dream', 'All that we see or seem is but a dream within a dream.', 'Edgar Allan Poe', 'A Dream Within a Dream', 1849, 'US public domain. First published 1849. Public-domain edition.', true, 29),
    ('lazarus-colossus', 'Give me your tired, your poor, your huddled masses yearning to breathe free.', 'Emma Lazarus', 'The New Colossus', 1883, 'US public domain. First published 1883. Public-domain edition.', true, 30),
    ('carroll-beginning', 'Begin at the beginning, and go on till you come to the end: then stop.', 'Lewis Carroll', 'Alice''s Adventures in Wonderland', 1865, 'US public domain. First published 1865. Public-domain edition.', true, 31),
    ('doyle-impossible', 'How often have I said to you that when you have eliminated the impossible, whatever remains, however improbable, must be the truth?', 'Arthur Conan Doyle', 'The Sign of the Four', 1890, 'US public domain. First published 1890. Public-domain edition.', true, 32)
) as v(slug, plain_text, author, work_title, published_year, source_note, public_domain, sort_order)
where not exists (
  select 1 from cryptogram.quotes q where q.slug = v.slug
);

comment on table cryptogram.profiles is
  'CryptoGram-only age acknowledgement. Under 13 is never stored. A hub-level gate remains an open question.';

comment on table cryptogram.messages is
  'Friend deliveries for a later slice. screening_status is pending, cleared, held, or blocked. Plain text is not in this table. Sender and recipient use ON DELETE CASCADE; a report snapshot is the copy kept for review.';

comment on table cryptogram.reports is
  'Moderation reports kept after the reporter, reported sender, or message is deleted. reporter_id, sender_id, and message_id are ON DELETE SET NULL. message_text, message_coded, message_screening_status, and message_created_at are the review snapshot. Friendships, blocks, and rate_limit_counters stay ON DELETE CASCADE.';

notify pgrst, 'reload schema';

-- Verify after apply (run these yourself; they are comments so the migration stays one script):
-- select c.relname, c.relrowsecurity
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'cryptogram' and c.relkind = 'r'
-- order by 1;
--
-- select table_name, privilege_type, grantee
-- from information_schema.role_table_grants
-- where table_schema = 'cryptogram' and grantee in ('anon', 'public')
-- order by 1, 2;
--
-- select column_name
-- from information_schema.columns
-- where table_schema = 'cryptogram' and table_name = 'puzzles_public'
-- order by ordinal_position;
--
-- select count(*) from cryptogram.quotes where public_domain and published_year <= 1930;
--
-- select cryptogram.assign_daily_puzzle(cryptogram.denver_today());
-- select puzzle_date, unique_letter_count
-- from cryptogram.puzzles_public
-- where puzzle_date = cryptogram.denver_today();
