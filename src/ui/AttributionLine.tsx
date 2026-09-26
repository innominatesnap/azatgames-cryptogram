export function AttributionLine(props: {
  unveiled: boolean;
  author: string | null;
  source: string | null;
}) {
  if (props.unveiled) {
    const author = props.author || 'Unknown author';
    const source = props.source || 'Unknown source';
    return (
      <p className="attribution" aria-label={author + ', ' + source}>
        {author}
        <span className="fine"> · {source}</span>
      </p>
    );
  }
  const ghost = props.author && props.source ? props.author + ' · ' + props.source : 'Author · Source';
  return (
    <p className="attribution-wrap">
      <span
        className="attribution attribution-hidden"
        tabIndex={0}
        title="Revealed after a hint"
        aria-label="Revealed after a hint"
      >
        {ghost}
      </span>
      <span className="hint-tip" role="tooltip">Revealed after a hint</span>
    </p>
  );
}
