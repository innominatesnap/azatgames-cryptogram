import type { Mapping } from '../engine/solve';
import type { HintRecord } from '../hints/records';
import type { HintBoardState, HintEffect } from '../hints/types';

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
  hintLog: HintRecord[];
};

export type ConfirmResult =
  | { solved: false; wrongCount: number }
  | { solved: true; outcome: SolveOutcome };

export type PuzzleApi = {
  requestHint(id: string, state: HintBoardState): Promise<HintEffect>;
  check(mapping: Mapping, hintsUsed: number): Promise<{ wrongNumbers: number[]; hintsUsed: number }>;
  reveal(
    number: number,
    mapping: Mapping,
    hintsUsed: number,
    revealedNumbers: number[],
  ): Promise<{ letter: string; hintsUsed: number }>;
  useFrequency(hintsUsed: number, alreadyShown: boolean): Promise<{ hintsUsed: number }>;
  confirm(mapping: Mapping, elapsedMs: number, hintsUsed: number, hintLog: HintRecord[]): Promise<ConfirmResult>;
  giveUp(elapsedMs: number, hintsUsed: number, hintLog: HintRecord[]): Promise<SolveOutcome>;
};
