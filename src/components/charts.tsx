'use client';

/** Dependency-free SVG charts — small payload for low-bandwidth areas. */

export interface Point {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 160,
  suffix = '',
  color = '#1743e1',
}: {
  data: Point[];
  height?: number;
  suffix?: string;
  color?: string;
}) {
  if (!data.length) return null;
  const W = 320;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = W / data.length;
  const barWidth = slot * 0.62;
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={data.map((d) => `${d.label}: ${d.value}${suffix}`).join(', ')}
    >
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 30);
        const x = i * slot + (slot - barWidth) / 2;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x} y={height - 20 - h} width={barWidth} height={Math.max(h, 1)} rx={3} fill={color} />
            <text x={x + barWidth / 2} y={height - 7} textAnchor="middle" fontSize="9" fill="#64748b">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({
  data,
  height = 160,
  color = '#1743e1',
}: {
  data: Point[];
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  const W = 320;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const span = max - min || 1;
  const step = W / (data.length - 1);
  const points = data.map((d, i) => {
    const x = i * step;
    const y = height - 22 - ((d.value - min) / span) * (height - 44);
    return `${x},${y}`;
  });
  const labelEvery = Math.ceil(data.length / 5);
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}
    >
      <polygon points={`0,${height - 22} ${points.join(' ')} ${W},${height - 22}`} fill={color} opacity="0.12" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => {
        if (i % labelEvery !== 0) return null;
        const x = i * step;
        return (
          <text
            key={`${d.label}-${i}`}
            x={x}
            y={height - 6}
            textAnchor={i === 0 ? 'start' : i >= data.length - 2 ? 'end' : 'middle'}
            fontSize="9"
            fill="#64748b"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

export function Donut({
  segments,
  size = 148,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Distribution">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {segments.map((s) => {
          const length = (s.value / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const el = (
            <circle
              key={s.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += length;
          return el;
        })}
      </svg>
      <ul className="space-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
            <span className="text-slate-700">{s.label}</span>
            <span className="font-bold text-ink">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
