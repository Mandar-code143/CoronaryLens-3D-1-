import { Link } from 'wouter';
export default function NotFound() { return (<div className="page"><div className="empty"><h3>Page not found</h3><p>That address does not exist in this application.</p><Link href="/" className="btn">Back to overview</Link></div></div>); }
