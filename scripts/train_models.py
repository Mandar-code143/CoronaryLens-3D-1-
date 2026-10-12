#!/usr/bin/env python3
"""Train candidate models and report repeated nested cross-validation research metrics.

Rigorous evaluation protocol per target (CAD, LAD, LCX, RCA):
1. **Outer loop, for honest evaluation**:
   Repeated stratified 5-fold cross-validation (default 3 repeats) over all cohort patients.
   Every patient receives an out-of-fold (OOF) prediction per repeat from models that never saw them.
2. **Inner loop, for model selection**:
   Inside each outer training fold, candidate model families are evaluated by inner CV ROC-AUC
   and the winner is refit on that outer training split.
   Because candidate selection happens strictly inside the outer training split, reported
   scores are not inflated by choosing the winner on the outer test data.
3. **Platt Calibration**:
   Raw scores are mapped to probabilities via Platt scaling.
   For evaluation, calibration is cross-fitted (fold-local on outer training splits), ensuring
   zero outer-test leakage.
4. **Target-specific research thresholds**:
   Youden's J statistic (Sensitivity + Specificity - 1) optimizes operating points per vessel.
   Thresholds are cross-fitted for evaluation.
5. **Patient-level bootstrap uncertainty**:
   500 patient-level resamples compute 95% confidence intervals for every metric.
6. **Final serving artifact**:
   Candidates are evaluated via full-cohort screening; the winning family is refit on all patients.
   A final Platt calibrator and research threshold fit on pooled OOF predictions are saved alongside.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
from typing import Any
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC

from coronarylens.calibration import (
    apply_platt,
    bootstrap_ci,
    crossfit_platt,
    crossfit_threshold,
    curves,
    ece,
    fit_platt,
    mean_over_repeats,
    point_metrics,
    threshold_tradeoffs,
    youden_threshold,
)
from coronarylens.data import ROOT, TARGETS, load_data
from coronarylens.explain import global_importance, make_explainer, split_columns

ARTIFACT_DIR = ROOT / "data" / "processed" / "model_artifacts"
DEFAULT_SEED = 42

# Alias for test suite compatibility
metrics_for = point_metrics


def _py(v: Any) -> Any:
    """Recursively convert NumPy scalars and arrays to JSON-serializable Python native types."""
    if isinstance(v, (np.integer, np.int64, np.int32)):
        return int(v)
    if isinstance(v, (np.floating, np.float64, np.float32)):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.ndarray):
        return v.tolist()
    if pd.isna(v):
        return None
    return v


def make_preprocessor(frame: pd.DataFrame, features: list[str]) -> ColumnTransformer:
    categorical = [col for col in features if not pd.api.types.is_numeric_dtype(frame[col])]
    numeric = [col for col in features if col not in categorical]
    numeric_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(drop="if_binary", handle_unknown="ignore", sparse_output=False)),
    ])
    return ColumnTransformer(
        [("numeric", numeric_pipe, numeric), ("categorical", categorical_pipe, categorical)],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def candidate_estimators(seed: int = DEFAULT_SEED) -> dict[str, Any]:
    """Candidate model families spanning linear, ensemble, and margin-based classifiers."""
    return {
        "logistic-regression": LogisticRegression(
            C=0.1, class_weight="balanced", max_iter=5000, solver="liblinear", random_state=seed
        ),
        "logistic_l1": LogisticRegression(
            C=0.1, penalty="l1", solver="liblinear", class_weight="balanced", max_iter=5000, random_state=seed
        ),
        "random-forest": RandomForestClassifier(
            n_estimators=150, min_samples_leaf=2, max_features="sqrt", class_weight="balanced",
            random_state=seed, n_jobs=1
        ),
        "extra-trees": ExtraTreesClassifier(
            n_estimators=150, min_samples_leaf=3, max_features="sqrt", class_weight="balanced",
            random_state=seed, n_jobs=1
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=120, learning_rate=0.05, max_depth=2, subsample=0.8, random_state=seed
        ),
        "rbf-svm": SVC(
            C=1.0, kernel="rbf", class_weight="balanced", probability=True, random_state=seed
        ),
    }


def make_pipeline(frame: pd.DataFrame, features: list[str], clf: Any) -> Pipeline:
    return Pipeline([
        ("preprocess", make_preprocessor(frame, features)),
        ("model", clone(clf)),
    ])


def select_candidate(
    X: pd.DataFrame,
    y: np.ndarray,
    features: list[str],
    candidates: dict[str, Any],
    inner_folds: int = 3,
    seed: int = DEFAULT_SEED,
) -> tuple[str, dict[str, float]]:
    """Select candidate with highest inner CV ROC-AUC on the given training split."""
    cv = StratifiedKFold(n_splits=inner_folds, shuffle=True, random_state=seed)
    scores: dict[str, float] = {}
    for name, clf in candidates.items():
        pipe = make_pipeline(X, features, clf)
        # Handle small class counts gracefully
        try:
            val_scores = cross_val_score(pipe, X, y, cv=cv, scoring="roc_auc", n_jobs=1)
            scores[name] = float(np.mean(val_scores))
        except Exception:
            scores[name] = 0.5
    winner = max(scores, key=scores.get)
    return winner, scores


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def train(
    repeats: int = 3,
    outer_folds: int = 5,
    inner_folds: int = 3,
    n_bootstrap: int = 500,
    seed: int = DEFAULT_SEED,
    output_dir: Path = ARTIFACT_DIR,
    fast: bool = False,
) -> dict[str, Any]:
    if fast:
        repeats, outer_folds, inner_folds, n_bootstrap = 1, 3, 2, 50

    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", category=UserWarning)

    t0 = time.time()
    frame, features, schema = load_data()
    n_patients = len(frame)
    num_cols, cat_cols = split_columns(features, frame)

    candidates = candidate_estimators(seed)
    candidate_names = list(candidates.keys())

    # Pre-select background samples for SHAP
    bg_size = min(30, n_patients)
    background_df = frame[features].sample(n=bg_size, random_state=seed).reset_index(drop=True)
    shap_sample_df = frame[features].sample(n=min(120, n_patients), random_state=seed + 1).reset_index(drop=True)

    nested_results: list[dict[str, Any]] = []
    final_pipelines: dict[str, Pipeline] = {}
    calibrators: dict[str, dict[str, float]] = {}
    operating_thresholds: dict[str, float] = {}
    pooled_oof_scores: dict[str, np.ndarray] = {}
    global_importances: dict[str, list[dict[str, Any]]] = {}
    oof_rows_pooled: list[dict[str, Any]] = []

    print(f"Loaded cohort of {n_patients} patients, {len(features)} active predictors.")
    print(f"Running Repeated Nested CV: {repeats} repeats x {outer_folds} outer folds x {inner_folds} inner folds...")

    for target in TARGETS:
        y = frame[target].astype(int).to_numpy()
        raw_repeats = np.zeros((repeats, n_patients), dtype=float)
        chosen_counter = Counter()
        fold_details = []

        print(f"\n--- Target: {target} ---")
        for rep in range(repeats):
            outer_cv = StratifiedKFold(n_splits=outer_folds, shuffle=True, random_state=seed + rep * 37)
            for fold_idx, (tr, te) in enumerate(outer_cv.split(frame[features], y)):
                X_tr, y_tr = frame[features].iloc[tr], y[tr]
                X_te = frame[features].iloc[te]

                # Inner model selection on training split only
                best_candidate, inner_scores = select_candidate(
                    X_tr, y_tr, features, candidates, inner_folds=inner_folds, seed=seed + 100 * rep + fold_idx
                )
                chosen_counter[best_candidate] += 1

                # Fit chosen pipeline on full outer training split
                fold_pipe = make_pipeline(X_tr, features, candidates[best_candidate])
                fold_pipe.fit(X_tr, y_tr)
                raw_repeats[rep, te] = fold_pipe.predict_proba(X_te)[:, 1]

                fold_details.append({
                    "repeat": rep + 1,
                    "outer_fold": fold_idx + 1,
                    "selected_candidate": best_candidate,
                    "inner_scores": inner_scores,
                    "test_count": int(len(te)),
                })

        # Honest calibration: fold-local cross-fitted Platt scaling per repeat
        cal_repeats = np.vstack([
            crossfit_platt(y, raw_repeats[r], seed=seed + r * 13)
            for r in range(repeats)
        ])

        # Honest thresholds: fold-local Youden threshold selection per repeat
        thr_repeats = np.vstack([
            crossfit_threshold(y, cal_repeats[r], seed=seed + r * 19)
            for r in range(repeats)
        ])

        # Headline out-of-fold metrics across repeats using honest cross-fitted thresholds
        m_headline = mean_over_repeats(y, cal_repeats, thr=thr_repeats)
        # Reference metrics at software default 0.5
        m_default05 = mean_over_repeats(y, cal_repeats, thr=0.5)
        # Raw scores metrics (before calibration)
        m_raw = mean_over_repeats(y, raw_repeats, thr=0.5)

        # 95% Bootstrap Confidence Intervals
        ci = bootstrap_ci(y, cal_repeats, seed=seed, thr=thr_repeats, n_boot=n_bootstrap)

        # Final operating threshold and calibrator fit on pooled OOF scores
        pooled_cal = cal_repeats.mean(axis=0)
        pooled_oof_scores[target] = pooled_cal
        final_thr = youden_threshold(np.tile(y, repeats), cal_repeats.ravel())
        operating_thresholds[target] = final_thr

        calibrators[target] = fit_platt(np.tile(y, repeats), raw_repeats.ravel())

        # Full-cohort screening to select serving model family
        serving_candidate, full_cv_scores = select_candidate(
            frame[features], y, features, candidates, inner_folds=outer_folds, seed=seed
        )
        final_pipe = make_pipeline(frame[features], features, candidates[serving_candidate])
        final_pipe.fit(frame[features], y)
        final_pipelines[target] = final_pipe

        # Global feature importance via SHAP
        target_importance = global_importance(final_pipe, background_df, shap_sample_df, num_cols, cat_cols)
        global_importances[target] = target_importance

        # Threshold trade-off curves
        tradeoffs = threshold_tradeoffs(y, cal_repeats, thresholds=(0.3, 0.4, 0.5, 0.6, 0.7))
        curve_data = curves(y, pooled_cal)

        # Record pooled OOF rows for CSV
        for idx in range(n_patients):
            oof_rows_pooled.append({
                "row_index": int(frame.index[idx]),
                "target": target,
                "y_true": int(y[idx]),
                "y_score": float(pooled_cal[idx]),
                "y_raw_score": float(raw_repeats.mean(axis=0)[idx]),
                "y_pred_0_5": int(pooled_cal[idx] >= 0.5),
                "y_pred_operating_threshold": int(pooled_cal[idx] >= final_thr),
                "operating_threshold": float(final_thr),
                "serving_candidate": serving_candidate,
            })

        target_report = {
            "target": target,
            "model_family": f"nested-model-selection (selected across folds: {dict(chosen_counter)})",
            "evaluation_procedure": "repeated-nested-model-selection",
            "serving_model_family": serving_candidate,
            "operating_threshold": final_thr,
            "selection_frequency": {k: float(v / sum(chosen_counter.values())) for k, v in sorted(chosen_counter.items())},
            "metrics": {
                "accuracy": m_headline["accuracy"],
                "balanced_accuracy": m_headline["balanced_accuracy"],
                "precision": m_headline["precision"],
                "recall": m_headline["recall"],
                "specificity": m_headline["specificity"],
                "f1": m_headline["f1"],
                "roc_auc": m_headline["roc_auc"],
                "brier": m_headline["brier"],
                "brier_score": m_headline["brier"],
                "ece": m_headline["ece"],
                "tp": m_headline["tp"],
                "tn": m_headline["tn"],
                "fp": m_headline["fp"],
                "fn": m_headline["fn"],
                "ci_95": ci,
            },
            "metrics_at_0_5": {
                "accuracy": m_default05["accuracy"],
                "precision": m_default05["precision"],
                "recall": m_default05["recall"],
                "specificity": m_default05["specificity"],
                "f1": m_default05["f1"],
                "confusion_matrix": [[round(m_default05["tn"], 1), round(m_default05["fp"], 1)],
                                    [round(m_default05["fn"], 1), round(m_default05["tp"], 1)]],
            },
            "confusion_matrix": [[round(m_headline["tn"], 1), round(m_headline["fp"], 1)],
                                [round(m_headline["fn"], 1), round(m_headline["tp"], 1)]],
            "raw_calibration": {
                "raw_brier": m_raw["brier"],
                "raw_ece": m_raw["ece"],
                "calibrated_brier": m_headline["brier"],
                "calibrated_ece": m_headline["ece"],
            },
            "threshold_tradeoffs": tradeoffs,
            "curves": curve_data,
            "global_importance": target_importance[:15],
            "fold_count": outer_folds,
            "repeats_count": repeats,
            "inner_fold_count": inner_folds,
            "sample_count": n_patients,
            "positive_count": int(y.sum()),
            "negative_count": int((1 - y).sum()),
            "validation_method": f"{repeats}x repeated {outer_folds}-fold nested stratified CV with {inner_folds}-fold inner ROC-AUC selection, Platt scaling calibration, and Youden threshold tuning",
            "outer_fold_candidate_selection": fold_details,
        }
        nested_results.append(target_report)

        print(f"[{target}] Serving Model: {serving_candidate:<18} | ROC-AUC: {m_headline['roc_auc']:.3f} [{ci['roc_auc'][0]:.3f}, {ci['roc_auc'][1]:.3f}]")
        print(f"        Acc: {m_headline['accuracy']:.3f} | Rec: {m_headline['recall']:.3f} | Spec: {m_headline['specificity']:.3f} | Thr: {final_thr:.2f}")
        print(f"        Brier: {m_raw['brier']:.3f} -> {m_headline['brier']:.3f} | ECE: {m_raw['ece']:.3f} -> {m_headline['ece']:.3f}")

    # Build representative patient samples with honest OOF scores for demonstration
    cad_oof = pooled_oof_scores["CAD"]
    cad_true = frame["CAD"].astype(int).to_numpy()
    rng = np.random.default_rng(seed)
    
    # Pick representative cases: highest confidence TP, TN, FP, FN
    pick_tp = int(np.argmax(np.where(cad_true == 1, cad_oof, -1.0)))
    pick_tn = int(np.argmin(np.where(cad_true == 0, cad_oof, 2.0)))
    pick_fp = int(np.argmax(np.where(cad_true == 0, cad_oof, -1.0)))
    pick_fn = int(np.argmin(np.where(cad_true == 1, cad_oof, 2.0)))
    sample_indices = [pick_tp, pick_tn, pick_fp, pick_fn]
    
    for idx in rng.permutation(n_patients):
        if idx not in sample_indices:
            sample_indices.append(int(idx))
        if len(sample_indices) >= 8:
            break

    representative_samples = []
    for idx in sample_indices:
        representative_samples.append({
            "id": int(idx),
            "values": {c: _py(frame.loc[idx, c]) for c in features},
            "ground_truth": {t: int(frame.loc[idx, t]) for t in TARGETS},
            "honest_oof_probability": {t: float(round(pooled_oof_scores[t][idx], 4)) for t in TARGETS},
        })

    # Prepare artifacts directory
    output_dir.mkdir(parents=True, exist_ok=True)
    # Clean previous artifacts
    for old_file in output_dir.glob("*"):
        if old_file.is_file():
            old_file.unlink(missing_ok=True)

    input_csv = ROOT / "data" / "processed" / "modeling-data.csv"
    schema_file = ROOT / "data" / "processed" / "feature_schema.json"
    audit_file = ROOT / "data" / "processed" / "data_audit.json"
    audit = json.loads(audit_file.read_text(encoding="utf-8"))
    timestamp = datetime.now(timezone.utc).isoformat()

    # Save fitted models and calibrators
    model_registry_targets = []
    for target in TARGETS:
        pipe_path = output_dir / f"{target.lower()}_pipeline.joblib"
        joblib.dump(final_pipelines[target], pipe_path, compress=3)

        cal_path = output_dir / f"{target.lower()}_calibrator.joblib"
        joblib.dump(calibrators[target], cal_path)

        rep = next(r for r in nested_results if r["target"] == target)
        model_registry_targets.append({
            "target": target,
            "model_family": rep["serving_model_family"],
            "model_version": "research-v2-repeated-nested-cv",
            "operating_threshold": float(rep["operating_threshold"]),
            "calibrator": calibrators[target],
            "validation_method": rep["validation_method"],
            "score_semantics": "probability",
            "selection_rationale": "Serving family chosen via full-cohort candidate screening; reported metrics reflect honest repeated nested CV.",
            "artifact_file": pipe_path.name,
            "artifact_sha256": sha256(pipe_path),
            "calibrator_file": cal_path.name,
            "calibrator_sha256": sha256(cal_path),
        })

    # Save shared background for SHAP
    bg_path = output_dir / "shap_background.joblib"
    joblib.dump(background_df, bg_path)

    registry = {
        "version": "coronarylens-research-v2-nested-cv",
        "created_at_utc": timestamp,
        "dataset_checksum": sha256(input_csv),
        "feature_schema_version": schema["schema_version"],
        "feature_schema_checksum": sha256(schema_file),
        "training_sample_count": n_patients,
        "predictor_count": len(features),
        "targets": model_registry_targets,
        "operating_thresholds": {k: float(v) for k, v in operating_thresholds.items()},
        "representative_samples": representative_samples,
        "research_only": True,
    }
    (output_dir / "model_registry.json").write_text(json.dumps(registry, indent=2, default=_py) + "\n", encoding="utf-8")

    evaluation = {
        "artifact_version": "research-evaluation-v2-repeated-nested-cv",
        "created_at_utc": timestamp,
        "dataset_source": audit["source"]["url"],
        "dataset_checksum": sha256(input_csv),
        "source_workbook_checksum": audit["source"]["sha256"],
        "feature_schema_version": schema["schema_version"],
        "feature_schema_checksum": sha256(schema_file),
        "sample_count": n_patients,
        "predictor_count": len(features),
        "validation_method": f"{repeats}x repeated {outer_folds}-fold nested stratified cross-validation with {inner_folds}-fold inner candidate selection",
        "seed": seed,
        "protocol": {
            "repeats": repeats,
            "outer_folds": outer_folds,
            "inner_folds": inner_folds,
            "calibration": "Fold-local cross-fitted Platt scaling",
            "operating_threshold": "Per-target Youden J optimization on honest OOF predictions",
            "uncertainty": f"Patient-level bootstrap ({n_bootstrap} resamples, 95% CI)",
            "candidate_families": candidate_names,
        },
        "limitations": [
            "Retrospective single-center cohort (303 rows); findings require independent multicenter external validation.",
            "Cross-validation provides internal performance estimation; it cannot substitute for prospective clinical trials.",
            "Derived operating points are research benchmarks, not clinically certified decision thresholds.",
            "Attributions represent model sensitivities and correlations, not physiological causation.",
            "This software is an AI research prototype intended for decision support research and educational evaluation only.",
        ],
        "targets": nested_results,
    }
    (output_dir / "evaluation.json").write_text(json.dumps(evaluation, indent=2, default=_py) + "\n", encoding="utf-8")

    # Save OOF predictions CSV
    pd.DataFrame(oof_rows_pooled).to_csv(output_dir / "nested_oof_predictions.csv", index=False)

    # Save Candidate Screening OOF CSV for legacy compatibility
    pd.DataFrame(oof_rows_pooled).to_csv(output_dir / "candidate_screening_oof_predictions.csv", index=False)

    # Generate and save manifest.json
    manifest = {
        "artifact_version": "research-model-artifacts-v2",
        "research_only": True,
        "files": {path.name: sha256(path) for path in sorted(output_dir.iterdir()) if path.is_file()},
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"\nAll artifacts, models, calibrators, and checksums successfully written to {output_dir} in {time.time() - t0:.1f}s")
    return evaluation


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=3, help="Repeats for outer stratified CV loop")
    parser.add_argument("--folds", type=int, default=5, help="Outer folds for stratified CV")
    parser.add_argument("--inner-folds", type=int, default=3, help="Inner folds for model selection")
    parser.add_argument("--bootstrap", type=int, default=500, help="Number of bootstrap resamples for 95% CIs")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Random seed")
    parser.add_argument("--fast", action="store_true", help="Fast mode for rapid smoke testing (1 repeat, 3 folds, 50 bootstrap)")
    parser.add_argument("--output-dir", type=Path, default=ARTIFACT_DIR)
    args = parser.parse_args()

    train(
        repeats=args.repeats,
        outer_folds=args.folds,
        inner_folds=args.inner_folds,
        n_bootstrap=args.bootstrap,
        seed=args.seed,
        output_dir=args.output_dir,
        fast=args.fast,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
