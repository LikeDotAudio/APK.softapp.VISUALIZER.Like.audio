// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * SOMETHING TO LOOK AT WHEN NOBODY HAS SENT ANYTHING.
 *
 * A made-up set of "stars", deliberately nobody's real data, generated (not
 * stored) so the page stays small: numbers on very different scales, a
 * category, a second category, a date, a three-number vector and one outlier.
 * It exists to show what a viewer does with whatever it is handed; the empty
 * state offers it beside "send data", never instead of it.
 */
export function demoRecords(n = 400) {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const types = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
  const regions = ['Arm', 'Bulge', 'Halo'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(6, Math.floor(Math.abs(gauss()) * 2.2));
    const temp = 30000 / (t + 1) + gauss() * 800;
    const mass = Math.exp(1.6 - t * 0.45 + gauss() * 0.25);
    const region = regions[Math.floor(rnd() * 3)];
    out.push({
      id: `S${String(i + 1).padStart(4, '0')}`,
      name: `Star ${i + 1}`,
      type: types[t],
      region,
      temperature: Math.round(temp),
      mass: Number(mass.toFixed(3)),
      luminosity: Number((mass ** 3.5 * (1 + gauss() * 0.1)).toFixed(3)),
      distance: { ly: Math.round(50 + rnd() * 4000), error: Number((rnd() * 0.2).toFixed(3)) },
      seen: new Date(Date.UTC(2020, 0, 1) + Math.floor(rnd() * 2000) * 86400000).toISOString().slice(0, 10),
      spectrum: [Number((temp / 30000 + gauss() * 0.05).toFixed(3)), Number((mass / 5 + gauss() * 0.05).toFixed(3)), Number((rnd()).toFixed(3))],
    });
  }
  out[13].luminosity = 9000; // one outlier, so the Analyzer has one to find
  return out;
}

export const DEMO_SCHEMA = { id: 'id', label: 'name', fields: { temperature: { unit: 'K' }, mass: { unit: 'M☉' }, 'distance.ly': { unit: 'ly' }, type: { order: ['O', 'B', 'A', 'F', 'G', 'K', 'M'] } } };
