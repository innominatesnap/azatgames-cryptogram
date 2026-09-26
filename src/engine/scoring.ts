/*
 * Star thresholds live in src/hints/config.ts (STAR_RULES) and are mirrored
 * by cryptogram.scoring_rules plus cryptogram.stars_for.
 * Hint points, not a hint count, decide stars:
 * 3 = 0 hint points and inside par
 * 2 = 0 hint points over par, or 1–2 hint points
 * 1 = 3 or more hint points
 * 0 = gave up
 * Points scored are still stars times difficulty.
 */

import { STAR_RULES } from '../hints/config';

export const PAR_SECONDS_PER_UNIQUE_LETTER = 20;
export const PRE_REVEAL_PENALTY = 2;

export function parTimeMs(uniqueLetterCount: number): number {
  const unique = uniqueLetterCount < 1 ? 1 : uniqueLetterCount;
  return unique * PAR_SECONDS_PER_UNIQUE_LETTER * 1000;
}

export function starsForSolve(input: {
  hintPoints: number;
  gaveUp: boolean;
  elapsedMs: number;
  uniqueLetterCount: number;
}): number {
  if (input.gaveUp) return 0;
  const points = input.hintPoints < 0 ? 0 : input.hintPoints;
  if (points <= STAR_RULES.threeStarMaxPoints && input.elapsedMs <= parTimeMs(input.uniqueLetterCount)) return 3;
  if (points <= STAR_RULES.twoStarMaxPoints) return 2;
  return 1;
}

export function difficultyFactor(input: {
  uniqueLetterCount: number;
  longestWord: number;
  preReveals: number;
}): number {
  const raw =
    input.uniqueLetterCount + input.longestWord - input.preReveals * PRE_REVEAL_PENALTY;
  return raw < 1 ? 1 : raw;
}

export function pointsForSolve(stars: number, difficulty: number): number {
  return stars * difficulty;
}

export function scoreSolve(input: {
  hintPoints: number;
  gaveUp: boolean;
  elapsedMs: number;
  uniqueLetterCount: number;
  longestWord: number;
  preReveals: number;
}): { stars: number; points: number; parMs: number } {
  const stars = starsForSolve(input);
  const difficulty = difficultyFactor(input);
  return {
    stars: stars,
    points: pointsForSolve(stars, difficulty),
    parMs: parTimeMs(input.uniqueLetterCount),
  };
}

/*
 * Later friend-message rule: the sender earns the solver's hint points.
 * A clean solve (0 hint points) pays no stumper bonus. Friend allowances
 * from H9 are not built. The database still has to require an accepted
 * friendship older than 24 hours before awarding this.
 */
export function stumperBonus(solverHintPoints: number): number {
  if (solverHintPoints <= 0) return 0;
  return solverHintPoints;
}

export type BoardRow = {
  points: number;
  hintPoints: number;
  elapsedMs: number;
};

/** Higher score, then fewer hint points, then a faster time. */
export function compareBoardRows(left: BoardRow, right: BoardRow): number {
  if (left.points !== right.points) return right.points - left.points;
  if (left.hintPoints !== right.hintPoints) return left.hintPoints - right.hintPoints;
  return left.elapsedMs - right.elapsedMs;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const padded = seconds < 10 ? '0' + String(seconds) : String(seconds);
  return String(minutes) + ':' + padded;
}
