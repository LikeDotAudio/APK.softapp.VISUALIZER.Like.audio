// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The bundle's front page: the four viewers, each with the demo one click away.
import { VIEWERS, VERSION } from '../core/viewers.mjs';

export default function Index() {
  return (
    <div className="empty" style={{ overflow: 'auto' }}>
      <div className="card" style={{ maxWidth: 680 }}>
        <h1>VISUALIZER.Like.audio <small style={{ color: 'var(--muted)', fontWeight: 400 }}>v{VERSION}</small></h1>
        <p>Four viewers that look at whatever records they are handed, over <code>viz.like.audio/host@1</code>. They know no dataset: a host sends <code>data</code> {'{ records }'}, the viewer reads what each field is from its values, proposes axes, and sends <code>pick</code> / <code>select</code> / <code>view</code> back.</p>
        {Object.entries(VIEWERS).map(([k, v]) => (
          <p key={k} style={{ color: 'var(--text)' }}>
            <a href={v.page} style={{ color: 'var(--accent)' }}>{v.icon} {v.title}</a>{' '}
            <a href={`${v.page}?demo`} style={{ color: 'var(--muted)' }}>(demo)</a>
            <br /><small style={{ color: 'var(--muted)' }}>{v.blurb}</small>
          </p>
        ))}
      </div>
    </div>
  );
}
