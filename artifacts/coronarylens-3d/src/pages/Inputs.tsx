import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Beaker, Trash2 } from 'lucide-react';
import type { FeatureDefinition } from '@workspace/api-client-react';
import { Notice, PageHead, Spinner } from '@/components/ui';
import { useSchema } from '@/lib/api';
import { toProblem } from '@/lib/problem';
import { completeness, hasValue, validateFeature } from '@/lib/validate';
import { useSession } from '@/state/session';

const GROUP_BLURB: Record<string, string> = {
  'Demographics': 'Basic descriptors recorded in the source workbook.',
  'Symptoms & examination': 'History, risk factors and physical examination fields as coded in the source workbook.',
  'ECG': 'Electrocardiogram fields as coded in the source workbook.',
  'Laboratory & echocardiography': 'Laboratory and echocardiography values. The workbook declares no units; none are assumed here.',
};

export default function Inputs() {
  const s = useSession(); const q = useSchema(); const [, nav] = useLocation();
  const [filter, setFilter] = useState(''); const [active, setActive] = useState<string | null>(null); const [touched, setTouched] = useState<Record<string, boolean>>({});
  const schema = q.data; const comp = useMemo(() => completeness(schema, s.values), [schema, s.values]);
  const groups = useMemo(() => { const m = new Map<string, FeatureDefinition[]>(); schema?.predictors.forEach((f) => { if (!m.has(f.group)) m.set(f.group, []); m.get(f.group)!.push(f); }); return m; }, [schema]);
  const f = filter.trim().toLowerCase();
  const match = (x: FeatureDefinition) => !f || x.label.toLowerCase().includes(f) || x.name.toLowerCase().includes(f);

  if (q.isPending) return <div className="page"><PageHead eyebrow="Step 1" title="Clinical inputs" /><div className="skeleton" style={{ height: 320 }} aria-label="Loading schema" /></div>;
  if (q.isError || !schema) { const p = toProblem(q.error); return (<div className="page"><PageHead eyebrow="Step 1" title="Clinical inputs" />
    <Notice tone="bad" title="The predictor schema could not be loaded">{p.message}{p.blockers && <ul>{p.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}<p style={{ marginTop: 8 }}><button className="btn sm" onClick={() => void q.refetch()}>Retry</button></p></Notice></div>); }

  const shown = [...groups.entries()].filter(([g]) => !active || g === active);
  return (
    <div className="page">
      <PageHead eyebrow="Step 1 of 2" title="Clinical inputs">Enter or load a profile using the source-cohort predictor schema ({schema.predictor_count} fields). Variable meanings and units are shown only as the source documents them; where a unit is not declared, none is implied.</PageHead>
      <div className="inputs-layout">
        <aside className="side" aria-label="Profile progress">
          <div className="panel panel-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>Completeness</b><span className="mono">{comp.valid}/{comp.total}</span></div>
            <div className="meter" role="progressbar" aria-valuenow={comp.valid} aria-valuemin={0} aria-valuemax={comp.total} aria-label="Valid required fields"><i style={{ width: `${(comp.valid / Math.max(1, comp.total)) * 100}%` }} /></div>
            <p className="faint" style={{ marginTop: 8, fontSize: 12 }}>{comp.ready ? 'All required fields are valid.' : `${comp.total - comp.valid} field(s) still need a valid value.`}</p>
          </div>
          <div className="panel panel-pad" style={{ display: 'grid', gap: 10 }}>
            <button className="btn primary" onClick={() => void s.loadDemo()} disabled={s.demoState.status === 'loading'}>{s.demoState.status === 'loading' ? <Spinner /> : <Beaker size={15} />}Load synthetic demo profile</button>
            <p className="faint" style={{ fontSize: 12 }}>Per-feature median/mode of the training cohort. Not a real person.</p>
            {s.demoState.status === 'error' && <Notice tone="bad" title="Could not load demo profile">{s.demoState.problem.message}</Notice>}
            <button className="btn ghost sm" onClick={s.clearProfile} disabled={comp.filled === 0}><Trash2 size={14} />Clear profile</button>
          </div>
          <input className="search" type="search" placeholder="Filter fields…" aria-label="Filter fields" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <nav className="group-nav" aria-label="Field groups">
            <button aria-current={active === null} onClick={() => setActive(null)}><span>All groups</span><span className="n">{schema.predictors.length}</span></button>
            {[...groups.entries()].map(([g, fs]) => { const ok = fs.filter((x) => hasValue(s.values[x.name]) && !validateFeature(x, s.values[x.name])).length; return (
              <button key={g} aria-current={active === g} onClick={() => setActive(g)}><span>{g}</span><span className="n">{ok}/{fs.length}</span></button>); })}
          </nav>
        </aside>

        <div>
          {s.isDemo && <div style={{ marginBottom: 18 }}><Notice tone="warn" title="Synthetic demo profile loaded">{s.demoLabel ?? 'Synthetic cohort summary'} — editing any field converts this into a custom profile.</Notice></div>}
          {shown.map(([g, fs]) => { const visible = fs.filter(match); if (!visible.length) return null; return (
            <section key={g} className="field-group" id={`g-${g}`} aria-labelledby={`h-${g}`}>
              <h2 id={`h-${g}`}>{g}</h2><p>{GROUP_BLURB[g] ?? ''}</p>
              <div className="fields">{visible.map((ft) => <Field key={ft.name} f={ft} value={s.values[ft.name]} touched={!!touched[ft.name] || s.isDemo} onChange={(v) => s.setValue(ft.name, v)} onBlur={() => setTouched((t) => ({ ...t, [ft.name]: true }))} />)}</div>
            </section>); })}
          {f && ![...groups.values()].flat().some(match) && <div className="empty"><h3>No fields match “{filter}”</h3><p>Try a shorter term or clear the filter.</p></div>}
          <div className="sticky-bar">
            <span className="muted">{comp.ready ? 'Profile is complete and valid.' : `${comp.valid} of ${comp.total} valid${comp.invalid ? ` · ${comp.invalid} outside training range` : ''}`}</span>
            <button className="btn primary lg" disabled={!comp.ready} onClick={() => nav('/workspace')}>Open model workspace<ArrowRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ f, value, touched, onChange, onBlur }: { f: FeatureDefinition; value: unknown; touched: boolean; onChange: (v: unknown) => void; onBlur: () => void }) {
  const err = touched ? validateFeature(f, value) : undefined; const id = `f-${f.name.replace(/\W+/g, '_')}`; const hint = f.type === 'numeric' && f.minimum != null && f.maximum != null ? `Training range ${f.minimum}–${f.maximum}${f.unit ? ` ${f.unit}` : ''}` : f.unit ? `Unit: ${f.unit}` : '';
  return (
    <div className={`field${err ? ' invalid' : ''}`}>
      <label htmlFor={id}><span>{f.label}</span>{f.required && <span className="req">required</span>}</label>
      {f.type === 'numeric' ? (
        <input id={id} type="number" inputMode="decimal" step="any" value={hasValue(value) ? String(value) : ''} aria-invalid={!!err} aria-describedby={`${id}-d`}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} onBlur={onBlur} />
      ) : (
        <select id={id} value={hasValue(value) ? String(value) : ''} aria-invalid={!!err} aria-describedby={`${id}-d`} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
          <option value="">Select…</option>{(f.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>)}
      <span id={`${id}-d`} className={err ? 'err' : 'help'}>{err ?? ([hint, f.description].filter(Boolean).join(' · ') || ' ')}</span>
    </div>
  );
}
