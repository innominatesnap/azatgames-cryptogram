import { formatDuration } from '../engine/scoring';
import { HINT_SPECS, costLabel } from './config';
import type { HintRecord } from './records';
import { unavailableReason, usesLabel } from './rules';
import type { HintBoardState, HintGroup, HintType } from './types';

export const CATEGORY_ORDER = ['analysis', 'narrow', 'placement', 'reveal', 'context'] as const;

export const CATEGORY_LABELS: { [category: string]: string } = {
  analysis: 'Analysis tools',
  narrow: 'Narrow it down',
  placement: 'Placement checks',
  reveal: 'Reveals',
  context: 'Context',
};

const RECEIPT_NAMES: { [id: string]: string } = {
  'frequency-chart': 'frequency chart',
  'cross-off': 'unused letters crossed off',
  'mark-one': 'one wrong letter marked',
  'check-all': 'all letters checked',
  'surprise-letter': 'surprise letter',
  'pick-letter': 'letter you picked',
  'unveil-author': 'author',
  'unveil-source': 'source',
};

/**
 * Shipped catalog, including stubs that stay visible and do not charge.
 * Add a hint in src/hints/config.ts, then handle it in localGateway.ts and
 * in a new SQL migration. See README.md.
 * H9 friend allowances and H10 extras (word patterns, short words, reveal a
 * word, confirm-one-right) are not built. Confirm-one-right stays a comment
 * because the recommendation is surprise-letter and pick-a-letter.
 */
export const HINT_CATALOG: HintType[] = HINT_SPECS.map((spec) => ({
  id: spec.id,
  category: spec.category,
  title: spec.title,
  description: spec.description,
  price: spec.price,
  stub: spec.stub,
  icon: spec.icon,
  isAvailable(state: HintBoardState) {
    return unavailableReason(spec.id, state) === null;
  },
  unavailableReason(state: HintBoardState) {
    return unavailableReason(spec.id, state);
  },
  apply(state, gateway, requestId, extra) {
    return gateway.request(spec.id, state, requestId, extra);
  },
}));

export function groupHints(hints: HintType[]): HintGroup[] {
  const buckets: { [category: string]: HintType[] } = {};
  for (const hint of hints) {
    if (!buckets[hint.category]) buckets[hint.category] = [];
    buckets[hint.category].push(hint);
  }
  const groups: HintGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    if (!buckets[category]) continue;
    groups.push({
      category: category,
      label: CATEGORY_LABELS[category] || category,
      hints: buckets[category],
    });
  }
  return groups;
}

export function hintTitle(id: string): string {
  for (const spec of HINT_SPECS) {
    if (spec.id === id) return spec.title;
  }
  return id;
}

export function usesLeftLabel(id: string, state: HintBoardState): string {
  return usesLabel(id, state);
}

export function hintReceipt(hintPoints: number, log: HintRecord[]): string {
  if (hintPoints <= 0) return 'No hints. Clean solve.';
  const order: string[] = [];
  const costs: { [id: string]: number } = {};
  for (const row of log) {
    if (row.cost <= 0) continue;
    if (costs[row.id] === undefined) {
      costs[row.id] = 0;
      order.push(row.id);
    }
    costs[row.id] += row.cost;
  }
  const parts: string[] = [];
  for (const id of order) {
    parts.push((RECEIPT_NAMES[id] || hintTitle(id)) + ' (' + String(costs[id]) + ')');
  }
  const head = costLabel(hintPoints);
  if (!parts.length) return head + '.';
  return head + ': ' + parts.join(', ') + '.';
}

export function pointsUsedLabel(points: number): string {
  if (points === 1) return '1 hint point used';
  return String(points) + ' hint points used';
}

/** Spoiler-free. Stars, time, and hint points only. Never the quote. */
export function shareResultText(input: {
  dateLabel: string;
  stars: number;
  elapsedMs: number;
  hintPoints: number;
  gaveUp: boolean;
}): string {
  const filled = input.stars < 0 ? 0 : input.stars > 3 ? 3 : input.stars;
  const stars = '★'.repeat(filled) + '☆'.repeat(3 - filled);
  const hints = input.gaveUp ? 'answer shown' : input.hintPoints <= 0 ? 'clean solve' : costLabel(input.hintPoints);
  return 'CryptoGram ' + input.dateLabel + ' ' + stars + ' ' + formatDuration(input.elapsedMs) + ' ' + hints;
}
