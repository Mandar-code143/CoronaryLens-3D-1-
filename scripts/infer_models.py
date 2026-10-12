#!/usr/bin/env python3
"""JSON-in/JSON-out research inference adapter for already generated model artifacts.

The Express route invokes this script as a short-lived subprocess. It is intentionally
strict: every schema predictor must be supplied, target fields are forbidden, and the
registry/model/artifact hashes are checked before inference.
"""
from __future__ import annotations

import hashlib
import json
import sys
import uuid
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from coronarylens.data import PROCESSED, ROOT, TARGETS, FORBIDDEN_PREDICTORS, load_json

ARTIFACT_DIR = PROCESSED / "model_artifacts"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare_profile(raw: Any, schema: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("values must be a JSON object")
    supplied_targets = FORBIDDEN_PREDICTORS.intersection(raw.keys())
    if supplied_targets:
        raise ValueError(f"outcome fields are forbidden predictors: {sorted(supplied_targets)}")
    predictors = schema.get("predictors")
    if not isinstance(predictors, list) or not predictors:
        raise ValueError("schema has no predictor definitions")
    expected = {feature["name"] for feature in predictors}
    supplied = set(raw)
    missing = sorted(expected - supplied)
    extra = sorted(supplied - expected)
    if missing or extra:
        raise ValueError(json.dumps({"message": "profile keys do not match the predictor schema", "missing": missing, "extra": extra}))
    normalized: dict[str, Any] = {}
    errors: dict[str, str] = {}
    frame_header = pd.read_csv(PROCESSED / "modeling-data.csv", nrows=1)
    numeric_training_columns = {
        column for column in frame_header.columns
        if pd.api.types.is_numeric_dtype(frame_header[column])
    }
    for feature in predictors:
        name = feature["name"]
        value = raw[name]
        if value is None or value == "":
            errors[name] = "required value is missing"
            continue
        ftype = feature.get("type")
        categories = feature.get("categories") or []
        if categories:
            category = str(value)
            if category not in categories:
                errors[name] = f"must be one of {categories}"
                continue
            # The training CSV inferred numeric columns as numbers even where the UI
            # schema models small integer codes as categories. Recover that train dtype.
            if name in numeric_training_columns:
                try:
                    numeric = float(category)
                    normalized[name] = int(numeric) if numeric.is_integer() else numeric
                except ValueError:
                    errors[name] = "category cannot be coerced to the dataset's numeric representation"
            else:
                normalized[name] = category
        elif ftype in ("numeric", "ordinal"):
            if isinstance(value, bool):
                errors[name] = "boolean is not a numeric value"
                continue
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                errors[name] = "must be numeric"
                continue
            if not np.isfinite(numeric):
                errors[name] = "must be a finite number"
                continue
            minimum, maximum = feature.get("minimum"), feature.get("maximum")
            if minimum is not None and numeric < minimum:
                errors[name] = f"must be at least {minimum}"
                continue
            if maximum is not None and numeric > maximum:
                errors[name] = f"must be at most {maximum}"
                continue
            normalized[name] = numeric
        else:
            normalized[name] = value
    if errors:
        raise ValueError(json.dumps({"message": "profile validation failed", "fields": errors}))
    return normalized


def load_verified_models(schema: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    registry_path = ARTIFACT_DIR / "model_registry.json"
    evaluation_path = ARTIFACT_DIR / "evaluation.json"
    if not registry_path.exists() or not evaluation_path.exists():
        raise FileNotFoundError("Model registry/evaluation artifacts are missing; run scripts/train_models.py")
    registry = load_json(registry_path)
    evaluation = load_json(evaluation_path)
    manifest_path = ARTIFACT_DIR / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError("Model manifest is missing; regenerate the model artifact bundle")
    manifest = load_json(manifest_path)
    csv_path = PROCESSED / "modeling-data.csv"
    schema_path = PROCESSED / "feature_schema.json"
    current_dataset_hash = sha256(csv_path)
    current_schema_hash = sha256(schema_path)
    manifest_files = manifest.get("files", {})
    required_manifest_files = {
        "cad_pipeline.joblib", "lad_pipeline.joblib", "lcx_pipeline.joblib", "rca_pipeline.joblib",
        "model_registry.json", "evaluation.json", "candidate_screening_oof_predictions.csv",
        "nested_oof_predictions.csv",
    }
    if not isinstance(manifest_files, dict) or not required_manifest_files.issubset(manifest_files):
        missing_manifest_files = sorted(required_manifest_files - set(manifest_files if isinstance(manifest_files, dict) else {}))
        raise ValueError(f"model manifest is incomplete; missing required checksums: {missing_manifest_files}")
    for relative_name, expected_hash in manifest_files.items():
        if not isinstance(relative_name, str) or Path(relative_name).name != relative_name:
            raise ValueError("model manifest contains an invalid filename")
        listed_path = ARTIFACT_DIR / relative_name
        if not listed_path.is_file() or not isinstance(expected_hash, str) or sha256(listed_path) != expected_hash:
            raise ValueError(f"manifest checksum mismatch for {relative_name}")
    if registry.get("dataset_checksum") != current_dataset_hash:
        raise ValueError("model registry dataset checksum does not match the current processed CSV")
    if evaluation.get("dataset_checksum") != current_dataset_hash:
        raise ValueError("evaluation dataset checksum does not match the current processed CSV")
    if registry.get("feature_schema_version") != schema.get("schema_version"):
        raise ValueError("model registry feature schema version does not match the active schema")
    if evaluation.get("feature_schema_version") != schema.get("schema_version"):
        raise ValueError("evaluation feature schema version does not match the active schema")
    if registry.get("feature_schema_checksum") != current_schema_hash or evaluation.get("feature_schema_checksum") != current_schema_hash:
        raise ValueError("model registry/evaluation feature schema checksum does not match the active schema")
    if registry.get("training_sample_count") != evaluation.get("sample_count"):
        raise ValueError("registry and evaluation sample counts do not match")
    entries = {item.get("target"): item for item in registry.get("targets", []) if isinstance(item, dict)}
    if set(entries) != set(TARGETS):
        raise ValueError("model registry must contain exactly CAD, LAD, LCX and RCA")
    models: dict[str, Any] = {}
    for target in TARGETS:
        entry = entries[target]
        file_name = entry.get("artifact_file")
        expected_hash = entry.get("artifact_sha256")
        if not isinstance(file_name, str) or Path(file_name).name != file_name:
            raise ValueError(f"invalid artifact filename for {target}")
        model_path = ARTIFACT_DIR / file_name
        if not model_path.is_file():
            raise FileNotFoundError(f"model file missing for {target}: {file_name}")
        if not isinstance(expected_hash, str) or sha256(model_path) != expected_hash:
            raise ValueError(f"artifact checksum mismatch for {target}")
        models[target] = joblib.load(model_path)
    if not isinstance(evaluation.get("targets"), list) or {item.get("target") for item in evaluation["targets"] if isinstance(item, dict)} != set(TARGETS):
        raise ValueError("evaluation report must include each of the four targets")
    return models, registry


def load_profile_and_models(values: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    schema = load_json(PROCESSED / "feature_schema.json")
    profile = prepare_profile(values, schema)
    models, registry = load_verified_models(schema)
    return profile, models, registry


def predict(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload.get("values"), dict):
        raise ValueError("values must be a JSON object")
    profile, models, registry = load_profile_and_models(payload["values"])
    schema = load_json(PROCESSED / "feature_schema.json")
    X = pd.DataFrame([profile], columns=[item["name"] for item in schema["predictors"]])
    outputs: dict[str, Any] = {}
    registry_targets = {item["target"]: item for item in registry["targets"]}
    positive_labels = {"CAD": "CAD", "LAD": "Stenotic", "LCX": "Stenotic", "RCA": "Stenotic"}
    negative_labels = {"CAD": "Normal", "LAD": "Normal", "LCX": "Normal", "RCA": "Normal"}
    for target in TARGETS:
        model = models[target]
        probability = float(model.predict_proba(X)[0, 1])
        if not np.isfinite(probability) or probability < 0 or probability > 1:
            raise ValueError(f"model {target} returned an invalid probability")
        entry = registry_targets[target]
        outputs[target] = {
            "score": probability,
            "score_semantics": "probability",
            "model_family": entry["model_family"],
            "model_version": entry["model_version"],
            "threshold": 0.5,
            "predicted_class": positive_labels[target] if probability >= 0.5 else negative_labels[target],
        }
    return {
        "request_id": str(uuid.uuid4()),
        "registry_version": registry["version"],
        "outputs": outputs,
        "warnings": [
            "Research-only model estimates; not a diagnosis, treatment recommendation or clinical risk assessment.",
            "Models were selected using internal out-of-fold evaluation on a small retrospective cohort; external validation is absent.",
            "Threshold 0.5 is a software default, not a clinically validated operating point.",
            "3D anatomy is schematic and does not localize a patient's lesions.",
        ],
    }


def explain(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute approximate, model-agnostic permutation SHAP values for one target.

    SHAP operates on the numeric model-input matrix after preprocessing, then encoded
    columns are summed back to their originating predictors. A fixed, sampled set of
    observed cohort rows forms the background. This is an approximate attribution, not
    a causal explanation; marginal masking can create implausible feature combinations.
    """
    try:
        import shap
    except ImportError as exc:  # dependency is pinned in requirements-research.txt
        raise RuntimeError("SHAP is unavailable; install requirements-research.txt before requesting explanations") from exc

    values = payload.get("values")
    target = payload.get("target")
    request_id = payload.get("prediction_request_id")
    if target not in TARGETS:
        raise ValueError("target must be CAD, LAD, LCX or RCA")
    if not isinstance(request_id, str) or not request_id.strip():
        raise ValueError("prediction_request_id is required")
    if not isinstance(values, dict):
        raise ValueError("values must be a JSON object")

    profile, models, registry = load_profile_and_models(values)
    schema = load_json(PROCESSED / "feature_schema.json")
    training = pd.read_csv(PROCESSED / "modeling-data.csv")
    columns = [item["name"] for item in schema["predictors"]]
    submitted_frame = pd.DataFrame([profile], columns=columns)
    model_pipeline = models[target]
    preprocessor = model_pipeline.named_steps["preprocess"]
    estimator = model_pipeline.named_steps["model"]
    positive_labels = {"CAD": "CAD", "LAD": "Stenotic", "LCX": "Stenotic", "RCA": "Stenotic"}
    submitted_matrix = np.asarray(preprocessor.transform(submitted_frame), dtype=float)
    submitted_probability = float(estimator.predict_proba(submitted_matrix)[0, 1])

    background_size = min(60, len(training))
    background_frame = training[columns].sample(n=background_size, random_state=1431).reset_index(drop=True)
    background_matrix = np.asarray(preprocessor.transform(background_frame), dtype=float)
    if background_matrix.ndim != 2 or submitted_matrix.ndim != 2 or background_matrix.shape[1] != submitted_matrix.shape[1]:
        raise ValueError("Preprocessor returned an incompatible transformed feature matrix")

    explainer = shap.PermutationExplainer(
        lambda matrix: estimator.predict_proba(np.asarray(matrix, dtype=float))[:, 1],
        background_matrix,
        seed=1431,
    )
    transformed_count = int(submitted_matrix.shape[1])
    # Six forward/reverse feature permutations; stable seed for reproducible demos.
    shap_result = explainer(
        submitted_matrix,
        max_evals=(2 * transformed_count + 1) * 6,
        silent=True,
    )
    shap_values = np.asarray(shap_result.values, dtype=float).reshape(-1)
    transformed_names = list(preprocessor.get_feature_names_out())
    if len(shap_values) != len(transformed_names):
        raise ValueError("SHAP output count does not match transformed feature names")

    # Sum one-hot columns back to their source predictor so the UI uses schema labels.
    source_names_by_length = sorted(columns, key=len, reverse=True)
    grouped: dict[str, float] = {name: 0.0 for name in columns}
    for transformed_name, contribution in zip(transformed_names, shap_values, strict=True):
        source_name = transformed_name.split("__", 1)[-1]
        matches = [
            name for name in source_names_by_length
            if source_name == name or source_name.startswith(name + "_")
        ]
        if not matches:
            raise ValueError(f"Could not map transformed SHAP feature back to a source predictor: {transformed_name}")
        grouped[matches[0]] += float(contribution)

    feature_by_name = {item["name"]: item for item in schema["predictors"]}
    ranked = sorted(grouped.items(), key=lambda item: abs(item[1]), reverse=True)
    contributions = []
    for name, contribution in ranked[:12]:
        feature = feature_by_name[name]
        contributions.append({
            "feature": name,
            "label": feature.get("label") or name,
            "value": profile[name],
            "contribution": float(contribution),
            "direction": "toward_positive" if contribution >= 0 else "toward_negative",
            "output_space": "grouped SHAP contribution in positive-class probability space",
            "description": (
                "Approximate permutation SHAP value, aggregated across any encoded columns for this source predictor. "
                "Positive values move the model output above its background expectation; negative values move it below. "
                "This is not causal, and correlated inputs can make marginal masking unrealistic."
            ),
        })

    entry_by_target = {entry["target"]: entry for entry in registry["targets"]}
    base_values = np.asarray(shap_result.base_values, dtype=float).reshape(-1)
    baseline_score = float(base_values[0]) if len(base_values) else float(np.mean(estimator.predict_proba(background_matrix)[:, 1]))
    full_attribution_sum = float(np.sum(shap_values))
    additivity_residual = float((submitted_probability - baseline_score) - full_attribution_sum)
    return {
        "target": target,
        "prediction_request_id": request_id,
        "model_version": entry_by_target[target]["model_version"],
        "method": "Approximate permutation SHAP (grouped by source predictor)",
        "baseline": f"Mean model output for {background_size} fixed-seed observed cohort profiles",
        "baseline_score": baseline_score,
        "prediction_score": submitted_probability,
        "full_attribution_sum": full_attribution_sum,
        "additivity_residual": additivity_residual,
        "output_space": "positive-class probability; grouped SHAP values approximately sum to prediction minus background baseline",
        "limitations": [
            "Attributions are approximate permutation SHAP values, not causal effects or medical explanations.",
            "SHAP values use a 60-or-fewer row sample from the same small training cohort as reference background.",
            "Marginal feature masking can create unrealistic combinations when predictors are correlated.",
            "Categorical encoded-column attributions are summed to original source predictors; group sums can hide within-category detail.",
            "The positive-class model outputs may be poorly calibrated and must not be interpreted as individual clinical risk.",
            "The cohort is small and retrospective; no external or prospective clinical validation has been performed.",
        ],
        "contributions": contributions,
    }

def main() -> int:
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        action = payload.get("action", "predict")
        if action == "predict":
            result = predict(payload)
        elif action == "explain":
            result = explain(payload)
        else:
            raise ValueError("action must be 'predict' or 'explain'")
        print(json.dumps({"ok": True, "result": result}, allow_nan=False))
        return 0
    except FileNotFoundError as exc:
        print(json.dumps({"ok": False, "code": "ARTIFACTS_MISSING", "error": str(exc)}))
        return 2
    except Exception as exc:  # boundary converts errors to safe JSON; never print sensitive input
        print(json.dumps({"ok": False, "code": "INFERENCE_FAILED", "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
