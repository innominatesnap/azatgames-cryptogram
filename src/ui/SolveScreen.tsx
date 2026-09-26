import { useEffect, useRef, useState } from 'react';
import type { Word } from '../engine/cipher';
import { firstEmptyTileIndex, nextEmptyTileIndex, wordIsFull, wordLabel } from '../engine/editor';
import { formatDuration, parTimeMs } from '../engine/scoring';
import {
  isFilled,
  isLetterInUseElsewhere,
  stableMapping,
  numbersInWord,
  setLetter,
  undo,
  redo,
  unsetNumber,
  unsetNumbers,
  type SolveState,
} from '../engine/solve';
import { applyHintEffect } from '../hints/apply';
import { marksAfterEdit, presentFillCheck, tileCues } from '../hints/feedback';
import { HINT_CATALOG } from '../hints/registry';
import { cipherNumbersInWords } from '../hints/select';
import type { HintBoardState, HintType } from '../hints/types';
import type { SolveOutcome } from '../play/api';
import type { PuzzleBundle } from '../play/bundle';
import { AttributionLine } from './AttributionLine';
import { BigCard, ModeBanner, Shell } from './chrome';
import { HintPanel } from './HintPanel';

const KEY_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'];

function boardState(session: SolveState, words: Word[]): HintBoardState {
  return {
    mapping: session.present,
    revealedNumbers: session.revealedNumbers,
    attributionUnveiled: session.attributionUnveiled,
    cipherNumbers: cipherNumbersInWords(words),
    hintLog: session.hintLog,
    hintsUsed: session.hintsUsed,
  };
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
  const [givingUp, setGivingUp] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [markedWrong, setMarkedWrong] = useState<number[]>([]);
  const [hintNote, setHintNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const markedRef = useRef(markedWrong);
  markedRef.current = markedWrong;
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
    if (closing.current) return;
    if (!isFilled(bundle.words, session.present)) return;
    const key = stableMapping(session.present);
    if (checked.current === key) return;
    checked.current = key;
    let cancelled = false;
    const current = sessionRef.current;
    void bundle.api.confirm(session.present, current.elapsedMs, current.hintsUsed, current.hintLog).then(
      (result) => {
        if (cancelled || closing.current) return;
        const shown = presentFillCheck(result);
        if (shown.outcome) finish(shown.outcome);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not check the puzzle');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bundle, session.present]);

  function stepHistory(direction: 'undo' | 'redo') {
    const current = sessionRef.current;
    const next = direction === 'undo' ? undo(current) : redo(current);
    setMarkedWrong((marks) => {
      let updated = marks;
      for (const number of marks) {
        updated = marksAfterEdit(updated, number, current.present[number], next.present[number]);
      }
      return updated;
    });
    setSession(next);
  }

  function finish(outcome: SolveOutcome) {
    closing.current = true;
    onPersistRef.current(sessionRef.current, outcome);
    onDoneRef.current(outcome);
  }

  function openWord(wordIndex: number, tileIndex: number) {
    setEditor({ wordIndex: wordIndex, tileIndex: tileIndex });
    setGivingUp(false);
  }

  async function runHint(hint: HintType) {
    setError(null);
    const current = sessionRef.current;
    try {
      const effect = await hint.apply(boardState(current, bundle.words), {
        request(id, state) {
          return bundle.api.requestHint(id, state);
        },
      });
      const applied = applyHintEffect(current, markedRef.current, effect);
      setSession(applied.state);
      setMarkedWrong(applied.marked);
      setHintNote(applied.note);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not use that hint');
    }
  }

  function place(letter: string) {
    if (!editor) return;
    const word = bundle.words[editor.wordIndex];
    const tile = word.tiles[editor.tileIndex];
    if (!tile || tile.kind !== 'letter') return;
    if (sessionRef.current.revealedLetters[tile.number]) {
      setHintNote('Revealed letters stay locked.');
      return;
    }
    const before = sessionRef.current.present[tile.number];
    const next = setLetter(sessionRef.current, tile.number, letter);
    setSession(next);
    setMarkedWrong((current) => marksAfterEdit(current, tile.number, before, next.present[tile.number]));
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
        if (!tile || tile.kind !== 'letter') return;
        if (sessionRef.current.revealedLetters[tile.number]) {
          setHintNote('Revealed letters stay locked.');
          return;
        }
        const before = sessionRef.current.present[tile.number];
        setSession((current) => {
          const next = unsetNumber(current, tile.number);
          setMarkedWrong((marks) => marksAfterEdit(marks, tile.number, before, next.present[tile.number]));
          return next;
        });
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
  const unveiled = session.attributionUnveiled && session.attribution !== null;
  const author = unveiled && session.attribution ? session.attribution.author : (bundle.blurredAttribution ? bundle.blurredAttribution.author : null);
  const attributionSource = unveiled && session.attribution ? session.attribution.work : (bundle.blurredAttribution ? bundle.blurredAttribution.source : null);

  return (
    <Shell>
      <div className="topbar">
        <div>
          <div className="eyebrow">{source}</div>
          <div className="timer">{formatDuration(session.elapsedMs)}</div>
          <div className="fine">Par {formatDuration(parTimeMs(bundle.uniqueLetterCount))}</div>
        </div>
        <div className="pair">
          <button type="button" className="icon-button" disabled={!session.past.length} onClick={() => stepHistory('undo')}>Undo</button>
          <button type="button" className="icon-button" disabled={!session.future.length} onClick={() => stepHistory('redo')}>Redo</button>
        </div>
      </div>
      <AttributionLine unveiled={unveiled} author={author} source={attributionSource} />
      <ModeBanner notice={props.notice} />
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {hintNote ? <p className="banner" role="status">{hintNote}</p> : null}
      <div className="board">
        {bundle.words.map((word, wordIndex) => (
          <div className="word" key={'w' + String(wordIndex)}>
            {word.tiles.map((tile, tileIndex) => {
              if (tile.kind === 'mark') {
                return <span className="tile-mark" key={'m' + String(tileIndex)}>{tile.char}</span>;
              }
              const guess = session.present[tile.number] || '';
              const same = selected !== null && tile.number === selected;
              const revealed = Boolean(session.revealedLetters[tile.number]);
              const marked = !revealed && markedWrong.indexOf(tile.number) !== -1;
              const className = tileCues({ markedWrong: marked, revealed: revealed, sameNumber: same });
              return (
                <button
                  type="button"
                  key={'t' + String(tileIndex)}
                  className={className}
                  aria-invalid={marked || undefined}
                  aria-label={tileLabel(tile.number, guess, marked, revealed)}
                  onClick={() => openWord(wordIndex, tileIndex)}
                >
                  <span className="tile-glyph">
                    {marked ? <span className="tile-cue" aria-hidden="true">× </span> : null}
                    {revealed ? <span className="tile-cue" aria-hidden="true">● </span> : null}
                    {guess || '\u00a0'}
                  </span>
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
          tone="gold"
          title="Hint"
          detail="Open the hint cards. The board stays quiet until you ask."
          onClick={() => {
            setEditor(null);
            setHintOpen(true);
          }}
        />
        <BigCard title="Give up" detail="Ask before the answer is shown." onClick={() => { setEditor(null); setGivingUp(true); }} />
        <BigCard title="Back to Today" onClick={props.onHome} />
      </div>
      {editor ? (
        <WordSheet
          words={bundle.words}
          wordIndex={editor.wordIndex}
          tileIndex={editor.tileIndex}
          session={session}
          markedWrong={markedWrong}
          onPick={place}
          onSelect={(tileIndex) => setEditor({ wordIndex: editor.wordIndex, tileIndex: tileIndex })}
          onClear={() => {
            const word = bundle.words[editor.wordIndex];
            const numbers = numbersInWord(word);
            setSession((current) => unsetNumbers(current, numbers));
            setMarkedWrong((current) => {
              let next = current;
              for (const number of numbers) {
                next = marksAfterEdit(next, number, 'x', undefined);
              }
              return next;
            });
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {hintOpen ? (
        <HintPanel
          hints={HINT_CATALOG}
          state={boardState(session, bundle.words)}
          note={hintNote}
          onApply={(hint) => { void runHint(hint); }}
          onClose={() => setHintOpen(false)}
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
                  const current = sessionRef.current;
                  void bundle.api.giveUp(current.elapsedMs, current.hintsUsed, current.hintLog).then(
                    (outcome) => {
                      setSession((latest) => ({ ...latest, gaveUp: true }));
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

function tileLabel(number: number, guess: string, marked: boolean, revealed: boolean): string {
  let label = 'Number ' + String(number) + (guess ? ', ' + guess : ', empty');
  if (marked) label += ', marked wrong';
  if (revealed) label += ', revealed and locked';
  return label;
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
  markedWrong: number[];
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
            const revealed = Boolean(props.session.revealedLetters[tile.number]);
            const marked = !revealed && props.markedWrong.indexOf(tile.number) !== -1;
            const className = tileCues({ markedWrong: marked, revealed: revealed, sameNumber: false })
              + (current ? ' tile-current' : '')
              + ' editor-tile';
            return (
              <button
                type="button"
                key={'et' + String(tileIndex)}
                className={className}
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
