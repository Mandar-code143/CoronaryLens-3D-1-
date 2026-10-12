#!/usr/bin/env python3
"""Train candidate models and report stratified out-of-fold research metrics.

This is a small-cohort development pipeline, not a clinical validation study. Every
preprocessing operation is fitted inside each training fold. Metrics are descriptive;
these models are not suitable for clinical use or generalization claims.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC

from coronarylens.data import ROOT, TARGETS, load_data

ARTIFACT_DIR = ROOT / "data" / "processed" / "model_artifacts"
SEED = 1431


def make_preprocessor(frame: pd.DataFrame, features: list[str]) -> ColumnTransformer:
    categorical = [column for column in features if not pd.api.types.is_numeric_dtype(frame[column])]
    numeric = [column for column in features if column not in categorical]
    numeric_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    return ColumnTransformer(
        [("numeric", numeric_pipe, numeric), ("categorical", categorical_pipe, categorical)],
        remainder="drop",
    )


def candidate_estimators() -> dict[str, Any]:
    # Fixed candidates avoid a large tuning search leaking signal from a tiny dataset.
    return {
        "logistic-regression": LogisticRegression(
            C=1.0, class_weight="balanced", max_iter=4000, solver="liblinear", random_state=SEED
        ),
        "random-forest": RandomForestClassifier(
            n_estimators=80, min_samples_leaf=3, max_features="sqrt", class_weight="balanced",
            random_state=SEED, n_jobs=1,
        ),
        "extra-trees": ExtraTreesClassifier(
            n_estimators=80, min_samples_leaf=3, max_features="sqrt", class_weight="balanced",
            random_state=SEED, n_jobs=1,
        ),
        "rbf-svm": SVC(C=1.0, kernel="rbf", class_weight="balanced", probability=True,
                       random_state=SEED),
    }


def metrics_for(y_true: np.ndarray, y_score: np.ndarray, threshold: float = 0.5) -> dict[str, Any]:
    y_pred = (y_score >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "specificity": float(tn / (tn + fp)) if (tn + fp) else None,
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_score)) if len(np.unique(y_true)) == 2 else None,
        "pr_auc": float(average_precision_score(y_true, y_score)) if len(np.unique(y_true)) == 2 else None,
        "brier_score": float(brier_score_loss(y_true, y_score)),
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
        "threshold": threshold,
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def evaluate_target(
    frame: pd.DataFrame,
    features: list[str],
    target: str,
    estimator_name: str,
    folds: int,
) -> tuple[dict[str, Any], Pipeline, pd.DataFrame]:
    X, y = frame[features], frame[target].astype(int).to_numpy()
    min_class = int(pd.Series(y).value_counts().min())
    if folds > min_class:
        raise ValueError(f"{target}: folds={folds} exceeds smallest class count={min_class}")
    splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)
    model = candidate_estimators()[estimator_name]
    prototype = Pipeline([("preprocess", make_preprocessor(frame, features)), ("model", model)])
    # cross_val_predict ensures every reported score is from a model that did not train on that row.
    oof_probability = cross_val_predict(
        clone(prototype), X, y, cv=splitter, method="predict_proba", n_jobs=1
    )[:, 1]
    oof = pd.DataFrame({"row_index": frame.index, "target": target, "y_true": y,
                        "y_score": oof_probability, "y_pred_0_5": (oof_probability >= 0.5).astype(int)})
    result = {
        "target": target,
        "model_family": estimator_name,
        "metrics": metrics_for(y, oof_probability),
        "fold_count": folds,
        "sample_count": int(len(y)),
        "positive_count": int(y.sum()),
        "negative_count": int((1 - y).sum()),
        "validation_method": f"{folds}-fold stratified cross-validation; out-of-fold predictions",
    }
    # Fit final artifact on the full cohort only after generating out-of-fold evaluation.
    fitted = clone(prototype).fit(X, y)
    return result, fitted, oof


def nested_selection_evaluation(
    frame: pd.DataFrame,
    features: list[str],
    target: str,
    outer_folds: int = 5,
    inner_folds: int = 3,
    candidate_names: list[str] | None = None,
) -> tuple[dict[str, Any], pd.DataFrame, list[dict[str, Any]]]:
    """Estimate model-selection performance with a nested CV loop.

    The outer holdout fold is never used to choose its candidate estimator. Candidate
    family selection is performed only inside each outer training split, avoiding the
    optimism caused by selecting and reporting the maximum AUC from the same OOF scores.
    This remains internal validation on one small cohort, not external clinical validation.
    """
    X = frame[features]
    y = frame[target].astype(int).to_numpy()
    smallest_class = int(pd.Series(y).value_counts().min())
    if outer_folds < 3 or outer_folds > smallest_class:
        raise ValueError(f"{target}: invalid outer fold count for the smallest class ({smallest_class})")
    candidates = candidate_names or list(candidate_estimators())
    unknown = set(candidates) - set(candidate_estimators())
    if not candidates or unknown:
        raise ValueError(f"Unknown or empty candidate list: {sorted(unknown)}")

    outer = StratifiedKFold(n_splits=outer_folds, shuffle=True, random_state=SEED)
    oof_scores = np.full(len(y), np.nan, dtype=float)
    oof_folds = np.full(len(y), -1, dtype=int)
    row_records: list[dict[str, Any]] = []
    fold_selection: list[dict[str, Any]] = []
    for fold_number, (train_idx, test_idx) in enumerate(outer.split(X, y), start=1):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train = y[train_idx]
        smallest_train_class = int(pd.Series(y_train).value_counts().min())
        fold_inner = min(inner_folds, smallest_train_class)
        if fold_inner < 2:
            raise ValueError(f"{target}: insufficient class members for inner validation")
        inner = StratifiedKFold(
            n_splits=fold_inner, shuffle=True, random_state=SEED + fold_number * 17
        )
        inner_scores: dict[str, float] = {}
        candidate_templates = candidate_estimators()
        for name in candidates:
            pipeline = Pipeline([
                ("preprocess", make_preprocessor(frame, features)),
                ("model", candidate_templates[name]),
            ])
            inner_oof = cross_val_predict(
                clone(pipeline), X_train, y_train, cv=inner, method="predict_proba", n_jobs=1
            )[:, 1]
            inner_scores[name] = float(roc_auc_score(y_train, inner_oof))
        selected_name = sorted(candidates, key=lambda name: (-inner_scores[name], name))[0]
        selected_pipeline = Pipeline([
            ("preprocess", make_preprocessor(frame, features)),
            ("model", candidate_estimators()[selected_name]),
        ])
        fitted = clone(selected_pipeline).fit(X_train, y_train)
        scores = fitted.predict_proba(X_test)[:, 1]
        oof_scores[test_idx] = scores
        oof_folds[test_idx] = fold_number
        fold_selection.append({
            "outer_fold": fold_number,
            "selected_candidate": selected_name,
            "inner_cv_auc_by_candidate": inner_scores,
            "outer_test_count": int(len(test_idx)),
        })
        row_records.extend({
            "row_index": int(frame.index[row_idx]),
            "target": target,
            "y_true": int(y[row_idx]),
            "y_score": float(oof_scores[row_idx]),
            "y_pred_0_5": int(oof_scores[row_idx] >= 0.5),
            "outer_fold": int(oof_folds[row_idx]),
            "selected_candidate": selected_name,
        } for row_idx in test_idx)

    if not np.isfinite(oof_scores).all() or (oof_folds < 1).any():
        raise RuntimeError(f"Nested CV did not produce exactly one finite OOF score for each {target} row")
    result = metrics_for(y, oof_scores)
    result["validation_method"] = (
        f"{outer_folds}-fold nested stratified CV; {inner_folds}-fold inner CV selects a candidate per outer fold"
    )
    return result, pd.DataFrame(row_records), fold_selection


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folds", type=int, default=5, help="Outer folds for nested performance estimation and full-cohort screening")
    parser.add_argument("--inner-folds", type=int, default=3, help="Inner folds used to choose candidate families within each outer training fold")
    parser.add_argument("--output-dir", type=Path, default=ARTIFACT_DIR)
    parser.add_argument("--skip-fit", action="store_true", help="Only compute OOF metrics; do not save fitted models")
    args = parser.parse_args()
    if args.folds < 3 or args.folds > 10:
        parser.error("--folds must be between 3 and 10")
    if args.inner_folds < 2 or args.inner_folds > 5:
        parser.error("--inner-folds must be between 2 and 5")

    frame, features, schema = load_data()
    candidates = candidate_estimators()
    reports: list[dict[str, Any]] = []
    best: dict[str, tuple[float, str]] = {}
    target_artifacts: list[dict[str, Any]] = []
    oof_frames: list[pd.DataFrame] = []
    model_payloads: dict[str, Pipeline] = {}
    nested_oof_frames: list[pd.DataFrame] = []
    nested_fold_selections: dict[str, list[dict[str, Any]]] = {}

    for target in TARGETS:
        best[target] = (-float("inf"), "")
        for candidate in candidates:
            report, fitted, oof = evaluate_target(frame, features, target, candidate, args.folds)
            report["candidate"] = candidate
            reports.append(report)
            oof_frames.append(oof.assign(candidate=candidate))
            # Prespecified model selection criterion: OOF ROC-AUC. Tie-break is lexical.
            auc = report["metrics"]["roc_auc"]
            current_auc, current_name = best[target]
            if auc is not None and (auc > current_auc + 1e-12 or
                                    (abs(auc - current_auc) <= 1e-12 and candidate < current_name)):
                best[target] = (float(auc), candidate)
                model_payloads[target] = fitted
        if target not in model_payloads:
            raise RuntimeError(f"No candidate produced a valid OOF ROC-AUC for {target}")

    best_reports = []
    for target in TARGETS:
        selected_name = best[target][1]
        nested_metrics, nested_oof, fold_selection = nested_selection_evaluation(
            frame, features, target, outer_folds=args.folds, inner_folds=args.inner_folds
        )
        nested_oof_frames.append(nested_oof)
        nested_fold_selections[target] = fold_selection
        best_reports.append({
            "target": target,
            # Headline metrics estimate the nested selection procedure, whose chosen
            # candidate may vary by outer fold. The serving family is reported separately.
            "model_family": "nested-model-selection (candidate may vary by outer fold)",
            "evaluation_procedure": "nested-model-selection",
            "serving_model_family": selected_name,
            "metrics": {key: value for key, value in nested_metrics.items() if key != "validation_method"},
            "fold_count": args.folds,
            "inner_fold_count": args.inner_folds,
            "sample_count": int(len(frame)),
            "positive_count": int(frame[target].astype(int).sum()),
            "negative_count": int((1 - frame[target].astype(int)).sum()),
            "validation_method": nested_metrics["validation_method"],
            "outer_fold_candidate_selection": fold_selection,
        })

    input_csv = ROOT / "data" / "processed" / "modeling-data.csv"
    schema_file = ROOT / "data" / "processed" / "feature_schema.json"
    audit = json.loads((ROOT / "data" / "processed" / "data_audit.json").read_text(encoding="utf-8"))
    timestamp = datetime.now(timezone.utc).isoformat()
    evaluation = {
        "artifact_version": "research-evaluation-v1",
        "created_at_utc": timestamp,
        "dataset_source": audit["source"]["url"],
        "dataset_checksum": sha256(input_csv),
        "source_workbook_checksum": audit["source"]["sha256"],
        "feature_schema_version": schema["schema_version"],
        "feature_schema_checksum": sha256(schema_file),
        "sample_count": int(len(frame)),
        "predictor_count": len(features),
        "validation_method": f"{args.folds}-fold nested stratified cross-validation with {args.inner_folds}-fold inner candidate selection",
        "seed": SEED,
        "selection_rule": "Nested CV selects candidate families within each outer training fold for headline metrics. The final serving family is selected by highest full-cohort OOF ROC-AUC for fitting the final research artifact; those screening metrics are not presented as unbiased selected-model performance.",
        "selection_bias_note": "Full-cohort candidate screening uses OOF predictions to choose the final serving family and is subject to selection optimism. Headline target metrics use nested cross-validation to reduce this bias. No external or prospective validation has been performed.",
        "limitations": [
            "Small retrospective public cohort (303 rows); high uncertainty and likely limited transportability.",
            "Cross-validation is internal validation, not independent external or prospective validation.",
            "The source cohort and labels do not establish readiness for clinical use.",
            "Feature semantics and units must be independently reviewed before any clinical interpretation.",
            "Final fitted models are research artifacts only; no diagnosis or treatment advice is provided.",
        ],
        "targets": best_reports,
        "candidate_screening_results": reports,
        "nested_cv_fold_selections": nested_fold_selections,
    }
    if args.skip_fit:
        print(json.dumps(evaluation, indent=2))
        return 0

    args.output_dir.mkdir(parents=True, exist_ok=True)
    # Remove products from earlier runs so the manifest cannot accidentally bless stale files.
    for old_name in (
        "cad_pipeline.joblib", "lad_pipeline.joblib", "lcx_pipeline.joblib", "rca_pipeline.joblib",
        "model_registry.json", "evaluation.json", "candidate_screening_oof_predictions.csv",
        "nested_oof_predictions.csv", "oof_predictions.csv", "manifest.json",
    ):
        (args.output_dir / old_name).unlink(missing_ok=True)
    model_registry = []
    for target in TARGETS:
        model_path = args.output_dir / f"{target.lower()}_pipeline.joblib"
        joblib.dump(model_payloads[target], model_path)
        selected = next(item for item in best_reports if item["target"] == target)
        model_registry.append({
            "target": target,
            "model_family": selected["serving_model_family"],
            "model_version": "research-v1",
            "validation_method": selected["validation_method"],
            "score_semantics": "probability",
            "selection_rationale": "Serving family selected by full-cohort OOF ROC-AUC screening; nested CV metrics estimate the selection procedure and are not external validation.",
            "artifact_file": model_path.name,
            "artifact_sha256": sha256(model_path),
        })
    registry = {
        "version": "coronarylens-research-v1",
        "created_at_utc": timestamp,
        "dataset_checksum": sha256(input_csv),
        "feature_schema_version": schema["schema_version"],
        "feature_schema_checksum": sha256(schema_file),
        "training_sample_count": len(frame),
        "predictor_count": len(features),
        "targets": model_registry,
        "research_only": True,
    }
    (args.output_dir / "model_registry.json").write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "evaluation.json").write_text(json.dumps(evaluation, indent=2) + "\n", encoding="utf-8")
    pd.concat(oof_frames, ignore_index=True).to_csv(args.output_dir / "candidate_screening_oof_predictions.csv", index=False)
    pd.concat(nested_oof_frames, ignore_index=True).to_csv(args.output_dir / "nested_oof_predictions.csv", index=False)
    manifest = {
        "artifact_version": "research-model-artifacts-v1",
        "research_only": True,
        "files": {path.name: sha256(path) for path in sorted(args.output_dir.iterdir()) if path.is_file()},
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output_dir": str(args.output_dir), "selected_models": model_registry,
                      "nested_evaluation_summary": [{"target": item["target"], "serving_model_family": item["serving_model_family"],
                                              "roc_auc": item["metrics"]["roc_auc"],
                                              "balanced_accuracy": item["metrics"]["balanced_accuracy"],
                                              "fold_count": item["fold_count"]}
                                             for item in best_reports]}, indent=2))
    print("WARNING: artifacts are research-only. Nested internal CV is not external or clinical validation.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
