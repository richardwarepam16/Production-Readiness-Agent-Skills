// Render the film frame-by-frame in headless Chromium and pipe PNGs to ffmpeg.
//   node src/render.mjs stills out/stills 0 45 90      -> PNG stills of given frames
//   node src/render.mjs video out/video.mp4 [fps]       -> silent H.264 master
//   node src/render.mjs cues out/cues.json              -> footfall cue sheet for audio
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || execSync('python3 -c "import imageio_ffmpeg as i; print(i.get_ffmpeg_exe())"').toString().trim();
const [mode, out, ...rest] = process.argv.slice(2);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + path.join(here, 'film.html'));
  await page.evaluate(() => window.ready);
  return page;
}
const grab = (page, f) => page.evaluate(f => { window.renderFrame(f); return document.getElementById('c').toDataURL('image/png'); }, f)
  .then(u => Buffer.from(u.split(',')[1], 'base64'));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() => chromium.launch());

if (mode === 'cues') {
  const page = await openPage(browser);
  fs.writeFileSync(out, JSON.stringify(await page.evaluate(() => window.cues()), null, 1));
} else if (mode === 'stills') {
  fs.mkdirSync(out, { recursive: true });
  const page = await openPage(browser);
  for (const f of rest.map(Number)) fs.writeFileSync(path.join(out, `f${String(f).padStart(4, '0')}.png`), await grab(page, f));
} else if (mode === 'video') {
  const WORKERS = 4;
  const pages = await Promise.all(Array.from({ length: WORKERS }, () => openPage(browser)));
  const { frames, FPS } = await pages[0].evaluate(() => window.FILM);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-tune', 'grain', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Map(); let next = 0, issued = 0; const t0 = Date.now();
  const write = buf => new Promise(r => ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r));
  const flush = async () => { while (done.has(next)) { const b = done.get(next); done.delete(next); await write(b); next++; if (next % 60 === 0) console.log(`frame ${next}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); } };
  let flushing = Promise.resolve();
  await Promise.all(pages.map(async page => {
    while (issued < frames) {
      const f = issued++;
      done.set(f, await grab(page, f));
      flushing = flushing.then(flush);
      while (done.size > 24) await flushing;
    }
  }));
  await flushing; await flush();
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
