import type { HintRecord } from './records';
import type { HintBoardState, HintEffect } from './types';

export function baseEffect(state: HintBoardState, id: string, note: string): HintEffect {
  return {
    action: 'none',
    id: id,
    charged: false,
    cost: 0,
    hintsUsed: state.hintsUsed,
    hintPoints: state.hintPoints,
    hintLog: state.hintLog,
    note: note,
    numbers: [],
    letter: '',
    letters: [],
    author: '',
    work: '',
    year: 0,
  };
}

export function charge(
  state: HintBoardState,
  id: string,
  action: string,
  cost: number,
  requestId: string,
): { hintsUsed: number; hintPoints: number; hintLog: HintRecord[] } {
  return {
    hintsUsed: state.hintsUsed + 1,
    hintPoints: state.hintPoints + cost,
    hintLog: state.hintLog.concat([{ id: id, action: action, cost: cost, requestId: requestId }]),
  };
}
