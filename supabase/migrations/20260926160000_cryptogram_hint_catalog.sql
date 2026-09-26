-- Hint catalog prices, hint points, and a confirm that does not leak a wrong count.
-- Apply after 20260926143000_cryptogram_hints.sql. Do not edit earlier files.
-- Target project: kfbgjpqgywenkfkfcoqf. A human applies this. The app does not.
--
-- Prices and caps match src/hints/config.ts. Edit both together.
-- cryptogram.hint_catalog holds the prices. cryptogram.scoring_rules holds
-- star thresholds, the cross-off batch, the reveal cap, and the rate limit.
-- stars_for still uses the seeded literals (0 / 2 hint points, 20s par) so it
-- can stay immutable. confirm_solve passes hint_points into stars_for.
--
-- C9: an unsolved confirm_solve returns only {"solved": false}. It does not
-- return how many letters are off. That count was a free oracle around hint
-- prices. The quote is still returned after a real solve or give-up.
--
-- request_hint never returns plaintext. Author and source are separate stages.
-- A repeated p_request_id returns the stored response and does not charge again.
-- Picks use md5, not random(), so a replay of the same board does not re-roll.

create table if not exists cryptogram.hint_catalog (
  id text primary key,
  category text not null,
  title text not null,
  price integer not null,
  max_uses integer,
  charge text not null,
  stub boolean not null default false,
  constraint hint_catalog_price check (price >= 0),
  constraint hint_catalog_charge check (charge in ('once', 'per-use', 'stage'))
);

create table if not exists cryptogram.scoring_rules (
  id text primary key,
  three_star_max_points integer not null,
  two_star_max_points integer not null,
  par_seconds integer not null,
  cross_off_batch integer not null,
  reveal_divisor integer not null,
  reveal_min integer not null,
  reveal_max integer not null,
  rate_limit_count integer not null,
  rate_limit_seconds integer not null
);

insert into cryptogram.hint_catalog (id, category, title, price, max_uses, charge, stub)
values
  ('frequency-chart', 'analysis', 'Letter frequency chart', 1, 1, 'once', false),
  ('word-patterns', 'analysis', 'Word patterns', 1, 1, 'once', true),
  ('short-words', 'analysis', 'Short words and endings', 1, 1, 'once', true),
  ('cross-off', 'narrow', 'Cross off unused letters', 1, null, 'per-use', false),
  ('mark-one', 'placement', 'Mark one wrong letter', 1, 5, 'per-use', false),
  ('check-all', 'placement', 'Check all my letters', 2, 2, 'per-use', false),
  ('surprise-letter', 'reveal', 'Surprise letter', 2, null, 'per-use', false),
  ('pick-letter', 'reveal', 'Reveal a letter you pick', 3, null, 'per-use', false),
  ('reveal-word', 'reveal', 'Reveal a word', 4, null, 'per-use', true),
  ('unveil-author', 'context', 'Unveil the author', 1, 1, 'stage', false),
  ('unveil-source', 'context', 'Unveil the source', 1, 1, 'stage', false)
on conflict (id) do update set
  category = excluded.category,
  title = excluded.title,
  price = excluded.price,
  max_uses = excluded.max_uses,
  charge = excluded.charge,
  stub = excluded.stub;

insert into cryptogram.scoring_rules (
  id, three_star_max_points, two_star_max_points, par_seconds,
  cross_off_batch, reveal_divisor, reveal_min, reveal_max,
  rate_limit_count, rate_limit_seconds
) values ('default', 0, 2, 20, 4, 3, 1, 4, 40, 10)
on conflict (id) do update set
  three_star_max_points = excluded.three_star_max_points,
  two_star_max_points = excluded.two_star_max_points,
  par_seconds = excluded.par_seconds,
  cross_off_batch = excluded.cross_off_batch,
  reveal_divisor = excluded.reveal_divisor,
  reveal_min = excluded.reveal_min,
  reveal_max = excluded.reveal_max,
  rate_limit_count = excluded.rate_limit_count,
  rate_limit_seconds = excluded.rate_limit_seconds;

