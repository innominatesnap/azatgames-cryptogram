import type { Mapping } from '../engine/solve';
import type { Attribution, HintRecord } from './records';

export type HintBoardState = {
  mapping: Mapping;
  revealedNumbers: number[];
  attributionUnveiled: boolean;
  cipherNumbers: number[];
  hintLog: HintRecord[];
  hintsUsed: number;
};

export type HintEffect =
  | {
      action: 'mark';
      id: string;
      number: number;
      hintsUsed: number;
      hintLog: HintRecord[];
      note: string;
    }
  | {
      action: 'reveal';
      id: string;
      number: number;
      letter: string;
      fallback: boolean;
      hintsUsed: number;
      hintLog: HintRecord[];
      note: string;
    }
  | {
      action: 'unveil';
      id: string;
      attribution: Attribution;
      hintsUsed: number;
      hintLog: HintRecord[];
      note: string;
    }
  | {
      action: 'none';
      id: string;
      hintsUsed: number;
      hintLog: HintRecord[];
      note: string;
    };

export type HintGateway = {
  request(id: string, state: HintBoardState): Promise<HintEffect>;
};

/**
 * One entry in the hint catalog. Cards render from this list.
 * `weight` is a placeholder for a later catalog. It is not a price.
 */
export type HintType = {
  id: string;
  category: string;
  title: string;
  description: string;
  weight: number;
  isAvailable(state: HintBoardState): boolean;
  apply(state: HintBoardState, gateway: HintGateway): Promise<HintEffect>;
};

export type HintGroup = {
  category: string;
  label: string;
  hints: HintType[];
};
