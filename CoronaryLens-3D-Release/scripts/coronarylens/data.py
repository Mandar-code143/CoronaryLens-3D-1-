"""Shared, leakage-conscious data loading for the CoronaryLens research pipeline."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
TARGETS = ("CAD", "LAD", "LCX", "RCA")
FORBIDDEN_PREDICTORS = frozenset({"CAD", "Cath", "LAD", "LCX", "RCA"})


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return value


def load_data(root: Path = ROOT) -> tuple[pd.DataFrame, list[str], dict[str, Any]]:
    processed = root / "data" / "processed"
    frame = pd.read_csv(processed / "modeling-data.csv")
    schema = load_json(processed / "feature_schema.json")
    features = [item["name"] for item in schema.get("predictors", [])]
    if not features:
        raise ValueError("Feature schema has no predictors")
    if len(features) != len(set(features)):
        raise ValueError("Feature schema contains duplicate predictor names")
    if set(features) & FORBIDDEN_PREDICTORS:
        raise ValueError("Target leakage: forbidden outcome column listed as a predictor")
    missing = (set(features) | set(TARGETS)) - set(frame.columns)
    if missing:
        raise ValueError(f"Modeling dataset is missing required columns: {sorted(missing)}")
    if frame[list(TARGETS)].isna().any().any():
        raise ValueError("Modeling dataset contains missing target labels")
    for target in TARGETS:
        unique = set(frame[target].dropna().unique())
        if not unique <= {0, 1}:
            raise ValueError(f"Target {target} must be encoded as binary 0/1, got {unique}")
    if len(frame) < 30:
        raise ValueError("Dataset unexpectedly small; refusing to run model training")
    return frame, features, schema
