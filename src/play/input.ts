import type { Word } from '../engine/cipher';
import { letterOwner, setLetter, unsetNumber, type Mapping, type SolveState } from '../engine/solve';
import { marksAfterEdit } from '../hints/feedback';

export type TileSpot = {
  wordIndex: number;
  tileIndex: number;
  number: number;
};

export const KEYBOARD_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const LOCKED_NOTE = 'Revealed letters stay locked.';

export type KeyApply = {
  state: SolveState;
  spot: TileSpot | null;
  pendingLetter: string | null;
  note: string | null;
};

export type KeyFace = {
  letter: string;
  used: boolean;
  current: boolean;
  crossed: boolean;
  disabled: boolean;
};

export function letterSpots(words: Word[]): TileSpot[] {
  const spots: TileSpot[] = [];
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const tiles = words[wordIndex].tiles;
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
      const tile = tiles[tileIndex];
      if (tile.kind !== 'letter') continue;
      spots.push({ wordIndex: wordIndex, tileIndex: tileIndex, number: tile.number });
    }
  }
  return spots;
}

export function sameSpot(a: TileSpot | null, b: TileSpot | null): boolean {
  if (!a || !b) return false;
  return a.wordIndex === b.wordIndex && a.tileIndex === b.tileIndex;
}

export function spotAt(words: Word[], wordIndex: number, tileIndex: number): TileSpot | null {
  const word = words[wordIndex];
  if (!word) return null;
  const tile = word.tiles[tileIndex];
  if (!tile || tile.kind !== 'letter') return null;
  return { wordIndex: wordIndex, tileIndex: tileIndex, number: tile.number };
}

/** First empty letter, or the first letter when the board is already full. */
export function firstOpenSpot(words: Word[], mapping: Mapping): TileSpot | null {
  const spots = letterSpots(words);
  for (let i = 0; i < spots.length; i += 1) {
    if (mapping[spots[i].number] === undefined) return spots[i];
  }
  return spots.length ? spots[0] : null;
}

export function nextOpenSpot(words: Word[], mapping: Mapping, after: TileSpot): TileSpot | null {
  const spots = letterSpots(words);
  const index = spots.findIndex((spot) => sameSpot(spot, after));
  const start = index === -1 ? 0 : index + 1;
  for (let step = 0; step < spots.length; step += 1) {
    const spot = spots[(start + step) % spots.length];
    if (sameSpot(spot, after)) continue;
    if (mapping[spot.number] === undefined) return spot;
  }
  return null;
}

function previousUnlocked(words: Word[], revealed: Mapping, from: TileSpot): TileSpot | null {
  const spots = letterSpots(words);
  const index = spots.findIndex((spot) => sameSpot(spot, from));
  if (index <= 0) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!revealed[spots[i].number]) return spots[i];
  }
  return null;
}

function withMark(state: SolveState, number: number, before: string | undefined): SolveState {
  const marked = marksAfterEdit(state.markedNumbers, number, before, state.present[number]);
  if (marked === state.markedNumbers) return state;
  return { ...state, markedNumbers: marked };
}

export function applyLetter(
  state: SolveState,
  words: Word[],
  spot: TileSpot | null,
  letter: string,
  force: boolean,
): KeyApply {
  const upper = letter.toUpperCase();
  if (upper.length !== 1 || upper < 'A' || upper > 'Z') {
    return { state: state, spot: spot, pendingLetter: null, note: null };
  }
  const active = spot || firstOpenSpot(words, state.present);
  if (!active) return { state: state, spot: null, pendingLetter: null, note: null };
  if (state.revealedLetters[active.number]) {
    return { state: state, spot: active, pendingLetter: null, note: LOCKED_NOTE };
  }
  if (!force && state.crossedOff.indexOf(upper) !== -1) {
    return { state: state, spot: active, pendingLetter: upper, note: null };
  }
  const owner = letterOwner(state.present)[upper];
  if (owner !== undefined && owner !== active.number && state.revealedLetters[owner]) {
    return { state: state, spot: active, pendingLetter: null, note: 'That letter is already revealed.' };
  }
  const before = state.present[active.number];
  const next = withMark(setLetter(state, active.number, upper), active.number, before);
  if (next.present[active.number] === before) {
    return { state: state, spot: active, pendingLetter: null, note: null };
  }
  const advanced = nextOpenSpot(words, next.present, active);
  return { state: next, spot: advanced || active, pendingLetter: null, note: null };
}

export function applyBackspace(state: SolveState, words: Word[], spot: TileSpot | null): KeyApply {
  const active = spot || firstOpenSpot(words, state.present);
  if (!active) return { state: state, spot: null, pendingLetter: null, note: null };
  if (state.revealedLetters[active.number]) {
    return { state: state, spot: active, pendingLetter: null, note: LOCKED_NOTE };
  }
  if (state.present[active.number]) {
    const before = state.present[active.number];
    const next = withMark(unsetNumber(state, active.number), active.number, before);
    return { state: next, spot: active, pendingLetter: null, note: null };
  }
  const previous = previousUnlocked(words, state.revealedLetters, active);
  if (!previous) return { state: state, spot: active, pendingLetter: null, note: null };
  if (!state.present[previous.number]) {
    return { state: state, spot: previous, pendingLetter: null, note: null };
  }
  const before = state.present[previous.number];
  const next = withMark(unsetNumber(state, previous.number), previous.number, before);
  return { state: next, spot: previous, pendingLetter: null, note: null };
}

export function keyboardFaces(state: SolveState, selectedNumber: number | null): KeyFace[] {
  const locked = selectedNumber !== null && Boolean(state.revealedLetters[selectedNumber]);
  const faces: KeyFace[] = [];
  for (let i = 0; i < KEYBOARD_LETTERS.length; i += 1) {
    const letter = KEYBOARD_LETTERS.charAt(i);
    const owner = letterOwner(state.present)[letter];
    const used = owner !== undefined && owner !== selectedNumber;
    faces.push({
      letter: letter,
      used: used,
      current: selectedNumber !== null && state.present[selectedNumber] === letter,
      crossed: state.crossedOff.indexOf(letter) !== -1,
      disabled: locked,
    });
  }
  return faces;
}
