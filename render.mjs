import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const EXE = '/home/hatch/workspace/bos-playtest/chrome-headless-shell/linux-156.0.8078.47/chrome-headless-shell-linux64/chrome-headless-shell';
const ROOT = '/home/hatch/workspace/tweenbug';
const server = spawn('python3', ['-m', 'http.server', '8943', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox', '--window-size=720,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 720, height: 720 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8943/player.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });
for (const [t, name] of [[0.7, 'wave'], [2.75, 'pump'], [4.15, 'twirl'], [7.7, 'final']]) {
  await page.evaluate(tt => window.__setTime(tt), t);
  await page.screenshot({ path: `${ROOT}/check_${name}.png` });
}
console.log('player stills done');
await browser.close(); server.kill();
