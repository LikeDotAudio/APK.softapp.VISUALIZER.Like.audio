// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ONE SHELL FOR FOUR VIEWERS.
 *
 * It owns the bridge, the model (src/core/infer.mjs over whatever `data`
 * brought), the view (which field each role is drawn by) and the selection,
 * and it draws the bar of role pickers and the empty state. The renderer it is
 * given draws; it never sees a message.
 *
 *   data    → model → proposed view → `fields` (and `error` when a required role is empty)
 *   select  → highlighted indices      view → merged into the view
 *   fly     → the latest six-axis frame, read by the renderer's frame loop
 *   the user picks a field → `view`; clicks a record → `pick`; picks a set → `select`
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectViewer, fetchData, asData } from '../core/bridge.mjs';
import { buildModel, proposeView, missingRoles, fieldsReport, candidates } from '../core/infer.mjs';
import { VIEWERS, VERSION } from '../core/viewers.mjs';
import { demoRecords, DEMO_SCHEMA } from '../core/demo.mjs';
import { parseCsv } from '../core/csv.mjs';

const ROLE_LABEL = { x: 'X', y: 'Y', z: 'Z', color: 'Colour', size: 'Size', shape: 'Shape', face: 'Face', faceGroup: 'Face colour' };
const KIND_LABEL = { number: 'Numbers', time: 'Times', category: 'Categories', color: 'Colours' };

/** A view holds only names the model has (and the non-field knobs as they are). */
function sanitize(model, needs, view) {
  const out = { ...view };
  for (const nd of needs) {
    const v = out[nd.role];
    if (nd.role === 'corners') out.corners = (Array.isArray(v) ? v : []).filter((n) => nd.kinds.includes(model.field(n)?.kind)).slice(0, 6);
    else if (v !== undefined && v !== null && !nd.kinds.includes(model.field(v)?.kind)) out[nd.role] = null;
  }
  return out;
}

