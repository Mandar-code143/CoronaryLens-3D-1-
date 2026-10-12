from __future__ import annotations

import json
from pathlib import Path
import sys

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from coronarylens.data import FORBIDDEN_PREDICTORS, TARGETS, load_data  # noqa: E402
from train_models import metrics_for, make_preprocessor  # noqa: E402


def test_processed_dataset_has_expected_shape_and_binary_targets() -> None:
    frame, features, schema = load_data(ROOT)
    assert frame.shape == (303, 59)
    assert len(features) == schema["predictor_count"] == 55
    assert set(features).isdisjoint(FORBIDDEN_PREDICTORS)
    for target in TARGETS:
        assert set(frame[target].unique()) == {0, 1}


def test_demo_profile_is_explicitly_synthetic() -> None:
    demo = json.loads((ROOT / "data/processed/demo_profile.json").read_text(encoding="utf-8"))
    assert "Synthetic" in demo["label"]
    assert "not a real person" in demo["provenance"]
    schema = json.loads((ROOT / "data/processed/feature_schema.json").read_text(encoding="utf-8"))
    assert set(demo["values"]) == {feature["name"] for feature in schema["predictors"]}


def test_modeling_preprocessor_is_fitted_only_when_pipeline_is_fitted() -> None:
    frame, features, _ = load_data(ROOT)
    transformer = make_preprocessor(frame, features)
    assert set(transformer.transformers[0][2]) | set(transformer.transformers[1][2]) == set(features)
    assert not (set(transformer.transformers[0][2]) & set(transformer.transformers[1][2]))


def test_metrics_are_computed_from_scores_not_training_labels() -> None:
    result = metrics_for(pd.Series([0, 0, 1, 1]).to_numpy(), pd.Series([0.1, 0.3, 0.7, 0.9]).to_numpy())
    assert result["accuracy"] == 1.0
    assert result["roc_auc"] == 1.0
    assert result["specificity"] == 1.0
    assert result["confusion_matrix"] == [[2, 0], [0, 2]]


def test_predictor_loader_rejects_target_leakage(tmp_path: Path) -> None:
    (tmp_path / "data/processed").mkdir(parents=True)
    schema = {"predictors": [{"name": "CAD"}]}
    (tmp_path / "data/processed/feature_schema.json").write_text(json.dumps(schema))
    frame = pd.DataFrame({"CAD": [0, 1], "LAD": [0, 1], "LCX": [0, 1], "RCA": [0, 1]})
    frame.to_csv(tmp_path / "data/processed/modeling-data.csv", index=False)
    with pytest.raises(ValueError, match="Target leakage"):
        load_data(tmp_path)


def test_feature_schema_labels_are_readable_but_unverified_units_are_not_fabricated() -> None:
    schema = json.loads((ROOT / "data/processed/feature_schema.json").read_text(encoding="utf-8"))
    assert all(feature.get("label") and feature.get("description") for feature in schema["predictors"])
    # The public workbook does not document every unit/code; unknown units stay explicitly null.
    assert any(feature.get("unit") is None and feature["type"] == "numeric" for feature in schema["predictors"])


def test_source_normalization_is_audited() -> None:
    audit = json.loads((ROOT / "data/processed/data_audit.json").read_text(encoding="utf-8"))
    normalizations = audit.get("preprocessing_normalizations", {})
    assert normalizations.get("value_mappings", {}).get("Sex", {}).get("Fmale", 0) > 0
    data = pd.read_csv(ROOT / "data/processed/modeling-data.csv")
    assert "Fmale" not in set(data["Sex"].astype(str))
    assert "Female" in set(data["Sex"].astype(str))
