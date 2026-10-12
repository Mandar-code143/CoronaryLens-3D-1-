# Suggested 4–6 minute demo recording

Do not describe the prototype as clinically validated. Keep the research-only disclaimer visible or spoken. Record only after a clean install and successful end-to-end test.

1. **0:00–0:30 — Problem and scope.** Introduce CoronaryLens as an educational/research prototype that connects a public cohort model with an interactive coronary schematic. Explicitly say it is not a diagnostic device.
2. **0:30–1:15 — Data and leakage controls.** Show source provenance, 303-row cohort, predictors, the target exclusions, CAD-from-Cath mapping, and the recorded single-label disagreement.
3. **1:15–2:00 — Model evaluation.** Show nested cross-validation evaluation and accuracy, precision, recall, F1, and ROC-AUC per target. Mention that the source repository describes 303 records and says target columns must be excluded from predictor features. Explain this is internal validation on a small retrospective dataset, not external clinical validation.
4. **2:00–3:00 — User workflow.** Load only the synthetic demo profile, inspect fields, submit it, and show CAD/LAD/LCX/RCA model estimates with model/version and threshold caveats. Never use a real patient's information.
5. **3:00–4:00 — 3D interaction.** Rotate, zoom and select LAD/LCX/RCA. Show the vessel-score legend and explain colors represent model estimates only—not lesion location, validated risk bands, or clinical thresholds.
6. **4:00–5:00 — Interpretability.** Show approximate permutation SHAP and clearly state it is not a causal attribution or medical explanation; correlated inputs can distort marginal SHAP values.
7. **5:00–5:30 — Limitations and next steps.** Highlight small sample size, unverified source field units/semantics, no external validation, and planned detailed anatomical mesh. End with research-only warning.

Submission reminder: publish an unlisted or public 3–10 minute video according to the event's submission requirements and paste the actual URL into the form. Do not claim a recording exists until uploaded.
