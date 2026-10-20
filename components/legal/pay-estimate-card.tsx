import { cardBCaption, cardBText, optionTwoLabel, pilotFeatureLabel } from "@/lib/legal/copy";

export function PayEstimateCard({ pilot, onJoin }: { pilot: boolean; onJoin?: () => void }) {
  return (
    <article className="pilot-card" data-legal="card-b" data-pilot={pilot ? "true" : "false"}>
      <div className="pilot-kicker">
        <span>{optionTwoLabel}</span>
        {pilot ? <span className="pilot-feature">{pilotFeatureLabel}</span> : null}
      </div>
      <p>{cardBText}</p>
      {pilot ? <p className="pilot-caption">{cardBCaption}</p> : null}
      <button type="button" className="pilot-join" data-join="b" onClick={onJoin}>Join the waitlist</button>
    </article>
  );
}
