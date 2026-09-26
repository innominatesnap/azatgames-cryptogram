import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptySolveState } from '../engine/solve';
import { createPracticeBundle } from '../play/bundle';
import { previewBundle } from '../play/boot';
import { keyboardFaces } from '../play/input';
import { playSurface } from './PuzzleBoard';

function memoryStore() {
  const mem = new Map<string, string>();
  return {
    getItem(key: string) {
      return mem.has(key) ? mem.get(key) || '' : null;
    },
    setItem(key: string, value: string) {
      mem.set(key, value);
    },
  };
}

describe('shared play screen', () => {
  it('uses one board renderer and one keyboard for live and sample', () => {
    const sample = playSurface('practice');
    const live = playSurface('live');
    expect(live.Board).toBe(sample.Board);
    expect(live.Board.name).toBe('PuzzleBoard');
    expect(live.input).toBe('onscreen-keyboard');
    expect(sample.input).toBe(live.input);
    expect(live.wordEditor).toBe(false);
    expect(sample.wordEditor).toBe(false);

    const practice = createPracticeBundle(memoryStore());
    const mockedLive = previewBundle(practice, '?preview=live');
    expect(mockedLive).not.toBeNull();
    if (!mockedLive) return;
    expect(mockedLive.mode).toBe('live');
    expect(mockedLive.words).toBe(practice.words);
    expect(practice.mode).toBe('practice');
    const sampleKeys = keyboardFaces(practice.initial, null).map((face) => face.letter);
    const liveKeys = keyboardFaces(emptySolveState(), null).map((face) => face.letter);
    expect(liveKeys).toEqual(sampleKeys);
    expect(previewBundle(practice, '')).toBeNull();
  });

  it('does not keep a word editor on the solve screen', () => {
    const source = readFileSync(new URL('./SolveScreen.tsx', import.meta.url), 'utf8');
    expect(source.toLowerCase()).not.toContain('word editor');
    expect(source).not.toContain('WordSheet');
    expect(source).toContain('playSurface(bundle.mode)');
    expect(source).not.toContain('editor-title');
  });
});
