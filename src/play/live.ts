import type { CryptogramClient } from '../lib/supabaseClient';
import { countFromWords, parseCoded } from '../engine/cipher';
import { emptySolveState, normalizeMapping, type Mapping, type SolveState } from '../engine/solve';
import { denverDateString } from '../lib/denverDate';
import type { ConfirmResult, PuzzleApi, QuoteInfo, SolveOutcome } from './api';

type PublicRow = {
  id: string;
  puzzle_date: string;
  coded: unknown;
  unique_letter_count: number;
  letter_count: number;
  longest_word: number;
};

function mappingJson(mapping: Mapping): { [key: string]: string } {
  const out: { [key: string]: string } = {};
  for (const key of Object.keys(mapping)) out[key] = mapping[Number(key)];
  return out;
}

function numberList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value) => Number.isInteger(value)) as number[];
}

function quoteFrom(raw: unknown): QuoteInfo {
  const row = (raw || {}) as { [key: string]: unknown };
  return {
    author: typeof row.author === 'string' ? row.author : '',
    work: typeof row.work === 'string' ? row.work : '',
    year: typeof row.year === 'number' ? row.year : 0,
    plainText: typeof row.plainText === 'string' ? row.plainText : '',
    sourceNote: typeof row.sourceNote === 'string' ? row.sourceNote : '',
  };
}

function outcomeFrom(raw: unknown, dateLabel: string, letterCount: number, elapsedMs: number): SolveOutcome {
  const row = (raw || {}) as { [key: string]: unknown };
  return {
    solved: row.solved === true && row.gaveUp !== true,
    gaveUp: row.gaveUp === true,
    stars: typeof row.stars === 'number' ? row.stars : 0,
    points: typeof row.points === 'number' ? row.points : 0,
    hintsUsed: typeof row.hintsUsed === 'number' ? row.hintsUsed : 0,
    elapsedMs: typeof row.elapsedMs === 'number' ? row.elapsedMs : elapsedMs,
    quote: quoteFrom(row),
    dateLabel: dateLabel,
    letterCount: letterCount,
  };
}

async function rpcBody(client: CryptogramClient, fn: string, args: { [key: string]: unknown }): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchTodayPuzzle(client: CryptogramClient): Promise<{
  row: PublicRow;
  words: ReturnType<typeof parseCoded>;
  counts: ReturnType<typeof countFromWords>;
}> {
  let date = denverDateString(new Date());
  try {
    const serverDate = await rpcBody(client, 'denver_today', {});
    if (typeof serverDate === 'string' && serverDate.length >= 10) date = serverDate.slice(0, 10);
  } catch {
    date = denverDateString(new Date());
  }
  const loaded = await selectPublic(client, date);
  if (loaded) return loaded;
  await rpcBody(client, 'assign_daily_puzzle', { p_date: date });
  const again = await selectPublic(client, date);
  if (!again) throw new Error('No daily quote is assigned for ' + date + '.');
  return again;
}

