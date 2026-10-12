# Deployment readiness and deployment shape

## Do not deploy as a clinical service

CoronaryLens currently supports a research demonstration only. Its public dataset is small and retrospective, the clinical field semantics are not all verified, and no external/prospective validation is available. A deployable web demo is not equivalent to a deployable clinical model.

## Option A: same-origin Docker container

The repository includes a Dockerfile intended to build the Vite frontend and Express API, include the Python research dependencies/artifacts, validate (or regenerate if missing) the model bundle during image build, run an inference smoke test, and serve the frontend and API from port 8080. Test this image with a clean Docker build before relying on it: this environment could not fetch packages from npm/PyPI and could not execute the container build.

## Option B: two services

1. **Frontend static hosting**: build `@workspace/coronarylens-3d` with `BASE_PATH=/`; publish `artifacts/coronarylens-3d/dist/public`.
2. **API service**: build and run `@workspace/api-server` with `PORT` supplied by the platform. Route `/api/*` to that service, or configure the client to use an explicit API base URL and enable a narrow CORS allowlist.
3. **Health vs readiness**: use `/api/health` for liveness and `/api/ready` for required research artifact status. A healthy process can correctly be unready for predictions.
4. **Artifacts**: package only versioned, checksum-verified artifacts. Do not assume ignored local binaries exist on the deploy platform. The Python inference adapter is included and checks schema, processed-data compatibility, the full model manifest, and checksums before returning research estimates. The versioned model bundle should be kept with the source when pushing to Git; Docker can regenerate it if absent.
5. **Configuration**: use platform secret/configuration settings, not checked-in `.env` files. No database is currently required by the implemented routes.

## Pre-deploy checklist

- [ ] Frozen dependency install succeeds from a clean checkout.
- [ ] Typecheck, frontend build, API build and Python tests pass in CI.
- [ ] Deployment build contains all runtime dependencies and data assets needed by each process.
- [ ] `/api/health` succeeds and `/api/ready` truthfully reports blockers.
- [ ] Frontend routing and API routing work under the actual public URL/base path.
- [ ] Browser console has no uncaught errors or missing assets.
- [ ] HTTPS, CORS, security headers, request size limits, rate limits and observability are configured.
- [ ] Research-only notice is clearly visible.
- [ ] No credentials, patient data, generated binary artifacts or private source data are accidentally published.
- [ ] A live smoke test is recorded after deployment.

## Remaining production integration work

The API includes a Python subprocess adapter for `/predict` and `/explain/:target`. `/api/ready` reports operational research-artifact readiness only when the four model pipelines, registry, evaluation report, schema, processed dataset and checksums are compatible. An operationally ready demo remains clinically unvalidated. Explanation requests must reference a recent prediction from the same running API process and supply the identical profile; raw profile values are not persisted by the request-binding store. Do not add a fake fallback score to make the demo look complete.


### Model artifact compatibility

The bundled `.joblib` models were generated and smoke-tested with Python 3.13, scikit-learn 1.8.0, pandas 2.2.3, joblib 1.5.3, and openpyxl 3.1.5. The Dockerfile pins these versions for inference because Python model serialization is version-sensitive. If you retrain under different package versions, regenerate the model bundle and retest the image before deployment. Do not treat a successful container build as clinical validation.

## Docker (same-origin image)
```bash
docker build -t coronarylens-3d .
docker run --rm -p 8080:8080 coronarylens-3d   # http://localhost:8080
```
The build runs an image-time inference smoke test on the demo profile. The anatomy GLB ships inside the static frontend (`dist/public/models`). **Note:** this Dockerfile was not built in the environment that produced this release; run the command above (or the CI `container-build` job) to confirm.

Health vs readiness: `GET /api/healthz` = process is alive; `GET /api/ready` = artifacts, checksums and inference adapter verified. Use `/api/ready` for orchestrator readiness probes.
