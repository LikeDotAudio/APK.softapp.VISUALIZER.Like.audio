# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""Writes contract/host@1/host.schema.json. The schema is edited HERE (one place,
readable as Python) and the JSON is its output; `npm test` fails when the two differ."""
import json, pathlib, sys

P = "viz.like.audio/host@1"
KINDS = ["number", "category", "time", "vector", "id", "label", "color", "text"]
VIEWERS = ["2d", "3d", "4d", "analyzer"]
ROLES = ["x", "y", "z", "color", "size", "shape", "face", "faceGroup", "corners", "focus"]

def msg(direction, t, desc, props=None, required=()):
    p = {"protocol": {"const": P}, "type": {"const": t}}
    p.update(props or {})
    return f"{direction}.{t}", {"description": desc, "type": "object",
        "required": ["protocol", "type", *required], "properties": p}

ref = lambda n: {"$ref": f"#/$defs/{n}"}
s = lambda d=None: {"type": "string", **({"description": d} if d else {})}
n = lambda d=None: {"type": "number", **({"description": d} if d else {})}
idv = {"anyOf": [{"type": "string"}, {"type": "number"}]}
fieldOrNull = {"anyOf": [{"type": "string"}, {"type": "null"}]}

defs = {
  "kind": {"description": "What a field holds, as the viewer reads it from the contents: number (finite numbers), category (a small set of repeated values), time (ISO-8601 dates, or epoch numbers a hint declares), vector (equal-length arrays of numbers: an embedding), id (unique per record), label (the human name of a record), color (CSS colour strings), text (long or unique strings nothing is plotted by).", "enum": KINDS},
  "fieldHint": {"description": "What the host knows about one field. Every key is optional; anything not said is inferred from the contents.", "type": "object", "properties": {
      "kind": ref("kind"), "label": s("Display name; the field's own name otherwise."), "unit": s(),
      "order": {"description": "category: the values in the order to lay them out (and, on the 4D ball, the order faces are dealt). Values not listed follow, sorted.", "type": "array", "items": {"type": "string"}},
      "colors": {"description": "category: a CSS colour per value. Values not listed take the viewer's palette.", "type": "object", "additionalProperties": {"type": "string"}},
      "hidden": {"description": "Never offered as an axis or colour (it still shows on hover and in the Analyzer).", "type": "boolean"},
      "group": s("A heading the field is listed under in the pickers (Time, Frequency, …). Ungrouped fields are listed by kind.")}},
  "view": {"description": "What the viewer is drawing by: field names per role (null = none). Each viewer reads the roles it has and ignores the rest. Sent both ways: the host proposes, the viewer reports what the user picked.", "type": "object", "properties": {
      "x": fieldOrNull, "y": fieldOrNull, "z": fieldOrNull, "color": fieldOrNull, "size": fieldOrNull, "shape": fieldOrNull,
      "face": {"description": "4d: the category whose values are the ball's faces (up to 32; the rest share the last face).", "anyOf": [{"type": "string"}, {"type": "null"}]},
      "faceGroup": {"description": "4d: a category that colours the faces (the face's majority value).", "anyOf": [{"type": "string"}, {"type": "null"}]},
      "corners": {"description": "4d: up to six number fields weighting a face's corners.", "type": "array", "items": {"type": "string"}, "maxItems": 6},
      "signs": {"description": "Per spatial axis, 1 or -1 (flip).", "type": "array", "items": {"type": "number"}, "minItems": 3, "maxItems": 3},
      "pull": n("4d: 0 = free scatter, 1 = seated on its face, up to 2 = overshoot."), "cornerPull": n("4d: 0..1"),
      "outline": n("4d: cage brightness 0..2"), "faceIntensity": n("4d: face patch brightness 0..2"),
      "axes": {"description": "Draw the axes / cage labels.", "type": "boolean"},
      "focus": {"description": "analyzer: the field opened in detail.", "anyOf": [{"type": "string"}, {"type": "null"}]}}},
  "preset": {"type": "object", "required": ["name", "view"], "properties": {"key": s("A short button label (A, B, …)."), "name": s(), "view": ref("view")}},
  "schemaHint": {"description": "Optional. What the host knows about its records. Nothing here is required: a bare records array is enough.", "type": "object", "properties": {
      "id": s("The field that identifies a record (echoed in pick/select). Inferred otherwise; the record's index when there is none."),
      "label": s("The field that names a record on hover."),
      "fields": {"type": "object", "additionalProperties": ref("fieldHint")},
      "view": ref("view"), "presets": {"type": "array", "items": ref("preset")}}},
  "need": {"type": "object", "required": ["role", "kinds"], "properties": {"role": {"enum": ROLES}, "kinds": {"type": "array", "items": ref("kind"), "minItems": 1}, "required": {"type": "boolean"}}},
  "fieldInfo": {"type": "object", "required": ["name", "kind", "count"], "properties": {"name": s(), "kind": ref("kind"), "label": s(), "count": {"type": "integer", "minimum": 0, "description": "Records that carry a usable value."}, "distinct": {"type": "integer", "minimum": 0}, "min": n(), "max": n(), "dims": {"type": "integer", "minimum": 1, "description": "vector: its length."}}},
}

for k, v in [
  msg("toViewer", "hello", "Say ready again (and fields/view, when there is data). A host sends it once its listener is up; the viewer also says ready unasked when it loads."),
  msg("toViewer", "data", "The records to look at — any objects. Nested objects are read as dotted paths (a.b.c). Replaces what was there before. The viewer infers every field's kind, proposes a view, and answers `fields`.",
      {"records": {"type": "array", "items": {"type": "object"}}, "schema": ref("schemaHint"), "title": s("Shown in the viewer's header.")}, ["records"]),
  msg("toViewer", "select", "Highlight these records (by id; by index when the data has no id). An empty list clears it. `pulse` makes the highlight breathe (the host is playing it).",
      {"ids": {"type": "array", "items": idv}, "pulse": {"type": "boolean"}}, ["ids"]),
  msg("toViewer", "view", "Change what the viewer draws by (any subset of roles).", {"view": ref("view")}, ["view"]),
  msg("toViewer", "fly", "One six-axis camera input frame, each axis normalised -1..1 (+x right, +y forward, +z up; yaw/pitch/roll right-handed). 3d and 4d fly the camera by it, per second; the others ignore it. The host decides whether a frame is worth flying (stale, unverified) — the viewer flies what it is sent.",
      {a: n() for a in ["x", "y", "z", "yaw", "pitch", "roll"]}, ["x", "y", "z", "yaw", "pitch", "roll"]),
  msg("toHost", "ready", "The viewer is listening. Says which viewer it is and the field kinds each of its roles takes.",
      {"viewer": {"enum": VIEWERS}, "version": s("The bundle's version."), "needs": {"type": "array", "items": ref("need")}}, ["viewer", "needs"]),
  msg("toHost", "fields", "What the viewer read from the last `data`: every field with its inferred kind, and the view it chose (the hint's, else its own proposal).",
      {"fields": {"type": "array", "items": ref("fieldInfo")}, "view": ref("view"), "records": {"type": "integer", "minimum": 0}}, ["fields", "view", "records"]),
  msg("toHost", "pick", "The user clicked one record (or moved to it with the arrow keys).", {"id": idv, "index": {"type": "integer", "minimum": 0}}, ["id", "index"]),
  msg("toHost", "select", "The user chose a set of records (a histogram bin, a face, an outlier list).", {"ids": {"type": "array", "items": idv}, "reason": s()}, ["ids"]),
  msg("toHost", "view", "The user changed what the viewer draws by.", {"view": ref("view")}, ["view"]),
  msg("toHost", "error", "The data cannot be drawn by this viewer as sent (for example 3d with fewer than three plottable fields). The viewer shows the same sentence.", {"code": s(), "message": s()}, ["code", "message"]),
]:
    defs[k] = v

schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://viz.like.audio/contract/host@1/host.schema.json",
  "title": P,
  "description": "The VISUALIZER.Like.audio host bridge: window.postMessage between a viewer (2d, 3d, 4d or analyzer — one page each, in an iframe or a window it was opened in) and the app hosting it. Every message is { protocol: 'viz.like.audio/host@1', type, ...body }. $defs 'toViewer.<type>' are what a host may send; 'toHost.<type>' are what a viewer sends. The viewer knows nothing about any dataset: it reads the contents of `data` and infers what each field is. Fields not listed are ignored by the receiver, so a new optional field stays @1; renaming or removing one is @2. Validate with ../validate.mjs (the CAD's validator, vendored unchanged); samples.json carries one sample of every message.",
  "x-protocol": P,
  "x-transport": "window.postMessage. The viewer hears only its parent (or opener) window and answers to the origin that last spoke to it; a host checks event.source is its iframe.",
  "$defs": defs,
}
out = pathlib.Path(__file__).resolve().parent.parent / "contract" / "host@1" / "host.schema.json"
text = json.dumps(schema, indent=2, ensure_ascii=False) + "\n"
if "--check" in sys.argv:
    sys.exit(0 if out.read_text(encoding="utf-8") == text else 1)
out.write_text(text, encoding="utf-8")
print(f"wrote {out}")
