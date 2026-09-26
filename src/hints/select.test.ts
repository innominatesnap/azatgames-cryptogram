import { describe, expect, it } from 'vitest';
import type { Mapping } from '../engine/solve';
import { chooseFindMistake, chooseReveal, revealCandidates, wrongPlacedNumbers } from './select';

const solution: Mapping = { 1: 'T', 2: 'O', 3: 'B', 4: 'E' };

function fixed(value: number): () => number {
  return () => value;
}

describe('hint selection', () => {
  it('picks one wrong cipher letter at random and leaves the others unmarked', () => {
    const mapping = { 1: 'Z', 2: 'Q', 4: 'E' };
    expect(wrongPlacedNumbers(mapping, solution)).toEqual([1, 2]);
    expect(chooseFindMistake(mapping, solution, fixed(0))).toEqual({ kind: 'mark', number: 1 });
    expect(chooseFindMistake(mapping, solution, fixed(0.49))).toEqual({ kind: 'mark', number: 1 });
    expect(chooseFindMistake(mapping, solution, fixed(0.5))).toEqual({ kind: 'mark', number: 2 });
    expect(chooseFindMistake(mapping, solution, fixed(0.99))).toEqual({ kind: 'mark', number: 2 });
  });

  it('falls through to a reveal when nothing placed is wrong', () => {
    const empty = chooseFindMistake({}, solution, fixed(0));
    expect(empty.kind).toBe('reveal');
    if (empty.kind === 'reveal') {
      expect(empty.fallback).toBe(true);
      expect(empty.letter).toBe(solution[empty.number]);
      expect(solution[empty.number]).not.toBeUndefined();
    }
    const partial = chooseFindMistake({ 4: 'E' }, solution, fixed(0));
    expect(partial.kind).toBe('reveal');
    if (partial.kind === 'reveal') {
      expect(partial.number).not.toBe(4);
      expect(partial.letter).toBe(solution[partial.number]);
    }
  });

  it('never reveals a letter that is already correct', () => {
    const mapping = { 1: 'T', 2: 'Z', 3: 'B' };
    expect(revealCandidates(mapping, solution)).toEqual([2, 4]);
    const first = chooseReveal(mapping, solution, fixed(0));
    const second = chooseReveal(mapping, solution, fixed(0.99));
    expect(first).toEqual({ number: 2, letter: 'O' });
    expect(second).toEqual({ number: 4, letter: 'E' });
    expect(revealCandidates(mapping, solution)).not.toContain(1);
    expect(revealCandidates(mapping, solution)).not.toContain(3);
    const viaMistake = chooseFindMistake({ 1: 'T', 2: 'O', 3: 'B' }, solution, fixed(0.99));
    expect(viaMistake).toEqual({ kind: 'reveal', number: 4, letter: 'E', fallback: true });
  });
});
