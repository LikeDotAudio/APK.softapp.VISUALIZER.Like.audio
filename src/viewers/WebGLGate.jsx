// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// A GPU that will not start and a rendering bug are two different sentences, and each is said as itself.
import { Component, useState } from 'react';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { error: null, key: p.resetKey }; }
  static getDerivedStateFromError(error) { return { error }; }
  static getDerivedStateFromProps(p, s) { return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null; }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="empty"><div className="card">
        <h1>💥 The {this.props.what} hit an error</h1>
        <p>A bug in this viewer, not your GPU. New data retries on its own, or:</p>
        <pre>{String(error.message ?? error)}</pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div></div>
    );
  }
}

export function WebGLGate({ what, resetKey, children }) {
  const [ok] = useState(webglAvailable);
  if (!ok) {
    return (
      <div className="empty"><div className="card">
        <h1>{what} unavailable</h1>
        <p>WebGL could not start here (GPU disabled, a sandboxed webview, or hardware acceleration off). The 2D and Analyzer viewers need no GPU.</p>
      </div></div>
    );
  }
  return <Boundary what={what} resetKey={resetKey}>{children}</Boundary>;
}
