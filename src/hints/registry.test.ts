import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { emptySolveState, setLetter, undo, type Mapping } from '../engine/solve';
import { AttributionLine } from '../ui/AttributionLine';
import { FrequencyBars } from '../ui/FrequencyBars';
import { HintPanel } from '../ui/HintPanel';
import { applyHintEffect } from './apply';
import { localHintEffect } from './localGateway';
import { HINT_CATALOG, groupHints, hintReceipt, shareResultText } from './registry';
import { effectFromServer } from './serverEffect';
import { pickMarkOne } from './rules';
import type { HintBoardState } from './types';

const solution: Mapping = { 1: 'T', 2: 'O', 3: 'B', 4: 'E' };
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
    cipherNumbers: [1, 2, 3, 4],
    uniqueLetterCount: 4,
    hintLog: [],
    hintsUsed: 0,
    hintPoints: 0,
    frequencyShown: false,
    crossedOff: [],
    attributionStage: 0,
    markedNumbers: [],
    puzzleKey: 'practice-sample',
    ...extra,
  };
}

describe('hint catalog', () => {
  it('renders every category, including stubs that do not charge', () => {
    const groups = groupHints(HINT_CATALOG);
    expect(groups.map((group) => group.label)).toEqual([
      'Analysis tools',
      'Narrow it down',
      'Placement checks',
      'Reveals',
      'Context',
    ]);
    const html = renderToStaticMarkup(createElement(HintPanel, {
      hints: HINT_CATALOG,
      state: board(),
      note: null,
      onApply: () => undefined,
      onArmPick: () => undefined,
      onOpenChart: () => undefined,
      onClose: () => undefined,
    }));
    expect(html).toContain('Pick a hint');
    expect(html).toContain('Not in this version');
    expect(html).toContain('1 hint point');
    expect(html).toContain('Word patterns');
    expect(html).not.toContain('$');
    const stub = localHintEffect('word-patterns', board(), solution, attribution, 'practice-sample', 'r1');
    expect(stub.charged).toBe(false);
    expect(stub.hintPoints).toBe(0);
  });

  it('marks one wrong letter and does not fall through to a reveal', () => {
    const state = board({ mapping: { 1: 'Z', 2: 'Q' } });
    const first = localHintEffect('mark-one', state, solution, attribution, 'practice-sample', 'm1');
    expect(first.action).toBe('mark');
    expect(first.numbers.length).toBe(1);
    expect(first.letter).toBe('');
    expect([1, 2]).toContain(first.numbers[0]);
    expect(first.charged).toBe(true);
    expect(first.cost).toBe(1);
    const again = localHintEffect('mark-one', state, solution, attribution, 'practice-sample', 'm1b');
    expect(again.numbers).toEqual(first.numbers);
    const empty = localHintEffect('mark-one', board(), solution, attribution, 'practice-sample', 'm0');
    expect(empty.charged).toBe(false);
    expect(empty.note).toBe('Place a letter first.');
    const right = localHintEffect('mark-one', board({ mapping: { 1: 'T', 2: 'O' } }), solution, attribution, 'practice-sample', 'm2');
    expect(right.charged).toBe(true);
    expect(right.numbers).toEqual([]);
    expect(right.note).toContain('right');
    expect(right.letter).toBe('');
  });

  it('picks the same wrong number for the same seed', () => {
    const picked = pickMarkOne({ wrong: [2, 4, 9], alreadyMarked: [], seed: 'board|1=Z|0' });
    expect(pickMarkOne({ wrong: [9, 2, 4], alreadyMarked: [picked || 0], seed: 'board|1=Z|0' })).not.toBe(picked);
    expect(pickMarkOne({ wrong: [2, 4, 9], alreadyMarked: [], seed: 'board|1=Z|0' })).toBe(picked);
  });

  it('charges a picked letter even when that letter is already placed', () => {
    const placed = board({ mapping: { 1: 'T' }, uniqueLetterCount: 12 });
    const effect = localHintEffect('pick-letter', placed, solution, attribution, 'practice-sample', 'p1', { number: 1 });
    expect(effect.charged).toBe(true);
    expect(effect.cost).toBe(3);
    expect(effect.letter).toBe('T');
    const applied = applyHintEffect(emptySolveState(), effect);
    const locked = setLetter(applied.state, 1, 'Z');
    expect(locked.present[1]).toBe('T');
    const undone = undo(setLetter(applied.state, 2, 'Q'));
    expect(undone.present[1]).toBe('T');
    const free = localHintEffect('pick-letter', board({ revealedNumbers: [1] }), solution, attribution, 'practice-sample', 'p2', { number: 1 });
    expect(free.charged).toBe(false);
  });

  it('withholds author and source until each stage is bought', () => {
    const hidden = renderToStaticMarkup(createElement(AttributionLine, {
      stage: 0,
      author: null,
      work: null,
      year: null,
    }));
    expect(hidden).toContain('Revealed after a hint');
    expect(hidden).toContain('Hidden');
    expect(hidden).not.toContain('Shakespeare');
    expect(hidden).not.toContain('Hamlet');
    expect(hidden).not.toContain('blur');
    const author = localHintEffect('unveil-author', board(), solution, attribution, 'practice-sample', 'a1');
    expect(author.author).toBe('William Shakespeare');
    expect(author.work).toBe('');
    expect(author.charged).toBe(true);
    const shown = applyHintEffect(emptySolveState(), author).state;
    const sourceBlocked = localHintEffect('unveil-source', board(), solution, attribution, 'practice-sample', 's0');
    expect(sourceBlocked.charged).toBe(false);
    const source = localHintEffect('unveil-source', board({ attributionStage: 1 }), solution, attribution, 'practice-sample', 's1');
    expect(source.work).toBe('Hamlet');
    expect(source.year).toBe(1604);
    expect(source.author).toBe('');
    expect(shown.attribution && shown.attribution.author).toBe('William Shakespeare');
    expect(shown.attribution && shown.attribution.work).toBe('');
  });

  it('names hint points on the receipt and keeps share text spoiler-free', () => {
    const log = [
      { id: 'frequency-chart', action: 'frequency', cost: 1, requestId: 'f' },
      { id: 'mark-one', action: 'mark', cost: 1, requestId: 'm' },
    ];
    expect(hintReceipt(2, log)).toBe('2 hint points: frequency chart (1), one wrong letter marked (1).');
    expect(hintReceipt(0, [])).toBe('No hints. Clean solve.');
    const share = shareResultText({ dateLabel: 'Sample', stars: 2, elapsedMs: 5000, hintPoints: 2, gaveUp: false });
    expect(share).toContain('2 hint points');
    expect(share).not.toContain('question');
    expect(share).not.toContain('Shakespeare');
  });

  it('drops plaintext and a wrong count from a server payload', () => {
    const state = board();
    const effect = effectFromServer({
      hintType: 'mark-one',
      action: 'mark',
      numbers: [4],
      charged: true,
      cost: 1,
      hintsUsed: 1,
      hintPoints: 1,
      hintLog: [{ id: 'mark-one', action: 'mark', cost: 1, requestId: 'm' }],
      note: 'One wrong letter marked. Other letters may still be wrong.',
      plainText: 'To be',
      author: 'William Shakespeare',
      wrongCount: 8,
    }, 'mark-one', state);
    expect(effect.numbers).toEqual([4]);
    expect(effect.author).toBe('');
    expect(JSON.stringify(effect)).not.toContain('To be');
    expect(JSON.stringify(effect)).not.toContain('wrongCount');
  });

  it('shows the frequency source and keeps English bars off the reveal color', () => {
    const html = renderToStaticMarkup(createElement(FrequencyBars, {
      counts: [{ number: 1, count: 3 }],
      revealed: { 1: 'T' },
    }));
    expect(html).toContain('Lewand');
    expect(html).toContain('Short quotes wobble');
    expect(html).toContain('bar-fill-english');
    expect(html).toContain('bar-fill-revealed');
    expect(html).toContain('lock');
  });
});
