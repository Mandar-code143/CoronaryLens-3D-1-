"""Calibration, threshold optimization, and bootstrap uncertainty estimation.

Implements fold-local Platt scaling, expected calibration error (ECE),
Youden's J threshold optimization, patient-level bootstrap confidence intervals,
and ROC/calibration curve generation.
"""
from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, confusion_matrix, roc_auc_score, roc_curve
from sklearn.model_selection import StratifiedKFold


def _logit(p: np.ndarray | float) -> np.ndarray:
    """Safely clip probabilities and compute logit: log(p / (1 - p))."""
    p_arr = np.clip(np.asarray(p, dtype=float), 1e-4, 1.0 - 1e-4)
    return np.log(p_arr / (1.0 - p_arr)).reshape(-1, 1)


def fit_platt(y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    """Fit a univariate logistic regression on logit(p) to learn Platt calibration parameters."""
    y_arr = np.asarray(y, dtype=int)
    lr = LogisticRegression(C=1e4, max_iter=1000, solver="lbfgs")
    lr.fit(_logit(p), y_arr)
    return {"coef": float(lr.coef_[0, 0]), "intercept": float(lr.intercept_[0])}


def apply_platt(cal: dict[str, float], p: np.ndarray | list[float] | float) -> np.ndarray:
    """Apply fitted Platt calibration to probability estimates."""
    p_arr = np.asarray(p, dtype=float)
    logits = _logit(p_arr).ravel()
    scaled = cal["coef"] * logits + cal["intercept"]
    # numerically stable sigmoid
    return 1.0 / (1.0 + np.exp(-np.clip(scaled, -30.0, 30.0)))


def crossfit_platt(y: np.ndarray, p: np.ndarray, seed: int, k: int = 5) -> np.ndarray:
    """Fold-local cross-fitted Platt scaling.
    
    Each prediction is calibrated using parameters fit on other folds, ensuring
    evaluation scores have zero outer-test leakage.
    """
    y_arr = np.asarray(y, dtype=int)
    p_arr = np.asarray(p, dtype=float)
    out = np.zeros_like(p_arr, dtype=float)
    splitter = StratifiedKFold(n_splits=k, shuffle=True, random_state=seed)
    for tr, te in splitter.split(p_arr, y_arr):
        cal = fit_platt(y_arr[tr], p_arr[tr])
        out[te] = apply_platt(cal, p_arr[te])
    return out


def ece(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    """Expected Calibration Error (ECE) with equal-width probability bins."""
    y_arr = np.asarray(y, dtype=int)
    p_arr = np.asarray(p, dtype=float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    bin_idx = np.clip(np.digitize(p_arr, edges[1:-1]), 0, bins - 1)
    total_loss = 0.0
    n = len(y_arr)
    if n == 0:
        return 0.0
    for b in range(bins):
        mask = bin_idx == b
        if np.any(mask):
            bin_size = np.sum(mask)
            conf = float(np.mean(p_arr[mask]))
            acc = float(np.mean(y_arr[mask]))
            total_loss += (bin_size / n) * abs(acc - conf)
    return float(total_loss)


def youden_threshold(y: np.ndarray, p: np.ndarray) -> float:
    """Find threshold maximizing Youden's J statistic (Sensitivity + Specificity - 1)."""
    y_arr = np.asarray(y, dtype=int)
    p_arr = np.asarray(p, dtype=float)
    grid = np.linspace(0.05, 0.95, 91)
    pos = max(int(np.sum(y_arr == 1)), 1)
    neg = max(int(np.sum(y_arr == 0)), 1)
    j_scores = [
        float(np.sum((p_arr >= g) & (y_arr == 1)) / pos + np.sum((p_arr < g) & (y_arr == 0)) / neg - 1.0)
        for g in grid
    ]
    best_idx = int(np.argmax(j_scores))
    return float(round(grid[best_idx], 2))


def crossfit_threshold(y: np.ndarray, p: np.ndarray, seed: int, k: int = 5) -> np.ndarray:
    """Fold-local Youden threshold selection so thresholded metrics avoid test leakage."""
    y_arr = np.asarray(y, dtype=int)
    p_arr = np.asarray(p, dtype=float)
    out = np.zeros_like(p_arr, dtype=float)
    splitter = StratifiedKFold(n_splits=k, shuffle=True, random_state=seed + 7)
    for tr, te in splitter.split(p_arr, y_arr):
        out[te] = youden_threshold(y_arr[tr], p_arr[tr])
    return out


def point_metrics(y: np.ndarray, p: np.ndarray, thr: float | np.ndarray = 0.5) -> dict[str, Any]:
    """Compute comprehensive classification and calibration metrics."""
    y_arr = np.asarray(y, dtype=int)
    p_arr = np.asarray(p, dtype=float)
    yh = p_arr >= thr
    tp = int(np.sum(yh & (y_arr == 1)))
    tn = int(np.sum((~yh) & (y_arr == 0)))
    fp = int(np.sum(yh & (y_arr == 0)))
    fn = int(np.sum((~yh) & (y_arr == 1)))
    n = len(y_arr)

    prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    rec = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    spec = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    f1 = float(2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
    acc = float((tp + tn) / n) if n > 0 else 0.0
    bal_acc = float(0.5 * (rec + spec))

    try:
        auc = float(roc_auc_score(y_arr, p_arr)) if len(np.unique(y_arr)) == 2 else 0.5
    except ValueError:
        auc = 0.5

    brier = float(brier_score_loss(y_arr, p_arr))
    cal_err = ece(y_arr, p_arr)

    return {
        "accuracy": acc,
        "balanced_accuracy": bal_acc,
        "precision": prec,
        "recall": rec,
        "specificity": spec,
        "f1": f1,
        "roc_auc": auc,
        "brier": brier,
        "brier_score": brier,
        "ece": cal_err,
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "confusion_matrix": [[tn, fp], [fn, tp]],
    }


def mean_over_repeats(y: np.ndarray, P_repeats: np.ndarray, idx: slice | np.ndarray = slice(None), thr: float | np.ndarray = 0.5) -> dict[str, float]:
    """Calculate mean of metrics across repeated cross-validation runs."""
    y_slice = y[idx]
    repeats_count = P_repeats.shape[0]
    metric_rows = []
    for r in range(repeats_count):
        p_slice = P_repeats[r][idx]
        t_slice = thr[r][idx] if isinstance(thr, np.ndarray) and thr.ndim == 2 else thr
        metric_rows.append(point_metrics(y_slice, p_slice, t_slice))

    aggregated: dict[str, float] = {}
    numeric_keys = ["accuracy", "balanced_accuracy", "precision", "recall", "specificity", "f1", "roc_auc", "brier", "ece", "tp", "tn", "fp", "fn"]
    for k in numeric_keys:
        aggregated[k] = float(np.mean([row[k] for row in metric_rows]))
    return aggregated


def bootstrap_ci(y: np.ndarray, P_repeats: np.ndarray, seed: int = 42, thr: float | np.ndarray = 0.5, n_boot: int = 500) -> dict[str, list[float]]:
    """Compute patient-level 95% bootstrap confidence intervals for key metrics."""
    rng = np.random.default_rng(seed)
    n = len(y)
    draws: list[dict[str, float]] = []
    attempts = 0
    while len(draws) < n_boot and attempts < n_boot * 5:
        attempts += 1
        idx = rng.integers(0, n, n)
        if 0 < y[idx].sum() < n:
            draws.append(mean_over_repeats(y, P_repeats, idx=idx, thr=thr))

    if not draws:
        default = [0.0, 1.0]
        return {k: default for k in ("accuracy", "precision", "recall", "specificity", "f1", "roc_auc", "brier", "ece")}

    result_ci: dict[str, list[float]] = {}
    for k in ("accuracy", "precision", "recall", "specificity", "f1", "roc_auc", "brier", "ece"):
        vals = [d[k] for d in draws]
        result_ci[k] = [
            float(np.percentile(vals, 2.5)),
            float(np.percentile(vals, 97.5)),
        ]
    return result_ci


def curves(y: np.ndarray, p: np.ndarray) -> dict[str, Any]:
    """Generate downsampled points for ROC and calibration curves."""
    y_arr = np.asarray(y, dtype=int)
    p_arr = np.asarray(p, dtype=float)
    fpr, tpr, _ = roc_curve(y_arr, p_arr)
    keep = np.unique(np.linspace(0, len(fpr) - 1, min(60, len(fpr))).astype(int))

    edges = np.linspace(0.0, 1.0, 9)
    idx = np.clip(np.digitize(p_arr, edges[1:-1]), 0, 7)
    cal_bins = []
    for b in range(8):
        mask = idx == b
        if np.any(mask):
            cal_bins.append({
                "mean_pred": float(np.mean(p_arr[mask])),
                "frac_pos": float(np.mean(y_arr[mask])),
                "n": int(np.sum(mask)),
            })

    return {
        "roc": {
            "fpr": [float(round(v, 4)) for v in fpr[keep]],
            "tpr": [float(round(v, 4)) for v in tpr[keep]],
        },
        "calibration": {
            "mean_pred": [c["mean_pred"] for c in cal_bins],
            "frac_pos": [c["frac_pos"] for c in cal_bins],
            "n": [c["n"] for c in cal_bins],
        },
    }


def threshold_tradeoffs(y: np.ndarray, P_repeats: np.ndarray, thresholds: tuple[float, ...] = (0.3, 0.4, 0.5, 0.6, 0.7)) -> list[dict[str, Any]]:
    """Compute sensitivity, specificity, and precision across a range of thresholds."""
    table = []
    for th in thresholds:
        m = mean_over_repeats(y, P_repeats, thr=th)
        table.append({
            "threshold": float(th),
            "recall": float(round(m["recall"], 4)),
            "sensitivity": float(round(m["recall"], 4)),
            "specificity": float(round(m["specificity"], 4)),
            "precision": float(round(m["precision"], 4)),
            "accuracy": float(round(m["accuracy"], 4)),
            "f1": float(round(m["f1"], 4)),
        })
    return table
