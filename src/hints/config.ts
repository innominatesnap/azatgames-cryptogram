/**
 * Hint prices, caps, and star thresholds.
 * Yuanxing recommendations H1 A, H2, H3 A, H4 A, H5 A, H6 A, H7 A, H8 A, H13 A, H14 A.
 * Keep these numbers equal to the seed in
 * supabase/migrations/20260926160000_cryptogram_hint_catalog.sql
 * (tables cryptogram.hint_catalog and cryptogram.scoring_rules).
 * Hint points are a score penalty. They are not a price in money.
 *
 * H9 friend allowances are not built. Later: Hard (no hints), Standard
 * (analysis, cross-off, mark-one, surprise-letter), Easy (also check-all
 * and pick-letter). Context stays off on friend puzzles.
 * H10 extras stay stubs or comments: word patterns, short words, reveal a word.
 * Confirm-one-right is not shipped because H4 is A.
 */

export const STAR_RULES = {
  /** 0 hint points and inside par. */
  threeStarMaxPoints: 0,
  /** 1 to this many hint points is 2 stars. Above this is 1 star. 0 points over par is also 2. */
  twoStarMaxPoints: 2,
};

export const CROSS_OFF_BATCH = 4;

export const REVEAL_CAP = {
  divisor: 3,
  min: 1,
  max: 4,
};

export const ATTRIBUTION_STAGES = ['author', 'source'] as const;

export type HintCharge = 'once' | 'per-use' | 'stage';

export type HintSpec = {
  id: string;
  category: 'analysis' | 'narrow' | 'placement' | 'reveal' | 'context';
  title: string;
  description: string;
  /** Hint points charged when the hint returns something new. */
  price: number;
  /** Null means the cap is elsewhere (reveal cap, or until none remain). */
  maxUses: number | null;
  charge: HintCharge;
  stub: boolean;
  icon: string;
};

export const HINT_SPECS: HintSpec[] = [
  {
    id: 'frequency-chart',
    category: 'analysis',
    title: 'Letter frequency chart',
    description: 'Lines this puzzle up with a classic English frequency chart.',
    price: 1,
    maxUses: 1,
    charge: 'once',
    stub: false,
    icon: 'Chart',
  },
  {
    id: 'word-patterns',
    category: 'analysis',
    title: 'Word patterns',
    description: 'Shows the shape of a word. Not in this version.',
    price: 1,
    maxUses: 1,
    charge: 'once',
    stub: true,
    icon: 'Pattern',
  },
  {
    id: 'short-words',
    category: 'analysis',
    title: 'Short words and endings',
    description: 'Common short words and endings. Not in this version.',
    price: 1,
    maxUses: 1,
    charge: 'once',
    stub: true,
    icon: 'Words',
  },
  {
    id: 'cross-off',
    category: 'narrow',
    title: 'Cross off unused letters',
    description: 'Strikes letters that are not in this puzzle, up to 4 at a time.',
    price: 1,
    maxUses: null,
    charge: 'per-use',
    stub: false,
    icon: 'Strike',
  },
  {
    id: 'mark-one',
    category: 'placement',
    title: 'Mark one wrong letter',
    description: 'Marks one placed letter that is wrong. Other letters may still be wrong.',
    price: 1,
    maxUses: 5,
    charge: 'per-use',
    stub: false,
    icon: 'Mark',
  },
  {
    id: 'check-all',
    category: 'placement',
    title: 'Check all my letters',
    description: 'Marks every placed letter that is wrong.',
    price: 2,
    maxUses: 2,
    charge: 'per-use',
    stub: false,
    icon: 'Marks',
  },
  {
    id: 'surprise-letter',
    category: 'reveal',
    title: 'Surprise letter',
    description: 'The game picks a number you have not solved and locks it in.',
    price: 2,
    maxUses: null,
    charge: 'per-use',
    stub: false,
    icon: 'Lock',
  },
  {
    id: 'pick-letter',
    category: 'reveal',
    title: 'Reveal a letter you pick',
    description: 'You tap a number. That letter locks in everywhere.',
    price: 3,
    maxUses: null,
    charge: 'per-use',
    stub: false,
    icon: 'Lock',
  },
  {
    id: 'reveal-word',
    category: 'reveal',
    title: 'Reveal a word',
    description: 'Locks every unrevealed number in one word. Not in this version.',
    price: 4,
    maxUses: null,
    charge: 'per-use',
    stub: true,
    icon: 'Lock',
  },
  {
    id: 'unveil-author',
    category: 'context',
    title: 'Unveil the author',
    description: 'Shows who wrote the quote. The source stays hidden.',
    price: 1,
    maxUses: 1,
    charge: 'stage',
    stub: false,
    icon: 'Author',
  },
  {
    id: 'unveil-source',
    category: 'context',
    title: 'Unveil the source',
    description: 'Shows the book or speech and the year. The author comes first.',
    price: 1,
    maxUses: 1,
    charge: 'stage',
    stub: false,
    icon: 'Source',
  },
];

export function hintSpec(id: string): HintSpec | null {
  for (const spec of HINT_SPECS) {
    if (spec.id === id) return spec;
  }
  return null;
}

export function costLabel(points: number): string {
  if (points === 1) return '1 hint point';
  return String(points) + ' hint points';
}

export function revealCapFor(uniqueLetterCount: number): number {
  const raw = Math.floor(uniqueLetterCount / REVEAL_CAP.divisor);
  if (raw < REVEAL_CAP.min) return REVEAL_CAP.min;
  if (raw > REVEAL_CAP.max) return REVEAL_CAP.max;
  return raw;
}

export const FREQUENCY_SOURCE = {
  id: 'R1',
  name: 'Classic reference',
  era: 'Reference tables of 1982 and 2000 (newspapers and novels)',
  citation:
    'Robert Edward Lewand, Cryptological Mathematics, Mathematical Association of America, 2000, Table 1, p. 36. Relative frequencies of the letters of the English language.',
  tip: 'Short quotes wobble. A short quote rarely matches English exactly. Treat this as a nudge, not an answer.',
};
