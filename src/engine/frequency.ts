import type { Word } from './cipher';

export type FrequencyBar = { letter: string; percent: number };

export const ENGLISH_LETTER_FREQUENCY: FrequencyBar[] = [
  { letter: 'E', percent: 12.7 },
  { letter: 'T', percent: 9.1 },
  { letter: 'A', percent: 8.2 },
  { letter: 'O', percent: 7.5 },
  { letter: 'I', percent: 7.0 },
  { letter: 'N', percent: 6.7 },
  { letter: 'S', percent: 6.3 },
  { letter: 'H', percent: 6.1 },
  { letter: 'R', percent: 6.0 },
  { letter: 'D', percent: 4.3 },
  { letter: 'L', percent: 4.0 },
  { letter: 'C', percent: 2.8 },
  { letter: 'U', percent: 2.8 },
  { letter: 'M', percent: 2.4 },
  { letter: 'W', percent: 2.4 },
  { letter: 'F', percent: 2.2 },
  { letter: 'G', percent: 2.0 },
  { letter: 'Y', percent: 2.0 },
  { letter: 'P', percent: 1.9 },
  { letter: 'B', percent: 1.5 },
  { letter: 'V', percent: 1.0 },
  { letter: 'K', percent: 0.8 },
  { letter: 'J', percent: 0.2 },
  { letter: 'X', percent: 0.2 },
  { letter: 'Q', percent: 0.1 },
  { letter: 'Z', percent: 0.1 },
];

export type NumberCount = { number: number; count: number };

export function codeNumberCounts(words: Word[]): NumberCount[] {
  const counts: { [number: number]: number } = {};
  for (const word of words) {
    for (const tile of word.tiles) {
      if (tile.kind !== 'letter') continue;
      counts[tile.number] = (counts[tile.number] || 0) + 1;
    }
  }
  const rows: NumberCount[] = [];
  for (const key of Object.keys(counts)) {
    rows.push({ number: Number(key), count: counts[Number(key)] });
  }
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.number - b.number;
  });
  return rows;
}
