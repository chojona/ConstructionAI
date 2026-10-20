import { cardBCaption, cardBText } from "@/lib/legal/copy";

export function PayEstimateCard({ pilot, onJoin }: { pilot: boolean; onJoin?: () => void }) {
  return (
    <article className="pilot-card" data-legal="card-b" data-pilot={pilot ? "true" : "false"}>
      <div className="pilot-kicker">
        <span>Option 2</span>
        {pilot ? <span className="pilot-feature">Pilot feature</span> : null}
      </div>
      <p>{pilot ? cardBText : "Check your installed quantities against the DOT's monthly pay estimate. Every gap is flagged with its source page."}</p>
      {pilot ? <p className="pilot-caption">{cardBCaption}</p> : null}
      <button type="button" className="pilot-join" data-join="b" onClick={onJoin}>Join the waitlist</button>
    </article>
  );
}
