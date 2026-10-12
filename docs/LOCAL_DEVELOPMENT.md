# Local development

Requirements: Node 22+, pnpm 10.12.1 (`corepack enable`), Python 3.13 (3.12 also worked) with `pip install -r requirements-research.txt`.

## Windows PowerShell
```powershell
cd CoronaryLens-3D-Release
corepack enable
corepack prepare pnpm@10.12.1 --activate
pnpm install --frozen-lockfile
python -m pip install -r requirements-research.txt
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/coronarylens-3d run build
python -m pytest
# one process serves API + built frontend on http://localhost:8080
$env:PORT = "8080"; $env:PYTHON_BIN = "python"
node artifacts/api-server/dist/index.mjs
```
Dev mode (hot reload): terminal 1 `node artifacts/api-server/dist/index.mjs` (port 8080); terminal 2 `$env:PORT=5173; pnpm --filter @workspace/coronarylens-3d run dev` - Vite proxies `/api` to `API_PROXY_TARGET` (default `http://127.0.0.1:8080`).

## Linux / macOS
Same commands; use `export PORT=8080`. `PYTHON_BIN` defaults to `python3`.

## Rebuilding the anatomy asset (optional)
Needs Blender 4.x as `bpy` (Python 3.11): `python tools/anatomy/build_heart_glb.py <Z-Anatomy/Startup.blend> out.glb`. See `ANATOMY_ASSET.md`.
