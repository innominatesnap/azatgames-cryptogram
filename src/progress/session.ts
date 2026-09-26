import { emptySolveState, normalizeMapping, type Mapping, type SolveState } from '../engine/solve';
import type { Attribution, HintRecord } from '../hints/records';
import type { SolveOutcome } from '../play/api';

export const AGE_KEY = 'cryptogram-age-ack';
export const AGE_VALUE = '13plus';
export const SESSION_KEY = 'cryptogram-session';
export const STATS_KEY = 'cryptogram-stats';

export function readAgeAck(storage: { getItem(key: string): string | null }): boolean {
  return storage.getItem(AGE_KEY) === AGE_VALUE;
}

export function writeAgeAck(storage: { setItem(key: string, value: string): void }): void {
  storage.setItem(AGE_KEY, AGE_VALUE);
}

function reviveMappingList(raw: unknown): Mapping[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeMapping(entry));
}

export function reviveSolveState(raw: unknown): SolveState | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<SolveState>;
  if (!row.present || typeof row.present !== 'object') return null;
  const revealed = Array.isArray(row.revealedNumbers)
    ? row.revealedNumbers.filter((value) => Number.isInteger(value))
    : [];
  const present = normalizeMapping(row.present);
  const revealedLetters = normalizeMapping(row.revealedLetters);
  for (const number of revealed) {
    if (!revealedLetters[number] && present[number]) revealedLetters[number] = present[number];
  }
  return {
    past: reviveMappingList(row.past),
    present: present,
    future: reviveMappingList(row.future),
    hintsUsed: typeof row.hintsUsed === 'number' && row.hintsUsed > 0 ? Math.floor(row.hintsUsed) : 0,
    hintPoints: reviveHintPoints(row),
    hintLog: reviveHintLog(row.hintLog),
    frequencyShown: row.frequencyShown === true,
    revealedNumbers: revealed as number[],
    revealedLetters: revealedLetters,
    crossedOff: reviveLetters(row.crossedOff),
    markedNumbers: reviveNumbers(row.markedNumbers),
    attributionStage: reviveStage(row),
    attributionUnveiled: reviveStage(row) > 0,
    attribution: reviveAttribution(row.attribution, reviveStage(row)),
    gaveUp: row.gaveUp === true,
    elapsedMs: typeof row.elapsedMs === 'number' && row.elapsedMs > 0 ? Math.floor(row.elapsedMs) : 0,
  };
}

function reviveHintLog(raw: unknown): HintRecord[] {
  if (!Array.isArray(raw)) return [];
  const next: HintRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { [key: string]: unknown };
    if (typeof row.id !== 'string' || !row.id) continue;
    next.push({
      id: row.id,
      action: typeof row.action === 'string' ? row.action : '',
      cost: typeof row.cost === 'number' ? row.cost : 1,
      requestId: typeof row.requestId === 'string' ? row.requestId : '',
    });
  }
  return next;
}

function reviveHintPoints(row: Partial<SolveState>): number {
  if (typeof row.hintPoints === 'number' && row.hintPoints > 0) return Math.floor(row.hintPoints);
  const log = reviveHintLog(row.hintLog);
  let sum = 0;
  for (const item of log) sum += item.cost;
  return sum;
}

function reviveNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value) => Number.isInteger(value)) as number[];
}

function reviveLetters(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const next: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || value.length !== 1) continue;
    const upper = value.toUpperCase();
    if (upper >= 'A' && upper <= 'Z' && next.indexOf(upper) === -1) next.push(upper);
  }
  return next;
}

function reviveStage(row: Partial<SolveState> & { attributionUnveiled?: boolean }): 0 | 1 | 2 {
  if (row.attributionStage === 0 || row.attributionStage === 1 || row.attributionStage === 2) return row.attributionStage;
  if (row.attribution && row.attribution.work) return 2;
  if (row.attributionUnveiled || (row.attribution && row.attribution.author)) return 1;
  return 0;
}

function reviveAttribution(raw: unknown, stage: 0 | 1 | 2): Attribution | null {
  if (stage === 0 || !raw || typeof raw !== 'object') return null;
  const row = raw as { [key: string]: unknown };
  const author = typeof row.author === 'string' ? row.author : '';
  const work = stage >= 2 && typeof row.work === 'string' ? row.work : '';
  const year = stage >= 2 && typeof row.year === 'number' ? row.year : 0;
  if (!author && !work) return null;
  return {
    author: author,
    work: work,
    year: year,
    sourceNote: '',
  };
}

