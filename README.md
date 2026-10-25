# Tweenbug 🐞

A text-native 2D vector animation studio, inspired by Adobe Flash — not a 1:1
mirror. Drawings, rigs, and animation live in one web program, and **every
document is plain JSON text**, so a human and an AI can read and edit the same
scene files and collaborate on animation directly.

Long-term destination: draw, rig, and animate in the same program.
Current stage: **v0** — the scene format, a player, and a first editor.

- `SPEC.md` — the scene format (parts, rig tree, keyframe tracks)
- `engine.js` — builds a scene and evaluates pose(t); pose is a pure function of time
- `editor.html` — the v0 editor (scrub, select a joint, drag to rotate, set keys, save/load)
- `player.html` — clean scene player (also the headless export surface)
- `scenes/bugchan-dance.json` — the first test document: a dancing Bugchan puppet

No build step. Open the HTML files and go.
