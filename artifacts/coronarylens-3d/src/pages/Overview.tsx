import { Link } from 'wouter';
import { ArrowRight, Beaker } from 'lucide-react';
import HeartViewer from '@/components/HeartViewer';
import { Notice, Spinner } from '@/components/ui';
import { TARGETS } from '@/anatomy';
import { useEvaluation } from '@/lib/api';
import { useSession } from '@/state/session';
import { useLocation } from 'wouter';

const BLURB: Record<string, string> = {
  CAD: 'Overall coronary artery disease label (the dataset’s Cath field). A cohort-level outcome, not a vessel.',
  LAD: 'Stenotic vs. normal label for the left anterior descending artery.',
  LCX: 'Stenotic vs. normal label for the left circumflex artery.',
  RCA: 'Stenotic vs. normal label for the right coronary artery.',
};

export default function Overview() {
  const s = useSession(); const ev = useEvaluation(); const [, nav] = useLocation();
  const start = async () => { await s.loadDemo(); nav('/workspace'); };
  return (<>
    <section className="hero">
      <div>
        <div className="eyebrow">Cardiovascular research workstation</div>
        <h1>Coronary artery outcome models, <em>beside real anatomy.</em></h1>
        <p className="sub">CoronaryLens-3D trains and inspects small-cohort classifiers for overall CAD and LAD, LCX and RCA stenosis labels, then lets you examine each score on an anatomical atlas heart with its coronary tree. A research prototype: scores are model outputs, not findings.</p>
        <div className="btn-row">
          <button className="btn primary lg" onClick={() => void start()} disabled={s.demoState.status === 'loading'}>{s.demoState.status === 'loading' ? <Spinner /> : <Beaker size={16} />}Try the synthetic demo</button>
          <Link href="/inputs" className="btn lg">Enter clinical inputs<ArrowRight size={16} /></Link>
        </div>
        {s.demoState.status === 'error' && <div style={{ marginTop: 14 }}><Notice tone="bad" title="Demo profile unavailable">{s.demoState.problem.message}</Notice></div>}
      </div>
      <div className="hero-viewer" aria-label="Anatomical preview"><HeartViewer showLabels={false} interactive /></div>
    </section>

    <div className="page" style={{ paddingTop: 12 }}>
      <section className="section" style={{ marginTop: 8 }}>
        <h2>Four output targets</h2>
        <p className="lede">Each target has its own model. Scores are shown per target; they are never combined into a single “risk”.</p>
        <div className="grid g4">{TARGETS.map((t) => (<div key={t.code} className="panel target-card"><span className="tcode">{t.code}</span><span className="tname">{t.name}</span><p>{BLURB[t.code]}</p></div>))}</div>
      </section>

      <section className="section">
        <h2>Where the numbers come from</h2>
        <div className="grid g2">
          <div className="panel panel-pad"><h3>Dataset provenance</h3><p className="muted" style={{ margin: '8px 0 12px' }}>UCI Machine Learning Repository, “Extension of Z-Alizadeh Sani dataset” (#411), CC BY 4.0. Retrospective, single-source, 303 rows.</p>
            <div className="grid g3"><div className="stat"><b>303</b><span>patients (rows)</span></div><div className="stat"><b>55</b><span>predictors after excluding outcomes</span></div><div className="stat"><b>4</b><span>outcome columns held out</span></div></div></div>
          <div className="panel panel-pad"><h3>Internal validation summary</h3>
            {ev.isPending ? <div className="skeleton" style={{ height: 96, marginTop: 10 }} /> : ev.isError || !ev.data ? <p className="muted" style={{ marginTop: 8 }}>The evaluation report is unavailable from the API right now.</p> : (<>
              <p className="muted" style={{ margin: '8px 0 12px' }}>{ev.data.validation_method}. Nested out-of-fold ROC-AUC:</p>
              <div className="grid g4">{ev.data.targets.map((t) => (<div className="stat" key={t.target}><b>{t.metrics.roc_auc?.toFixed(2) ?? '—'}</b><span>{t.target}</span></div>))}</div></>)}
            <p className="faint" style={{ marginTop: 12, fontSize: 12 }}>Internal cross-validation only. No external or prospective validation.</p></div>
        </div>
      </section>

      <section className="section">
        <h2>How a session works</h2>
        <ol className="flow" style={{ padding: 0, margin: 0 }}>
          <li><b>Provide a profile</b>Load the synthetic demo or enter the 55 source-schema fields.</li>
          <li><b>Run the models</b>The API validates the profile and runs the four served pipelines.</li>
          <li><b>Inspect on anatomy</b>Select LAD, LCX or RCA to focus the camera and see that model’s score.</li>
          <li><b>Check the evidence</b>Read the explanation, nested evaluation and stated limits.</li>
        </ol>
      </section>
      <section className="section"><Notice tone="warn" title="Research use only">Not clinically validated, not a medical device, and no external validation has been performed. The anatomy is a generic reference model; the scores do not localize lesions or describe any individual’s arteries.</Notice></section>
    </div>
  </>);
}
