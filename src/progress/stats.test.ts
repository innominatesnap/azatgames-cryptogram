import { describe, expect, it } from 'vitest';
import { cleanStreakFrom, rememberSolve, streakFromDates, summarizeStats, type SolveRecord } from './stats';

function row(overrides: Partial<SolveRecord>): SolveRecord {
  return {
    puzzleKey: 'p1',
    date: '2026-09-26',
    stars: 3,
    elapsedMs: 60000,
    hintsUsed: 0,
    letterCount: 20,
    ...overrides,
  };
}

describe('stats', () => {
  it('counts a streak through today, or through yesterday if today is open', () => {
    expect(streakFromDates(['2026-09-26', '2026-09-25', '2026-09-24'], '2026-09-26')).toBe(3);
    expect(streakFromDates(['2026-09-25', '2026-09-24'], '2026-09-26')).toBe(2);
    expect(streakFromDates(['2026-09-23'], '2026-09-26')).toBe(0);
    expect(streakFromDates(['2026-09-26', '2026-09-26'], '2026-09-26')).toBe(1);
  });

  it('keeps the first solve for a puzzle and sums this week', () => {
    const first = row({ puzzleKey: 'daily', stars: 2, date: '2026-09-20' });
    const kept = rememberSolve(rememberSolve([], first), row({ puzzleKey: 'daily', stars: 3 }));
    expect(kept).toEqual([first]);
    const summary = summarizeStats(
      [
        first,
        row({ puzzleKey: 'older', date: '2026-09-01', stars: 3, letterCount: 10, hintsUsed: 2, elapsedMs: 30000 }),
      ],
      '2026-09-26',
    );
    expect(summary.solves).toBe(2);
    expect(summary.starsThisWeek).toBe(2);
    expect(summary.lettersSolved).toBe(30);
    expect(summary.hintsUsed).toBe(2);
    expect(summary.averageMs).toBe(45000);
    expect(summary.streak).toBe(0);
    expect(summary.cleanStreak).toBe(0);
  });

  it('counts a clean streak from hint points, and from old rows that stored only a hint count', () => {
    expect(cleanStreakFrom([
      row({ date: '2026-09-26', stars: 3, hintPoints: 0 }),
      row({ puzzleKey: 'older', date: '2026-09-25', stars: 2, hintPoints: 0 }),
    ], '2026-09-26')).toBe(2);
    expect(cleanStreakFrom([
      row({ date: '2026-09-26', stars: 1, hintPoints: 3 }),
      row({ puzzleKey: 'older', date: '2026-09-25', stars: 3 }),
    ], '2026-09-26')).toBe(1);
    expect(cleanStreakFrom([
      row({ date: '2026-09-25', stars: 3, hintsUsed: 0 }),
    ], '2026-09-26')).toBe(1);
  });
});
