import { setLetter, type SolveState } from '../engine/solve';
import type { HintEffect } from './types';

function unionNumbers(current: number[], extra: number[]): number[] {
  const next = current.slice();
  for (const number of extra) {
    if (next.indexOf(number) === -1) next.push(number);
  }
  return next;
}

function withoutNumbers(current: number[], drop: number[]): number[] {
  const skip: { [number: number]: boolean } = {};
  for (const number of drop) skip[number] = true;
  const next: number[] = [];
  for (const number of current) {
    if (!skip[number]) next.push(number);
  }
  return next;
}

export function applyHintEffect(state: SolveState, effect: HintEffect): { state: SolveState; note: string } {
  const billed: SolveState = {
    ...state,
    hintsUsed: effect.hintsUsed,
    hintPoints: effect.hintPoints,
    hintLog: effect.hintLog,
  };
  if (effect.action === 'mark') {
    return {
      state: { ...billed, markedNumbers: unionNumbers(state.markedNumbers, effect.numbers) },
      note: effect.note,
    };
  }
  if (effect.action === 'reveal') {
    let next = billed;
    const revealedNumbers = next.revealedNumbers.slice();
    const revealedLetters = { ...next.revealedLetters };
    for (const number of effect.numbers) {
      if (!effect.letter) continue;
      next = setLetter(next, number, effect.letter);
      if (revealedNumbers.indexOf(number) === -1) revealedNumbers.push(number);
      revealedLetters[number] = effect.letter;
    }
    return {
      state: {
        ...next,
        hintsUsed: effect.hintsUsed,
        hintPoints: effect.hintPoints,
        hintLog: effect.hintLog,
        revealedNumbers: revealedNumbers,
        revealedLetters: revealedLetters,
        markedNumbers: withoutNumbers(next.markedNumbers, effect.numbers),
      },
      note: effect.note,
    };
  }
  if (effect.action === 'cross-off') {
    const crossed = state.crossedOff.slice();
    for (const letter of effect.letters) {
      if (crossed.indexOf(letter) === -1) crossed.push(letter);
    }
    return { state: { ...billed, crossedOff: crossed }, note: effect.note };
  }
  if (effect.action === 'frequency') {
    return { state: { ...billed, frequencyShown: true }, note: effect.note };
  }
  if (effect.action === 'author') {
    const previous = state.attribution;
    return {
      state: {
        ...billed,
        attributionStage: state.attributionStage < 1 ? 1 : state.attributionStage,
        attributionUnveiled: true,
        attribution: {
          author: effect.author,
          work: previous ? previous.work : '',
          year: previous ? previous.year : 0,
          sourceNote: previous ? previous.sourceNote : '',
        },
      },
      note: effect.note,
    };
  }
  if (effect.action === 'source') {
    const previous = state.attribution;
    return {
      state: {
        ...billed,
        attributionStage: 2,
        attributionUnveiled: true,
        attribution: {
          author: previous ? previous.author : '',
          work: effect.work,
          year: effect.year,
          sourceNote: '',
        },
      },
      note: effect.note,
    };
  }
  return { state: billed, note: effect.note };
}
