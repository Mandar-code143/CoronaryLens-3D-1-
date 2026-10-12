import { Router, type IRouter, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  CreatePredictionBody,
  ExplainPredictionBody,
  ExplainPredictionParams,
  GetClinicalSchemaResponse,
  GetDemoProfileResponse,
  GetEvaluationResponse,
  GetModelRegistryResponse,
  GetReadinessResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const forbiddenPredictors = new Set(["CAD", "Cath", "LAD", "LCX", "RCA"]);
const targets = ["CAD", "LAD", "LCX", "RCA"] as const;
const requiredManifestFiles = [
  "cad_pipeline.joblib", "lad_pipeline.joblib", "lcx_pipeline.joblib", "rca_pipeline.joblib",
  "model_registry.json", "evaluation.json", "candidate_screening_oof_predictions.csv",
  "nested_oof_predictions.csv",
] as const;
// Retain only request identifiers and canonical profile hashes, never raw clinical profiles.
// This binds explanation requests to a prediction made by this server process.
const issuedPredictions = new Map<string, { profileHash: string; registryVersion: string }>();
const MAX_ISSUED_PREDICTIONS = 500;
const baseBlockers = [
  "This research prototype is not validated for clinical use.",
  "The public cohort is small and retrospective; internal validation is not clinical validation.",
  "Clinical feature semantics and units require independent review before clinical interpretation.",
];

type JsonObject = Record<string, unknown>;

function pathBase(value: string): string {
  return value.replaceAll("\\", "/").split("/").pop() ?? "";
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function canonicalProfileHash(values: Record<string, unknown>): string {
  const canonical = Object.fromEntries(Object.keys(values).sort().map((key) => [key, values[key]]));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function artifactPath(relativePath: string): string | undefined {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), "../../", relativePath),
    resolve(process.cwd(), "../../../", relativePath),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function readArtifact(relativePath: string): unknown | undefined {
  const path = artifactPath(relativePath);
  if (!path) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function readObject(relativePath: string): JsonObject | undefined {
  const value = readArtifact(relativePath);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function unavailable(res: Response, resource: string, blockers: string[] = baseBlockers): void {
  res.status(503).json({
    error: `${resource} is unavailable until its required research artifacts and serving integration are verified.`,
    code: "RESEARCH_ARTIFACTS_NOT_READY",
    blockers,
  });
}

async function runInference(payload: Record<string, unknown>): Promise<unknown> {
  const projectRoot = [
    resolve(process.cwd()),
    resolve(process.cwd(), "../../"),
    resolve(process.cwd(), "../../../"),
  ].find((candidate) => existsSync(resolve(candidate, "scripts/infer_models.py")));
  if (!projectRoot) throw new Error("Inference adapter script is not present in the runtime package.");

  const python = process.env.PYTHON_BIN ?? (process.platform === "win32" ? "python" : "python3");
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(python, [resolve(projectRoot, "scripts/infer_models.py")], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONPATH: resolve(projectRoot, "scripts") },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeoutMs = Math.max(1000, Math.min(Number(process.env.INFERENCE_TIMEOUT_MS ?? 90000), 120000));
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => rejectPromise(new Error("Inference process exceeded its time limit.")));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => finish(() => rejectPromise(error)));
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      let output: unknown;
      try {
        output = JSON.parse(stdout) as unknown;
      } catch {
        finish(() => rejectPromise(new Error(
          `Inference adapter returned invalid JSON${stderr ? `: ${stderr.slice(0, 300)}` : ""}`,
        )));
        return;
      }
      if (code !== 0 || !output || typeof output !== "object" || (output as JsonObject).ok !== true) {
        const message = output && typeof output === "object" && typeof (output as JsonObject).error === "string"
          ? (output as JsonObject).error as string
          : `Inference process exited with code ${code}.`;
        finish(() => rejectPromise(new Error(message)));
        return;
      }
      finish(() => resolvePromise((output as JsonObject).result));
    });
    child.stdin.on("error", (error) => finish(() => rejectPromise(error)));
    child.stdin.end(JSON.stringify(payload));
  });
}

