import { Link } from 'wouter';
import { ConfusionMatrix, MetricBars } from '@/components/Charts';
import { Notice, PageHead, num, pct } from '@/components/ui';
import { useEvaluation } from '@/lib/api';
import { toProblem } from '@/lib/problem';

const CHART_METRICS = [{ key: 'accuracy', label: 'Accuracy' }, { key: 'precision', label: 'Precision' }, { key: 'recall', label: 'Recall' }, { key: 'f1', label: 'F1' }, { key: 'roc_auc', label: 'ROC-AUC' }];

export default function Evidence() {
  const q = useEvaluation();
  if (q.isPending) return <div className="page"><PageHead eyebrow="Evaluation" title="Evidence" /><div className="skeleton" style={{ height: 360 }} aria-label="Loading evaluation" /></div>;
  if (q.isError || !q.data) { const p = toProblem(q.error); return (<div className="page"><PageHead eyebrow="Evaluation" title="Evidence" />
    <Notice tone="bad" title="The evaluation report is unavailable">{p.message}{p.blockers && <ul>{p.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}<p style={{ marginTop: 8 }}><button className="btn sm" onClick={() => void q.refetch()}>Retry</button></p></Notice>
    <p className="muted" style={{ marginTop: 16 }}>No metrics are shown when the saved report cannot be read. Nothing is estimated or filled in.</p></div>); }
  const ev = q.data; const rows = ev.targets.map((t) => ({ target: t.target, values: CHART_METRICS.map((m) => ({ ...m, v: (t.metrics as Record<string, number | null | undefined>)[m.key] })) }));
  return (
    <div className="page">
      <PageHead eyebrow="Evaluation" title="Evidence">Metrics below are read from the saved evaluation report served by the API. They come from <b>nested, stratified cross-validation</b> on {ev.sample_count} retrospective rows — an internal estimate, not external validation.</PageHead>
      <Notice tone="warn" title="How to read these numbers">
        <ul><li><b>Shown:</b> nested out-of-fold estimates ({ev.validation_method}). The model family is chosen inside each training fold, so the outer folds are not used for selection.</li>
          <li><b>Not shown on purpose:</b> training-set performance, and full-cohort screening metrics used to choose the final serving family — those are optimistic.</li>
          <li><b>Served models</b> are refit on all rows; the numbers here estimate the <i>selection procedure</i>, not those exact final artifacts.</li></ul></Notice>

      <section className="section"><h2>Nested out-of-fold metrics by target</h2>
        <div className="panel panel-pad"><MetricBars rows={rows} metrics={CHART_METRICS} />
          <p className="muted" style={{ marginTop: 12, maxWidth: 760 }}>Overall CAD is estimated most reliably (ROC-AUC {num(ev.targets.find((t) => t.target === 'CAD')?.metrics.roc_auc, 2)}). LCX and RCA labels are much harder to predict from these inputs and are only modestly above chance on several metrics. With few positives per fold, expect wide uncertainty; no confidence intervals are saved, so none are drawn.</p></div>
      </section>

      <section className="section"><h2>Full table</h2>
        <div className="panel" style={{ overflowX: 'auto' }}><table className="table"><caption className="sr-only">Nested out-of-fold metrics by target</caption>
          <thead><tr><th>Target</th><th>Serving family</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>ROC-AUC</th><th>Balanced acc.</th><th>Brier</th></tr></thead>
          <tbody>{ev.targets.map((t) => (<tr key={t.target}><td><b>{t.target}</b></td><td>{t.model_family}</td><td>{pct(t.metrics.accuracy)}</td><td>{pct(t.metrics.precision)}</td><td>{pct(t.metrics.recall)}</td><td>{num(t.metrics.f1)}</td><td>{num(t.metrics.roc_auc)}</td><td>{pct(t.metrics.balanced_accuracy)}</td><td>{num(t.metrics.brier_score)}</td></tr>))}</tbody></table></div>
        <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>Thresholded metrics use a 0.5 software default, not a clinically validated operating point. The “model family” column is what the serving pipeline uses; per-fold selections can differ.</p>
      </section>

      <section className="section"><h2>Confusion matrices</h2>
        <p className="lede">Counts of out-of-fold predictions at threshold 0.5. Rows are the recorded class, columns the predicted class.</p>
        <div className="grid g4">{ev.targets.map((t) => (<div className="panel panel-pad" key={t.target}><h3 style={{ marginBottom: 10 }}>{t.target}</h3>
          {t.confusion_matrix ? <ConfusionMatrix m={t.confusion_matrix} pos={t.target === 'CAD' ? 'CAD' : 'Stenotic'} neg="Normal" /> : <p className="muted">No matrix saved.</p>}
          {t.confusion_matrix && <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>n = {t.confusion_matrix.flat().reduce((a, b) => a + b, 0)} · {t.fold_count} outer folds</p>}</div>))}</div>
      </section>

      <section className="section"><h2>Limits of this evidence</h2>
        <div className="prose"><ul>
          <li>Small, retrospective, single-source cohort ({ev.sample_count} rows); estimates are noisy and may not transport to other populations.</li>
          <li>No external, temporal or prospective validation. Cross-validation is internal.</li>
          <li>No calibration curve, ROC curve or confidence intervals are saved, so none are displayed. Brier score is the only calibration-related figure available.</li>
          <li>Variable definitions and units in the source workbook are not independently verified.</li></ul>
          <p>Details on the procedure are in <Link href="/methods">Methods &amp; limits</Link>.</p></div>
      </section>
    </div>
  );
}
