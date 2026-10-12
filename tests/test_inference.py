from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from infer_models import prepare_profile, predict, explain  # noqa: E402
from coronarylens.data import load_json  # noqa: E402

SCHEMA = load_json(ROOT / "data/processed/feature_schema.json")
DEMO = load_json(ROOT / "data/processed/demo_profile.json")["values"]


def test_profile_normalizes_schema_categories_to_training_dtypes() -> None:
    normalized = prepare_profile(DEMO, SCHEMA)
    assert isinstance(normalized["Age"], float)
    assert isinstance(normalized["DM"], int)
    assert normalized["Sex"] in {"Male", "Female"}


def test_profile_rejects_outcome_leakage() -> None:
    values = dict(DEMO)
    values["CAD"] = 1
    with pytest.raises(ValueError, match="outcome fields are forbidden"):
        prepare_profile(values, SCHEMA)


def test_profile_requires_exact_predictor_schema() -> None:
    values = dict(DEMO)
    values.pop("Age")
    with pytest.raises(ValueError, match="profile keys do not match"):
        prepare_profile(values, SCHEMA)


def test_profile_rejects_out_of_range_numeric_values() -> None:
    values = dict(DEMO)
    values["Age"] = 200
    with pytest.raises(ValueError, match="profile validation failed"):
        prepare_profile(values, SCHEMA)


def test_profile_rejects_unknown_categories() -> None:
    values = dict(DEMO)
    values["Sex"] = "unknown-value"
    with pytest.raises(ValueError, match="profile validation failed"):
        prepare_profile(values, SCHEMA)


def test_trained_research_models_predict_four_finite_outputs() -> None:
    result = predict({"values": DEMO})
    assert set(result["outputs"]) == {"CAD", "LAD", "LCX", "RCA"}
    assert all(0.0 <= item["score"] <= 1.0 for item in result["outputs"].values())
    assert all(item["score_semantics"] == "probability" for item in result["outputs"].values())
    assert any("Research-only" in warning for warning in result["warnings"])


def test_explanation_is_bound_to_requested_request_id_and_is_caveated() -> None:
    result = explain({"values": DEMO, "target": "CAD", "prediction_request_id": "request-test-1"})
    assert result["prediction_request_id"] == "request-test-1"
    assert result["target"] == "CAD"
    assert "permutation shap" in result["method"].lower()


def test_default_profile_produces_visible_sensitivity_items_for_every_target() -> None:
    for target in ("CAD", "LAD", "LCX", "RCA"):
        result = explain({"values": DEMO, "target": target, "prediction_request_id": f"request-{target}"})
        assert "permutation shap" in result["method"].lower()
        assert len(result["contributions"]) > 0
        assert all(item["feature"] in DEMO for item in result["contributions"])
        assert all("SHAP" in item["description"] for item in result["contributions"])
        assert abs(result["additivity_residual"]) < 1e-6


def test_served_model_names_reflect_the_actual_fitted_estimator() -> None:
    result = predict({"values": DEMO})
    assert result["outputs"]["CAD"]["model_family"] == "logistic-regression"
    assert result["outputs"]["RCA"]["model_family"] == "extra-trees"
    assert all("nested-model-selection" not in item["model_family"] for item in result["outputs"].values())


def test_nested_evaluation_bundle_has_complete_finite_oof_predictions() -> None:
    import numpy as np

    artifact_dir = ROOT / "data/processed/model_artifacts"
    evaluation = json.loads((artifact_dir / "evaluation.json").read_text(encoding="utf-8"))
    predictions = pd.read_csv(artifact_dir / "nested_oof_predictions.csv")
    required_metrics = {"accuracy", "precision", "recall", "f1", "roc_auc"}
    assert "nested stratified cross-validation" in evaluation["validation_method"]
    assert len(predictions) == 303 * 4
    assert predictions.groupby("target").size().to_dict() == {"CAD": 303, "LAD": 303, "LCX": 303, "RCA": 303}
    assert not predictions.duplicated(["target", "row_index"]).any()
    assert np.isfinite(predictions["y_score"]).all()
    assert predictions["y_score"].between(0, 1).all()
    registry = json.loads((artifact_dir / "model_registry.json").read_text(encoding="utf-8"))
    registry_by_target = {item["target"]: item for item in registry["targets"]}
    for item in evaluation["targets"]:
        assert required_metrics.issubset(item["metrics"])
        assert all(np.isfinite(item["metrics"][key]) for key in required_metrics)
        # The report is nested-selection performance; it must not imply that every
        # fold used the single final full-cohort serving estimator.
        assert item["model_family"].startswith("nested-model-selection")
        assert item["serving_model_family"] == registry_by_target[item["target"]]["model_family"]


def test_model_manifest_and_data_schema_hashes_are_consistent() -> None:
    import hashlib

    artifact_dir = ROOT / "data/processed/model_artifacts"
    sha256 = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = json.loads((artifact_dir / "manifest.json").read_text(encoding="utf-8"))
    registry = json.loads((artifact_dir / "model_registry.json").read_text(encoding="utf-8"))
    evaluation = json.loads((artifact_dir / "evaluation.json").read_text(encoding="utf-8"))
    for name, digest in manifest["files"].items():
        assert sha256(artifact_dir / name) == digest
    assert registry["dataset_checksum"] == sha256(ROOT / "data/processed/modeling-data.csv")
    assert evaluation["dataset_checksum"] == registry["dataset_checksum"]
    schema_hash = sha256(ROOT / "data/processed/feature_schema.json")
    assert registry["feature_schema_checksum"] == schema_hash
    assert evaluation["feature_schema_checksum"] == schema_hash
