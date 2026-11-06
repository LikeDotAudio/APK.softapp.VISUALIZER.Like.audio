// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The hover card: the record's label, then its value for each role in use. Offset up-right of the point, never over it.
import { formatValue } from '../core/scale.mjs';

export function cardRows(model, index, view, roles) {
  const rows = [];
  const seen = new Set();
  for (const r of roles) {
    const name = view[r];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const f = model.field(name);
    rows.push([f?.label ?? name, formatValue(model.col(name)?.[index], f)]);
  }
  return rows;
}

export function Tip({ model, index, view, roles, x, y }) {
  return (
    <div className="tip" style={{ left: x, top: y, transform: 'translate(14px, calc(-100% - 10px))' }}>
      <b>{model.labelOf(index)}</b>
      {cardRows(model, index, view, roles).map(([k, v]) => <div key={k}><i>{k}:</i> {v}</div>)}
    </div>
  );
}
