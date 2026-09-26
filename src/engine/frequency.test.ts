import { describe, expect, it } from 'vitest';
import { alphabetIndexKey, buildPuzzleWithKey } from './cipher';
import { codeNumberCounts, ENGLISH_LETTER_FREQUENCY } from './frequency';

describe('frequency', () => {
  it('counts code numbers and keeps the English reference beside them', () => {
    const built = buildPuzzleWithKey('aab!', alphabetIndexKey());
    expect(codeNumberCounts(built.words)).toEqual([
      { number: 1, count: 2 },
      { number: 2, count: 1 },
    ]);
    expect(ENGLISH_LETTER_FREQUENCY[0].letter).toBe('E');
    expect(ENGLISH_LETTER_FREQUENCY).toHaveLength(26);
  });
});
