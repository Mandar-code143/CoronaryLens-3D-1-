import { useQuery } from '@tanstack/react-query';
import { getClinicalSchema, getEvaluation, getModelRegistry, getReadiness, healthCheck } from '@workspace/api-client-react';
import { toProblem } from './problem';

/** Liveness only: the HTTP service answers. Says nothing about models. */
export function useServiceStatus() {
  const q = useQuery({ queryKey: ['service'], queryFn: () => healthCheck(), refetchInterval: 15000, retry: false });
  const state: 'checking' | 'up' | 'down' = q.isPending ? 'checking' : q.isError ? 'down' : 'up';
  return { state, refetch: q.refetch };
}
/** Artifact readiness: schema, dataset audit, registry, evaluation, checksums, inference adapter. Independent of liveness. */
export function useArtifactStatus() {
  const q = useQuery({ queryKey: ['ready'], queryFn: () => getReadiness(), refetchInterval: 30000, retry: false });
  const state: 'checking' | 'ready' | 'blocked' | 'unreachable' = q.isPending ? 'checking' : q.isError ? 'unreachable' : q.data.ready ? 'ready' : 'blocked';
  return { state, data: q.data, problem: q.isError ? toProblem(q.error) : undefined, refetch: q.refetch };
}
export function useSchema() { return useQuery({ queryKey: ['schema'], queryFn: () => getClinicalSchema(), retry: false, staleTime: Infinity }); }
export function useEvaluation() { return useQuery({ queryKey: ['evaluation'], queryFn: () => getEvaluation(), retry: false }); }
export function useRegistry() { return useQuery({ queryKey: ['registry'], queryFn: () => getModelRegistry(), retry: false }); }

export function useEvaluationDetails() {
  return useQuery({
    queryKey: ['evaluation-details'],
    queryFn: async () => {
      const res = await fetch('/api/evaluation/details');
      if (!res.ok) throw new Error('Evaluation details not available');
      return res.json();
    },
    retry: false,
    staleTime: 60000,
  });
}

export function useRepresentativeSamples() {
  return useQuery({
    queryKey: ['representative-samples'],
    queryFn: async () => {
      const res = await fetch('/api/samples');
      if (!res.ok) throw new Error('Representative samples not available');
      return res.json();
    },
    retry: false,
    staleTime: 60000,
  });
}
