"""Model-aware SHAP explainability module.

Supports fast, exact attributions using LinearExplainer and TreeExplainer,
maps transformed encoded columns back to source clinical features,
computes global feature importance shares, and generates human-readable
push/pull clinical explanations.
"""
from __future__ import annotations

from typing import Any
import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import ExtraTreesClassifier, GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression

PROB_UNIT_MODELS = (RandomForestClassifier, ExtraTreesClassifier)


def split_columns(columns: list[str], reference: pd.DataFrame) -> tuple[list[str], list[str]]:
    """Partition columns into numeric and categorical based on reference DataFrame types."""
    num = [c for c in columns if pd.api.types.is_numeric_dtype(reference[c])]
    cat = [c for c in columns if c not in num]
    return num, cat


def owners(preprocessor, num: list[str], cat: list[str]) -> list[str]:
    """Map every ColumnTransformer output column back to its original predictor feature name."""
    col_owners = list(num)
    if cat and "categorical" in preprocessor.named_transformers_:
        cat_pipe = preprocessor.named_transformers_["categorical"]
        onehot = cat_pipe.named_steps.get("onehot") or cat_pipe.named_steps.get("oh")
        if onehot is not None and hasattr(onehot, "categories_"):
            drops = getattr(onehot, "drop_idx_", None)
            if drops is None:
                drops = [None] * len(cat)
            for col, cats, d in zip(cat, onehot.categories_, drops):
                count = len(cats) - (0 if d is None else 1)
                col_owners.extend([col] * count)
        else:
            col_owners.extend(cat)
    return col_owners


def make_explainer(pipeline, background: pd.DataFrame, num: list[str], cat: list[str]):
    """Return (explainer, units, column_owners) for a fitted pipeline."""
    pre = pipeline.named_steps["preprocess"] if "preprocess" in pipeline.named_steps else pipeline.named_steps.get("pre")
    clf = pipeline.named_steps["model"] if "model" in pipeline.named_steps else pipeline.named_steps.get("clf")
    
    col_owners = owners(pre, num, cat)
    transformed_background = pre.transform(background)

    if isinstance(clf, LogisticRegression):
        explainer = shap.LinearExplainer(clf, transformed_background)
        units = "log-odds"
    elif isinstance(clf, (RandomForestClassifier, ExtraTreesClassifier, GradientBoostingClassifier)):
        explainer = shap.TreeExplainer(clf)
        units = "probability" if isinstance(clf, PROB_UNIT_MODELS) else "log-odds"
    else:
        # Fallback to model-agnostic permutation explainer for arbitrary estimators (e.g. SVM)
        explainer = shap.PermutationExplainer(
            lambda matrix: clf.predict_proba(np.asarray(matrix, dtype=float))[:, 1],
            transformed_background,
            seed=1431,
        )
        units = "probability"
        
    return explainer, units, col_owners


def shap_matrix(explainer, X_transformed: np.ndarray) -> tuple[np.ndarray, float]:
    """Extract positive-class SHAP values (n_samples, n_transformed_features) and baseline expectation."""
    sv = explainer.shap_values(X_transformed)
    if isinstance(sv, list):
        # Classification list [negative_class_values, positive_class_values]
        sv = sv[-1]
    sv = np.asarray(sv, dtype=float)
    if sv.ndim == 3:
        sv = sv[:, :, -1]

    expected = explainer.expected_value
    if isinstance(expected, (list, np.ndarray)):
        base = float(np.ravel(expected)[-1])
    elif expected is not None:
        base = float(expected)
    else:
        base = 0.5
        
    return sv, base


def by_feature(sv: np.ndarray, col_owners: list[str]) -> pd.DataFrame:
    """Group transformed column SHAP attributions back into original clinical features."""
    return pd.DataFrame(sv, columns=col_owners).T.groupby(level=0, sort=False).sum().T


def global_importance(
    pipeline,
    background: pd.DataFrame,
    sample: pd.DataFrame,
    num: list[str],
    cat: list[str],
) -> list[dict[str, Any]]:
    """Compute mean absolute SHAP contribution per feature across sample profiles."""
    explainer, _, col_owners = make_explainer(pipeline, background, num, cat)
    pre = pipeline.named_steps["preprocess"] if "preprocess" in pipeline.named_steps else pipeline.named_steps.get("pre")
    X_sample_trans = pre.transform(sample)
    sv, _ = shap_matrix(explainer, X_sample_trans)
    
    mean_abs = by_feature(sv, col_owners).abs().mean()
    total = float(mean_abs.sum()) or 1.0
    rows = [
        {
            "feature": f,
            "mean_abs": float(v),
            "share": float(round(v / total * 100.0, 2)),
        }
        for f, v in mean_abs.items()
    ]
    return sorted(rows, key=lambda r: -r["mean_abs"])


def plain_summary(
    contributions: list[dict[str, Any]],
    labels: dict[str, str],
    units: dict[str, str | None] | None = None,
    limit: int = 3,
) -> dict[str, list[dict[str, Any]]]:
    """Extract top factors pushing risk up and down, suitable for human-readable display."""
    units_dict = units or {}
    
    def fmt(c: dict[str, Any]) -> dict[str, Any]:
        feat = c["feature"]
        return {
            "feature": feat,
            "label": labels.get(feat, feat),
            "value": c.get("value"),
            "unit": units_dict.get(feat),
            "contribution": float(round(c["contribution"], 4)),
            "share": float(round(c.get("share", 0.0), 2)),
        }

    positive_contribs = [c for c in contributions if c["contribution"] > 0]
    negative_contribs = [c for c in contributions if c["contribution"] < 0]
    
    positive_contribs.sort(key=lambda c: -c["contribution"])
    negative_contribs.sort(key=lambda c: c["contribution"])  # most negative first
    
    return {
        "raises": [fmt(c) for c in positive_contribs[:limit]],
        "lowers": [fmt(c) for c in negative_contribs[:limit]],
    }
