import { BigCard } from './chrome';
import { groupHints } from '../hints/registry';
import type { HintBoardState, HintType } from '../hints/types';

export function HintPanel(props: {
  hints: HintType[];
  state: HintBoardState;
  note: string | null;
  onApply: (hint: HintType) => void;
  onClose: () => void;
}) {
  const groups = groupHints(props.hints);
  return (
    <div className="sheet-scrim" onClick={props.onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hint-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="hint-title" className="screen-title">Hints</h2>
        <p className="fine">Each card is one hint. Nothing else on the board is marked until you choose one.</p>
        {props.note ? <p className="banner" role="status">{props.note}</p> : null}
        {groups.map((group) => (
          <section key={group.category} className="hint-group" aria-label={group.label}>
            <h3 className="eyebrow">{group.label}</h3>
            <div className="stack">
              {group.hints.map((hint) => (
                <BigCard
                  key={hint.id}
                  title={hint.title}
                  detail={hint.description}
                  disabled={!hint.isAvailable(props.state)}
                  onClick={() => props.onApply(hint)}
                />
              ))}
            </div>
          </section>
        ))}
        <div className="stack">
          <BigCard title="Close" onClick={props.onClose} />
        </div>
      </div>
    </div>
  );
}
