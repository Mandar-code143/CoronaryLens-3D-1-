# Third-party notices

## Anatomical model (bundled, derived)
* **Z-Anatomy** - The libre 3D atlas of anatomy - CC BY-SA 4.0, <https://github.com/Z-Anatomy/Models-of-human-anatomy>. `coronary-heart.glb` is a modified derivative and is therefore also offered under **CC BY-SA 4.0**. Changes are listed in `docs/ANATOMY_ASSET.md`.
* **BodyParts3D** - The Database Center for Life Science - CC-BY-SA 2.1 Japan, <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>. Upstream source of the Z-Anatomy meshes.

## Dataset
* Alizadehsani, R., Roshanzamir, M., Sani, Z. (2013). *Extension of Z-Alizadeh Sani dataset.* UCI Machine Learning Repository, DOI 10.24432/C5461K, CC BY 4.0. Original workbook retained in `data/raw/` with its checksum.

## Software (resolved versions in `pnpm-lock.yaml` / `requirements-research.txt`)
three.js (MIT), React and React DOM (MIT), wouter (BSD-2-Clause), TanStack Query (MIT), lucide-react (ISC), Vite (MIT), Express (MIT), pino (MIT), zod (MIT), scikit-learn (BSD-3-Clause), SHAP (MIT), pandas (BSD-3-Clause), NumPy (BSD-3-Clause), joblib (BSD-3-Clause). Blender (GPL) was used only as a build tool to produce the asset; no Blender code is shipped.

No external font service, CDN, image or texture is required at runtime.
