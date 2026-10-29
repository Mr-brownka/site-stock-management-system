import { Component, lazy, type ComponentType, type ReactNode } from 'react';

// A new version of the app was published while this tab was open: the old page asks for files
// that no longer exist and React is left with nothing to show (a white page). Load the new version once.
const KEY = 'ssms-reloaded-at';
const isStale = (e: unknown) => /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically|ChunkLoadError|Loading chunk|Unable to preload/i.test(String((e as Error)?.message ?? e));
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false; // just did; don't loop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* ignore */ }
  location.reload();
  return true;
}
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (ev) => { if (reloadOnce()) ev.preventDefault(); });
}

/** lazy() that tries again once, then loads the new version of the app. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try { return await load(); }
    catch (e) {
      await new Promise((r) => setTimeout(r, 400));
      try { return await load(); }
      catch (e2) { if (isStale(e2) && reloadOnce()) return await new Promise<never>(() => undefined); throw e ?? e2; }
    }
  });
}

/** Never a white page: a screen that fails shows a short message and a Reload button instead. */
export class PageGuard extends Component<{ children: ReactNode; screen?: string }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) {
    console.error('[page]', err);
    if (isStale(err)) reloadOnce();
  }
  componentDidUpdate(prev: { screen?: string }) { if (prev.screen !== this.props.screen && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page" role="alert" style={{ alignItems: 'flex-start', gap: 12 }}>
        <h2 style={{ margin: 0 }}>This page didn’t load</h2>
        <p className="muted" style={{ margin: 0 }}>Usually a new version of SiteStock was just published. Reloading fixes it.</p>
        <button className="btn accent sm" onClick={() => location.reload()}>Reload</button>
        <small className="muted mono">{String(this.state.err.message).slice(0, 160)}</small>
      </div>
    );
  }
}
