# CoronaryLens-3D (research prototype)

A research workstation for exploring small-cohort coronary-outcome models (CAD, LAD, LCX, RCA) beside a real, locally bundled anatomical heart.
**Not a medical device. Not clinically validated. No external validation. Research use only.**

* **Anatomy:** Z-Anatomy / BodyParts3D derivative GLB (CC BY-SA 4.0) with named LAD, LCX, RCA, aorta, pulmonary trunk, chambers and cardiac veins - see `docs/ANATOMY_ASSET.md`.
* **Models:** four scikit-learn pipelines trained on UCI #411 (303 rows, 55 predictors); nested-CV metrics only - see `docs/MODEL_CARD.md`.
* **App:** React + Three.js frontend, Express API, Python inference adapter (real predictions and request-bound approximate SHAP).

## Quick start (any OS)
```bash
corepack enable && corepack prepare pnpm@10.12.1 --activate
pnpm install --frozen-lockfile
python -m pip install -r requirements-research.txt
pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/coronarylens-3d run build
PORT=8080 node artifacts/api-server/dist/index.mjs      # open http://localhost:8080
```
Windows PowerShell commands, Docker and the test list: `docs/LOCAL_DEVELOPMENT.md`, `docs/DEPLOYMENT.md`. Findings and what was *not* verified: `docs/TECHNICAL_AUDIT.md`. Build log: `REBUILD_PROGRESS.md`.

---
# CoronaryLens-3D

CoronaryLens is a **research prototype** for exploring target-specific classification on the public Extension of Z-Alizadeh Sani dataset. It combines a React/Vite dashboard, a Node/Express API, a source-audited tabular dataset, and an interactive Three.js *schematic* of coronary anatomy.

> **Research-only warning:** this project is not a medical device. It is not validated for clinical use and must not be used to diagnose, rule out disease, choose treatment, or make individual healthcare decisions. The dataset contains 303 retrospective records. Internal cross-validation is not external or prospective clinical validation. The 3D display is illustrative—not a patient-specific scan, segmented artery tree, lesion localization, or anatomical reconstruction.

## Current status

- The app has a readiness-gated model workspace and a documented source dataset.
- The data-preparation and model-evaluation scripts are reproducible and include target-leakage checks and fold-local preprocessing.
- The Express API includes a Python inference adapter. `/api/predict` loads the four checksummed fitted pipelines only after schema/data/registry/manifest compatibility checks. `/api/explain/:target` computes approximate permutation SHAP values and groups encoded columns back to source predictors; this is exploratory attribution, not a causal or medical explanation.
- A checksummed research model bundle is included in this ZIP and is intentionally not ignored by Git: the Docker/local app needs these files. Keep the versioned bundle together with its manifest, evaluation report, schema and processed CSV.
- A successful build or internal CV score does **not** establish clinical validity. Feature descriptions and units need domain review before any stronger interpretation.

## Requirements

- Node.js 22 or 24 (Node 22 LTS is a practical local choice).
- Corepack and pnpm matching the checked-in lockfile.
- Python 3.13 and pip; exact versions (including SHAP 0.50.0) are pinned in `requirements-research.txt` because scikit-learn `.joblib` artifacts and explanation behavior are version-sensitive.
- Git (optional for using the ZIP; required for source control).

## Windows quick start (PowerShell)

1. Extract this ZIP into a normal writable folder; open that folder in VS Code.
2. Install Node.js 22, Python 3.13 and Git if not already installed; `uv` is not required.
3. In PowerShell in the project root:

   ```powershell
   corepack enable
   corepack prepare pnpm@10.12.1 --activate
   pnpm install --frozen-lockfile
   python -m pip install -r requirements-research.txt
   ```

   If the exact pnpm version in your environment differs, use `corepack pnpm --version` and the repo's lockfile/Corepack setup; do not run `npm install` at the workspace root because the root preinstall intentionally requires pnpm.

4. Terminal A, start the API:

   ```powershell
   $env:PORT = "8080"
   $env:NODE_ENV = "development"
   pnpm --filter @workspace/api-server run build
   pnpm --filter @workspace/api-server run start
   ```

5. Terminal B, start the UI:

   ```powershell
   $env:PORT = "5173"
   $env:BASE_PATH = "/"
   pnpm --filter @workspace/coronarylens-3d run dev
   ```

6. Open `http://localhost:5173`. The API is at `http://localhost:8080/api/health`; readiness at `http://localhost:8080/api/ready`.

The Node API and Vite frontend run separately in development. The Vite config now defaults `PORT` to `5173` and `BASE_PATH` to `/`, though setting these variables explicitly avoids surprises. For the API, set `PORT=8080`.

