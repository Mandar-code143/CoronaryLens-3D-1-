import type { ClinicalSchema, FeatureDefinition } from '@workspace/api-client-react';

export type Values = Record<string, unknown>;
export const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '';

export function validateFeature(f: FeatureDefinition, v: unknown): string | undefined {
  if (!hasValue(v)) return f.required ? 'Required' : undefined;
  if (f.type === 'numeric') {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 'Enter a finite number';
    if (f.minimum != null && n < f.minimum) return `Below the training range (min ${f.minimum})`;
    if (f.maximum != null && n > f.maximum) return `Above the training range (max ${f.maximum})`;
    return undefined;
  }
  const cats = f.categories ?? [];
  if (cats.length && !cats.includes(String(v))) return 'Choose one of the listed values';
  return undefined;
}

export function profileErrors(schema: ClinicalSchema | undefined, values: Values): Record<string, string> {
  const out: Record<string, string> = {};
  if (!schema) return out;
  for (const f of schema.predictors) {
    const e = validateFeature(f, values[f.name]);
    if (e) out[f.name] = e;
  }
  return out;
}

export function completeness(schema: ClinicalSchema | undefined, values: Values) {
  const req = schema?.predictors.filter((f) => f.required) ?? [];
  const errors = profileErrors(schema, values);
  const filled = req.filter((f) => hasValue(values[f.name])).length;
  const valid = req.filter((f) => hasValue(values[f.name]) && !errors[f.name]).length;
  return { total: req.length, filled, valid, invalid: Object.keys(errors).filter((k) => hasValue(values[k])).length, ready: !!schema && req.length > 0 && valid === req.length && Object.keys(errors).length === 0 };
}

/** Only schema predictors are ever submitted; outcome fields can never leak into a request. */
export function submissionValues(schema: ClinicalSchema, values: Values): Values {
  const forbidden = new Set(schema.forbidden_predictors);
  const out: Values = {};
  for (const f of schema.predictors) {
    if (forbidden.has(f.name)) continue;
    const v = values[f.name];
    if (!hasValue(v)) continue;
    out[f.name] = f.type === 'numeric' ? Number(v) : String(v);
  }
  return out;
}
export const profileKey = (v: Values) => JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]]));
