import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  applyGuess,
  encodeQuote,
  glyphFor,
  type Cell,
} from "./encode";
import { DEMO_AUTHOR, DEMO_QUOTE, DEMO_SOURCE } from "./quote";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type LetterSpot = {
  kind: "letter";
  value: string;
  number: number;
  position: number;
  key: string;
};

type MarkSpot = { kind: "mark"; value: string; key: string };

type Spot = LetterSpot | MarkSpot;

function layoutWords(cells: readonly Cell[]): Spot[][] {
  const words: Spot[][] = [];
  let current: Spot[] = [];
  let position = 0;
  cells.forEach((cell, index) => {
    if (cell.kind === "gap") {
      if (current.length > 0) {
        words.push(current);
        current = [];
      }
      return;
    }
    if (cell.kind === "mark") {
      current.push({ kind: "mark", value: cell.value, key: `mark-${index}` });
      return;
    }
    current.push({
      kind: "letter",
      value: cell.value,
      number: cell.number,
      position,
      key: `letter-${index}`,
    });
    position += 1;
  });
  if (current.length > 0) words.push(current);
  return words;
}

function countColumns(container: HTMLElement | null): number {
  if (!container) return 1;
  const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
  if (buttons.length === 0) return 1;
  const top = buttons[0].getBoundingClientRect().top;
  let count = 0;
  for (const button of buttons) {
    if (Math.abs(button.getBoundingClientRect().top - top) > 2) break;
    count += 1;
  }
  return Math.max(1, count);
}

