import { useState } from 'react';
import { codeNumberCounts } from '../engine/frequency';
import { formatDuration } from '../engine/scoring';
import type { Word } from '../engine/cipher';
import type { SolveOutcome } from '../play/api';
import { hintReceipt, shareResultText } from '../hints/registry';
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
  const clean = props.outcome.solved && !props.outcome.gaveUp && props.outcome.hintPoints === 0;
  const share = shareResultText({
    dateLabel: props.outcome.dateLabel,
    stars: props.outcome.stars,
    elapsedMs: props.outcome.elapsedMs,
    hintPoints: props.outcome.hintPoints,
    gaveUp: props.outcome.gaveUp,
  });
  const heading = props.outcome.gaveUp ? 'Answer' : 'Solved';
  return (
    <Shell>
      <Wordmark subtitle="Solve complete" />
      <h2 className="screen-title">{heading}</h2>
      <ModeBanner notice={props.notice} />
      <div className="stack">
        <div className="big-card tone-gold">
          {clean ? <p className="seal">Clean solve</p> : null}
          <div className="stars" aria-label={String(props.outcome.stars) + ' of 3 stars'}>{starRow(props.outcome.stars)}</div>
          <p>{formatDuration(props.outcome.elapsedMs)} · {hintReceipt(props.outcome.hintPoints, props.outcome.hintLog)} · {props.outcome.points} points</p>
          <p className="fine">0 hint points inside par earns 3 stars. 1 or 2 hint points, or 0 over par, earns 2. 3 or more earns 1.</p>
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
