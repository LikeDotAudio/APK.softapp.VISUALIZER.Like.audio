// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// One entry for five pages: the page's <body data-viewer> says which viewer it is,
// and only that viewer's renderer is loaded (the 2D and Analyzer pages never fetch three.js).
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import ViewerApp from './shell/ViewerApp.jsx';
import Index from './shell/Index.jsx';

const RENDERERS = {
  '2d': lazy(() => import('./viewers/Scatter2D.jsx')),
  '3d': lazy(() => import('./viewers/Cloud3D.jsx')),
  '4d': lazy(() => import('./viewers/FaceBall4D.jsx')),
  analyzer: lazy(() => import('./viewers/Analyzer.jsx')),
};

const id = document.body.dataset.viewer;
const Renderer = RENDERERS[id];
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {Renderer ? (
      <Suspense fallback={<div style={{ padding: 24, color: 'var(--muted)' }}>Loading…</div>}>
        <ViewerApp id={id} Renderer={Renderer} />
      </Suspense>
    ) : <Index />}
  </StrictMode>,
);
