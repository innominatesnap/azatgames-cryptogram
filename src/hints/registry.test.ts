import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { applyHintEffect } from './apply';
import { effectFromServer } from './serverEffect';
import { HINT_CATALOG, groupHints, hintUsageLabel } from './registry';
import { localHintEffect } from './localGateway';
import { emptySolveState, setLetter, undo, type Mapping } from '../engine/solve';
import { AttributionLine } from '../ui/AttributionLine';
import { HintPanel } from '../ui/HintPanel';
import type { HintBoardState } from './types';

const solution: Mapping = { 1: 'T', 2: 'O', 3: 'B' };
const attribution = {
  author: 'William Shakespeare',
  work: 'Hamlet',
  year: 1604,
  sourceNote: 'US public domain.',
};

function board(extra: Partial<HintBoardState> = {}): HintBoardState {
  return {
    mapping: {},
    revealedNumbers: [],
    attributionUnveiled: false,
    cipherNumbers: [1, 2, 3],
    hintLog: [],
    hintsUsed: 0,
    ...extra,
  };
}

describe('hint registry', () => {
  it('renders the shipped cards from the catalog, grouped, with no dropdown', () => {
    expect(HINT_CATALOG.map((hint) => hint.id)).toEqual([
      'find-mistake',
      'reveal-letter',
      'unveil-attribution',
    ]);
    const groups = groupHints(HINT_CATALOG);
    expect(groups.map((group) => group.category)).toEqual(['board', 'source']);
    expect(groups[0].hints.map((hint) => hint.title)).toEqual(['Find a mistake', 'Reveal a letter']);
    const html = renderToStaticMarkup(
      createElement(HintPanel, {
        hints: HINT_CATALOG,
        state: board(),
        note: null,
        onApply() {
          return undefined;
        },
        onClose() {
          return undefined;
        },
      }),
    );
    expect(html).toContain('Find a mistake');
    expect(html).toContain('Reveal a letter');
    expect(html).toContain('Unveil author and source');
    expect(html).toContain('On the board');
    expect(html).toContain('Author and source');
    expect(html).toContain('big-card');
    expect(html.toLowerCase()).not.toContain('<select');
    expect(html.toLowerCase()).not.toContain('dropdown');
    expect(html).not.toContain('$');
    for (const hint of HINT_CATALOG) {
      expect(typeof hint.weight).toBe('number');
      expect(hint.description.indexOf('$')).toBe(-1);
    }
  });

  it('blurs attribution until the unveil card is used', () => {
    const hidden = renderToStaticMarkup(
      createElement(AttributionLine, {
        unveiled: false,
        author: attribution.author,
        source: attribution.work,
      }),
    );
    expect(hidden).toContain('attribution-hidden');
    expect(hidden).toContain('title="Revealed after a hint"');
    expect(hidden).toContain('aria-label="Revealed after a hint"');
    expect(hidden).toContain('Revealed after a hint');
    const unveil = HINT_CATALOG.find((hint) => hint.id === 'unveil-attribution');
    expect(unveil && unveil.isAvailable(board())).toBe(true);
    const effect = localHintEffect('unveil-attribution', board(), solution, attribution, () => 0);
    expect(effect.action).toBe('unveil');
    if (effect.action !== 'unveil') return;
    const shown = renderToStaticMarkup(
      createElement(AttributionLine, {
        unveiled: true,
        author: effect.attribution.author,
        source: effect.attribution.work,
      }),
    );
    expect(shown).not.toContain('attribution-hidden');
    expect(shown).toContain('William Shakespeare');
    expect(shown).toContain('Hamlet');
    expect(unveil && unveil.isAvailable(board({ attributionUnveiled: true }))).toBe(false);
    const again = localHintEffect(
      'unveil-attribution',
      board({ attributionUnveiled: true, hintsUsed: 1 }),
      solution,
      attribution,
      () => 0,
    );
    expect(again.hintsUsed).toBe(1);
  });

  it('falls through to one letter when nothing placed is wrong', () => {
    const effect = localHintEffect('find-mistake', board(), solution, attribution, () => 0);
    expect(effect.action).toBe('reveal');
    if (effect.action !== 'reveal') return;
    expect(effect.fallback).toBe(true);
    expect(effect.note).toBe("No mistakes found, here's a letter");
    expect(effect.letter).toBe(solution[effect.number]);
    const marked = localHintEffect(
      'find-mistake',
      board({ mapping: { 1: 'Z', 2: 'Q' } }),
      solution,
      attribution,
      () => 0,
    );
    expect(marked.action).toBe('mark');
    if (marked.action === 'mark') expect(marked.number).toBe(1);
    expect(JSON.stringify(marked)).not.toContain(solution[1]);
  });

  it('locks a revealed letter and records the hint type', () => {
    const effect = localHintEffect('reveal-letter', board(), solution, attribution, () => 0);
    expect(effect.action).toBe('reveal');
    if (effect.action !== 'reveal') return;
    expect(effect.letter).toBe(solution[effect.number]);
    const applied = applyHintEffect(emptySolveState(), [], effect);
    expect(applied.state.revealedLetters[effect.number]).toBe(effect.letter);
    expect(applied.state.hintLog).toEqual([{ id: 'reveal-letter', action: 'reveal' }]);
    const locked = setLetter(applied.state, effect.number, 'Z');
    expect(locked.present[effect.number]).toBe(effect.letter);
    const undone = undo(applied.state);
    expect(undone.present[effect.number]).toBe(effect.letter);
    expect(hintUsageLabel(applied.state.hintsUsed, applied.state.hintLog)).toBe('1 hint: Reveal a letter');
  });

  it('drops plaintext and extra letters from a server payload', () => {
    const marked = effectFromServer(
      {
        hintType: 'find-mistake',
        action: 'mark',
        number: 4,
        letter: 'Q',
        plainText: 'To be, or not to be',
        hintsUsed: 1,
        hintLog: [{ id: 'find-mistake', action: 'mark' }],
        note: 'One wrong letter is marked.',
      },
      'find-mistake',
      0,
      [],
    );
    expect(marked.action).toBe('mark');
    expect(JSON.stringify(marked)).not.toContain('plainText');
    expect(JSON.stringify(marked)).not.toContain('To be');
    if (marked.action === 'mark') expect(marked.number).toBe(4);
    expect('letter' in marked).toBe(false);
  });
});
