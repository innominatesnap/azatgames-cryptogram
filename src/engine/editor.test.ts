import { describe, expect, it } from 'vitest';
import { alphabetIndexKey, buildPuzzleWithKey } from './cipher';
import { firstEmptyTileIndex, nextEmptyTileIndex, wordIsFull, wordLabel } from './editor';
import { placeLetter } from './solve';

describe('word editor', () => {
  const puzzle = buildPuzzleWithKey('Hi, you', alphabetIndexKey());
  const word = puzzle.words[0];

  it('advances to the next empty tile and closes the idea of a full word', () => {
    expect(firstEmptyTileIndex(word, {})).toBe(0);
    let mapping = placeLetter({}, word.tiles[0].kind === 'letter' ? word.tiles[0].number : 0, 'H');
    expect(nextEmptyTileIndex(word, mapping, 0)).toBe(1);
    const second = word.tiles[1];
    if (second.kind !== 'letter') throw new Error('expected letter');
    mapping = placeLetter(mapping, second.number, 'I');
    expect(nextEmptyTileIndex(word, mapping, 1)).toBeNull();
    expect(wordIsFull(word, mapping)).toBe(true);
    expect(wordLabel(word, mapping)).toBe('HI,');
  });
});
