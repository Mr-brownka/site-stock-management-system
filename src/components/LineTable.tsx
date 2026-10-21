import { fmt, ItemPicker, newLine, enterNext, type LineDraft } from './ui';
import { Icon } from './fx';
import { useData } from '../lib/store';

/** Item lines as an ERP table: # · item · unit · qty · subphase · in store after · remove.
 *  `effect` says whether the lines add to the store (deliveries) or take from it. */
export function LineTable({ lines, setLines, withSubphase, effect = 'in', glowFirst }: {
  lines: LineDraft[]; setLines: (l: LineDraft[]) => void; withSubphase?: boolean; effect?: 'in' | 'out'; glowFirst?: boolean;
}) {
  const { balanceOf, subphases } = useData();
  const patch = (k: number, p: Partial<LineDraft>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...p } : l)));
  const add = () => setLines([...lines, newLine(lines[lines.length - 1]?.subphase ?? '')]);
  const used = lines.filter((l) => l.item || l.qty);
  const total = used.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  return (
    <div className="lineTblWrap">
      <table className="lineTbl">
        <thead>
          <tr><th className="ltN">#</th><th>Item</th><th className="ltU">Unit</th><th className="ltQ">Qty</th>{withSubphase && <th className="ltS">Subphase</th>}<th className="ltA">In store after</th><th className="ltX"><span className="sr">Remove</span></th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const q = Number(l.qty) || 0;
            const have = l.item ? balanceOf(l.item.id) : 0;
            const after = effect === 'in' ? have + q : have - q;
            const over = effect === 'out' && !!l.item && q > have;
            return (
              <tr key={l.key} className={over ? 'bad' : ''}>
                <td className="ltN mono">{i + 1}</td>
                <td className="ltItem"><ItemPicker bare label={`Item ${i + 1}`} item={l.item} onPick={(it) => patch(l.key, { item: it })} autoFocus={i > 0 && !l.item} glow={glowFirst && i === 0 || i > 0} inputClass="sm" /></td>
                <td className="ltU muted">{l.item?.unit ?? '–'}</td>
                <td className="ltQ">
                  <label><span className="sr">Quantity for line {i + 1}</span>
                    <input data-nav className={`input sm num ${over ? 'bad' : l.item && !l.qty ? 'next' : ''}`} inputMode="decimal" placeholder="0" value={l.qty} onKeyDown={enterNext}
                      onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^0-9.]/g, '') })} aria-invalid={over} />
                  </label>
                </td>
                {withSubphase && (
                  <td className="ltS">
                    <label><span className="sr">Subphase for line {i + 1}</span>
                      <select data-nav className={`select input sm ${l.item && l.qty && !l.subphase ? 'next' : ''}`} value={l.subphase} onChange={(e) => patch(l.key, { subphase: e.target.value })} onKeyDown={enterNext}>
                        <option value="">Choose…</option>{subphases.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                  </td>
                )}
                <td className="ltA mono">{l.item ? <><span className="muted">{fmt(have)} → </span><b className={over ? 'low' : effect === 'in' && q ? 'up' : ''}>{fmt(after)}</b></> : <span className="muted">–</span>}</td>
                <td className="ltX">{lines.length > 1 && <button type="button" className="ltDel" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Icon name="close" size={14} /></button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ltFoot">
        <button type="button" data-nav className="ltAdd" onClick={add}>+ Add a line</button>
        <span className="small"><b className="mono">{used.length}</b> line{used.length === 1 ? '' : 's'} · <b className="mono">{fmt(total)}</b> units in total</span>
      </div>
    </div>
  );
}
