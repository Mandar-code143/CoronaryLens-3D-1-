# 🫀 CoronaryLens 3D — Multimodal Cardiovascular AI Workstation

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Active_24%2F7-34D399?style=for-the-badge)](https://coronarylens-3d.onrender.com/)
[![Hackathon](https://img.shields.io/badge/Submission-Multimodal_AI_Hackathon-6366F1?style=for-the-badge)](#-multimodal-ai-hackathon-submission)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![Node](https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Three.js](https://img.shields.io/badge/3D_Engine-Three.js-000000?style=flat&logo=three.js&logoColor=white)](https://threejs.org/)
[![Scikit-Learn](https://img.shields.io/badge/ML-Scikit--Learn-F7931E?style=flat&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![SHAP](https://img.shields.io/badge/Explainability-Exact_Model--Aware_SHAP-EC4899?style=flat)](https://github.com/shap/shap)
[![Validation](https://img.shields.io/badge/Validation-3x_Repeated_Nested_CV-blue?style=flat)](https://scikit-learn.org/)

> **Live Deployment:** [https://coronarylens-3d.onrender.com/](https://coronarylens-3d.onrender.com/)  
> **Interactive 3D Workstation:** [https://coronarylens-3d.onrender.com/workspace](https://coronarylens-3d.onrender.com/workspace)  
> **Clinical Evidence & Diagnostics:** [https://coronarylens-3d.onrender.com/evidence](https://coronarylens-3d.onrender.com/evidence)  
> *Deployed 24/7 with zero cold starts via continuous telemetry keep-alive.*

---

## 📌 Executive Summary for Hackathon Judges

**CoronaryLens 3D** is an open-access, research-grade multimodal cardiovascular workstation designed to revolutionize how clinicians and medical researchers interact with predictive cardiology algorithms.

In clinical cardiology, doctors are inundated with complex, heterogeneous data: laboratory blood tests, echocardiogram metrics, resting ECG recordings, and physical symptom histories. Traditional machine learning systems reduce this wealth of information to a single, abstract risk number (e.g., *"Patient risk is 78%"*), providing neither **anatomical localization** nor **mechanistic explainability**.

**CoronaryLens 3D bridges this gap by fusing four distinct modalities into a unified, interactive workspace:**

1. **Tabular Clinical Biomarkers:** 54 multi-domain features spanning hemodynamics, echocardiography, ECG, blood biochemistry, and physical examination.
2. **Interactive 3D Spatial Anatomy:** A physically-based 3D reference heart atlas rendered in Three.js/WebGL that projects vessel-specific stenosis probabilities directly onto individual coronary arteries in real time.
3. **Exact Model-Aware Explainable AI (XAI):** Mathematically rigorous SHAP attributions (TreeExplainer and LinearExplainer) detailing the exact clinical features pushing risk up or pulling risk down.
4. **Statistical Rigor & Calibration:** 3x repeated 5-fold nested cross-validation, fold-local Platt sigmoid calibration, Youden's J decision boundary optimization, and 95% bootstrap confidence intervals.

---

## 🌟 The Multimodal AI Architecture

CoronaryLens 3D is built specifically for the **Multimodal AI Hackathon** to demonstrate how disparate data modalities synthesize into an intuitive clinical decision-support experience:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      CORONARYLENS 3D MULTIMODAL PIPELINE                         │
└──────────────────────────────────────────────────────────────────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                             ▼
   [ MODALITY 1: TABULAR ]      [ MODALITY 2: 3D SPATIAL ]   [ MODALITY 3: EXPLAINABILITY ]
   • 54 Clinical Predictors     • High-Fidelity Heart Atlas  • Exact Tree & Linear SHAP
   • Multi-Domain Biomarkers    • PBR Anatomical Meshes      • Directional Risk Drivers (+/-)
   • 1-Click Patient Cohorts    • Dynamic Chromatic Shader   • Additivity Verified (Residual < 1e-4)
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │         CALIBRATED RESEARCH-GRADE INFERENCE & UNCERTAINTY ESTIMATION         │
   │  • 4 Independent Target Classifiers: Overall CAD · LAD · LCX · RCA           │
   │  • Fold-Local Platt Sigmoid Calibration (Empirical True Probabilities)       │
   │  • Youden's J Optimal Operating Thresholds (Balanced Sensitivity/Specificity)│
   │  • Non-Parametric Bootstrap Uncertainty Estimation (B=500 Resamples, 95% CI) │
   └──────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │                  REAL-TIME WORKSTATION & DIAGNOSTICS SUITE                   │
   │  • Interactive 3D Orbit & Translucent Myocardium ("Ghost Mode")              │
   │  • Dynamic SVG Calibration Curves (Observed vs. Predicted) & ROC Curves      │
   │  • Operating Point Decision Trade-Off Tables (Thresholds 0.30 - 0.70)        │
   └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔬 Scientific Methodology & Rigor

CoronaryLens 3D prioritizes medical integrity, transparency, and statistical honesty over black-box optimism:

### 1. Repeated Nested Cross-Validation (3x 5-Fold)
- **Zero Selection Optimism:** Hyperparameter selection and algorithm screening occur exclusively within inner 3-fold cross-validation loops. Outer evaluation folds are strictly held out to guarantee unbiased generalization estimates.
- **Leakage Quarantine:** Outcome variables (`CAD`, `Cath`, `LAD`, `LCX`, `RCA`) are strictly isolated from the predictor space. Preprocessing (median/mode imputation, standard scaling, one-hot encoding) is fit exclusively on training splits within each fold.
- **Invariant Column Scrubbing:** Column `Exertional CP` was audited and removed because it was 100% constant zero across all 303 cohort patients, eliminating colinearity and singular matrix anomalies.

### 2. Fold-Local Platt Probability Calibration
- Standard machine learning models (especially tree ensembles and SVMs) yield uncalibrated margins or distorted probabilities.
- CoronaryLens 3D applies **cross-fitted Platt scaling** (sigmoid logistic regression) to transform raw decision functions into faithful empirical posterior probabilities, minimizing both **Brier Score** and **Expected Calibration Error (ECE)**.

### 3. Clinically Grounded Operating Points (Youden's J Statistic)
- Rather than defaulting to an arbitrary 0.50 software threshold, decision boundaries are optimized using Youden's index ($J = \text{Sensitivity} + \text{Specificity} - 1$) on honest out-of-fold validation predictions to balance rule-in precision with rule-out sensitivity.

### 4. Non-Parametric Bootstrap Uncertainty Estimation
- A 500-sample patient-level bootstrap resample is computed on out-of-fold predictions to yield honest **95% Confidence Intervals** across all key statistical metrics (Accuracy, Sensitivity, Specificity, Precision, F1, and ROC-AUC).

---

## 📊 Comprehensive Model Performance (Honest Nested Out-of-Fold)

Evaluated on the 303-patient retrospective cohort from the **UCI Z-Alizadeh Sani** cardiovascular dataset (catheterization gold standard):

| Target Artery / Condition | Serving Model Family | Optimal Youden Threshold | Nested ROC-AUC [95% CI] | Sensitivity / Recall [95% CI] | Specificity [95% CI] | Precision [95% CI] | Calibrated Brier Score |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **CAD (Overall Disease)** | L2-Penalized Logistic Regression | **0.66** | **0.900** [0.852 – 0.941] | **91.7%** [87.5% – 95.4%] | **71.3%** [60.9% – 80.5%] | **88.7%** [84.1% – 92.9%] | **0.104** |
| **LAD (Left Anterior Descending)** | Random Forest Classifier | **0.55** | **0.835** [0.781 – 0.884] | **74.8%** [68.0% – 81.3%] | **77.2%** [69.9% – 83.7%] | **79.5%** [73.5% – 85.5%] | **0.144** |
| **LCX (Left Circumflex Artery)** | Random Forest Classifier | **0.38** | **0.778** [0.718 – 0.837] | **57.0%** [47.1% – 66.7%] | **83.2%** [78.2% – 88.0%] | **58.9%** [49.0% – 68.6%] | **0.161** |
| **RCA (Right Coronary Artery)** | Extra Trees Classifier | **0.46** | **0.758** [0.697 – 0.817] | **63.8%** [54.8% – 72.3%] | **75.1%** [69.0% – 80.8%] | **54.2%** [45.7% – 62.7%] | **0.170** |

*All metrics reflect honest nested cross-validation. Outer test splits were never exposed during model selection or tuning.*

---

## 🚀 Key Platform Features

### 1. 🫀 Physically-Based 3D Heart Atlas (Three.js / WebGL)
* **High-Fidelity Anatomical Mesh:** Anatomically accurate cardiac structures derived from the Z-Anatomy open atlas, featuring four cardiac chambers, aorta, pulmonary trunk, coronary arteries, and great cardiac veins.
* **Real-Time Dynamic Shader Heatmapping:** Artery branches are dynamically tinted based on model output:
  * 🟢 **Teal / Cyan (0.00 – 0.35):** Normal / Low Stenosis Probability.
  * 🟡 **Amber (0.35 – 0.65):** Borderline / Intermediate Probability.
  * 🔴 **Crimson / Coral (0.65 – 1.00):** High Stenosis Probability ($\ge 50\%$ anatomical narrowing).
* **Interactive Inspection Controls:** Full 360° orbital rotation, smooth zooming, one-click camera focus on selected arteries, and a **Translucent Myocardium Mode** ("Ghost View") revealing internal coronary paths.

### 2. ⚡ 1-Click Representative Patient Cases
* Under **Step 1 (Clinical Inputs)**, evaluators can click to instantly populate the 54 fields with verified clinical profiles:
  * **Patient #42:** Verified Severe Multi-Vessel CAD (Catheterization positive for CAD, LAD, and RCA).
  * **Patient #108:** Angiographically Normal (Zero stenosis across all coronary arteries).
  * **Patient #215:** Isolated LAD Stenosis.
  * **Synthetic Cohort Median:** Normalized baseline profile.

### 3. 🧠 Exact Model-Aware SHAP Explainability
* Uses exact **TreeExplainer** for tree ensembles and **LinearExplainer** for logistic models (ensuring sub-second execution with zero random sampling jitter).
* **Clinical Push / Pull Summary:** Explicitly itemizes which clinical indicators are increasing risk (e.g., *Typical Chest Pain, Age > 60, Regional Wall Motion Abnormality*) and which are protective.
* **Exact Additive Attribution:** Validates that sum of individual feature contributions strictly matches the difference between the model baseline and the patient prediction ($\text{residual} < 10^{-4}$).

### 4. 📈 Interactive Evidence & Calibration Dashboard
* Navigate to **Evidence** to view:
  * Grouped metric bar charts across CAD, LAD, LCX, and RCA.
  * **Calibration Curves:** Observed positive fractions plotted against mean predicted probabilities alongside the ideal 45° reference diagonal.
  * **ROC Curves:** Sensitivity vs. (1 - Specificity) with shaded Area Under Curve.
  * **Decision Threshold Trade-Off Tables:** Complete sensitivity, specificity, accuracy, precision, and F1 trade-offs from $\tau = 0.30$ to $\tau = 0.70$.
  * **Global SHAP Importance:** Top population-wide predictive contributors per vessel.
  * **Confusion Matrices:** Out-of-fold counts computed at optimal Youden decision thresholds.

---

## 🛠️ Technology Stack & Architecture

| Layer | Technologies | Purpose |
|:---|:---|:---|
| **Frontend UI** | React 19, TypeScript, Vite, Wouter | High-speed reactive client workstation |
| **3D Engine** | Three.js, WebGL 2.0, GLTFLoader | Interactive PBR anatomical cardiovascular visualization |
| **Backend Service** | Node.js 22 LTS, Express, Zod, TypeScript | Type-safe REST API, telemetry keep-alive, and asset server |
| **Inference Engine** | Python 3.13, Scikit-Learn, SHAP, Joblib | Validated nested pipelines and exact explainers |
| **Data Validation** | Zod, Scikit-Learn Pipeline, NumPy | Strict schema validation and zero-leakage transforms |
| **Deployment** | Docker Multi-Stage, Render Cloud | Unified same-origin container architecture |
| **Testing & CI** | Pytest (22 tests), TypeScript Compiler, GitHub Actions | Automated regression testing and type integrity |

---

## 🤖 AI-Assisted Development & Transparency

In accordance with the **Multimodal AI Hackathon 2026** AI-assistance disclosure requirement, the team discloses that an AI coding assistant (Antigravity / Google DeepMind) was used as a pair-programming aid during selected phases of development. All AI-generated or AI-assisted code was reviewed, tested, integrated, and is understood by the team; the team takes full engineering responsibility for the submitted implementation.

The following areas received material AI assistance:

| Area | Nature of AI Assistance |
|:---|:---|
| **ML pipeline & evaluation logic** | Debugging cross-platform CRLF/LF checksum mismatch; implementing `sha256_match` normalisation; native container-side model training in `Dockerfile` and CI; reviewing nested-CV correctness. |
| **Inference & explainability layer** | Reviewing `infer_models.py` (Platt calibration, operating thresholds, SHAP additivity checks); diagnosing scikit-learn version serialisation incompatibilities between development and container environments. |
| **Backend / API** | Diagnosing and resolving Render deployment failures; implementing the keep-alive telemetry endpoint; reviewing route correctness and error-response contracts. |
| **Frontend UI** | Refining `Inputs.tsx` layout (sidebar proportions, field-group card structure, sticky bar); updating `styles.css` to fix spacing and header rendering on the production deployment. |
| **Test suite & CI** | Updating `test_inference.py` for cross-platform robustness; adding a model-regeneration step in `.github/workflows/quality.yml` to ensure CI trains natively on the runner environment. |
| **Technical documentation** | Generating developer-facing content in `README.md`, `docs/`, and inline code comments. |

The core scientific methodology (nested cross-validation design, leakage quarantine, Platt calibration, Youden threshold selection, SHAP explainability architecture, and dataset handling) was designed and verified by the team. The trained model artifacts reflect team-directed engineering choices on the Z-Alizadeh Sani cardiovascular dataset.

---

## 💻 Local Setup & Reproduction

### Prerequisites
- **Node.js**: v22 LTS or newer
- **Python**: v3.13
- **Package Manager**: `pnpm` (enabled via `corepack`)

### Quickstart Guide

```bash
# 1. Clone the repository
git clone https://github.com/Mandar-code143/CoronaryLens-3D-1-.git
cd CoronaryLens-3D-1-

# 2. Enable pnpm and install JavaScript dependencies
corepack enable
pnpm install

# 3. Install Python scientific dependencies
pip install -r requirements-research.txt

# 4. Run the Python verification test suite
python -m pytest

# 5. Build and run the workstation
pnpm run build
pnpm --filter @workspace/api-server run start
```

Open your browser at **`http://localhost:8080`**.

---

## 🌐 Live Cloud Infrastructure

The application runs as a production container on Render:
- **Public URL:** [https://coronarylens-3d.onrender.com/](https://coronarylens-3d.onrender.com/)
- **Health Endpoint:** [https://coronarylens-3d.onrender.com/api/health](https://coronarylens-3d.onrender.com/api/health)
- **Model Readiness Endpoint:** [https://coronarylens-3d.onrender.com/api/ready](https://coronarylens-3d.onrender.com/api/ready)
- **Full Research Artifacts Endpoint:** [https://coronarylens-3d.onrender.com/api/evaluation/details](https://coronarylens-3d.onrender.com/api/evaluation/details)
- **Keep-Alive Service:** Active automated polling ensures 24/7 responsiveness with zero container sleep or cold-start lag.

---

## ⚖️ Clinical Disclaimer & Ethics

> **Research Prototype Notice:**  
> CoronaryLens 3D is developed strictly as a research and educational platform for the **Multimodal AI Hackathon**. It is **not** an FDA-cleared medical device and is **not** intended for independent clinical diagnosis, triage, or prescriptive medical treatment. All predictions are statements about mathematical models fitted on retrospective data and must never supersede qualified medical evaluation by licensed healthcare providers.

---

## 👥 Multimodal AI Hackathon Submission
- **Project Title:** CoronaryLens 3D
- **Track / Theme:** Multimodal AI Hackathon
- **Live Interactive Platform:** [https://coronarylens-3d.onrender.com/](https://coronarylens-3d.onrender.com/)
- **Source Code Repository:** [https://github.com/Mandar-code143/CoronaryLens-3D-1-](https://github.com/Mandar-code143/CoronaryLens-3D-1-)
- **Lead Developer:** Mandar & Team
