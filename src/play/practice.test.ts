import { describe, expect, it } from 'vitest';
import { isSolved, placeLetter, type Mapping } from '../engine/solve';
import {
  practiceCheck,
  practiceConfirm,
  practiceFrequency,
  practiceGiveUp,
  practiceReveal,
  samplePuzzle,
} from './practice';

describe('practice oracle', () => {
  const built = samplePuzzle();

  it('checks, reveals once, and confirms a full solve', () => {
    const checked = practiceCheck(built.solution, { 1: 'Q' }, 0);
    expect(checked.hintsUsed).toBe(1);
    const number = Number(Object.keys(built.solution)[0]);
    const revealed = practiceReveal({
      solution: built.solution,
      mapping: {},
      number: number,
      hintsUsed: 0,
      revealedNumbers: [],
    });
    expect(revealed.letter).toBe(built.solution[number]);
    expect(revealed.hintsUsed).toBe(1);
    const again = practiceReveal({
      solution: built.solution,
      mapping: placeLetter({}, number, revealed.letter),
      number: number,
      hintsUsed: 1,
      revealedNumbers: [number],
    });
    expect(again.hintsUsed).toBe(1);
    expect(practiceFrequency(1, false).hintsUsed).toBe(2);
    expect(practiceFrequency(2, true).hintsUsed).toBe(2);

    let mapping: Mapping = {};
    for (const key of Object.keys(built.solution)) {
      mapping = placeLetter(mapping, Number(key), built.solution[Number(key)]);
    }
    expect(isSolved(built.words, mapping, built.solution)).toBe(true);
    const done = practiceConfirm({
      words: built.words,
      solution: built.solution,
      mapping: mapping,
      elapsedMs: 1000,
      hintsUsed: 0,
      uniqueLetterCount: built.uniqueLetterCount,
      longestWord: built.longestWord,
      letterCount: built.letterCount,
      dateLabel: 'Sample',
    });
    expect(done.solved).toBe(true);
    if (done.solved) {
      expect(done.outcome.stars).toBe(3);
      expect(done.outcome.quote.author).toBe('William Shakespeare');
      expect(done.outcome.quote.plainText.indexOf('question')).toBeGreaterThan(-1);
    }
  });

  it('gives up for zero stars and reports a wrong filled board without the answer', () => {
    const quit = practiceGiveUp({
      elapsedMs: 4000,
      hintsUsed: 2,
      letterCount: built.letterCount,
      dateLabel: 'Sample',
    });
    expect(quit.stars).toBe(0);
    expect(quit.gaveUp).toBe(true);
    const miss = practiceConfirm({
      words: built.words,
      solution: built.solution,
      mapping: placeLetter({}, 1, 'Q'),
      elapsedMs: 1000,
      hintsUsed: 0,
      uniqueLetterCount: built.uniqueLetterCount,
      longestWord: built.longestWord,
      letterCount: built.letterCount,
      dateLabel: 'Sample',
    });
    expect(miss.solved).toBe(false);
    if (!miss.solved) expect(miss.wrongCount).toBeGreaterThan(0);
  });
});
