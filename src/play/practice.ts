import { buildPuzzle, mulberry32, type Word } from '../engine/cipher';
import { scoreSolve } from '../engine/scoring';
import { isFilled, wrongLetterCount, wrongNumbers, type Mapping } from '../engine/solve';
import { SAMPLE_AUTHOR, SAMPLE_NOTE, SAMPLE_PLAIN, SAMPLE_SEED, SAMPLE_WORK, SAMPLE_YEAR } from '../data/sample';
import type { ConfirmResult, QuoteInfo, SolveOutcome } from './api';

export function sampleQuote(): QuoteInfo {
  return {
    author: SAMPLE_AUTHOR,
    work: SAMPLE_WORK,
    year: SAMPLE_YEAR,
    plainText: SAMPLE_PLAIN,
    sourceNote: SAMPLE_NOTE,
  };
}

export function samplePuzzle() {
  return buildPuzzle(SAMPLE_PLAIN, mulberry32(SAMPLE_SEED));
}

export function practiceCheck(solution: { [number: number]: string }, mapping: Mapping, hintsUsed: number) {
  return {
    wrongNumbers: wrongNumbers(mapping, solution),
    hintsUsed: hintsUsed + 1,
  };
}

export function practiceReveal(input: {
  solution: { [number: number]: string };
  mapping: Mapping;
  number: number;
  hintsUsed: number;
  revealedNumbers: number[];
}): { letter: string; hintsUsed: number } {
  const letter = input.solution[input.number];
  if (!letter) throw new Error('That number is not in this puzzle');
  const already = input.revealedNumbers.indexOf(input.number) !== -1 || input.mapping[input.number] === letter;
  return {
    letter: letter,
    hintsUsed: already ? input.hintsUsed : input.hintsUsed + 1,
  };
}

export function practiceFrequency(hintsUsed: number, alreadyShown: boolean): { hintsUsed: number } {
  return { hintsUsed: alreadyShown ? hintsUsed : hintsUsed + 1 };
}

export function practiceConfirm(input: {
  words: Word[];
  solution: { [number: number]: string };
  mapping: Mapping;
  elapsedMs: number;
  hintsUsed: number;
  uniqueLetterCount: number;
  longestWord: number;
  letterCount: number;
  dateLabel: string;
}): ConfirmResult {
  const wrongCount = wrongLetterCount(input.words, input.mapping, input.solution);
  if (!isFilled(input.words, input.mapping) || wrongCount > 0) {
    return { solved: false, wrongCount: wrongCount };
  }
  const scored = scoreSolve({
    hintsUsed: input.hintsUsed,
    gaveUp: false,
    elapsedMs: input.elapsedMs,
    uniqueLetterCount: input.uniqueLetterCount,
    longestWord: input.longestWord,
    preReveals: 0,
  });
  const outcome: SolveOutcome = {
    solved: true,
    gaveUp: false,
    stars: scored.stars,
    points: scored.points,
    hintsUsed: input.hintsUsed,
    elapsedMs: input.elapsedMs,
    quote: sampleQuote(),
    dateLabel: input.dateLabel,
    letterCount: input.letterCount,
  };
  return { solved: true, outcome: outcome };
}

export function practiceGiveUp(input: {
  elapsedMs: number;
  hintsUsed: number;
  letterCount: number;
  dateLabel: string;
}): SolveOutcome {
  return {
    solved: false,
    gaveUp: true,
    stars: 0,
    points: 0,
    hintsUsed: input.hintsUsed,
    elapsedMs: input.elapsedMs,
    quote: sampleQuote(),
    dateLabel: input.dateLabel,
    letterCount: input.letterCount,
  };
}
