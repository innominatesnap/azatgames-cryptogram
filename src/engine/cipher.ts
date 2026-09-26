export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type CipherKey = { [letter: string]: number };

export type LetterTile = { kind: 'letter'; number: number };
export type MarkTile = { kind: 'mark'; char: string };
export type Tile = LetterTile | MarkTile;
export type Word = { tiles: Tile[] };

export type BuiltPuzzle = {
  words: Word[];
  key: CipherKey;
  solution: { [number: number]: string };
  uniqueLetterCount: number;
  letterCount: number;
  longestWord: number;
};

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function alphabetIndexKey(): CipherKey {
  const key: CipherKey = {};
  for (let i = 0; i < ALPHABET.length; i += 1) {
    key[ALPHABET.charAt(i)] = i + 1;
  }
  return key;
}

export function shuffleKey(rng: () => number): CipherKey {
  const numbers: number[] = [];
  for (let n = 1; n <= 26; n += 1) numbers.push(n);
  for (let i = numbers.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = numbers[i];
    numbers[i] = numbers[j];
    numbers[j] = swap;
  }
  const key: CipherKey = {};
  for (let i = 0; i < ALPHABET.length; i += 1) {
    key[ALPHABET.charAt(i)] = numbers[i];
  }
  assertKey(key);
  return key;
}

export function assertKey(key: CipherKey): void {
  const seen: { [number: number]: boolean } = {};
  for (let i = 0; i < ALPHABET.length; i += 1) {
    const letter = ALPHABET.charAt(i);
    const number = key[letter];
    if (!Number.isInteger(number) || number < 1 || number > 26 || seen[number]) {
      throw new Error('Code key must map each letter to a unique number from 1 to 26');
    }
    seen[number] = true;
  }
}

export function fixedPointCount(key: CipherKey): number {
  let count = 0;
  for (let i = 0; i < ALPHABET.length; i += 1) {
    if (key[ALPHABET.charAt(i)] === i + 1) count += 1;
  }
  return count;
}

function isAllowedMark(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code >= 33 && code <= 47) return true;
  if (code >= 58 && code <= 64) return true;
  if (code >= 91 && code <= 96) return true;
  if (code >= 123 && code <= 126) return true;
  return false;
}

export function buildPuzzleWithKey(plain: string, key: CipherKey): BuiltPuzzle {
  assertKey(key);
  const upper = plain.toUpperCase();
  const words: Word[] = [];
  let tiles: Tile[] = [];
  const solution: { [number: number]: string } = {};
  const seenLetters: { [letter: string]: boolean } = {};
  let letterCount = 0;
  let longestWord = 0;
  let wordLetters = 0;

  const flush = () => {
    if (!tiles.length) return;
    words.push({ tiles: tiles });
    if (wordLetters > longestWord) longestWord = wordLetters;
    tiles = [];
    wordLetters = 0;
  };

  for (let i = 0; i < upper.length; i += 1) {
    const ch = upper.charAt(i);
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      flush();
      continue;
    }
    if (ch >= 'A' && ch <= 'Z') {
      const number = key[ch];
      tiles.push({ kind: 'letter', number: number });
      solution[number] = ch;
      seenLetters[ch] = true;
      letterCount += 1;
      wordLetters += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      throw new Error('Digits are not allowed in a puzzle');
    }
    if (!isAllowedMark(ch)) {
      throw new Error('Only English letters, spaces, and punctuation are allowed');
    }
    tiles.push({ kind: 'mark', char: ch });
  }
  flush();

  if (letterCount === 0) {
    throw new Error('Puzzle needs letters');
  }

  let uniqueLetterCount = 0;
  for (const letter of Object.keys(seenLetters)) {
    if (seenLetters[letter]) uniqueLetterCount += 1;
  }

  return {
    words: words,
    key: key,
    solution: solution,
    uniqueLetterCount: uniqueLetterCount,
    letterCount: letterCount,
    longestWord: longestWord,
  };
}

export function buildPuzzle(plain: string, rng: () => number = Math.random): BuiltPuzzle {
  return buildPuzzleWithKey(plain, shuffleKey(rng));
}

export function parseCoded(value: unknown): Word[] {
  if (!value || typeof value !== 'object') {
    throw new Error('Encoded puzzle is missing');
  }
  const rawWords = (value as { words?: unknown }).words;
  if (!Array.isArray(rawWords)) throw new Error('Encoded puzzle is missing words');
  const words: Word[] = [];
  for (const rawWord of rawWords) {
    if (!rawWord || typeof rawWord !== 'object') throw new Error('Bad word');
    const rawTiles = (rawWord as { tiles?: unknown }).tiles;
    if (!Array.isArray(rawTiles)) throw new Error('Bad word');
    const tiles: Tile[] = [];
    for (const rawTile of rawTiles) {
      if (!rawTile || typeof rawTile !== 'object') throw new Error('Bad tile');
      const kind = (rawTile as { kind?: unknown }).kind;
      if (kind === 'letter') {
        const number = (rawTile as { number?: unknown }).number;
        if (!Number.isInteger(number) || (number as number) < 1 || (number as number) > 26) {
          throw new Error('Bad code number');
        }
        tiles.push({ kind: 'letter', number: number as number });
      } else if (kind === 'mark') {
        const char = (rawTile as { char?: unknown }).char;
        if (typeof char !== 'string' || char.length !== 1) throw new Error('Bad mark');
        tiles.push({ kind: 'mark', char: char });
      } else {
        throw new Error('Bad tile kind');
      }
    }
    words.push({ tiles: tiles });
  }
  return words;
}

export function codedPayload(words: Word[]): { words: Word[] } {
  return { words: words };
}

export function countFromWords(words: Word[]): {
  uniqueLetterCount: number;
  letterCount: number;
  longestWord: number;
} {
  const seen: { [number: number]: boolean } = {};
  let letterCount = 0;
  let longestWord = 0;
  for (const word of words) {
    let wordLetters = 0;
    for (const tile of word.tiles) {
      if (tile.kind !== 'letter') continue;
      letterCount += 1;
      wordLetters += 1;
      seen[tile.number] = true;
    }
    if (wordLetters > longestWord) longestWord = wordLetters;
  }
  let uniqueLetterCount = 0;
  for (const key of Object.keys(seen)) {
    if (seen[Number(key)]) uniqueLetterCount += 1;
  }
  return {
    uniqueLetterCount: uniqueLetterCount,
    letterCount: letterCount,
    longestWord: longestWord,
  };
}

export function formatPreview(words: Word[]): string {
  if (!words.length) return '';
  let line = '';
  for (const tile of words[0].tiles) {
    if (tile.kind === 'mark') {
      line += tile.char;
      continue;
    }
    if (line.length > 0) {
      const prev = line.charAt(line.length - 1);
      if (prev >= '0' && prev <= '9') line += ' ';
    }
    line += String(tile.number);
  }
  if (words.length > 1) line += ' ...';
  return line;
}
