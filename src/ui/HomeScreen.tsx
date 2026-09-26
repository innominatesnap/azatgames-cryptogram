import type { StatsSummary } from '../progress/stats';
import { formatDuration } from '../engine/scoring';
import { BigCard, ModeBanner, Shell, Wordmark } from './chrome';

export function HomeScreen(props: {
  notice: string | null;
  preview: string;
  solved: boolean;
  stars: number | null;
  stats: StatsSummary;
  signedIn: boolean;
  onSolve: () => void;
  onResult: () => void;
  onSignOut: () => void;
  onHardReset: () => void;
}) {
  const average = props.stats.averageMs === null ? 'none yet' : formatDuration(props.stats.averageMs);
  return (
    <Shell>
      <Wordmark subtitle="Today" />
      <ModeBanner notice={props.notice} />
      <div className="stack">
        <BigCard
          tone="gold"
          title="Today's quote"
          detail={props.solved ? 'Solved. ' + String(props.stars || 0) + ' stars.' : props.preview}
          onClick={props.solved ? props.onResult : props.onSolve}
        />
        {!props.solved ? <BigCard tone="gold" title="Solve" detail="Open the board and the word keypad." onClick={props.onSolve} /> : null}
        <BigCard title="Inbox" detail="Friend cryptograms arrive in a later slice." />
        <BigCard title="Write a cryptogram" detail="Sending a message arrives in a later slice." />
        <BigCard title="Friends and household" detail="The household circle arrives in a later slice." />
        <BigCard
          title="My stats"
          detail={
            String(props.stats.starsThisWeek) + ' stars this week. Streak ' + String(props.stats.streak)
            + '. Average ' + average + '. '
            + String(props.stats.solves) + ' solves, '
            + String(props.stats.lettersSolved) + ' letters, '
            + String(props.stats.hintsUsed) + ' hints. On this device.'
          }
        />
        {props.signedIn ? <BigCard title="Sign out" detail="Clears the Azat cookie on this browser, then reloads." onClick={props.onSignOut} /> : null}
        <BigCard title="Hard reset" detail="Clears CryptoGram data on this device and reloads." onClick={props.onHardReset} />
      </div>
    </Shell>
  );
}