## Prepare and inspect the dataset

The official source workbook is `data/raw/extension-of-z-alizadeh-sani.xlsx`. To regenerate the processed CSV, schema, audit report and synthetic profile:

```powershell
python scripts/prepare_data.py
```

The script prints the row/column counts, outcome distributions, target-consistency note and workbook checksum. Review the generated `data/processed/data_audit.json` after each regeneration. The source workbook has 59 columns: four outcomes (`Cath`, `LAD`, `LCX`, `RCA`) and 55 predictors after excluding target-related columns. `CAD` is mapped from `Cath`; the source does not include an independent `CAD` column. This is why the observed predictor count differs from a 54-feature brief. Do not silently change the source or resolve label disagreements by guesswork.

## Model evaluation and artifact generation

Run an internal cross-validation comparison:

```powershell
python scripts/evaluate_models.py --folds 5
```

To compare models and create local research artifacts:

```powershell
python scripts/train_models.py --folds 5
```

The script compares prespecified logistic regression, 80-tree random forest, 80-tree extra trees and RBF-SVM candidates for each of `CAD`, `LAD`, `LCX`, and `RCA`. Headline estimates come from nested stratified cross-validation: each outer held-out fold is evaluated after candidate selection happens only inside that fold’s training data. A separate full-cohort OOF screening step chooses the final research serving family; those screening metrics are not presented as unbiased selected-model performance. Final pipelines are fit on the whole cohort. Artifacts include model pipelines, registry, evaluation JSON, candidate-screening metrics and both screening/nested OOF predictions under `data/processed/model_artifacts/`. The `scripts/infer_models.py` adapter checks schema and dataset compatibility plus each pipeline SHA-256 before returning an estimate. Use the synthetic cohort reference profile for an initial smoke test; never treat it as a real case.

**Important:** those artifacts are only a software/research milestone. The cohort is small and retrospective, the feature schema contains unverified semantics, and internal CV may be optimistic. Do not describe the CV winner as clinically accurate or deploy this as a clinical decision system. Before enabling live prediction in a public demonstration, complete independent medical/statistical review, verify all feature semantics/units and output definitions, validate artifact checksums/schema compatibility, and add proper model-serving integration tests. The inference API intentionally validates the registry, full manifest checksums, processed dataset checksum, feature-schema version/checksum, sample count and expected model files before it will return research outputs. The model bundle is included and can also be regenerated with the training command above.

## Quality checks

```powershell
python -m pytest
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/coronarylens-3d run build
```

A clean dependency install and frontend/backend build could not be verified in the packaging environment because dependency downloads were unavailable. The included CI workflow checks these on GitHub. Use the checks above and report the first failing command plus its full output for precise fixes.

## API and deployment notes

- Node API prefix: `/api`.
- `/api/health` is liveness only; `/api/ready` describes data/schema/model/evaluation readiness.
- Static frontend output: `artifacts/coronarylens-3d/dist/public`.
- API build output: `artifacts/api-server/dist`.
- A Dockerfile is included for a same-origin container setup, serving the built frontend and API from port 8080. The container build has not been run in this restricted environment. A split frontend/API deployment remains supported if its `/api` route is configured explicitly. See `docs/DEPLOYMENT.md`.
- Never add `.env`, secrets or patient data to a public Git commit. The reviewed research model bundle in `data/processed/model_artifacts/` is intentionally included for reproducibility; inspect it and retain its checksum manifest when you commit or deploy.

## Data citation

Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). *Extension of Z-Alizadeh Sani dataset*. UCI Machine Learning Repository. DOI: [10.24432/C5461K](https://doi.org/10.24432/C5461K). Source dataset license is recorded as CC BY 4.0 in the included audit file; retain attribution and verify applicable terms when redistributing.

## Licensing boundaries

The project source code is distributed under the MIT License in `LICENSE`. The bundled UCI dataset/workbook is third-party material and retains the source dataset terms recorded in `data/processed/data_audit.json` (CC BY 4.0 attribution). JavaScript and Python dependencies retain their own licenses. The schematic anatomy is generated by application code; no third-party anatomical mesh is currently bundled.

## Hackathon submission and AI disclosure

The supplied Track A brief asks for a 3–10 minute demo video; this ZIP includes a recording script at `docs/DEMO_VIDEO_SCRIPT.md`, not a published video. Record the actual application only after clean end-to-end checks, upload the video and provide its real URL in the submission. The codebase was reviewed and modified with AI assistance (ChatGPT/OpenAI); disclose this in the event platform's “Built With” section where required and only submit work your team can explain. See `docs/HACKATHON_REQUIREMENTS.md` for a requirement-by-requirement gap audit.
