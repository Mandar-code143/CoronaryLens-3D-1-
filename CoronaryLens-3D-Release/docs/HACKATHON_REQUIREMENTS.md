# Track A requirement-to-implementation audit

This document maps the supplied Track A brief to the current ZIP build. Status reflects source inspection and tests run in the packaging environment, not a guarantee of judging outcome.

| Requirement | Current status | Remaining gap / evidence needed |
|---|---|---|
| CAD, LAD, LCX, RCA classification | Implemented as four fitted scikit-learn pipelines; inference adapter tested | Only 303 retrospective records; external validation absent; do not claim perfect predictions |
| Exclude outcomes from predictors | Enforced in preparation/loading/API; tests reject target leakage | Verify final presentation explains CAD is mapped from source `Cath` |
| Accuracy, precision, recall, F1, ROC-AUC | Nested out-of-fold metrics saved in `evaluation.json` | Present all measures with uncertainty/small-sample caveat; do not report training-set metrics as test metrics |
| Interactive 3D heart/coronary vessels | Three.js scene supports rotate, zoom, select; branch colors now use model score when outputs are available | Current heart is procedural schematic; no detailed human torso or licensed anatomical mesh. This remains a material visual gap |
| Per-vessel probabilities drive artery colors | LAD/LCX/RCA colors are score-driven; CAD is not mapped to a particular vessel | The scores are uncalibrated model estimates, not lesion locations or clinical thresholds |
| Clinical interpretability | Prediction-linked approximate permutation SHAP values, grouped by source predictor | Approximate and non-causal; marginal masking can create unrealistic combinations; feature metadata/units require medical review |
| Measurements alongside contributions | Inputs and grouped SHAP bars are available | The UI does not infer or invent measurement units; unit metadata and predictor semantics require source-codebook and domain review |
| Educational/not-a-diagnosis disclaimer | Research-only language in UI/docs/API | Include visible disclaimer in the demo recording and pitch |
| Web prototype and trained weights | React/Vite frontend, Express API, Python model artifacts included | JS build and container image could not be rebuilt in restricted environment; run CI/Windows checks |
| Documentation | README, model card, deployment/local docs and this audit | Supply a 3–10 minute public video and include its URL in submission |
| AI tool disclosure | README notes use of AI assistance | Disclose ChatGPT/OpenAI in the hackathon platform's “Built With” section if used in submitted work |

## Important target mapping

The source workbook contains `Cath`, `LAD`, `LCX`, and `RCA` labels. `CAD` is derived from `Cath`; the four target columns and target-related outcomes are excluded from the 55 predictor features. The source has one disagreement between `Cath` and the “any vessel stenotic” interpretation. This conflict is recorded, not silently overwritten. The problem brief's 54-feature count differs from the reproducible source-derived count (55), which should be raised in the presentation rather than hidden.

## Do not claim

- “100% accurate”, “perfect prediction”, clinical readiness, or regulatory approval.
- Patient-specific lesion localization from the schematic.
- Clinically reviewed SHAP/LIME explanations; approximate permutation SHAP is implemented but remains exploratory and non-causal.
- External validation or prospective clinical performance.