revoke all on table cryptogram.hint_catalog from public, anon, authenticated;
revoke all on table cryptogram.scoring_rules from public, anon, authenticated;
alter table cryptogram.hint_catalog enable row level security;
alter table cryptogram.scoring_rules enable row level security;

comment on table cryptogram.hint_catalog is
  'Hint point prices. Mirror of src/hints/config.ts. Not granted to clients.';
comment on table cryptogram.scoring_rules is
  'Star thresholds and caps. Mirror of src/hints/config.ts. Not granted to clients.';

alter table cryptogram.attempts
  add column if not exists hint_points integer not null default 0;

alter table cryptogram.attempts
  add column if not exists crossed_off text[] not null default '{}';

alter table cryptogram.attempts
  add column if not exists attribution_stage integer not null default 0;

alter table cryptogram.attempts
  add column if not exists marked_numbers integer[] not null default '{}';

alter table cryptogram.attempts
  add column if not exists hint_receipts jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attempts_hint_points' and conrelid = 'cryptogram.attempts'::regclass
  ) then
    alter table cryptogram.attempts
      add constraint attempts_hint_points check (hint_points >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'attempts_attribution_stage' and conrelid = 'cryptogram.attempts'::regclass
  ) then
    alter table cryptogram.attempts
      add constraint attempts_attribution_stage check (attribution_stage between 0 and 2);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'attempts_hint_receipts_array' and conrelid = 'cryptogram.attempts'::regclass
  ) then
    alter table cryptogram.attempts
      add constraint attempts_hint_receipts_array check (jsonb_typeof(hint_receipts) = 'array');
  end if;
end
$$;

comment on column cryptogram.attempts.hint_points is
  'Sum of charged hint prices. Stars use this, not hints_used.';
comment on column cryptogram.attempts.attribution_stage is
  '0 hidden, 1 author, 2 author plus source. The quote stays withheld.';

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
      new.hint_points := 0;
      new.solved_at := null;
      new.revealed_numbers := '{}'::int[];
      new.frequency_used := false;
      new.hint_log := '[]'::jsonb;
      new.attribution_unveiled := false;
      new.attribution_stage := 0;
      new.crossed_off := '{}'::text[];
      new.marked_numbers := '{}'::int[];
      new.hint_receipts := '[]'::jsonb;
    else
      new.solved := old.solved;
      new.gave_up := old.gave_up;
      new.stars := old.stars;
      new.points := old.points;
      new.hints_used := old.hints_used;
      new.hint_points := old.hint_points;
      new.solved_at := old.solved_at;
      new.revealed_numbers := old.revealed_numbers;
      new.frequency_used := old.frequency_used;
      new.hint_log := old.hint_log;
      new.attribution_unveiled := old.attribution_unveiled;
      new.attribution_stage := old.attribution_stage;
      new.crossed_off := old.crossed_off;
      new.marked_numbers := old.marked_numbers;
      new.hint_receipts := old.hint_receipts;
      new.user_id := old.user_id;
      new.puzzle_id := old.puzzle_id;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- p_hints is hint points. 0 inside par is 3 stars. 0 over par or 1-2 points is 2.
-- 3 or more points is 1. Give-up is 0. Literals match scoring_rules id default.
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
as $$
declare
  par_ms bigint;
  unique_count integer;
  points integer;
begin
  if p_gave_up then
    return 0;
  end if;
  points := coalesce(p_hints, 0);
  unique_count := p_unique;
  if unique_count < 1 then
    unique_count := 1;
  end if;
  par_ms := unique_count::bigint * 20 * 1000;
  if points <= 0 and coalesce(p_elapsed_ms, 0) <= par_ms then
    return 3;
  end if;
  if points <= 2 then
    return 2;
  end if;
  return 1;
end;
$$;

drop function if exists cryptogram.request_hint(uuid, text, jsonb);

