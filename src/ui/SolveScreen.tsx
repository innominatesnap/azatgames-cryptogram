import { useEffect, useRef, useState } from 'react';
import type { Word } from '../engine/cipher';
import { codeNumberCounts } from '../engine/frequency';
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
import { boardFromSolve, newRequestId } from '../hints/board';
import { costLabel } from '../hints/config';
import { marksAfterEdit, presentFillCheck, tileCues } from '../hints/feedback';
import { HINT_CATALOG, pointsUsedLabel } from '../hints/registry';
import type { HintType } from '../hints/types';
import type { SolveOutcome } from '../play/api';
import type { PuzzleBundle } from '../play/bundle';
import { AttributionLine } from './AttributionLine';
import { BigCard, ModeBanner, Shell } from './chrome';
import { FrequencyBars } from './FrequencyBars';
import { HintPanel } from './HintPanel';

const KEY_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'];

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
  const [chartOpen, setChartOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [shaking, setShaking] = useState<number[]>([]);
  const [armed, setArmed] = useState<string | null>(null);
  const [pendingLetter, setPendingLetter] = useState<string | null>(null);
  const [hintNote, setHintNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onDoneRef = useRef(props.onDone);
  onDoneRef.current = props.onDone;
  const onPersistRef = useRef(props.onPersist);
  onPersistRef.current = props.onPersist;
  const closing = useRef(false);
  const checked = useRef('');
  const busy = useRef(false);

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
    if (!shaking.length) return;
    const id = window.setTimeout(() => setShaking([]), 150);
    return () => window.clearTimeout(id);
  }, [shaking]);

  useEffect(() => {
    if (closing.current) return;
    if (!isFilled(bundle.words, session.present)) return;
    const key = stableMapping(session.present);
    if (checked.current === key) return;
    checked.current = key;
    let cancelled = false;
    const current = sessionRef.current;
    void bundle.api.confirm(session.present, current.elapsedMs, current.hintsUsed, current.hintPoints, current.hintLog).then(
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
    let marked = current.markedNumbers;
    for (const number of marked) {
      marked = marksAfterEdit(marked, number, current.present[number], next.present[number]);
    }
    setSession({ ...next, markedNumbers: marked });
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

  async function runHint(hint: HintType, extra?: { number?: number }, requestId?: string) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    const current = sessionRef.current;
    const id = requestId || newRequestId();
    try {
      const effect = await hint.apply(
        boardFromSolve(current, bundle.words, bundle.key, bundle.uniqueLetterCount),
        {
          request(hintId, state, sentId, sentExtra) {
            return bundle.api.requestHint(hintId, state, sentId, sentExtra);
          },
        },
        id,
        extra,
      );
      const applied = applyHintEffect(current, effect);
      setSession(applied.state);
      setHintNote(applied.note);
      if (effect.action === 'mark' && effect.numbers.length) setShaking(effect.numbers);
      if (effect.action === 'frequency') {
        setHintOpen(false);
        setChartOpen(true);
      } else if (effect.charged || effect.action === 'reveal' || effect.action === 'cross-off' || effect.action === 'author' || effect.action === 'source') {
        setHintOpen(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not use that hint');
    } finally {
      busy.current = false;
    }
  }

  async function revealPicked(number: number) {
    const requestId = armed;
    setArmed(null);
    const current = sessionRef.current;
    if (current.revealedLetters[number]) {
      setHintNote('That letter is already revealed.');
      return;
    }
    const hint = HINT_CATALOG.find((item) => item.id === 'pick-letter');
    if (!hint) return;
    await runHint(hint, { number: number }, requestId || undefined);
  }

  function commitLetter(letter: string) {
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
    const marked = marksAfterEdit(next.markedNumbers, tile.number, before, next.present[tile.number]);
    const stored = { ...next, markedNumbers: marked };
    setSession(stored);
    if (wordIsFull(word, stored.present)) {
      setEditor(null);
      return;
    }
    const forward = nextEmptyTileIndex(word, stored.present, editor.tileIndex);
    if (forward !== null) {
      setEditor({ wordIndex: editor.wordIndex, tileIndex: forward });
      return;
    }
    const first = firstEmptyTileIndex(word, stored.present);
    if (first !== null) setEditor({ wordIndex: editor.wordIndex, tileIndex: first });
  }

  function place(letter: string) {
    if (session.crossedOff.indexOf(letter) !== -1) {
      setPendingLetter(letter);
      return;
    }
    commitLetter(letter);
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
          return {
            ...next,
            markedNumbers: marksAfterEdit(next.markedNumbers, tile.number, before, next.present[tile.number]),
          };
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
  const author = session.attributionStage >= 1 && session.attribution ? session.attribution.author : null;
  const work = session.attributionStage >= 2 && session.attribution ? session.attribution.work : null;
  const year = session.attributionStage >= 2 && session.attribution ? session.attribution.year : null;
  const crossed = session.crossedOff.slice().sort().join(', ');

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
      <AttributionLine stage={session.attributionStage} author={author} work={work} year={year} />
      <ModeBanner notice={props.notice} />
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {hintNote ? <p className="banner" role="status">{hintNote}</p> : null}
      {armed ? (
        <p className="banner" role="status">
          Tap any tile to reveal its letter everywhere. {costLabel(3)}.
          <button type="button" className="icon-button" onClick={() => setArmed(null)}>Cancel</button>
        </p>
      ) : null}
      {crossed ? <p className="fine">Crossed off: {crossed}</p> : null}
      <div className="board">
        {bundle.words.map((word, wordIndex) => (
          <div className="word" key={'w' + String(wordIndex)}>
            {word.tiles.map((tile, tileIndex) => {
              if (tile.kind === 'mark') {
                return <span className="tile-mark" key={'m' + String(tileIndex)}>{tile.char}</span>;
              }
              const guess = session.present[tile.number] || '';
              const same = (selected !== null && tile.number === selected) || highlight === tile.number;
              const revealed = Boolean(session.revealedLetters[tile.number]);
              const marked = !revealed && session.markedNumbers.indexOf(tile.number) !== -1;
              const className = tileCues({ markedWrong: marked, revealed: revealed, sameNumber: same })
                + (shaking.indexOf(tile.number) !== -1 ? ' tile-shake' : '');
              return (
                <button
                  type="button"
                  key={'t' + String(tileIndex)}
                  className={className}
                  aria-invalid={marked || undefined}
                  title={marked ? 'This letter is wrong. Change it to clear the mark.' : undefined}
                  aria-label={tileLabel(tile.number, guess, marked, revealed)}
                  onClick={() => {
                    if (armed) {
                      void revealPicked(tile.number);
                      return;
                    }
                    openWord(wordIndex, tileIndex);
                  }}
                >
                  <span className="tile-glyph">
                    {marked ? <span className="tile-cue" aria-hidden="true">✕ </span> : null}
                    {revealed ? <span className="tile-cue" aria-hidden="true">lock </span> : null}
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
        <p className="fine">0 hint points and inside par: 3 stars. 0 over par, or 1–2 hint points: 2 stars. 3 or more hint points: 1 star. Showing the answer: 0.</p>
        <BigCard
          tone="gold"
          title="Hint"
          detail={pointsUsedLabel(session.hintPoints)}
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
          onPick={place}
          onSelect={(tileIndex) => setEditor({ wordIndex: editor.wordIndex, tileIndex: tileIndex })}
          onClear={() => {
            const word = bundle.words[editor.wordIndex];
            const numbers = numbersInWord(word);
            setSession((current) => {
              const next = unsetNumbers(current, numbers);
              let marked = next.markedNumbers;
              for (const number of numbers) {
                marked = marksAfterEdit(marked, number, 'x', next.present[number]);
              }
              return { ...next, markedNumbers: marked };
            });
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {pendingLetter ? (
        <div className="sheet-scrim">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="cross-title">
            <h2 id="cross-title" className="screen-title">{pendingLetter} is not in this puzzle. Place it anyway?</h2>
            <div className="stack">
              <BigCard
                tone="gold"
                title={'Place ' + pendingLetter + ' anyway'}
                onClick={() => {
                  const letter = pendingLetter;
                  setPendingLetter(null);
                  commitLetter(letter);
                }}
              />
              <BigCard title="Leave it crossed off" onClick={() => setPendingLetter(null)} />
            </div>
          </div>
        </div>
      ) : null}
      {hintOpen ? (
        <HintPanel
          hints={HINT_CATALOG}
          state={boardFromSolve(session, bundle.words, bundle.key, bundle.uniqueLetterCount)}
          note={hintNote}
          onApply={(hint) => { void runHint(hint); }}
          onArmPick={() => {
            setHintOpen(false);
            setArmed(newRequestId());
            setHintNote(null);
          }}
          onOpenChart={() => {
            setHintOpen(false);
            setChartOpen(true);
          }}
          onClose={() => setHintOpen(false)}
        />
      ) : null}
      {chartOpen ? (
        <div className="sheet-scrim" onClick={() => setChartOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="chart-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="chart-title" className="screen-title">Letter frequency chart</h2>
            <FrequencyBars
              counts={codeNumberCounts(bundle.words)}
              revealed={session.revealedLetters}
              highlight={highlight}
              onHighlight={(number) => setHighlight(number)}
            />
            <button type="button" className="big-card tone-gold" onClick={() => setChartOpen(false)}>
              <span className="big-card-title">Close</span>
            </button>
          </div>
        </div>
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
                  void bundle.api.giveUp(current.elapsedMs, current.hintsUsed, current.hintPoints, current.hintLog).then(
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
            const marked = !revealed && props.session.markedNumbers.indexOf(tile.number) !== -1;
            const className = tileCues({ markedWrong: marked, revealed: revealed, sameNumber: false })
              + (current ? ' tile-current' : '')
              + ' editor-tile';
            return (
              <button
                type="button"
                key={'et' + String(tileIndex)}
                className={className}
                title={marked ? 'This letter is wrong. Change it to clear the mark.' : undefined}
                onClick={() => props.onSelect(tileIndex)}
              >
                <span className="tile-glyph">
                  {marked ? <span className="tile-cue" aria-hidden="true">✕ </span> : null}
                  {revealed ? <span className="tile-cue" aria-hidden="true">lock </span> : null}
                  {guess || '\u00a0'}
                </span>
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
                const crossedOff = props.session.crossedOff.indexOf(letter) !== -1;
                const locked = selected !== null && Boolean(props.session.revealedLetters[selected]);
                const className = 'key'
                  + (used ? ' key-used' : '')
                  + (current ? ' key-current' : '')
                  + (crossedOff ? ' key-crossed' : '');
                return (
                  <button
                    type="button"
                    key={letter}
                    className={className}
                    disabled={locked}
                    title={crossedOff ? 'Not in this puzzle.' : undefined}
                    aria-label={letter + (crossedOff ? ', not in this puzzle' : '') + (used ? ', in use, still available' : '')}
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
