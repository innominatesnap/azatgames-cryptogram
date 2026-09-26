-- Hint catalog for CryptoGram Messenger.
-- Apply after 20260926120000_cryptogram_init.sql. Do not edit that file.
-- Target project: kfbgjpqgywenkfkfcoqf. A human applies this. The app does not.
--
-- cryptogram.request_hint is the only client path that reveals a board fact.
-- It returns one wrong cipher number, or one cipher/plain pair, or the
-- attribution. It does not return the quote. Authenticated only.
-- The function is security definer so it can read quotes, which have no
-- client policies. It still requires auth.uid() and only updates that
-- player's attempt.

alter table cryptogram.attempts
  add column if not exists hint_log jsonb not null default '[]'::jsonb;

alter table cryptogram.attempts
  add column if not exists attribution_unveiled boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attempts_hint_log_array'
      and conrelid = 'cryptogram.attempts'::regclass
  ) then
    alter table cryptogram.attempts
      add constraint attempts_hint_log_array check (jsonb_typeof(hint_log) = 'array');
  end if;
end
$$;

comment on column cryptogram.attempts.hint_log is
  'Hint types used on this attempt. Each item is {id, action}. Count stays in hints_used.';

comment on column cryptogram.attempts.attribution_unveiled is
  'True after the unveil-attribution hint. The quote text is still withheld.';

