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

export function CalibrationCurve({ data, target }: { data: { mean_pred: number[]; frac_pos: number[]; n: number[] }; target: string }) {
  const W = 320, H = 240, L = 40, R = 15, T = 15, B = 35;
  const iw = W - L - R, ih = H - T - B;
  const x = (v: number) => L + iw * v;
  const y = (v: number) => T + ih * (1 - v);

  const points = data.mean_pred.map((p, i) => ({ px: x(p), py: y(data.frac_pos[i]), p, f: data.frac_pos[i], n: data.n[i] }));
  const pathD = points.length > 0 ? points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.px} ${pt.py}`).join(' ') : '';

  return (
    <div className="curve-card">
      <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#e8eef6' }}>{target} · Calibration Curve</h4>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: 'rgba(13,20,32,0.6)', borderRadius: 6 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#213043" strokeDasharray={t === 0 ? '' : '2 3'} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#758ea8">{t.toFixed(2)}</text>
            <line x1={x(t)} x2={x(t)} y1={T} y2={H - B} stroke="#213043" strokeDasharray={t === 0 ? '' : '2 3'} />
            <text x={x(t)} y={H - B + 14} textAnchor="middle" fontSize="10" fill="#758ea8">{t.toFixed(2)}</text>
          </g>
        ))}
        {/* Ideal 45-degree diagonal */}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#59708b" strokeDasharray="4 4" strokeWidth="1.2" />
        {/* Fitted calibration path */}
        {pathD && <path d={pathD} fill="none" stroke="#3fd6c6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
        {/* Bin points */}
        {points.map((pt, i) => (
          <circle key={i} cx={pt.px} cy={pt.py} r={Math.max(3, Math.min(6, Math.sqrt(pt.n)))} fill="#3fd6c6" stroke="#0a121d" strokeWidth="1.5">
            <title>{`Pred: ${pt.p.toFixed(3)}, Obs: ${pt.f.toFixed(3)}, n=${pt.n}`}</title>
          </circle>
        ))}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#9db0c4">Mean Predicted Probability</text>
        <text x={12} y={T + ih / 2} transform={`rotate(-90 12 ${T + ih / 2})`} textAnchor="middle" fontSize="10" fill="#9db0c4">Fraction Positive</text>
      </svg>
      <div className="faint" style={{ fontSize: 11, marginTop: 4, textAlign: 'center' }}>
        Dashed line = perfectly calibrated reference
      </div>
    </div>
  );
}

export function RocCurve({ data, target, auc }: { data: { fpr: number[]; tpr: number[] }; target: string; auc?: number }) {
  const W = 320, H = 240, L = 40, R = 15, T = 15, B = 35;
  const iw = W - L - R, ih = H - T - B;
  const x = (v: number) => L + iw * v;
  const y = (v: number) => T + ih * (1 - v);

  const points = data.fpr.map((f, i) => ({ px: x(f), py: y(data.tpr[i]) }));
  const pathD = points.length > 0 ? points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.px} ${pt.py}`).join(' ') : '';
  const areaD = points.length > 0 ? `${pathD} L ${x(1)} ${y(0)} L ${x(0)} ${y(0)} Z` : '';

  return (
    <div className="curve-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 6px' }}>
        <h4 style={{ margin: 0, fontSize: 13, color: '#e8eef6' }}>{target} · ROC Curve</h4>
        {auc != null && <span className="mono" style={{ fontSize: 12, color: '#74a9f2' }}>AUC: {auc.toFixed(3)}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: 'rgba(13,20,32,0.6)', borderRadius: 6 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#213043" strokeDasharray={t === 0 ? '' : '2 3'} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#758ea8">{t.toFixed(2)}</text>
            <line x1={x(t)} x2={x(t)} y1={T} y2={H - B} stroke="#213043" strokeDasharray={t === 0 ? '' : '2 3'} />
            <text x={x(t)} y={H - B + 14} textAnchor="middle" fontSize="10" fill="#758ea8">{t.toFixed(2)}</text>
          </g>
        ))}
        {/* Diagonal chance line */}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#59708b" strokeDasharray="4 4" strokeWidth="1.2" />
        {/* Shaded AUC Area */}
        {areaD && <path d={areaD} fill="rgba(116, 169, 242, 0.12)" />}
        {/* ROC curve */}
        {pathD && <path d={pathD} fill="none" stroke="#74a9f2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#9db0c4">False Positive Rate (1 - Specificity)</text>
        <text x={12} y={T + ih / 2} transform={`rotate(-90 12 ${T + ih / 2})`} textAnchor="middle" fontSize="10" fill="#9db0c4">True Positive Rate (Sensitivity)</text>
      </svg>
      <div className="faint" style={{ fontSize: 11, marginTop: 4, textAlign: 'center' }}>
        Dashed line = random chance (AUC 0.50)
      </div>
    </div>
  );
}

export function GlobalImportanceBars({ items }: { items: { feature: string; mean_abs: number; share: number }[] }) {
  const maxShare = Math.max(...items.map((i) => i.share), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((i) => (
        <div key={i.feature} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 50px', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={i.feature}>{i.feature}</span>
          <div style={{ height: 10, background: '#1c2838', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(i.share / maxShare) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #3fd6c6, #74a9f2)', borderRadius: 3 }} />
          </div>
          <span className="mono" style={{ textAlign: 'right', color: '#9db0c4' }}>{i.share.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

