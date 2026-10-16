import { CountUp } from "./CountUp";

type Props = {
  label: string;
  value: number;
  suffix?: string;
  delta?: { text: string; good: boolean | null };
  trend?: number[];
  note?: string;
};

// Stat tile: label · value · optional delta vs a named period · optional sparkline
// (prior points in the muted step, the current point in the accent).
export function StatTile({ label, value, suffix, delta, trend, note }: Props) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        <CountUp value={value} suffix={suffix} />
      </span>
      {delta && (
        <span className={`stat-delta ${delta.good === null ? "" : delta.good ? "up" : "down"}`}>{delta.text}</span>
      )}
      {note && <span className="stat-note">{note}</span>}
      {trend && trend.length > 1 && <Sparkline points={trend} />}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 120;
  const h = 32;
  const pad = 5;
  const max = Math.max(1, ...points);
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((p, i) => [pad + i * step, h - pad - (p / max) * (h - pad * 2)] as const);
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--chart-muted)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="4" fill="var(--chart-1)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}