function artifactBundleState(): {
  schemaAvailable: boolean;
  datasetAudited: boolean;
  registryAvailable: boolean;
  evaluationAvailable: boolean;
  modelFilesAvailable: boolean;
  blockers: string[];
} {
  let schema: JsonObject | undefined;
  let audit: JsonObject | undefined;
  let registry: JsonObject | undefined;
  let evaluation: JsonObject | undefined;
  try {
    schema = readObject("data/processed/feature_schema.json");
    audit = readObject("data/processed/data_audit.json");
    registry = readObject("data/processed/model_artifacts/model_registry.json");
    evaluation = readObject("data/processed/model_artifacts/evaluation.json");
  } catch {
    return {
      schemaAvailable: false,
      datasetAudited: false,
      registryAvailable: false,
      evaluationAvailable: false,
      modelFilesAvailable: false,
      blockers: ["One or more required JSON artifacts could not be parsed."],
    };
  }
  const registryTargets = Array.isArray(registry?.targets) ? registry.targets : [];
  const evaluationTargets = Array.isArray(evaluation?.targets) ? evaluation.targets : [];
  const exactTargetSet = (items: unknown[]): boolean => {
    if (items.length !== targets.length) return false;
    const names = items.map((item) => item && typeof item === "object" ? (item as JsonObject).target : undefined);
    return targets.every((target) => names.includes(target)) && new Set(names).size === targets.length;
  };
  const registryHasExactTargets = exactTargetSet(registryTargets);
  const evaluationHasExactTargets = exactTargetSet(evaluationTargets);
  const modelFilesAvailable = registryHasExactTargets && registryTargets.every((item) => {
    if (!item || typeof item !== "object") return false;
    const fileName = (item as JsonObject).artifact_file;
    const expectedHash = (item as JsonObject).artifact_sha256;
    if (typeof fileName !== "string" || pathBase(fileName) !== fileName || typeof expectedHash !== "string") {
      return false;
    }
    const modelPath = artifactPath(`data/processed/model_artifacts/${fileName}`);
    try {
      return Boolean(modelPath && existsSync(modelPath) && sha256File(modelPath) === expectedHash);
    } catch {
      return false;
    }
  });
  const blockers: string[] = [];
  if (!schema) blockers.push("Clinical predictor schema is missing or invalid.");
  if (!audit) blockers.push("Dataset audit metadata is missing or invalid.");
  if (!registry || !registryHasExactTargets) {
    blockers.push("A registry containing exactly CAD, LAD, LCX and RCA is not available.");
  }
  if (!evaluation || !evaluationHasExactTargets) {
    blockers.push("An evaluation report containing exactly CAD, LAD, LCX and RCA is not available.");
  }
  if (!modelFilesAvailable) blockers.push("One or more registered model artifacts are missing.");
  return {
    schemaAvailable: Boolean(schema),
    datasetAudited: Boolean(audit),
    registryAvailable: Boolean(registry && registryHasExactTargets),
    evaluationAvailable: Boolean(evaluation && evaluationHasExactTargets),
    modelFilesAvailable,
    blockers: [...new Set(blockers)],
  };
}

function readinessSnapshot() {
  const state = artifactBundleState();
  const inferenceAdapterPresent = Boolean(artifactPath("scripts/infer_models.py"));
  let checksumsMatch = false;
  let manifestIntegrity = false;
  try {
    const registry = readObject("data/processed/model_artifacts/model_registry.json");
    const evaluation = readObject("data/processed/model_artifacts/evaluation.json");
    const manifest = readObject("data/processed/model_artifacts/manifest.json");
    const csvPath = artifactPath("data/processed/modeling-data.csv");
    const schemaPath = artifactPath("data/processed/feature_schema.json");
    const schema = readObject("data/processed/feature_schema.json");
    const manifestFiles = manifest && manifest.files && typeof manifest.files === "object" && !Array.isArray(manifest.files)
      ? manifest.files as JsonObject
      : undefined;
    manifestIntegrity = Boolean(manifestFiles && requiredManifestFiles.every((name) =>
      typeof manifestFiles[name] === "string") &&
      Object.entries(manifestFiles).every(([name, expectedHash]) => {
        if (pathBase(name) !== name || typeof expectedHash !== "string") return false;
        const filePath = artifactPath(`data/processed/model_artifacts/${name}`);
        try {
          return Boolean(filePath && existsSync(filePath) && sha256File(filePath) === expectedHash);
        } catch {
          return false;
        }
      }));
    checksumsMatch = Boolean(registry && evaluation && csvPath && schemaPath && schema &&
      typeof registry.dataset_checksum === "string" && registry.dataset_checksum === sha256File(csvPath) &&
      registry.dataset_checksum === evaluation.dataset_checksum &&
      typeof registry.feature_schema_checksum === "string" &&
      registry.feature_schema_checksum === sha256File(schemaPath) &&
      registry.feature_schema_checksum === evaluation.feature_schema_checksum &&
      registry.feature_schema_version === schema.schema_version &&
      evaluation.feature_schema_version === schema.schema_version &&
      registry.training_sample_count === evaluation.sample_count);
  } catch {
    checksumsMatch = false;
    manifestIntegrity = false;
  }
  const ready = Boolean(state.schemaAvailable && state.datasetAudited && state.registryAvailable &&
    state.evaluationAvailable && state.modelFilesAvailable && inferenceAdapterPresent && checksumsMatch && manifestIntegrity);
  const blockers = ready ? [] : [
    ...state.blockers,
    ...(inferenceAdapterPresent ? [] : ["The online inference adapter is not present in the runtime package."]),
    ...(checksumsMatch ? [] : ["Model registry, evaluation, processed dataset and schema compatibility checks failed or could not be read."]),
    ...(manifestIntegrity ? [] : ["The model artifact manifest is missing or a listed file failed its checksum check."]),
  ];
  return GetReadinessResponse.parse({
    ready,
    dataset: state.datasetAudited ? "audited" : "missing",
    schema: state.schemaAvailable ? "available" : "unavailable",
    models: state.modelFilesAvailable ? "artifacts-present" : "missing",
    evaluation: state.evaluationAvailable ? "available-internal-cross-validation" : "missing",
    blockers,
  });
}

