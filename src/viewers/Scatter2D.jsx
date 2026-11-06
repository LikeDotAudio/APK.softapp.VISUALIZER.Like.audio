// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * 2D — two fields against each other, one point per record, on a canvas (a
 * Cell per point in SVG is what made the old recharts scatter gate itself at
 * 3,000 points; a canvas draws the BIM library's 7,424 parts without blinking).
 *
 * Wheel zooms about the cursor, drag pans, double-click resets. Hover names the
 * record; click picks it; the arrow keys move the pick to the nearest point that
 * way. A category on an axis is laid out in bands with a little jitter.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { axisScale, axisDomain, colorScale, sizeScale, niceTicks, formatValue } from '../core/scale.mjs';
import { Legend } from './Legend.jsx';
import { Tip } from './Tip.jsx';

const M = { l: 64, r: 16, t: 14, b: 40 };

export default function Scatter2D({ model, view, selected, pulse, onPick }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [box, setBox] = useState({ w: 600, h: 400 });
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 }); // in unit space [-1,1]
  const [hover, setHover] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.max(100, e.contentRect.width), h: Math.max(100, e.contentRect.height) }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setZoom({ k: 1, x: 0, y: 0 }), [view.x, view.y, model]);

  const fx = model.field(view.x), fy = model.field(view.y);
  const pts = useMemo(() => {
    const sx = axisScale(fx, model.col(view.x)), sy = axisScale(fy, model.col(view.y));
    const c = colorScale(model.field(view.color), model.col(view.color));
    const s = sizeScale(model.field(view.size), model.col(view.size));
    const out = new Array(model.n);
    for (let i = 0; i < model.n; i++) out[i] = { u: sx(i), v: sy(i), c: c.color(i), r: 3 * s(i) };
    return { out, legend: c.legend, colorField: model.field(view.color) };
  }, [model, view.x, view.y, view.color, view.size, fx, fy]);

  const W = box.w - M.l - M.r, H = box.h - M.t - M.b;
  // unit → pixel, through the zoom.
  const px = (u) => M.l + ((((u - zoom.x) * zoom.k) + 1) / 2) * W;
  const py = (v) => M.t + (1 - ((((v - zoom.y) * zoom.k) + 1) / 2)) * H;
  const unitX = (p) => ((p - M.l) / W) * 2 - 1;
  const unitY = (p) => (1 - (p - M.t) / H) * 2 - 1;

  // Ticks in value space for each axis, placed through the same scale.
  const ticks = (f, col, sign = 1) => {
    const d = axisDomain(f, col);
    if (!d) return [];
    if (d.categories) {
      const span = Math.max(1, d.categories.length - 1);
      const every = Math.ceil(d.categories.length / 14);
      return d.categories.map((c, k) => ({ at: sign * (d.categories.length > 1 ? (k / span) * 2 - 1 : 0), text: c })).filter((_, k) => k % every === 0);
    }
    const range = d.hi - d.lo || 1;
    return niceTicks(d.lo, d.hi, 6).map((v) => ({ at: ((v - d.lo) / range) * 2 - 1, text: formatValue(v, { kind: f.kind }) }));
  };
  const xt = useMemo(() => ticks(fx, model.col(view.x)), [fx, model, view.x]); // eslint-disable-line react-hooks/exhaustive-deps
  const yt = useMemo(() => ticks(fy, model.col(view.y)), [fy, model, view.y]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw. The selection breathes while `pulse` is on.
  useEffect(() => {
    const cv = canvas.current;
    const dpr = window.devicePixelRatio || 1;
    cv.width = box.w * dpr; cv.height = box.h * dpr;
    const g = cv.getContext('2d');
    let raf = 0;
    const draw = (t) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, box.w, box.h);
      g.font = '11px system-ui, sans-serif';
      g.strokeStyle = '#1c2433'; g.fillStyle = '#8b97ab'; g.lineWidth = 1;
      g.textAlign = 'center'; g.textBaseline = 'top';
      for (const tk of xt) { const x = px(tk.at); if (x < M.l - 1 || x > M.l + W + 1) continue; g.beginPath(); g.moveTo(x, M.t); g.lineTo(x, M.t + H); g.stroke(); g.fillText(clip(tk.text), x, M.t + H + 6); }
      g.textAlign = 'right'; g.textBaseline = 'middle';
      for (const tk of yt) { const y = py(tk.at); if (y < M.t - 1 || y > M.t + H + 1) continue; g.beginPath(); g.moveTo(M.l, y); g.lineTo(M.l + W, y); g.stroke(); g.fillText(clip(tk.text, 9), M.l - 6, y); }
      g.strokeStyle = '#33405a'; g.strokeRect(M.l, M.t, W, H);
      g.save();
      g.beginPath(); g.rect(M.l, M.t, W, H); g.clip();
      g.globalAlpha = 0.85;
      for (const p of pts.out) { g.fillStyle = p.c; g.beginPath(); g.arc(px(p.u), py(p.v), p.r, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      const s = pulse ? 0.5 + 0.5 * Math.sin(t / 100) : 0;
      for (const i of selected) {
        const p = pts.out[i]; if (!p) continue;
        g.strokeStyle = '#ffffff'; g.lineWidth = 2;
        g.beginPath(); g.arc(px(p.u), py(p.v), p.r + 4 + s * 5, 0, Math.PI * 2); g.stroke();
      }
      if (hover != null && pts.out[hover]) {
        const p = pts.out[hover];
        g.strokeStyle = '#4e9af1'; g.lineWidth = 2;
        g.beginPath(); g.arc(px(p.u), py(p.v), p.r + 3, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
      g.fillStyle = '#c3cede'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(`X · ${fx?.label ?? '—'}`, M.l + W / 2, box.h - 2);
      g.save(); g.translate(12, M.t + H / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'top'; g.fillText(`Y · ${fy?.label ?? '—'}`, 0, 0); g.restore();
      if (pulse && selected.length) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }); // every render: cheap enough at 10k points, and keeps the canvas honest

  const nearest = (mx, my, within = 12) => {
    let best = null, bd = within * within;
    for (let i = 0; i < pts.out.length; i++) {
      const p = pts.out[i];
      const dx = px(p.u) - mx, dy = py(p.v) - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const local = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  // Arrow keys: nearest point in that direction, within a 45° cone.
  useEffect(() => {
    const onKey = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !selected.length) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const s = pts.out[selected[0]]; if (!s) return;
      e.preventDefault();
      let best = -1, score = Infinity;
      pts.out.forEach((p, i) => {
        if (i === selected[0]) return;
        const dx = px(p.u) - px(s.u), dy = py(s.v) - py(p.v);
        const [along, perp] = e.key === 'ArrowRight' ? [dx, Math.abs(dy)] : e.key === 'ArrowLeft' ? [-dx, Math.abs(dy)] : e.key === 'ArrowUp' ? [dy, Math.abs(dx)] : [-dy, Math.abs(dx)];
        if (along <= 0 || perp > along) return;
        const d = Math.hypot(dx, dy);
        if (d < score) { score = d; best = i; }
      });
      if (best >= 0) onPick(best);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="canvas" ref={wrap}>
      <canvas ref={canvas} style={{ width: box.w, height: box.h, display: 'block', cursor: drag.current ? 'grabbing' : hover != null ? 'pointer' : 'crosshair' }}
        aria-label={`Scatter of ${model.n} records: ${fx?.label} against ${fy?.label}`}
        onWheel={(e) => {
          const [mx, my] = local(e);
          const ux = unitX(mx) / zoom.k + zoom.x, uy = unitY(my) / zoom.k + zoom.y;
          const k = Math.max(1, Math.min(200, zoom.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
          setZoom({ k, x: ux - unitX(mx) / k, y: uy - unitY(my) / k });
        }}
        onMouseDown={(e) => { drag.current = { at: local(e), z: zoom, moved: false }; }}
        onMouseMove={(e) => {
          const [mx, my] = local(e);
          if (drag.current) {
            const [ax, ay] = drag.current.at;
            if (Math.abs(mx - ax) + Math.abs(my - ay) > 3) drag.current.moved = true;
            const z = drag.current.z;
            setZoom({ k: z.k, x: z.x - ((mx - ax) / W) * 2 / z.k, y: z.y + ((my - ay) / H) * 2 / z.k });
            return;
          }
          const n = nearest(mx, my);
          setHover(n == null ? null : n);
        }}
        onMouseUp={(e) => {
          const d = drag.current; drag.current = null;
          if (d && !d.moved) { const [mx, my] = local(e); const n = nearest(mx, my); if (n != null) onPick(n); }
        }}
        onMouseLeave={() => { drag.current = null; setHover(null); }}
        onDoubleClick={() => setZoom({ k: 1, x: 0, y: 0 })}
      />
      {hover != null && pts.out[hover] && (
        <Tip model={model} index={hover} view={view} roles={['x', 'y', 'color', 'size']} x={px(pts.out[hover].u)} y={py(pts.out[hover].v)} />
      )}
      <Legend field={pts.colorField} legend={pts.legend} />
    </div>
  );
}

const clip = (s, n = 14) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
