import { useEffect } from 'react';
import { Home } from './Home';

/** The dashboard now lives on the check-in page: open it and scroll down to it. */
export function DashboardJump() {
  useEffect(() => { const t = setTimeout(() => document.getElementById('dash')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350); return () => clearTimeout(t); }, []);
  return <Home />;
}