create or replace function cryptogram.request_hint(
  p_puzzle_id uuid,
  p_hint_type text,
  p_current_mapping jsonb,
  p_request_id text default '',
  p_number integer default null
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
  unique_count integer;
  price integer;
  max_uses integer;
  is_stub boolean;
  mapping jsonb := '{}'::jsonb;
  solution jsonb := '{}'::jsonb;
  pair record;
  i int;
  len int;
  ch text;
  num text;
  hints integer;
  hint_point_total integer;
  log jsonb;
  receipts jsonb;
  stored jsonb;
  stage integer;
  unveiled boolean;
  finished boolean;
  frequency boolean;
  revealed int[];
  marked int[];
  crossed text[];
  placed integer;
  uses integer;
  wrong_numbers int[] := '{}';
  open_numbers int[] := '{}';
  candidates int[] := '{}';
  unused text[] := '{}';
  picked text[] := '{}';
  chosen int;
  letter text;
  note text;
  hint_action text := 'none';
  charged boolean := false;
  cost integer := 0;
  response jsonb;
  lim integer;
  secs integer;
  hits integer;
  win_start timestamptz;
  cap integer;
  raw_cap integer;
  batch integer;
  seed text;
  new_map jsonb;
  alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
begin
  if uid is null then
    raise exception 'sign in required';
  end if;

  select q.plain_text, p.code_key, q.author, q.work_title, q.published_year, p.unique_letter_count
    into plain, key_json, author, work_title, published_year, unique_count
  from cryptogram.puzzles p
  join cryptogram.quotes q on q.id = p.quote_id
  where p.id = p_puzzle_id;

  if plain is null then
    raise exception 'puzzle not found';
  end if;

  select c.price, c.max_uses, c.stub
    into price, max_uses, is_stub
  from cryptogram.hint_catalog c
  where c.id = p_hint_type;

  if price is null then
    raise exception 'unknown hint';
  end if;

  perform cryptogram.ensure_attempt(uid, p_puzzle_id);

  select
    a.hints_used, a.hint_points, a.hint_log, a.hint_receipts, a.attribution_stage,
    a.attribution_unveiled, (a.solved or a.gave_up), a.frequency_used,
    a.revealed_numbers, a.marked_numbers, a.crossed_off
  into
    hints, hint_point_total, log, receipts, stage,
    unveiled, finished, frequency,
    revealed, marked, crossed
  from cryptogram.attempts a
  where a.user_id = uid and a.puzzle_id = p_puzzle_id
  for update;

  if finished then
    raise exception 'puzzle is already finished';
  end if;

  log := coalesce(log, '[]'::jsonb);
  receipts := coalesce(receipts, '[]'::jsonb);
  revealed := coalesce(revealed, '{}'::int[]);
  marked := coalesce(marked, '{}'::int[]);
  crossed := coalesce(crossed, '{}'::text[]);
  stage := coalesce(stage, 0);
  hints := coalesce(hints, 0);
  hint_point_total := coalesce(hint_point_total, 0);

  if coalesce(p_request_id, '') <> '' then
    select elem -> 'response' into stored
    from jsonb_array_elements(receipts) elem
    where elem ->> 'requestId' = p_request_id
    limit 1;
    if stored is not null then
      return stored;
    end if;
  end if;

  select r.rate_limit_count, r.rate_limit_seconds, r.cross_off_batch,
         r.reveal_divisor, r.reveal_min, r.reveal_max
    into lim, secs, batch, raw_cap, cap, chosen
  from cryptogram.scoring_rules r
  where r.id = 'default';

  win_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / secs) * secs);
  select c.hit_count into hits
  from cryptogram.rate_limit_counters c
  where c.user_id = uid and c.action = 'request_hint' and c.window_start = win_start;
  if coalesce(hits, 0) >= lim then
    raise exception 'Slow down a moment.';
  end if;
  insert into cryptogram.rate_limit_counters (user_id, action, window_start, hit_count)
  values (uid, 'request_hint', win_start, 1)
  on conflict (user_id, action, window_start)
  do update set hit_count = cryptogram.rate_limit_counters.hit_count + 1;

  -- reveal_min landed in cap, reveal_max landed in chosen. Re-read cleanly.
  select r.reveal_min, r.reveal_max into cap, raw_cap
  from cryptogram.scoring_rules r
  where r.id = 'default';
  raw_cap := floor(unique_count::numeric / (
    select r.reveal_divisor from cryptogram.scoring_rules r where r.id = 'default'
  ))::int;
  if raw_cap < cap then
    raw_cap := cap;
  elsif raw_cap > (
    select r.reveal_max from cryptogram.scoring_rules r where r.id = 'default'
  ) then
    raw_cap := (select r.reveal_max from cryptogram.scoring_rules r where r.id = 'default');
  end if;
  cap := raw_cap;

  if is_stub then
    response := jsonb_build_object(
      'hintType', p_hint_type,
      'action', 'none',
      'charged', false,
      'cost', 0,
      'hintsUsed', hints,
      'hintPoints', hint_point_total,
      'hintLog', log,
      'note', 'Not in this version.',
      'numbers', '[]'::jsonb,
      'letters', '[]'::jsonb
    );
    if coalesce(p_request_id, '') <> '' then
      perform set_config('cryptogram.trusted_write', 'on', true);
      update cryptogram.attempts
        set hint_receipts = receipts || jsonb_build_array(jsonb_build_object('requestId', p_request_id, 'response', response))
        where user_id = uid and puzzle_id = p_puzzle_id;
    end if;
    return response;
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
      if num is not null and not (solution ? num) then
        solution := solution || jsonb_build_object(num, ch);
      end if;
    end if;
    i := i + 1;
  end loop;

  select count(*) into uses
  from jsonb_array_elements(log) elem
  where elem ->> 'id' = p_hint_type
    and coalesce((elem ->> 'cost')::int, 0) > 0;

  if max_uses is not null and uses >= max_uses and p_hint_type <> 'frequency-chart' then
    response := jsonb_build_object(
      'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
      'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
      'note', 'No uses left.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
    );
    return response;
  end if;

  select count(*) into placed from jsonb_object_keys(mapping);

  if p_hint_type in ('mark-one', 'check-all') then
    if placed = 0 then
      return jsonb_build_object(
        'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
        'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
        'note', 'Place a letter first.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
      );
    end if;
    for pair in select t.key, t.value from jsonb_each_text(mapping) as t(key, value) loop
      if (solution ? pair.key) and upper(pair.value) is distinct from (solution ->> pair.key) then
        wrong_numbers := wrong_numbers || pair.key::int;
      end if;
    end loop;
    if cardinality(wrong_numbers) = 0 then
      hint_action := 'mark';
      charged := true;
      cost := price;
      note := 'Every letter you have placed so far is right.';
    elsif p_hint_type = 'mark-one' then
      open_numbers := '{}';
      foreach chosen in array wrong_numbers loop
        if not chosen = any (marked) then
          open_numbers := open_numbers || chosen;
        end if;
      end loop;
      if cardinality(open_numbers) = 0 then
        return jsonb_build_object(
          'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
          'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
          'note', 'Those wrong letters are already marked.',
          'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
        );
      end if;
      seed := p_puzzle_id::text || '|' || mapping::text || '|' || uses::text;
      select n into chosen
      from unnest(open_numbers) as n
      order by md5(seed || ':' || n::text), n
      limit 1;
      marked := marked || chosen;
      wrong_numbers := array[chosen];
      hint_action := 'mark';
      charged := true;
      cost := price;
      note := 'One wrong letter marked. Other letters may still be wrong.';
    else
      foreach chosen in array wrong_numbers loop
        if not chosen = any (marked) then
          marked := marked || chosen;
        end if;
      end loop;
      hint_action := 'mark';
      charged := true;
      cost := price;
      note := cardinality(wrong_numbers)::text || case
        when cardinality(wrong_numbers) = 1 then ' wrong letter marked.'
        else ' wrong letters marked.'
      end;
    end if;
  elsif p_hint_type = 'frequency-chart' then
    hint_action := 'frequency';
    if frequency then
      note := 'The chart is open.';
    else
      charged := true;
      cost := price;
      frequency := true;
      note := 'Frequency chart opened.';
    end if;
  elsif p_hint_type = 'cross-off' then
    i := 1;
    while i <= 26 loop
      ch := substr(alphabet, i, 1);
      if not exists (
        select 1 from jsonb_each_text(solution) s where s.value = ch
      ) and not ch = any (crossed) then
        unused := unused || ch;
      end if;
      i := i + 1;
    end loop;
    if cardinality(unused) = 0 then
      return jsonb_build_object(
        'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
        'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
        'note', 'Nothing left to cross off.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
      );
    end if;
    seed := p_puzzle_id::text || '|cross|' || uses::text;
    select coalesce(array_agg(ch), '{}'::text[]) into picked
    from (
      select ch
      from unnest(unused) as ch
      order by md5(seed || ':' || ch), ch
      limit batch
    ) s;
    crossed := crossed || picked;
    hint_action := 'cross-off';
    charged := true;
    cost := price;
    note := 'Crossed off: ' || array_to_string(picked, ', ') || '.';
  elsif p_hint_type = 'surprise-letter' or p_hint_type = 'pick-letter' then
    if cardinality(revealed) >= cap then
      return jsonb_build_object(
        'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
        'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
        'note', 'Reveal limit reached.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
      );
    end if;
    if p_hint_type = 'pick-letter' then
      if p_number is null or not (solution ? p_number::text) then
        return jsonb_build_object(
          'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
          'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
          'note', 'Tap a letter in this puzzle.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
        );
      end if;
      if p_number = any (revealed) then
        return jsonb_build_object(
          'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
          'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
          'note', 'That letter is already revealed.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
        );
      end if;
      chosen := p_number;
    else
      for pair in select t.key, t.value from jsonb_each_text(solution) as t(key, value) loop
        if upper(coalesce(mapping ->> pair.key, '')) is distinct from pair.value
           and not pair.key::int = any (revealed) then
          candidates := candidates || pair.key::int;
        end if;
      end loop;
      if cardinality(candidates) = 0 then
        return jsonb_build_object(
          'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
          'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
          'note', 'Nothing left to reveal.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
        );
      end if;
      seed := p_puzzle_id::text || '|surprise|' || uses::text;
      select n into chosen
      from unnest(candidates) as n
      order by md5(seed || ':' || n::text), n
      limit 1;
    end if;
    letter := solution ->> chosen::text;
    new_map := '{}'::jsonb;
    for pair in select t.key, t.value from jsonb_each_text(mapping) as t(key, value) loop
      if pair.value is distinct from letter and pair.key is distinct from chosen::text then
        new_map := new_map || jsonb_build_object(pair.key, pair.value);
      end if;
    end loop;
    mapping := new_map || jsonb_build_object(chosen::text, letter);
    if not chosen = any (revealed) then
      revealed := revealed || chosen;
    end if;
    marked := array_remove(marked, chosen);
    wrong_numbers := array[chosen];
    hint_action := 'reveal';
    charged := true;
    cost := price;
    note := 'Revealed: ' || chosen::text || ' is ' || letter || '.';
  elsif p_hint_type = 'unveil-author' then
    hint_action := 'author';
    if stage >= 1 then
      note := 'Author already unveiled.';
    else
      charged := true;
      cost := price;
      stage := 1;
      unveiled := true;
      note := 'Author unveiled.';
    end if;
  elsif p_hint_type = 'unveil-source' then
    if stage < 1 then
      return jsonb_build_object(
        'hintType', p_hint_type, 'action', 'none', 'charged', false, 'cost', 0,
        'hintsUsed', hints, 'hintPoints', hint_point_total, 'hintLog', log,
        'note', 'Unveil the author first.', 'numbers', '[]'::jsonb, 'letters', '[]'::jsonb
      );
    end if;
    hint_action := 'source';
    if stage >= 2 then
      note := 'Source already unveiled.';
    else
      charged := true;
      cost := price;
      stage := 2;
      unveiled := true;
      note := 'Source unveiled.';
    end if;
  else
    raise exception 'unknown hint';
  end if;

  if charged then
    hints := hints + 1;
    hint_point_total := hint_point_total + cost;
    log := log || jsonb_build_array(jsonb_build_object(
      'id', p_hint_type,
      'action', hint_action,
      'cost', cost,
      'requestId', coalesce(p_request_id, '')
    ));
  end if;

  response := jsonb_build_object(
    'hintType', p_hint_type,
    'action', hint_action,
    'charged', charged,
    'cost', cost,
    'hintsUsed', hints,
    'hintPoints', hint_point_total,
    'hintLog', log,
    'note', note,
    'numbers', coalesce(to_jsonb(wrong_numbers), '[]'::jsonb),
    'letters', coalesce(to_jsonb(picked), '[]'::jsonb),
    'letter', coalesce(letter, '')
  );

  if hint_action = 'author' then
    response := response || jsonb_build_object('author', author);
  elsif hint_action = 'source' then
    response := response || jsonb_build_object('work', work_title, 'year', published_year);
  end if;

  if coalesce(p_request_id, '') <> '' then
    receipts := receipts || jsonb_build_array(jsonb_build_object('requestId', p_request_id, 'response', response));
  end if;

  perform set_config('cryptogram.trusted_write', 'on', true);
  update cryptogram.attempts
    set
      letter_mapping = mapping,
      hints_used = hints,
      hint_points = hint_point_total,
      hint_log = log,
      hint_receipts = receipts,
      frequency_used = frequency,
      revealed_numbers = revealed,
      marked_numbers = marked,
      crossed_off = crossed,
      attribution_stage = stage,
      attribution_unveiled = unveiled
    where user_id = uid and puzzle_id = p_puzzle_id;

  return response;
