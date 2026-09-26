import { describe, expect, it } from 'vitest';
import type { Mapping } from '../engine/solve';
import { pickCrossOff, pickSurprise, unusedLetters, wrongPlacedNumbers } from './rules';

const solution: Mapping = { 1: 'T', 2: 'O', 3: 'B', 4: 'E' };

describe('seeded hint picks', () => {
  it('lists only placed letters that disagree with the solution', () => {
    const mapping: Mapping = { 1: 'Z', 2: 'Q', 3: 'B' };
    expect(wrongPlacedNumbers(mapping, solution)).toEqual([1, 2]);
  });

  it('crosses off a stable batch and skips letters already used', () => {
    const unused = unusedLetters(solution, []);
    expect(unused).not.toContain('T');
    expect(unused).not.toContain('E');
    const first = pickCrossOff({ unused: unused, seed: 'puzzle|cross|0', batch: 4 });
    const second = pickCrossOff({ unused: unused, seed: 'puzzle|cross|0', batch: 4 });
    expect(second).toEqual(first);
    expect(first.length).toBe(4);
    const next = pickCrossOff({ unused: unused, seed: 'puzzle|cross|1', batch: 4 });
    expect(next.join(',')).not.toBe(first.join(','));
  });

  it('does not surprise a number that is already correct', () => {
    const picked = pickSurprise({ numbers: [2, 4], seed: 'puzzle|surprise|0' });
    expect(picked === 2 || picked === 4).toBe(true);
    expect(pickSurprise({ numbers: [], seed: 'puzzle|surprise|0' })).toBeNull();
  });
});
