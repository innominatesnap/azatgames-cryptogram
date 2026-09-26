import { ENGLISH_LETTER_FREQUENCY, type NumberCount } from '../engine/frequency';
import { FREQUENCY_SOURCE } from '../hints/config';

export function FrequencyBars(props: {
  counts: NumberCount[];
  revealed?: { [number: number]: string };
  highlight?: number | null;
  onHighlight?: (number: number) => void;
}) {
  const revealed = props.revealed || {};
  const maxCount = props.counts.reduce((max, row) => (row.count > max ? row.count : max), 1);
  const maxEnglish = ENGLISH_LETTER_FREQUENCY[0].percent;
  return (
    <div className="stack">
      <p className="fine">{FREQUENCY_SOURCE.name}. {FREQUENCY_SOURCE.citation}</p>
      <p className="fine">{FREQUENCY_SOURCE.tip}</p>
      <div>
        <div className="eyebrow">Code numbers in this puzzle</div>
        <div className="bars">
          {props.counts.map((row) => {
            const letter = revealed[row.number];
            const active = props.highlight === row.number;
            return (
              <button
                type="button"
                className={'bar-row' + (letter ? ' bar-row-revealed' : '') + (active ? ' bar-row-active' : '')}
                key={'n' + String(row.number)}
                onClick={() => {
                  if (props.onHighlight) props.onHighlight(row.number);
                }}
              >
                <span>{letter ? letter + ' lock' : row.number}</span>
                <span className="bar-track">
                  <span
                    className={'bar-fill' + (letter ? ' bar-fill-revealed' : '')}
                    style={{ width: String(Math.round((row.count / maxCount) * 100)) + '%' }}
                  />
                </span>
                <span>{row.count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="eyebrow">Typical English</div>
        <div className="bars">
          {ENGLISH_LETTER_FREQUENCY.map((row) => (
            <div className="bar-row" key={row.letter}>
              <span>{row.letter}</span>
              <div className="bar-track">
                <div
                  className="bar-fill bar-fill-english"
                  style={{ width: String(Math.round((row.percent / maxEnglish) * 100)) + '%' }}
                />
              </div>
              <span>{row.percent}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
