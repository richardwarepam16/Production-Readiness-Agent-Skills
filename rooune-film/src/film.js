/* ROOUNE — "You've probably already run past them."
 * Deterministic canvas renderer. Every frame is a pure function of time t,
 * so the film can be rendered frame-by-frame (see render.mjs) and the sound
 * design can be generated from the same cue sheet (window.cues()).
 */
'use strict';

const W = 1080, H = 1920, FPS = 30;

// ---------------------------------------------------------------- palette
const P = {
  ink:    '#0A0B0D',
  ink2:   '#111317',
  bone:   '#EDE9E1',
  street: '#1C1F25',
  artery: '#2B2F37',
  accent: '#F0B97F',       // first light — used only for "connected"
};

// ---------------------------------------------------------------- timeline (s)
// Tempo: 180 spm cadence = 3 steps/s = 90 BPM with 2 steps per beat.
const BEAT = 60 / 90;
const T = {
  a0: 0.0,  a1: 2.9,        // runner 01 — Indiranagar
  b1: 4.0,                  // runner 02 — Cubbon Park
  c1: 5.1,                  // runner 03 — Ulsoor Lake
  tri1: 6.6,                // triptych
  mapIn: 6.6, collapse1: 7.35,
  draw0: 7.1,               // hero routes start drawing
  pull0: 8.1, pull1: 11.0,  // camera pull-back
  city0: 8.4,               // the rest of the city appears
  meet: 11.2,               // routes converge
  dive0: 11.75, group: 19 * BEAT,   // 12.667 — match cut ring -> sun
  line0: 13.35,             // "you've probably already run past them."
  end0: 16.0,               // end card
  mark: 25 * BEAT,          // 16.667 — wordmark lands on the beat
  tag: 17.35,
  DUR: 19.5,
};

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const TAU = Math.PI * 2, DEG = Math.PI / 180;

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-6 || !d) break; t -= e / d; }
    t = clamp(t);
    return sy(t);
  };
}
const E = {
  out:   bezier(0.16, 1, 0.3, 1),     // expo-ish out
  inout: bezier(0.7, 0, 0.2, 1),      // editorial in-out
  soft:  bezier(0.45, 0, 0.25, 1),
  in:    bezier(0.7, 0, 0.84, 0),
  cam:   bezier(0.55, 0, 0.1, 1),
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(c1, c2, t) { const a = hex(c1), b = hex(c2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`; }
function rgba(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }
function mixHex(c1, c2, t) { const a = hex(c1), b = hex(c2); return '#' + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, '0')).join(''); }

// value-noise 1D for gentle drift
function noise1(seed) {
  const r = rng(seed); const v = Array.from({ length: 256 }, r);
  return x => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return lerp(v[i & 255], v[(i + 1) & 255], s) * 2 - 1; };
}

// ---------------------------------------------------------------- run cycle
function periodic(keys) {
  const n = keys.length;
  return q => {
    q = ((q % 1) + 1) % 1;
    let i = n - 1; for (let k = 0; k < n; k++) { if (keys[k][0] <= q) i = k; }
    const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
    const q1 = k1[0]; let q2 = k2[0]; if (q2 <= q1) q2 += 1;
    let qq = q; if (qq < q1) qq += 1;
    const t = (qq - q1) / (q2 - q1);
    const p0 = k0[1], p1 = k1[1], p2 = k2[1], p3 = k3[1];
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
}
// q = 0 : foot strike. stance ~0..0.33, swing ~0.33..1
const thighK = periodic([[0, 26], [0.15, 4], [0.32, -26], [0.45, -16], [0.62, 26], [0.8, 46]]);
const kneeK  = periodic([[0, 14], [0.12, 38], [0.27, 26], [0.38, 70], [0.52, 128], [0.66, 112], [0.86, 40]]);
const ankleK = periodic([[0, -10], [0.16, 2], [0.32, 30], [0.52, 16], [0.84, -4]]);

const L = { thigh: 0.245, shin: 0.25, foot: 0.12, torso: 0.3, uarm: 0.17, farm: 0.155, head: 0.064, neck: 0.03 };

function dir(a) { return [Math.sin(a), Math.cos(a)]; } // angle from straight-down, +forward
function legAt(q) {
  const th = thighK(q) * DEG, sh = th - kneeK(q) * DEG, fa = sh + Math.PI / 2 - ankleK(q) * DEG;
  const [tx, ty] = dir(th), [sx, sy] = dir(sh), [fx, fy] = dir(fa);
  const K = [tx * L.thigh, ty * L.thigh];
  const A = [K[0] + sx * L.shin, K[1] + sy * L.shin];
  const heel = [A[0] - fx * 0.03, A[1] - fy * 0.03 + 0.02];
  const toe = [A[0] + fx * L.foot, A[1] + fy * L.foot + 0.012];
  return { K, A, heel, toe };
}
// Precompute ground contact so the planted foot never slides or sinks.
const CYC = (() => {
  const N = 400, low = [], footX = [];
  for (let i = 0; i < N; i++) {
    const q = i / N;
    const l = legAt(q), r = legAt(q + 0.5);
    low.push(Math.max(l.heel[1], l.toe[1], r.heel[1], r.toe[1]) + 0.014);
    footX.push(l.A[0]);
  }
  // smooth the low envelope a little, then add a flight bump
  const sm = low.map((_, i) => { let s = 0; for (let k = -6; k <= 6; k++) s += low[(i + k + N) % N]; return s / 13; });
  const lift = q => { const f = (q % 0.5) / 0.5; return f > 0.62 ? Math.sin((f - 0.62) / 0.38 * Math.PI) * 0.022 : 0; };
  const hipY = sm.map((v, i) => -v - lift(i / N));
  // horizontal speed of the stance foot (body-units per cycle)
  let dx = 0, n = 0;
  for (let i = Math.round(0.04 * N); i < Math.round(0.26 * N); i++) { dx += footX[i] - footX[i + 1]; n++; }
  return { N, hipY, speed: dx / n * N };
})();

// returns joint positions (px, y-down) for a runner with feet on y=0, hip above
function pose(q, h, style = {}) {
  const i = Math.floor(((q % 1 + 1) % 1) * CYC.N) % CYC.N;
  const hy = CYC.hipY[i] * h;
  const hip = [0, hy];
  const lean = ((style.lean || 9) + 3) * DEG;
  const S = [hip[0] + Math.sin(lean) * L.torso * h, hip[1] - Math.cos(lean) * L.torso * h];
  const legs = [q, q + 0.5].map(qq => {
    const l = legAt(qq);
    const p = v => [hip[0] + v[0] * h, hip[1] + v[1] * h];
    return { K: p(l.K), A: p(l.A), heel: p(l.heel), toe: p(l.toe) };
  });
  const arms = [q, q + 0.5].map(qq => {
    const t = thighK(qq);
    const ua = -1.05 * (t - 10) * DEG + 2 * DEG;
    const fwd = clamp((-(t - 8)) / 30, -1, 1);
    const fa = ua + (86 + 22 * fwd) * DEG;
    const [ux, uy] = dir(ua), [fx, fy] = dir(fa);
    const Sh = [S[0] - 0.012 * h, S[1] + 0.03 * h];
    const El = [Sh[0] + ux * L.uarm * h, Sh[1] + uy * L.uarm * h];
    const Wr = [El[0] + fx * L.farm * h, El[1] + fy * L.farm * h];
    return { Sh, El, Wr };
  });
  const neck = [S[0] + 0.012 * h, S[1] - L.neck * h];
  const head = [neck[0] + 0.02 * h, neck[1] - L.head * h * 0.85];
  return { hip, S, legs, arms, neck, head };
}

function capsule(ctx, x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  if (d < Math.abs(r1 - r2) + 0.01) { ctx.moveTo(x1 + r1, y1); ctx.arc(x1, y1, Math.max(r1, r2), 0, TAU); return; }
  const a = Math.atan2(dy, dx), b = Math.acos(clamp((r1 - r2) / d, -1, 1));
  ctx.moveTo(x1 + Math.cos(a + b) * r1, y1 + Math.sin(a + b) * r1);
  ctx.arc(x1, y1, r1, a + b, a - b + TAU);
  ctx.lineTo(x2 + Math.cos(a - b) * r2, y2 + Math.sin(a - b) * r2);
  ctx.arc(x2, y2, r2, a - b, a + b);
  ctx.closePath();
}

// Draw a runner silhouette. x,y = ground point under hip. dirn = +1 right, -1 left.
function drawRunner(ctx, x, y, h, q, dirn, style, cols) {
  const p = pose(q, h, style);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dirn, 1);
  const seg = (a, ra, b, rb) => capsule(ctx, a[0], a[1], ra * h, b[0], b[1], rb * h);
  const limbL = (leg) => { seg(p.hip, 0.056, leg.K, 0.037); seg(leg.K, 0.035, [lerp(leg.K[0], leg.A[0], 0.35), lerp(leg.K[1], leg.A[1], 0.35)], 0.036); seg([lerp(leg.K[0], leg.A[0], 0.35), lerp(leg.K[1], leg.A[1], 0.35)], 0.036, leg.A, 0.019); seg(leg.heel, 0.022, leg.toe, 0.016); };
  const armL = (arm) => { seg(arm.Sh, 0.036, arm.El, 0.024); seg(arm.El, 0.022, arm.Wr, 0.018); ctx.moveTo(arm.Wr[0] + 0.024 * h, arm.Wr[1]); ctx.arc(arm.Wr[0], arm.Wr[1], 0.024 * h, 0, TAU); };

  // far side (slightly lifted by haze for depth)
  ctx.fillStyle = cols.far;
  ctx.beginPath(); limbL(p.legs[1]); armL(p.arms[1]); ctx.fill();
  // body
  ctx.fillStyle = cols.body;
  ctx.beginPath();
  const mid = [lerp(p.hip[0], p.S[0], 0.5) + 0.016 * h, lerp(p.hip[1], p.S[1], 0.5)];
  const chest = [lerp(p.hip[0], p.S[0], 0.78) + 0.014 * h, lerp(p.hip[1], p.S[1], 0.78)];
  seg([p.hip[0] - 0.012 * h, p.hip[1] - 0.005 * h], 0.066, mid, 0.066);
  seg(mid, 0.066, chest, 0.074);
  seg(chest, 0.07, [p.S[0] - 0.006 * h, p.S[1] + 0.03 * h], 0.056);
  seg(p.S, 0.034, p.neck, 0.027);
  ctx.moveTo(p.head[0] + L.head * h, p.head[1]);
  ctx.ellipse(p.head[0], p.head[1], L.head * h * 0.92, L.head * h, 0.15, 0, TAU);
  if (style.cap) { // brim
    seg([p.head[0] - 0.01 * h, p.head[1] - 0.035 * h], 0.03, [p.head[0] + 0.085 * h, p.head[1] - 0.028 * h], 0.008);
  }
  if (style.pony) { // ponytail swings with the bob
    const sw = Math.sin(q * TAU * 2 + 1.2);
    const bx = p.head[0] - 0.05 * h, by = p.head[1] - 0.02 * h;
    ctx.moveTo(bx, by - 0.02 * h);
    ctx.quadraticCurveTo(bx - 0.07 * h, by + (0.0 + 0.02 * sw) * h, bx - 0.1 * h, by + (0.07 + 0.03 * sw) * h);
    ctx.quadraticCurveTo(bx - 0.04 * h, by + 0.03 * h, bx + 0.01 * h, by + 0.02 * h);
    ctx.closePath();
  }
  limbL(p.legs[0]);
  if (style.shorts !== false) seg(p.hip, 0.066, [lerp(p.hip[0], p.legs[0].K[0], 0.42), lerp(p.hip[1], p.legs[0].K[1], 0.42)], 0.052);
  armL(p.arms[0]);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- scenery
function genSkyline(seed, span, o) {
  const r = rng(seed), items = [];
  let x = 0;
  while (x < span) {
    if (o.kind === 'trees') {
      const w = lerp(o.wmin, o.wmax, r());
      items.push({ t: 'tree', x: x + w / 2, w, h: lerp(o.hmin, o.hmax, r()), s: Math.floor(r() * 1e6) });
      x += w * lerp(0.55, 0.9, r());
    } else {
      const w = lerp(o.wmin, o.wmax, r());
      const b = { t: 'bld', x, w, h: lerp(o.hmin, o.hmax, Math.pow(r(), 1.6)), top: r(), s: Math.floor(r() * 1e6) };
      if (o.treesMix && r() < o.treesMix) items.push({ t: 'tree', x: x + w * 0.5, w: w * 1.3, h: lerp(o.hmin * 0.6, o.hmin * 1.4, r()), s: Math.floor(r() * 1e6) });
      items.push(b);
      x += w + (r() < 0.25 ? lerp(4, 30, r()) : 0);
    }
  }
  return { span, items };
}
function drawTree(ctx, cx, base, w, h, s) {
  // rain tree: short trunk that forks into a wide, flat, lumpy umbrella canopy
  const r = rng(s);
  const top = base - h, cy = top + h * 0.22;
  const tw = Math.max(3, w * 0.035);
  ctx.moveTo(cx - tw, base); ctx.lineTo(cx - tw * 0.6, cy + h * 0.25); ctx.lineTo(cx + tw * 0.6, cy + h * 0.25); ctx.lineTo(cx + tw, base); ctx.closePath();
  for (let k = 0; k < 4; k++) { // forks
    const ex = cx + (k / 3 - 0.5) * w * 0.6, ey = cy + h * 0.08;
    capsule(ctx, cx, cy + h * 0.3, tw * 0.55, ex, ey, tw * 0.25);
  }
  const n = 46;
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;                       // across the crown
    const dome = Math.sqrt(1 - u * u);
    const px = cx + u * w * 0.5;
    const py = cy - dome * h * 0.2 + r() * h * 0.22 * dome + (1 - dome) * h * 0.06;
    const rr = w * lerp(0.035, 0.085, r()) * (0.45 + 0.55 * dome);
    ctx.moveTo(px + rr, py); ctx.ellipse(px, py, rr, rr * 0.78, 0, 0, TAU);
  }
}
function drawSkylineLayer(ctx, sk, offset, base, color, windows) {
  const off = ((offset % sk.span) + sk.span) % sk.span;
  ctx.fillStyle = color;
  ctx.beginPath();
  const lit = [];
  for (let rep = -1; rep <= 1; rep++) {
    for (const it of sk.items) {
      const x = it.x - off + rep * sk.span;
      if (x > W + 400 || x + (it.w || 0) < -400) continue;
      if (it.t === 'tree') { drawTree(ctx, x, base, it.w, it.h, it.s); continue; }
      ctx.rect(x, base - it.h, it.w, it.h + 2);
      if (it.top < 0.18) { ctx.rect(x + it.w * 0.2, base - it.h - 14, 22, 14); ctx.rect(x + it.w * 0.2 + 2, base - it.h - 20, 18, 6); } // water tank
      else if (it.top < 0.3) ctx.rect(x + it.w * 0.7, base - it.h - 38, 2, 38);                                                 // antenna
      else if (it.top < 0.5) ctx.rect(x + it.w * 0.15, base - it.h - it.h * 0.12, it.w * 0.55, it.h * 0.12 + 1);                 // stepped
      if (windows) {
        const r = rng(it.s);
        for (let k = 0; k < it.w * it.h / 4000; k++) if (r() < 0.07) lit.push([x + 6 + r() * (it.w - 14), base - it.h + 10 + r() * (it.h - 20)]);
      }
    }
  }
  ctx.fill();
  if (windows && lit.length) {
    ctx.fillStyle = windows;
    for (const [lx, ly] of lit) ctx.fillRect(Math.round(lx), Math.round(ly), 5, 7);
  }
}

// Each street scene: a place, a light, a runner.
const SCENES = {
  A: { // Indiranagar — mid-rise street, lamps still on
    sky: ['#0D1016', '#262A33', '#6C5E56', '#C99A74'], sunX: 760, sunR: 34, sunGlow: 0.55,
    horizon: 1255, G: 1395, speed: 1, dir: 1, runnerX: 360, runnerH: 470,
    layers: [
      { sk: genSkyline(11, 2600, { wmin: 50, wmax: 140, hmin: 40, hmax: 180 }), par: 0.08, depth: 0.25, base: 1255 },
      { sk: genSkyline(12, 2600, { wmin: 70, wmax: 190, hmin: 70, hmax: 330, treesMix: 0.25 }), par: 0.2, depth: 0.55, base: 1262, win: 'rgba(240,185,127,0.45)' },
      { sk: genSkyline(13, 3000, { wmin: 110, wmax: 260, hmin: 150, hmax: 520, treesMix: 0.4 }), par: 0.42, depth: 0.85, base: 1275, win: 'rgba(240,185,127,0.55)' },
    ],
    lamps: { spacing: 860, par: 1.75, h: 1150 }, style: { lean: 9 }, phase: [1.5, 0.2], wet: 0.9,
  },
  B: { // Cubbon Park — rain trees, mist
    sky: ['#0C1013', '#20282A', '#58605A', '#B8A488'], sunX: 330, sunR: 30, sunGlow: 0.4,
    horizon: 1270, G: 1410, speed: 1, dir: -1, runnerX: 700, runnerH: 455,
    layers: [
      { sk: genSkyline(21, 2600, { kind: 'trees', wmin: 180, wmax: 320, hmin: 90, hmax: 160 }), par: 0.08, depth: 0.25, base: 1270 },
      { sk: genSkyline(22, 2800, { kind: 'trees', wmin: 260, wmax: 460, hmin: 180, hmax: 300 }), par: 0.22, depth: 0.55, base: 1280 },
      { sk: genSkyline(23, 3200, { kind: 'trees', wmin: 420, wmax: 700, hmin: 380, hmax: 560 }), par: 0.5, depth: 0.9, base: 1300 },
    ],
    rays: true, style: { lean: 8, pony: true, shorts: false }, phase: [1.48, 0.55], wet: 0.35,
  },
  C: { // Ulsoor Lake — open water, distant skyline
    sky: ['#0B0E14', '#232733', '#6A6060', '#D6A67C'], sunX: 640, sunR: 38, sunGlow: 0.6,
    horizon: 1150, G: 1440, speed: 1, dir: 1, runnerX: 420, runnerH: 430,
    layers: [
      { sk: genSkyline(31, 2600, { wmin: 30, wmax: 90, hmin: 20, hmax: 120 }), par: 0.05, depth: 0.3, base: 1150 },
      { sk: genSkyline(32, 2800, { kind: 'trees', wmin: 90, wmax: 200, hmin: 40, hmax: 80 }), par: 0.07, depth: 0.45, base: 1152 },
    ],
    water: true, rail: true, style: { lean: 10, cap: true }, phase: [1.52, 0.8], wet: 0,
  },
  G: { // together — first sun
    sky: ['#111318', '#34323A', '#9A7560', '#F0BC8C'], sunX: 540, sunY: 872, sunR: 64, sunGlow: 1.0,
    horizon: 1255, G: 1440, speed: 1, dir: 1, runnerX: 540, runnerH: 430,
    layers: [
      { sk: genSkyline(41, 2600, { wmin: 50, wmax: 140, hmin: 40, hmax: 170 }), par: 0.07, depth: 0.2, base: 1255 },
      { sk: genSkyline(42, 2800, { kind: 'trees', wmin: 240, wmax: 420, hmin: 120, hmax: 200 }), par: 0.2, depth: 0.5, base: 1265 },
      { sk: genSkyline(43, 3000, { kind: 'trees', wmin: 380, wmax: 640, hmin: 200, hmax: 300 }), par: 0.45, depth: 0.85, base: 1290 },
    ],
    lamps: { spacing: 1100, par: 1.7, h: 1180 }, wet: 0.8, group: true,
  },
};

const GROUP = [ // the three from before, plus the city. z: 0 far .. 2 near
  { x: 330, h: 360, style: { lean: 10 }, off: 0.31, z: 0, rest: 0.03 },
  { x: 700, h: 368, style: { lean: 9, pony: true, shorts: false }, off: -0.22, z: 0, rest: -0.02 },
  { x: 200, h: 410, style: { lean: 10, cap: true }, off: 0.2, z: 1, rest: 0.05 },
  { x: 560, h: 420, style: { lean: 8, pony: true, shorts: false }, off: -0.14, z: 1, rest: -0.04 },
  { x: 850, h: 405, style: { lean: 11 }, off: 0.4, z: 1, rest: 0.02 },
  { x: 420, h: 470, style: { lean: 9 }, off: -0.3, z: 2, rest: 0 },
];

function groupPhase(i, t) {
  const g = GROUP[i];
  const lock = Math.exp(-Math.max(0, t - T.group) / 0.5);          // footsteps fall into step
  return 1.5 * (t - T.group) + g.rest + (g.off - g.rest) * lock;
}

function scenePhase(s, t) { return s.phase[0] * t + s.phase[1]; }

// Ground speed that exactly matches the planted foot, per runner height.
const gspeed = h => CYC.speed * h * 1.5; // px / s at 1.5 cycles per second

function drawStreet(ctx, key, t, opt = {}) {
  const s = SCENES[key];
  const hor = s.horizon, G = s.G;
  const cam = opt.cam || { s: 1, x: 0, y: 0 };
  ctx.save();
  // camera: gentle push-in around the runner
  ctx.translate(W / 2 + cam.x, H * 0.62 + cam.y);
  ctx.scale(cam.s, cam.s);
  ctx.translate(-W / 2, -H * 0.62);

  const travel = gspeed(s.runnerH) * t * s.dir;
  const [c0, c1, c2, c3] = s.sky;
  // sky
  let g = ctx.createLinearGradient(0, -300, 0, hor);
  g.addColorStop(0, c0); g.addColorStop(0.45, c1); g.addColorStop(0.82, c2); g.addColorStop(1, c3);
  ctx.fillStyle = g; ctx.fillRect(-400, -400, W + 800, hor + 400);
  // sun + bloom
  const sunY = s.sunY || hor - 28, sunX = s.sunX;
  const bloom = (opt.bloom || 1) * s.sunGlow;
  g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 900);
  g.addColorStop(0, `rgba(245,196,146,${0.55 * bloom})`); g.addColorStop(0.18, `rgba(230,160,110,${0.22 * bloom})`); g.addColorStop(1, 'rgba(200,140,100,0)');
  ctx.fillStyle = g; ctx.fillRect(-400, -400, W + 800, hor + 400);
  ctx.fillStyle = `rgba(252,226,190,${0.92 * Math.min(1, bloom * 1.3)})`;
  ctx.beginPath(); ctx.arc(sunX, sunY, (opt.sunR || s.sunR), 0, TAU); ctx.fill();

  // skyline layers (atmospheric perspective)
  const dark = '#08090B';
  for (const L of s.layers) {
    drawSkylineLayer(ctx, L.sk, travel * L.par, L.base, mix(c2, dark, L.depth), L.win);
  }
  // mist band at the horizon
  g = ctx.createLinearGradient(0, hor - 160, 0, hor + 60);
  g.addColorStop(0, rgba(c3, 0)); g.addColorStop(0.7, rgba(c3, 0.16)); g.addColorStop(1, rgba(c3, 0));
  ctx.fillStyle = g; ctx.fillRect(-400, hor - 160, W + 800, 220);

  if (s.water) {
    // lake: mirrored sky, skyline reflection, shimmer
    g = ctx.createLinearGradient(0, hor, 0, G);
    g.addColorStop(0, mixHex(c3, '#000000', 0.25)); g.addColorStop(0.35, mixHex(c2, '#000000', 0.45)); g.addColorStop(1, mixHex(c1, '#000000', 0.55));
    ctx.fillStyle = g; ctx.fillRect(-400, hor, W + 800, G - hor + 5);
    ctx.save(); ctx.globalAlpha = 0.28; ctx.translate(0, 2 * hor); ctx.scale(1, -1);
    for (const L of s.layers) drawSkylineLayer(ctx, L.sk, travel * L.par, L.base, mix(c2, dark, L.depth));
    ctx.restore();
    const r = rng(7);
    for (let i = 0; i < 140; i++) {
      const yy = hor + 4 + Math.pow(r(), 1.8) * (G - hor - 10);
      const depth = (yy - hor) / (G - hor);
      const xx = ((r() * 1600 - travel * (0.05 + depth * 0.5) + Math.sin(t * 1.3 + i) * 6) % 1600 + 1600) % 1600 - 260;
      const near = Math.exp(-Math.pow((xx - sunX) / (140 + depth * 260), 2));
      const len = lerp(10, 110, r()) * (0.4 + depth);
      ctx.fillStyle = `rgba(250,214,170,${(0.05 + 0.5 * near) * (0.6 + 0.4 * Math.sin(t * 3 + i * 1.7))})`;
      ctx.fillRect(xx - len / 2, yy, len, 1 + depth * 2);
    }
  } else {
    // road / pavement
    g = ctx.createLinearGradient(0, hor, 0, H + 200);
    g.addColorStop(0, mixHex(c2, '#050607', 0.72)); g.addColorStop(0.18, '#0B0C0F'); g.addColorStop(1, '#050607');
    ctx.fillStyle = g; ctx.fillRect(-400, hor, W + 800, H + 600 - hor);
    if (s.wet) { // wet asphalt catches the sky
      g = ctx.createRadialGradient(sunX, G + 40, 10, sunX, G + 40, 520);
      g.addColorStop(0, `rgba(240,180,130,${0.22 * s.wet * bloom})`); g.addColorStop(1, 'rgba(240,180,130,0)');
      ctx.save(); ctx.translate(sunX, G + 40); ctx.scale(1, 0.25); ctx.translate(-sunX, -(G + 40));
      ctx.fillStyle = g; ctx.fillRect(-400, G - 1000, W + 800, 2000); ctx.restore();
    }
    // kerb line + moving pavement joints
    ctx.fillStyle = 'rgba(237,233,225,0.06)'; ctx.fillRect(-400, G + 6, W + 800, 2);
    const jo = ((travel % 180) + 180) % 180;
    ctx.fillStyle = 'rgba(237,233,225,0.035)';
    for (let x = -jo - 200; x < W + 200; x += 180) { ctx.beginPath(); ctx.moveTo(x, G + 8); ctx.lineTo(x + 3, G + 8); ctx.lineTo(x - 60, H + 200); ctx.lineTo(x - 64, H + 200); ctx.fill(); }
  }
  if (s.rail) { // lakeside railing
    const ro = ((travel * 1.0 % 120) + 120) % 120;
    ctx.fillStyle = '#07080A';
    ctx.fillRect(-400, G - 150, W + 800, 5);
    ctx.fillRect(-400, G - 76, W + 800, 3);
    for (let x = -ro - 120; x < W + 120; x += 120) ctx.fillRect(x, G - 150, 7, 150);
    ctx.fillStyle = '#060708'; ctx.fillRect(-400, G, W + 800, H);
  }

  // light rays through the canopy
  if (s.rays) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const x0 = sunX + (i - 2) * 120 + Math.sin(t * 0.4 + i) * 20;
      g = ctx.createLinearGradient(x0, hor - 400, x0 + 500, G + 200);
      g.addColorStop(0, 'rgba(230,200,160,0.035)'); g.addColorStop(1, 'rgba(230,200,160,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, hor - 420); ctx.lineTo(x0 + 90 + i * 20, hor - 420); ctx.lineTo(x0 + 820, G + 300); ctx.lineTo(x0 + 480, G + 300); ctx.fill();
    }
    ctx.restore();
  }

  // runners
  const bodyCol = '#060708', farCol = mix(c2, '#060708', 0.84);
  const runners = [];
  if (s.group) {
    GROUP.forEach((gr, i) => {
      const drift = Math.sin((t - T.group) * 0.7 + i * 1.9) * 14;
      runners.push({ x: gr.x + drift, h: gr.h, q: groupPhase(i, t), style: gr.style, z: gr.z, dir: 1, G: G - (2 - gr.z) * 34 });
    });
    runners.sort((a, b) => a.z - b.z);
  } else {
    runners.push({ x: s.runnerX, h: s.runnerH, q: scenePhase(s, t), style: s.style, dir: s.dir, G });
  }
  for (const R of runners) {
    // reflection on the wet ground
    if (s.wet) {
      ctx.save(); ctx.globalAlpha = 0.3 * s.wet;
      ctx.translate(0, 2 * R.G + 6); ctx.scale(1, -1);
      drawRunner(ctx, R.x, R.G, R.h, R.q, R.dir, R.style, { body: '#020203', far: '#020203' });
      ctx.restore();
    }
    // backlit halo
    ctx.save(); ctx.shadowColor = `rgba(245,190,140,${0.55 * bloom})`; ctx.shadowBlur = 16;
    drawRunner(ctx, R.x, R.G, R.h, R.q, R.dir, R.style, { body: bodyCol, far: farCol });
    ctx.restore();
    drawRunner(ctx, R.x, R.G, R.h, R.q, R.dir, R.style, { body: bodyCol, far: farCol });
    R.head = headPoint(R);
  }

  // foreground lamp posts sweeping past (parallax > 1)
  if (s.lamps) {
    const sp = s.lamps.spacing, lo = ((travel * s.lamps.par % sp) + sp) % sp;
    for (let x = -lo - sp + 700; x < W + sp; x += sp) {
      ctx.fillStyle = '#030304';
      ctx.fillRect(x, G - s.lamps.h, 16, s.lamps.h + 800);
      ctx.fillRect(x, G - s.lamps.h, -120, 9);
      g = ctx.createRadialGradient(x - 110, G - s.lamps.h + 18, 0, x - 110, G - s.lamps.h + 18, 150);
      g.addColorStop(0, 'rgba(255,205,150,0.35)'); g.addColorStop(1, 'rgba(255,205,150,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 280, G - s.lamps.h - 150, 340, 320);
      ctx.fillStyle = 'rgba(255,225,190,0.9)'; ctx.fillRect(x - 118, G - s.lamps.h + 9, 20, 4);
    }
  }
  ctx.restore();

  // vignette
  g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.8);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // map runner heads to screen for callouts
  const scr = ([x, y]) => [(x - W / 2) * cam.s + W / 2 + cam.x, (y - H * 0.62) * cam.s + H * 0.62 + cam.y];
  return runners.map(R => scr(R.head));
}
function headPoint(R) {
  const p = pose(R.q, R.h, R.style);
  return [R.x + p.head[0] * R.dir, R.G + p.head[1]];
}

// ---------------------------------------------------------------- type
const F = {
  mono: (s, w = 400) => `${w} ${s}px "JetBrains Mono"`,
  sans: (s, w = 500) => `${w} ${s}px "Inter Tight"`,
  serif: (s) => `italic 400 ${s}px "Instrument Serif"`,
};
function text(ctx, str, x, y, font, color, align = 'left', spacing = 0) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = spacing + 'px';
  ctx.fillText(str, x, y);
  ctx.letterSpacing = '0px';
}
// Slot-machine roll between two strings, per character, tabular.
function rollText(ctx, from, to, p, x, y, font, color, adv, lh, align = 'left') {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const n = Math.max(from.length, to.length);
  const width = n * adv; let x0 = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  for (let i = 0; i < n; i++) {
    const a = from[i] || ' ', b = to[i] || ' ';
    const cx = x0 + adv * (i + 0.5);
    if (a === b) { ctx.fillText(b, cx, y); continue; }
    const k = E.inout(clamp(p * 1.6 - i * 0.12));
    ctx.save(); ctx.beginPath(); ctx.rect(cx - adv, y - lh * 0.95, adv * 2, lh * 1.2); ctx.clip();
    ctx.globalAlpha = 1 - k; ctx.fillText(a, cx, y - k * lh * 0.9);
    ctx.globalAlpha = k; ctx.fillText(b, cx, y + (1 - k) * lh * 0.9);
    ctx.restore();
  }
  return width;
}
// Typewriter-scramble reveal (for HUD labels)
const GLYPHS = '0123456789:/·ABCDEFGHKLMNOPRSTUVX';
function scramble(str, p, seed) {
  const r = rng(seed + Math.floor(p * 24)); const n = str.length;
  let out = '';
  for (let i = 0; i < n; i++) {
    const k = p * (n + 6) - i;
    if (k >= 6 || str[i] === ' ') out += str[i];
    else if (k > 0) out += GLYPHS[Math.floor(r() * GLYPHS.length)];
    else out += ' ';
  }
  return out;
}

// HUD for the three street shots
const HUD = [
  { idx: '01', time: '05:58:12 AM', place: 'INDIRANAGAR', pace: '5:42' },
  { idx: '02', time: '05:58:19 AM', place: 'CUBBON PARK', pace: '5:48' },
  { idx: '03', time: '05:58:26 AM', place: 'ULSOOR LAKE', pace: '5:35' },
];
const PACE_POS = [640, 850]; // pace number stays locked here across cuts (match element)

function drawHUD(ctx, t, which, fromWhich, pSwap, head, alpha) {
  const h = HUD[which], f = HUD[fromWhich];
  ctx.save(); ctx.globalAlpha = alpha;
  const mono = F.mono(26), mono2 = F.mono(21);
  // top-left: time + place
  const intro = inv(0.35, 1.2, t);
  const tStr = pSwap < 1 ? null : h.time;
  if (which === 0 && pSwap >= 1) {
    text(ctx, scramble(h.time, intro, 3), 84, 262, mono, rgba(P.bone, 0.88));
    text(ctx, scramble(h.place + ' · BENGALURU', inv(0.55, 1.5, t), 5), 84, 300, mono2, rgba(P.bone, 0.46), 'left', 3);
  } else {
    ctx.font = mono; const adv = ctx.measureText('0').width;
    rollText(ctx, f.time, h.time, pSwap, 84, 262, mono, rgba(P.bone, 0.88), adv, 30);
    ctx.font = mono2; const adv2 = ctx.measureText('0').width + 3;
    rollText(ctx, f.place + ' · BENGALURU', h.place + ' · BENGALURU', pSwap, 84, 300, mono2, rgba(P.bone, 0.46), adv2, 26);
  }
  // top-right index
  ctx.font = mono2; const advI = ctx.measureText('0').width;
  text(ctx, '/ 03', W - 84, 262, mono2, rgba(P.bone, 0.4), 'right');
  rollText(ctx, which === 0 && pSwap >= 1 ? '01' : f.idx, h.idx, which === 0 ? 1 : pSwap, W - 84 - ctx.measureText('/ 03 ').width - 4, 262, mono2, rgba(P.bone, 0.88), advI, 24, 'right');

  // callout: runner head -> locked pace number
  const pr = inv(0.9, 1.6, t);
  if (pr > 0 && head) {
    const [hx, hy] = head;
    const [px, py] = PACE_POS;
    const elbow = [px - 36, py - 22];
    const k = E.out(pr);
    ctx.strokeStyle = rgba(P.bone, 0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx + 18, hy - 30);
    const mx = lerp(hx + 18, elbow[0], k), my = lerp(hy - 30, elbow[1], k);
    ctx.lineTo(mx, my);
    if (k > 0.98) ctx.lineTo(elbow[0] + 26, elbow[1]);
    ctx.stroke();
    ctx.fillStyle = P.bone; ctx.beginPath(); ctx.arc(hx + 18, hy - 30, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(P.bone, 0.35); ctx.beginPath(); ctx.arc(hx + 18, hy - 30, 9 + 4 * Math.sin(t * 6), 0, TAU); ctx.stroke();
    // pace
    const pa = E.out(inv(1.15, 1.8, t));
    ctx.save(); ctx.globalAlpha *= pa;
    const font = F.sans(88, 500); ctx.font = font; const adv = ctx.measureText('0').width;
    const num = which === 0 && pSwap >= 1 ? h.pace : null;
    const fromP = num ? scramble(h.pace, inv(1.15, 1.7, t), 9) : f.pace;
    const w = rollText(ctx, fromP.replace(/ /g, ' '), h.pace, num ? 1 : pSwap, px, py + 32, font, P.bone, adv * 0.96, 90);
    text(ctx, '/ KM', px + w + 16, py + 32, F.mono(24), rgba(P.bone, 0.55));
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- city map
const CITY = (() => {
  const r = rng(2026);
  const nx = noise1(4), ny = noise1(8);
  const warp = (x, y) => [x + 38 * nx(y * 0.0022 + 3.1) + 22 * ny(x * 0.004), y + 38 * ny(x * 0.0021 + 9.7) + 22 * nx(y * 0.0043)];
  const hub = [180, -1500];
  const lake = { c: [900, -250], rx: 330, ry: 230 };
  const park = { c: hub, rx: 520, ry: 380 };
  const inEll = (p, e, pad = 0) => Math.pow((p[0] - e.c[0]) / (e.rx + pad), 2) + Math.pow((p[1] - e.c[1]) / (e.ry + pad), 2) < 1;
  const minor = [], major = [];
  // two rotated grid districts, warped, with missing links
  const districts = [
    { ang: 8 * DEG, sp: 104, x0: -3400, x1: 3400, y0: -5200, y1: 3600 },
  ];
  for (const d of districts) {
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    const P2 = (u, v) => warp(u * ca - v * sa, u * sa + v * ca);
    for (let u = d.x0; u <= d.x1; u += d.sp) for (let v = d.y0; v <= d.y1; v += d.sp) {
      for (const [du, dv] of [[d.sp, 0], [0, d.sp]]) {
        if (r() < 0.16) continue;
        const a = P2(u, v), b = P2(u + du, v + dv);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (inEll(m, lake, 20) || inEll(m, park, 0)) continue;
        minor.push(a[0], a[1], b[0], b[1]);
      }
    }
  }
  // arterials — long smooth radial roads through the hub region
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * TAU + r() * 0.3, pts = [];
    const bend = (r() - 0.5) * 0.6;
    for (let k = 0; k <= 40; k++) {
      const rr = 260 + k * 130;
      const aa = a + bend * (k / 40) + 0.12 * Math.sin(k * 0.3 + i);
      pts.push(warp(hub[0] + Math.cos(aa) * rr, hub[1] + Math.sin(aa) * rr * 1.2));
    }
    major.push(pts);
  }
  // ring road
  const ring = []; for (let k = 0; k <= 120; k++) { const a = k / 120 * TAU; ring.push(warp(hub[0] + Math.cos(a) * 1500, hub[1] + 200 + Math.sin(a) * 1900)); }
  major.push(ring);
  // park paths
  const paths = [];
  for (let i = 0; i < 7; i++) {
    const a0 = r() * TAU, a1 = a0 + Math.PI + (r() - 0.5) * 1.2, pts = [];
    for (let k = 0; k <= 30; k++) { const s = k / 30; const a = lerp(a0, a1, s); const rad = lerp(0.95, 0.95, s) * (1 - 0.7 * Math.sin(s * Math.PI)); pts.push([hub[0] + Math.cos(a) * park.rx * rad, hub[1] + Math.sin(a) * park.ry * rad]); }
    paths.push(pts);
  }
  return { minor, major, paths, hub, lake, park };
})();

// smooth path helpers
function catmull(pts, seg = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  // arc length
  const len = [0]; for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, len, total: len[len.length - 1] };
}
function pointAt(path, d) {
  const { pts, len } = path; d = clamp(d, 0, path.total);
  let lo = 0, hi = len.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] < d) lo = m; else hi = m; }
  const f = (d - len[lo]) / Math.max(1e-6, len[hi] - len[lo]);
  return [lerp(pts[lo][0], pts[hi][0], f), lerp(pts[lo][1], pts[hi][1], f), lo];
}

// three hero runners: they begin where the triptych bands collapse
const HERO_START = [[-250, -420], [290, -40], [-140, 500]];
const HUBP = CITY.hub;
const HEROES = [
  catmull([HERO_START[0], [-120, -520], [20, -640], [80, -860], [60, -1120], [HUBP[0] - 70, HUBP[1] + 150], [HUBP[0] - 22, HUBP[1] + 16]], 16),
  catmull([HERO_START[1], [440, -120], [520, -380], [500, -700], [420, -1020], [HUBP[0] + 110, HUBP[1] + 170], [HUBP[0] + 22, HUBP[1] + 18]], 16),
  catmull([HERO_START[2], [-300, 380], [-400, 120], [-380, -220], [-300, -620], [-190, -1000], [HUBP[0] - 90, HUBP[1] + 60], [HUBP[0], HUBP[1] - 24]], 16),
];
const OTHERS = (() => {
  const r = rng(99), list = [];
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, rad = lerp(1500, 3600, Math.sqrt(r()));
    let p = [HUBP[0] + Math.cos(a) * rad * 0.8, HUBP[1] + Math.sin(a) * rad * 1.15];
    const pts = [p.slice()];
    const curl = (r() - 0.5) * 0.9, wob = r() * 10;
    const steps = 7;
    for (let k = 1; k <= steps; k++) {
      const s = k / steps;
      const ang = a + curl * Math.sin(s * Math.PI * 0.5) + Math.sin(s * 3 + wob) * 0.08;
      const rr = rad * (1 - s) + 40 * s;
      pts.push([HUBP[0] + Math.cos(ang) * rr * 0.8, HUBP[1] + Math.sin(ang) * rr * 1.15]);
    }
    const ea = r() * TAU; pts[pts.length - 1] = [HUBP[0] + Math.cos(ea) * lerp(30, 80, r()), HUBP[1] + Math.sin(ea) * lerp(30, 80, r())];
    list.push({ path: catmull(pts, 12), t0: lerp(T.city0, T.city0 + 1.4, r()), w: lerp(0.8, 1.5, r()), a: lerp(0.28, 0.55, r()) });
  }
  return list;
})();

const GROUP_CAM0 = 1.06;
const SUN_SCREEN = [540 + (SCENES.G.sunX - 540) * GROUP_CAM0, H * 0.62 + (SCENES.G.sunY - H * 0.62) * GROUP_CAM0];
function camMap(t) {
  // world -> screen camera. starts framing the three, pulls out to the city.
  const k = E.cam(inv(T.pull0, T.pull1, t));
  let z = lerp(1.0, 0.285, k);
  let cx = lerp(0, 120, k), cy = lerp(0, -780, k);
  let rot = lerp(-2 * DEG, 4 * DEG, E.soft(inv(T.mapIn, T.dive0 + 0.3, t)));
  let sx = W / 2, sy = H / 2;
  // dive into the hub, landing where the sun will be in the next shot
  const d = inv(T.dive0, T.group, t);
  if (d > 0) {
    const e = E.in(d);
    z = z * Math.exp(Math.log(28) * e);
    cx = lerp(cx, HUBP[0], E.inout(Math.min(1, d * 1.6)));
    cy = lerp(cy, HUBP[1], E.inout(Math.min(1, d * 1.6)));
    sy = lerp(H / 2, SUN_SCREEN[1], E.inout(Math.min(1, d * 1.4)));
  }
  // slow drift before the pull
  const drift = E.soft(inv(T.mapIn, T.pull0 + 1, t));
  cy += lerp(0, -60, drift);
  return { z, cx, cy, rot, sx, sy };
}
function toScreen(cam, p) {
  const x = (p[0] - cam.cx) * cam.z, y = (p[1] - cam.cy) * cam.z;
  const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
  return [cam.sx + x * c - y * s, cam.sy + x * s + y * c];
}

function heroProgress(i, t) {
  // draws from draw0 and arrives at the hub at `meet`
  const k = inv(T.draw0 + i * 0.08, T.meet - 0.05 + i * 0.06, t);
  return E.soft(k);
}

function strokePath(ctx, cam, path, d0, d1) {
  const { pts, len } = path;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < pts.length; i++) {
    if (len[i] < d0) continue;
    if (len[i] > d1) { const p = pointAt(path, d1); const s = toScreen(cam, p); ctx.lineTo(s[0], s[1]); break; }
    const s = toScreen(cam, pts[i]);
    if (!started) { const p0 = toScreen(cam, pointAt(path, d0)); ctx.moveTo(p0[0], p0[1]); started = true; }
    ctx.lineTo(s[0], s[1]);
  }
  ctx.stroke();
}

function drawMap(ctx, t, alpha) {
  const cam = camMap(t);
  ctx.save();
  ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = alpha;
  // ---- base map
  const lod = clamp((cam.z - 0.2) / 0.8);
  const bound = (x, y) => x > -60 && x < W + 60 && y > -60 && y < H + 60;
  // park + lake as quiet tonal shapes
  const drawEll = (e, fill) => {
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) { const a = k / 64 * TAU; const w = 1 + 0.06 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 5); const s = toScreen(cam, [e.c[0] + Math.cos(a) * e.rx * w, e.c[1] + Math.sin(a) * e.ry * w]); k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }
    ctx.fillStyle = fill; ctx.fill();
  };
  drawEll(CITY.park, '#0E1112');
  drawEll(CITY.lake, '#12151B');
  ctx.strokeStyle = rgba(P.bone, 0.05); ctx.lineWidth = 1; ctx.stroke();

  ctx.strokeStyle = rgba(P.bone, 0.07 + 0.07 * lod); ctx.lineWidth = 1.2;
  ctx.beginPath();
  const m = CITY.minor;
  for (let i = 0; i < m.length; i += 4) {
    const a = toScreen(cam, [m[i], m[i + 1]]), b = toScreen(cam, [m[i + 2], m[i + 3]]);
    if (!bound(a[0], a[1]) && !bound(b[0], b[1])) continue;
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(P.bone, 0.16); ctx.lineWidth = 2.2;
  for (const pts of CITY.major) { ctx.beginPath(); pts.forEach((p, i) => { const s = toScreen(cam, p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); }
  ctx.setLineDash([3, 6]); ctx.strokeStyle = rgba(P.bone, 0.1); ctx.lineWidth = 1;
  for (const pts of CITY.paths) { ctx.beginPath(); pts.forEach((p, i) => { const s = toScreen(cam, p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); }
  ctx.setLineDash([]);

  // place labels (tiny, editorial)
  const lbl = inv(T.mapIn + 0.5, T.mapIn + 1.2, t) * (1 - inv(T.dive0, T.dive0 + 0.3, t));
  if (lbl > 0) {
    const places = [['INDIRANAGAR', [-420, -300]], ['ULSOOR LAKE', [CITY.lake.c[0] - 150, CITY.lake.c[1] + 20]], ['MG ROAD', [-60, 180]], ['CUBBON PARK', [CITY.hub[0] - 110, CITY.hub[1] - 300]], ['KORAMANGALA', [-600, 1300]], ['MALLESWARAM', [-900, -2600]], ['HEBBAL', [700, -3300]], ['JAYANAGAR', [-300, 2400]], ['WHITEFIELD', [1500, -900]]];
    for (const [n, p] of places) {
      const s = toScreen(cam, p);
      if (!bound(s[0], s[1])) continue;
      text(ctx, n, s[0], s[1], F.mono(19), rgba(P.bone, 0.3 * lbl), 'left', 4);
    }
  }

  // ---- the rest of the city: routes appear as the camera pulls away
  const connect = inv(T.meet - 0.1, T.meet + 0.9, t);   // warm light travels outwards from the hub
  for (const o of OTHERS) {
    const k = E.soft(inv(o.t0, T.meet + 0.1, t));
    if (k <= 0) continue;
    const d1 = o.path.total * k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(P.bone, o.a * 0.9); ctx.lineWidth = o.w;
    strokePath(ctx, cam, o.path, 0, d1);
    if (connect > 0) {
      ctx.strokeStyle = rgba(P.accent, 0.85); ctx.lineWidth = o.w + 0.6;
      strokePath(ctx, cam, o.path, o.path.total * (1 - E.soft(connect)), d1);
    }
    if (k < 1) { const hp = toScreen(cam, pointAt(o.path, d1)); ctx.fillStyle = rgba(P.bone, 0.8); ctx.beginPath(); ctx.arc(hp[0], hp[1], 2.2, 0, TAU); ctx.fill(); }
  }

  // ---- the three
  const heads = [];
  HEROES.forEach((path, i) => {
    const k = heroProgress(i, t);
    const d1 = path.total * k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(P.bone, 0.95); ctx.lineWidth = 3;
    if (k > 0) strokePath(ctx, cam, path, 0, d1);
    if (connect > 0) { ctx.strokeStyle = P.accent; ctx.lineWidth = 3.6; strokePath(ctx, cam, path, path.total * (1 - E.soft(connect)), d1); }
    const hp = toScreen(cam, pointAt(path, Math.max(0.01, d1)));
    heads.push(hp);
  });

  // distances between them — close, but unaware
  const dm = inv(T.draw0 + 0.4, T.draw0 + 0.9, t) * (1 - inv(T.pull0 + 0.5, T.pull0 + 1.1, t));
  if (dm > 0) {
    const pairs = [[0, 1, '1.4 KM'], [1, 2, '1.9 KM'], [0, 2, '0.9 KM']];
    for (const [a, b, label] of pairs) {
      const A = heads[a], B = heads[b];
      const k = E.out(dm);
      const mx = lerp(A[0], B[0], 0.5), my = lerp(A[1], B[1], 0.5);
      ctx.strokeStyle = rgba(P.bone, 0.3 * dm); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(lerp(mx, A[0], k * 0.86), lerp(my, A[1], k * 0.86)); ctx.lineTo(lerp(mx, B[0], k * 0.86), lerp(my, B[1], k * 0.86)); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.globalAlpha *= dm;
      ctx.fillStyle = P.ink; ctx.font = F.mono(21); ctx.letterSpacing = '2px'; const tw = ctx.measureText(label).width; ctx.fillRect(mx - tw / 2 - 8, my - 16, tw + 16, 26);
      ctx.letterSpacing = '0px';
      text(ctx, label, mx, my + 4, F.mono(21), rgba(P.bone, 0.75), 'center', 2);
      ctx.restore();
    }
  }

  // hero dots + pace tags
  const tagA = inv(T.collapse1 - 0.1, T.collapse1 + 0.3, t) * (1 - inv(T.pull0 + 0.9, T.pull0 + 1.5, t));
  heads.forEach((hp, i) => {
    const pulse = (t * 1.5 + i * 0.33) % 1;
    const warm = E.soft(connect);
    const col = warm > 0.5 ? P.accent : P.bone;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hp[0], hp[1], 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.5 * (1 - pulse)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hp[0], hp[1], 8 + pulse * 26, 0, TAU); ctx.stroke();
    if (tagA > 0) {
      ctx.save(); ctx.globalAlpha *= tagA;
      const side = hp[0] > W * 0.62 ? -1 : hp[0] < W * 0.38 ? 1 : (i === 1 ? 1 : -1);
      text(ctx, HUD[i].pace + ' / KM', hp[0] + side * 24, hp[1] + 9, F.mono(27, 500), rgba(P.bone, 0.92), side > 0 ? 'left' : 'right', 1);
      ctx.restore();
    }
  });

  // convergence: rings + meeting tag
  const hs = toScreen(cam, HUBP);
  const mt = t - T.meet;
  if (mt > -0.1) {
    for (let r = 0; r < 3; r++) {
      const p = clamp((mt - r * 0.22) / 1.3);
      if (p <= 0 || p >= 1) continue;
      ctx.strokeStyle = rgba(P.accent, 0.7 * (1 - p)); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hs[0], hs[1], 14 + E.out(p) * 170, 0, TAU); ctx.stroke();
    }
    const ta = E.out(inv(T.meet + 0.15, T.meet + 0.6, t)) * (1 - inv(T.dive0, T.dive0 + 0.25, t));
    if (ta > 0) {
      ctx.save(); ctx.globalAlpha *= ta;
      ctx.strokeStyle = rgba(P.accent, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hs[0] + 30, hs[1] - 30); ctx.lineTo(hs[0] + 30 + 60 * ta, hs[1] - 90); ctx.lineTo(hs[0] + 30 + 60 * ta + 40, hs[1] - 90); ctx.stroke();
      text(ctx, scramble('SAT · 06:00', inv(T.meet + 0.15, T.meet + 0.7, t), 21), hs[0] + 140, hs[1] - 82, F.mono(30, 500), P.accent, 'left', 2);
      text(ctx, scramble('CUBBON PARK', inv(T.meet + 0.25, T.meet + 0.8, t), 22), hs[0] + 140, hs[1] - 46, F.mono(21), rgba(P.bone, 0.65), 'left', 4);
      ctx.restore();
    }
  }
  // the ring that becomes the sun
  const d = inv(T.dive0, T.group, t);
  if (d > 0) {
    const R = lerp(18, SCENES.G.sunR * GROUP_CAM0, E.in(d));
    ctx.fillStyle = rgba('#FCE2BE', E.inout(inv(0.45, 1, d)));
    ctx.beginPath(); ctx.arc(hs[0], hs[1], R, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
  return { cam, hs };
}

// ---------------------------------------------------------------- scene assembly
function shotStreet(ctx, key, t, lt, camPush) {
  const cam = { s: 1.0 + 0.05 * camPush, x: 0, y: -18 * camPush };
  return drawStreet(ctx, key, t, { cam });
}

function drawFrame(ctx, t) {
  ctx.save();
  ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, H);

  if (t < T.c1) {
    // ---- three single shots, joined by horizontal mask reveals; the pace number stays put
    const which = t < T.a1 ? 0 : t < T.b1 ? 1 : 2;
    const cutT = [T.a0, T.a1, T.b1][which];
    const keys = ['A', 'B', 'C'];
    const prevKey = keys[Math.max(0, which - 1)];
    const rev = which === 0 ? 1 : E.inout(inv(cutT, cutT + 0.5, t));
    const lt = t - cutT;
    const heads = shotStreet(ctx, keys[which], t, lt, inv(cutT, cutT + (which === 0 ? T.a1 : 1.1), t));
    if (rev < 1) {
      // previous shot shrinks away behind an expanding band
      const bandH = H * rev, y0 = PACE_POS[1] + 10 - bandH * 0.44;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, y0)); ctx.rect(0, y0 + bandH, W, H - y0 - bandH); ctx.clip();
      shotStreet(ctx, prevKey, t, lt, 1 + 0.4 * rev);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * rev})`; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.fillStyle = rgba(P.bone, 0.5 * (1 - rev)); ctx.fillRect(0, y0, W, 1.5); ctx.fillRect(0, y0 + bandH - 1.5, W, 1.5);
    }
    // fade in from black
    if (t < 0.6) { ctx.fillStyle = `rgba(0,0,0,${1 - E.soft(t / 0.6)})`; ctx.fillRect(0, 0, W, H); }
    const pSwap = which === 0 ? 1 : E.inout(inv(cutT + 0.05, cutT + 0.6, t));
    drawHUD(ctx, which === 0 ? t : t - cutT + 1.6, which, Math.max(0, which - 1), pSwap, heads[0], 1);
  } else if (t < T.mapIn + 0.9) {
    // ---- triptych -> collapse into dots on the map
    const col = inv(T.mapIn - 0.05, T.collapse1, t);
    if (col > 0) drawMap(ctx, t, E.soft(inv(T.mapIn, T.mapIn + 0.5, t)));
    const split = E.inout(inv(T.c1, T.c1 + 0.6, t));
    const gap = 6, bh = (H - 2 * gap) / 3;
    const keys = ['A', 'B', 'C'];
    const cam = camMap(t);
    for (let i = 0; i < 3; i++) {
      const s = SCENES[keys[i]];
      const band = { x: 0, y: i * (bh + gap), w: W, h: bh };
      let r = { ...band };
      if (i === 2) { r.y = lerp(0, band.y, split); r.h = lerp(H, bh, split); }
      else {
        const k = E.out(inv(T.c1 + 0.15 + (1 - i) * 0.12, T.c1 + 0.85 + (1 - i) * 0.12, t));
        r.h = bh * k; r.y = band.y + (bh - r.h) / 2;
      }
      // collapse the band into its runner's dot
      const c = E.inout(clamp(col * 1.15 - i * 0.07));
      if (c >= 1 || r.h < 0.5) continue;
      const dot = toScreen(cam, HERO_START[i]);
      const cw = lerp(r.w, 14, c), ch = lerp(r.h, 14, c);
      const cx = lerp(r.x + r.w / 2, dot[0], c), cy = lerp(r.y + r.h / 2, dot[1], c);
      const rad = Math.min(cw, ch) / 2 * Math.pow(c, 0.6);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, rad); ctx.clip();
      // content: runner framed in the band, shrinking with the band as it collapses
      const focus = [s.runnerX + s.dir * 60, s.G - s.runnerH * 0.62];
      const bandScale = 0.66 * (1 + 0.04 * inv(T.c1, T.mapIn, t));
      let sc = bandScale * lerp(1, 14 / W, c);
      let fx = focus[0], fy = focus[1], ox = lerp(band.x + band.w / 2, dot[0], c), oy = lerp(band.y + band.h / 2, dot[1], c);
      if (i === 2) { // from the full-frame shot into the band
        sc = lerp(1, sc, split); fx = lerp(W / 2, fx, split); fy = lerp(H / 2, fy, split);
        ox = lerp(W / 2, ox, split); oy = lerp(H / 2, oy, split);
      }
      ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.translate(-fx, -fy);
      drawStreet(ctx, keys[i], t, { cam: { s: 1, x: 0, y: 0 } });
      ctx.restore();
      if (c > 0) { ctx.fillStyle = rgba(P.bone, E.soft(inv(0.72, 1, c))); ctx.beginPath(); ctx.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, rad); ctx.fill(); }
      // band captions (band 03 inherits the big pace number, which flies down into place)
      const ca = E.soft(inv(T.c1 + 0.5 + i * 0.08, T.c1 + 1.0 + i * 0.08, t)) * (1 - E.soft(inv(0, 0.3, col)));
      if (ca > 0) {
        ctx.save(); ctx.globalAlpha = ca;
        const bx = band.x, by = band.y;
        if (i !== 2 || t > T.c1 + 0.62) text(ctx, HUD[i].pace, bx + 64, by + bh - 70, F.sans(68, 500), P.bone);
        ctx.font = F.sans(68, 500); const pw = ctx.measureText(HUD[i].pace).width;
        text(ctx, '/ KM', bx + 64 + pw + 12, by + bh - 70, F.mono(20), rgba(P.bone, 0.55));
        text(ctx, HUD[i].place, bx + 64, by + bh - 34, F.mono(18), rgba(P.bone, 0.55), 'left', 4);
        text(ctx, HUD[i].idx, W - 64, by + 64, F.mono(20), rgba(P.bone, 0.6), 'right');
        text(ctx, HUD[i].time.slice(0, 8), W - 64, by + bh - 34, F.mono(18), rgba(P.bone, 0.55), 'right');
        ctx.restore();
      }
    }
    // carry-over from the single shots: HUD fades, the pace number travels into band 03
    const fl = inv(T.c1, T.c1 + 0.62, t);
    if (fl < 1) {
      const k = E.inout(fl);
      ctx.save(); ctx.globalAlpha = 1 - E.soft(inv(0, 0.5, fl));
      text(ctx, HUD[2].time, 84, 262, F.mono(26), rgba(P.bone, 0.88));
      text(ctx, HUD[2].place + ' · BENGALURU', 84, 300, F.mono(21), rgba(P.bone, 0.46), 'left', 3);
      ctx.restore();
      const size = lerp(88, 68, k);
      const px = lerp(PACE_POS[0], 64, k), py = lerp(PACE_POS[1] + 32, 2 * (bh + gap) + bh - 70, k);
      text(ctx, HUD[2].pace, px, py, F.sans(size, 500), P.bone);
      ctx.font = F.sans(size, 500); const pw = ctx.measureText(HUD[2].pace).width;
      text(ctx, '/ KM', px + pw + lerp(16, 12, k), py, F.mono(lerp(24, 20, k)), rgba(P.bone, 0.55));
    }
  } else if (t < T.group) {
    drawMap(ctx, t, 1);
    // map dissolves into the dawn around the ring
    const d = inv(T.group - 0.32, T.group, t);
    if (d > 0) {
      ctx.save(); ctx.globalAlpha = E.soft(d);
      drawStreet(ctx, 'G', t, { cam: { s: GROUP_CAM0, x: 0, y: 0 } });
      ctx.restore();
    }
  } else if (t < T.end0 + 0.5) {
    // ---- together
    const lt = t - T.group;
    const push = E.soft(inv(T.group, T.end0, t));
    const bloom = 0.85 + 0.45 * E.soft(inv(T.group, T.group + 1.6, t));
    drawStreet(ctx, 'G', t, { cam: { s: GROUP_CAM0 + 0.07 * push, x: 0, y: -30 * push }, bloom });
    // the line
    drawLine(ctx, t);
    // ends into ink
    const o = inv(T.end0 - 0.15, T.end0 + 0.45, t);
    if (o > 0) { ctx.fillStyle = rgba(P.ink, E.inout(o)); ctx.fillRect(0, 0, W, H); }
  }
  if (t >= T.end0) drawEnd(ctx, t);
  ctx.restore();
}

