# Preliminary model card — research prototype

## Intended use

Research and educational exploration of tabular classification for four distinct dataset labels: CAD status derived from `Cath`, and stenosis status for LAD, LCX and RCA. The current UI's 3D view is an orientation schematic only. It is not a clinical diagnostic tool.

## Data

The bundled UCI Extension of Z-Alizadeh Sani dataset has 303 records and 59 columns in the modeling sheet. There are four source outcomes (`Cath`, `LAD`, `LCX`, `RCA`) and 55 predictor columns once all outcome-related fields are excluded. The source contains no separate `CAD` column; CAD is mapped from `Cath`. See `data/processed/data_audit.json` for checksum, target distributions, ranges, missing-data summary and the CAD/vessel consistency discrepancy.

## Training and evaluation

`scripts/train_models.py` compares four fixed estimator families per target. Headline estimates use nested stratified cross-validation (candidate selection inside each outer training fold); full-cohort OOF screening selects the final serving family, and its screen score is not reported as unbiased selected-model performance. Preprocessing is fitted only inside training folds. The final fitted pipeline is fit on all 303 observations and must not be evaluated on that same cohort as though it were a held-out test set. The artifact bundle includes the evaluation JSON, candidate-screening OOF predictions and nested OOF predictions.

## Internal validation summary

Headline metrics are from five-fold nested stratified cross-validation with three-fold inner selection of a candidate model family. At each outer fold, the candidate is selected using only that fold's training portion. These estimates describe the **selection procedure**, whose chosen family can vary by fold; they are not performance estimates from an external test set. The final serving family is selected separately by full-cohort out-of-fold screening and then fit on all 303 rows.

| Target | Final fitted serving family* | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---:|---:|---:|---:|---:|
| CAD | Logistic regression | 0.858 | 0.899 | 0.903 | 0.901 | 0.895 |
| LAD | Random forest | 0.779 | 0.784 | 0.859 | 0.819 | 0.843 |
| LCX | Random forest | 0.686 | 0.620 | 0.521 | 0.566 | 0.760 |
| RCA | Extra trees | 0.650 | 0.535 | 0.535 | 0.535 | 0.696 |

*The family column describes the final full-cohort refit chosen by a separate out-of-fold screen; the metrics in the row evaluate the nested selection procedure, where the chosen family may differ by outer fold. Threshold-dependent metrics use a provisional 0.5 threshold. No confidence intervals or external-test metrics are provided. RCA/LCX performance is especially modest and should be discussed honestly in a pitch.

## Limitations

- Small sample, retrospective, single public cohort; external validity is unknown.
- Internal cross-validation is not external, temporal, prospective or clinical validation.
- Feature semantic documentation and units are incomplete/unverified.
- Threshold 0.5 is a default engineering convention, not a clinically selected operating point.
- Probability outputs may be poorly calibrated and must not be interpreted as personal risk without further validation.
- The explanation panel now uses approximate model-agnostic permutation SHAP values, grouped back to original predictors. Marginal masking can create unrealistic combinations; attribution is not causal and not a clinical explanation.
- The anatomy scene does not encode patient-specific imaging or lesion location.

## Ethical and safety considerations

Do not use for patient care or public medical advice. Any future clinical pathway requires qualified clinical, biostatistical, privacy, security and regulatory review as applicable to the jurisdiction.

## Visualization addendum
The 3D heart is a generic atlas model (Z-Anatomy / BodyParts3D, CC BY-SA). LAD/LCX/RCA artery colour encodes that artery's model score only; it does not depict a lesion, stenosis or patient anatomy, and CAD (overall) is never drawn on an artery. The interface shows nested out-of-fold metrics only. Not clinically validated; research use only.
