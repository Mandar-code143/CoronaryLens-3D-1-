import { Link } from 'wouter';
import { Notice, PageHead } from '@/components/ui';
import { useRegistry } from '@/lib/api';

const TOC = [['data', 'Dataset & targets'], ['leak', 'Leakage prevention'], ['train', 'Training & validation'], ['score', 'Score semantics'], ['shap', 'Explanations'], ['anat', 'Anatomy & visualization'], ['status', 'Application states'], ['scope', 'Research-only status']];

export default function Methods() {
  const reg = useRegistry();
  return (
    <div className="page">
      <PageHead eyebrow="Documentation" title="Methods & limits">How the models were built, what the scores mean, and what the visualization does and does not show. This page describes the code in this repository.</PageHead>
      <div className="methods-layout">
        <nav className="toc" aria-label="On this page">{TOC.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}</nav>
        <article className="prose">
          <section id="data"><h3>Dataset & target mapping</h3>
            <p>Source: UCI Machine Learning Repository #411, <i>Extension of Z-Alizadeh Sani dataset</i> (CC BY 4.0, DOI 10.24432/C5461K). The workbook has <strong>303 rows and 59 columns</strong>: 55 predictors and four outcome columns (<code>Cath</code>, <code>LAD</code>, <code>LCX</code>, <code>RCA</code>).</p>
            <p><strong>CAD ← Cath.</strong> There is no separate CAD column; the <code>Cath</code> field holds CAD/Normal labels and is mapped to the CAD target (216 CAD, 87 Normal). LAD, LCX and RCA are Stenotic/Normal.</p>
            <p><strong>54 vs. 55 predictors.</strong> An earlier brief expected 54. The workbook actually yields 55 once all outcome columns are removed, and the schema keeps all 55 rather than dropping one to match the brief.</p>
            <p><strong>Recorded label disagreement.</strong> One row has a CAD label that disagrees with “any stenotic vessel”. It is <em>reported and retained</em>, not silently corrected (see <code>data/processed/data_audit.json</code>). The only value normalisation applied is a display typo (<code>Fmale</code> → <code>Female</code>).</p></section>
          <section id="leak"><h3>Predictor exclusion & leakage prevention</h3>
            <p><code>CAD</code>, <code>Cath</code>, <code>LAD</code>, <code>LCX</code> and <code>RCA</code> are excluded from predictors at data preparation, in the served schema, and again at the API, which rejects requests containing any of them. Preprocessing (median/mode imputation, standard scaling, one-hot encoding with unknown categories ignored) is part of each pipeline and therefore refit on training data only inside every validation fold.</p></section>
          <section id="train"><h3>Training & nested validation</h3>
            <p>Four candidate families per target: logistic regression, random forest, extra trees and RBF-SVM (all class-balanced). Headline metrics use <strong>5-fold nested stratified cross-validation</strong> (seed 1431): within each outer training fold, a 3-fold inner CV picks the candidate by ROC-AUC, and only the untouched outer fold is scored.</p>
            <p>The serving family for each target was chosen by full-cohort out-of-fold ROC-AUC and then refit on all 303 rows. That screening step is subject to selection optimism, so its metrics are <strong>not</strong> reported as held-out performance; the nested numbers estimate the whole procedure.</p>
            {reg.data && <p className="faint">Registry <code>{reg.data.version}</code> · serving: {reg.data.targets.map((t) => `${t.target} → ${t.model_family}`).join(' · ')}</p>}
            {reg.isError && <Notice tone="warn" title="Registry unavailable">The model registry could not be read from the API; serving families are not shown here.</Notice>}</section>
          <section id="score"><h3>Score semantics & thresholds</h3>
            <p>Each score is the model’s predicted-probability output for the positive label (“CAD” or “Stenotic”), in 0–1. These probabilities are <strong>uncalibrated</strong> and are not an individual’s clinical risk. The 0.5 threshold that yields a class label is a software default, not a medically approved decision point. A score is a statement about a model and a cohort, not about a lesion.</p></section>
          <section id="shap"><h3>Approximate permutation SHAP</h3>
            <p>An explanation is requested for a specific prediction and is rejected unless the request ID and the exact profile match. Values are <strong>approximate permutation SHAP</strong>, grouped by source predictor, relative to the mean model output over a fixed-seed background of at most 60 observed cohort profiles. Grouped values add up to the prediction minus that baseline (the residual is returned).</p>
            <ul><li>They describe model behaviour, <strong>not causal effects</strong> or medical reasons.</li><li>Masking features independently can create unrealistic combinations when predictors are correlated.</li><li>Summing one-hot columns can hide within-category detail.</li></ul></section>
          <section id="anat"><h3>Anatomical visualization</h3>
            <p>The 3D scene is a <strong>generic reference atlas heart</strong> from Z-Anatomy (derived from BodyParts3D, CC BY-SA): four chambers, aorta and arch branches, pulmonary trunk and arteries, venae and pulmonary veins, the left main, LAD, LCX and RCA with named branches, and the principal cardiac veins. Coronary tube calibre was scaled 1.8× for legibility. Valves and papillary muscles are not shown.</p>
            <ul><li>It is <strong>not patient-specific</strong>; no imaging was used.</li><li>Artery colour encodes that artery’s model score only. It does not show a stenosis, blockage or location.</li><li>CAD (overall) is never painted on an artery.</li><li>Branch coverage is limited to what the atlas provides (for example, no diagonal or obtuse-marginal branches are individually named).</li></ul></section>
          <section id="status"><h3>Application states are separate</h3>
            <p>“API reachable” (HTTP liveness), “model artifacts verified” (checksums, registry, evaluation, inference adapter), “profile valid”, “prediction current” and “explanation available” are independent. A healthy API never implies a usable model, and a failed request never substitutes placeholder scores. See <Link href="/workspace">Model workspace</Link>.</p></section>
          <section id="scope"><h3>Research-only status</h3>
            <Notice tone="warn" title="Not for clinical use">The models are trained on a small public retrospective cohort, validated only internally, and have no regulatory clearance. Do not use any output for diagnosis, treatment or risk communication.</Notice></section>
        </article>
      </div>
    </div>
  );
}