end;
$$;

comment on function cryptogram.request_hint(uuid, text, jsonb, text, integer) is
  'One catalog hint for the signed-in player. Never returns the quote. Prices come from hint_catalog.';

revoke all on function cryptogram.request_hint(uuid, text, jsonb, text, integer) from public, anon, authenticated;
grant execute on function cryptogram.request_hint(uuid, text, jsonb, text, integer) to authenticated;

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
  points integer;
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
  select a.hints_used, a.hint_points, a.elapsed_ms, a.solved, a.gave_up, a.stars, a.points, a.hint_log
  into hints, points, elapsed, solved_flag, gave_flag, star_count, point_count, log
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
      'hintPoints', coalesce(points, 0),
      'hintLog', coalesce(log, '[]'::jsonb),
      'elapsedMs', elapsed,
      'ready', true
    );
  end if;
  graded := cryptogram.grade_mapping(plain, key_json, coalesce(p_mapping, '{}'::jsonb));
  wrong_count := (graded ->> 'wrongCount')::int;
  if wrong_count > 0 then
    return jsonb_build_object('solved', false);
  end if;
  elapsed := greatest(coalesce(p_elapsed_ms, 0), 0);
  star_count := cryptogram.stars_for(coalesce(points, 0), false, elapsed, unique_count);
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
    'hintPoints', coalesce(points, 0),
    'hintLog', coalesce(log, '[]'::jsonb),
    'elapsedMs', elapsed,
    'ready', true
  );
