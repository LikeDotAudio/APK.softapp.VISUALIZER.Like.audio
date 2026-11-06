// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE ANALYZER — every field of whatever was sent, read as numbers.
 *
 * What SCANALYZER's Stats, Examiner and Scanalyze tabs each did for one kind
 * of record (category counts, a pair of scatters, property bars of one sample
 * against the library, a field/value dump), done once for any record:
 *
 *   left    every field: kind, coverage, distinct values or range, a sparkline
 *   right   the focused field: its statistics, its histogram (a bar selects
 *           those records), its outliers (click one to pick it), or its
 *           busiest values (click one to select them)
 *           how the number fields move together: the correlation matrix and
 *           the strongest pairs
 *           and, when one record is selected, that record: every field, and
 *           for each number where it sits in the population (its percentile)
 */
import { useMemo } from 'react';
import { describe, correlations, percentile } from '../core/stats.mjs';
import { formatValue } from '../core/scale.mjs';

const MAX_CORR = 14;

export default function Analyzer({ model, view, changeView, selected, onPick, onSelect }) {
  const stats = useMemo(() => new Map(model.fields.map((f) => [f.name, describe(f, model.col(f.name), model.n)])), [model]);
  const focus = view.focus && model.field(view.focus) ? view.focus : model.fields.find((f) => f.kind === 'number' && !f.derived)?.name ?? model.fields[0]?.name;
  const numeric = useMemo(() => model.fields.filter((f) => f.kind === 'number' && !f.derived && (f.distinct ?? 0) > 1)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, MAX_CORR).map((f) => f.name), [model]);
  const corr = useMemo(() => correlations(numeric, model.col), [numeric, model]);
  const record = selected.length === 1 ? selected[0] : null;

  return (
    <div className="an">
      <div className="list">
        <table>
          <thead><tr><th>Field</th><th>Kind</th><th>Has</th><th>Values</th><th /></tr></thead>
          <tbody>
            {model.fields.map((f) => {
              const s = stats.get(f.name);
              return (
                <tr key={f.name} className={`f${f.name === focus ? ' on' : ''}`} onClick={() => changeView({ focus: f.name })}>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.label}{f.unit ? <small style={{ color: 'var(--muted)' }}> {f.unit}</small> : null}</td>
                  <td><span className="kind">{f.kind}{f.derived ? '*' : ''}</span></td>
                  <td title={`${f.count ?? 0} of ${model.n}`}><div className="cov"><i style={{ width: `${model.n ? ((f.count ?? 0) / model.n) * 100 : 0}%` }} /></div></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{summary(f, s)}</td>
                  <td>{s?.histogram ? <Spark bins={s.histogram} /> : s?.top ? <Spark bins={s.top.slice(0, 12)} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="detail">
        {record != null && <Record model={model} index={record} stats={stats} onFocus={(n) => changeView({ focus: n })} />}
        <Focus model={model} name={focus} s={stats.get(focus)} onPick={onPick} onSelect={onSelect} />
        {numeric.length >= 2 && <Correlations corr={corr} model={model} onFocus={(n) => changeView({ focus: n })} />}
      </div>
    </div>
  );
}

function summary(f, s) {
  if (!s) return '';
  if (f.kind === 'number' || f.kind === 'time') return s.count ? `${formatValue(s.min, f)} … ${formatValue(s.max, f)}` : '—';
  if (f.kind === 'vector') return `${f.dims} dims`;
  return `${s.distinct} distinct`;
}

function Spark({ bins }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const w = 72, h = 16, bw = w / bins.length;
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      {bins.map((b, k) => <rect key={k} x={k * bw} y={h - (b.count / max) * h} width={Math.max(1, bw - 0.5)} height={(b.count / max) * h} fill="#4e9af1" opacity={0.8} />)}
    </svg>
  );
}

function Focus({ model, name, s, onPick, onSelect }) {
  const f = model.field(name);
  if (!f || !s) return null;
  const col = model.col(name);
  const items = [['Records with it', `${s.count} / ${model.n}`], ['Missing', s.missing]];
  if (s.distinct !== undefined) items.push(['Distinct', s.distinct]);
  if (s.mean !== undefined) items.push(['Min', formatValue(s.min, f)], ['Max', formatValue(s.max, f)], ['Mean', formatValue(s.mean, f)], ['Median', formatValue(s.median, f)], ['Std dev', f.kind === 'time' ? `${(s.std / 86400000).toFixed(1)} d` : formatValue(s.std, f)], ['Q1 … Q3', `${formatValue(s.q1, f)} … ${formatValue(s.q3, f)}`], ['Outliers', s.outliers.length]);
  if (s.dims) items.push(['Dimensions', s.dims]);
  return (
    <section>
      <h2>{f.label} <span className="kind">{f.kind}</span>{f.derived ? <small style={{ color: 'var(--muted)' }}> derived from {f.derived}</small> : null}</h2>
      <div className="stats">{items.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      {s.histogram && (
        <>
          <h4>Distribution <small style={{ textTransform: 'none' }}>— click a bar to select its records</small></h4>
          <Histogram bins={s.histogram} f={f} onSelect={(b) => onSelect(b.indices, `${f.label} ${formatValue(b.lo, f)} … ${formatValue(b.hi, f)}`)} />
        </>
      )}
      {s.outliers?.length > 0 && (
        <>
          <h4>Outliers <small style={{ textTransform: 'none' }}>— beyond 1.5 × IQR ({formatValue(s.lowFence, f)} … {formatValue(s.highFence, f)})</small></h4>
          <div>
            {s.outliers.slice(0, 40).map((i) => <span key={i} className="pill" onClick={() => onPick(i)} title="Pick this record">{model.labelOf(i)} · {formatValue(col[i], f)}</span>)}
            {s.outliers.length > 40 && <small style={{ color: 'var(--muted)' }}> + {s.outliers.length - 40} more</small>}
            <span className="pill" onClick={() => onSelect(s.outliers, `${f.label} outliers`)}>select all {s.outliers.length}</span>
          </div>
        </>
      )}
      {s.top && (
        <>
          <h4>Values <small style={{ textTransform: 'none' }}>— busiest first; click one to select its records</small></h4>
          <div className="bars">
            {s.top.slice(0, 40).map((t) => (
              <div key={t.value} className="b" onClick={() => onSelect(indicesOf(col, t.value), `${f.label} = ${t.value}`)}>
                <span className="v" title={t.value}>{t.value}</span>
                <span className="track"><i style={{ width: `${(t.count / s.top[0].count) * 100}%`, background: f.kind === 'color' ? t.value : undefined }} /></span>
                <span className="c">{t.count}</span>
              </div>
            ))}
            {s.top.length > 40 && <small style={{ color: 'var(--muted)' }}>+ {s.top.length - 40} more values</small>}
          </div>
        </>
      )}
    </section>
  );
}

const indicesOf = (col, v) => { const out = []; col.forEach((x, i) => { if (x === v) out.push(i); }); return out; };

function Histogram({ bins, f, onSelect }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const W = 640, H = 150, bw = W / bins.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', maxWidth: 760, display: 'block' }} role="img" aria-label={`Histogram of ${f.label}`}>
      {bins.map((b, k) => (
        <g key={k} onClick={() => b.count && onSelect(b)} style={{ cursor: b.count ? 'pointer' : 'default' }}>
          <title>{`${formatValue(b.lo, f)} … ${formatValue(b.hi, f)}: ${b.count}`}</title>
          <rect x={k * bw} y={0} width={bw} height={H} fill="transparent" />
          <rect x={k * bw + 0.5} y={H - (b.count / max) * H} width={Math.max(1, bw - 1)} height={(b.count / max) * H} fill="#4e9af1" />
        </g>
      ))}
      <line x1={0} x2={W} y1={H} y2={H} stroke="#33405a" />
      <text x={0} y={H + 14} fill="#8b97ab" fontSize={11}>{formatValue(bins[0].lo, f)}</text>
      <text x={W} y={H + 14} fill="#8b97ab" fontSize={11} textAnchor="end">{formatValue(bins[bins.length - 1].hi, f)}</text>
    </svg>
  );
}

function Correlations({ corr, model, onFocus }) {
  const n = corr.names.length;
  const cell = Math.max(14, Math.min(30, Math.floor(420 / n)));
  const color = (r) => (!Number.isFinite(r) ? '#151b27' : r >= 0 ? `rgba(78,154,241,${Math.abs(r)})` : `rgba(242,142,43,${Math.abs(r)})`);
  return (
    <section>
      <h4>How the numbers move together <small style={{ textTransform: 'none' }}>— Pearson r, blue rises together, orange opposes</small></h4>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <svg width={n * cell + 130} height={n * cell + 4} role="img" aria-label="Correlation matrix">
          {corr.names.map((a, i) => (
            <g key={a}>
              <text x={124} y={i * cell + cell * 0.65} fill="#8b97ab" fontSize={10} textAnchor="end" style={{ cursor: 'pointer' }} onClick={() => onFocus(a)}>{trim(model.field(a)?.label ?? a)}</text>
              {corr.names.map((b, j) => (
                <rect key={b} x={130 + j * cell} y={i * cell} width={cell - 1} height={cell - 1} fill={color(corr.matrix[i][j])}>
                  <title>{`${a} × ${b}: r = ${Number.isFinite(corr.matrix[i][j]) ? corr.matrix[i][j].toFixed(2) : '—'}`}</title>
                </rect>
              ))}
            </g>
          ))}
        </svg>
        <div className="bars" style={{ minWidth: 260, flex: 1 }}>
          {corr.pairs.slice(0, 10).map((p) => (
            <div key={p.a + p.b} className="b rec" style={{ gridTemplateColumns: '1fr 60px' }}>
              <span className="v">{model.field(p.a)?.label} × {model.field(p.b)?.label}</span>
              <span className="c" style={{ color: p.r >= 0 ? '#4e9af1' : '#f28e2b' }}>{p.r.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const trim = (s, k = 20) => (s.length > k ? s.slice(0, k - 1) + '…' : s);

/** One record against the population: every field; numbers with their percentile. */
function Record({ model, index, onFocus }) {
  const rows = model.fields.filter((f) => !f.derived);
  return (
    <section style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <h2>Selected · {model.labelOf(index)}</h2>
      <div className="bars rec">
        {rows.map((f) => {
          const col = model.col(f.name);
          const v = col[index];
          const p = f.kind === 'number' || f.kind === 'time' ? percentile(col, v) : NaN;
          return (
            <div key={f.name} className="b" onClick={() => onFocus(f.name)} style={{ cursor: 'pointer' }}>
              <span className="v" title={f.name}>{f.label}</span>
              {Number.isFinite(p) ? (
                <span className="track" title={`${Math.round(p * 100)}th percentile`}><i style={{ width: `${p * 100}%` }} /></span>
              ) : (
                <span className="v" style={{ color: f.kind === 'color' ? v : 'var(--text)' }}>{formatValue(v, f)}</span>
              )}
              <span className="c">{Number.isFinite(p) ? formatValue(v, f) : ''}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
