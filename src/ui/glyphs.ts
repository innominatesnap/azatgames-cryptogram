/** Centered placeholder in an unfilled letter slot. Distinct from punctuation marks. */
export const EMPTY_SLOT_DASH = "\u2013";

export function letterSlotFace(guess: string): string {
  if (guess.length > 0) return guess;
  return EMPTY_SLOT_DASH;
}
