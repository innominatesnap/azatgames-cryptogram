import type { Mapping } from '../engine/solve';

export type QuoteInfo = {
  author: string;
  work: string;
  year: number;
  plainText: string;
  sourceNote: string;
};

export type SolveOutcome = {
  solved: boolean;
  gaveUp: boolean;
  stars: number;
  points: number;
  hintsUsed: number;
  elapsedMs: number;
  quote: QuoteInfo;
  dateLabel: string;
  letterCount: number;
};

export type ConfirmResult =
  | { solved: false; wrongCount: number }
  | { solved: true; outcome: SolveOutcome };

export type PuzzleApi = {
  check(mapping: Mapping, hintsUsed: number): Promise<{ wrongNumbers: number[]; hintsUsed: number }>;
  reveal(
    number: number,
    mapping: Mapping,
    hintsUsed: number,
    revealedNumbers: number[],
  ): Promise<{ letter: string; hintsUsed: number }>;
  useFrequency(hintsUsed: number, alreadyShown: boolean): Promise<{ hintsUsed: number }>;
  confirm(mapping: Mapping, elapsedMs: number, hintsUsed: number): Promise<ConfirmResult>;
  giveUp(elapsedMs: number, hintsUsed: number): Promise<SolveOutcome>;
};
