import { ChartTips } from "./ChartTips";

export type Stage = { label: string; value: number; note?: string };

// Horizontal bars, one hue, value at the tip. Used for the application funnel.
export function FunnelBars({ stages, title }: { stages: Stage[]; title: string }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  const top = stages[0]?.value || 0;
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <ChartTips>
        <div className="hbars" role="list">
          {stages.map((s, i) => {
            const pct = (s.value / max) * 100;
            const ofTop = top ? Math.round((s.value / top) * 100) : 0;
            return (
              <div className="hbar-row" role="listitem" key={s.label}>
                <span className="hbar-label">{s.label}</span>
                <div className="hbar-track">
                  <span
                    className="hbar"
                    style={{ width: `${s.value === 0 ? 0 : Math.max(pct, 1.5)}%`, animationDelay: `${i * 90}ms` }}
                    tabIndex={0}
                    data-tip-value={s.value.toLocaleString()}
                    data-tip-label={i === 0 ? s.label : `${s.label} · ${ofTop}% of matches`}
                    aria-label={`${s.label}: ${s.value}`}
                  />
                  <span className="hbar-value">{s.value.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </ChartTips>
      <details className="chart-table">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Stage</th><th>Jobs</th><th>% of matches</th></tr></thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.label}><td>{s.label}</td><td>{s.value}</td><td>{top ? Math.round((s.value / top) * 100) : 0}%</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
