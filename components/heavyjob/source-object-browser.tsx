import type { HeavyJobSourceObjectDto } from "@/lib/heavyjob/dto";

export function HeavyJobSourceBrowser({ objects }: { objects: readonly HeavyJobSourceObjectDto[] }) {
  return (
    <section aria-labelledby="heavyjob-heading">
      <div className="section-heading">
        <h2 id="heavyjob-heading">Source objects</h2>
        <span className="count">{objects.length}</span>
      </div>
      {objects.length === 0 ? (
        <div className="empty">
          <strong>No source objects</strong>
          <span>This project has no stored HeavyJob snapshots.</span>
        </div>
      ) : (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th scope="col">type</th>
                <th scope="col">sourceId</th>
                <th scope="col">fetchedAt</th>
                <th scope="col">raw</th>
              </tr>
            </thead>
            <tbody>
              {objects.map((object) => (
                <tr key={object.id} data-object-type={object.objectType}>
                  <td>{object.objectType}</td>
                  <td><code>{object.sourceId}</code></td>
                  <td><time dateTime={object.fetchedAt}>{object.fetchedAt}</time></td>
                  <td>
                    <details className="raw-peek">
                      <summary>Expand</summary>
                      <pre>{JSON.stringify(object.raw, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
