import { useEffect, useRef, useState } from 'react';
import type { Word } from '../engine/cipher';
import { codeNumberCounts } from '../engine/frequency';
import { firstEmptyTileIndex, nextEmptyTileIndex, wordIsFull, wordLabel } from '../engine/editor';
import { formatDuration, parTimeMs } from '../engine/scoring';
import {
  isFilled,
  isLetterInUseElsewhere,
  numbersInWord,
  setLetter,
  stableMapping,
  undo,
  redo,
  unsetNumber,
  unsetNumbers,
  withHints,
  type SolveState,
} from '../engine/solve';
import type { SolveOutcome } from '../play/api';
import type { PuzzleBundle } from '../play/bundle';
import { BigCard, ModeBanner, Shell } from './chrome';
import { FrequencyBars } from './FrequencyBars';

const KEY_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'];

function offText(count: number): string {
  if (count === 1) return 'Not quite: 1 letter is off.';
  return 'Not quite: ' + String(count) + ' letters are off.';
}

export function SolveScreen(props: {
  bundle: PuzzleBundle;
  notice: string | null;
  onPersist: (state: SolveState, finished: SolveOutcome | null) => void;
  onDone: (outcome: SolveOutcome) => void;
  onHome: () => void;
}) {
  const { bundle } = props;
  const [session, setSession] = useState<SolveState>(bundle.initial);
  const [editor, setEditor] = useState<{ wordIndex: number; tileIndex: number } | null>(null);
  const [revealArmed, setRevealArmed] = useState(false);
  const [givingUp, setGivingUp] = useState(false);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [flagged, setFlagged] = useState<number[]>([]);
  const [wrongCount, setWrongCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onDoneRef = useRef(props.onDone);
  onDoneRef.current = props.onDone;
  const onPersistRef = useRef(props.onPersist);
  onPersistRef.current = props.onPersist;
  const closing = useRef(false);
  const checked = useRef('');

  useEffect(() => {
    const origin = Date.now();
    const base = sessionRef.current.elapsedMs;
    const id = window.setInterval(() => {
      if (closing.current) return;
      const next = base + (Date.now() - origin);
      setSession((current) => ({ ...current, elapsedMs: next }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [bundle.key]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!closing.current) onPersistRef.current(sessionRef.current, null);
    }, 5000);
    return () => {
      window.clearInterval(id);
      if (!closing.current) onPersistRef.current(sessionRef.current, null);
    };
  }, [bundle.key]);

  useEffect(() => {
    if (!flagged.length) return;
    const id = window.setTimeout(() => setFlagged([]), 3000);
    return () => window.clearTimeout(id);
  }, [flagged]);

  useEffect(() => {
    if (closing.current) return;
    if (!isFilled(bundle.words, session.present)) {
      setWrongCount(null);
      return;
    }
    const key = stableMapping(session.present);
    if (checked.current === key) return;
    checked.current = key;
    let cancelled = false;
    void bundle.api.confirm(session.present, sessionRef.current.elapsedMs, session.hintsUsed).then(
      (result) => {
        if (cancelled || closing.current) return;
        if (result.solved) {
          finish(result.outcome);
          return;
        }
        setWrongCount(result.wrongCount);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not check the puzzle');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bundle, session.present, session.hintsUsed]);

  function finish(outcome: SolveOutcome) {
    closing.current = true;
    onPersistRef.current(sessionRef.current, outcome);
    onDoneRef.current(outcome);
  }

  function openWord(wordIndex: number, tileIndex: number) {
    if (revealArmed) {
      const tile = bundle.words[wordIndex].tiles[tileIndex];
      if (tile && tile.kind === 'letter') void revealNumber(tile.number);
      return;
    }
    setEditor({ wordIndex: wordIndex, tileIndex: tileIndex });
    setGivingUp(false);
  }

  async function revealNumber(number: number) {
    setError(null);
    try {
      const current = sessionRef.current;
      const outcome = await bundle.api.reveal(number, current.present, current.hintsUsed, current.revealedNumbers);
      setSession((latest) => withHints(setLetter(latest, number, outcome.letter), outcome.hintsUsed, { revealedNumber: number }));
      setRevealArmed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not reveal a letter');
    }
  }

  function place(letter: string) {
    if (!editor) return;
    const word = bundle.words[editor.wordIndex];
    const tile = word.tiles[editor.tileIndex];
    if (!tile || tile.kind !== 'letter') return;
    const next = setLetter(sessionRef.current, tile.number, letter);
    setSession(next);
    if (wordIsFull(word, next.present)) {
      setEditor(null);
      return;
    }
    const forward = nextEmptyTileIndex(word, next.present, editor.tileIndex);
    if (forward !== null) {
      setEditor({ wordIndex: editor.wordIndex, tileIndex: forward });
      return;
    }
    const first = firstEmptyTileIndex(word, next.present);
    if (first !== null) setEditor({ wordIndex: editor.wordIndex, tileIndex: first });
  }

  useEffect(() => {
    if (!editor) return;
    const wordIndex = editor.wordIndex;
    const tileIndex = editor.tileIndex;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        setEditor(null);
        return;
      }
      if (event.key === 'Backspace') {
        const word = bundle.words[wordIndex];
        const tile = word.tiles[tileIndex];
        if (tile && tile.kind === 'letter') setSession((current) => unsetNumber(current, tile.number));
        return;
      }
      if (event.key.length === 1) {
        const letter = event.key.toUpperCase();
        if (letter >= 'A' && letter <= 'Z') place(letter);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selected = editor ? letterNumber(bundle.words, editor.wordIndex, editor.tileIndex) : null;
  const source = bundle.mode === 'live' ? 'Daily Quote' : 'Daily Quote sample';

  return (
    <Shell>
      <div className="topbar">
        <div>
          <div className="eyebrow">{source}</div>
          <div className="timer">{formatDuration(session.elapsedMs)}</div>
          <div className="fine">Par {formatDuration(parTimeMs(bundle.uniqueLetterCount))}</div>
        </div>
        <div className="pair">
          <button type="button" className="icon-button" disabled={!session.past.length} onClick={() => setSession((current) => undo(current))}>Undo</button>
          <button type="button" className="icon-button" disabled={!session.future.length} onClick={() => setSession((current) => redo(current))}>Redo</button>
        </div>
      </div>
      <ModeBanner notice={props.notice} />
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {wrongCount !== null ? <p className="alert" role="alert">{offText(wrongCount)}</p> : null}
      {revealArmed ? <p className="banner">Tap a tile to reveal that letter. This uses one hint.</p> : null}
      <div className="board">
        {bundle.words.map((word, wordIndex) => (
          <div className="word" key={'w' + String(wordIndex)}>
            {word.tiles.map((tile, tileIndex) => {
              if (tile.kind === 'mark') {
                return <span className="tile-mark" key={'m' + String(tileIndex)}>{tile.char}</span>;
              }
              const guess = session.present[tile.number] || '';
              const same = selected !== null && tile.number === selected;
              const off = flagged.indexOf(tile.number) !== -1;
              const className = 'tile' + (same ? ' tile-same' : '') + (off ? ' tile-off' : '');
              return (
                <button
                  type="button"
                  key={'t' + String(tileIndex)}
                  className={className}
                  aria-invalid={off || undefined}
                  aria-label={'Number ' + String(tile.number) + (guess ? ', ' + guess : ', empty') + (off ? ', marked off' : '')}
                  onClick={() => openWord(wordIndex, tileIndex)}
                >
                  <span className="tile-glyph">{guess || '\u00a0'}</span>
                  <span className="tile-code">{tile.number}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="stack">
        <p className="fine">No hints inside par time: 3 stars. One hint, or over par: 2. Two or more hints: 1. Showing the answer: 0.</p>
        <BigCard
          title="Check my letters"
          detail="1 hint. Wrong letters are marked for 3 seconds."
          onClick={() => {
            void bundle.api.check(sessionRef.current.present, sessionRef.current.hintsUsed).then(
              (outcome) => {
                setSession((current) => withHints(current, outcome.hintsUsed));
                setFlagged(outcome.wrongNumbers.slice());
              },
              (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not check'),
            );
          }}
        />
        <BigCard
          title="Reveal a letter"
          detail="1 hint. Then tap the tile you want filled."
          pressed={revealArmed}
          onClick={() => {
            setEditor(null);
            setRevealArmed((armed) => !armed);
          }}
        />
        <BigCard
          title="Letter frequency"
          detail="1 hint the first time you open it."
          pressed={frequencyOpen}
          onClick={() => {
            if (sessionRef.current.frequencyShown) {
              setFrequencyOpen((open) => !open);
              return;
            }
            void bundle.api.useFrequency(sessionRef.current.hintsUsed, false).then(
              (outcome) => {
                setSession((current) => withHints(current, outcome.hintsUsed, { frequencyShown: true }));
                setFrequencyOpen(true);
              },
              (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not use that hint'),
            );
          }}
        />
        {frequencyOpen ? <FrequencyBars counts={codeNumberCounts(bundle.words)} /> : null}
        <BigCard title="Give up" detail="Ask before the answer is shown." onClick={() => { setEditor(null); setGivingUp(true); }} />
        <BigCard title="Back to Today" onClick={props.onHome} />
      </div>
      {editor ? (
        <WordSheet
          words={bundle.words}
          wordIndex={editor.wordIndex}
          tileIndex={editor.tileIndex}
          session={session}
          onPick={place}
          onSelect={(tileIndex) => setEditor({ wordIndex: editor.wordIndex, tileIndex: tileIndex })}
          onClear={() => {
            const word = bundle.words[editor.wordIndex];
            setSession((current) => unsetNumbers(current, numbersInWord(word)));
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {givingUp ? (
        <div className="sheet-scrim">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="give-up-title">
            <h2 id="give-up-title" className="screen-title">Give up?</h2>
            <div className="stack">
              <BigCard tone="gold" title="Keep trying" onClick={() => setGivingUp(false)} />
              <BigCard
                title="Show the answer (0 stars)"
                onClick={() => {
                  void bundle.api.giveUp(sessionRef.current.elapsedMs, sessionRef.current.hintsUsed).then(
                    (outcome) => {
                      setSession((current) => ({ ...current, gaveUp: true }));
                      finish(outcome);
                    },
                    (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not show the answer'),
                  );
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

function letterNumber(words: Word[], wordIndex: number, tileIndex: number): number | null {
  const tile = words[wordIndex] && words[wordIndex].tiles[tileIndex];
  if (!tile || tile.kind !== 'letter') return null;
  return tile.number;
}

function WordSheet(props: {
  words: Word[];
  wordIndex: number;
  tileIndex: number;
  session: SolveState;
  onPick: (letter: string) => void;
  onSelect: (tileIndex: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const word = props.words[props.wordIndex];
  const selected = letterNumber(props.words, props.wordIndex, props.tileIndex);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="sheet-scrim" onClick={props.onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="editor-context">{props.wordIndex > 0 ? wordLabel(props.words[props.wordIndex - 1], props.session.present) : ''}</div>
        <h2 id="editor-title" className="screen-title" style={{ textAlign: 'center' }}>Word editor</h2>
        <div className="editor-word">
          {word.tiles.map((tile, tileIndex) => {
            if (tile.kind === 'mark') return <span className="tile-mark" key={'em' + String(tileIndex)}>{tile.char}</span>;
            const guess = props.session.present[tile.number] || '';
            const current = tileIndex === props.tileIndex;
            return (
              <button
                type="button"
                key={'et' + String(tileIndex)}
                className={'tile editor-tile' + (current ? ' tile-current' : '')}
                onClick={() => props.onSelect(tileIndex)}
              >
                <span className="tile-glyph">{guess || '\u00a0'}</span>
                <span className="tile-code">{tile.number}</span>
              </button>
            );
          })}
        </div>
        <div className="editor-context">
          {props.wordIndex + 1 < props.words.length ? wordLabel(props.words[props.wordIndex + 1], props.session.present) : ''}
        </div>
        <div>
          {KEY_ROWS.map((row) => (
            <div className="key-row" key={row}>
              {row.split('').map((letter) => {
                const used = isLetterInUseElsewhere(props.session.present, letter, selected);
                const current = selected !== null && props.session.present[selected] === letter;
                const className = 'key' + (used ? ' key-used' : '') + (current ? ' key-current' : '');
                return (
                  <button
                    type="button"
                    key={letter}
                    className={className}
                    aria-label={letter + (used ? ', in use, still available' : '')}
                    onClick={() => props.onPick(letter)}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pair">
          <BigCard title="Clear word" onClick={props.onClear} />
          <button type="button" className="big-card tone-gold" onClick={props.onClose} ref={closeRef}>
            <span className="big-card-title">Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
