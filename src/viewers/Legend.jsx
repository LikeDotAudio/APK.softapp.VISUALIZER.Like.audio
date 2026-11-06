// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// What the colours mean: one swatch per category value (busiest first, 24 at most), or the ramp for a number.
export function Legend({ field, legend }) {
  if (!field || !legend?.length) return null;
  if (field.kind === 'number' || field.kind === 'time') {
    return (
      <div className="legend">
        <div style={{ marginBottom: 3 }}>{field.label}</div>
        <div className="ramp" style={{ background: `linear-gradient(90deg, ${legend[0].color}, #2b7a8a, #3aa680, #99cc4d, ${legend[1].color})` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}><span>{field.min !== undefined ? fmt(field.min) : 'low'}</span><span>{field.max !== undefined ? fmt(field.max) : 'high'}</span></div>
      </div>
    );
  }
  const items = [...legend].sort((a, b) => b.count - a.count);
  const shown = items.slice(0, 24);
  return (
    <div className="legend">
      <div style={{ marginBottom: 3 }}>{field.label}</div>
      {shown.map((it) => (
        <div key={it.value} className="item"><span className="sw" style={{ background: it.color }} />{it.value}<span style={{ color: 'var(--muted)' }}>{it.count}</span></div>
      ))}
      {items.length > shown.length && <div style={{ color: 'var(--muted)' }}>+ {items.length - shown.length} more</div>}
    </div>
  );
}
const fmt = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Number(v.toPrecision(3)).toString());
