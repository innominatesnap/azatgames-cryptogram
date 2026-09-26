import type { Word } from '../engine/cipher';

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
