# Technical audit

Scope: the ZIP supplied by the project owner (nested app folder `CoronaryLens-3D-Research-Audited/`). Everything below was observed in the sandbox build (Linux, Node 22.22, pnpm 10.12.1, Python 3.12 with the pinned research libraries). "Not verified" items are listed explicitly at the end.

| # | Severity | Finding | Evidence | Change made |
|---|---|---|---|---|
| 1 | High | 3D scene was a procedural heart shape with tubes, not anatomy | `gen_heart.py`, `gen_detailed_heart.py`, 578 KB generated GLB | Replaced by a real Z-Anatomy derivative (26 named structures, CC BY-SA 4.0); generators removed; selection by exact node name. See `ANATOMY_ASSET.md` |
| 2 | High | ZIP shipped Windows-built `node_modules` (win32 esbuild/rollup binaries) - not installable as-is on Linux/macOS/Docker context | `node_modules/.pnpm/@esbuild+win32-x64@0.28.2` | Excluded from the release; clean `pnpm install --frozen-lockfile` verified (455 packages, ~14 s) |
| 3 | Medium | Frontend was one 37 KB `App.tsx` with inline styles; 50 unused UI-kit files | file sizes | Rewritten as modules (shell, viewer, charts, five pages, session state, validators); dead kit removed |
| 4 | Medium | OpenAPI `Explanation` schema omitted `baseline_score`, `prediction_score`, `full_attribution_sum`, `additivity_residual`, which the server returns | `lib/api-spec/openapi.yaml` vs `/api/explain` response | Spec extended, client regenerated with orval, typecheck passes |
| 5 | Medium | API client package did not export `ApiError`, so HTTP status/code/blockers could not be classified in the UI | `lib/api-client-react/src/index.ts` | Exported; UI maps 400/409/503/network failures to distinct messages and never substitutes data |
| 6 | Medium | `/api/healthz` always returns ok by design while model readiness is a separate `/api/ready`; a UI that shows one as "online" can contradict the other | `routes/health.ts` vs `routes/coronarylens.ts` | UI now keeps **API reachable**, **artifacts verified**, **profile valid**, **prediction current/stale** and **explanation** as independent statuses. (The old App.tsx was replaced rather than line-audited, so the specific old contradiction was not reproduced.) |
| 7 | Low | `index.html` disabled pinch-zoom (`maximum-scale=1`) and used an absolute `/favicon.svg` (breaks under a base path) | `index.html` | Both fixed; router and asset URLs honour `BASE_PATH` |
| 8 | Low | Scratch files in repo root (`gen_*.py`, `search_nih.py`, `*.log`, `*.tsbuildinfo`, `__pycache__`) | file listing | Removed from release |
| 9 | Low | `pyproject.toml` requires Python 3.13 while the sandbox has 3.12 | `requires-python` | Pinned libs imported and all tests passed on 3.12; Docker/CI keep 3.13 |
| 10 | Info | `artifacts/mockup-sandbox` is a Replit scaffold with its own `.replit-artifact` config | directory | Left in place to keep the lockfile valid; not used by the product. Candidate for removal with a lockfile refresh |

## ML pipeline checks (read from code and artifacts)

* **Outcome exclusion:** `CAD, Cath, LAD, LCX, RCA` are excluded in data preparation (`leakage_controls` in `data_audit.json`), absent from the served 55-field schema, and rejected by the API (`POST /api/predict` -> 400).
* **54 vs 55 predictors:** the workbook has 59 columns = 55 predictors + 4 outcomes; the brief's 54 is documented in `prompt_vs_source_discrepancy`.
* **CAD target:** mapped from `Cath` (216 CAD / 87 Normal). One row disagrees with "any stenotic vessel"; it is reported (`cad_equals_any_stenotic_vessel_mismatches: 1`) and kept.
* **Preprocessing leakage:** imputation, scaling and one-hot encoding are inside each `sklearn` Pipeline, so they are refit per fold (`train_models.py`).
* **Selection leakage:** headline metrics use 5-fold outer / 3-fold inner nested CV; the final serving family is chosen by full-cohort OOF AUC, and the report states this is optimistic. The UI shows only nested metrics and never training performance.
* **Semantics:** all four artifacts return `predict_proba` outputs for the positive class (`CAD` / `Stenotic`); 0.5 is a software default.
* **Explanations:** bound to a server-issued request ID plus the profile hash; mismatches return 409. Additivity residual ~1e-15 on the demo profile.
* **Artifact integrity:** `/api/ready` verifies the registry, evaluation report, per-model SHA-256, manifest SHA-256 and dataset/schema checksums. `ready: true` in this build.

## Not verified here

* A Docker image build (no Docker in the sandbox) - the Dockerfile and CI job are unchanged in intent but **unbuilt by me**.
* Retraining from the raw workbook was not re-run; the shipped artifacts were verified by checksum and by inference only.
* Clinical meaning/units of source variables (the workbook does not declare them).
* A real GPU: browser checks used Chromium with software WebGL.
