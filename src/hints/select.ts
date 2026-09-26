import type { Word } from '../engine/cipher';
import type { Mapping } from '../engine/solve';

export function cipherNumbersInWords(words: Word[]): number[] {
  const seen: { [number: number]: boolean } = {};
  const numbers: number[] = [];
  for (const word of words) {
    for (const tile of word.tiles) {
      if (tile.kind !== 'letter' || seen[tile.number]) continue;
      seen[tile.number] = true;
      numbers.push(tile.number);
    }
  }
  numbers.sort((a, b) => a - b);
  return numbers;
}

/** Cipher numbers that currently show a letter other than the solution. */
export function wrongPlacedNumbers(mapping: Mapping, solution: Mapping): number[] {
  const wrong: number[] = [];
  for (const key of Object.keys(mapping)) {
    const number = Number(key);
    const correct = solution[number];
    if (!correct) continue;
    if (mapping[number] !== correct) wrong.push(number);
  }
  wrong.sort((a, b) => a - b);
  return wrong;
}

/**
 * Cipher numbers that are not already showing the correct letter.
 * A letter the player has placed correctly is never a candidate.
 */
export function revealCandidates(mapping: Mapping, solution: Mapping): number[] {
  const candidates: number[] = [];
  for (const key of Object.keys(solution)) {
    const number = Number(key);
    if (mapping[number] === solution[number]) continue;
    candidates.push(number);
  }
  candidates.sort((a, b) => a - b);
  return candidates;
}

export function pickOne(numbers: number[], random: () => number): number | null {
  if (!numbers.length) return null;
  let index = Math.floor(random() * numbers.length);
  if (!Number.isFinite(index) || index < 0) index = 0;
  if (index >= numbers.length) index = numbers.length - 1;
  return numbers[index];
}

export type MistakeChoice =
  | { kind: 'mark'; number: number }
  | { kind: 'reveal'; number: number; letter: string; fallback: true }
  | { kind: 'none' };

export const NO_MISTAKE_NOTE = "No mistakes found, here's a letter";

/**
 * Timothy's rule: mark one wrong cipher letter if any guess is wrong.
 * Otherwise reveal one letter that is not already correct.
 */
export function chooseFindMistake(
  mapping: Mapping,
  solution: Mapping,
  random: () => number,
): MistakeChoice {
  const wrong = wrongPlacedNumbers(mapping, solution);
  if (wrong.length) {
    const number = pickOne(wrong, random);
    if (number === null) return { kind: 'none' };
    return { kind: 'mark', number: number };
  }
  const opened = chooseReveal(mapping, solution, random);
  if (!opened) return { kind: 'none' };
  return { kind: 'reveal', number: opened.number, letter: opened.letter, fallback: true };
}

export function chooseReveal(
  mapping: Mapping,
  solution: Mapping,
  random: () => number,
): { number: number; letter: string } | null {
  const number = pickOne(revealCandidates(mapping, solution), random);
  if (number === null) return null;
  return { number: number, letter: solution[number] };
}