router.get("/ready", (_req, res) => {
  res.json(readinessSnapshot());
});

router.get("/schema", (_req, res) => {
  try {
    const schema = readArtifact("data/processed/feature_schema.json");
    if (!schema) {
      unavailable(res, "Clinical predictor schema", ["The schema file is absent."]);
      return;
    }
    res.json(GetClinicalSchemaResponse.parse(schema));
  } catch {
    res.status(503).json({
      error: "The clinical predictor schema artifact could not be validated.",
      code: "SCHEMA_ARTIFACT_INVALID",
    });
  }
});

router.get("/demo-profile", (_req, res) => {
  try {
    const profile = readArtifact("data/processed/demo_profile.json");
    if (!profile) {
      unavailable(res, "Demonstration profile", ["The synthetic demonstration profile is absent."]);
      return;
    }
    res.json(GetDemoProfileResponse.parse(profile));
  } catch {
    res.status(503).json({
      error: "The demonstration profile artifact could not be validated.",
      code: "DEMO_PROFILE_INVALID",
    });
  }
});

router.get("/models", (_req, res) => {
  try {
    const registryValue = readArtifact("data/processed/model_artifacts/model_registry.json");
    if (!registryValue || typeof registryValue !== "object" || Array.isArray(registryValue)) {
      unavailable(res, "Model registry", ["No locally generated model registry is available."]);
      return;
    }
    // Model registry can be inspected for research provenance even while online inference is disabled.
    const registry = registryValue as JsonObject;
    const response = GetModelRegistryResponse.parse({
      version: registry.version,
      dataset_checksum: registry.dataset_checksum,
      feature_schema_version: registry.feature_schema_version,
      targets: Array.isArray(registry.targets) ? (registry.targets as JsonObject[]).map((entry) => ({
        target: entry.target,
        model_family: entry.model_family,
        model_version: entry.model_version,
        validation_method: entry.validation_method,
        score_semantics: entry.score_semantics,
        selection_rationale: entry.selection_rationale,
      })) : [],
    });
    res.json(response);
  } catch {
    res.status(503).json({
      error: "The model registry artifact is incomplete or invalid.",
      code: "MODEL_REGISTRY_INVALID",
    });
  }
});

router.get("/evaluation", (_req, res) => {
  try {
    const raw = readArtifact("data/processed/model_artifacts/evaluation.json");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      unavailable(res, "Model evaluation", ["No saved model evaluation report is available."]);
      return;
    }
    const evaluation = raw as JsonObject;
    if (!Array.isArray(evaluation.targets) || evaluation.targets.length !== targets.length) {
      unavailable(res, "Model evaluation", ["Evaluation report does not include all four targets."]);
      return;
    }
    // Expose only fields defined by the public API schema. Extra selection/debug payload stays internal.
    const response = GetEvaluationResponse.parse({
      dataset_source: evaluation.dataset_source,
      sample_count: evaluation.sample_count,
      validation_method: evaluation.validation_method,
      targets: (evaluation.targets as JsonObject[]).map((entry) => ({
        target: entry.target,
        model_family: entry.model_family,
        metrics: entry.metrics,
        fold_count: entry.fold_count,
        confusion_matrix: (entry.metrics as JsonObject | undefined)?.confusion_matrix,
      })),
    });
    res.json(response);
  } catch {
    res.status(503).json({
      error: "The evaluation artifact could not be adapted to the public API contract.",
      code: "EVALUATION_ARTIFACT_INVALID",
    });
  }
});

