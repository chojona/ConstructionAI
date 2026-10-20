import { cardBCaption, cardBText, joinWaitlistLabel, optionTwoLabel, pilotFeatureLabel } from "@/lib/legal/copy";

export function PayEstimateCard({ onJoin }: { onJoin?: () => void }) {
  return (
    <article className="pilot-card" data-legal="card-b">
      <div className="pilot-kicker">
        <span>{optionTwoLabel}</span>
        <span className="pilot-feature">{pilotFeatureLabel}</span>
      </div>
      <p>{cardBText}</p>
      <p className="pilot-caption">{cardBCaption}</p>
      <button type="button" className="pilot-join" data-join="b" onClick={onJoin}>{joinWaitlistLabel}</button>
    </article>
  );
}