end;
$$;

comment on function cryptogram.confirm_solve(uuid, jsonb, bigint) is
  'Unsolved returns only solved=false (C9). No wrong-letter count. Quote only after a real solve.';

create or replace function cryptogram.give_up(p_puzzle_id uuid, p_elapsed_ms bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  uid uuid := auth.uid();
  hints integer;
  points integer;
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
  select a.hints_used, a.hint_points, a.solved, a.hint_log
  into hints, points, solved_flag, log
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
    'hintPoints', coalesce(points, 0),
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
  points integer;
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
  select a.hints_used, a.hint_points, a.elapsed_ms, a.solved, a.gave_up, a.stars, a.points, a.hint_log
  into hints, points, elapsed, solved_flag, gave_flag, star_count, point_count, log
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
    'hintPoints', coalesce(points, 0),
    'hintLog', coalesce(log, '[]'::jsonb),
    'elapsedMs', elapsed
  );
end;
$$;

notify pgrst, 'reload schema';

-- Verify after apply:
-- select id, price, max_uses, stub from cryptogram.hint_catalog order by id;
-- select two_star_max_points, cross_off_batch, reveal_max from cryptogram.scoring_rules;
-- select column_name from information_schema.columns
--   where table_schema = 'cryptogram' and table_name = 'attempts'
--   and column_name in ('hint_points', 'crossed_off', 'attribution_stage', 'marked_numbers', 'hint_receipts');
-- select proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'cryptogram' and proname = 'request_hint';
