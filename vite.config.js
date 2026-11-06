// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// Four pages, one bundle. base './': the dist is served from a folder (the OS's
// /APK:Softapps/VISUALIZER/VISUALIZER.Like.audio/dist/, a host's iframe, a static
// site), never a site root. dist/ is TRACKED, as the CAD's is: the OS and every
// host frame it straight out of the checkout.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const page = (name) => resolve(import.meta.dirname, name);

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { index: page('index.html'), '2d': page('2d.html'), '3d': page('3d.html'), '4d': page('4d.html'), analyzer: page('analyzer.html') },
    },
  },
});