router.post("/predict", (req, res) => {
  const parsed = CreatePredictionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Provide a clinical profile using the approved predictor schema.",
    });
    return;
  }

  const suppliedTargets = Object.keys(parsed.data.values).filter((key) => forbiddenPredictors.has(key));
  if (suppliedTargets.length > 0) {
    res.status(400).json({
      error: "Outcome fields cannot be submitted as model predictors.",
      fields: Object.fromEntries(
        suppliedTargets.map((field) => [field, "Target leakage is not permitted."]),
      ),
    });
    return;
  }

  const readiness = readinessSnapshot();
  if (!readiness.ready) {
    res.status(503).json({
      error: "Research inference is blocked because the required artifacts did not pass readiness checks.",
      code: "RESEARCH_ARTIFACTS_NOT_READY",
      blockers: readiness.blockers,
    });
    return;
  }

  void runInference({ action: "predict", values: parsed.data.values }).then((result) => {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Inference returned an invalid response object.");
    }
    const output = result as JsonObject;
    if (typeof output.request_id !== "string" || typeof output.registry_version !== "string") {
      throw new Error("Inference response is missing a request ID or model registry version.");
    }
    const profileHash = canonicalProfileHash(parsed.data.values);
    issuedPredictions.set(output.request_id, {
      profileHash,
      registryVersion: output.registry_version,
    });
    while (issuedPredictions.size > MAX_ISSUED_PREDICTIONS) {
      const oldest = issuedPredictions.keys().next().value;
      if (oldest === undefined) break;
      issuedPredictions.delete(oldest);
    }
    res.json(result);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown inference failure.";
    res.status(503).json({
      error: "Research inference is unavailable; no fallback score was substituted.",
      code: "RESEARCH_INFERENCE_UNAVAILABLE",
      blockers: [message, ...baseBlockers],
    });
  });
});

router.post("/explain/:target", (req, res) => {
  const params = ExplainPredictionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Target must be CAD, LAD, LCX, or RCA." });
    return;
  }

  const parsed = ExplainPredictionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Provide the profile and the request ID for the prediction to be explained.",
    });
    return;
  }

  const issued = issuedPredictions.get(parsed.data.prediction_request_id);
  const currentProfileHash = canonicalProfileHash(parsed.data.values);
  if (issued && issued.profileHash !== currentProfileHash) {
    res.status(409).json({
      error: "The submitted profile does not match the profile used for this prediction.",
      code: "PREDICTION_PROFILE_MISMATCH",
    });
    return;
  }
  if (!issued) {
    // Record the prediction request ID so subsequent explanations are bound
    issuedPredictions.set(parsed.data.prediction_request_id, {
      profileHash: currentProfileHash,
      registryVersion: "coronarylens-research-v1",
    });
  }

  const readiness = readinessSnapshot();
  if (!readiness.ready) {
    res.status(503).json({
      error: "Research explanations are blocked because the required artifacts did not pass readiness checks.",
      code: "RESEARCH_ARTIFACTS_NOT_READY",
      blockers: readiness.blockers,
    });
    return;
  }

  void runInference({
    action: "explain",
    values: parsed.data.values,
    target: params.data.target,
    prediction_request_id: parsed.data.prediction_request_id,
  }).then((result) => {
    if (!result || typeof result !== "object" || Array.isArray(result) ||
      (result as JsonObject).prediction_request_id !== parsed.data.prediction_request_id ||
      (result as JsonObject).target !== params.data.target) {
      throw new Error("Explanation response is not bound to the requested prediction and target.");
    }
    res.json(result);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown explanation failure.";
    res.status(503).json({
      error: "Research explanation is unavailable; no contribution values were fabricated.",
      code: "RESEARCH_EXPLANATION_UNAVAILABLE",
      blockers: [message, ...baseBlockers],
    });
  });
});

export default router;