create or replace function cryptogram.protect_attempt_score()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if coalesce(current_setting('cryptogram.trusted_write', true), '') is distinct from 'on' then
    if tg_op = 'INSERT' then
      new.solved := false;
      new.gave_up := false;
      new.stars := null;
      new.points := null;
      new.hints_used := 0;
      new.solved_at := null;
      new.revealed_numbers := '{}'::int[];
      new.frequency_used := false;
      new.hint_log := '[]'::jsonb;
      new.attribution_unveiled := false;
    else
      new.solved := old.solved;
      new.gave_up := old.gave_up;
      new.stars := old.stars;
      new.points := old.points;
      new.hints_used := old.hints_used;
      new.solved_at := old.solved_at;
      new.revealed_numbers := old.revealed_numbers;
      new.frequency_used := old.frequency_used;
      new.hint_log := old.hint_log;
      new.attribution_unveiled := old.attribution_unveiled;
      new.user_id := old.user_id;
      new.puzzle_id := old.puzzle_id;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function cryptogram.request_hint(
  p_puzzle_id uuid,
  p_hint_type text,
  p_current_mapping jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  uid uuid := auth.uid();
  plain text;
  key_json jsonb;
  author text;
  work_title text;
  published_year integer;
  source_note text;
  mapping jsonb := '{}'::jsonb;
  solution jsonb := '{}'::jsonb;
  i int;
  len int;
  ch text;
  num text;
  pair record;
  wrong_numbers int[] := '{}';
  candidates int[] := '{}';
  chosen int;
  letter text;
  action text;
  note text;
  fallback boolean := false;
  hints integer;
  log jsonb;
  unveiled boolean;
  finished boolean;
  new_map jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  if p_hint_type not in ('find-mistake', 'reveal-letter', 'unveil-attribution') then
    raise exception 'unknown hint';
  end if;

  select q.plain_text, p.code_key, q.author, q.work_title, q.published_year, q.source_note
    into plain, key_json, author, work_title, published_year, source_note
  from cryptogram.puzzles p
  join cryptogram.quotes q on q.id = p.quote_id
  where p.id = p_puzzle_id;

  if plain is null then
    raise exception 'puzzle not found';
  end if;

  if jsonb_typeof(coalesce(p_current_mapping, '{}'::jsonb)) = 'object' then
    for pair in
      select t.key, t.value
      from jsonb_each_text(p_current_mapping) as t(key, value)
    loop
      if pair.key ~ '^[0-9]+$'
         and pair.key::int between 1 and 26
         and char_length(pair.value) = 1
         and upper(pair.value) ~ '^[A-Z]$' then
        mapping := mapping || jsonb_build_object(pair.key, upper(pair.value));
      end if;
    end loop;
  end if;

  len := char_length(plain);
  i := 1;
  while i <= len loop
    ch := upper(substr(plain, i, 1));
    if ch >= 'A' and ch <= 'Z' then
      num := key_json ->> ch;
      if num is not null then
        solution := solution || jsonb_build_object(num, ch);
      end if;
    end if;
    i := i + 1;
  end loop;

  perform cryptogram.ensure_attempt(uid, p_puzzle_id);

  select a.attribution_unveiled, (a.solved or a.gave_up), a.hints_used, a.hint_log
    into unveiled, finished, hints, log
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id
  for update;

  if finished then
    raise exception 'puzzle is already finished';
  end if;

  log := coalesce(log, '[]'::jsonb);

  if p_hint_type = 'unveil-attribution' then
    if not unveiled then
      log := log || jsonb_build_array(jsonb_build_object('id', p_hint_type, 'action', 'unveil'));
      hints := hints + 1;
    end if;
    perform set_config('cryptogram.trusted_write', 'on', true);
    update cryptogram.attempts
      set
        hint_log = log,
        hints_used = hints,
        attribution_unveiled = true,
        letter_mapping = mapping
      where user_id = uid and puzzle_id = p_puzzle_id;
    return jsonb_build_object(
      'hintType', p_hint_type,
      'action', 'unveil',
      'author', author,
      'work', work_title,
      'year', published_year,
      'sourceNote', source_note,
      'hintsUsed', hints,
      'hintLog', log,
      'note', case
        when unveiled then 'Author and source are already unveiled.'
        else 'Author and source unveiled.'
      end
    );
  end if;

  for pair in
    select t.key, t.value
    from jsonb_each_text(mapping) as t(key, value)
  loop
    if (solution ? pair.key) and upper(pair.value) is distinct from (solution ->> pair.key) then
      wrong_numbers := wrong_numbers || pair.key::int;
    end if;
  end loop;

  for pair in
    select t.key, t.value
    from jsonb_each_text(solution) as t(key, value)
  loop
    if upper(coalesce(mapping ->> pair.key, '')) is distinct from pair.value then
      candidates := candidates || pair.key::int;
    end if;
  end loop;

  if p_hint_type = 'find-mistake' and cardinality(wrong_numbers) > 0 then
    chosen := wrong_numbers[1 + floor(random() * cardinality(wrong_numbers))::int];
    action := 'mark';
    note := 'One wrong letter is marked.';
  elsif cardinality(candidates) = 0 then
    return jsonb_build_object(
      'hintType', p_hint_type,
      'action', 'none',
      'hintsUsed', hints,
      'hintLog', log,
      'note', 'Nothing left to reveal.'
    );
  else
    chosen := candidates[1 + floor(random() * cardinality(candidates))::int];
    letter := solution ->> chosen::text;
    action := 'reveal';
    fallback := p_hint_type = 'find-mistake';
    note := case
      when fallback then 'No mistakes found, here''s a letter'
      else 'A letter is filled in.'
    end;
    for pair in
      select t.key, t.value
      from jsonb_each_text(mapping) as t(key, value)
    loop
      if pair.value is distinct from letter and pair.key is distinct from chosen::text then
        new_map := new_map || jsonb_build_object(pair.key, pair.value);
      end if;
    end loop;
    new_map := new_map || jsonb_build_object(chosen::text, letter);
    mapping := new_map;
  end if;

  log := log || jsonb_build_array(jsonb_build_object('id', p_hint_type, 'action', action));
  hints := hints + 1;

  perform set_config('cryptogram.trusted_write', 'on', true);
  update cryptogram.attempts
    set
      letter_mapping = mapping,
      hints_used = hints,
      hint_log = log,
      revealed_numbers = case
        when action = 'reveal' and not (chosen = any (revealed_numbers)) then revealed_numbers || chosen
        else revealed_numbers
      end
    where user_id = uid and puzzle_id = p_puzzle_id;

  if action = 'mark' then
    return jsonb_build_object(
      'hintType', p_hint_type,
      'action', 'mark',
      'number', chosen,
      'hintsUsed', hints,
      'hintLog', log,
      'note', note
    );
  end if;

  return jsonb_build_object(
    'hintType', p_hint_type,
    'action', 'reveal',
    'number', chosen,
    'letter', letter,
    'fallback', fallback,
    'hintsUsed', hints,
    'hintLog', log,
    'note', note
  );
end;
$$;

comment on function cryptogram.request_hint(uuid, text, jsonb) is
  'Returns one hint fact for the signed-in player and logs it. Never returns the quote.';

-- Finished payloads now include the hint log so Solve Complete can name the types.
-- An unsolved confirm still returns only solved=false and a wrong count. It does
-- not return the quote. The client does not show that count.

create or replace function cryptogram.confirm_solve(
  p_puzzle_id uuid,
  p_mapping jsonb,
  p_elapsed_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
  log jsonb;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  select q.plain_text, p.code_key, p.unique_letter_count, p.longest_word
  into plain, key_json, unique_count, longest
  from cryptogram.puzzles p
  join cryptogram.quotes q on q.id = p.quote_id
  where p.id = p_puzzle_id;
  if plain is null then
    raise exception 'puzzle not found';
  end if;
  perform cryptogram.ensure_attempt(uid, p_puzzle_id);
  select a.hints_used, a.elapsed_ms, a.solved, a.gave_up, a.stars, a.points, a.hint_log
  into hints, elapsed, solved_flag, gave_flag, star_count, point_count, log
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id
  for update;
  if solved_flag or gave_flag then
    payload := cryptogram.quote_payload(p_puzzle_id);
    return payload || jsonb_build_object(
      'solved', solved_flag,
      'gaveUp', gave_flag,
      'stars', coalesce(star_count, 0),
      'points', coalesce(point_count, 0),
      'hintsUsed', hints,
      'hintLog', coalesce(log, '[]'::jsonb),
      'elapsedMs', elapsed,
      'ready', true
    );
  end if;
  graded := cryptogram.grade_mapping(plain, key_json, coalesce(p_mapping, '{}'::jsonb));
  wrong_count := (graded ->> 'wrongCount')::int;
  if wrong_count > 0 then
    return jsonb_build_object('solved', false, 'wrongCount', wrong_count);
  end if;
  elapsed := greatest(coalesce(p_elapsed_ms, 0), 0);
  star_count := cryptogram.stars_for(hints, false, elapsed, unique_count);
  point_count := cryptogram.points_for(star_count, unique_count, longest, 0);
  perform set_config('cryptogram.trusted_write', 'on', true);
  update cryptogram.attempts
  set
    letter_mapping = coalesce(p_mapping, '{}'::jsonb),
    elapsed_ms = elapsed,
    solved = true,
    gave_up = false,
    stars = star_count,
    points = point_count,
    solved_at = clock_timestamp()
  where user_id = uid and puzzle_id = p_puzzle_id;
  payload := cryptogram.quote_payload(p_puzzle_id);
  return payload || jsonb_build_object(
    'solved', true,
    'gaveUp', false,
    'stars', star_count,
    'points', point_count,
    'hintsUsed', hints,
    'hintLog', coalesce(log, '[]'::jsonb),
    'elapsedMs', elapsed,
    'ready', true
  );
end;
$$;

create or replace function cryptogram.give_up(p_puzzle_id uuid, p_elapsed_ms bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  uid uuid := auth.uid();
  hints integer;
  elapsed bigint;
  solved_flag boolean;
  payload jsonb;
  log jsonb;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  if not exists (select 1 from cryptogram.puzzles p where p.id = p_puzzle_id) then
    raise exception 'puzzle not found';
  end if;
  perform cryptogram.ensure_attempt(uid, p_puzzle_id);
  select a.hints_used, a.solved, a.hint_log into hints, solved_flag, log
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id
  for update;
  if solved_flag then
    return cryptogram.confirm_solve(p_puzzle_id, '{}'::jsonb, coalesce(p_elapsed_ms, 0));
  end if;
  elapsed := greatest(coalesce(p_elapsed_ms, 0), 0);
  perform set_config('cryptogram.trusted_write', 'on', true);
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
    'solved', false,
    'gaveUp', true,
    'stars', 0,
    'points', 0,
    'hintsUsed', hints,
    'hintLog', coalesce(log, '[]'::jsonb),
    'elapsedMs', elapsed,
    'ready', true
  );
end;
$$;

create or replace function cryptogram.solved_summary(p_puzzle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  uid uuid := auth.uid();
  hints integer;
  elapsed bigint;
  solved_flag boolean;
  gave_flag boolean;
  star_count integer;
  point_count integer;
  log jsonb;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  select a.hints_used, a.elapsed_ms, a.solved, a.gave_up, a.stars, a.points, a.hint_log
  into hints, elapsed, solved_flag, gave_flag, star_count, point_count, log
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id;
  if not found or (solved_flag = false and gave_flag = false) then
    return jsonb_build_object('ready', false);
  end if;
  return cryptogram.quote_payload(p_puzzle_id) || jsonb_build_object(
    'ready', true,
    'solved', solved_flag,
    'gaveUp', gave_flag,
    'stars', coalesce(star_count, 0),
    'points', coalesce(point_count, 0),
    'hintsUsed', hints,
    'hintLog', coalesce(log, '[]'::jsonb),
    'elapsedMs', elapsed
  );
end;
$$;

revoke all on function cryptogram.request_hint(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function cryptogram.request_hint(uuid, text, jsonb) to authenticated;

-- The old check listed every wrong number, and the old reveal let the client
-- pick any cipher number. Hints now go through request_hint only.
revoke all on function cryptogram.check_letters(uuid, jsonb) from public, anon, authenticated;
revoke all on function cryptogram.reveal_letter(uuid, integer) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Verify after apply (comments, so this file stays one script):
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'cryptogram'
--   and table_name = 'attempts'
--   and column_name in ('hint_log', 'attribution_unveiled');
--
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'cryptogram'
--   and routine_name = 'request_hint';
--
-- select routine_name
-- from information_schema.routine_privileges
-- where routine_schema = 'cryptogram'
--   and routine_name in ('check_letters', 'reveal_letter')
--   and grantee = 'authenticated';
