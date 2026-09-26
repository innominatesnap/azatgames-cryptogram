import type { Mapping } from '../engine/solve';
import { stableMapping } from '../engine/solve';
import { CROSS_OFF_BATCH, hintSpec, revealCapFor, STAR_RULES } from './config';
import type { HintRecord } from './records';
import type { HintBoardState } from './types';

export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededOrder(items: string[], seed: string): string[] {
  return items.slice().sort((a, b) => {
    const left = hashString(seed + ':' + a);
    const right = hashString(seed + ':' + b);
    if (left !== right) return left < right ? -1 : 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
}

export function countUses(log: HintRecord[], id: string): number {
  let count = 0;
  for (const row of log) {
    if (row.id === id && row.cost > 0) count += 1;
  }
  return count;
}

export function revealUses(log: HintRecord[]): number {
  let count = 0;
  for (const row of log) {
    if ((row.id === 'surprise-letter' || row.id === 'pick-letter' || row.id === 'reveal-word') && row.cost > 0) {
      count += 1;
    }
  }
  return count;
}

export function placedCount(mapping: Mapping): number {
  return Object.keys(mapping).length;
}

export function wrongPlacedNumbers(mapping: Mapping, solution: Mapping): number[] {
  const wrong: number[] = [];
  for (const key of Object.keys(mapping)) {
    const number = Number(key);
    if (!solution[number]) continue;
    if (mapping[number] !== solution[number]) wrong.push(number);
  }
  wrong.sort((a, b) => a - b);
  return wrong;
}

export function unsolvedNumbers(mapping: Mapping, solution: Mapping): number[] {
  const numbers: number[] = [];
  for (const key of Object.keys(solution)) {
    const number = Number(key);
    if (mapping[number] !== solution[number]) numbers.push(number);
  }
  numbers.sort((a, b) => a - b);
  return numbers;
}

export function lettersUsed(solution: Mapping): string[] {
  const seen: { [letter: string]: boolean } = {};
  const letters: string[] = [];
  for (const key of Object.keys(solution)) {
    const letter = solution[Number(key)];
    if (!letter || seen[letter]) continue;
    seen[letter] = true;
    letters.push(letter);
  }
  letters.sort();
  return letters;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function unusedLetters(solution: Mapping, already: string[]): string[] {
  const used = lettersUsed(solution);
  const skip: { [letter: string]: boolean } = {};
  for (const letter of used.concat(already)) skip[letter] = true;
  const left: string[] = [];
  for (let i = 0; i < ALPHABET.length; i += 1) {
    const letter = ALPHABET.charAt(i);
    if (!skip[letter]) left.push(letter);
  }
  return left;
}

export function pickMarkOne(input: {
  wrong: number[];
  alreadyMarked: number[];
  seed: string;
}): number | null {
  const skip: { [number: number]: boolean } = {};
  for (const number of input.alreadyMarked) skip[number] = true;
  const open = input.wrong.filter((number) => !skip[number]).map((number) => String(number));
  const ordered = seededOrder(open, input.seed);
  if (!ordered.length) return null;
  return Number(ordered[0]);
}

export function pickCrossOff(input: { unused: string[]; seed: string; batch: number }): string[] {
  const ordered = seededOrder(input.unused, input.seed);
  return ordered.slice(0, input.batch);
}

export function pickSurprise(input: { numbers: number[]; seed: string }): number | null {
  const ordered = seededOrder(input.numbers.map((number) => String(number)), input.seed);
  if (!ordered.length) return null;
  return Number(ordered[0]);
}

export function markSeed(state: HintBoardState, puzzleKey: string): string {
  return puzzleKey + '|' + stableMapping(state.mapping) + '|' + String(countUses(state.hintLog, 'mark-one'));
}

export function crossSeed(state: HintBoardState, puzzleKey: string): string {
  return puzzleKey + '|cross|' + String(countUses(state.hintLog, 'cross-off'));
}

export function surpriseSeed(state: HintBoardState, puzzleKey: string): string {
  return puzzleKey + '|surprise|' + String(countUses(state.hintLog, 'surprise-letter'));
}

export function unavailableReason(id: string, state: HintBoardState): string | null {
  const spec = hintSpec(id);
  if (!spec) return 'That hint is not in the catalog.';
  if (spec.stub) return 'Not in this version.';
  if (id === 'frequency-chart') return null;
  if (id === 'mark-one' || id === 'check-all') {
    if (spec.maxUses !== null && countUses(state.hintLog, id) >= spec.maxUses) return 'No uses left.';
    if (placedCount(state.mapping) === 0) return 'Place a letter first.';
    return null;
  }
  if (id === 'cross-off') {
    const unused = Math.max(0, 26 - state.uniqueLetterCount - state.crossedOff.length);
    if (unused <= 0) return 'Nothing left to cross off.';
    return null;
  }
  if (id === 'surprise-letter' || id === 'pick-letter') {
    if (state.revealedNumbers.length >= revealCapFor(state.uniqueLetterCount)) return 'Reveal limit reached.';
    let open = false;
    for (const number of state.cipherNumbers) {
      if (state.revealedNumbers.indexOf(number) === -1) open = true;
    }
    if (!open) return 'Nothing left to reveal.';
    return null;
  }
  if (id === 'unveil-author') {
    if (state.attributionStage >= 1) return 'Author already unveiled.';
    return null;
  }
  if (id === 'unveil-source') {
    if (state.attributionStage < 1) return 'Unveil the author first.';
    if (state.attributionStage >= 2) return 'Source already unveiled.';
    return null;
  }
  return null;
}

export function usesLabel(id: string, state: HintBoardState): string {
  const spec = hintSpec(id);
  if (!spec || spec.stub) return 'Not in this version';
  if (id === 'frequency-chart') {
    return state.frequencyShown ? 'Unlimited after first open' : 'First open';
  }
  if (id === 'cross-off') {
    const unused = Math.max(0, 26 - state.uniqueLetterCount);
    return String(Math.max(0, unused - state.crossedOff.length)) + ' unused letters left';
  }
  if (id === 'surprise-letter' || id === 'pick-letter') {
    const left = revealCapFor(state.uniqueLetterCount) - state.revealedNumbers.length;
    return String(left < 0 ? 0 : left) + ' reveals left';
  }
  if (spec.maxUses === null) return '1 hint point';
  const left = spec.maxUses - countUses(state.hintLog, id);
  return String(left < 0 ? 0 : left) + ' left';
}

export function nextChargedLog(state: HintBoardState, id: string, action: string, cost: number, requestId: string): HintRecord[] {
  return state.hintLog.concat([{ id: id, action: action, cost: cost, requestId: requestId }]);
}

export function crossOffBatch(): number {
  return CROSS_OFF_BATCH;
}

export function twoStarMax(): number {
  return STAR_RULES.twoStarMaxPoints;
}
