import type { Word } from '../engine/cipher';
import type { SolveState } from '../engine/solve';
import { cipherNumbersInWords } from './select';
import type { HintBoardState } from './types';

export function boardFromSolve(
  state: SolveState,
  words: Word[],
  puzzleKey: string,
  uniqueLetterCount: number,
): HintBoardState {
  return {
    mapping: state.present,
    revealedNumbers: state.revealedNumbers,
    cipherNumbers: cipherNumbersInWords(words),
    uniqueLetterCount: uniqueLetterCount,
    hintLog: state.hintLog,
    hintsUsed: state.hintsUsed,
    hintPoints: state.hintPoints,
    frequencyShown: state.frequencyShown,
    crossedOff: state.crossedOff,
    attributionStage: state.attributionStage,
    markedNumbers: state.markedNumbers,
    puzzleKey: puzzleKey,
  };
}

export function newRequestId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID();
  return 'req-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 100000));
}
