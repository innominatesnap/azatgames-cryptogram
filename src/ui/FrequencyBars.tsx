import { ENGLISH_LETTER_FREQUENCY, type NumberCount } from '../engine/frequency';

export function FrequencyBars(props: { counts: NumberCount[] }) {
  const maxCount = props.counts.reduce((max, row) => (row.count > max ? row.count : max), 1);
  const maxEnglish = ENGLISH_LETTER_FREQUENCY[0].percent;
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Code numbers in this puzzle</div>
        <div className="bars">
          {props.counts.map((row) => (
            <div className="bar-row" key={'n' + String(row.number)}>
              <span>{row.number}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: String(Math.round((row.count / maxCount) * 100)) + '%' }} />
              </div>
              <span>{row.count}</span>
            </div>
          ))}
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
