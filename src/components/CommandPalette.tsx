import { useEffect, useMemo, useRef, useState } from 'react';
import { STEPS, useData, type Screen } from '../lib/store';
import { signal } from '../lib/signals';
import { fmt } from './ui';
import { Icon } from './fx';

interface Cmd { id: string; group: 'Suggested' | 'Pages' | 'Actions' | 'Items'; label: string; hint?: string; icon: string; tone?: 'low' | 'out'; run: () => void; keys?: string }

/** Search everything: pages, actions and every item in the store (Ctrl/⌘ K). */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { user, go, openAdmin, signOut, balances, isLow, stepState, submission, lowItems, docsToday } = useData();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { input.current?.focus(); document.body.classList.add('noScroll'); return () => document.body.classList.remove('noScroll'); }, []);

  const all = useMemo<Cmd[]>(() => {
    const to = (s: Screen) => () => go(s);
    const next = STEPS.find((s) => stepState(s.key) === 'todo');
    const entries = docsToday.filter((d) => d.kind !== 'opening').length;
    const suggested: Cmd[] = [];
    if (!submission && next) suggested.push({ id: 's-next', group: 'Suggested', label: `Continue check-in · ${next.label}`, hint: `Step ${next.n} of 4`, icon: 'arrow', run: to(next.screen) });
    if (!submission && !next) suggested.push({ id: 's-submit', group: 'Suggested', label: 'Submit the day', hint: 'All four steps are answered', icon: 'check', run: to('home') });
    if (lowItems.length) suggested.push({ id: 's-low', group: 'Suggested', label: `Show low stock (${lowItems.length})`, icon: 'alert', run: () => { go('home'); signal('dash', { tab: 'bal', filter: 'low' }); } });
    suggested.push({ id: 's-ent', group: 'Suggested', label: `Today’s entries (${entries})`, icon: 'list', run: () => { go('home'); signal('entries'); } });

    const pages: Cmd[] = [
      { id: 'p-home', group: 'Pages', label: 'Check-in', hint: 'Today’s four steps and store balances', icon: 'checkin', run: to('home') },
      ...STEPS.map((s) => ({ id: `p-${s.key}`, group: 'Pages' as const, label: `Step ${s.n} · ${s.label}`, hint: s.desc, icon: { deliveries: 'truck', issued: 'card', returns: 'back', transfers: 'swap' }[s.key], run: to(s.screen) })),
      { id: 'p-st', group: 'Pages', label: 'Stock take', hint: 'Print the sheet, enter counts, history', icon: 'box', run: to('stocktake') },
      { id: 'p-rep', group: 'Pages', label: 'Reports', hint: 'Excel and print', icon: 'report', run: to('reports') },
      { id: 'p-fix', group: 'Pages', label: 'Fix a mistake', hint: 'Corrections and recounts', icon: 'fix', run: to('corrections') },
    ];
    if (user.role === 'admin') pages.push({ id: 'p-adm', group: 'Pages', label: 'Admin', hint: 'People, sites, approvals', icon: 'user', run: openAdmin });

    const actions: Cmd[] = [
      { id: 'a-bal', group: 'Actions', label: 'Store balances', icon: 'chart', run: () => { go('home'); signal('dash', { tab: 'bal', filter: 'all' }); } },
      { id: 'a-cons', group: 'Actions', label: 'Consumption', hint: 'What was used, by period', icon: 'chart', run: () => { go('home'); signal('dash', { tab: 'cons' }); } },
      { id: 'a-print', group: 'Actions', label: 'Print the stock take sheet', icon: 'print', run: to('stocktake') },
      { id: 'a-out', group: 'Actions', label: 'Sign out', icon: 'out', run: signOut },
    ];
    const items: Cmd[] = balances.map((b) => ({
      id: `i-${b.item_id}`, group: 'Items', label: b.name, icon: 'box',
      hint: `${fmt(b.balance)} ${b.unit} in store`, tone: b.balance <= 0 ? 'out' : isLow(b) ? 'low' : undefined,
      run: () => { go('home'); signal('dash', { tab: 'bal', item: b.item_id }); },
    }));
    return [...suggested, ...pages, ...actions, ...items];
  }, [balances, docsToday, go, isLow, lowItems.length, openAdmin, signOut, stepState, submission, user.role]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all.filter((c) => c.group !== 'Items' && c.group !== 'Actions').concat(all.filter((c) => c.group === 'Actions'));
    const words = s.split(/\s+/);
    const score = (c: Cmd) => { const t = c.label.toLowerCase(); return t.startsWith(s) ? 0 : t.includes(s) ? 1 : 2; };
    return all.filter((c) => c.group !== 'Suggested' && words.every((w) => `${c.label} ${c.hint ?? ''}`.toLowerCase().includes(w)))
      .sort((a, b) => score(a) - score(b)).slice(0, 40);
  }, [q, all]);
  useEffect(() => setAt(0), [q]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [at]);

  const run = (c?: Cmd) => { if (!c) return; onClose(); c.run(); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(shown[at]); }
    else if (e.key === 'Escape') onClose();
  };

  let lastGroup = '';
  return (
    <div className="cmdBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Search">
        <label className="cmdInput">
          <Icon name="search" size={20} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Search items, pages and actions…" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="cmdList" />
          <kbd>Esc</kbd>
        </label>
        <div className="cmdList" id="cmdList" role="listbox" ref={listRef}>
          {!shown.length && <div className="cmdEmpty">Nothing matches “{q}”. Try an item name, like <b>cement</b>.</div>}
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <div key={c.id}>
                {head && <div className="cmdGroup">{head}</div>}
                <button role="option" aria-selected={i === at} className="cmdRow" onMouseMove={() => setAt(i)} onClick={() => run(c)}>
                  <span className="cmdIc"><Icon name={c.icon} size={16} /></span>
                  <span className="cmdLabel">{c.label}</span>
                  {c.tone && <span className={`tag ${c.tone}`}>{c.tone === 'out' ? 'Out' : 'Low'}</span>}
                  {c.hint && <span className="cmdHint">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <footer className="cmdFoot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> anytime</span></footer>
      </div>
    </div>
  );
}