export default function ViewerApp({ id, Renderer }) {
  const def = VIEWERS[id];
  const [data, setData] = useState(null);
  const [view, setView] = useState({});
  const [sel, setSel] = useState({ ids: [], pulse: false });
  const [loadError, setLoadError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fly = useRef({ frame: null, at: 0 });
  const bridge = useRef(null);
  const modelRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const model = useMemo(() => (data ? buildModel(data.records, data.schema ?? {}) : null), [data]);
  modelRef.current = model;

  // The bridge: one connection for the page's life.
  useEffect(() => {
    const b = connectViewer({
      viewer: id, needs: def.needs, version: VERSION,
      handlers: {
        hello: () => {
          b.ready();
          const m = modelRef.current;
          if (m) b.send('fields', { fields: fieldsReport(m), view: viewRef.current, records: m.n });
        },
        data: (m) => { setLoadError(null); setSel({ ids: [], pulse: false }); setData({ records: m.records ?? [], schema: m.schema, title: m.title }); },
        select: (m) => setSel({ ids: Array.isArray(m.ids) ? m.ids : [], pulse: !!m.pulse }),
        view: (m) => setView((v) => (modelRef.current ? sanitize(modelRef.current, def.needs, { ...v, ...(m.view ?? {}) }) : { ...v, ...(m.view ?? {}) })),
        fly: (m) => { fly.current = { frame: m, at: performance.now() }; },
      },
    });
    bridge.current = b;
    // Its own host, when nobody else is: ?src=<url> or ?demo.
    const q = new URLSearchParams(location.search);
    if (q.get('src')) fetchData(q.get('src')).then((d) => b.deliver({ type: 'data', ...d })).catch((e) => setLoadError(String(e.message ?? e)));
    else if (q.has('demo')) b.deliver({ type: 'data', records: demoRecords(), schema: DEMO_SCHEMA, title: 'Demo — made-up stars' });
    return () => b.close();
  }, [id, def.needs]);

  // New data: propose a view (the host's hint first), report what was read.
  useEffect(() => {
    if (!model) return;
    const hinted = { ...(data.schema?.view ?? {}) };
    const v = proposeView(model, def.needs, hinted);
    setView(v);
    const b = bridge.current;
    b?.send('fields', { fields: fieldsReport(model), view: v, records: model.n });
    const missing = missingRoles(model, def.needs, v);
    if (missing.length && model.n) b?.send('error', { code: 'too-few-fields', message: tooFew(def, missing) });
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeView = useCallback((patch) => {
    setView((v) => ({ ...v, ...patch }));
    bridge.current?.send('view', { view: patch });
  }, []);

  const onPick = useCallback((index) => {
    const m = modelRef.current;
    if (!m || index == null || index < 0) return;
    const rid = m.idOf(index);
    setSel({ ids: [rid], pulse: false });
    bridge.current?.send('pick', { id: rid, index });
  }, []);

  const onSelect = useCallback((indices, reason) => {
    const m = modelRef.current;
    if (!m) return;
    const ids = indices.map((i) => m.idOf(i));
    bridge.current?.send('select', reason ? { ids, reason } : { ids });
  }, []);

  const selected = useMemo(() => {
    if (!model) return [];
    return sel.ids.map((x) => model.indexOfId(x)).filter((i) => i !== undefined);
  }, [model, sel]);

  const loadFile = async (file) => {
    try {
      const text = await file.text();
      const d = /\.csv$/i.test(file.name) || !/^\s*[[{]/.test(text) ? { records: parseCsv(text), title: file.name } : asData(JSON.parse(text), file.name);
      bridge.current?.deliver({ type: 'data', ...d });
    } catch (e) { setLoadError(`${file.name}: ${e.message ?? e}`); }
  };
  const loadDemo = () => bridge.current?.deliver({ type: 'data', records: demoRecords(), schema: DEMO_SCHEMA, title: 'Demo — made-up stars' });

  const missing = model ? missingRoles(model, def.needs, view) : [];
  const empty = !model || model.n === 0;

  return (
    <div className="app"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}>
      {!empty && (
        <Bar def={def} model={model} view={view} changeView={changeView} title={data.title} presets={data.schema?.presets} id={id} />
      )}
      <div className="stage">
        {empty ? (
          <Empty def={def} id={id} dragging={dragging} loadDemo={loadDemo} loadFile={loadFile} error={loadError} hadData={!!model} />
        ) : (
          <>
            {missing.length > 0 && <div className="notice">{tooFew(def, missing)}</div>}
            <Renderer model={model} view={view} changeView={changeView} selected={selected} pulse={sel.pulse}
              onPick={onPick} onSelect={onSelect} fly={fly} />
          </>
        )}
      </div>
    </div>
  );
}

function tooFew(def, missing) {
  return `${def.title} needs a field for ${missing.map((r) => ROLE_LABEL[r] ?? r).join(', ')}, and these records have none it can use. Pick one above, or send records with more fields.`;
}

/** The role pickers, the axis flips and the host's presets. */
function Bar({ def, model, view, changeView, title, presets, id }) {
  const roles = def.needs.filter((n) => ROLE_LABEL[n.role]);
  const spatial = id === '3d' || id === '4d';
  const signs = view.signs ?? [1, 1, 1];
  return (
    <div className="bar">
      <div className="title">
        <b title={title}>{def.icon} {title || def.title}</b>
        <span>{model.n.toLocaleString()} records · {model.fields.length} fields</span>
      </div>
      {roles.map((nd, k) => (
        <label key={nd.role} className="role">
          {ROLE_LABEL[nd.role]}
          <div className="row">
            <FieldSelect model={model} kinds={nd.kinds} value={view[nd.role] ?? null} allowNone={!nd.required}
              onChange={(v) => changeView({ [nd.role]: v })} />
            {spatial && k < 3 && (
              <button className="btn sign" title={signs[k] === 1 ? 'Ascending — click to flip' : 'Flipped — click to restore'}
                onClick={() => { const s = [...signs]; s[k] = s[k] === 1 ? -1 : 1; changeView({ signs: s }); }}>
                {signs[k] === 1 ? '+' : '−'}
              </button>
            )}
          </div>
        </label>
      ))}
      {presets?.length > 0 && (
        <div className="role">
          Views
          <div className="row">
            {presets.map((p, i) => (
              <button key={i} className="btn" title={p.name} onClick={() => changeView(p.view)}>{p.key ?? i + 1}</button>
            ))}
          </div>
        </div>
      )}
      <span className="spacer" />
    </div>
  );
}

export function FieldSelect({ model, kinds, value, onChange, allowNone }) {
  const groups = kinds.map((k) => [k, candidates(model, [k])]).filter(([, fs]) => fs.length);
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {(allowNone || !value) && <option value="">— none —</option>}
      {groups.map(([k, fs]) => (
        <optgroup key={k} label={KIND_LABEL[k] ?? k}>
          {fs.map((f) => <option key={f.name} value={f.name}>{f.label}{f.unit ? ` (${f.unit})` : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Nobody has sent anything: say how to, and offer a file or the demo. */
function Empty({ def, id, dragging, loadDemo, loadFile, error, hadData }) {
  const input = useRef(null);
  return (
    <div className={`empty${dragging ? ' drop' : ''}`}>
      <div className="card">
        <h1>{def.icon} {def.title}</h1>
        <p>{def.blurb}</p>
        <p><b>{hadData ? 'The data sent has no records.' : 'Send data.'}</b> This viewer draws whatever records it is handed and works out what each field is from the values. From the page that embeds it:</p>
        <pre>{`iframe.contentWindow.postMessage({
  protocol: 'viz.like.audio/host@1',
  type: 'data',
  records: [{ name: 'A', mass: 1.2, kind: 'red' }, …],
}, '*');`}</pre>
        <p>Or open it with <code>?src=&lt;url of a JSON array&gt;</code>, or drop a JSON or CSV file here. The contract is <code>contract/host@1/</code>.</p>
        {error && <p style={{ color: 'var(--warn)' }}>{error}</p>}
        <div className="actions">
          <button className="btn" onClick={() => input.current?.click()}>Open a file…</button>
          <button className="btn" onClick={loadDemo}>Show the demo</button>
          {id !== 'index' && <span style={{ color: 'var(--muted)', alignSelf: 'center' }}>Waiting for a host…</span>}
        </div>
        <input ref={input} type="file" accept=".json,.csv,application/json,text/csv" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}
