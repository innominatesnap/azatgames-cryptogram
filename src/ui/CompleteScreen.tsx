import { useState } from 'react';
import { codeNumberCounts } from '../engine/frequency';
import { formatDuration } from '../engine/scoring';
import type { Word } from '../engine/cipher';
import type { SolveOutcome } from '../play/api';
import { BigCard, ModeBanner, Shell, Wordmark } from './chrome';
import { FrequencyBars } from './FrequencyBars';

function starRow(count: number): string {
  const filled = count < 0 ? 0 : count > 3 ? 3 : count;
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
}

export function CompleteScreen(props: {
  outcome: SolveOutcome;
  words: Word[];
  notice: string | null;
  onHome: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const share = 'CryptoGram Daily ' + props.outcome.dateLabel + ': ' + String(props.outcome.stars) + ' stars, ' + formatDuration(props.outcome.elapsedMs);
  const heading = props.outcome.gaveUp ? 'Answer' : 'Solved';
  return (
    <Shell>
      <Wordmark subtitle="Solve complete" />
      <h2 className="screen-title">{heading}</h2>
      <ModeBanner notice={props.notice} />
      <div className="stack">
        <div className="big-card tone-gold">
          <div className="stars" aria-label={String(props.outcome.stars) + ' of 3 stars'}>{starRow(props.outcome.stars)}</div>
          <p>{formatDuration(props.outcome.elapsedMs)} · {props.outcome.hintsUsed} hints · {props.outcome.points} points</p>
        </div>
        <BigCard
          title={props.outcome.quote.author}
          detail={props.outcome.quote.work + ', ' + String(props.outcome.quote.year)}
        />
        <p>{props.outcome.quote.plainText}</p>
        <p className="fine">{props.outcome.quote.sourceNote}</p>
        <BigCard
          title="Letter histogram"
          detail={open ? 'Hide the chart.' : 'Collapsed. Tap to compare this quote with typical English.'}
          pressed={open}
          onClick={() => setOpen((value) => !value)}
        />
        {open ? <FrequencyBars counts={codeNumberCounts(props.words)} /> : null}
        <BigCard
          title={copied ? 'Copied' : 'Share result'}
          detail={share}
          onClick={() => {
            const finish = () => setCopied(true);
            if (navigator.clipboard && navigator.clipboard.writeText) {
              void navigator.clipboard.writeText(share).then(finish, finish);
              return;
            }
            finish();
          }}
        />
        <BigCard tone="gold" title="Back to Today" onClick={props.onHome} />
      </div>
    </Shell>
  );
}
