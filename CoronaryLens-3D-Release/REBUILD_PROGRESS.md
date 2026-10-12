# REBUILD_PROGRESS

Working copy: Linux sandbox. The app root is the nested `CoronaryLens-3D-Research-Audited/` folder from the ZIP.

## Stage log
- [x] Stage 0 - ZIP inventoried. Input had Windows-built node_modules (win32 binaries), stray logs, pycache, tsbuildinfo, root-level scratch scripts (gen_heart.py, gen_detailed_heart.py, search_nih.py).
- [x] Stage 1 - baseline: `pnpm install --frozen-lockfile`, typecheck, api build, frontend build, 18 pytest all pass on Linux (Node 22, pnpm 10.12.1, Py 3.12; pyproject asks 3.13 - models load fine on 3.12 w/ pinned libs). Real /predict + /explain verified through API.
- [~] Stage 2 - real asset: Z-Anatomy Startup.blend (CC BY-SA 4.0 / BodyParts3D CC BY-SA 2.1 JP) extracted via Blender 4.5 bpy; tools/anatomy/build_heart_glb.py -> 28 named nodes (4 chambers, aorta+arch vessels, pulmonary trunk/arteries, SVC, pulmonary veins, left main/LAD/LCX/RCA + branches, cardiac veins); 3.9MB GLB. NEXT: verify visually, copy into public/models
- [x] Stage 3 - readiness/liveness already separate in backend; UI now shows them as independent statuses; OpenAPI Explanation fields fixed
- [x] Stage 4 - frontend rebuilt (5 pages) and browser-tested
- [x] Stage 5 - docs + tests (22 pytest pass; tests/e2e/smoke.py)
- [x] Stage 6 - release ZIP built and verified (see final message)

## Blockers
(none yet)

## Test results actually run (sandbox)
- pnpm install --frozen-lockfile: pass; pnpm run typecheck: pass; api-server build: pass; frontend build: pass
- python -m pytest: 22 passed (18 original + 4 asset/catalog tests)
- Chromium (software WebGL): 5 routes load, GLB loads, demo -> predict -> select LAD/RCA -> SHAP; API-down failure keeps profile; no horizontal overflow at 390/1024/1440 px; no console/page errors
- NOT run: Docker build, retraining, GPU rendering, screen-reader testing