function drawLine(ctx, t) {
  const l1 = ["you've", 'probably'], l2 = ['already', 'run', 'past', 'them.'];
  const size = 104, lh = 112;
  const y1 = 560, y2 = y1 + lh;
  const out = inv(T.end0 - 0.35, T.end0 + 0.1, t);
  ctx.save();
  ctx.font = F.serif(size);
  const lines = [[l1, y1], [l2, y2]];
  let wi = 0;
  for (const [words, y] of lines) {
    const full = words.join(' ');
    let x = W / 2 - ctx.measureText(full).width / 2;
    for (const w of words) {
      const st = T.line0 + wi * 0.1 + (y === y2 ? 0.18 : 0);
      const k = E.out(inv(st, st + 0.9, t));
      const ww = ctx.measureText(w + ' ').width;
      ctx.save();
      ctx.beginPath(); ctx.rect(x - 10, y - size, ww + 20, size * 1.32); ctx.clip();
      ctx.fillStyle = rgba(P.bone, 0.97 * (1 - out));
      ctx.textAlign = 'left';
      ctx.fillText(w, x, y + (1 - k) * size * 1.1 - out * 16);
      ctx.restore();
      x += ww; wi++;
    }
  }
  ctx.restore();
}

function drawEnd(ctx, t) {
  const a = inv(T.end0, T.end0 + 0.1, t);
  ctx.save();
  ctx.fillStyle = rgba(P.ink, a); ctx.fillRect(0, 0, W, H);
  const word = 'ROOUNE';
  const size = 150, track = 26;
  ctx.font = F.sans(size, 600); ctx.letterSpacing = track + 'px';
  const tw = ctx.measureText(word).width - track;
  const x0 = W / 2 - tw / 2, y = H / 2 + size * 0.36;
  // O centres
  ctx.letterSpacing = '0px';
  const adv = s => { ctx.font = F.sans(size, 600); return ctx.measureText(s).width; };
  const oc = [1, 2].map(i => { const pre = word.slice(0, i); const x = x0 + adv(pre) + track * i + adv('O') / 2; return [x, y - size * 0.36]; });
  const oR = adv('O') * 0.5;

  // two loops — two runners — drawing towards each other, then settling into the O's
  const d = inv(T.end0 + 0.05, T.mark, t);
  const settle = E.inout(inv(T.mark - 0.28, T.mark + 0.3, t));
  if (d > 0 && settle < 1) {
    ctx.lineCap = 'round';
    oc.forEach((c, i) => {
      const k = E.inout(d);
      const R = lerp(oR * 1.9, oR * 0.86, settle);
      const start = i === 0 ? Math.PI : 0;
      const sweep = TAU * k * (i === 0 ? 1 : -1);
      ctx.strokeStyle = rgba(P.accent, 1 - settle); ctx.lineWidth = lerp(3, 18, settle);
      ctx.beginPath(); ctx.arc(c[0], c[1], R, start, start + sweep, i !== 0); ctx.stroke();
      const hx = c[0] + Math.cos(start + sweep) * R, hy = c[1] + Math.sin(start + sweep) * R;
      ctx.fillStyle = rgba(P.accent, 1 - settle); ctx.beginPath(); ctx.arc(hx, hy, 6, 0, TAU); ctx.fill();
    });
  }
  // wordmark: letters rise out of a baseline mask, O's resolve from the loops
  const reveal = inv(T.mark - 0.25, T.mark + 0.55, t);
  if (reveal > 0) {
    ctx.font = F.sans(size, 600);
    let x = x0;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]; const w = adv(ch);
      const isO = i === 1 || i === 2;
      const k = E.out(clamp(reveal * 1.4 - (isO ? 0.05 : Math.abs(i - 2.5) * 0.08)));
      ctx.save();
      ctx.beginPath(); ctx.rect(x - 6, y - size, w + 12, size * 1.08); ctx.clip();
      ctx.fillStyle = rgba(P.bone, isO ? k : 1);
      ctx.textAlign = 'left';
      ctx.fillText(ch, x, isO ? y : y + (1 - k) * size * 1.05);
      ctx.restore();
      x += w + track;
    }
  }
  // tagline
  const tg = inv(T.tag, T.tag + 0.9, t);
  if (tg > 0) {
    const k = E.out(tg);
    ctx.save(); ctx.globalAlpha = k;
    text(ctx, 'Run with the right people.', W / 2, y + 128 + (1 - k) * 18, F.sans(50, 400), rgba(P.bone, 0.8), 'center', 0.3);
    ctx.restore();
  }
  // hairline
  const hl = E.inout(inv(T.tag + 0.2, T.tag + 1.1, t));
  
  // out
  const fo = inv(T.DUR - 0.35, T.DUR, t);
  if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${E.soft(fo)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ---------------------------------------------------------------- finishing: shutter + grain
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const acc = document.createElement('canvas'); acc.width = W; acc.height = H;
const actx = acc.getContext('2d');
const sub = document.createElement('canvas'); sub.width = W; sub.height = H;
const sctx = sub.getContext('2d');
const grains = [0, 1, 2, 3, 4, 5].map(i => {
  const c = document.createElement('canvas'); c.width = 540; c.height = 960;
  const g = c.getContext('2d'); const img = g.createImageData(540, 960); const r = rng(500 + i);
  for (let k = 0; k < img.data.length; k += 4) { const v = 128 + (r() + r() + r() - 1.5) * 90; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
});

function shutterSamples(t) {
  // more samples where things move fast
  const fast = (t > T.dive0 - 0.1 && t < T.group + 0.1) || (t > T.c1 && t < T.mapIn) || (t > T.pull0 && t < T.pull1);
  return fast ? 8 : 5;
}

window.renderFrame = function (frame) {
  const t = frame / FPS;
  const n = shutterSamples(t);
  const shutter = 0.5 / FPS; // 180°
  actx.globalAlpha = 1; actx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < n; i++) {
    const ts = t + (n === 1 ? 0 : (i / (n - 1) - 0.5) * shutter);
    drawFrame(sctx, Math.max(0, ts));
    actx.globalAlpha = 1 / (i + 1);
    actx.drawImage(sub, 0, 0);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(acc, 0, 0);
  // film grain
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.09;
  const gr = grains[frame % grains.length];
  ctx.drawImage(gr, (frame * 37) % 40 - 40, (frame * 53) % 40 - 40, W + 80, H + 80);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
};

// footfall cue sheet for the sound design
window.cues = function () {
  const steps = [];
  const dt = 1 / 1000;
  const scan = (t0, t1, phaseFn, tag, gain, pan) => {
    let prev = phaseFn(t0);
    for (let t = t0 + dt; t < t1; t += dt) {
      const p = phaseFn(t);
      if (Math.floor(p * 2) !== Math.floor(prev * 2)) steps.push({ t: +t.toFixed(4), tag, gain, pan });
      prev = p;
    }
  };
  scan(0, T.a1 + 0.25, t => scenePhase(SCENES.A, t), 'A', 1, -0.1);
  scan(T.a1, T.b1 + 0.25, t => scenePhase(SCENES.B, t), 'B', 0.9, 0.15);
  scan(T.b1, T.c1 + 0.6, t => scenePhase(SCENES.C, t), 'C', 0.85, -0.05);
  scan(T.c1, T.mapIn + 0.6, t => scenePhase(SCENES.A, t), 'A', 0.45, -0.35);
  scan(T.c1, T.mapIn + 0.6, t => scenePhase(SCENES.B, t), 'B', 0.45, 0.35);
  GROUP.forEach((g, i) => scan(T.group, T.end0 + 0.3, t => groupPhase(i, t), 'G', 0.55 - g.z * 0.08, (g.x - 540) / 900));
  return { T, BEAT, steps, FPS };
};

window.ready = document.fonts.ready.then(() => Promise.all([
  document.fonts.load(F.sans(100, 600)), document.fonts.load(F.sans(100, 500)), document.fonts.load(F.sans(100, 400)),
  document.fonts.load(F.serif(100)), document.fonts.load(F.mono(20)), document.fonts.load(F.mono(20, 500)),
])).then(() => { window.renderFrame(0); return true; });
window.FILM = { W, H, FPS, DUR: T.DUR, frames: Math.round(T.DUR * FPS) };
