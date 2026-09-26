const HIDDEN_LINE = '— ▒▒▒▒▒▒ ▒▒▒▒▒▒▒, ▒▒▒▒';
const HIDDEN_SOURCE = '▒▒▒▒▒▒▒, ▒▒▒▒';

export function AttributionLine(props: {
  stage: 0 | 1 | 2;
  author: string | null;
  work: string | null;
  year: number | null;
}) {
  if (props.stage >= 2 && props.work) {
    const author = props.author || 'Unknown author';
    const year = props.year ? ', ' + String(props.year) : '';
    return (
      <p className="attribution" aria-label={author + ', ' + props.work + year}>
        {author}
        <span className="fine"> · {props.work}{year}</span>
      </p>
    );
  }
  if (props.stage >= 1 && props.author) {
    return (
      <p className="attribution">
        {props.author}
        <span className="attribution-wrap">
          <span
            className="attribution-placeholder"
            tabIndex={0}
            title="Revealed after a hint"
            aria-label="Revealed after a hint"
          >
            {' · ' + HIDDEN_SOURCE}
          </span>
          <span className="hint-tip" role="tooltip">Revealed after a hint</span>
        </span>
        <span className="fine"> Hidden</span>
      </p>
    );
  }
  return (
    <p className="attribution-wrap">
      <span
        className="attribution attribution-placeholder"
        tabIndex={0}
        title="Revealed after a hint"
        aria-label="Revealed after a hint"
      >
        {HIDDEN_LINE}
      </span>
      <span className="fine"> Hidden</span>
      <span className="hint-tip" role="tooltip">Revealed after a hint</span>
    </p>
  );
}
