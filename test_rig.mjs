import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
const EXE = '/home/hatch/workspace/bos-playtest/chrome-headless-shell/linux-156.0.8078.47/chrome-headless-shell-linux64/chrome-headless-shell';
const server = spawn('python3', ['-m', 'http.server', '8944', '--bind', '127.0.0.1'], { cwd: '/home/hatch/workspace/tweenbug', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox', '--window-size=1280,860'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8944/editor.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ed && window.__ed.scene', { timeout: 30000 });

let fails = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : '')); if (!ok) fails++; }

const findJoint = function find(root, name) { if (root.name === name) return root; for (const ch of root.children || []) if (ch.joint) { const f = find(ch.joint, name); if (f) return f; } return null; };
const FIND_SRC = '(' + findJoint.toString() + ')';

// --- baseline (in rig mode, so both sides measure the bind pose) ---
await page.evaluate(() => { window.__ed.setMode('rig'); window.__ed.select('armR'); });
const base = await page.evaluate((findSrc) => {
  const find = eval(findSrc);
  const s = window.__ed.scene;
  const armR = find(s.rig, 'armR'), elbowR = find(s.rig, 'elbowR');
  const e = built.joints.get('armR'), p = e.parts[0];
  const bb = p.el.getBBox(), m = p.el.getScreenCTM();
  const c = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m);
  return { armAt: [...armR.at], elbAt: [...elbowR.at], partAt: armR.children.find(c => c.part !== undefined).at || null,
           parts: e.parts.length, elbWorld: jointScreenPos(built, 'elbowR'), partCenter: { x: c.x, y: c.y } };
}, FIND_SRC);
console.log('baseline', JSON.stringify(base));
check('armR has parts', base.parts >= 1, base.parts + ' parts');

// --- 1. pivot drag (+40,+24 screen px): hinge moves, art + children stay in world ---
const piv = await page.evaluate(() => jointScreenPos(built, 'armR'));
await page.mouse.move(piv.x, piv.y);
await page.mouse.down();
await page.mouse.move(piv.x + 40, piv.y + 24, { steps: 8 });
await page.mouse.up();
const afterPivot = await page.evaluate((findSrc) => {
  const find = eval(findSrc);
  const s = window.__ed.scene;
  const armR = find(s.rig, 'armR'), elbowR = find(s.rig, 'elbowR');
  const e = built.joints.get('armR'), p = e.parts[0];
  const bb = p.el.getBBox(), m = p.el.getScreenCTM();
  const c = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m);
  return { armAt: [...armR.at], elbAt: [...elbowR.at], partAt: [...(armR.children.find(c => c.part !== undefined).at || [0, 0])],
           elbWorld: jointScreenPos(built, 'elbowR'), partCenter: { x: c.x, y: c.y } };
}, FIND_SRC);
console.log('after pivot drag', JSON.stringify(afterPivot));
// parent chain scale is root 1.28, so +40/+24 screen px = +31.25/+18.75 parent units
check('hinge moved by drag', near(afterPivot.armAt[0], base.armAt[0] + 31.25, 1.8) && near(afterPivot.armAt[1], base.armAt[1] + 18.75, 1.8), JSON.stringify(afterPivot.armAt));
check('child joint compensated', near(afterPivot.elbAt[0], base.elbAt[0] - 31.25, 1.8) && near(afterPivot.elbAt[1], base.elbAt[1] - 18.75, 1.8), JSON.stringify(afterPivot.elbAt));
check('part offset compensated', near(afterPivot.partAt[0], -31.25, 1.8) && near(afterPivot.partAt[1], -18.75, 1.8), JSON.stringify(afterPivot.partAt));
check('elbow world position unchanged', near(afterPivot.elbWorld.x, base.elbWorld.x, 2.5) && near(afterPivot.elbWorld.y, base.elbWorld.y, 2.5));
check('part art world position unchanged', near(afterPivot.partCenter.x, base.partCenter.x, 2.5) && near(afterPivot.partCenter.y, base.partCenter.y, 2.5));