export function Demo() {
  const [puzzle] = useState(() => encodeQuote(DEMO_QUOTE));
  const [solved, setSolved] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [cellCursor, setCellCursor] = useState(0);
  const [letterCursor, setLetterCursor] = useState(0);
  const puzzleRef = useRef<HTMLDivElement>(null);
  const letterGridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const letterRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resetRef = useRef<HTMLButtonElement>(null);

  const words = layoutWords(puzzle.cells);
  const letterCount = puzzle.cells.filter((cell) => cell.kind === "letter").length;
  const total = Object.keys(puzzle.letterToNumber).length;
  const complete = total > 0 && solved.length === total;

  useEffect(() => {
    const node = document.getElementById("demo");
    if (!node) return;
    node.removeAttribute("aria-busy");
    node.classList.toggle("is-complete", complete);
  }, [complete]);

  function letterIsPlaced(letter: string): boolean {
    const number = puzzle.letterToNumber[letter];
    return number !== undefined && solved.includes(number);
  }

  const activeLetterCursor = letterIsPlaced(LETTERS[letterCursor] ?? "")
    ? Math.max(0, LETTERS.findIndex((letter) => !letterIsPlaced(letter)))
    : letterCursor;

  function selectNumber(number: number) {
    if (solved.includes(number)) {
      setStatus(`Number ${number} is already filled.`);
      return;
    }
    const next = selected === number ? null : number;
    setSelected(next);
    setStatus(
      next === null ? "Number cleared." : `Number ${next} selected. Choose a letter.`,
    );
  }

  function chooseLetter(letter: string) {
    if (letterIsPlaced(letter)) return;
    const result = applyGuess(puzzle, solved, selected, letter);
    setSolved(result.solved);
    setSelected(result.selected);
    setStatus(result.message);
    if (!result.correct) return;
    if (result.complete) {
      resetRef.current?.focus();
      return;
    }
    const nextSpot = words
      .flat()
      .find(
        (spot): spot is LetterSpot =>
          spot.kind === "letter" && !result.solved.includes(spot.number),
      );
    if (nextSpot) {
      setCellCursor(nextSpot.position);
      cellRefs.current[nextSpot.position]?.focus();
    }
  }

  function reset() {
    setSolved([]);
    setSelected(null);
    setStatus("Puzzle reset.");
    setCellCursor(0);
    setLetterCursor(0);
  }

  function moveFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    cursor: number,
    count: number,
    columns: number,
    setCursor: (next: number) => void,
    refs: Array<HTMLButtonElement | null>,
    blocked?: (index: number) => boolean,
  ) {
    const key = event.key;
    if (
      key !== "ArrowRight" &&
      key !== "ArrowLeft" &&
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    if (count === 0) return;

    const delta = key === "ArrowLeft" || key === "ArrowUp" || key === "Home" ? -1 : 1;
    let next = cursor;
    if (key === "Home") next = 0;
    else if (key === "End") next = count - 1;
    else if (key === "ArrowRight") next = (cursor + 1) % count;
    else if (key === "ArrowLeft") next = (cursor - 1 + count) % count;
    else if (key === "ArrowDown") next = Math.min(count - 1, cursor + columns);
    else next = Math.max(0, cursor - columns);

    if (blocked) {
      const wraps = key === "ArrowLeft" || key === "ArrowRight";
      for (let step = 0; step < count; step += 1) {
        if (!blocked(next)) break;
        if (key === "ArrowUp" || key === "ArrowDown") {
          const candidate = next + delta * columns;
          if (candidate < 0 || candidate >= count) return;
          next = candidate;
          continue;
        }
        if (!wraps) return;
        next = (next + delta + count) % count;
      }
      if (blocked(next)) return;
    }

    setCursor(next);
    refs[next]?.focus();
  }

  return (
    <div className="demo-inner">
      <p className="kicker">A public-domain line</p>
      <div
        className="puzzle"
        ref={puzzleRef}
        role="group"
        aria-label="Coded line"
        aria-describedby="specimen-help"
      >
        {words.map((word, wordIndex) => (
          <div className="word" key={wordIndex}>
            {word.map((spot) =>
              spot.kind === "mark" ? (
                <span className="mark" key={spot.key}>
                  {spot.value}
                </span>
              ) : (
                <CipherCell
                  key={spot.key}
                  spot={spot}
                  solved={solved}
                  selected={selected}
                  cursor={cellCursor}
                  assignRef={(node) => {
                    cellRefs.current[spot.position] = node;
                  }}
                  onSelect={() => {
                    setCellCursor(spot.position);
                    selectNumber(spot.number);
                  }}
                  onKeyDown={(event) => {
                    moveFocus(
                      event,
                      spot.position,
                      letterCount,
                      countColumns(puzzleRef.current),
                      setCellCursor,
                      cellRefs.current,
                    );
                  }}
                />
              ),
            )}
          </div>
        ))}
      </div>
      <p className="progress">
        {solved.length} of {total} letters placed
      </p>
      <p className="byline">
        <span className="sr-only">Author and source. </span>
        {DEMO_AUTHOR}, {DEMO_SOURCE}
      </p>
      <p className="status" role="status">
        {status}
      </p>
      <div
        className={selected === null ? "letters" : "letters is-armed"}
        role="group"
        aria-label="Letter cards"
        ref={letterGridRef}
      >
        {LETTERS.map((letter, index) => {
          const placed = letterIsPlaced(letter);
          return (
            <button
              key={letter}
              type="button"
              className="letter"
              disabled={placed}
              tabIndex={index === activeLetterCursor && !placed ? 0 : -1}
              aria-label={placed ? `Letter ${letter}, placed` : `Letter ${letter}`}
              ref={(node) => {
                letterRefs.current[index] = node;
              }}
              onClick={() => {
                setLetterCursor(index);
                chooseLetter(letter);
              }}
              onKeyDown={(event) => {
                moveFocus(
                  event,
                  index,
                  LETTERS.length,
                  countColumns(letterGridRef.current),
                  setLetterCursor,
                  letterRefs.current,
                  (candidate) => letterIsPlaced(LETTERS[candidate] ?? ""),
                );
              }}
            >
              {letter}
            </button>
          );
        })}
      </div>
      <button ref={resetRef} type="button" className="reset" onClick={reset}>
        Reset
      </button>
      <p className="local-note">This sample stays on your device. Nothing is submitted.</p>
    </div>
  );
}

function CipherCell({
  spot,
  solved,
  selected,
  cursor,
  onSelect,
  onKeyDown,
  assignRef,
}: {
  spot: LetterSpot;
  solved: readonly number[];
  selected: number | null;
  cursor: number;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  assignRef: (node: HTMLButtonElement | null) => void;
}) {
  const glyph = glyphFor(
    { kind: "letter", value: spot.value, number: spot.number },
    solved,
  );

  return (
    <button
      type="button"
      className={glyph ? "cell is-solved" : "cell"}
      aria-pressed={selected === spot.number}
      aria-label={
        glyph ? `Number ${spot.number}, letter ${glyph}` : `Number ${spot.number}, empty`
      }
      tabIndex={spot.position === cursor ? 0 : -1}
      ref={assignRef}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className="num">{spot.number}</span>
      <span className="glyph" aria-hidden="true">
        {glyph ?? <span className="blank" />}
      </span>
    </button>
  );
}
