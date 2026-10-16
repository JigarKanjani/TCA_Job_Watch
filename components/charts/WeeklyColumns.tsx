import { ChartTips } from "./ChartTips";

export type Week = { label: string; value: number };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// Columns from one baseline, one hue; labels only on the peak and the latest week.
export function WeeklyColumns({ weeks, title }: { weeks: Week[]; title: string }) {
  const max = niceMax(Math.max(0, ...weeks.map((w) => w.value)));
  const peak = weeks.reduce((best, w, i) => (w.value > weeks[best].value ? i : best), 0);
  const ticks = [max, max / 2, 0];
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <ChartTips>
        <div className="cols">
          <div className="cols-axis" aria-hidden="true">
            {ticks.map((t) => <span key={t}>{t}</span>)}
          </div>
          <div className="cols-plot">
            {ticks.map((t) => <span key={t} className="cols-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
            {weeks.map((w, i) => {
              const labelled = (i === peak || i === weeks.length - 1) && w.value > 0;
              return (
                <div className="col-slot" key={w.label}>
                  <span
                    className="col"
                    style={{ height: `${(w.value / max) * 100}%`, animationDelay: `${i * 60}ms` }}
                    tabIndex={0}
                    data-tip-value={`${w.value} match${w.value === 1 ? "" : "es"}`}
                    data-tip-label={`Week of ${w.label}`}
                    aria-label={`Week of ${w.label}: ${w.value} matches`}
                  >
                    {labelled && <span className="col-cap">{w.value}</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="cols-x" aria-hidden="true">
            {weeks.map((w) => <span key={w.label}>{w.label}</span>)}
          </div>
        </div>
      </ChartTips>
      <details className="chart-table">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Week of</th><th>Matches</th></tr></thead>
          <tbody>{weeks.map((w) => <tr key={w.label}><td>{w.label}</td><td>{w.value}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
