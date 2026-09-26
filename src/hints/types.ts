import type { Mapping } from '../engine/solve';
import type { HintRecord } from './records';

export type HintBoardState = {
  mapping: Mapping;
  revealedNumbers: number[];
  cipherNumbers: number[];
  uniqueLetterCount: number;
  hintLog: HintRecord[];
  hintsUsed: number;
  hintPoints: number;
  frequencyShown: boolean;
  crossedOff: string[];
  attributionStage: 0 | 1 | 2;
  markedNumbers: number[];
  puzzleKey: string;
};

export type HintExtra = {
  number?: number;
  confirm?: boolean;
};

/**
 * Only the fields for `action` are meaningful.
 * A mark never includes a correct letter. An author stage never includes the source or the quote.
 */
export type HintEffect = {
  action: 'mark' | 'reveal' | 'cross-off' | 'frequency' | 'author' | 'source' | 'none';
  id: string;
  charged: boolean;
  cost: number;
  hintsUsed: number;
  hintPoints: number;
  hintLog: HintRecord[];
  note: string;
  numbers: number[];
  letter: string;
  letters: string[];
  author: string;
  work: string;
  year: number;
};

export type HintGateway = {
  request(id: string, state: HintBoardState, requestId: string, extra?: HintExtra): Promise<HintEffect>;
};

export type HintType = {
  id: string;
  category: string;
  title: string;
  description: string;
  /** Hint-point cost from the config module. Not money. */
  price: number;
  stub: boolean;
  icon: string;
  isAvailable(state: HintBoardState): boolean;
  unavailableReason(state: HintBoardState): string | null;
  apply(state: HintBoardState, gateway: HintGateway, requestId: string, extra?: HintExtra): Promise<HintEffect>;
};

export type HintGroup = {
  category: string;
  label: string;
  hints: HintType[];
};
