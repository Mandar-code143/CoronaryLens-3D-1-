import { useState } from 'react';
import { Link } from 'wouter';
import { CalibrationCurve, ConfusionMatrix, GlobalImportanceBars, MetricBars, RocCurve } from '@/components/Charts';
import { Notice, PageHead, Pill, num, pct } from '@/components/ui';
import { useEvaluation, useEvaluationDetails } from '@/lib/api';
import { toProblem } from '@/lib/problem';

const CHART_METRICS = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'precision', label: 'Precision' },
  { key: 'recall', label: 'Recall' },
  { key: 'f1', label: 'F1' },
  { key: 'roc_auc', label: 'ROC-AUC' },
];

export default function Evidence() {
  const q = useEvaluation();
  const detQ = useEvaluationDetails();
  const [selectedTarget, setSelectedTarget] = useState<'CAD' | 'LAD' | 'LCX' | 'RCA'>('CAD');

  if (q.isPending) {
    return (
      <div className="page">
        <PageHead eyebrow="Evaluation" title="Evidence" />
        <div className="skeleton" style={{ height: 360 }} aria-label="Loading evaluation" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    const p = toProblem(q.error);
    return (
      <div className="page">
        <PageHead eyebrow="Evaluation" title="Evidence" />
        <Notice tone="bad" title="The evaluation report is unavailable">
          {p.message}
          {p.blockers && <ul>{p.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          <p style={{ marginTop: 8 }}><button className="btn sm" onClick={() => void q.refetch()}>Retry</button></p>
        </Notice>
        <p className="muted" style={{ marginTop: 16 }}>No metrics are shown when the saved report cannot be read. Nothing is estimated or filled in.</p>
      </div>
    );
  }

  const ev = q.data;
  const details = detQ.data;
  const rows = ev.targets.map((t) => ({
    target: t.target,
    values: CHART_METRICS.map((m) => ({ ...m, v: (t.metrics as Record<string, number | null | undefined>)[m.key] })),
  }));

  const activeDetailTarget = details?.targets?.find((t: { target: string }) => t.target === selectedTarget);

  return (
    <div className="page">
      <PageHead eyebrow="Rigorous Validation" title="Clinical Evidence & Diagnostics">
        Comprehensive statistical evaluation of CoronaryLens 3D using <b>repeated nested stratified cross-validation</b>, <b>fold-local Platt calibration</b>, <b>Youden J threshold optimization</b>, and <b>patient-level bootstrap uncertainty estimation (500 resamples)</b> on the {ev.sample_count}-patient retrospective cohort.
      </PageHead>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <Pill tone="ok" label="Validation Protocol" value="3x Repeated 5-Fold Nested CV" />
        <Pill tone="ok" label="Candidate Selection" value="3-Fold Inner Cross-Fitting" />
        <Pill tone="ok" label="Probability Calibration" value="Platt Sigmoid Scaling" />
        <Pill tone="ok" label="Decision Points" value="Youden J Operating Points" />
        <Pill tone="ok" label="Uncertainty" value="95% Bootstrap CI (B=500)" />
      </div>

      <Notice tone="warn" title="Scientific Interpretation & Honest Internal Validation">
        <ul>
          <li><b>Strict Inner Selection:</b> Candidate model algorithms were selected strictly inside inner cross-validation folds. The outer evaluation folds were never used to tune or select models, preventing selection bias.</li>
          <li><b>Cross-Fitted Calibration & Thresholding:</b> Platt scaling and Youden thresholding were fitted on honest out-of-fold predictions to prevent probability leakage.</li>
          <li><b>Internal vs. External Validation:</b> Internal cross-validation estimates generalization within this cohort. External multicenter validation is required prior to any clinical translation.</li>
        </ul>
      </Notice>

      {/* Target Metrics Overview */}
      <section className="section">
        <h2>Nested Out-of-Fold Performance by Target</h2>
        <div className="panel panel-pad">
          <MetricBars rows={rows} metrics={CHART_METRICS} />
          <p className="muted" style={{ marginTop: 12, maxWidth: 840 }}>
            Overall CAD exhibits highest discriminative power (ROC-AUC {num(ev.targets.find((t) => t.target === 'CAD')?.metrics.roc_auc, 3)}), driven by strong multi-vessel clinical predictors. Individual vessel stenosis (LAD, LCX, RCA) presents higher diagnostic difficulty and reflects genuine anatomical divergence in retrospective catheterization datasets.
          </p>
        </div>
      </section>

      {/* Detailed Metrics Table with 95% Confidence Intervals */}
      <section className="section">
        <h2>Performance Table with 95% Bootstrap Confidence Intervals</h2>
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table className="table">
            <caption className="sr-only">Nested out-of-fold metrics with 95% confidence intervals</caption>
            <thead>
              <tr>
                <th>Target</th>
                <th>Serving Estimator</th>
                <th>Operating Threshold</th>
                <th>ROC-AUC (95% CI)</th>
                <th>Sensitivity / Recall</th>
                <th>Specificity</th>
                <th>Precision</th>
                <th>Accuracy</th>
                <th>F1 Score</th>
                <th>Brier Score</th>
              </tr>
            </thead>
            <tbody>
              {ev.targets.map((t) => {
                const dt = details?.targets?.find((x: { target: string }) => x.target === t.target);
                const ci = dt?.metrics?.ci_95;
                const opThresh = dt?.operating_threshold ?? 0.50;
                return (
                  <tr key={t.target}>
                    <td><b>{t.target}</b></td>
                    <td className="mono" style={{ fontSize: 12 }}>{dt?.serving_model_family ?? t.model_family}</td>
                    <td>
                      <span className="badge" style={{ background: '#1c2838', border: '1px solid #2f435c', color: '#3fd6c6' }}>
                        {opThresh.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <b>{num(t.metrics.roc_auc, 3)}</b>
                      {ci?.roc_auc && (
                        <div className="faint" style={{ fontSize: 11 }}>[{num(ci.roc_auc[0], 2)} – {num(ci.roc_auc[1], 2)}]</div>
                      )}
                    </td>
                    <td>
                      {pct(t.metrics.recall)}
                      {ci?.recall && (
                        <div className="faint" style={{ fontSize: 11 }}>[{pct(ci.recall[0])} – {pct(ci.recall[1])}]</div>
                      )}
                    </td>
                    <td>
                      {pct(t.metrics.specificity)}
                      {ci?.specificity && (
                        <div className="faint" style={{ fontSize: 11 }}>[{pct(ci.specificity[0])} – {pct(ci.specificity[1])}]</div>
                      )}
                    </td>
                    <td>
                      {pct(t.metrics.precision)}
                      {ci?.precision && (
                        <div className="faint" style={{ fontSize: 11 }}>[{pct(ci.precision[0])} – {pct(ci.precision[1])}]</div>
                      )}
                    </td>
                    <td>
                      {pct(t.metrics.accuracy)}
                      {ci?.accuracy && (
                        <div className="faint" style={{ fontSize: 11 }}>[{pct(ci.accuracy[0])} – {pct(ci.accuracy[1])}]</div>
                      )}
                    </td>
                    <td>{num(t.metrics.f1, 3)}</td>
                    <td className="mono">{num(t.metrics.brier_score, 3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>
          95% confidence intervals derived from 500 patient-level non-parametric bootstrap resamples on honest out-of-fold predictions. Operating thresholds optimized via Youden’s J statistic to balance clinical sensitivity and specificity.
        </p>
      </section>

      {/* Target Selector for Deep Diagnostics */}
      <section className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2>Deep Vessel Diagnostics & Curves</h2>
          <div className="btn-row" style={{ margin: 0 }}>
            {(['CAD', 'LAD', 'LCX', 'RCA'] as const).map((tgt) => (
              <button
                key={tgt}
                className={`btn sm ${selectedTarget === tgt ? 'primary' : ''}`}
                onClick={() => setSelectedTarget(tgt)}
              >
                {tgt}
              </button>
            ))}
          </div>
        </div>

        {activeDetailTarget ? (
          <div className="grid g2" style={{ gap: 20 }}>
            {/* Calibration Curve */}
            {activeDetailTarget.curves?.calibration ? (
              <div className="panel panel-pad">
                <CalibrationCurve
                  data={activeDetailTarget.curves.calibration}
                  target={selectedTarget}
                />
                <div style={{ marginTop: 12, fontSize: 12, color: '#9db0c4' }}>
                  <b>Calibration Diagnostics:</b>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                    <span>Raw Brier: <b>{num(activeDetailTarget.raw_calibration?.raw_brier, 3)}</b></span>
                    <span>Calibrated Brier: <b>{num(activeDetailTarget.raw_calibration?.calibrated_brier, 3)}</b></span>
                    <span>Raw ECE: <b>{num(activeDetailTarget.raw_calibration?.raw_ece, 3)}</b></span>
                    <span>Calibrated ECE: <b>{num(activeDetailTarget.raw_calibration?.calibrated_ece, 3)}</b></span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ROC Curve */}
            {activeDetailTarget.curves?.roc ? (
              <div className="panel panel-pad">
                <RocCurve
                  data={activeDetailTarget.curves.roc}
                  target={selectedTarget}
                  auc={activeDetailTarget.metrics?.roc_auc}
                />
                <div style={{ marginTop: 12, fontSize: 12, color: '#9db0c4' }}>
                  <b>Operating Threshold:</b> τ = <b>{activeDetailTarget.operating_threshold?.toFixed(2)}</b> (Youden J optimal)
                  <span style={{ marginLeft: 16 }}>Software default: τ = 0.50</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="panel panel-pad">
            <p className="muted">Detailed curves are loading from the research evaluation artifact...</p>
          </div>
        )}
      </section>

      {/* Threshold Tradeoffs & Global Feature Importance */}
      {activeDetailTarget && (
        <div className="grid g2" style={{ gap: 20, marginBottom: 32 }}>
          {/* Threshold Tradeoffs Table */}
          {activeDetailTarget.threshold_tradeoffs ? (
            <div className="panel panel-pad">
              <h3 style={{ marginBottom: 10 }}>{selectedTarget} · Operating Threshold Trade-offs</h3>
              <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
                Sensitivity vs. specificity across decision thresholds. Lower thresholds prioritize sensitivity (ruling out stenosis), higher thresholds prioritize precision.
              </p>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Threshold</th>
                    <th>Sensitivity</th>
                    <th>Specificity</th>
                    <th>Precision</th>
                    <th>Accuracy</th>
                    <th>F1</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDetailTarget.threshold_tradeoffs.map((row: { threshold: number; sensitivity: number; specificity: number; precision: number; accuracy: number; f1: number }) => (
                    <tr
                      key={row.threshold}
                      style={{
                        background: Math.abs(row.threshold - (activeDetailTarget.operating_threshold ?? 0.5)) < 0.06 ? 'rgba(63,214,198,0.08)' : undefined,
                      }}
                    >
                      <td>
                        <b>{row.threshold.toFixed(2)}</b>
                        {Math.abs(row.threshold - (activeDetailTarget.operating_threshold ?? 0.5)) < 0.06 && (
                          <span className="badge sm" style={{ marginLeft: 6, background: '#3fd6c6', color: '#09101a' }}>Youden</span>
                        )}
                      </td>
                      <td>{pct(row.sensitivity)}</td>
                      <td>{pct(row.specificity)}</td>
                      <td>{pct(row.precision)}</td>
                      <td>{pct(row.accuracy)}</td>
                      <td>{num(row.f1, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Global Feature Importance */}
          {activeDetailTarget.global_importance ? (
            <div className="panel panel-pad">
              <h3 style={{ marginBottom: 10 }}>{selectedTarget} · Top Global Predictors (SHAP)</h3>
              <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
                Mean absolute SHAP value share (%) across the patient cohort, reflecting overall model sensitivity to each clinical feature.
              </p>
              <GlobalImportanceBars items={activeDetailTarget.global_importance.slice(0, 8)} />
            </div>
          ) : null}
        </div>
      )}

      {/* Confusion Matrices */}
      <section className="section">
        <h2>Confusion Matrices at Out-of-Fold Operating Points</h2>
        <p className="lede">
          Out-of-fold prediction counts. Rows are the true clinical catheterization diagnosis, columns are the model classification.
        </p>
        <div className="grid g4">
          {ev.targets.map((t) => {
            const dt = details?.targets?.find((x: { target: string }) => x.target === t.target);
            const matrix = dt?.confusion_matrix ?? t.confusion_matrix;
            return (
              <div className="panel panel-pad" key={t.target}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ margin: 0 }}>{t.target}</h3>
                  {dt?.operating_threshold && (
                    <span className="badge sm mono" style={{ background: '#1c2838', color: '#3fd6c6' }}>
                      τ={dt.operating_threshold.toFixed(2)}
                    </span>
                  )}
                </div>
                {matrix ? (
                  <ConfusionMatrix
                    m={matrix}
                    pos={t.target === 'CAD' ? 'CAD' : 'Stenotic'}
                    neg="Normal"
                  />
                ) : (
                  <p className="muted">No matrix saved.</p>
                )}
                {matrix && (
                  <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>
                    n = {matrix.flat().reduce((a: number, b: number) => a + b, 0)} · {t.fold_count} folds
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Limits and Clinical Governance */}
      <section className="section">
        <h2>Limits &amp; Clinical Governance</h2>
        <div className="prose">
          <ul>
            <li><b>Retrospective Single-Center Cohort:</b> Evaluated on the 303-patient Z-Alizadeh Sani cohort (Tehran Heart Center). Multicenter demographic shift can impact diagnostic accuracy.</li>
            <li><b>Invasive Angiography Gold Standard:</b> Catheterization (stenosis &ge; 50%) served as the diagnostic reference standard.</li>
            <li><b>Correlations vs. Causation:</b> SHAP attributions quantify model sensitivity, not physiological causality or therapeutic response.</li>
            <li><b>Intended Use:</b> Designed as an investigative decision-support research workstation, not an autonomous diagnostic instrument.</li>
          </ul>
          <p>Full methodological protocol details are documented in <Link href="/methods">Methods &amp; Limits</Link>.</p>
        </div>
      </section>
    </div>
  );
}
