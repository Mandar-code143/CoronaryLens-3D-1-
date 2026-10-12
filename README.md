# 🫀 CoronaryLens 3D — Multimodal Cardiovascular AI Workstation

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Active_24%2F7-34D399?style=for-the-badge)](https://coronarylens-3d.onrender.com/)
[![Hackathon](https://img.shields.io/badge/Submission-Multimodal_AI_Hackathon-6366F1?style=for-the-badge)](#multimodal-ai-hackathon-submission)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![Node](https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Three.js](https://img.shields.io/badge/3D_Engine-Three.js-000000?style=flat&logo=three.js&logoColor=white)](https://threejs.org/)
[![Scikit-Learn](https://img.shields.io/badge/ML-Scikit--Learn-F7931E?style=flat&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![XAI](https://img.shields.io/badge/Explainability-Permutation_SHAP-EC4899?style=flat)](https://github.com/shap/shap)

> **Live Deployment:** [https://coronarylens-3d.onrender.com/](https://coronarylens-3d.onrender.com/)  
> **Interactive 3D Workstation:** [https://coronarylens-3d.onrender.com/workspace](https://coronarylens-3d.onrender.com/workspace)  
> *Active 24/7 with zero cold starts via continuous keep-alive telemetry.*

---

## 📌 Executive Summary for Hackathon Judges

**CoronaryLens 3D** is a multimodal clinical intelligence platform that bridges the gap between **tabular cardiovascular predictive models** and **spatial 3D anatomical visualization**.

Instead of delivering abstract probabilities or isolated risk numbers, CoronaryLens 3D fuses three critical modalities:
1. **Clinical Biomarkers & Patient Profiles** (55 multi-domain clinical features including vitals, echocardiogram, ECG, blood chemistry, and symptom history).
2. **Target-Specific Machine Learning Models** (Independent ML pipelines for overall CAD and specific major coronary arteries: LAD, LCX, and RCA).
3. **Interactive 3D Spatial Anatomical Atlas** (A physically-based 3D anatomical heart model that dynamically maps individual artery stenosis probabilities directly onto coronary vessel trees in real time).
4. **Explainable AI (Permutation SHAP)** (Mathematical attribution providing clinicians with transparent, feature-level explanations for every prediction).

---

## 🌟 Why Multimodal AI?

Traditional medical AI tools operate in silos:
* Tabular AI models spit out a flat percentage (e.g., *"Patient has an 82% risk"*) with zero anatomical grounding.
* Medical imaging / 3D tools display anatomy without predictive intelligence or risk attribution.

**CoronaryLens 3D synthesizes these streams:**

```
   ┌──────────────────────────────────────────────────────────────┐
   │                    MULTIMODAL WORKSTATION                    │
   └──────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
  MODALITY 1: TABULAR       MODALITY 2: 3D SPATIAL   MODALITY 3: EXPLAINABILITY
  [ 55 Clinical Inputs ]    [ Interactive Atlas ]    [ Permutation SHAP ]
  • Demographics & Vitals   • PBR 3D Heart Mesh      • Feature attributions
  • ECG & Echocardiogram    • LAD / LCX / RCA Trees  • Positive/negative forces
  • Lab Chemistry & History • Dynamic Heat Mapping   • Full mathematical audit
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ 4 Independent ML Classifiers: CAD · LAD · LCX · RCA          │
   └──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 1. 🫀 Physically-Based 3D Anatomical Atlas
* Powered by Three.js with realistic Physically-Based Rendering (PBR), specular highlights, and natural tissue sheen.
* Complete anatomical hierarchy: Cardiac chambers (ventricles & atria), great vessels (aorta, pulmonary trunk), coronary arteries, and cardiac veins.
* Interactive 3D camera controls: Orbit, zoom, anatomical isolation, translucent myocardium mode ("ghost view"), and one-click camera focus for target arteries.
* **100% Client-Compatible:** Works seamlessly on all modern browsers (Chrome, Safari, Firefox, Edge) across laptops, tablets, and mobile devices.

### 2. 🎯 Four Independent AI Target Models
The platform does **not** collapse risk into a single generic score. In clinical practice, disease is artery-specific:
* **CAD (Overall Coronary Artery Disease):** Cohort-level clinical classification.
* **LAD (Left Anterior Descending):** Feeds the front of the heart and ventricular septum ("the widowmaker").
* **LCX (Left Circumflex Artery):** Encircles the heart muscle and supplies the lateral wall.
* **RCA (Right Coronary Artery):** Supplies blood to the right ventricle and cardiac conduction nodes.

### 3. 🎨 Real-Time Dynamic Artery Heatmapping
* Prediction probabilities are instantly projected onto the 3D geometry.
* Continuous chromatic scale:
  * **Cyan / Teal (0.0):** Low predicted probability of stenosis.
  * **Amber (0.5):** Threshold boundary.
  * **Crimson / Coral (1.0):** High predicted probability of stenosis.

### 4. 🔬 Mathematical Explainability (XAI via Permutation SHAP)
* Computes feature attributions using model-agnostic **Permutation SHAP**.
* Shows clinicians exactly which patient indicators drove the score up or down (e.g., Ejection Fraction, Systolic BP, Age, Dyslipidemia).
* Grouped encoding attribution: One-hot encoded features are aggregated back to their original clinical predictor for crystal-clear interpretability.

### 5. 🛡️ Clinical-Grade Rigor & Zero Data Leakage
* **Strict Leakage Prevention:** Outcome fields (`Cath`, `CAD`, `LAD`, `LCX`, `RCA`) are cryptographically and structurally forbidden from entering predictor pipelines.
* **Nested Stratified Cross-Validation (5-Fold):** Model screening and hyperparameters were evaluated only within training folds, ensuring unbiased out-of-fold generalization estimates.
* **SHA-256 Manifest Integrity:** The serving engine verifies artifact checksums before every inference pass.

---

## 📊 Dataset & Model Architecture

### The Cohort
Trained on the peer-reviewed **Extension of Z-Alizadeh Sani** dataset (UCI Machine Learning Repository #411).
* **303 patient records**, 55 verified non-leaking predictors.
* Features span physical examination, laboratory testing, ECG, and echocardiography.

### Model Selection & Performance (5-Fold Nested CV)

| Target Vessel | Serving Model Architecture | Nested ROC-AUC | Nested Recall | Nested Precision |
|:--- |:--- |:---:|:---:|:---:|
| **CAD (Overall)** | Regularized Logistic Regression (L2) | **0.90** | **90%** | **90%** |
| **LAD Artery** | Random Forest (Balanced Class Weights) | **0.84** | **78%** | **77%** |
| **LCX Artery** | Random Forest (Feature Bagging) | **0.78** | **61%** | **62%** |
| **RCA Artery** | Extra Trees Classifier (Extreme Randomization) | **0.76** | **60%** | **67%** |

*All pipelines incorporate fold-local median/mode imputers and standard scalers to guarantee zero train-test data contamination.*

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|:--- |:--- |:--- |
| **Frontend** | React 19, TypeScript, Vite | High-performance reactive UI |
| **3D Graphics** | Three.js, WebGL, GLTFLoader | Real-time anatomical heart rendering |
| **Backend API** | Node.js 22 LTS, Express, Zod | Type-safe JSON API & static delivery |
| **ML Engine** | Python 3.13, Scikit-Learn, SHAP | Scientific inference & attribution adapter |
| **Deployment** | Docker, Render Cloud | Unified same-origin container architecture |
| **Availability** | Automated Ping Telemetry | 24/7 zero-downtime free-tier uptime |

---

## 💻 Local Development & Reproduction

### Prerequisites
* **Node.js**: v22 LTS or newer
* **Python**: v3.13
* **Package Manager**: `pnpm` (enabled via `corepack`)

### Quick Setup

```bash
# 1. Clone repository
git clone https://github.com/Mandar-code143/CoronaryLens-3D-1-.git
cd CoronaryLens-3D-1-

# 2. Enable pnpm and install dependencies
corepack enable
pnpm install

# 3. Install Python scientific dependencies
pip install -r requirements-research.txt

# 4. Build frontend and backend
pnpm run build

# 5. Start unified workstation server
pnpm --filter @workspace/api-server run start
```

Visit **`http://localhost:8080`** in your browser.

### Running Test Suite
```bash
# Verify ML inference, schema normalization, and SHAP math
python -m pytest tests/test_inference.py

# Verify TypeScript type integrity
pnpm run typecheck
```

---

## 🌐 Live Cloud Architecture

The application is deployed as a single, multi-stage Docker container on Render:
* **Production URL:** `https://coronarylens-3d.onrender.com`
* **Health Endpoint:** `https://coronarylens-3d.onrender.com/api/health`
* **Model Readiness Endpoint:** `https://coronarylens-3d.onrender.com/api/ready`
* **Static 3D Asset:** `https://coronarylens-3d.onrender.com/models/coronary-heart.glb`

---

## ⚖️ Research Disclaimer & Ethics

> **Important Notice for Evaluators:**  
> CoronaryLens 3D is a **research and educational prototype**, not an FDA-cleared diagnostic device. It is intended to showcase multimodal AI interactions, transparent XAI attributions, and spatial data fusion. It must not be used as a substitute for professional clinical judgment, invasive coronary angiography, or clinical care decisions.

---

## 👥 Hackathon Submission Info
* **Project Name:** CoronaryLens 3D
* **Category / Track:** Multimodal AI Hackathon
* **Live Web App:** [https://coronarylens-3d.onrender.com/](https://coronarylens-3d.onrender.com/)
* **Repository:** [https://github.com/Mandar-code143/CoronaryLens-3D-1-](https://github.com/Mandar-code143/CoronaryLens-3D-1-)
