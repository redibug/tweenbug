// Tweenbug engine — builds a scene (JSON) into SVG and evaluates pose(t).
// Pose is a pure function of time: same scene + same t = same frame, anywhere.
// Shared by player.html (playback + headless export) and editor.html.

const EASINGS = {
  lin: t => t,
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  back: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
const PROPS = ['x', 'y', 'rot', 'sx', 'sy'];
const DEFAULTS = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };

function sampleKeys(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t <= keys[i + 1][0]) {
      const [t0, v0, e] = keys[i], [t1, v1] = keys[i + 1];
      return v0 + (v1 - v0) * (EASINGS[e || 'sine'] || EASINGS.sine)((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

// Evaluate all tracks + procedural ops at time t -> Map "joint.prop" -> value
function evaluateTracks(scene, t) {
  const vals = new Map();
  const set = (k, v) => vals.set(k, v);
  for (const tr of scene.tracks || []) {
    const v = sampleKeys(tr.keys, t);
    if (tr.mode === 'add') set(tr.target, (vals.get(tr.target) ?? DEFAULTS[tr.target.split('.')[1]]) + v);
    else set(tr.target, v);
  }
  for (const p of scene.procedural || []) {
    let add = 0;
    if (p.type === 'wave') add = p.amp * Math.sin(2 * Math.PI * p.freq * t + (p.phase || 0));
    else if (p.type === 'follow') add = (p.scale || 1) * (vals.get(p.source) ?? DEFAULTS[p.source.split('.')[1]]);
    if (p.mode === 'add') set(p.target, (vals.get(p.target) ?? DEFAULTS[p.target.split('.')[1]]) + add);
    else set(p.target, add);
  }
  return vals;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function buildJoint(node, joints) {
  const g = document.createElementNS(SVGNS, 'g');
  g.id = 'j_' + node.name;
  g.dataset.joint = node.name;
  const entry = { node, el: g, parts: [] };
  joints.set(node.name, entry);
  for (const ch of node.children || []) {
    if (ch.joint) g.appendChild(buildJoint(ch.joint, joints));
    else if (ch.part !== undefined) {
      // Each part gets a wrapper so it can carry its own offset (`at`, in
      // joint space) — that offset is how the artwork slides on its hinge.
      const wrap = document.createElementNS(SVGNS, 'g');
      wrap.setAttribute('class', 'tb-part');
      wrap.dataset.partJoint = node.name;
      wrap.dataset.partIdx = entry.parts.length;
      if (ch.at) wrap.setAttribute('transform', `translate(${ch.at[0]},${ch.at[1]})`);
      wrap.innerHTML = ch.part;
      g.appendChild(wrap);
      entry.parts.push({ node: ch, el: wrap });
    }
  }
  return g;
}

// Keep part wrapper transforms in sync with the scene data (rig edits).
function syncParts(entry) {
  for (const p of entry.parts || []) {
    if (p.node.at) p.el.setAttribute('transform', `translate(${p.node.at[0]},${p.node.at[1]})`);
    else p.el.removeAttribute('transform');
  }
}

// Build the whole scene into an <svg> element. Returns { svg, joints, sparkles }.
function buildScene(svg, scene) {
  svg.setAttribute('viewBox', `0 0 ${scene.stage.width} ${scene.stage.height}`);
  svg.innerHTML = '';
  const joints = new Map();
  let defs = '', backdrop = '';
  if (scene.stage.defs) defs = `<defs>${scene.stage.defs}</defs>`;
  if (scene.stage.backdrop) backdrop = scene.stage.backdrop;
  const fx = scene.stage.fx || [];
  const hasSparkles = fx.find(f => f.type === 'sparkles');
  const hasShadow = fx.find(f => f.type === 'shadow');
  svg.innerHTML = defs + backdrop +
    (hasSparkles ? '<g id="fx_sparkles"></g>' : '') +
    (hasShadow ? '<ellipse id="fx_shadow" cx="360" cy="636" rx="118" ry="17" fill="#000" opacity="0.35"/>' : '');
  svg.appendChild(buildJoint(scene.rig, joints));
  const built = { svg, joints, sparkles: [] };
  if (hasSparkles) {
    const g = svg.querySelector('#fx_sparkles');
    const n = hasSparkles.count || 9;
    for (let i = 0; i < n; i++) {
      const el = document.createElementNS(SVGNS, 'g');
      const p = document.createElementNS(SVGNS, 'path');
      if (i % 3 === 2) {
        p.setAttribute('d', 'M-4,6 a5,4 0 1,0 0.1,0 M4,4 v-14 l9,-3 v13 M4,-10 l9,-3');
        p.setAttribute('fill', i % 2 ? '#ff8fc7' : '#ffd166'); p.setAttribute('stroke', i % 2 ? '#ff8fc7' : '#ffd166');
        p.setAttribute('stroke-width', '2.6'); p.setAttribute('fill-opacity', '0.25');
      } else {
        p.setAttribute('d', 'M0,-11 L2.6,-2.6 L11,0 L2.6,2.6 L0,11 L-2.6,2.6 L-11,0 L-2.6,-2.6 Z');
        p.setAttribute('fill', i % 2 ? '#ffe066' : '#ff9ec7');
      }
      el.appendChild(p); g.appendChild(el);
      built.sparkles.push({ el, x: 90 + (i * 67) % 560, off: i * 0.137, sp: 0.11 + (i % 4) * 0.017, s: 0.8 + (i % 3) * 0.35 });
    }
  }
  return built;
}

// Apply pose at time t to a built scene.
function poseScene(scene, built, t) {
  const tt = scene.loop ? t % scene.duration : Math.min(t, scene.duration);
  const vals = evaluateTracks(scene, tt);
  const get = (name, prop) => vals.get(name + '.' + prop) ?? DEFAULTS[prop];
  for (const [name, entry] of built.joints) {
    const { node, el } = entry;
    syncParts(entry);
    const x = node.at[0] + get(name, 'x'), y = node.at[1] + get(name, 'y');
    const rot = get(name, 'rot');
    const sc = node.scale || 1;
    const sx = get(name, 'sx') * sc, sy = get(name, 'sy') * sc;
    let tr = `translate(${x.toFixed(2)},${y.toFixed(2)})`;
    if (node.pivot) tr += ` translate(${node.pivot[0]},${node.pivot[1]})`;
    tr += ` rotate(${rot.toFixed(2)}) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
    if (node.pivot) tr += ` translate(${-node.pivot[0]},${-node.pivot[1]})`;
    el.setAttribute('transform', tr);
  }
  const shadowFx = (scene.stage.fx || []).find(f => f.type === 'shadow');
  if (shadowFx) {
    const el = built.svg.querySelector('#fx_shadow');
    if (el) {
      const dip = get(shadowFx.source.split('.')[0], shadowFx.source.split('.')[1]);
      el.setAttribute('rx', (118 + dip * 1.1).toFixed(1));
      el.setAttribute('opacity', (0.35 + dip * 0.008).toFixed(3));
    }
  }
  for (const s of built.sparkles) {
    const life = (tt * s.sp + s.off) % 1;
    const x = s.x + Math.sin(tt * 0.7 + s.off * 9) * 14;
    const y = 600 - life * 330;
    const sc = Math.sin(life * Math.PI) * s.s;
    s.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(life * 80).toFixed(1)}) scale(${sc.toFixed(3)})`);
    s.el.setAttribute('opacity', (Math.sin(life * Math.PI) * 0.95).toFixed(2));
  }
}

// Bind/rest pose: rig transforms only, no tracks, no procedural — the pose
// the editor's rig mode shows while connections are being tuned.
function poseRest(scene, built) {
  for (const entry of built.joints.values()) {
    const { node, el } = entry;
    syncParts(entry);
    const sc = node.scale || 1;
    let tr = `translate(${node.at[0]},${node.at[1]})`;
    if (node.pivot) tr += ` translate(${node.pivot[0]},${node.pivot[1]})`;
    tr += ` scale(${sc},${sc})`;
    if (node.pivot) tr += ` translate(${-node.pivot[0]},${-node.pivot[1]})`;
    el.setAttribute('transform', tr);
  }
}

// Joint world position of its pivot, for editor hit-testing/labels.
function jointScreenPos(built, name, svgRect) {
  const { el } = built.joints.get(name);
  const m = el.getScreenCTM();
  return { x: m.e, y: m.f };
}
