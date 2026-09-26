import { describe, expect, it } from 'vitest';
import {
  ALPHABET,
  alphabetIndexKey,
  buildPuzzle,
  buildPuzzleWithKey,
  codedPayload,
  fixedPointCount,
  formatPreview,
  mulberry32,
  parseCoded,
  shuffleKey,
} from './cipher';

describe('cipher', () => {
  it('builds a bijection from 1 to 26 and may include a fixed point', () => {
    const key = shuffleKey(mulberry32(7));
    const numbers = ALPHABET.split('').map((letter) => key[letter]);
    expect(new Set(numbers).size).toBe(26);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(26);
    const identity = shuffleKey(() => 0.999999);
    expect(fixedPointCount(identity)).toBe(26);
    expect(identity.A).toBe(1);
    expect(identity.Z).toBe(26);
  });

  it('accepts a letter mapped to its own alphabet index', () => {
    const built = buildPuzzleWithKey('A cat.', alphabetIndexKey());
    expect(built.key.A).toBe(1);
    expect(built.key.C).toBe(3);
    expect(built.solution[1]).toBe('A');
    expect(built.solution[3]).toBe('C');
  });

  it('preserves punctuation and spaces and ignores case', () => {
    const key = alphabetIndexKey();
    const lower = buildPuzzleWithKey('Hello, world!', key);
    const upper = buildPuzzleWithKey('HELLO, WORLD!', key);
    expect(lower.words.length).toBe(2);
    expect(lower.words[0].tiles.map((tile) => (tile.kind === 'mark' ? tile.char : tile.number))).toEqual([
      key.H,
      key.E,
      key.L,
      key.L,
      key.O,
      ',',
    ]);
    expect(lower.words[1].tiles[lower.words[1].tiles.length - 1]).toEqual({ kind: 'mark', char: '!' });
    expect(parseCoded(codedPayload(lower.words))).toEqual(upper.words);
    expect(lower.letterCount).toBe(10);
    expect(lower.longestWord).toBe(5);
  });

  it('rejects digits', () => {
    expect(() => buildPuzzle('Room 2')).toThrow(/Digits/);
    expect(() => buildPuzzle('19th')).toThrow(/Digits/);
  });

  it('is deterministic for a seed', () => {
    const first = buildPuzzle('To be, or not to be.', mulberry32(20260926));
    const second = buildPuzzle('To be, or not to be.', mulberry32(20260926));
    expect(first.key).toEqual(second.key);
    expect(first.words).toEqual(second.words);
  });

  it('previews the first word as numbers', () => {
    const built = buildPuzzleWithKey('Hi, pal', alphabetIndexKey());
    expect(formatPreview(built.words)).toBe('8 9, ...');
  });

  it('round-trips a coded payload whose escape would split across chunks of text', () => {
    const built = buildPuzzleWithKey('a'.repeat(40) + '!', alphabetIndexKey());
    expect(parseCoded(JSON.parse(JSON.stringify(codedPayload(built.words))))).toEqual(built.words);
  });
});
