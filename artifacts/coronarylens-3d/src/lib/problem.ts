import { ApiError } from '@workspace/api-client-react';

/** A normalized, user-presentable API failure. Never converted into fallback data. */
export interface Problem {
  kind: 'network' | 'validation' | 'unavailable' | 'conflict' | 'server';
  message: string;
  code?: string;
  status?: number;
  blockers?: string[];
  fields?: Record<string, string>;
}

export function toProblem(error: unknown): Problem {
  if (error instanceof ApiError) {
    const d = (error.data ?? {}) as { error?: string; code?: string; blockers?: string[]; fields?: Record<string, string> };
    const kind: Problem['kind'] = error.status === 400 ? 'validation' : error.status === 409 ? 'conflict' : error.status === 503 ? 'unavailable' : 'server';
    return { kind, status: error.status, code: d.code, message: d.error ?? error.message, blockers: d.blockers, fields: d.fields };
  }
  if (error instanceof TypeError) {
    return { kind: 'network', message: 'The API could not be reached. Check that the server is running, then retry. Your profile has not been changed.' };
  }
  return { kind: 'server', message: error instanceof Error ? error.message : 'Unexpected error.' };
}
