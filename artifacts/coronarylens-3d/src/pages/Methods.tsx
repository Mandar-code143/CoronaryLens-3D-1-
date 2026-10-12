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
            <p>Source: UCI Machine Learning Repository #411, <i>Extension of Z-Alizadeh Sani dataset</i> (CC BY 4.0, DOI 10.24432/C5461K). The cohort contains <strong>303 patients and 58 modeling columns</strong>: 54 clinical predictors and four invasive angiography targets (<code>Cath</code>, <code>LAD</code>, <code>LCX</code>, <code>RCA</code>).</p>
            <p><strong>CAD ← Cath.</strong> The <code>Cath</code> field records CAD diagnosis (stenosis &ge; 50% in at least one coronary vessel) and maps to the overall CAD target (216 CAD, 87 Normal). LAD, LCX and RCA record vessel-specific stenosis.</p>
            <p><strong>Predictor schema (54 predictors).</strong> From the raw columns, four outcome fields are reserved as targets. Invariant column <code>Exertional CP</code> (100% constant zero across all 303 cohort patients) was identified during automated data audit and excluded to eliminate zero-variance colinearity, yielding 54 active clinical predictors.</p>
            <p><strong>Clinical integrity audit.</strong> One row contains a recorded CAD label that disagrees with individual vessel annotations. Per medical AI transparency standards, this discrepancy is preserved and logged rather than silently manipulated (see <code>data/processed/data_audit.json</code>). Typographical normalization (<code>Fmale</code> → <code>Female</code>) is applied for clean display.</p></section>
          <section id="leak"><h3>Predictor exclusion & leakage prevention</h3>
            <p>All target outcomes (<code>CAD</code>, <code>Cath</code>, <code>LAD</code>, <code>LCX</code>, <code>RCA</code>) are strictly quarantined from the feature space. Feature transformation (median/mode imputation, standard scaling, and one-hot encoding with unknown handling) is bundled inside each estimator pipeline and fit strictly on training splits within every cross-validation fold to guarantee zero data leakage.</p></section>
          <section id="train"><h3>Repeated nested cross-validation & candidate screening</h3>
            <p>Six model families per target: L2-penalized Logistic Regression, L1-penalized Sparse Logistic Regression, Random Forest, Extra Trees, Gradient Boosting, and RBF Support Vector Machines. Headline performance is evaluated via <strong>3x repeated 5-fold nested stratified cross-validation</strong> (15 outer folds total). Within each outer training split, an inner 3-fold cross-validation screens candidate algorithms by ROC-AUC.</p>
            <p>Serving pipelines are fitted on the complete cohort using the winning algorithm family identified through cross-validation. Out-of-fold metrics estimate the generalized selection procedure with complete independence.</p>
            {reg.data && <p className="faint">Registry <code>{reg.data.version}</code> · serving: {reg.data.targets.map((t) => `${t.target} → ${t.model_family}`).join(' · ')}</p>}
            {reg.isError && <Notice tone="warn" title="Registry unavailable">The model registry could not be read from the API; serving families are not shown here.</Notice>}</section>
          <section id="score"><h3>Platt calibration, Youden operating points & bootstrap uncertainty</h3>
            <p>Raw model logits are calibrated into reliable empirical probabilities using <strong>fold-local cross-fitted Platt scaling</strong> (sigmoid regression), minimizing both Brier score and Expected Calibration Error (ECE).</p>
            <p><strong>Target-specific operating thresholds:</strong> Rather than relying solely on arbitrary 0.5 software cutoffs, decision thresholds are optimized via Youden’s J statistic (<code>sensitivity + specificity − 1</code>) to maximize clinical discriminative utility.</p>
            <p><strong>Bootstrap uncertainty:</strong> 500 patient-level non-parametric bootstrap resamples on honest out-of-fold predictions compute 95% confidence intervals for accuracy, sensitivity, specificity, precision, F1, and ROC-AUC.</p></section>
          <section id="shap"><h3>Exact model-aware SHAP attributions</h3>
            <p>Attributions are computed using exact model-aware explainers (TreeExplainer for tree ensembles, LinearExplainer for logistic models) rather than slow approximate permutations. Transformed one-hot features are aggregated back to original clinical predictors, verifying exact additivity (residual &lt; 10<sup>−4</sup>) against the cohort background baseline.</p>
            <ul><li>Attributions quantify model sensitivity, <strong>not physiological causation</strong>.</li><li>Categorical features are presented with their active patient value and net directional contribution.</li></ul></section>
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
