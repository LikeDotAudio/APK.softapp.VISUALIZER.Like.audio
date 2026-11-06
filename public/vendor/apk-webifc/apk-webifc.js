// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* apk-webifc.js — THE ONE BROWSER IFC ENGINE FOR FOREIGN FILES AND 3D. window.APKWebIfc.

   Our own .ifc files are read by the small STEP codec (contracts/src/ifc, vendored
   as apk-ifc.js): byte-deterministic, no wasm. Two things it does not do, and this
   does, with web-ifc (npm web-ifc, ThatOpen, MPL-2.0):
     1. a FOREIGN file — one another tool wrote (Revit, ArchiCAD, IfcOpenShell …),
        whatever geometry it carries (swept solids, Breps, booleans, mapped items);
     2. 3D GEOMETRY of any file, ours too: every product as a triangle mesh.

   THE ENGINE IS LAZY. This file is a few KB and loads nothing by itself. The
   engine (web-ifc/web-ifc-api.js, ~6 MB, and web-ifc/web-ifc.wasm, ~1.6 MB) is
   fetched the first time a page calls load() / meshes() — so only a page that
   opens a foreign file or draws a model in 3D ever pays for it. needsEngine(text)
   says which case a file is.

   THE FILES ARE web-ifc 0.0.78 AS PUBLISHED, unmodified, beside this file:
     web-ifc/web-ifc-api.js  web-ifc/web-ifc.wasm  web-ifc/LICENSE.md (MPL-2.0)
   from `npm pack web-ifc@0.0.78` (tarball sha512 = the registry's dist.integrity);
   SHA256 below holds each one, and apk-webifc.test.js fails when a byte moves.
   MPL-2.0 is file-level copyleft: the files stay as they are, with their licence,
   and the rest of a page that uses them is under its own licence.

   LOAD: a plain script (or a require, for tests):
     <script src="./vendor/apk-webifc/apk-webifc.js"></script>
   The engine is found next to this script (its own URL), or at opts.base.
     APKWebIfc.needsEngine(text, { geometry })  → true when the codec cannot do it
     APKWebIfc.isOurs(text)                     → FILE_NAME names APK.audio as author
     await APKWebIfc.load(opts?)                → { api, version } (one engine per page)
     await APKWebIfc.meshes(bytesOrText, opts?) → { schema, version, meshes, bounds }
       meshes[i] = { expressID, type ('IfcWall'), name, globalId, color [r,g,b,a],
                     positions Float32Array (world, mm, IFC axes: Z up),
                     normals Float32Array, indices Uint32Array }
       bounds = { min [x,y,z], max [x,y,z] } in mm.
   web-ifc gives metres with Y up; meshes() turns them into the file's own frame
   (X east, Y north, Z up) in mm, which is how every APK drawing is dimensioned.

   vendor/ copies are made, and held to this folder, by
     python3 .apk.scripts/vendor_shared_web.py <app>/vendor/apk-webifc   (lane: webshared). */
(function (g) {
  'use strict';
  var VERSION = '0.0.78';
  var FILES = { api: 'web-ifc/web-ifc-api.js', wasm: 'web-ifc/web-ifc.wasm', licence: 'web-ifc/LICENSE.md' };
  var SHA256 = {
    'web-ifc/web-ifc-api.js': '1edb1dd8e8dba63757932f62001f1b2ee812d86594b6ffc5e1e8beebe1f16690',
    'web-ifc/web-ifc.wasm': '1fbd30bd5515ff6ad15268e87aa26e41d57b29411c8461618b63bee92735d349',
    'web-ifc/LICENSE.md': '1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5',
  };
  var LICENCE = 'MPL-2.0';
  // where this script was served from: the engine is beside it
  var SCRIPT = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';

  /** The HEADER's FILE_NAME, or '' (only the head of the file is read). */
  function fileName(text) {
    var head = String(text).slice(0, 8192);
    var m = /FILE_NAME\s*\(([\s\S]*?)\)\s*;/.exec(head);
    return m ? m[1] : '';
  }

  /** Our own file: FILE_NAME names APK.audio as its author or organization (every APK writer does). */
  function isOurs(text) {
    return /\(\s*'APK\.audio'\s*\)/.test(fileName(text));
  }

  /** Does this file need the engine? A foreign file does; ours only when 3D geometry is asked for. */
  function needsEngine(text, opts) {
    if (opts && opts.geometry) return true;
    return !isOurs(text);
  }

  function baseUrl(opts) {
    var b = (opts && opts.base) || g.APK_WEBIFC_BASE || SCRIPT;
    if (!b) throw new Error('apk-webifc: no base URL — load it with a <script src>, or pass { base }');
    return new URL('./', b).href;
  }

  var pending = null;
  /**
   * The engine, once per page. opts.base: the folder holding web-ifc/ (default: this
   * script's). opts.module: an already-imported web-ifc module (tests).
   */
  function load(opts) {
    if (pending) return pending;
    pending = (async function () {
      var W = opts && opts.module;
      var base = W && opts.wasmPath ? null : baseUrl(opts);
      if (!W) W = await import(new URL(FILES.api, base).href);
      var api = new W.IfcAPI();
      api.SetWasmPath((opts && opts.wasmPath) || new URL('web-ifc/', base).href, true);
      // single-threaded: the mt build needs cross-origin isolation, which no APK page has
      await api.Init(undefined, true);
      if (api.SetLogLevel && W.LogLevel) api.SetLogLevel(W.LogLevel.LOG_LEVEL_OFF);
      return { api: api, module: W, version: (api.GetVersion && api.GetVersion()) || VERSION };
    })();
    pending.catch(function () { pending = null; });
    return pending;
  }

  function bytesOf(input) {
    if (typeof input === 'string') return new TextEncoder().encode(input);
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new TypeError('apk-webifc: give an .ifc as text, a Uint8Array or an ArrayBuffer');
  }

  function val(x) { return x && typeof x === 'object' && 'value' in x ? x.value : x; }

  /**
   * One web-ifc vertex buffer (x y z nx ny nz, local) through its 4×4 placement (column
   * major, metres, Y up) into the file's frame: X, Y north, Z up, mm.
   */
  function toWorld(v, m, scale) {
    var n = v.length / 6, p = new Float32Array(n * 3), q = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var x = v[i * 6], y = v[i * 6 + 1], z = v[i * 6 + 2];
      var nx = v[i * 6 + 3], ny = v[i * 6 + 4], nz = v[i * 6 + 5];
      var wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      var wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      var wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      var ax = m[0] * nx + m[4] * ny + m[8] * nz;
      var ay = m[1] * nx + m[5] * ny + m[9] * nz;
      var az = m[2] * nx + m[6] * ny + m[10] * nz;
      var l = Math.hypot(ax, ay, az) || 1;
      // web-ifc Y-up (x, y, z) = IFC (X, Z, -Y)
      // (0 - x, not -x: no negative zeros in the output)
      p[i * 3] = wx * scale; p[i * 3 + 1] = 0 - wz * scale; p[i * 3 + 2] = wy * scale;
      q[i * 3] = ax / l; q[i * 3 + 1] = 0 - az / l; q[i * 3 + 2] = ay / l;
    }
    return { positions: p, normals: q };
  }

  /** Every product of the file as triangle meshes, in mm. The model is closed again before this returns. */
  async function meshes(input, opts) {
    var eng = await load(opts);
    var api = eng.api;
    var id = api.OpenModel(bytesOf(input), { COORDINATE_TO_ORIGIN: false });
    if (id < 0) throw new Error('apk-webifc: web-ifc could not open the file');
    try {
      var schema = api.GetModelSchema(id);
      var out = [];
      var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      var info = {};
      api.StreamAllMeshes(id, function (mesh) {
        var pid = mesh.expressID;
        if (!info[pid]) {
          var line = {};
          try { line = api.GetLine(id, pid) || {}; } catch (e) { line = {}; }
          var code = api.GetLineType(id, pid);
          var type = api.GetNameFromTypeCode ? api.GetNameFromTypeCode(code) : String(code);
          info[pid] = { type: ifcCase(type), name: val(line.Name) || null, globalId: val(line.GlobalId) || null };
        }
        var gs = mesh.geometries;
        for (var k = 0; k < gs.size(); k++) {
          var pg = gs.get(k);
          var geom = api.GetGeometry(id, pg.geometryExpressID);
          try {
            var v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
            var ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
            if (!v.length || !ix.length) continue;
            var w = toWorld(v, pg.flatTransformation, 1000);
            for (var i = 0; i < w.positions.length; i += 3) {
              for (var a = 0; a < 3; a++) {
                var c = w.positions[i + a];
                if (c < min[a]) min[a] = c;
                if (c > max[a]) max[a] = c;
              }
            }
            var col = pg.color || { x: 0.8, y: 0.8, z: 0.8, w: 1 };
            out.push({
              expressID: pid, type: info[pid].type, name: info[pid].name, globalId: info[pid].globalId,
              color: [col.x, col.y, col.z, col.w],
              positions: w.positions, normals: w.normals, indices: new Uint32Array(ix),
            });
          } finally {
            if (geom.delete) geom.delete();
          }
        }
      });
      return { schema: schema, version: eng.version, meshes: out, bounds: out.length ? { min: min, max: max } : null };
    } finally {
      api.CloseModel(id);
    }
  }

  /** 'IFCWALL' → 'IfcWall' where the engine knows the schema spelling; else as given. */
  function ifcCase(t) {
    if (!/^IFC[A-Z0-9]+$/.test(t)) return t;
    return CASE[t] || ('Ifc' + t.slice(3).charAt(0) + t.slice(4).toLowerCase());
  }
  var CASE = {};
  [
    'IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcRoof', 'IfcDoor', 'IfcWindow', 'IfcColumn', 'IfcBeam',
    'IfcStair', 'IfcStairFlight', 'IfcRailing', 'IfcCovering', 'IfcPlate', 'IfcMember', 'IfcFooting',
    'IfcSpace', 'IfcSite', 'IfcBuildingElementProxy', 'IfcFurnishingElement', 'IfcFurniture',
    'IfcAudioVisualAppliance', 'IfcCommunicationsAppliance', 'IfcElectricAppliance', 'IfcLamp',
    'IfcLightFixture', 'IfcCableSegment', 'IfcCableCarrierSegment', 'IfcCableFitting', 'IfcCableCarrierFitting',
    'IfcDistributionPort', 'IfcFlowTerminal', 'IfcOpeningElement', 'IfcAnnotation', 'IfcVirtualElement',
    'IfcElementAssembly', 'IfcCurtainWall', 'IfcRamp', 'IfcRampFlight', 'IfcChimney', 'IfcShadingDevice',
    'IfcElectricDistributionBoard', 'IfcJunctionBox', 'IfcOutlet', 'IfcSwitchingDevice', 'IfcSensor',
    'IfcActuator', 'IfcAlarm', 'IfcController', 'IfcTransportElement', 'IfcDiscreteAccessory',
    'IfcMechanicalFastener', 'IfcBuildingStorey', 'IfcBuilding',
  ].forEach(function (n) { CASE[n.toUpperCase()] = n; });

  var api = {
    VERSION: VERSION,
    LICENCE: LICENCE,
    FILES: FILES,
    SHA256: SHA256,
    isOurs: isOurs,
    needsEngine: needsEngine,
    load: load,
    meshes: meshes,
    _toWorld: toWorld,
    _ifcCase: ifcCase,
    _reset: function () { pending = null; },
  };
  if (Object.freeze) Object.freeze(api);
  g.APKWebIfc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