async function selectPublic(client: CryptogramClient, date: string) {
  const { data, error } = await client
    .from('puzzles_public')
    .select('id, puzzle_date, coded, unique_letter_count, letter_count, longest_word')
    .eq('puzzle_date', date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as PublicRow;
  const words = parseCoded(row.coded);
  return { row: row, words: words, counts: countFromWords(words) };
}

export async function fetchAttempt(client: CryptogramClient, puzzleId: string): Promise<SolveState & { solved: boolean }> {
  const { data, error } = await client
    .from('attempts')
    .select('letter_mapping, hints_used, elapsed_ms, solved, gave_up, frequency_used, revealed_numbers')
    .eq('puzzle_id', puzzleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ...emptySolveState(), solved: false };
  const row = data as { [key: string]: unknown };
  return {
    past: [],
    present: normalizeMapping(row.letter_mapping),
    future: [],
    hintsUsed: typeof row.hints_used === 'number' ? row.hints_used : 0,
    frequencyShown: row.frequency_used === true,
    revealedNumbers: numberList(row.revealed_numbers),
    gaveUp: row.gave_up === true,
    elapsedMs: typeof row.elapsed_ms === 'number' ? row.elapsed_ms : 0,
    solved: row.solved === true || row.gave_up === true,
  };
}

export async function fetchSolvedSummary(
  client: CryptogramClient,
  puzzleId: string,
  dateLabel: string,
  letterCount: number,
): Promise<SolveOutcome | null> {
  const data = await rpcBody(client, 'solved_summary', { p_puzzle_id: puzzleId });
  const row = (data || {}) as { [key: string]: unknown };
  if (row.ready !== true) return null;
  return outcomeFrom(row, dateLabel, letterCount, typeof row.elapsedMs === 'number' ? row.elapsedMs : 0);
}

export async function saveLiveProgress(
  client: CryptogramClient,
  userId: string,
  puzzleId: string,
  state: SolveState,
): Promise<void> {
  const { error } = await client.from('attempts').upsert(
    {
      user_id: userId,
      puzzle_id: puzzleId,
      letter_mapping: mappingJson(state.present),
      elapsed_ms: state.elapsedMs,
    },
    { onConflict: 'user_id,puzzle_id' },
  );
  if (error) throw new Error(error.message);
}

export function createLiveApi(
  client: CryptogramClient,
  puzzleId: string,
  dateLabel: string,
  letterCount: number,
): PuzzleApi {
  return {
    async check(mapping, hintsUsed) {
      const data = await rpcBody(client, 'check_letters', {
        p_puzzle_id: puzzleId,
        p_mapping: mappingJson(mapping),
      });
      const row = (data || {}) as { [key: string]: unknown };
      return {
        wrongNumbers: numberList(row.wrongNumbers),
        hintsUsed: typeof row.hintsUsed === 'number' ? row.hintsUsed : hintsUsed,
      };
    },
    async reveal(number, mapping, hintsUsed) {
      void mapping;
      const data = await rpcBody(client, 'reveal_letter', {
        p_puzzle_id: puzzleId,
        p_number: number,
      });
      const row = (data || {}) as { [key: string]: unknown };
      if (typeof row.letter !== 'string' || row.letter.length !== 1) {
        throw new Error('Reveal did not return a letter');
      }
      return {
        letter: row.letter.toUpperCase(),
        hintsUsed: typeof row.hintsUsed === 'number' ? row.hintsUsed : hintsUsed,
      };
    },
    async useFrequency(hintsUsed, alreadyShown) {
      if (alreadyShown) return { hintsUsed: hintsUsed };
      const data = await rpcBody(client, 'record_frequency_hint', { p_puzzle_id: puzzleId });
      const row = (data || {}) as { [key: string]: unknown };
      return { hintsUsed: typeof row.hintsUsed === 'number' ? row.hintsUsed : hintsUsed + 1 };
    },
    async confirm(mapping, elapsedMs, hintsUsed) {
      void hintsUsed;
      const data = await rpcBody(client, 'confirm_solve', {
        p_puzzle_id: puzzleId,
        p_mapping: mappingJson(mapping),
        p_elapsed_ms: elapsedMs,
      });
      const row = (data || {}) as { [key: string]: unknown };
      if (row.solved !== true) {
        return { solved: false, wrongCount: typeof row.wrongCount === 'number' ? row.wrongCount : 0 };
      }
      return { solved: true, outcome: outcomeFrom(row, dateLabel, letterCount, elapsedMs) };
    },
    async giveUp(elapsedMs, hintsUsed) {
      const data = await rpcBody(client, 'give_up', {
        p_puzzle_id: puzzleId,
        p_elapsed_ms: elapsedMs,
      });
      const outcome = outcomeFrom(data, dateLabel, letterCount, elapsedMs);
      outcome.gaveUp = true;
      outcome.solved = false;
      outcome.stars = 0;
      void hintsUsed;
      return outcome;
    },
  };
}

export type ConfirmShape = ConfirmResult;
