# Same-origin research demo. Verify with a clean docker build before publishing.
FROM node:22-bookworm-slim AS web-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY data ./data
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/coronarylens-3d run build
RUN pnpm --filter @workspace/api-server run build

FROM node:22-bookworm-slim AS node-runtime

FROM python:3.13-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libatomic1 libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN pip install --no-cache-dir numpy==2.3.5 joblib==1.5.3 openpyxl==3.1.5 pandas==2.2.3 scikit-learn==1.8.0 shap==0.50.0
COPY --from=web-build /app/package.json ./package.json
COPY --from=web-build /app/node_modules ./node_modules
COPY --from=web-build /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=web-build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=web-build /app/artifacts/coronarylens-3d/dist/public ./artifacts/coronarylens-3d/dist/public
COPY --from=web-build /app/data ./data
COPY --from=web-build /app/scripts ./scripts
# If the model bundle was omitted from a source export, regenerate it at build time.
RUN if [ ! -f data/processed/model_artifacts/manifest.json ]; then python3 scripts/train_models.py --folds 5 --inner-folds 3; fi
# Fail the image build if the included/generated model bundle cannot load and infer a demo response.
RUN python3 -c "import json,sys; sys.path.insert(0, 'scripts'); from infer_models import predict; p=json.load(open('data/processed/demo_profile.json', encoding='utf-8')); r=predict({'values':p['values']}); assert set(r['outputs']) == {'CAD','LAD','LCX','RCA'} and all(0 <= v['score'] <= 1 for v in r['outputs'].values()); print('Model bundle inference smoke test passed')"
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
