import { setLetter, type SolveState } from '../engine/solve';
import type { HintEffect } from './types';

export function applyHintEffect(
  state: SolveState,
  marked: number[],
  effect: HintEffect,
): { state: SolveState; marked: number[]; note: string } {
  if (effect.action === 'mark') {
    const nextMarked = marked.slice();
    if (nextMarked.indexOf(effect.number) === -1) nextMarked.push(effect.number);
    return {
      state: {
        ...state,
        hintsUsed: effect.hintsUsed,
        hintLog: effect.hintLog,
      },
      marked: nextMarked,
      note: effect.note,
    };
  }
  if (effect.action === 'reveal') {
    const placed = setLetter(state, effect.number, effect.letter);
    const revealedNumbers = placed.revealedNumbers.slice();
    if (revealedNumbers.indexOf(effect.number) === -1) revealedNumbers.push(effect.number);
    const revealedLetters = { ...placed.revealedLetters };
    revealedLetters[effect.number] = effect.letter;
    const nextMarked: number[] = [];
    for (const number of marked) {
      if (number !== effect.number) nextMarked.push(number);
    }
    return {
      state: {
        ...placed,
        hintsUsed: effect.hintsUsed,
        hintLog: effect.hintLog,
        revealedNumbers: revealedNumbers,
        revealedLetters: revealedLetters,
      },
      marked: nextMarked,
      note: effect.note,
    };
  }
  if (effect.action === 'unveil') {
    return {
      state: {
        ...state,
        hintsUsed: effect.hintsUsed,
        hintLog: effect.hintLog,
        attributionUnveiled: true,
        attribution: effect.attribution,
      },
      marked: marked,
      note: effect.note,
    };
  }
  return {
    state: {
      ...state,
      hintsUsed: effect.hintsUsed,
      hintLog: effect.hintLog,
    },
    marked: marked,
    note: effect.note,
  };
}
