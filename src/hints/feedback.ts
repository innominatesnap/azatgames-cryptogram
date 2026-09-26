import type { ConfirmResult, SolveOutcome } from '../play/api';

/**
 * Filling the board can finish the puzzle.
 * It never produces a right or wrong message, count, or mark.
 */
export function presentFillCheck(result: ConfirmResult): { outcome: SolveOutcome | null; message: null } {
  if (result.solved) return { outcome: result.outcome, message: null };
  return { outcome: null, message: null };
}

export function tileCues(input: { markedWrong: boolean; revealed: boolean; sameNumber: boolean }): string {
  const parts = ['tile'];
  if (input.sameNumber) parts.push('tile-same');
  if (input.revealed) parts.push('tile-revealed');
  else if (input.markedWrong) parts.push('tile-mistake');
  return parts.join(' ');
}

export function marksAfterEdit(marked: number[], number: number, before: string | undefined, after: string | undefined): number[] {
  if (before === after) return marked;
  const next: number[] = [];
  for (const item of marked) {
    if (item !== number) next.push(item);
  }
  return next;
}
