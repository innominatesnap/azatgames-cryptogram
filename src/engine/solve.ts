import type { Word } from './cipher';
import type { Attribution, HintRecord } from '../hints/records';

export type Mapping = { [number: number]: string };

export type SolveState = {
  past: Mapping[];
  present: Mapping;
  future: Mapping[];
  hintsUsed: number;
  hintPoints: number;
  hintLog: HintRecord[];
  frequencyShown: boolean;
  revealedNumbers: number[];
  revealedLetters: Mapping;
  crossedOff: string[];
  markedNumbers: number[];
  /** 0 hidden, 1 author, 2 author plus source. */
  attributionStage: 0 | 1 | 2;
  attributionUnveiled: boolean;
  attribution: Attribution | null;
  gaveUp: boolean;
  elapsedMs: number;
};

const MAX_HISTORY = 300;

export function emptyMapping(): Mapping {
  return {};
}

export function emptySolveState(): SolveState {
  return {
    past: [],
    present: emptyMapping(),
    future: [],
    hintsUsed: 0,
    hintPoints: 0,
    hintLog: [],
    frequencyShown: false,
    revealedNumbers: [],
    revealedLetters: {},
    crossedOff: [],
    markedNumbers: [],
    attributionStage: 0,
    attributionUnveiled: false,
    attribution: null,
    gaveUp: false,
    elapsedMs: 0,
  };
}

export function stableMapping(mapping: Mapping): string {
  const keys = Object.keys(mapping)
    .map((key) => Number(key))
    .sort((a, b) => a - b);
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(String(key) + '=' + mapping[key]);
  }
  return parts.join('|');
}

export function copyMapping(mapping: Mapping): Mapping {
  const next: Mapping = {};
  for (const key of Object.keys(mapping)) {
    next[Number(key)] = mapping[Number(key)];
  }
  return next;
}

export function normalizeMapping(raw: unknown): Mapping {
  const next: Mapping = {};
  if (!raw || typeof raw !== 'object') return next;
  const record = raw as { [key: string]: unknown };
  for (const key of Object.keys(record)) {
    const number = Number(key);
    const letter = record[key];
    if (!Number.isInteger(number) || number < 1 || number > 26) continue;
    if (typeof letter !== 'string' || letter.length !== 1) continue;
    const upper = letter.toUpperCase();
    if (upper < 'A' || upper > 'Z') continue;
    next[number] = upper;
  }
  return next;
}

export function letterOwner(mapping: Mapping): { [letter: string]: number } {
  const owner: { [letter: string]: number } = {};
  for (const key of Object.keys(mapping)) {
    owner[mapping[Number(key)]] = Number(key);
  }
  return owner;
}

export function isLetterInUseElsewhere(
  mapping: Mapping,
  letter: string,
  selectedNumber: number | null,
): boolean {
  const owner = letterOwner(mapping)[letter.toUpperCase()];
  if (owner === undefined) return false;
  if (selectedNumber !== null && owner === selectedNumber) return false;
  return true;
}

export function placeLetter(mapping: Mapping, number: number, letter: string): Mapping {
  const upper = letter.toUpperCase();
  if (upper < 'A' || upper > 'Z' || upper.length !== 1) {
    throw new Error('Choose a letter');
  }
  const next: Mapping = {};
  for (const key of Object.keys(mapping)) {
    const current = Number(key);
    if (current === number) continue;
    if (mapping[current] === upper) continue;
    next[current] = mapping[current];
  }
  next[number] = upper;
  return next;
}

export function clearNumber(mapping: Mapping, number: number): Mapping {
  const next: Mapping = {};
  for (const key of Object.keys(mapping)) {
    const current = Number(key);
    if (current === number) continue;
    next[current] = mapping[current];
  }
  return next;
}

export function clearNumbers(mapping: Mapping, numbers: number[]): Mapping {
  const drop: { [number: number]: boolean } = {};
  for (const number of numbers) drop[number] = true;
  const next: Mapping = {};
  for (const key of Object.keys(mapping)) {
    const current = Number(key);
    if (drop[current]) continue;
    next[current] = mapping[current];
  }
  return next;
}

