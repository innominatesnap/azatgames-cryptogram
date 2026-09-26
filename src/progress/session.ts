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
    hintLog: reviveHintLog(row.hintLog),
    frequencyShown: row.frequencyShown === true,
    revealedNumbers: revealed as number[],
    revealedLetters: revealedLetters,
    attributionUnveiled: row.attributionUnveiled === true,
    attribution: reviveAttribution(row.attribution),
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
    next.push({ id: row.id, action: typeof row.action === 'string' ? row.action : '' });
  }
  return next;
}

function reviveAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as { [key: string]: unknown };
  if (typeof row.author !== 'string' || typeof row.work !== 'string') return null;
  return {
    author: row.author,
    work: row.work,
    year: typeof row.year === 'number' ? row.year : 0,
    sourceNote: typeof row.sourceNote === 'string' ? row.sourceNote : '',
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
  const hintLog = local.hintsUsed > server.hintsUsed
    ? local.hintLog
    : server.hintsUsed > local.hintsUsed
      ? server.hintLog
      : (local.hintLog.length >= server.hintLog.length ? local.hintLog : server.hintLog);
  const attribution = (local.attributionUnveiled && local.attribution) || server.attribution || local.attribution;
  return {
    past: mappingSource.past,
    present: mappingSource.present,
    future: mappingSource.future,
    hintsUsed: Math.max(local.hintsUsed, server.hintsUsed),
    hintLog: hintLog,
    frequencyShown: local.frequencyShown || server.frequencyShown,
    revealedNumbers: revealed,
    revealedLetters: revealedLetters,
    attributionUnveiled: local.attributionUnveiled || server.attributionUnveiled,
    attribution: attribution,
    gaveUp: local.gaveUp || server.gaveUp,
    elapsedMs: Math.max(local.elapsedMs, server.elapsedMs),
  };
}
