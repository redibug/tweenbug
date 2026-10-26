# Tweenbug scene format — `tweenbug-scene/0`

A Tweenbug scene is **one JSON file**. It is the whole document: artwork,
rig, and animation. It is written to be read — by the person animating, and
by an AI collaborator editing the same file. If a change can't be expressed
as a small, reviewable text diff, the format is wrong, not the change.

## Design principles

1. **Text is the API.** No binary state, no hidden editor data. Anything the
   editor can do, a person (or an LLM) can do by editing this file.
2. **Stable names.** Joints, tracks, and parts are addressed by name
   (`armR.rot`), never by index paths that shift when the file is edited.
3. **Pose is a pure function of time.** `pose(t)` depends only on the scene
   and `t`. Rendering is deterministic; any frame can be reproduced and
   verified headlessly.
4. **One track per concern.** Bounce, sway, and a one-off gesture are
   separate tracks that add together, so each can be edited or deleted
   without touching the others.

## Top-level shape

```json
{
  "format": "tweenbug-scene/0",
  "name": "Bugchan Dance",
  "duration": 8,
  "loop": true,
  "fps": 30,
  "stage": { "...": "below" },
  "rig": { "...": "the root joint" },
  "tracks": [ "..." ],
  "procedural": [ "..." ]
}
```

`duration` is in seconds. Times everywhere are seconds, positions are stage
pixels, rotations are degrees (clockwise positive, SVG convention).

## Stage

```json
"stage": {
  "width": 720, "height": 720,
  "defs": "<linearGradient …>…</linearGradient>",
  "backdrop": "<rect …/>…",
  "fx": [ { "type": "shadow", "source": "root.y" }, { "type": "sparkles", "count": 9 } ]
}
```

- `defs` / `backdrop`: raw SVG markup strings (gradients, background art).
- `fx`: engine conventions, not scene data — in v0 a soft ellipse shadow that
  follows a joint property, and floating sparkles. Rendered by the engine so
  scenes stay about the character.

## Rig

The rig is a tree of **joints**. Each joint is a transform; its parts are
drawn in the joint's local space, and child joints inherit the transform.
Render order is document order: a `part` or `joint` child is drawn exactly
where it appears in `children`.

```json
{
  "name": "armR",
  "at": [37, -76],
  "pivot": [0, 17],
  "scale": 1.28,
  "children": [
    { "part": "<path d=\"…\" fill=\"…\"/>" },
    { "joint": { "name": "elbowR", "at": [0, 46], "children": [ "…" ] } }
  ]
}
```

- `at`: the joint's position in its parent's space. **This is the pivot** —
  the joint rotates and scales around it.
- `pivot` (optional): an extra center for rotation/scale inside the joint's
  own space (e.g. an eye scaling around its middle while sitting elsewhere).
- `scale` (optional): static uniform scale, usually only on the root.
- `part`: a string of SVG markup — one shape or a group. Parts are artwork;
  joints are structure. A hand-drawn puppet maps 1:1: each drawn piece
  becomes a `part` under the joint that moves it.
- A part entry may also carry `"at": [x, y]` — an offset for the artwork
  inside its joint's space (default `[0, 0]`). This is how art slides on its
  hinge without the hinge moving. The editor's **rig mode** writes it: drag
  a part and its `at` changes; drag a hinge (`at` of the joint) and the
  editor writes compensating offsets into the joint's parts and child
  joints so only the hinge moves, not the picture. Animation tracks never
  touch rig offsets — retuning a rig does not disturb a performance.

## Tracks

Animation is a list of **keyframe tracks**. Each track targets one property
of one joint: `joint.prop`, where prop is `x`, `y` (offsets from `at`),
`rot`, `sx`, or `sy`.

```json
{ "name": "wave raise", "target": "armR.rot", "mode": "set",
  "keys": [[0.0, -18, "sine"], [0.45, -132, "out"], [1.6, -132, "sine"], [1.95, -18]] }
```

- A key is `[time, value, easeToNext?]`. The easing names the curve *from
  this key to the next*: `lin`, `sine`, `inOut`, `out`, `back`. Default
  `sine`.
- `mode: "set"` (default): the track defines the property's value.
- `mode: "add"`: the track's value is **added** on top. This is how a bounce
  (`root.y`, add) can coexist with a hop written by someone else — neither
  edit overwrites the other. Human takes and AI takes stack instead of
  fighting.
- Values before the first key and after the last key hold.

## Procedural

Small always-on motions declared as data, applied after tracks:

```json
{ "type": "wave",   "target": "tailL.rot", "freq": 1, "phase": -0.9, "amp": 6, "mode": "add" }
{ "type": "follow", "target": "skirt.rot", "source": "hips.rot", "scale": -0.5, "mode": "add" }
```

- `wave`: `amp * sin(2π · freq · t + phase)` — hair sway, idle breathing.
- `follow`: another property's evaluated value × `scale` — counter-swing,
  lag, and mechanical linkages without duplicate keys.

## Collaboration notes

- Name tracks after intent (`"wave raise"`, `"beat bounce"`), not numbers.
- Keep keys sorted by time; editors (human or otherwise) should too.
- The editor in this repo loads and saves exactly this file. Nothing is
  stored anywhere else — if it isn't in the JSON, it isn't in the scene.

## Not in v0 (later stages)

In-app drawing tools (the long-term destination), easing-curve graph editor,
onion skinning, part libraries, multi-scene projects, sound. The format is
expected to grow `tweenbug-scene/1`, `…/2`, … rather than break v0 files.
