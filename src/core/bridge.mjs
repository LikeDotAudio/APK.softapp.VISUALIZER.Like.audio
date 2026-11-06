// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE VIEWER'S END OF viz.like.audio/host@1
 *
 * A viewer is a page. Whoever embeds it (an iframe) or opened it (a window) is
 * its host, and the host is the only window it hears: a message whose
 * `event.source` is not the parent/opener is dropped, and so is one whose
 * `protocol` is not ours. It answers to the origin that last spoke to it.
 *
 * `ready` is the one message sent before anybody has spoken, so it goes to any
 * origin ('*'): it carries no data, only which viewer this is and what kinds of
 * field it draws by, and a host on another port (the BIM library on :8160
 * framing a viewer served from :8080) has to be able to hear it.
 *
 * The page may also be its own host: `?src=<url>` fetches records (an array, or
 * a `data` body { records, schema?, title? }) and `loadLocal()` takes a file or
 * the demo — both arrive through the same `onMessage` a host's `data` does, so
 * there is one path into a viewer, not three.
 *
 * The schema is contract/host@1/host.schema.json; test/contract.test.mjs holds
 * this file to it.
 */
export const PROTOCOL = 'viz.like.audio/host@1';

/** A message of this protocol: { protocol, type, ...body }. */
export const message = (type, body = {}) => ({ protocol: PROTOCOL, type, ...body });

/** The window a viewer answers to, or null when it stands alone. */
export function hostWindow(w = globalThis.window) {
  if (!w) return null;
  if (w.parent && w.parent !== w) return w.parent;
  if (w.opener && !w.opener.closed) return w.opener;
  return null;
}

/**
 * Listen and send. `handlers` are { hello, data, select, view, fly } — each
 * called with the message. Returns { send(type, body), close(), standalone }.
 */
export function connectViewer({ viewer, needs, version = '1.0.0', handlers, w = globalThis.window }) {
  const host = hostWindow(w);
  let origin = '*';
  const sent = [];
  const send = (type, body) => {
    const m = message(type, body);
    sent.push(m);
    if (sent.length > 50) sent.shift();
    if (host) {
      try { host.postMessage(m, type === 'ready' ? '*' : origin); } catch { /* host went away */ }
    }
    return m;
  };
  const deliver = (m) => {
    const fn = handlers[m.type];
    if (fn) fn(m);
  };
  const onMessage = (event) => {
    const m = event.data;
    if (!m || typeof m !== 'object' || m.protocol !== PROTOCOL || typeof m.type !== 'string') return;
    if (event.source !== host && event.source !== w) return;
    if (event.source === host && event.origin && event.origin !== 'null') origin = event.origin;
    deliver(m);
  };
  w.addEventListener('message', onMessage);
  const ready = () => send('ready', { viewer, version, needs });
  ready();
  // Inspectable from a console or a headless test: the last messages this viewer sent.
  w.__vizSent = sent;
  return {
    send,
    ready,
    deliver,
    standalone: !host,
    close: () => w.removeEventListener('message', onMessage),
  };
}

/** Records from a URL: an array, or { records, schema?, title? }. */
export async function fetchData(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return asData(await r.json(), url);
}

/** Anything record-shaped → a `data` message body. */
export function asData(json, title) {
  if (Array.isArray(json)) return { records: json, title };
  if (json && Array.isArray(json.records)) return { records: json.records, schema: json.schema, title: json.title ?? title };
  if (json && typeof json === 'object') {
    // An object of arrays: the first array of objects in it.
    const arr = Object.values(json).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
    if (arr) return { records: arr, title };
  }
  throw new Error('no records: expected an array of objects, or { records: [...] }');
}
