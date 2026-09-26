export const KEYBOARD_COLUMNS = 7;

export function keyboardRowPlan(letterCount: number, columns: number): {
  letterRows: number;
  lastRowLetters: number;
  deleteSharesLastRow: boolean;
} {
  const remainder = letterCount % columns;
  const lastRowLetters = remainder === 0 ? columns : remainder;
  return {
    letterRows: Math.ceil(letterCount / columns),
    lastRowLetters: lastRowLetters,
    deleteSharesLastRow: columns - lastRowLetters >= 1 && remainder !== 0,
  };
}

/** Pixels to scroll so the tile sits fully above the pinned keyboard. */
export function scrollDelta(
  tile: { top: number; bottom: number },
  keyboardTop: number,
  edge = 8,
): number {
  const limit = keyboardTop - edge;
  if (tile.bottom > limit) return tile.bottom - limit;
  if (tile.top < edge) return tile.top - edge;
  return 0;
}
