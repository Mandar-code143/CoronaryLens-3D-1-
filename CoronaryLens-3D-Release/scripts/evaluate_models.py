#!/usr/bin/env python3
"""Run a reproducible OOF candidate comparison without saving deployable artifacts."""
from __future__ import annotations

import argparse
import json

from train_models import evaluate_target, candidate_estimators
from coronarylens.data import TARGETS, load_data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folds", type=int, default=5)
    args = parser.parse_args()
    frame, features, _ = load_data()
    results = []
    for target in TARGETS:
        for name in candidate_estimators():
            report, _, _ = evaluate_target(frame, features, target, name, args.folds)
            results.append(report)
    print(json.dumps({"purpose": "research comparison only", "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
