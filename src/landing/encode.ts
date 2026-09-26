export type Cell =
  | { kind: "letter"; value: string; number: number }
  | { kind: "gap"; value: string }
  | { kind: "mark"; value: string };

export interface EncodedQuote {
  cells: Cell[];
  letterToNumber: Record<string, number>;
  numberToLetter: Record<number, string>;
}

export interface GuessOutcome {
  solved: number[];
  selected: number | null;
  correct: boolean;
  complete: boolean;
  message: string;
}

function shuffleNumbers(rng: () => number): number[] {
  const numbers = Array.from({ length: 26 }, (_, index) => index + 1);
  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.floor(rng() * (index + 1)));
    const current = numbers[index];
    numbers[index] = numbers[swapIndex];
    numbers[swapIndex] = current;
  }
  return numbers;
}

export function encodeQuote(
  text: string,
  rng: () => number = Math.random,
): EncodedQuote {
  const unique = [
    ...new Set(
      [...text.toUpperCase()].filter((character) => character >= "A" && character <= "Z"),
    ),
  ].sort();

  if (unique.length > 26) {
    throw new Error("A quote can use at most 26 letters.");
  }

  const pool = shuffleNumbers(rng);
  const letterToNumber: Record<string, number> = {};
  const numberToLetter: Record<number, string> = {};
  unique.forEach((letter, index) => {
    const number = pool[index];
    letterToNumber[letter] = number;
    numberToLetter[number] = letter;
  });

  const cells: Cell[] = [];
  for (const character of text) {
    const upper = character.toUpperCase();
    if (upper >= "A" && upper <= "Z") {
      cells.push({ kind: "letter", value: upper, number: letterToNumber[upper] });
      continue;
    }
    if (/\s/.test(character)) {
      cells.push({ kind: "gap", value: character });
      continue;
    }
    cells.push({ kind: "mark", value: character });
  }

  return { cells, letterToNumber, numberToLetter };
}

export function groupIntoWords(cells: readonly Cell[]): Cell[][] {
  const words: Cell[][] = [];
  let current: Cell[] = [];
  for (const cell of cells) {
    if (cell.kind === "gap") {
      if (current.length > 0) {
        words.push(current);
        current = [];
      }
      continue;
    }
    current.push(cell);
  }
  if (current.length > 0) words.push(current);
  return words;
}

export function glyphFor(cell: Cell, solved: readonly number[]): string | null {
  if (cell.kind !== "letter") return null;
  return solved.includes(cell.number) ? cell.value : null;
}

export function applyGuess(
  encoded: EncodedQuote,
  solved: readonly number[],
  selected: number | null,
  letter: string,
): GuessOutcome {
  const total = Object.keys(encoded.letterToNumber).length;
  const kept = [...solved];

  if (selected === null) {
    return {
      solved: kept,
      selected: null,
      correct: false,
      complete: kept.length === total && total > 0,
      message: "Select a number first.",
    };
  }

  if (kept.includes(selected)) {
    return {
      solved: kept,
      selected: null,
      correct: false,
      complete: kept.length === total && total > 0,
      message: "That number is already filled.",
    };
  }

  const guess = letter.trim().toUpperCase();
  if (!/^[A-Z]$/.test(guess)) {
    return {
      solved: kept,
      selected,
      correct: false,
      complete: false,
      message: "Choose a letter.",
    };
  }

  if (encoded.numberToLetter[selected] !== guess) {
    return {
      solved: kept,
      selected,
      correct: false,
      complete: false,
      message: `${guess} does not match that number.`,
    };
  }

  const next = [...kept, selected];
  const complete = next.length === total;
  return {
    solved: next,
    selected: null,
    correct: true,
    complete,
    message: complete
      ? `${guess} is correct. The line is complete.`
      : `${guess} is correct.`,
  };
}