function commit(state: SolveState, next: Mapping): SolveState {
  if (stableMapping(state.present) === stableMapping(next)) return state;
  const past = state.past.concat([copyMapping(state.present)]);
  const trimmed = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
  return {
    ...state,
    past: trimmed,
    present: next,
    future: [],
  };
}

function restoreRevealed(state: SolveState): SolveState {
  let present = state.present;
  for (const key of Object.keys(state.revealedLetters)) {
    const number = Number(key);
    const letter = state.revealedLetters[number];
    if (!letter || present[number] === letter) continue;
    present = placeLetter(present, number, letter);
  }
  if (stableMapping(present) === stableMapping(state.present)) return state;
  return { ...state, present: present };
}

export function setLetter(state: SolveState, number: number, letter: string): SolveState {
  const upper = letter.toUpperCase();
  if (state.revealedLetters[number]) return state;
  const owner = letterOwner(state.present)[upper];
  if (owner !== undefined && state.revealedLetters[owner]) return state;
  return commit(state, placeLetter(state.present, number, letter));
}

export function unsetNumber(state: SolveState, number: number): SolveState {
  if (state.revealedLetters[number]) return state;
  return commit(state, clearNumber(state.present, number));
}

export function unsetNumbers(state: SolveState, numbers: number[]): SolveState {
  const open: number[] = [];
  for (const number of numbers) {
    if (!state.revealedLetters[number]) open.push(number);
  }
  return commit(state, clearNumbers(state.present, open));
}

export function undo(state: SolveState): SolveState {
  if (!state.past.length) return state;
  const previous = state.past[state.past.length - 1];
  return restoreRevealed({
    ...state,
    past: state.past.slice(0, -1),
    present: copyMapping(previous),
    future: [copyMapping(state.present)].concat(state.future),
  });
}

export function redo(state: SolveState): SolveState {
  if (!state.future.length) return state;
  const next = state.future[0];
  return restoreRevealed({
    ...state,
    past: state.past.concat([copyMapping(state.present)]),
    present: copyMapping(next),
    future: state.future.slice(1),
  });
}

export function numbersInWord(word: Word): number[] {
  const seen: { [number: number]: boolean } = {};
  const numbers: number[] = [];
  for (const tile of word.tiles) {
    if (tile.kind !== 'letter' || seen[tile.number]) continue;
    seen[tile.number] = true;
    numbers.push(tile.number);
  }
  return numbers;
}

export function isFilled(words: Word[], mapping: Mapping): boolean {
  for (const word of words) {
    for (const tile of word.tiles) {
      if (tile.kind === 'letter' && mapping[tile.number] === undefined) return false;
    }
  }
  return true;
}

export function wrongLetterCount(
  words: Word[],
  mapping: Mapping,
  solution: { [number: number]: string },
): number {
  let count = 0;
  for (const word of words) {
    for (const tile of word.tiles) {
      if (tile.kind !== 'letter') continue;
      if (mapping[tile.number] !== solution[tile.number]) count += 1;
    }
  }
  return count;
}

export function isSolved(
  words: Word[],
  mapping: Mapping,
  solution: { [number: number]: string },
): boolean {
  return isFilled(words, mapping) && wrongLetterCount(words, mapping, solution) === 0;
}

export function wrongNumbers(
  mapping: Mapping,
  solution: { [number: number]: string },
): number[] {
  const wrong: number[] = [];
  for (const key of Object.keys(mapping)) {
    const number = Number(key);
    if (solution[number] === undefined) continue;
    if (mapping[number] !== solution[number]) wrong.push(number);
  }
  wrong.sort((a, b) => a - b);
  return wrong;
}

export function withHints(state: SolveState, hintsUsed: number, extra?: {
  frequencyShown?: boolean;
  revealedNumber?: number;
}): SolveState {
  const revealed = state.revealedNumbers.slice();
  if (extra && extra.revealedNumber !== undefined && revealed.indexOf(extra.revealedNumber) === -1) {
    revealed.push(extra.revealedNumber);
  }
  return {
    ...state,
    hintsUsed: hintsUsed,
    frequencyShown: extra && extra.frequencyShown ? true : state.frequencyShown,
    revealedNumbers: revealed,
  };
}
