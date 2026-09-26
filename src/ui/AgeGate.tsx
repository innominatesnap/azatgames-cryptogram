import { BigCard, Shell, Wordmark } from './chrome';

export function AgeGate(props: { onAdult: () => void; onChild: () => void }) {
  return (
    <Shell>
      <Wordmark subtitle="Messenger" />
      <h2 className="screen-title">How old are you?</h2>
      <p className="fine">CryptoGram is for players who are 13 or older. Under 13, nothing is saved.</p>
      <div className="stack">
        <BigCard className="age-card" tone="gold" title="I'm 13 or older" detail="Continue to today's quote." onClick={props.onAdult} />
        <BigCard className="age-card" title="I'm under 13" detail="Stop here. We will not save an answer." onClick={props.onChild} />
      </div>
    </Shell>
  );
}

export function Under13Stop(props: { onBack: () => void }) {
  return (
    <Shell>
      <Wordmark subtitle="Messenger" />
      <h2 className="screen-title">CryptoGram is for ages 13 and up</h2>
      <div className="stack">
        <BigCard
          title="Nothing was saved"
          detail="No age answer, account, or puzzle was stored on this device. You can close the page."
        />
        <BigCard title="Back to the age question" onClick={props.onBack} />
      </div>
    </Shell>
  );
}
