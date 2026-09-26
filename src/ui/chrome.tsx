import type { ReactNode } from 'react';

export function BigCard(props: {
  title: string;
  detail?: string;
  onClick?: () => void;
  tone?: 'gold' | 'default' | 'quiet';
  className?: string;
  pressed?: boolean;
  disabled?: boolean;
}) {
  const className = 'big-card tone-' + (props.tone || 'default') + (props.className ? ' ' + props.className : '');
  const body = (
    <>
      <span className="big-card-title">{props.title}</span>
      {props.detail ? <span className="big-card-detail">{props.detail}</span> : null}
    </>
  );
  if (!props.onClick) {
    return <div className={className}>{body}</div>;
  }
  return (
    <button
      type="button"
      className={className}
      onClick={props.onClick}
      aria-pressed={props.pressed}
      disabled={props.disabled}
    >
      {body}
    </button>
  );
}

export function ModeBanner(props: { notice: string | null }) {
  if (!props.notice) return null;
  return (
    <div className="banner" role="status">
      <strong>Notice. </strong>
      {props.notice}
    </div>
  );
}

export function Wordmark(props: { subtitle: string }) {
  return (
    <div className="wordmark">
      <div>
        <div className="eyebrow">Azat</div>
        <h1>CryptoGram</h1>
      </div>
      <div className="fine">{props.subtitle}</div>
    </div>
  );
}

export function Shell(props: { children: ReactNode }) {
  return <main className="app-shell">{props.children}</main>;
}
