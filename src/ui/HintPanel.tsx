import { useState } from 'react';
import { costLabel } from '../hints/config';
import { groupHints, usesLeftLabel } from '../hints/registry';
import type { HintBoardState, HintType } from '../hints/types';

export function HintPanel(props: {
  hints: HintType[];
  state: HintBoardState;
  note: string | null;
  onApply: (hint: HintType) => void;
  onArmPick: (hint: HintType) => void;
  onOpenChart: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
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
        <h2 id="hint-title" className="screen-title">Pick a hint</h2>
        <p className="fine">Hint points lower your stars. No hint points and inside par earns 3 stars.</p>
        {props.note ? <p className="banner" role="status">{props.note}</p> : null}
        {groups.map((group) => (
          <section key={group.category} className="hint-group" aria-label={group.label}>
            <h3 className="eyebrow">{group.label}</h3>
            <div className="hint-grid">
              {group.hints.map((hint) => {
                const reason = hint.unavailableReason(props.state);
                const openChart = hint.id === 'frequency-chart' && props.state.frequencyShown;
                const disabled = reason !== null && !openChart;
                if (confirming === hint.id) {
                  return (
                    <div className="hint-card hint-card-confirm" key={hint.id}>
                      <span className="big-card-title">{hint.title}</span>
                      <div className="pair">
                        <button
                          type="button"
                          className="big-card tone-gold"
                          onClick={() => {
                            setConfirming(null);
                            if (hint.id === 'pick-letter') props.onArmPick(hint);
                            else props.onApply(hint);
                          }}
                        >
                          <span className="big-card-title">Use it ({costLabel(hint.price)})</span>
                        </button>
                        <button type="button" className="big-card" onClick={() => setConfirming(null)}>
                          <span className="big-card-title">Not now</span>
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    type="button"
                    key={hint.id}
                    className="hint-card"
                    disabled={disabled}
                    onClick={() => {
                      if (openChart) {
                        props.onOpenChart();
                        return;
                      }
                      if (disabled) return;
                      setConfirming(hint.id);
                    }}
                  >
                    <span className="hint-icon">{hint.icon}</span>
                    <span className="big-card-title">{hint.title}</span>
                    <span className="big-card-detail">{hint.description}</span>
                    <span className="cost-pill">{costLabel(hint.price)}</span>
                    <span className="fine">{reason || usesLeftLabel(hint.id, props.state)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <div className="stack">
          <button type="button" className="big-card" onClick={props.onClose}>
            <span className="big-card-title">Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