export type SavedSession = {
  version: 1;
  puzzleKey: string;
  state: SolveState;
  finished: SolveOutcome | null;
};

export function readSavedSession(
  storage: { getItem(key: string): string | null },
  puzzleKey: string,
): { state: SolveState; finished: SolveOutcome | null } {
  const empty = { state: emptySolveState(), finished: null };
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (parsed.version !== 1 || parsed.puzzleKey !== puzzleKey) return empty;
    return {
      state: reviveSolveState(parsed.state) || emptySolveState(),
      finished: reviveOutcome(parsed.finished),
    };
  } catch {
    return empty;
  }
}

export function writeSavedSession(
  storage: { setItem(key: string, value: string): void },
  puzzleKey: string,
  state: SolveState,
  finished: SolveOutcome | null,
): void {
  const payload: SavedSession = { version: 1, puzzleKey: puzzleKey, state: state, finished: finished };
  storage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function reviveOutcome(raw: unknown): SolveOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<SolveOutcome>;
  if (!row.quote || typeof row.quote.plainText !== 'string' || typeof row.quote.author !== 'string') return null;
  if (typeof row.stars !== 'number' || typeof row.elapsedMs !== 'number') return null;
  return {
    solved: row.solved === true,
    gaveUp: row.gaveUp === true,
    stars: row.stars,
    points: typeof row.points === 'number' ? row.points : 0,
    hintsUsed: typeof row.hintsUsed === 'number' ? row.hintsUsed : 0,
    hintPoints: typeof row.hintPoints === 'number' ? row.hintPoints : 0,
    elapsedMs: row.elapsedMs,
    hintLog: reviveHintLog(row.hintLog),
    quote: row.quote,
    dateLabel: typeof row.dateLabel === 'string' ? row.dateLabel : 'Sample',
    letterCount: typeof row.letterCount === 'number' ? row.letterCount : 0,
  };
}

export type ProgressSide = {
  state: SolveState;
  elapsedMs: number;
  hintsUsed: number;
};

export function mergeProgress(local: SolveState | null, server: SolveState | null): SolveState {
  if (!local && !server) return emptySolveState();
  if (!local) return server || emptySolveState();
  if (!server) return local;
  const useLocal = local.elapsedMs >= server.elapsedMs;
  const mappingSource = useLocal ? local : server;
  const revealed: number[] = [];
  for (const number of local.revealedNumbers.concat(server.revealedNumbers)) {
    if (revealed.indexOf(number) === -1) revealed.push(number);
  }
  const revealedLetters = { ...server.revealedLetters, ...local.revealedLetters };
  const hintLog = local.hintPoints > server.hintPoints
    ? local.hintLog
    : server.hintPoints > local.hintPoints
      ? server.hintLog
      : (local.hintLog.length >= server.hintLog.length ? local.hintLog : server.hintLog);
  const stage = (local.attributionStage >= server.attributionStage ? local.attributionStage : server.attributionStage) as 0 | 1 | 2;
  const richer = local.attributionStage >= server.attributionStage ? local.attribution : server.attribution;
  const other = richer === local.attribution ? server.attribution : local.attribution;
  const attribution = richer || other;
  const crossed: string[] = [];
  for (const letter of local.crossedOff.concat(server.crossedOff)) {
    if (crossed.indexOf(letter) === -1) crossed.push(letter);
  }
  const marked: number[] = [];
  for (const number of local.markedNumbers.concat(server.markedNumbers)) {
    if (marked.indexOf(number) === -1) marked.push(number);
  }
  return {
    past: mappingSource.past,
    present: mappingSource.present,
    future: mappingSource.future,
    hintsUsed: Math.max(local.hintsUsed, server.hintsUsed),
    hintPoints: Math.max(local.hintPoints, server.hintPoints),
    hintLog: hintLog,
    frequencyShown: local.frequencyShown || server.frequencyShown,
    revealedNumbers: revealed,
    revealedLetters: revealedLetters,
    crossedOff: crossed,
    markedNumbers: marked,
    attributionStage: stage,
    attributionUnveiled: stage > 0,
    attribution: attribution,
    gaveUp: local.gaveUp || server.gaveUp,
    elapsedMs: Math.max(local.elapsedMs, server.elapsedMs),
  };
}
