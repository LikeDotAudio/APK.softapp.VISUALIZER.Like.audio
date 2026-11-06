// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE FOUR VIEWERS, AND WHAT EACH ONE DRAWS BY.
 *
 * One table, read by the pages (their pickers), the bridge (`ready.needs`) and
 * the tests. A role's `kinds` are the field kinds it accepts, best first; a
 * `required` role the data cannot fill is the `error` the viewer answers with.
 */
const AXIS = ['number', 'time', 'category'];

export const VIEWERS = {
  '2d': {
    title: '2D Graphs', icon: '📊', page: '2d.html',
    blurb: 'Two fields against each other, one point per record.',
    needs: [
      { role: 'x', kinds: AXIS, required: true },
      { role: 'y', kinds: AXIS, required: true },
      { role: 'color', kinds: ['category', 'number', 'time', 'color'] },
      { role: 'size', kinds: ['number', 'time'] },
    ],
  },
  '3d': {
    title: '3D Point Cloud', icon: '🧊', page: '3d.html',
    blurb: 'Three fields as space, flown through rather than scrolled.',
    needs: [
      { role: 'x', kinds: AXIS, required: true },
      { role: 'y', kinds: AXIS, required: true },
      { role: 'z', kinds: AXIS, required: true },
      { role: 'color', kinds: ['category', 'number', 'time', 'color'] },
      { role: 'size', kinds: ['number', 'time'] },
      { role: 'shape', kinds: ['category'] },
    ],
  },
  '4d': {
    title: '4D Face Ball', icon: '🪐', page: '4d.html',
    blurb: 'Three fields as space, and a category as the face of a 32-face ball each record is pulled toward.',
    needs: [
      { role: 'x', kinds: AXIS, required: true },
      { role: 'y', kinds: AXIS, required: true },
      { role: 'z', kinds: AXIS, required: true },
      { role: 'face', kinds: ['category'], required: true },
      { role: 'faceGroup', kinds: ['category'] },
      { role: 'color', kinds: ['category', 'number', 'time', 'color'] },
      { role: 'corners', kinds: ['number', 'time'] },
    ],
  },
  analyzer: {
    title: 'Analyzer', icon: '🔬', page: 'analyzer.html',
    blurb: 'Every field: its distribution, statistics, outliers, and how the numbers move together.',
    needs: [
      { role: 'focus', kinds: ['number', 'time', 'category', 'id', 'label', 'color', 'text', 'vector'] },
    ],
  },
};

export const VERSION = '1.0.0';
