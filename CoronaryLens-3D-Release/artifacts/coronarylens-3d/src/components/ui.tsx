import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children?: ReactNode }) {
  const Icon = tone === 'bad' ? XCircle : tone === 'warn' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : Info;
  const color = tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : 'var(--info)';
  return (
    <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : 'note'}>
      <Icon size={16} color={color} aria-hidden />
      <div>{title && <strong>{title}</strong>}{children}</div>
    </div>
  );
}
export function Spinner() { return <span className="spinner" aria-hidden />; }
export function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'busy' | 'none' }) { return <span className={`dot ${tone === 'none' ? '' : tone}`} aria-hidden />; }
export function Pill({ tone, label, value, className = '', title }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'busy' | 'none'; label: string; value: string; className?: string; title?: string }) {
  return <span className={`pill ${className}`} title={title}><Dot tone={tone} /><span className="lbl">{label}</span><b>{value}</b></span>;
}
export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <header className="page-head"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{children && <p>{children}</p>}</header>;
}
export const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);
export const num = (v: number | null | undefined, d = 3) => (v == null ? '—' : v.toFixed(d));
export function Ellipsis({ children }: { children: ReactNode }) { return <span>{children}</span>; }
