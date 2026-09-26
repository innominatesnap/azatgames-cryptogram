import { describe, expect, it } from 'vitest';
import type { SolveOutcome } from '../play/api';
import { marksAfterEdit, presentFillCheck, tileCues } from './feedback';

const outcome: SolveOutcome = {
  solved: true,
  gaveUp: false,
  stars: 3,
  points: 10,
  hintsUsed: 0,
  elapsedMs: 1000,
  quote: { author: 'A', work: 'B', year: 1600, plainText: 'Hi', sourceNote: 'Note' },
  dateLabel: 'Sample',
  letterCount: 2,
  hintLog: [],
};

describe('no instant feedback', () => {
  it('keeps a full but unsolved board silent', () => {
    const shown = presentFillCheck({ solved: false, wrongCount: 8 });
    expect(shown.outcome).toBeNull();
    expect(shown.message).toBeNull();
    expect(JSON.stringify(shown).toLowerCase()).not.toContain('off');
    expect(JSON.stringify(shown).toLowerCase()).not.toContain('wrong');
  });

  it('still finishes when the whole puzzle is solved', () => {
    const shown = presentFillCheck({ solved: true, outcome: outcome });
    expect(shown.outcome && shown.outcome.solved).toBe(true);
    expect(shown.message).toBeNull();
  });

  it('does not mark a wrong guess until a hint asks for it', () => {
    const quiet = tileCues({ markedWrong: false, revealed: false, sameNumber: false });
    expect(quiet).toBe('tile');
    expect(quiet).not.toContain('mistake');
    expect(quiet).not.toContain('off');
    expect(tileCues({ markedWrong: true, revealed: false, sameNumber: false })).toContain('tile-mistake');
  });

  it('clears a red mark when that letter changes', () => {
    expect(marksAfterEdit([2, 5], 5, 'Q', 'A')).toEqual([2]);
    expect(marksAfterEdit([2, 5], 5, 'Q', undefined)).toEqual([2]);
    expect(marksAfterEdit([2, 5], 5, 'Q', 'Q')).toEqual([2, 5]);
  });
});
