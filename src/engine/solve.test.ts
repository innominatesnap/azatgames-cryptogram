import { describe, expect, it } from 'vitest';
import { alphabetIndexKey, buildPuzzleWithKey } from './cipher';
import {
  emptySolveState,
  isLetterInUseElsewhere,
  isSolved,
  placeLetter,
  setLetter,
  stableMapping,
  undo,
  redo,
  unsetNumber,
  unsetNumbers,
  wrongLetterCount,
  wrongNumbers,
  numbersInWord,
} from './solve';

const puzzle = buildPuzzleWithKey('a ba!', alphabetIndexKey());

describe('solve state', () => {
  it('applies one letter to every tile with that number', () => {
    const next = placeLetter({}, puzzle.solution[1] === 'A' ? 1 : 1, 'A');
    const state = setLetter(emptySolveState(), 1, 'a');
    expect(state.present[1]).toBe('A');
    expect(next[1]).toBe('A');
    const words = puzzle.words;
    const letterTiles = words.flatMap((word) => word.tiles).filter((tile) => tile.kind === 'letter' && tile.number === 1);
    expect(letterTiles.length).toBe(2);
    expect(state.present[1]).toBe('A');
  });

  it('moves a letter that is already used and still reports it as dimmed elsewhere', () => {
    let state = setLetter(emptySolveState(), 1, 'B');
    state = setLetter(state, 2, 'B');
    expect(state.present[1]).toBeUndefined();
    expect(state.present[2]).toBe('B');
    expect(isLetterInUseElsewhere(state.present, 'B', 1)).toBe(true);
    expect(isLetterInUseElsewhere(state.present, 'B', 2)).toBe(false);
    expect(isLetterInUseElsewhere(state.present, 'Z', 2)).toBe(false);
  });

  it('clears a number everywhere, including outside the word', () => {
    let state = setLetter(emptySolveState(), 1, 'A');
    state = setLetter(state, 2, 'B');
    state = unsetNumbers(state, numbersInWord(puzzle.words[0]));
    expect(state.present[1]).toBeUndefined();
    expect(state.present[2]).toBe('B');
  });

  it('undo and redo walk the history stack', () => {
    let state = setLetter(emptySolveState(), 1, 'A');
    state = setLetter(state, 2, 'B');
    const placed = stableMapping(state.present);
    state = undo(state);
    expect(state.present[2]).toBeUndefined();
    expect(state.present[1]).toBe('A');
    state = redo(state);
    expect(stableMapping(state.present)).toBe(placed);
    state = undo(state);
    state = setLetter(state, 2, 'C');
    expect(state.future.length).toBe(0);
    expect(state.present[2]).toBe('C');
    expect(undo(emptySolveState())).toEqual(emptySolveState());
  });

  it('undo restores a moved letter', () => {
    let state = setLetter(emptySolveState(), 1, 'B');
    state = setLetter(state, 2, 'B');
    state = undo(state);
    expect(state.present[1]).toBe('B');
    expect(state.present[2]).toBeUndefined();
  });

  it('detects wrong letters, a full miss, and a solve', () => {
    const solution = puzzle.solution;
    let state = emptySolveState();
    for (const numberText of Object.keys(solution)) {
      state = setLetter(state, Number(numberText), solution[Number(numberText)]);
    }
    expect(isSolved(puzzle.words, state.present, solution)).toBe(true);
    expect(wrongLetterCount(puzzle.words, state.present, solution)).toBe(0);
    state = unsetNumber(state, 1);
    state = setLetter(state, 1, 'Z');
    expect(isSolved(puzzle.words, state.present, solution)).toBe(false);
    expect(wrongNumbers(state.present, solution)).toContain(1);
    expect(wrongLetterCount(puzzle.words, state.present, solution)).toBe(2);
  });
});
