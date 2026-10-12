"""The bundled anatomy asset must match the structure catalog the viewer relies on."""
from __future__ import annotations

import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "artifacts/coronarylens-3d"
GLB = APP / "public/models/coronary-heart.glb"


def glb_json() -> dict:
    data = GLB.read_bytes()
    magic, version, _length = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF" and version == 2
    chunk_len, chunk_type = struct.unpack("<I4s", data[12:20])
    assert chunk_type == b"JSON"
    return json.loads(data[20:20 + chunk_len])


def catalog_ids() -> list[str]:
    src = (APP / "src/anatomy.ts").read_text(encoding="utf-8")
    src = src.split("export const NODES")[1].split("export const NODE_BY_ID")[0]
    return re.findall(r"\{ id: '([a-z_]+)', label:", src)


def test_glb_is_local_and_reasonably_sized() -> None:
    assert GLB.is_file()
    assert GLB.stat().st_size < 8 * 1024 * 1024


def test_every_catalog_structure_is_a_named_glb_node() -> None:
    names = {n.get("name") for n in glb_json()["nodes"]}
    missing = [i for i in catalog_ids() if i not in names]
    assert len(catalog_ids()) >= 25
    assert not missing, f"catalog ids missing from GLB: {missing}"


def test_artery_targets_map_to_the_expected_named_vessels() -> None:
    src = (APP / "src/anatomy.ts").read_text(encoding="utf-8")
    assert "id: 'coronary_lad', label: 'Left anterior descending artery (LAD)', layer: 'coronary', kind: 'coronary', target: 'LAD'" in src
    assert "id: 'coronary_lcx', label: 'Left circumflex artery (LCX)', layer: 'coronary', kind: 'coronary', target: 'LCX'" in src
    assert "id: 'coronary_rca', label: 'Right coronary artery (RCA)', layer: 'coronary', kind: 'coronary', target: 'RCA'" in src
    assert "target: 'CAD'" not in src.split("export const NODES")[1].split("export const NODE_BY_ID")[0]


def test_attribution_and_license_files_exist() -> None:
    notice = (ROOT / "docs/THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
    asset = (ROOT / "docs/ANATOMY_ASSET.md").read_text(encoding="utf-8")
    for text in (notice, asset):
        assert "CC BY-SA 4.0" in text and "BodyParts3D" in text
