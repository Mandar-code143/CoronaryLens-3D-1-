#!/usr/bin/env python3
"""JSON-in/JSON-out research inference adapter for CoronaryLens model artifacts.

Evaluates trained pipelines, applies honest Platt calibration, reports target-specific
operating thresholds, risk bands, exact model-aware SHAP attributions, and plain-language
clinical push/pull summaries.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from typing import Any
import uuid

import joblib
import numpy as np
import pandas as pd

from coronarylens.calibration import apply_platt
from coronarylens.data import FORBIDDEN_PREDICTORS, PROCESSED, TARGETS, load_json
from coronarylens.explain import (
    by_feature,
    make_explainer,
    plain_summary,
    shap_matrix,
    split_columns,
)

ARTIFACT_DIR = PROCESSED / "model_artifacts"

# Global in-memory cache to avoid redundant disk reads across repeated calls in warm runtimes
_CACHE: dict[str, Any] = {}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_match(path: Path, expected: str) -> bool:
    """Compare file sha256 with cross-platform CRLF/LF tolerance for text files."""
    if not path.is_file():
        return False
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() == expected:
        return True
    if path.suffix in (".csv", ".json", ".txt", ".md"):
        lf = content.replace(b"\r\n", b"\n")
        if hashlib.sha256(lf).hexdigest() == expected:
            return True
        crlf = lf.replace(b"\n", b"\r\n")
        if hashlib.sha256(crlf).hexdigest() == expected:
            return True
    return False


def risk_band(probability: float) -> str:
    """Categorize probability into descriptive risk bands (for decision-support display only)."""
    if probability < 0.33:
        return "Low"
    if probability < 0.66:
        return "Moderate"
    return "High"


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
        col for col in frame_header.columns
        if pd.api.types.is_numeric_dtype(frame_header[col])
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


def load_verified_bundle(schema: dict[str, Any]) -> dict[str, Any]:
    global _CACHE
    if _CACHE:
        return _CACHE

    registry_path = ARTIFACT_DIR / "model_registry.json"
    evaluation_path = ARTIFACT_DIR / "evaluation.json"
    manifest_path = ARTIFACT_DIR / "manifest.json"

    if not registry_path.exists() or not evaluation_path.exists():
        raise FileNotFoundError("Model registry/evaluation artifacts are missing; run scripts/train_models.py")
    if not manifest_path.is_file():
        raise FileNotFoundError("Model manifest is missing; regenerate the model artifact bundle")

    registry = load_json(registry_path)
    evaluation = load_json(evaluation_path)
    manifest = load_json(manifest_path)

    csv_path = PROCESSED / "modeling-data.csv"
    schema_path = PROCESSED / "feature_schema.json"
    current_dataset_hash = sha256(csv_path)
    current_schema_hash = sha256(schema_path)

    manifest_files = manifest.get("files", {})
    required_manifest_files = {
        "cad_pipeline.joblib", "lad_pipeline.joblib", "lcx_pipeline.joblib", "rca_pipeline.joblib",
        "model_registry.json", "evaluation.json", "nested_oof_predictions.csv",
    }
    if not isinstance(manifest_files, dict) or not required_manifest_files.issubset(manifest_files):
        missing = sorted(required_manifest_files - set(manifest_files if isinstance(manifest_files, dict) else {}))
        raise ValueError(f"model manifest is incomplete; missing required checksums: {missing}")

    for rel_name, expected_hash in manifest_files.items():
        listed_path = ARTIFACT_DIR / rel_name
        if not sha256_match(listed_path, expected_hash):
            raise ValueError(f"manifest checksum mismatch for {rel_name}")

    if not sha256_match(csv_path, registry.get("dataset_checksum", "")) or not sha256_match(csv_path, evaluation.get("dataset_checksum", "")):
        raise ValueError("model registry/evaluation dataset checksum does not match current modeling-data.csv")
    if registry.get("feature_schema_version") != schema.get("schema_version") or evaluation.get("feature_schema_version") != schema.get("schema_version"):
        raise ValueError("feature schema version does not match active schema")
    if not sha256_match(schema_path, registry.get("feature_schema_checksum", "")) or not sha256_match(schema_path, evaluation.get("feature_schema_checksum", "")):
        raise ValueError("feature schema checksum mismatch")

    entries = {item.get("target"): item for item in registry.get("targets", []) if isinstance(item, dict)}
    if set(entries) != set(TARGETS):
        raise ValueError("model registry must contain exactly CAD, LAD, LCX and RCA")

    models: dict[str, Any] = {}
    calibrators: dict[str, dict[str, float]] = {}
    operating_thresholds: dict[str, float] = {}

    for target in TARGETS:
        entry = entries[target]
        model_file = entry["artifact_file"]
        model_path = ARTIFACT_DIR / model_file
        models[target] = joblib.load(model_path)
        calibrators[target] = entry.get("calibrator") or {"coef": 1.0, "intercept": 0.0}
        operating_thresholds[target] = float(entry.get("operating_threshold", 0.5))

    bg_path = ARTIFACT_DIR / "shap_background.joblib"
    if bg_path.is_file():
        background = joblib.load(bg_path)
    else:
        training_df = pd.read_csv(csv_path)
        background = training_df[[p["name"] for p in schema["predictors"]]].sample(min(30, len(training_df)), random_state=42)

    features = [p["name"] for p in schema["predictors"]]
    num_cols, cat_cols = split_columns(features, background)

    _CACHE = {
        "models": models,
        "calibrators": calibrators,
        "operating_thresholds": operating_thresholds,
        "registry": registry,
        "evaluation": evaluation,
        "background": background,
        "num_cols": num_cols,
        "cat_cols": cat_cols,
    }
    return _CACHE


def predict(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload.get("values"), dict):
        raise ValueError("values must be a JSON object")
    schema = load_json(PROCESSED / "feature_schema.json")
    profile = prepare_profile(payload["values"], schema)
    bundle = load_verified_bundle(schema)

    features = [p["name"] for p in schema["predictors"]]
    X = pd.DataFrame([profile], columns=features)
    models = bundle["models"]
    calibrators = bundle["calibrators"]
    operating_thresholds = bundle["operating_thresholds"]
    registry = bundle["registry"]
    registry_targets = {item["target"]: item for item in registry["targets"]}

    positive_labels = {"CAD": "CAD", "LAD": "Stenotic", "LCX": "Stenotic", "RCA": "Stenotic"}
    negative_labels = {"CAD": "Normal", "LAD": "Normal", "LCX": "Normal", "RCA": "Normal"}

    outputs: dict[str, Any] = {}
    for target in TARGETS:
        model = models[target]
        raw_prob = float(model.predict_proba(X)[0, 1])
        calibrator = calibrators[target]
        cal_prob = float(apply_platt(calibrator, [raw_prob])[0])

        if not np.isfinite(cal_prob) or cal_prob < 0.0 or cal_prob > 1.0:
            cal_prob = np.clip(cal_prob, 0.0, 1.0)

        entry = registry_targets[target]
        thr = operating_thresholds[target]

        outputs[target] = {
            "score": cal_prob,
            "raw_score": raw_prob,
            "calibrated_probability": cal_prob,
            "score_semantics": "probability",
            "model_family": entry["model_family"],
            "model_version": entry["model_version"],
            "threshold": 0.5,
            "operating_threshold": thr,
            "risk_band": risk_band(cal_prob),
            "predicted_class_0_5": positive_labels[target] if cal_prob >= 0.5 else negative_labels[target],
            "predicted_class": positive_labels[target] if cal_prob >= thr else negative_labels[target],
        }

    return {
        "request_id": str(uuid.uuid4()),
        "registry_version": registry["version"],
        "outputs": outputs,
        "warnings": [
            "Research-only model estimates; not a diagnosis, treatment recommendation or clinical risk assessment.",
            "Models were calibrated via honest fold-local Platt scaling on a retrospective research cohort.",
            "Operating points are research benchmarks derived from Youden's J criterion, not clinically certified decision rules.",
            "3D anatomy is schematic and does not localize an individual patient's anatomical lesions.",
        ],
    }


def explain(payload: dict[str, Any]) -> dict[str, Any]:
    target = payload.get("target")
    request_id = payload.get("prediction_request_id")
    values = payload.get("values")

    if target not in TARGETS:
        raise ValueError(f"target must be one of {TARGETS}")
    if not isinstance(request_id, str) or not request_id.strip():
        raise ValueError("prediction_request_id is required")
    if not isinstance(values, dict):
        raise ValueError("values must be a JSON object")

    schema = load_json(PROCESSED / "feature_schema.json")
    profile = prepare_profile(values, schema)
    bundle = load_verified_bundle(schema)

    features = [p["name"] for p in schema["predictors"]]
    df_row = pd.DataFrame([profile], columns=features)
    model_pipe = bundle["models"][target]
    registry = bundle["registry"]
    entry_by_target = {entry["target"]: entry for entry in registry["targets"]}

    pre = model_pipe.named_steps["preprocess"]
    clf = model_pipe.named_steps["model"]
    background = bundle["background"]
    num_cols = bundle["num_cols"]
    cat_cols = bundle["cat_cols"]

    # Model-aware explainer (LinearExplainer or TreeExplainer)
    explainer, units, col_owners = make_explainer(model_pipe, background, num_cols, cat_cols)
    transformed_row = pre.transform(df_row)
    sv, base_value = shap_matrix(explainer, transformed_row)

    # Sum one-hot encoded columns back into original clinical features
    grouped_df = by_feature(sv, col_owners)
    feature_contributions = grouped_df.iloc[0].to_dict()

    total_abs = float(np.sum(np.abs(list(feature_contributions.values())))) or 1.0

    feature_by_name = {p["name"]: p for p in schema["predictors"]}
    ranked = sorted(feature_contributions.items(), key=lambda item: abs(item[1]), reverse=True)

    contributions = []
    for name, contribution in ranked[:15]:
        meta = feature_by_name.get(name, {})
        share = float(abs(contribution) / total_abs * 100.0)
        contributions.append({
            "feature": name,
            "label": meta.get("label") or name,
            "value": profile.get(name),
            "unit": meta.get("unit"),
            "contribution": float(round(contribution, 5)),
            "share": float(round(share, 2)),
            "direction": "toward_positive" if contribution >= 0 else "toward_negative",
            "output_space": f"SHAP attribution in {units} space",
            "description": (
                f"Model-aware SHAP contribution ({units}). Positive values increase predicted risk; "
                "negative values decrease predicted risk relative to baseline expectation."
            ),
        })

    # Human-readable push/pull summary
    labels_map = {p["name"]: p.get("label", p["name"]) for p in schema["predictors"]}
    units_map = {p["name"]: p.get("unit") for p in schema["predictors"]}
    all_contributions_for_summary = [
        {"feature": k, "contribution": v, "value": profile.get(k), "share": abs(v) / total_abs * 100.0}
        for k, v in feature_contributions.items()
    ]
    summary = plain_summary(all_contributions_for_summary, labels_map, units_map, limit=3)

    submitted_prob = float(model_pipe.predict_proba(df_row)[0, 1])
    full_attribution_sum = float(np.sum(sv))
    
    # Calculate additivity residual
    if units == "probability":
        model_output = submitted_prob
        additivity_residual = float((model_output - base_value) - full_attribution_sum)
    else:
        # log-odds
        model_output = float(np.log(np.clip(submitted_prob, 1e-4, 1 - 1e-4) / (1 - np.clip(submitted_prob, 1e-4, 1 - 1e-4))))
        additivity_residual = float((model_output - base_value) - full_attribution_sum)

    return {
        "target": target,
        "prediction_request_id": request_id,
        "model_version": entry_by_target[target]["model_version"],
        "method": f"Exact model-aware SHAP ({explainer.__class__.__name__}, units: {units})",
        "baseline": f"Baseline expectation from {len(background)} background cohort profiles",
        "baseline_score": base_value,
        "prediction_score": submitted_prob,
        "full_attribution_sum": full_attribution_sum,
        "additivity_residual": additivity_residual,
        "output_space": f"{units}; base_value + sum(attributions) == model_output",
        "summary": summary,
        "contributions": contributions,
        "limitations": [
            "SHAP attributions represent model sensitivities and associations, not physiological or clinical causation.",
            "Correlated predictors can share credit or appear less prominent individually.",
            "Explanations are research decision-support indicators and must not be used as clinical directives.",
        ],
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
            raise ValueError(f"action must be 'predict' or 'explain', got {action!r}")
        print(json.dumps({"ok": True, "result": result}, allow_nan=False))
        return 0
    except FileNotFoundError as exc:
        print(json.dumps({"ok": False, "code": "ARTIFACTS_MISSING", "error": str(exc)}))
        return 2
    except Exception as exc:
        print(json.dumps({"ok": False, "code": "INFERENCE_FAILED", "error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
