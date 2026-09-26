import type { HintBoardState, HintGroup, HintType } from './types';

export const CATEGORY_LABELS: { [category: string]: string } = {
  board: 'On the board',
  source: 'Author and source',
};

const HINT_TITLES: { [id: string]: string } = {
  'find-mistake': 'Find a mistake',
  'reveal-letter': 'Reveal a letter',
  'unveil-attribution': 'Unveil author and source',
};

function boardStillOpen(state: HintBoardState): boolean {
  if (!state.cipherNumbers.length) return true;
  for (const number of state.cipherNumbers) {
    if (state.revealedNumbers.indexOf(number) === -1) return true;
  }
  return false;
}

/**
 * Shipped catalog. Add a hint by appending a HintType here and handling its
 * id in the local gateway and in cryptogram.request_hint. See README.md.
 */
export const HINT_CATALOG: HintType[] = [
  {
    id: 'find-mistake',
    category: 'board',
    title: 'Find a mistake',
    description: 'Marks one wrong letter in red. If nothing placed is wrong, reveals one letter instead.',
    weight: 1,
    isAvailable: boardStillOpen,
    apply(state, gateway) {
      return gateway.request('find-mistake', state);
    },
  },
  {
    id: 'reveal-letter',
    category: 'board',
    title: 'Reveal a letter',
    description: 'Fills one correct letter in blue and locks it.',
    weight: 1,
    isAvailable: boardStillOpen,
    apply(state, gateway) {
      return gateway.request('reveal-letter', state);
    },
  },
  {
    id: 'unveil-attribution',
    category: 'source',
    title: 'Unveil author and source',
    description: 'Shows who wrote the quote and where it is from.',
    weight: 1,
    isAvailable(state) {
      return !state.attributionUnveiled;
    },
    apply(state, gateway) {
      return gateway.request('unveil-attribution', state);
    },
  },
];

export function groupHints(hints: HintType[]): HintGroup[] {
  const order: string[] = [];
  const buckets: { [category: string]: HintType[] } = {};
  for (const hint of hints) {
    if (!buckets[hint.category]) {
      buckets[hint.category] = [];
      order.push(hint.category);
    }
    buckets[hint.category].push(hint);
  }
  return order.map((category) => ({
    category: category,
    label: CATEGORY_LABELS[category] || category,
    hints: buckets[category],
  }));
}

export function hintTitle(id: string): string {
  return HINT_TITLES[id] || id;
}

export function hintUsageLabel(hintsUsed: number, log: { id: string }[]): string {
  const count = hintsUsed === 1 ? '1 hint' : String(hintsUsed) + ' hints';
  if (!log.length) return count;
  const names: string[] = [];
  for (const row of log) names.push(hintTitle(row.id));
  return count + ': ' + names.join(', ');
}
