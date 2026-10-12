import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity } from 'lucide-react';
import { Pill } from './ui';
import { useArtifactStatus, useServiceStatus } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Overview' }, { href: '/inputs', label: 'Clinical inputs' }, { href: '/workspace', label: 'Model workspace' },
  { href: '/evidence', label: 'Evidence' }, { href: '/methods', label: 'Methods & limits' },
];

/** Service liveness and artifact readiness are shown as two independent facts. */
export function ServiceStatusPills() {
  const svc = useServiceStatus(); const art = useArtifactStatus();
  const sTone = svc.state === 'up' ? 'ok' : svc.state === 'down' ? 'bad' : 'busy';
  const sVal = svc.state === 'up' ? 'reachable' : svc.state === 'down' ? 'unreachable' : 'checking';
  const effective = svc.state === 'down' ? 'unknown' : art.state;
  const aTone = effective === 'ready' ? 'ok' : effective === 'blocked' ? 'warn' : effective === 'checking' ? 'busy' : 'none';
  const aVal = effective === 'ready' ? 'verified' : effective === 'blocked' ? `${art.data?.blockers.length ?? 0} blocker(s)` : effective === 'checking' ? 'checking' : 'unknown';
  return (<>
    <Pill tone={sTone} label="API" value={sVal} title="HTTP service liveness only. Does not imply models are usable." />
    <Pill tone={aTone} label="Model artifacts" value={aVal} className="hide-sm" title={art.data?.blockers.join(' ') || 'Checksums, registry, evaluation report and inference adapter checked by /api/ready.'} />
  </>);
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="header">
        <Link href="/" className="brand"><span className="brand-mark"><Activity size={15} strokeWidth={2.2} /></span>CoronaryLens<small>3D · research</small></Link>
        <nav className="nav" aria-label="Primary">{NAV.map((n) => (<Link key={n.href} href={n.href} aria-current={loc === n.href ? 'page' : undefined}>{n.label}</Link>))}</nav>
        <div className="status-cluster"><ServiceStatusPills /></div>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">
        <span><strong>Research prototype.</strong> Not a medical device. Not clinically validated. No diagnosis, treatment or risk advice.</span>
        <span>Anatomy: Z-Anatomy / BodyParts3D (CC BY-SA) · Data: UCI #411 (CC BY 4.0)</span>
      </footer>
    </div>
  );
}
