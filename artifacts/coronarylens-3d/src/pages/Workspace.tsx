import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Eye, Layers, Maximize2, Pencil, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Explanation, Target, TargetEvaluation } from '@workspace/api-client-react';
import HeartViewer, { type ViewerHandle } from '@/components/HeartViewer';
import { Notice, Pill, Spinner, num, pct } from '@/components/ui';
import { Ramp, ScoreBar, ShapBars } from '@/components/Charts';
import { LAYERS, NODE_BY_ID, TARGETS, scoreColor, type LayerId, type ModelTargetCode, type TargetCode } from '@/anatomy';
import { useArtifactStatus, useEvaluation, useSchema, useServiceStatus } from '@/lib/api';
import { completeness } from '@/lib/validate';
import { useSession } from '@/state/session';

export default function Workspace() {
  const s = useSession(); const schemaQ = useSchema(); const evalQ = useEvaluation(); const art = useArtifactStatus(); const svc = useServiceStatus();
  const viewer = useRef<ViewerHandle>(null);
  const [target, setTarget] = useState<TargetCode>('CAD'); const [nodeId, setNodeId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({ chambers: true, great_vessels: true, coronary: true, cardiac_veins: true });
  const [ghost, setGhost] = useState(false); const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');

  const comp = useMemo(() => completeness(schemaQ.data, s.values), [schemaQ.data, s.values]);
  const profileState: 'none' | 'incomplete' | 'ready' = comp.filled === 0 ? 'none' : comp.ready ? 'ready' : 'incomplete';
  const pred = s.prediction.status === 'success' ? s.prediction.data.data : undefined;
  const live = pred && !s.stale ? pred : undefined;
  const scores = useMemo(() => live ? { LAD: live.outputs.LAD.score, LCX: live.outputs.LCX.score, RCA: live.outputs.RCA.score } : undefined, [live]);
  const evalFor = (t: TargetCode): TargetEvaluation | undefined => evalQ.data?.targets.find((x) => x.target === t);
  const artifactsOk = svc.state === 'up' && art.state === 'ready';
  const canRun = profileState === 'ready' && artifactsOk && s.prediction.status !== 'loading' && !!schemaQ.data;

  const onSelect = useCallback((t: ModelTargetCode | null, id: string | null) => { setNodeId(id); if (t) setTarget(t); }, []);
  const choose = (t: TargetCode) => { setTarget(t); setNodeId(null); if (t === 'CAD') viewer.current?.focusTarget(null); };
  const sel = TARGETS.find((x) => x.code === target)!;
  const out = pred?.outputs[target]; const ev = evalFor(target); const exp = s.explanations[target as Target];
  const selNode = nodeId ? NODE_BY_ID.get(nodeId) : undefined;

  return (
    <div className="ws">
      <div className="ws-main">
        <div className="ws-bar" role="group" aria-label="Workspace status">
          <Pill tone={profileState === 'ready' ? 'ok' : profileState === 'none' ? 'none' : 'warn'} label="Profile" value={profileState === 'none' ? 'none loaded' : `${comp.valid}/${comp.total} valid`} />
          <Pill tone={artifactsOk ? 'ok' : svc.state === 'down' ? 'bad' : art.state === 'checking' ? 'busy' : 'warn'} label="Inference" value={svc.state === 'down' ? 'API unreachable' : art.state === 'ready' ? 'artifacts verified' : art.state === 'blocked' ? 'blocked' : 'checking'} />
          <Pill tone={s.prediction.status === 'loading' ? 'busy' : s.prediction.status === 'error' ? 'bad' : s.prediction.status === 'success' ? (s.stale ? 'warn' : 'ok') : 'none'} label="Prediction" value={s.prediction.status === 'success' ? (s.stale ? 'stale' : 'current') : s.prediction.status === 'idle' ? 'not run' : s.prediction.status} />
          {s.isDemo && <span className="badge synthetic" title="Median/mode profile derived from the training cohort. Not a real person.">SYNTHETIC DEMO PROFILE</span>}
          <span className="sep" />
          <Link href="/inputs" className="btn sm"><Pencil size={14} />Edit profile</Link>
        </div>
        <div className="viewer-wrap" style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <HeartViewer ref={viewer} selected={target === 'CAD' ? null : (target as ModelTargetCode)} scores={scores} layers={layers} ghost={ghost} onSelect={onSelect} onStatus={setView} />
          </div>
          <div className="viewer-ui" style={{ position: 'absolute' }}>
            <div className="toolbar" role="toolbar" aria-label="Camera controls">
              <button className="btn icon" onClick={() => viewer.current?.reset()} aria-label="Reset view" title="Reset view"><RotateCcw size={16} /></button>
              <button className="btn icon" onClick={() => viewer.current?.zoom(0.8)} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} /></button>
              <button className="btn icon" onClick={() => viewer.current?.zoom(1.25)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
              <button className="btn icon" onClick={() => viewer.current?.focusTarget(target === 'CAD' ? null : (target as ModelTargetCode))} aria-label="Focus selected artery" title="Focus selected artery"><Maximize2 size={16} /></button>
              <button className="btn icon" aria-pressed={ghost} onClick={() => setGhost((g) => !g)} aria-label="Translucent myocardium" title="Translucent myocardium"><Eye size={16} /></button>
            </div>
            <fieldset className="layers" style={{ margin: 0 }}>
              <legend className="sr-only">Visible structures</legend>
              <h4><Layers size={11} style={{ verticalAlign: -1 }} /> Structures</h4>
              {LAYERS.map((l) => (<label key={l.id}><input type="checkbox" checked={layers[l.id]} onChange={() => setLayers((p) => ({ ...p, [l.id]: !p[l.id] }))} />{l.label}</label>))}
            </fieldset>
            <div className="legend">
              <h4>{scores ? 'Artery colour = model score' : 'Arteries: no scores yet'}</h4>
              {scores ? (<><Ramp /><div className="ticks"><span>0.0</span><span>0.5</span><span>1.0</span></div>
                <p>Predicted-probability output for the “stenotic” label of each artery’s model. It is <b>not</b> a lesion location or a patient’s anatomy. CAD (overall) is not drawn on any artery.</p></>)
                : <p>Coronary tubes stay a neutral arterial red until a prediction exists. Geometry is a generic reference atlas heart, not patient-specific.</p>}
            </div>
          </div>
        </div>
      </div>

      <aside className="inspector" aria-label="Target inspector">
        <section className="insp-sec">
          <h3>Profile & run</h3>
          {profileState === 'none' && (<><p className="muted" style={{ marginBottom: 10 }}>No clinical profile is loaded. Load the synthetic demo profile or enter values.</p>
            <div className="btn-row"><button className="btn primary" onClick={() => void s.loadDemo()} disabled={s.demoState.status === 'loading'}>{s.demoState.status === 'loading' ? <Spinner /> : null}Load demo profile</button><Link href="/inputs" className="btn">Enter inputs</Link></div></>)}
          {profileState === 'incomplete' && (<><p className="muted" style={{ marginBottom: 10 }}>{comp.valid} of {comp.total} required fields are valid{comp.invalid ? ` · ${comp.invalid} outside range` : ''}. Predictions need a complete profile.</p><Link href="/inputs" className="btn primary">Complete inputs</Link></>)}
          {profileState === 'ready' && (<><p className="muted" style={{ marginBottom: 10 }}>{s.stale ? 'The profile changed after the last prediction. Run again to refresh.' : 'Profile is complete and passes schema validation.'}</p>
            <button className="btn primary lg" style={{ width: '100%' }} disabled={!canRun} onClick={() => schemaQ.data && void s.runPrediction(schemaQ.data)}>
              {s.prediction.status === 'loading' ? <><Spinner />Running models…</> : <><Play size={15} />{pred ? 'Run prediction again' : 'Run prediction'}</>}</button>
            {!artifactsOk && <div style={{ marginTop: 10 }}><Notice tone="warn" title={svc.state === 'down' ? 'API unreachable' : 'Model artifacts not verified'}>{svc.state === 'down' ? 'The service is not responding, so no prediction can be produced.' : art.state === 'blocked' ? <ul>{art.data?.blockers.map((b) => <li key={b}>{b}</li>)}</ul> : 'Readiness is still being checked.'}</Notice></div>}</>)}
          {s.demoState.status === 'error' && <div style={{ marginTop: 10 }}><Notice tone="bad" title="Demo profile unavailable">{s.demoState.problem.message}</Notice></div>}
          {s.prediction.status === 'error' && (<div style={{ marginTop: 10 }}><Notice tone="bad" title="Prediction failed — no fallback score was used">{s.prediction.problem.message}
            {s.prediction.problem.blockers && <ul>{s.prediction.problem.blockers.slice(0, 3).map((b) => <li key={b}>{b}</li>)}</ul>}<p style={{ marginTop: 6 }}>Your profile is unchanged. You can retry or edit it.</p></Notice></div>)}
        </section>

        <section className="insp-sec">
          <h3>Targets</h3>
          {TARGETS.map((t) => { const o = pred?.outputs[t.code]; return (
            <button key={t.code} className="trow" aria-pressed={target === t.code} onClick={() => choose(t.code)}>
              <span className="code">{t.code}</span>
              <span><span className="nm">{t.short === 'Overall' ? 'Overall CAD' : t.name}</span>{o && <ScoreBar score={o.score} />}</span>
              <span className="sc" style={{ color: o && !s.stale ? scoreColor(o.score) : 'var(--text-3)' }}>{o ? o.score.toFixed(2) : '—'}<small>{o ? (s.stale ? 'stale' : o.predicted_class) : 'not run'}</small></span>
            </button>); })}
        </section>

        <section className="insp-sec">
          <h3>{selNode && !selNode.target ? 'Anatomical structure' : `Inspector · ${target}`}</h3>
          {selNode && !selNode.target ? (<><strong>{selNode.label}</strong><p className="muted" style={{ marginTop: 6 }}>{selNode.note ?? 'Reference anatomy from the atlas model. No model output is associated with this structure.'}</p></>) : (() => {
            const rawOut = out as unknown as Record<string, unknown> | undefined;
            const riskBand = typeof rawOut?.risk_band === 'string' ? rawOut.risk_band : undefined;
            const opThresh = typeof rawOut?.operating_threshold === 'number' ? rawOut.operating_threshold : (out?.threshold ?? 0.5);
            return (<>
            <p className="muted">{sel.scope}</p>
            {target === 'CAD' && <p className="faint" style={{ marginTop: 6 }}>The overall CAD output is a dataset-level label and is intentionally not painted on any artery.</p>}
            <hr className="rule" />
            <dl className="kv">
              <dt>Probability</dt>
              <dd className="mono">
                {out ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ color: scoreColor(out.score) }}>{(out.score * 100).toFixed(1)}%</b>
                    {riskBand && (
                      <span className="badge sm" style={{
                        background: riskBand === 'High' ? 'rgba(240,113,111,0.2)' : riskBand === 'Moderate' ? 'rgba(231,182,90,0.2)' : 'rgba(63,214,198,0.2)',
                        color: riskBand === 'High' ? '#f0716f' : riskBand === 'Moderate' ? '#e7b65a' : '#3fd6c6',
                        border: '1px solid currentColor'
                      }}>
                        {riskBand} Risk
                      </span>
                    )}
                    {s.stale && <span className="faint">(stale)</span>}
                  </span>
                ) : 'not computed'}
              </dd>
              <dt>Calibration</dt>
              <dd>Fold-local Platt scaling (calibrated probability)</dd>
              <dt>Operating threshold</dt>
              <dd className="mono">
                <b>{Number(opThresh).toFixed(2)}</b>
                <span className="faint"> (Youden J optimal)</span>
              </dd>
              <dt>Decision at threshold</dt>
              <dd>
                <b style={{ color: out?.predicted_class === 'CAD' || out?.predicted_class === 'Stenotic' ? '#f0716f' : '#3fd6c6' }}>
                  {out?.predicted_class ?? '—'}
                </b>
              </dd>
              <dt>Serving Estimator</dt>
              <dd className="mono">{out?.model_family ?? ev?.model_family ?? '—'}</dd>
            </dl>
            {ev && (<><hr className="rule" /><div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>Repeated Nested CV Estimate (honest out-of-fold)</div>
              <div className="mstrip"><div><b>{num(ev.metrics.roc_auc, 3)}</b><span>ROC-AUC</span></div><div><b>{pct(ev.metrics.recall, 0)}</b><span>Recall</span></div><div><b>{pct(ev.metrics.precision, 0)}</b><span>Precision</span></div></div></>)}
            {evalQ.isError && <p className="faint" style={{ marginTop: 8 }}>Evaluation report unavailable from the API.</p>}
          </>);
          })()}
        </section>

        <section className="insp-sec">
          <h3>Model Explanation (SHAP Attributions)</h3>
          <ExplanationBlock state={exp} canAsk={!!pred && !s.stale && !!schemaQ.data && artifactsOk} stale={s.stale} hasPred={!!pred}
            onAsk={() => schemaQ.data && void s.explain(target as Target, schemaQ.data)} target={target} />
        </section>
        {view === 'error' && <section className="insp-sec"><Notice tone="warn" title="3D view unavailable">Scores and explanations above still work without the anatomy.</Notice></section>}
      </aside>
    </div>
  );
}

