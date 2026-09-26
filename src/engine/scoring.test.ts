import { describe, expect, it } from 'vitest';
import {
  difficultyFactor,
  formatDuration,
  parTimeMs,
  pointsForSolve,
  starsForSolve,
  stumperBonus,
} from './scoring';

describe('scoring', () => {
  it('scales par time with the unique letter count', () => {
    expect(parTimeMs(10)).toBe(200000);
    expect(parTimeMs(11)).toBeGreaterThan(parTimeMs(10));
  });

  it('awards stars from hints, par, and give-up', () => {
    const base = { uniqueLetterCount: 10, elapsedMs: 10000, hintsUsed: 0, gaveUp: false };
    expect(starsForSolve(base)).toBe(3);
    expect(starsForSolve({ ...base, elapsedMs: parTimeMs(10) })).toBe(3);
    expect(starsForSolve({ ...base, elapsedMs: parTimeMs(10) + 1 })).toBe(2);
    expect(starsForSolve({ ...base, hintsUsed: 1, elapsedMs: 1000 })).toBe(2);
    expect(starsForSolve({ ...base, hintsUsed: 1, elapsedMs: parTimeMs(10) + 1 })).toBe(2);
    expect(starsForSolve({ ...base, hintsUsed: 2 })).toBe(1);
    expect(starsForSolve({ ...base, hintsUsed: 5 })).toBe(1);
    expect(starsForSolve({ ...base, gaveUp: true, hintsUsed: 0 })).toBe(0);
    expect(starsForSolve({ ...base, gaveUp: true, hintsUsed: 3 })).toBe(0);
  });

  it('scores points from stars and difficulty, and subtracts pre-reveals', () => {
    expect(difficultyFactor({ uniqueLetterCount: 10, longestWord: 8, preReveals: 0 })).toBe(18);
    expect(pointsForSolve(3, 18)).toBe(54);
    expect(difficultyFactor({ uniqueLetterCount: 10, longestWord: 8, preReveals: 2 })).toBe(14);
    expect(difficultyFactor({ uniqueLetterCount: 1, longestWord: 1, preReveals: 5 })).toBe(1);
    expect(stumperBonus(0)).toBe(0);
    expect(stumperBonus(2)).toBe(2);
  });

  it('formats a clock', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59999)).toBe('0:59');
    expect(formatDuration(61000)).toBe('1:01');
  });
});
