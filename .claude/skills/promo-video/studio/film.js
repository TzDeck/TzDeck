// TzDeck promo. window.seek(t) paints frame t; nothing depends on wall-clock time.
const W = 1080, H = 1920, DUR = 20, BEAT = 0.5;
const b = (n) => n * BEAT;
const Q = globalThis.CUES;

const C = {
  bg: '#07080f', s1: '#0d0f19', s2: '#141727', border: 'rgba(255,255,255,0.10)',
  text: '#f2f4fa', text2: '#a5abc2', text3: '#79809b', accent: '#6366f1', accent2: '#818cf8',
  common: '#64748b', uncommon: '#34d399', rare: '#22d3ee', epic: '#a78bfa', legendary: '#fbbf24',
};

const cv = document.getElementById('c');
const g = cv.getContext('2d');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, z, p) => a + (z - a) * p;
/** Canvas silently ignores a globalAlpha outside [0, 1], so every write goes through here. */
const fade = (a) => { g.globalAlpha = clamp(g.globalAlpha * a); };

function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** A value with several targets: one spring per change, so any frame renders on its own. */
function track(t, keys, k, d) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}

/** A decaying wobble started at each time in `hits`. */
function wobble(t, hits, amp, freq = 28, decay = 7) {
  let v = 0;
  for (const h of hits) if (t > h) v += amp * Math.exp(-decay * (t - h)) * Math.sin(freq * (t - h));
  return v;
}

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let x = Math.imul(seed ^ seed >>> 15, 1 | seed);
    x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- assets
// The picks change every run: captured cards are named p<pack>-c<card> (see assets/cards.json).
const HERO_CREDIT = '1 of 1  ·  Coronado #347 by jeres';
const SRC = {
  pack: 'assets/pack.png',
  back: 'assets/back.png',
  battle: 'assets/battle.png',
  logo: 'assets/tzdeck-shield-gradient-on-dark.svg',
  legendary: 'assets/cards/p7-c1.png',
};
const FLIP_CARDS = ['assets/cards/p2-c2.png', 'assets/cards/p5-c1.png', 'assets/cards/p3-c3.png', 'assets/cards/p5-c2.png'];
const MARQUEE = [
  'p0-c1', 'p1-c0', 'p1-c2', 'p1-c4', 'p2-c0', 'p2-c1', 'p3-c1', 'p3-c2', 'p3-c4', 'p4-c0', 'p4-c1', 'p4-c3',
  'p5-c0', 'p5-c3', 'p5-c4', 'p6-c0', 'p6-c1', 'p6-c3', 'p6-c4', 'p7-c0', 'p7-c2', 'p7-c3', 'p7-c4', 'p0-c4',
].map((name) => `assets/cards/${name}.png`);

const IMG = {};
const load = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`missing ${src}`));
  img.src = src;
});

let grain = null;
function buildGrain() {
  grain = document.createElement('canvas');
  grain.width = grain.height = 256;
  const gc = grain.getContext('2d');
  const data = gc.createImageData(256, 256);
  const r = rng(11);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = r() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  gc.putImageData(data, 0, 0);
}

window.ready = (async () => {
  for (const [key, src] of Object.entries(SRC)) IMG[key] = await load(src);
  IMG.flips = await Promise.all(FLIP_CARDS.map(load));
  IMG.marquee = await Promise.all(MARQUEE.map(load));
  await Promise.all([
    '800 100px Oxanium', '700 100px Oxanium', '600 100px Oxanium',
    '400 40px Inter', '500 40px Inter', '600 40px Inter',
  ].map((font) => document.fonts.load(font)));
  buildGrain();
  return true;
})();

// ---------------------------------------------------------------- drawing helpers
function text(str, x, y, { size = 100, weight = 800, family = 'Oxanium', color = C.text, align = 'center', tracking = 0, alpha = 1 } = {}) {
  if (alpha <= 0) return;
  g.save();
  fade(alpha);
  g.font = `${weight} ${size}px ${family}`;
  g.letterSpacing = `${tracking}px`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.restore();
}

/** Text that rises out of a mask line on a spring, and drops back out when `tOut` passes. */
function riseText(str, x, y, t, tIn, opts = {}, tOut = Infinity) {
  const size = opts.size ?? 100;
  const p = spring(t - tIn, 240, 24) - spring(t - tOut, 260, 26);
  if (p <= 0.001 && t > tIn) return;
  if (t < tIn) return;
  const dir = t > tOut ? -1 : 1;
  g.save();
  g.beginPath();
  g.rect(0, y - size * 1.0, W, size * 1.3);
  g.clip();
  text(str, x, y + dir * (1 - p) * size * 1.15, opts);
  g.restore();
}

