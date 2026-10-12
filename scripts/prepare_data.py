#!/usr/bin/env python3
"""Audit and prepare the official UCI Extension of Z-Alizadeh Sani workbook."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/raw/extension-of-z-alizadeh-sani.xlsx"
PROCESSED = ROOT / "data/processed"
TARGET_COLUMNS = {"CAD", "Cath", "LAD", "LCX", "RCA"}
TARGET_ALIASES = {"CAD": "Cath", "LAD": "LAD", "LCX": "LCX", "RCA": "RCA"}

# Human-readable display metadata. Raw feature keys are retained for model compatibility.
# These descriptions are general expansions, not a substitute for reviewing the
# original study's codebook; unit and source-specific coding remain unverified.
FEATURE_DISPLAY: dict[str, tuple[str, str]] = {
    "Age": ("Age", "Age recorded for the participant in the source cohort."),
    "Weight": ("Weight", "Weight measurement as recorded; the source workbook does not declare a unit."),
    "Length": ("Height / length", "Length measurement as recorded; the source workbook does not declare a unit."),
    "Sex": ("Sex", "Source category spelling normalized from 'Fmale' to 'Female'; source label otherwise retained."),
    "BMI": ("Body mass index (BMI)", "Body mass index value as recorded; source units were not provided in the workbook."),
    "DM": ("Diabetes mellitus (DM)", "Binary source-coded diabetes mellitus field; source-specific coding has not been independently verified."),
    "HTN": ("Hypertension (HTN)", "Binary source-coded hypertension field; source-specific coding has not been independently verified."),
    "Current Smoker": ("Current smoking status", "Source-coded current smoking status."),
    "EX-Smoker": ("Former smoking status", "Source-coded former/ex-smoker status."),
    "FH": ("Family history (FH)", "The source's FH field; the exact family-history definition is not specified in the workbook."),
    "Obesity": ("Obesity", "Source-coded obesity field; diagnostic definition is not specified in the workbook."),
    "CRF": ("Chronic renal failure (CRF)", "Common expansion of CRF; source-specific definition and coding require review."),
    "CVA": ("Cerebrovascular accident (CVA)", "Common expansion of CVA; source-specific definition and coding require review."),
    "Airway disease": ("Airway disease", "Source-coded airway disease field."),
    "Thyroid Disease": ("Thyroid disease", "Source-coded thyroid disease field."),
    "CHF": ("Congestive heart failure (CHF)", "Common expansion of CHF; source-specific definition and coding require review."),
    "DLP": ("Dyslipidemia (DLP)", "Common expansion of DLP; source-specific definition and coding require review."),
    "BP": ("Blood pressure (BP)", "Blood pressure value as recorded; the source workbook does not declare measurement units or convention."),
    "PR": ("Pulse rate (PR)", "Pulse-rate value as recorded; the source workbook does not declare units."),
    "Edema": ("Edema", "Source-coded edema field."),
    "Weak Peripheral Pulse": ("Weak peripheral pulse", "Source-coded examination finding."),
    "Lung rales": ("Lung rales", "Source-coded examination finding."),
    "Systolic Murmur": ("Systolic murmur", "Source-coded examination finding."),
    "Diastolic Murmur": ("Diastolic murmur", "Source-coded examination finding."),
    "Typical Chest Pain": ("Typical chest pain", "Source-coded symptom field."),
    "Dyspnea": ("Dyspnea", "Shortness of breath symptom field as coded by the source."),
    "Function Class": ("Functional class", "Source-coded functional-class field; category definitions require codebook review."),
    "Atypical": ("Atypical chest pain", "Source-coded symptom indicator; category definitions require codebook review."),
    "Nonanginal": ("Non-anginal pain", "Source-coded symptom indicator; category definitions require codebook review."),
    "Exertional CP": ("Exertional chest pain", "Source-coded exertional chest-pain indicator."),
    "LowTH Ang": ("Low-threshold angina", "Source variable label expanded for readability; coding definition requires review."),
    "Q Wave": ("Q wave (ECG)", "Source-coded ECG finding."),
    "St Elevation": ("ST elevation (ECG)", "Source-coded ECG finding; measurement/coding convention requires review."),
    "St Depression": ("ST depression (ECG)", "Source-coded ECG finding; measurement/coding convention requires review."),
    "Tinversion": ("T-wave inversion (ECG)", "Source-coded ECG finding."),
    "LVH": ("Left ventricular hypertrophy (LVH)", "Common expansion of LVH; source-specific coding requires review."),
    "Poor R Progression": ("Poor R-wave progression (ECG)", "Source-coded ECG finding."),
    "BBB": ("Bundle branch block (BBB)", "Source-coded ECG category; left/right categories are retained from the source."),
    "FBS": ("Fasting blood sugar (FBS)", "Source label expansion; source measurement units are not declared in the workbook."),
    "CR": ("Creatinine (CR)", "Common expansion of CR in this dataset context; verify against the original study codebook. Units are not documented."),
    "TG": ("Triglycerides (TG)", "Source laboratory value; units are not documented in the workbook."),
    "LDL": ("Low-density lipoprotein (LDL)", "Source laboratory value; units are not documented in the workbook."),
    "HDL": ("High-density lipoprotein (HDL)", "Source laboratory value; units are not documented in the workbook."),
    "BUN": ("Blood urea nitrogen (BUN)", "Source laboratory value; units are not documented in the workbook."),
    "ESR": ("Erythrocyte sedimentation rate (ESR)", "Source laboratory value; units and measurement convention are not documented."),
    "HB": ("Hemoglobin (HB)", "Source laboratory value; units are not documented in the workbook."),
    "K": ("Potassium (K)", "Source laboratory value; units are not documented in the workbook."),
    "Na": ("Sodium (Na)", "Source laboratory value; units are not documented in the workbook."),
    "WBC": ("White blood cell count (WBC)", "Source laboratory value; units are not documented in the workbook."),
    "Lymph": ("Lymphocyte value", "Source laboratory field; whether this is a count, percentage or another encoding requires codebook review."),
    "Neut": ("Neutrophil value", "Source laboratory field; whether this is a count, percentage or another encoding requires codebook review."),
    "PLT": ("Platelet count (PLT)", "Source laboratory value; units are not documented in the workbook."),
    "EF-TTE": ("Ejection fraction (TTE)", "Ejection-fraction value as recorded from transthoracic echocardiography; source units/scale require review."),
    "Region RWMA": ("Regional wall-motion abnormality (RWMA)", "Source-coded echocardiographic finding; specific region codes require review."),
    "VHD": ("Valvular heart disease (VHD)", "Source-coded valvular heart disease category; code meanings are retained as recorded."),
}

SOURCE_VALUE_NORMALIZATIONS = {
    "Sex": {"Fmale": "Female"},
}

GROUPS = {
    "Demographics": {"Age", "Weight", "Length", "Sex", "BMI"},
    "Symptoms & examination": {
        "DM",
        "HTN",
        "Current Smoker",
        "EX-Smoker",
        "FH",
        "Obesity",
        "CRF",
        "CVA",
        "Airway disease",
        "Thyroid Disease",
        "CHF",
        "DLP",
        "BP",
        "PR",
        "Edema",
        "Weak Peripheral Pulse",
        "Lung rales",
        "Systolic Murmur",
        "Diastolic Murmur",
        "Typical Chest Pain",
        "Dyspnea",
        "Function Class",
        "Atypical",
        "Nonanginal",
        "Exertional CP",
        "LowTH Ang",
    },
    "ECG": {
        "Q Wave",
        "St Elevation",
        "St Depression",
        "Tinversion",
        "LVH",
        "Poor R Progression",
        "BBB",
    },
}


def json_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def ordered_values(series: pd.Series) -> list[Any]:
    values = [json_value(value) for value in series.dropna().unique()]
    return sorted(values, key=lambda item: (str(type(item)), str(item)))


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Official dataset workbook not found: {SOURCE}")

    # UCI's published workbook contains a populated source sheet and an empty
    # wider schema sheet. The populated 303 x 59 sheet is the modeling source.
    workbook = pd.ExcelFile(SOURCE)
    frame = pd.read_excel(SOURCE, sheet_name=0)
    source_columns = list(frame.columns)
    # A source spelling error is normalized consistently for the schema, UI, and models.
    # The original workbook checksum remains in the audit, and the mapping is recorded below.
    normalization_counts: dict[str, dict[str, int]] = {}
    for column, replacements in SOURCE_VALUE_NORMALIZATIONS.items():
        if column not in frame:
            continue
        for source_value, normalized_value in replacements.items():
            count = int(frame[column].astype("string").str.strip().eq(source_value).sum())
            if count:
                frame[column] = frame[column].replace({source_value: normalized_value})
                normalization_counts.setdefault(column, {})[source_value] = count
    missing_targets = [column for column in TARGET_ALIASES.values() if column not in frame]
    if missing_targets:
        raise ValueError(f"Expected source outcome columns are missing: {missing_targets}")

    predictors = [column for column in source_columns if column not in TARGET_COLUMNS]
    if len(predictors) != len(source_columns) - len(set(source_columns) & TARGET_COLUMNS):
        raise ValueError("Target leakage exclusion did not produce a unique predictor schema.")
    if set(predictors) & TARGET_COLUMNS:
        raise ValueError("A target-related column leaked into the predictor schema.")

    target_values: dict[str, pd.Series] = {}
    target_distributions: dict[str, dict[str, int]] = {}
    for target, source_name in TARGET_ALIASES.items():
        raw = frame[source_name].astype("string").str.strip()
        if raw.isna().any():
            raise ValueError(f"Target {source_name} contains missing labels.")
        classes = set(raw.unique().tolist())
        if target == "CAD":
            mapping = {"CAD": 1, "Normal": 0}
        else:
            mapping = {"Stenotic": 1, "Normal": 0}
        unknown = classes - set(mapping)
        if unknown:
            raise ValueError(f"Unexpected values for {source_name}: {sorted(unknown)}")
        target_values[target] = raw.map(mapping).astype("int64")
        target_distributions[target] = {
            str(key): int(value) for key, value in raw.value_counts().items()
        }

    schema_features: list[dict[str, Any]] = []
    for name in predictors:
        series = frame[name]
        unique = ordered_values(series)
        is_object = pd.api.types.is_object_dtype(series.dtype) or pd.api.types.is_string_dtype(
            series.dtype
        )
        is_small_integer = (
            pd.api.types.is_integer_dtype(series.dtype)
            and len(unique) <= 8
        )
        if is_object:
            feature_type = "categorical"
        elif is_small_integer:
            feature_type = "ordinal" if len(unique) > 2 else "categorical"
        else:
            feature_type = "numeric"

        numeric = pd.to_numeric(series, errors="coerce")
        numeric_values = numeric.dropna()
        group = next(
            (label for label, members in GROUPS.items() if name in members),
            "Laboratory & echocardiography",
        )
        categories = [str(value) for value in unique] if feature_type != "numeric" else []
        display_label, display_description = FEATURE_DISPLAY.get(
            str(name), (str(name), "Source field retained with its original name; source-specific definition requires review.")
        )
        schema_features.append(
            {
                "name": str(name),
                "label": display_label,
                "description": display_description,
                "group": group,
                "type": feature_type,
                "required": True,
                "unit": None,
                "minimum": float(numeric_values.min()) if feature_type == "numeric" else None,
                "maximum": float(numeric_values.max()) if feature_type == "numeric" else None,
                "categories": categories,
                # UCI documents the broad feature groups, but does not define
                # every code/value in the downloaded workbook's feature table.
                "semantics_verified": False,
            }
        )

    schema = {
        "schema_version": "uci411-source-v2-display-normalization",
        "source": "UCI Machine Learning Repository, dataset 411",
        "predictor_count": len(predictors),
        "forbidden_predictors": sorted(TARGET_COLUMNS),
        "predictors": schema_features,
    }

    processed = frame[predictors].copy()
    for target, values in target_values.items():
        processed[target] = values
    PROCESSED.mkdir(parents=True, exist_ok=True)
    processed.to_csv(PROCESSED / "modeling-data.csv", index=False)

    vessel_positive = {
        vessel: frame[vessel].astype("string").str.strip().eq("Stenotic")
        for vessel in ("LAD", "LCX", "RCA")
    }
    vessel_any = vessel_positive["LAD"] | vessel_positive["LCX"] | vessel_positive["RCA"]
    cad_positive = target_values["CAD"].eq(1)
    numeric_ranges = {}
    categorical_values = {}
    for feature in predictors:
        series = frame[feature]
        if pd.api.types.is_numeric_dtype(series.dtype):
            numeric_ranges[feature] = {
                "minimum": float(series.min()),
                "maximum": float(series.max()),
            }
        else:
            categorical_values[feature] = [str(value) for value in ordered_values(series)]

    audit = {
        "source": {
            "url": "https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset",
            "citation": "Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). Extension of Z-Alizadeh Sani dataset. UCI Machine Learning Repository.",
            "doi": "10.24432/C5461K",
            "license": "CC BY 4.0",
            "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "workbook_sheets": workbook.sheet_names,
            "modeling_sheet": workbook.sheet_names[0],
            "empty_second_sheet_rows": int(pd.read_excel(SOURCE, sheet_name=1).shape[0])
            if len(workbook.sheet_names) > 1
            else None,
        },
        "preprocessing_normalizations": {
            "value_mappings": normalization_counts,
            "note": "Mappings correct source display typos only; original source workbook is retained with its checksum for provenance.",
        },
        "dimensions": {
            "rows": int(frame.shape[0]),
            "columns": int(frame.shape[1]),
            "predictors_after_target_exclusion": len(predictors),
            "source_outcome_columns": sorted(set(source_columns) & TARGET_COLUMNS),
        },
        "prompt_vs_source_discrepancy": {
            "brief_predictor_count": 54,
            "observed_predictor_count": len(predictors),
            "explanation": (
                "The downloaded UCI workbook has 59 columns: 55 predictors and four "
                "outcome columns (LAD, LCX, RCA, Cath). It has no separate CAD column; "
                "Cath contains CAD/Normal labels and is mapped to the CAD target. "
                "All five target-related names are excluded from predictors if present."
            ),
        },
        "targets": {
            target: {
                "source_column": source_name,
                "class_distribution": target_distributions[target],
            }
            for target, source_name in TARGET_ALIASES.items()
        },
        "duplicates": {
            "exact_rows": int(frame.duplicated().sum()),
        },
        "missing_values": {
            "total": int(frame.isna().sum().sum()),
            "by_column": {
                str(column): int(count)
                for column, count in frame.isna().sum().items()
                if count > 0
            },
        },
        "numeric_ranges": numeric_ranges,
        "categorical_values": categorical_values,
        "target_consistency": {
            "cad_equals_any_stenotic_vessel_mismatches": int((cad_positive != vessel_any).sum()),
            "cad_definition": "CAD status is the dataset's Cath field mapped from CAD/Normal.",
            "note": "A mismatch is reported, not silently corrected.",
        },
        "leakage_controls": {
            "forbidden_names": sorted(TARGET_COLUMNS),
            "predictor_columns": predictors,
            "target_source_mapping": TARGET_ALIASES,
        },
    }

    # Use the per-feature median/mode only as an explicitly synthetic demo
    # input. It is not a source patient and must not count as evaluation data.
    demo_values: dict[str, Any] = {}
    for feature in schema_features:
        name = feature["name"]
        series = frame[name]
        if feature["type"] == "numeric":
            demo_values[name] = round(float(pd.to_numeric(series).median()), 4)
        else:
            demo_values[name] = str(series.mode(dropna=True).iloc[0])
    demo = {
        "values": demo_values,
        "label": "Synthetic cohort summary",
        "provenance": (
            "Per-feature median/mode profile derived from the public UCI training cohort. "
            "This is not a real person, not a validation case, and not clinical advice."
        ),
    }

    (PROCESSED / "feature_schema.json").write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (PROCESSED / "data_audit.json").write_text(
        json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (PROCESSED / "demo_profile.json").write_text(
        json.dumps(demo, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "rows": frame.shape[0],
                "columns": frame.shape[1],
                "predictors": len(predictors),
                "target_distributions": target_distributions,
                "cad_vessel_consistency_mismatches": int((cad_positive != vessel_any).sum()),
                "checksum": audit["source"]["sha256"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
