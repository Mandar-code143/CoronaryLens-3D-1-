# Anatomical asset: `coronary-heart.glb`

| | |
|---|---|
| Runtime file | `artifacts/coronarylens-3d/public/models/coronary-heart.glb` (3.88 MB, served locally, no remote URL) |
| Structure catalog | `artifacts/coronarylens-3d/src/anatomy.ts` (exact node-name matching; nothing is matched by order or position) |
| Per-node stats | `public/models/coronary-heart.manifest.json` |
| Rebuild script | `tools/anatomy/build_heart_glb.py` |

## Source and licence (verified from the source repository)

* **Z-Anatomy** – "The libre 3D atlas of anatomy", <https://github.com/Z-Anatomy/Models-of-human-anatomy> (file `Z-Anatomy.zip` -> `Z-Anatomy/Startup.blend`, branch `master`). Licence: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**, as stated in the repository `License.txt`/`Readme.md`.
* Z-Anatomy models derive from **BodyParts3D**, The Database Center for Life Science, **CC BY-SA 2.1 Japan**. The repository requires this attribution string: *"BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan"* and *"Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0"*.
* Because the licence is ShareAlike, **this derived GLB is distributed under CC BY-SA 4.0**. The application source code keeps the repository's own licence; the two are separate works.

Checksums of the inputs used (SHA-256):

```
9f08a17ea0115fed80b2a73ecdf0a1bc2ab2f6956f37c593ce23d513ea35afcd  /tmp/zx/Z-Anatomy/Startup.blend
e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736  /tmp/Z-Anatomy.zip
e22b109d025b8133b20ce056ad5c8231d3e30582afa5106a9747a67daa19b6fa  artifacts/coronarylens-3d/public/models/coronary-heart.glb
```

## Candidates not used

Sketchfab and NIH 3D pages could not be reached from the build environment (network allow-list), so their licences could not be inspected and **nothing from them is bundled**. Z-Anatomy was verified directly and used instead.

## What was extracted

28 -> 26 named parts (after removing the left common carotid and left subclavian stubs): the four chambers (LV, RV, LA, RA), ascending aorta, arch, descending thoracic aorta, brachiocephalic trunk, pulmonary trunk, bifurcation, left/right pulmonary arteries, superior vena cava, four pulmonary veins, **left main coronary artery, LAD (anterior interventricular) with septal branches, LCX (circumflex), RCA with right inferolateral branch**, great and middle cardiac veins and coronary sinus. In Z-Anatomy the coronary arteries and great vessels are bevelled curve objects; they were evaluated to meshes in Blender 4.5 (`bpy`).

## Modifications

1. Curve objects converted to triangle meshes with Blender's evaluated depsgraph; chambers use the atlas' own subdivision-surface modifier result.
2. All objects baked to world space, recentred on the model bounds, scaled x10 (1 unit ~ 10 cm), exported Z-up -> glTF Y-up (anterior = +Z, patient's left = +X).
3. **Coronary tube calibre multiplied by 1.8** for legibility (the atlas tubes are ~1 mm wide). Calibre is therefore not anatomically measured.
4. Smooth shading; neutral placeholder materials (the viewer assigns its own PBR materials at runtime).
5. Removed: valve leaflets, papillary muscles, carotid/subclavian stubs, everything else in the atlas.

Size/performance: 212,271 triangles, 107k vertices, 3.88 MB uncompressed. Renders on demand (no constant animation).

## Anatomical limitations

* A generic atlas heart, **not patient-specific**; no imaging was used.
* Only branches modelled in the atlas exist (no named diagonal or obtuse-marginal branches). Left main is shown as its own node but is not a prediction target.
* Colour on LAD/LCX/RCA encodes that artery's *model score* only. It is not a lesion, stenosis or blockage. CAD (overall) is never painted on an artery.
* Valves and internal structures are absent. Not a clinical or surgical reference.