function ExplanationBlock({ state, canAsk, stale, hasPred, onAsk, target }: { state?: { status: string; data?: Explanation; problem?: { message: string; code?: string } }; canAsk: boolean; stale: boolean; hasPred: boolean; onAsk: () => void; target: string }) {
  if (!hasPred) return <p className="muted">Run a prediction first. Explanations are tied to one prediction request and its exact profile.</p>;
  if (stale) return <p className="muted">The profile changed since the prediction, so the earlier request can’t be explained. Run the prediction again.</p>;
  if (!state || state.status === 'idle') return <><p className="muted" style={{ marginBottom: 10 }}>Shows exact feature contributions moving the {target} prediction relative to cohort background data.</p><button className="btn" disabled={!canAsk} onClick={onAsk}>Explain {target} score</button></>;
  if (state.status === 'loading') return <div className="state-chip"><Spinner />Computing exact model-aware SHAP attributions…</div>;
  if (state.status === 'error') return <><Notice tone="bad" title="Explanation unavailable — nothing was fabricated">{state.problem?.message}</Notice><button className="btn sm" style={{ marginTop: 10 }} onClick={onAsk}>Retry</button></>;
  const d = state.data!;
  const rawData = d as unknown as Record<string, unknown>;
  const summary = rawData.summary as { raises?: Array<{ label: string; impact: number }>; lowers?: Array<{ label: string; impact: number }> } | undefined;
  const top = [...d.contributions].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 8);
  return (<>
    <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>
      Baseline {d.baseline_score.toFixed(3)} → Prediction {d.prediction_score.toFixed(3)} ({d.method})
    </div>

    {summary && (
      <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(13,20,32,0.8)', borderRadius: 6, border: '1px solid #1c2838', fontSize: 12 }}>
        {summary.raises && summary.raises.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#3fd6c6', fontWeight: 600 }}>Pushes risk up (+): </span>
            <span style={{ color: '#e8eef6' }}>{summary.raises.map((r) => r.label).join(', ')}</span>
          </div>
        )}
        {summary.lowers && summary.lowers.length > 0 && (
          <div>
            <span style={{ color: '#e7b65a', fontWeight: 600 }}>Pushes risk down (−): </span>
            <span style={{ color: '#e8eef6' }}>{summary.lowers.map((r) => r.label).join(', ')}</span>
          </div>
        )}
      </div>
    )}

    <ShapBars items={top.map((c) => ({ label: c.label, value: String(c.value), contribution: c.contribution }))} />
    <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
      <span style={{ color: '#3fd6c6' }}>■</span> pushes risk up · <span style={{ color: '#e7b65a' }}>■</span> pushes risk down
    </div>
    <div style={{ marginTop: 10 }}><Notice tone="info" title="Non-causal">{d.limitations[0]}</Notice></div>
  </>);
}
