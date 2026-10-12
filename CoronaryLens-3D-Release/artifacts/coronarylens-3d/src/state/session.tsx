import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrediction, explainPrediction, getDemoProfile, type ClinicalSchema, type Explanation, type Prediction, type Target } from '@workspace/api-client-react';
import { toProblem, type Problem } from '@/lib/problem';
import { profileKey, submissionValues, type Values } from '@/lib/validate';

type Async<T> = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; problem: Problem };
export interface PredictionRecord { data: Prediction; profile: string }
interface Session {
  values: Values; isDemo: boolean; demoLabel?: string;
  setValue: (name: string, v: unknown) => void;
  clearProfile: () => void;
  loadDemo: () => Promise<void>; demoState: Async<null>;
  prediction: Async<PredictionRecord>;
  /** True when the profile changed after the displayed prediction was produced. */
  stale: boolean;
  runPrediction: (schema: ClinicalSchema) => Promise<void>;
  explanations: Partial<Record<Target, Async<Explanation>>>;
  explain: (target: Target, schema: ClinicalSchema) => Promise<void>;
}
const Ctx = createContext<Session | null>(null);
const KEY = 'coronarylens.profile.v1';

function restore(): { values: Values; isDemo: boolean; demoLabel?: string } {
  try { const r = sessionStorage.getItem(KEY); if (r) return JSON.parse(r); } catch { /* storage unavailable */ }
  return { values: {}, isDemo: false };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const initial = useRef(restore()).current;
  const [values, setValues] = useState<Values>(initial.values);
  const [isDemo, setIsDemo] = useState(initial.isDemo);
  const [demoLabel, setDemoLabel] = useState(initial.demoLabel);
  const [demoState, setDemoState] = useState<Async<null>>({ status: 'idle' });
  const [prediction, setPrediction] = useState<Async<PredictionRecord>>({ status: 'idle' });
  const [explanations, setExplanations] = useState<Partial<Record<Target, Async<Explanation>>>>({});

  // Profile (not predictions) survives navigation and refresh within the tab; it is never written to localStorage.
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ values, isDemo, demoLabel })); } catch { /* ignore */ } }, [values, isDemo, demoLabel]);

  const setValue = useCallback((name: string, v: unknown) => { setValues((p) => ({ ...p, [name]: v })); setIsDemo(false); }, []);
  const clearProfile = useCallback(() => { setValues({}); setIsDemo(false); setDemoLabel(undefined); setPrediction({ status: 'idle' }); setExplanations({}); }, []);
  const loadDemo = useCallback(async () => {
    setDemoState({ status: 'loading' });
    try {
      const demo = await getDemoProfile();
      setValues(demo.values as Values); setIsDemo(true); setDemoLabel(demo.label);
      setPrediction({ status: 'idle' }); setExplanations({});
      setDemoState({ status: 'success', data: null });
    } catch (e) { setDemoState({ status: 'error', problem: toProblem(e) }); }
  }, []);

  const runPrediction = useCallback(async (schema: ClinicalSchema) => {
    const submitted = submissionValues(schema, values);
    setPrediction({ status: 'loading' }); setExplanations({});
    try {
      const data = await createPrediction({ values: submitted });
      setPrediction({ status: 'success', data: { data, profile: profileKey(values) } });
    } catch (e) { setPrediction({ status: 'error', problem: toProblem(e) }); }
  }, [values]);

  const explain = useCallback(async (target: Target, schema: ClinicalSchema) => {
    if (prediction.status !== 'success') return;
    setExplanations((p) => ({ ...p, [target]: { status: 'loading' } }));
    try {
      const data = await explainPrediction(target, { values: submissionValues(schema, values), prediction_request_id: prediction.data.data.request_id });
      setExplanations((p) => ({ ...p, [target]: { status: 'success', data } }));
    } catch (e) { setExplanations((p) => ({ ...p, [target]: { status: 'error', problem: toProblem(e) } })); }
  }, [prediction, values]);

  const stale = prediction.status === 'success' && prediction.data.profile !== profileKey(values);
  const value = useMemo<Session>(() => ({ values, isDemo, demoLabel, setValue, clearProfile, loadDemo, demoState, prediction, stale, runPrediction, explanations, explain }),
    [values, isDemo, demoLabel, setValue, clearProfile, loadDemo, demoState, prediction, stale, runPrediction, explanations, explain]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useSession(): Session { const c = useContext(Ctx); if (!c) throw new Error('useSession outside provider'); return c; }
