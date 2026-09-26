/*
 * Star and point rules from the design brief, section 2.4.
 * These constants match cryptogram.stars_for and cryptogram.points_for
 * in the database migration. Change them together.
 *
 * Worked example: 0 hints, 10 unique letters, 10000 ms -> 3 stars
 * (par is 200000 ms). The same solve at 200001 ms is 2 stars.
 * One hint is 2 stars at any time. Two or more hints is 1 star.
 * Giving up (reveal all) is 0 stars.
 */

export const PAR_SECONDS_PER_UNIQUE_LETTER = 20;
export const PRE_REVEAL_PENALTY = 2;

export function parTimeMs(uniqueLetterCount: number): number {
  const unique = uniqueLetterCount < 1 ? 1 : uniqueLetterCount;
  return unique * PAR_SECONDS_PER_UNIQUE_LETTER * 1000;
}

export function starsForSolve(input: {
  hintsUsed: number;
  gaveUp: boolean;
  elapsedMs: number;
  uniqueLetterCount: number;
}): number {
  if (input.gaveUp) return 0;
  if (input.hintsUsed >= 2) return 1;
  if (input.hintsUsed === 1 || input.elapsedMs > parTimeMs(input.uniqueLetterCount)) return 2;
  return 3;
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
  hintsUsed: number;
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
 * Later friend-message rule: the sender earns one point per hint the solver
 * needed. A clean solve pays no stumper bonus. The database still has to
 * require an accepted friendship older than 24 hours before awarding it.
 */
export function stumperBonus(solverHints: number): number {
  if (solverHints <= 0) return 0;
  return solverHints;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const padded = seconds < 10 ? '0' + String(seconds) : String(seconds);
  return String(minutes) + ':' + padded;
}
