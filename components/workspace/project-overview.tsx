import type { ProjectOverviewModel } from "@/lib/review/projectOverview";

export function ProjectOverviewLead({ model }: { model: ProjectOverviewModel }) {
  return (
    <section className="overview-lead" aria-label="Project status">
      {model.banner ? (
        <div className="decision-banner">
          <div className="decision-copy">
            <h2>{model.banner.title}</h2>
            <p>{model.banner.summary}</p>
          </div>
          <a href={model.banner.href}>{model.banner.actionLabel}</a>
        </div>
      ) : null}
      <dl className="metrics metrics-strip">
        {model.stats.map((stat) => (
          <div className="metric" key={stat.key}>
            <dt>
              <span className={`stat-dot stat-dot-${stat.dot}`} aria-hidden="true" />
              {stat.label}
            </dt>
            <dd className="metric-value">{stat.value}</dd>
            <dd className={stat.noteTone ? `metric-note metric-note-${stat.noteTone}` : "metric-note"}>{stat.helper}</dd>
          </div>
        ))}
      </dl>
      {model.evidenceNote ? <p className="overview-note">{model.evidenceNote}</p> : null}
    </section>
  );
}
