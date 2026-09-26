import type { Word } from './cipher';
import type { Mapping } from './solve';

export function wordIsFull(word: Word, mapping: Mapping): boolean {
  for (const tile of word.tiles) {
    if (tile.kind === 'letter' && mapping[tile.number] === undefined) return false;
  }
  return true;
}

export function nextEmptyTileIndex(word: Word, mapping: Mapping, fromTileIndex: number): number | null {
  for (let i = fromTileIndex + 1; i < word.tiles.length; i += 1) {
    const tile = word.tiles[i];
    if (tile.kind === 'letter' && mapping[tile.number] === undefined) return i;
  }
  return null;
}

export function previousLetterTileIndex(word: Word, fromTileIndex: number): number | null {
  for (let i = fromTileIndex - 1; i >= 0; i -= 1) {
    if (word.tiles[i].kind === 'letter') return i;
  }
  return null;
}

export function firstEmptyTileIndex(word: Word, mapping: Mapping): number | null {
  for (let i = 0; i < word.tiles.length; i += 1) {
    const tile = word.tiles[i];
    if (tile.kind === 'letter' && mapping[tile.number] === undefined) return i;
  }
  return null;
}

export function wordLabel(word: Word, mapping: Mapping): string {
  let text = '';
  for (const tile of word.tiles) {
    if (tile.kind === 'mark') {
      text += tile.char;
      continue;
    }
    text += mapping[tile.number] || '\u00b7';
  }
  return text;
}
