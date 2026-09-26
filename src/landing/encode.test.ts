import { describe, expect, it } from "vitest";
import {
  applyGuess,
  encodeQuote,
  glyphFor,
  groupIntoWords,
} from "./encode";
import { DEMO_QUOTE } from "./quote";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("encodeQuote", () => {
  it("keeps a stable substitution for the same random sequence", () => {
    const first = encodeQuote(DEMO_QUOTE, mulberry32(7));
    const second = encodeQuote(DEMO_QUOTE, mulberry32(7));
    expect(first.letterToNumber).toEqual(second.letterToNumber);
  });

  it("changes the substitution when the random sequence changes", () => {
    const codes = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        JSON.stringify(encodeQuote(DEMO_QUOTE, mulberry32(seed)).letterToNumber),
      ),
    );
    expect(codes.size).toBeGreaterThan(1);
  });

  it("assigns each letter one unique number from 1 to 26", () => {
    const encoded = encodeQuote(DEMO_QUOTE, mulberry32(3));
    const numbers = Object.values(encoded.letterToNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const number of numbers) {
      expect(Number.isInteger(number)).toBe(true);
      expect(number).toBeGreaterThanOrEqual(1);
      expect(number).toBeLessThanOrEqual(26);
    }
    for (const [letter, number] of Object.entries(encoded.letterToNumber)) {
      expect(encoded.numberToLetter[number]).toBe(letter);
    }
  });

  it("repeats a number everywhere that letter appears", () => {
    const encoded = encodeQuote("Abba!", () => 0);
    expect(encoded.letterToNumber.A).not.toBe(encoded.letterToNumber.B);
    const numbers = encoded.cells.map((cell) => (cell.kind === "letter" ? cell.number : cell.value));
    expect(numbers).toEqual([
      encoded.letterToNumber.A,
      encoded.letterToNumber.B,
      encoded.letterToNumber.B,
      encoded.letterToNumber.A,
      "!",
    ]);
  });

  it("preserves spaces and punctuation in the public-domain line", () => {
    const encoded = encodeQuote(DEMO_QUOTE, () => 0);
    const visible = encoded.cells
      .map((cell) => (cell.kind === "gap" ? " " : cell.value))
      .join("");
    expect(visible).toBe("BREVITY IS THE SOUL OF WIT.");
    expect(
      groupIntoWords(encoded.cells).map((word) => word.map((cell) => cell.value).join("")),
    ).toEqual(["BREVITY", "IS", "THE", "SOUL", "OF", "WIT."]);
  });
});

describe("applyGuess", () => {
  const puzzle = encodeQuote("Abba.", () => 0);

  it("does nothing until a number is selected", () => {
    const outcome = applyGuess(puzzle, [], null, "A");
    expect(outcome.correct).toBe(false);
    expect(outcome.solved).toEqual([]);
    expect(outcome.message).toBe("Select a number first.");
  });

  it("fills every copy of a correct letter and ignores a miss", () => {
    const numberA = puzzle.letterToNumber.A;
    const miss = applyGuess(puzzle, [], numberA, "Z");
    expect(miss.correct).toBe(false);
    expect(miss.solved).toEqual([]);
    expect(puzzle.cells.map((cell) => glyphFor(cell, miss.solved))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);

    const hit = applyGuess(puzzle, [], numberA, "a");
    expect(hit.correct).toBe(true);
    expect(hit.complete).toBe(false);
    expect(puzzle.cells.map((cell) => glyphFor(cell, hit.solved))).toEqual([
      "A",
      null,
      null,
      "A",
      null,
    ]);

    const done = applyGuess(puzzle, hit.solved, puzzle.letterToNumber.B, "B");
    expect(done.complete).toBe(true);
    expect(done.message).toBe("B is correct. The line is complete.");
    expect(puzzle.cells.map((cell) => glyphFor(cell, done.solved))).toEqual([
      "A",
      "B",
      "B",
      "A",
      null,
    ]);
  });
});
