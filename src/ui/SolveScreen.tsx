import { useEffect, useRef, useState } from 'react';
import { codeNumberCounts } from '../engine/frequency';
import { formatDuration, parTimeMs } from '../engine/scoring';
import {
  isFilled,
  stableMapping,
  undo,
  redo,
  type SolveState,
} from '../engine/solve';
import { applyHintEffect } from '../hints/apply';
import { boardFromSolve, newRequestId } from '../hints/board';
import { costLabel } from '../hints/config';
import { marksAfterEdit, presentFillCheck } from '../hints/feedback';
import { HINT_CATALOG, pointsUsedLabel } from '../hints/registry';
import type { HintType } from '../hints/types';
import type { SolveOutcome } from '../play/api';
import type { PuzzleBundle } from '../play/bundle';
import { applyBackspace, applyLetter, firstOpenSpot, nextOpenSpot, type KeyApply, type TileSpot } from '../play/input';
import { AttributionLine } from './AttributionLine';
import { BigCard, ModeBanner, Shell } from './chrome';
import { FrequencyBars } from './FrequencyBars';
import { HintPanel } from './HintPanel';
import { playSurface } from './PuzzleBoard';

export function SolveScreen(props: {
  bundle: PuzzleBundle;
  notice: string | null;
  onPersist: (state: SolveState, finished: SolveOutcome | null) => void;
  onDone: (outcome: SolveOutcome) => void;
  onHome: () => void;
}) {
  const { bundle } = props;
  const surface = playSurface(bundle.mode);
  const Board = surface.Board;
  const [session, setSession] = useState<SolveState>(bundle.initial);
  const [spot, setSpot] = useState<TileSpot | null>(() => firstOpenSpot(bundle.words, bundle.initial.present));
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
  const spotRef = useRef(spot);
  spotRef.current = spot;
  const onDoneRef = useRef(props.onDone);
  onDoneRef.current = props.onDone;
  const onPersistRef = useRef(props.onPersist);
  onPersistRef.current = props.onPersist;
  const closing = useRef(false);
  const checked = useRef('');
  const busy = useRef(false);
  const blockKeys = useRef(false);
  blockKeys.current = hintOpen || chartOpen || givingUp || pendingLetter !== null;

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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (blockKeys.current) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Backspace') {
        event.preventDefault();
        acceptInput(applyBackspace(sessionRef.current, bundle.words, spotRef.current));
        return;
      }
      if (event.key.length !== 1) return;
      const letter = event.key.toUpperCase();
      if (letter < 'A' || letter > 'Z') return;
      event.preventDefault();
      acceptInput(applyLetter(sessionRef.current, bundle.words, spotRef.current, letter, false));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bundle.words]);

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

  function acceptInput(applied: KeyApply) {
    const changed = applied.state !== sessionRef.current;
    setSession(applied.state);
    setSpot(applied.spot);
    if (applied.pendingLetter) setPendingLetter(applied.pendingLetter);
    if (applied.note) setHintNote(applied.note);
    else if (changed) setHintNote(null);
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
      const currentSpot = spotRef.current;
      if (currentSpot && applied.state.revealedLetters[currentSpot.number]) {
        setSpot(nextOpenSpot(bundle.words, applied.state.present, currentSpot) || firstOpenSpot(bundle.words, applied.state.present));
      }
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
      <Board
        words={bundle.words}
        session={session}
        spot={spot}
        shaking={shaking}
        highlight={highlight}
        onSelect={(next) => {
          if (armed) {
            void revealPicked(next.number);
            return;
          }
          setSpot(next);
        }}
        onType={(letter) => acceptInput(applyLetter(sessionRef.current, bundle.words, spotRef.current, letter, false))}
        onDelete={() => acceptInput(applyBackspace(sessionRef.current, bundle.words, spotRef.current))}
      />
      <div className="stack">
        <p className="fine">0 hint points and inside par: 3 stars. 0 over par, or 1–2 hint points: 2 stars. 3 or more hint points: 1 star. Showing the answer: 0.</p>
        <BigCard
          tone="gold"
          title="Hint"
          detail={pointsUsedLabel(session.hintPoints)}
          onClick={() => setHintOpen(true)}
        />
        <BigCard title="Give up" detail="Ask before the answer is shown." onClick={() => setGivingUp(true)} />
        <BigCard title="Back to Today" onClick={props.onHome} />
      </div>
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
                  if (!letter) return;
                  acceptInput(applyLetter(sessionRef.current, bundle.words, spotRef.current, letter, true));
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
