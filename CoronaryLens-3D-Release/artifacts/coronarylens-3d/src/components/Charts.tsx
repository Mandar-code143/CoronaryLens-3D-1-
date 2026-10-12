import { SCORE_RAMP, scoreColor } from '@/anatomy';

export interface MetricRow { target: string; values: { key: string; label: string; v: number | null | undefined }[] }
const SERIES = ['#3fd6c6', '#74a9f2', '#e7b65a', '#c58bd8', '#f0716f'];

/** Grouped bar chart. Axis fixed to 0–1 so bars are never visually exaggerated. */
export function MetricBars({ rows, metrics }: { rows: MetricRow[]; metrics: { key: string; label: string }[] }) {
  const W = 760, H = 300, L = 44, R = 12, T = 14, B = 44; const iw = W - L - R, ih = H - T - B;
  const gw = iw / rows.length; const bw = Math.min(22, (gw - 18) / metrics.length);
  const y = (v: number) => T + ih * (1 - v);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Grouped bar chart of ${metrics.map((m) => m.label).join(', ')} for each target`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (<g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#213043" strokeDasharray={t === 0 ? '' : '3 4'} /><text x={L - 8} y={y(t) + 4} textAnchor="end">{t.toFixed(2)}</text></g>))}
        {rows.map((r, i) => {
          const x0 = L + i * gw + (gw - bw * metrics.length) / 2;
          return (<g key={r.target}>
            {metrics.map((m, j) => { const v = r.values.find((x) => x.key === m.key)?.v; if (v == null) return null; return (
              <g key={m.key}><rect x={x0 + j * bw} y={y(v)} width={bw - 2} height={ih * v} rx={2} fill={SERIES[j % SERIES.length]}><title>{`${r.target} ${m.label}: ${v.toFixed(3)}`}</title></rect></g>); })}
            <text x={L + i * gw + gw / 2} y={H - 22} textAnchor="middle" style={{ fill: '#e8eef6', fontWeight: 600 }}>{r.target}</text>
          </g>);
        })}
        <text x={14} y={T + ih / 2} transform={`rotate(-90 14 ${T + ih / 2})`} textAnchor="middle">score (0–1)</text>
      </svg>
      <div className="btn-row" style={{ gap: 16, marginTop: 8 }}>
        {metrics.map((m, j) => (<span key={m.key} className="state-chip"><i style={{ width: 10, height: 10, borderRadius: 2, background: SERIES[j % SERIES.length], display: 'inline-block' }} />{m.label}</span>))}
      </div>
    </div>
  );
}

export function ConfusionMatrix({ m, pos, neg }: { m: number[][]; pos: string; neg: string }) {
  // Saved layout: rows = true class [negative, positive], columns = predicted [negative, positive].
  const max = Math.max(...m.flat()); const shade = (v: number, good: boolean) => `rgba(${good ? '63,214,198' : '240,113,111'},${0.1 + 0.5 * (v / max)})`;
  return (
    <div className="cm" role="table" aria-label={`Confusion matrix, rows true class, columns predicted class`}>
      <div className="h" /><div className="h">pred. {neg}</div><div className="h">pred. {pos}</div>
      <div className="h">true {neg}</div><div style={{ background: shade(m[0][0], true) }}>{m[0][0]}</div><div style={{ background: shade(m[0][1], false) }}>{m[0][1]}</div>
      <div className="h">true {pos}</div><div style={{ background: shade(m[1][0], false) }}>{m[1][0]}</div><div style={{ background: shade(m[1][1], true) }}>{m[1][1]}</div>
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  return <div className="bar-track" aria-hidden><i style={{ width: `${Math.round(score * 100)}%`, background: scoreColor(score) }} /></div>;
}
export function Ramp() { return <div className="ramp" style={{ background: `linear-gradient(90deg, ${SCORE_RAMP.join(',')})` }} aria-hidden />; }

export function ShapBars({ items }: { items: { label: string; value: string; contribution: number }[] }) {
  const max = Math.max(...items.map((i) => Math.abs(i.contribution)), 1e-9);
  return (
    <div role="list" aria-label="Feature contributions">
      {items.map((i) => { const w = (Math.abs(i.contribution) / max) * 50; const pos = i.contribution >= 0; return (
        <div className="shap-row" role="listitem" key={i.label} title={`${i.label} = ${i.value}`}>
          <span className="lab">{i.label} <span className="faint">= {i.value}</span></span>
          <span className="shap-bar" aria-hidden><i style={{ width: `${w}%`, left: pos ? '50%' : `${50 - w}%`, background: pos ? '#3fd6c6' : '#e7b65a' }} /></span>
          <span className="v">{pos ? '+' : '−'}{Math.abs(i.contribution).toFixed(3)}</span>
        </div>); })}
    </div>
  );
}