// --- 2. part drag (+26,-13 screen px): art moves, hinge + children stay ---
const handle = await page.evaluate(() => {
  const e = built.joints.get('armR'), p = e.parts[0];
  const m = e.el.getScreenCTM();
  const s = new DOMPoint(p.node.at[0], p.node.at[1]).matrixTransform(m);
  return { x: s.x, y: s.y };
});
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + 26, handle.y - 13, { steps: 8 });
await page.mouse.up();
const afterPart = await page.evaluate((findSrc) => {
  const find = eval(findSrc);
  const s = window.__ed.scene;
  const armR = find(s.rig, 'armR'), elbowR = find(s.rig, 'elbowR');
  const e = built.joints.get('armR'), p = e.parts[0];
  const bb = p.el.getBBox(), m = p.el.getScreenCTM();
  const c = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m);
  return { armAt: [...armR.at], elbAt: [...elbowR.at], partAt: [...p.node.at], partCenter: { x: c.x, y: c.y } };
}, FIND_SRC);
console.log('after part drag', JSON.stringify(afterPart));
// joint world scale 1.28, so +26/-13 screen px = +20.3/-10.2 local units
check('part offset moved by drag', near(afterPart.partAt[0], afterPivot.partAt[0] + 20.3, 1.8) && near(afterPart.partAt[1], afterPivot.partAt[1] - 10.2, 1.8), JSON.stringify(afterPart.partAt));
check('hinge untouched by part drag', near(afterPart.armAt[0], afterPivot.armAt[0], 0.01) && near(afterPart.armAt[1], afterPivot.armAt[1], 0.01));
check('child joint untouched by part drag', near(afterPart.elbAt[0], afterPivot.elbAt[0], 0.01) && near(afterPart.elbAt[1], afterPivot.elbAt[1], 0.01));
check('art moved on screen by the drag', near(afterPart.partCenter.x, afterPivot.partCenter.x + 26, 3.5) && near(afterPart.partCenter.y, afterPivot.partCenter.y - 13, 3.5));

// --- 3. shift+drag pivot (+16,0): whole joint moves, no compensation ---
const piv2 = await page.evaluate(() => jointScreenPos(built, 'armR'));
await page.keyboard.down('Shift');
await page.mouse.move(piv2.x, piv2.y);
await page.mouse.down();
await page.mouse.move(piv2.x + 16, piv2.y, { steps: 6 });
await page.mouse.up();
await page.keyboard.up('Shift');
const afterWhole = await page.evaluate((findSrc) => {
  const find = eval(findSrc);
  const s = window.__ed.scene;
  const armR = find(s.rig, 'armR'), elbowR = find(s.rig, 'elbowR');
  return { armAt: [...armR.at], elbAt: [...elbowR.at], partAt: [...built.joints.get('armR').parts[0].node.at] };
}, FIND_SRC);
console.log('after shift-drag', JSON.stringify(afterWhole));
check('whole-joint drag moved hinge', near(afterWhole.armAt[0], afterPart.armAt[0] + 12.5, 1.8), JSON.stringify(afterWhole.armAt));
check('whole-joint drag did NOT compensate child', near(afterWhole.elbAt[0], afterPart.elbAt[0], 0.01) && near(afterWhole.elbAt[1], afterPart.elbAt[1], 0.01));
check('whole-joint drag did NOT compensate part', near(afterWhole.partAt[0], afterPart.partAt[0], 0.01));

// --- 4. save/load round-trip: rig edits live in the JSON ---
const saved = await page.evaluate(() => JSON.stringify(window.__ed.scene));
writeFileSync('/tmp/rigtest-scene.json', saved);
const input = await page.$('#loadFile');
await input.uploadFile('/tmp/rigtest-scene.json');
await new Promise(r => setTimeout(r, 600));
const reloaded = await page.evaluate((findSrc) => {
  const find = eval(findSrc);
  const armR = find(window.__ed.scene.rig, 'armR');
  return { armAt: [...armR.at], partAt: [...built.joints.get('armR').parts[0].node.at] };
}, FIND_SRC);
check('rig edits survive save/load round-trip', near(reloaded.armAt[0], afterWhole.armAt[0], 0.01) && near(reloaded.partAt[0], afterWhole.partAt[0], 0.01), JSON.stringify(reloaded));

await page.screenshot({ path: '/home/hatch/workspace/tweenbug/check_rig.png' });
await browser.close(); server.kill();
console.log(fails === 0 ? 'ALL RIG TESTS PASSED' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