function roundRect(x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function drawImg(img, cx, cy, w, { rot = 0, sx = 1, scale = 1, alpha = 1, glow = null, glowBlur = 90 } = {}) {
  if (alpha <= 0 || scale <= 0) return;
  const h = w * img.height / img.width;
  g.save();
  fade(alpha);
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(sx * scale, scale);
  if (glow) { g.shadowColor = glow; g.shadowBlur = glowBlur; }
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
}

/** A card that flips from its back to `front`, starting at `tFlip`. */
function flipCard(front, cx, cy, w, t, tFlip, opts = {}) {
  const p = clamp(spring(t - tFlip, 300, 30));
  const sx = Math.max(0.02, Math.abs(Math.cos(Math.PI * p)));
  const pop = 1 + 0.1 * Math.sin(Math.PI * p);
  const face = p > 0.5 ? front : IMG.back;
  drawImg(face, cx, cy, w, { ...opts, sx, scale: (opts.scale ?? 1) * pop });
}

function background(t, glow = C.accent, glowAlpha = 0.22) {
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  const gx = W / 2 + Math.sin(t * 0.6) * 160, gy = H * 0.42 + Math.cos(t * 0.45) * 120;
  const pulse = 1 + 0.08 * Math.exp(-6 * ((t % BEAT)));
  const grad = g.createRadialGradient(gx, gy, 0, gx, gy, 900 * pulse);
  grad.addColorStop(0, hexA(glow, glowAlpha));
  grad.addColorStop(1, hexA(glow, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

function filmGrain(t) {
  const frame = Math.floor(t * 24);
  const r = rng(frame + 1);
  g.save();
  g.globalAlpha = 0.05;
  g.globalCompositeOperation = 'overlay';
  const ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
  for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) g.drawImage(grain, x, y);
  g.restore();
}

/** Vertical offset for a scene that enters from below at tIn and leaves upward at tOut. */
function whip(t, tIn, tOut) {
  return H * (1 - spring(t - tIn, 190, 26)) - H * spring(t - tOut, 190, 26);
}

// ---------------------------------------------------------------- scenes
function hook(t) {
  const out = spring(t - b(Q.tear), 200, 24);
  riseText('PULL.', W / 2, 520, t, b(Q.pull), { size: 330, tracking: 6 }, b(Q.tear));

  const pw = 600, ph = pw * IMG.pack.height / IMG.pack.width;
  const drop = spring(t - b(Q.slam), 320, 22);
  const cy = lerp(-ph, 1130, drop) + 900 * spring(t - b(Q.burst), 90, 20);
  const rot = wobble(t, Q.wobble.map(b), 0.05) + 0.3 * spring(t - b(Q.burst), 90, 20);
  if (t < b(Q.tear)) {
    drawImg(IMG.pack, W / 2, cy, pw, { rot });
  } else {
    // The tear: the top strip flies off, the body drops away.
    const tear = 0.17;
    const topFly = spring(t - b(Q.tear), 140, 16);
    g.save();
    g.translate(W / 2 + 420 * topFly, cy - ph / 2 - 700 * topFly);
    g.rotate(rot + 0.9 * topFly);
    g.drawImage(IMG.pack, 0, 0, IMG.pack.width, IMG.pack.height * tear, -pw / 2, 0, pw, ph * tear);
    g.restore();
    g.save();
    g.translate(W / 2, cy);
    g.rotate(rot);
    g.drawImage(IMG.pack, 0, IMG.pack.height * tear, IMG.pack.width, IMG.pack.height * (1 - tear),
      -pw / 2, -ph / 2 + ph * tear, pw, ph * (1 - tear));
    g.restore();
    const slit = clamp((t - b(Q.tear)) / 0.25) * (1 - clamp((t - b(Q.burst)) / 0.3));
    if (slit > 0) {
      g.save();
      g.shadowColor = '#fff'; g.shadowBlur = 80;
      g.fillStyle = hexA('#ffffff', slit);
      g.fillRect(W / 2 - pw * 0.55 * slit, cy - ph / 2 + ph * tear - 5, pw * 1.1 * slit, 10);
      g.restore();
    }
  }
  riseText('5 random works listed on OBJKT right now', W / 2, 1790, t, b(Q.slam + 1),
    { size: 48, weight: 600, family: 'Inter', color: C.text2 }, b(Q.tear));
  const flash = clamp(1 - (t - b(Q.burst)) / 0.3) * (t >= b(Q.burst) ? 1 : 0);
  if (flash > 0) {
    const fy = 1130 - ph / 2 + ph * 0.17;
    const burst = g.createRadialGradient(W / 2, fy, 0, W / 2, fy, 900);
    burst.addColorStop(0, hexA('#ffffff', 0.45 * flash));
    burst.addColorStop(1, hexA(C.accent2, 0));
    g.fillStyle = burst; g.fillRect(0, 0, W, H);
  }
  return out;
}

const FAN = [0, 1, 2, 3, 4].map((i) => ({
  x: W / 2 + (i - 2) * 190, y: 1050 + Math.abs(i - 2) * 46, rot: (i - 2) * 0.075,
}));
const FLIP_AT = { 0: b(Q.flips[0]), 4: b(Q.flips[1]), 1: b(Q.flips[2]), 3: b(Q.flips[3]) };
const FLIP_FRONT = { 0: 0, 4: 1, 1: 2, 3: 3 };
const LEGEND_FLIP = b(Q.legendary);

function pull(t) {
  riseText('Five cards.', W / 2, 330, t, b(Q.fan), { size: 120 }, b(Q.legendary - 1));
  riseText('One of them might be gold.', W / 2, 420, t, b(Q.fan + 1), { size: 48, weight: 600, family: 'Inter', color: C.text2 }, b(Q.legendary - 1));
  const tension = clamp((t - b(Q.breakdown)) / (LEGEND_FLIP - b(Q.breakdown)));
  const push = 1 + 0.1 * clamp((t - b(Q.fan)) / (LEGEND_FLIP - b(Q.fan))) - 0.1 * spring(t - LEGEND_FLIP, 150, 20);
  g.save();
  g.translate(W / 2, 1050); g.scale(push, push); g.translate(-W / 2, -1050);
  for (const i of [0, 4, 1, 3, 2]) {
    const f = FAN[i];
    const deal = spring(t - b(Q.fan) - Math.abs(i - 2) * 0.06, 230, 24);
    const scatter = spring(t - LEGEND_FLIP - 0.15, 150, 22);
    const outX = (i - 2) * 900;
    const x = lerp(W / 2, f.x, deal) + outX * scatter;
    const y = lerp(1250, f.y, deal) + 300 * scatter - (FLIP_AT[i] ? 26 * spring(t - FLIP_AT[i], 200, 20) : 0);
    const w = 300;
    const dim = i === 2 ? 1 : 1 - 0.45 * tension;
    if (i === 2) {
      const lift = spring(t - b(Q.breakdown), 120, 18);
      const shake = t < LEGEND_FLIP ? Math.sin(t * 70) * 5 * tension : 0;
      const grow = spring(t - LEGEND_FLIP, 150, 20);
      const cx = x + shake, cy = lerp(f.y - 70 * lift, 1040, grow);
      const cw = lerp(w * (1 + 0.12 * lift), 720, grow) * (1 + 0.07 * clamp((t - LEGEND_FLIP - 0.6) / 2.4));
      const glow = tension > 0 ? hexA(C.legendary, 0.9 * tension + 0.1 * grow) : null;
      flipCard(IMG.legendary, cx, cy, cw, t, LEGEND_FLIP, { rot: f.rot * (1 - grow) + 0.02 * Math.sin(Math.max(0, t - LEGEND_FLIP - 0.6) * 1.8) * grow, glow, glowBlur: 60 + 80 * tension });
      if (t > LEGEND_FLIP) legendaryFx(t, cx, cy, cw);
    } else {
      flipCard(IMG.flips[FLIP_FRONT[i]], x, y, w, t, FLIP_AT[i], { rot: f.rot, alpha: dim * clamp(deal) * clamp(1 - scatter) });
    }
  }
  g.restore();
}

function legendaryFx(t, cx, cy, cw) {
  for (const [start, width] of [[LEGEND_FLIP, 14], [LEGEND_FLIP + 0.25, 6]]) {
    const p = clamp((t - start) / 1.1);
    if (p <= 0 || p >= 1) continue;
    g.save();
    g.strokeStyle = hexA(C.legendary, 0.8 * (1 - p));
    g.lineWidth = width * (1 - p) + 1;
    g.beginPath();
    g.arc(cx, cy, 200 + 1200 * (1 - Math.pow(1 - p, 3)), 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  for (const start of [0.6, 1.9]) {
  const sweep = (t - LEGEND_FLIP - start) / 0.9;
  if (sweep > 0 && sweep < 1) {
    const ch = cw * IMG.legendary.height / IMG.legendary.width;
    g.save();
    roundRect(cx - cw / 2, cy - ch / 2, cw, ch, 44);
    g.clip();
    const sx = lerp(cx - cw, cx + cw, sweep);
    const grad = g.createLinearGradient(sx - 160, cy - ch / 2, sx + 160, cy + ch / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = grad;
    g.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
    g.restore();
  }
  }
  riseText('LEGENDARY', W / 2, 300, t, LEGEND_FLIP + 0.35, { size: 150, color: C.legendary, tracking: 10 }, b(Q.collect - 0.5));
  riseText(HERO_CREDIT, W / 2, 1720, t, LEGEND_FLIP + 0.85,
    { size: 48, weight: 600, family: 'Inter', color: C.text2 }, b(Q.collect - 0.5));
}

function collect(t) {
  const off = whip(t, b(Q.collect), b(Q.battle));
  if (Math.abs(off) >= H) return;
  g.save();
  g.translate(0, off);
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-0.12);
  g.scale(1.18, 1.18);
  const cw = 320, ch = cw * 1623 / 1074, gap = 34;
  for (let col = 0; col < 3; col++) {
    const dir = col === 1 ? -1 : 1;
    const speed = 170 + col * 40;
    const shift = dir * speed * (t - b(Q.collect)) + col * 190;
    for (let row = -4; row < 5; row++) {
      const idx = ((col * 8 + row) % IMG.marquee.length + IMG.marquee.length) % IMG.marquee.length;
      const y = row * (ch + gap) + (shift % (ch + gap));
      g.drawImage(IMG.marquee[idx], (col - 1) * (cw + gap) - cw / 2, y - ch / 2, cw, ch);
    }
  }
  g.restore();
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, hexA(C.bg, 0.9));
  shade.addColorStop(0.3, hexA(C.bg, 0.15));
  shade.addColorStop(0.7, hexA(C.bg, 0.15));
  shade.addColorStop(1, hexA(C.bg, 0.95));
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  const band = spring(t - b(Q.collect + 0.5), 220, 26);
  g.fillStyle = hexA(C.bg, 0.88);
  g.fillRect(0, 780, W * band, 370);
  riseText('COLLECT.', W / 2, 1010, t, b(Q.collect + 1), { size: 210, tracking: 6 });
  riseText('Save your pulls. Browse your wallet as a deck.', W / 2, 1100, t, b(Q.collect + 2),
    { size: 48, weight: 600, family: 'Inter', color: C.text2 });
  g.restore();
}

const HITS = [
  { t: b(Q.hits[0]), n: '-51', side: 1 }, { t: b(Q.hits[1]), n: '-42', side: 0 },
  { t: b(Q.hits[2]), n: '-49', side: 1 }, { t: b(Q.hits[3]), n: 'MISS', side: 0 },
];

function battle(t) {
  if (t < b(Q.battle) - 0.3 || t > b(Q.rarity + 1)) return;
  const enter = spring(t - b(Q.battle), 260, 22);
  const exit = clamp((t - b(Q.battleOut)) / 0.3);
  const shake = HITS.reduce((v, h) => v + wobble(t, [h.t], 10, 45, 12), 0);
  g.save();
  g.translate(W / 2 + shake, 1040);
  const s = lerp(0.82, 1, enter) * (1 + 0.2 * exit) * (1 + 0.06 * clamp((t - b(Q.battle)) / 3));
  g.scale(s, s);
  fade(clamp(enter * 1.4) * clamp(1 - exit));
  const sy = 250, sh = 960, pw = 980, ph = pw * sh / IMG.battle.width;
  roundRect(-pw / 2, -ph / 2, pw, ph, 44);
  g.fillStyle = C.s1; g.fill();
  g.save(); g.clip();
  g.drawImage(IMG.battle, 0, sy, IMG.battle.width, sh, -pw / 2, -ph / 2, pw, ph);
  g.restore();
  g.lineWidth = 3; g.strokeStyle = C.border; roundRect(-pw / 2, -ph / 2, pw, ph, 44); g.stroke();
  for (const h of HITS) {
    const p = spring(t - h.t, 380, 18);
    const life = clamp(1 - (t - h.t - 0.35) / 0.2);
    if (t < h.t || life <= 0) continue;
    const x = h.side ? 260 : -250, y = -150 - 120 * clamp((t - h.t) / 0.55);
    text(h.n, x, y, { size: 130 * p, color: h.n === 'MISS' ? C.text2 : '#f87171', alpha: life });
  }
  g.restore();
  g.save();
  fade(clamp(1 - exit));
  riseText('BATTLE.', W / 2, 470, t, b(Q.battle), { size: 210, tracking: 6 });
  riseText('Fight other collectors. Win XP.', W / 2, 1640, t, b(Q.battle + 1.5),
    { size: 48, weight: 600, family: 'Inter', color: C.text2 });
  g.restore();
}

const TIERS = [
  ['Common', C.common], ['Uncommon', C.uncommon], ['Rare', C.rare], ['Epic', C.epic], ['Legendary', C.legendary],
];

function rarity(t) {
  if (t < b(Q.rarity)) return;
  const collapse = spring(t - b(Q.logo), 260, 26);
  for (let i = 0; i < TIERS.length; i++) {
    const [label, color] = TIERS[i];
    const p = spring(t - b(Q.rarity) - i * b(Q.rarityStep), 300, 24);
    const cw = 640, chh = 132, y = 1300 - i * 160;
    const x = W / 2 + (1 - p) * (i % 2 ? 700 : -700);
    const s = 1 - collapse;
    if (s <= 0.01) continue;
    g.save();
    g.translate(lerp(x, W / 2, collapse), lerp(y, 820, collapse));
    g.scale(s, s);
    if (i === 4) { g.shadowColor = hexA(C.legendary, 0.8 * clamp((t - b(Q.rarity + 2)) / 0.3)); g.shadowBlur = 70; }
    roundRect(-cw / 2, -chh / 2, cw, chh, 66);
    g.fillStyle = C.s2; g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 3; g.strokeStyle = hexA(color, 0.55); g.stroke();
    g.fillStyle = color; g.beginPath(); g.arc(-cw / 2 + 70, 0, 18, 0, Math.PI * 2); g.fill();
    text(label, -cw / 2 + 120, 22, { size: 64, weight: 700, align: 'left' });
    g.restore();
  }
}

function lockup(t) {
  if (t < b(Q.logo)) return;
  const p = spring(t - b(Q.logoIn), 200, 18);
  const lw = 300, lh = lw * 643.03 / 500.73;
  drawImg(IMG.logo, W / 2, 800, lw, { scale: p, glow: hexA(C.accent, 0.6), glowBlur: 70 });
  riseText('TzDeck', W / 2, 1200, t, b(Q.name), { size: 160 });
  const words = [['Pull.', -250], ['Collect.', 0], ['Battle.', 260]];
  words.forEach(([w, dx], i) => riseText(w, W / 2 + dx, 1300, t, b(Q.words[i]),
    { size: 56, weight: 600, family: 'Inter', color: C.text2 }));
  const pill = spring(t - b(Q.cta), 260, 22);
  if (pill > 0) {
    g.save();
    g.translate(W / 2, 1500);
    g.scale(pill, pill);
    roundRect(-290, -70, 580, 140, 70);
    g.fillStyle = C.accent; g.fill();
    text('tzdeck.xyz', 0, 24, { size: 68, weight: 700 });
    g.restore();
  }
  riseText('Free. No wallet needed.', W / 2, 1670, t, b(Q.footnote), { size: 48, weight: 600, family: 'Inter', color: C.text3 });
}

// ---------------------------------------------------------------- frame
function draw(t) {
  const legendGlow = clamp((t - LEGEND_FLIP) / 0.4) * (1 - clamp((t - b(Q.collect)) / 0.4));
  background(t, legendGlow > 0.02 ? C.legendary : C.accent, 0.2 + 0.1 * legendGlow);
  if (t < b(Q.fan)) hook(t);
  if (t >= b(Q.fan) && t < b(Q.collect) + 0.6) {
    g.save();
    g.translate(0, -H * spring(t - b(Q.collect), 190, 26));
    pull(t);
    g.restore();
  }
  if (t >= b(Q.collect) - 0.1 && t < b(Q.battle) + 0.8) collect(t);
  battle(t);
  rarity(t);
  lockup(t);
  filmGrain(t);
}

window.seek = (t) => { draw(t); return true; };

if (!navigator.webdriver) {
  window.ready.then(() => {
    const t0 = performance.now();
    (function loop() {
      draw(((performance.now() - t0) / 1000) % DUR);
      requestAnimationFrame(loop);
    })();
  });
}
