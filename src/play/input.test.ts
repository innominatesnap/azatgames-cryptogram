import { describe, expect, it } from 'vitest';
import { alphabetIndexKey, buildPuzzleWithKey } from '../engine/cipher';
import { emptySolveState, setLetter, type SolveState } from '../engine/solve';
import {
  applyBackspace,
  applyLetter,
  firstOpenSpot,
  keyboardFaces,
  nextOpenSpot,
} from './input';

const puzzle = buildPuzzleWithKey('Hi, you', alphabetIndexKey());
const words = puzzle.words;

function lockedState(): SolveState {
  const number = words[0].tiles[0].kind === 'letter' ? words[0].tiles[0].number : 0;
  const placed = setLetter(emptySolveState(), number, 'H');
  return {
    ...placed,
    revealedNumbers: [number],
    revealedLetters: { [number]: 'H' },
  };
}

describe('keyboard input', () => {
  it('auto-selects the first empty tile and advances across words', () => {
    const first = firstOpenSpot(words, {});
    expect(first && first.wordIndex).toBe(0);
    expect(first && first.tileIndex).toBe(0);
    const typed = applyLetter(emptySolveState(), words, first, 'q', false);
    expect(typed.state.present[first ? first.number : 0]).toBe('Q');
    expect(typed.spot && typed.spot.tileIndex).toBe(1);
    expect(typed.pendingLetter).toBeNull();
    const second = typed.spot;
    const again = applyLetter(typed.state, words, second, 'a', false);
    expect(again.spot && again.spot.wordIndex).toBe(1);
    expect(again.spot && again.spot.tileIndex).toBe(0);
    if (second) expect(nextOpenSpot(words, again.state.present, second)).toEqual(again.spot);
  });

  it('asks before placing a crossed-off letter, then allows it', () => {
    const spot = firstOpenSpot(words, {});
    const state = { ...emptySolveState(), crossedOff: ['Z'] };
    const blocked = applyLetter(state, words, spot, 'z', false);
    expect(blocked.pendingLetter).toBe('Z');
    expect(blocked.state.present).toEqual({});
    const forced = applyLetter(state, words, spot, 'Z', true);
    expect(forced.pendingLetter).toBeNull();
    expect(forced.state.present[spot ? spot.number : 0]).toBe('Z');
  });

  it('does not change a locked reveal from the keyboard or delete', () => {
    const state = lockedState();
    const spot = firstOpenSpot(words, {});
    expect(spot && state.revealedLetters[spot.number]).toBe('H');
    const typed = applyLetter(state, words, spot, 'Q', true);
    expect(typed.state.present[spot ? spot.number : 0]).toBe('H');
    expect(typed.state).toBe(state);
    expect(typed.note).toBe('Revealed letters stay locked.');
    const cleared = applyBackspace(state, words, spot);
    expect(cleared.state.present[spot ? spot.number : 0]).toBe('H');
    expect(cleared.state).toBe(state);
    expect(cleared.note).toBe('Revealed letters stay locked.');
    const faces = keyboardFaces(state, spot ? spot.number : null);
    expect(faces.length).toBe(26);
    expect(faces.every((face) => face.disabled)).toBe(true);
    expect(faces[0].letter).toBe('A');
    expect(faces[25].letter).toBe('Z');
  });

  it('clears an unlocked letter and skips locked letters when deleting backward', () => {
    const first = firstOpenSpot(words, {});
    if (!first) throw new Error('expected a tile');
    const placed = applyLetter(emptySolveState(), words, first, 'Q', false);
    const cleared = applyBackspace(placed.state, words, placed.spot);
    expect(cleared.state.present[first.number]).toBeUndefined();

    const locked = lockedState();
    const second = words[0].tiles[1];
    if (second.kind !== 'letter') throw new Error('expected letter');
    const withPlayerLetter = setLetter(locked, second.number, 'Q');
    const later = words[1].tiles[0];
    if (later.kind !== 'letter') throw new Error('expected letter');
    const laterSpot = { wordIndex: 1, tileIndex: 0, number: later.number };
    const back = applyBackspace(withPlayerLetter, words, laterSpot);
    expect(back.state.present[first.number]).toBe('H');
    expect(back.state.revealedLetters[first.number]).toBe('H');
    expect(back.state.present[second.number]).toBeUndefined();
    expect(back.spot && back.spot.number).toBe(second.number);
  });

  it('drops a red mark when the keyboard changes that letter', () => {
    const spot = firstOpenSpot(words, {});
    if (!spot) throw new Error('expected a tile');
    const marked = { ...emptySolveState(), present: { [spot.number]: 'Q' }, markedNumbers: [spot.number] };
    const typed = applyLetter(marked, words, spot, 'A', false);
    expect(typed.state.present[spot.number]).toBe('A');
    expect(typed.state.markedNumbers.indexOf(spot.number)).toBe(-1);
  });
});
