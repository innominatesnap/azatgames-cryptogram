import { shiftDate } from '../lib/denverDate';
import { STATS_KEY } from './session';

export type SolveRecord = {
  puzzleKey: string;
  date: string;
  stars: number;
  elapsedMs: number;
  hintsUsed: number;
  /** Missing on older saves. Those count as clean only when hintsUsed is 0 and stars are above 0. */
  hintPoints?: number;
  letterCount: number;
};

export type StatsSummary = {
  solves: number;
  averageMs: number | null;
  streak: number;
  cleanStreak: number;
  lettersSolved: number;
  hintsUsed: number;
  starsThisWeek: number;
};

export function readStats(storage: { getItem(key: string): string | null }): SolveRecord[] {
  const raw = storage.getItem(STATS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { solves?: SolveRecord[] };
    if (!parsed || !Array.isArray(parsed.solves)) return [];
    return parsed.solves.filter((row) => row && typeof row.puzzleKey === 'string' && typeof row.date === 'string');
  } catch {
    return [];
  }
}

export function writeStats(storage: { setItem(key: string, value: string): void }, records: SolveRecord[]): void {
  storage.setItem(STATS_KEY, JSON.stringify({ version: 1, solves: records }));
}

export function rememberSolve(records: SolveRecord[], next: SolveRecord): SolveRecord[] {
  for (const row of records) {
    if (row.puzzleKey === next.puzzleKey) return records;
  }
  return records.concat([next]);
}

export function summarizeStats(records: SolveRecord[], today: string): StatsSummary {
  let elapsed = 0;
  let letters = 0;
  let hints = 0;
  let starsThisWeek = 0;
  const dates: string[] = [];
  const weekStart = shiftDate(today, -6);
  for (const row of records) {
    elapsed += row.elapsedMs;
    letters += row.letterCount;
    hints += row.hintsUsed;
    dates.push(row.date);
    if (row.date >= weekStart && row.date <= today) starsThisWeek += row.stars;
  }
  return {
    solves: records.length,
    averageMs: records.length ? Math.round(elapsed / records.length) : null,
    streak: streakFromDates(dates, today),
    cleanStreak: cleanStreakFrom(records, today),
    lettersSolved: letters,
    hintsUsed: hints,
    starsThisWeek: starsThisWeek,
  };
}

export function isCleanRecord(row: SolveRecord): boolean {
  if (row.stars <= 0) return false;
  if (typeof row.hintPoints === 'number') return row.hintPoints === 0;
  return row.hintsUsed === 0;
}

export function cleanStreakFrom(records: SolveRecord[], today: string): number {
  const dates: string[] = [];
  for (const row of records) {
    if (isCleanRecord(row)) dates.push(row.date);
  }
  return streakFromDates(dates, today);
}

export function streakFromDates(dates: string[], today: string): number {
  const have: { [date: string]: boolean } = {};
  for (const date of dates) have[date] = true;
  let cursor = today;
  if (!have[cursor]) {
    cursor = shiftDate(today, -1);
    if (!have[cursor]) return 0;
  }
  let count = 0;
  while (have[cursor]) {
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}
