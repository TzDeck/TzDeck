// node music.mjs  Synthesizes the score and SFX to out/score.wav, locked to the film's 120 BPM grid.
import { writeFileSync, mkdirSync } from 'node:fs';
import './timeline.js';

const SR = 48000, DUR = 20, BEAT = 0.5;
const b = (n) => n * BEAT;
const Q = globalThis.CUES;
const N = DUR * SR;
const L = new Float32Array(N), R = new Float32Array(N);

let seed = 7;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648) - 1;
const TAU = Math.PI * 2;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Adds a voice rendered sample by sample. fn(t, dt) returns a mono sample; pan is -1..1. */
function add(start, len, gain, pan, fn) {
  const s0 = Math.floor(start * SR), n = Math.floor(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR);
    L[s0 + i] += v * gl;
    R[s0 + i] += v * gr;
  }
}

/** One-pole lowpass whose cutoff can move over time. */
function lowpass() {
  let y = 0;
  return (x, cutoff) => { const a = 1 - Math.exp(-TAU * cutoff / SR); y += a * (x - y); return y; };
}

// ---------------------------------------------------------------- instruments
function kick(t0, gain = 0.9) {
  let phase = 0;
  add(t0, 0.5, gain, 0, (t) => {
    phase += TAU * (45 + 110 * Math.exp(-t * 30)) / SR;
    return Math.sin(phase) * Math.exp(-t * 7) + (t < 0.004 ? noise() * 0.4 : 0);
  });
}

function clap(t0, gain = 0.35) {
  const lp = lowpass();
  add(t0, 0.25, gain, 0.1, (t) => {
    const env = [0, 0.011, 0.022].reduce((v, o) => v + (t >= o ? Math.exp(-(t - o) * (o === 0.022 ? 18 : 90)) : 0), 0);
    const x = noise();
    return (x - lp(x, 1200)) * env;
  });
}

function hat(t0, gain = 0.1, pan = 0.35) {
  const lp = lowpass();
  add(t0, 0.06, gain, pan, (t) => { const x = noise(); return (x - lp(x, 7000)) * Math.exp(-t * 70); });
}

function bass(t0, len, note, gain = 0.32) {
  const f = midi(note), lp = lowpass();
  add(t0, len, gain, 0, (t) => {
    const saw = [1, 2, 3, 4, 5].reduce((v, h) => v + Math.sin(TAU * f * h * t) / h, 0);
    const pump = 1 - Math.exp(-t * 14);
    return lp(saw, 380 + 600 * Math.exp(-t * 6)) * pump * Math.exp(-t * 1.2);
  });
}

function pluck(t0, note, gain = 0.12, pan = 0) {
  const f = midi(note);
  add(t0, 0.5, gain, pan, (t) =>
    (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t) + 0.12 * Math.sin(TAU * 3 * f * t)) * Math.exp(-t * 9));
}

function bell(t0, note, gain = 0.14, pan = 0, decay = 1.6) {
  const f = midi(note);
  add(t0, 2.5, gain, pan, (t) =>
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].reduce((v, [p, a]) => v + a * Math.sin(TAU * f * p * t) * Math.exp(-t * decay * p * 0.6), 0));
}

function riser(t0, len, gain = 0.22) {
  const lp = lowpass();
  add(t0, len, gain, 0, (t) => { const p = t / len; return lp(noise(), 300 + 9000 * p * p) * p * p; });
}

function whoosh(t0, len = 0.45, gain = 0.3, pan = 0) {
  const lp = lowpass();
  add(t0, len, gain, pan, (t) => { const p = t / len; return lp(noise(), 400 + 5000 * Math.sin(Math.PI * p)) * Math.sin(Math.PI * p); });
}

function rip(t0, gain = 0.4) {
  const lp = lowpass();
  add(t0, 0.4, gain, -0.1, (t) => {
    const crackle = Math.abs(Math.sin(t * 900 + Math.sin(t * 130) * 4)) > 0.7 ? 1 : 0.25;
    const x = noise();
    return (x - lp(x, 1500)) * crackle * Math.exp(-t * 5);
  });
}

function impact(t0, gain = 1) {
  kick(t0, 0.9 * gain);
  const lp = lowpass();
  add(t0, 1.2, 0.35 * gain, 0, (t) => lp(noise(), 900) * Math.exp(-t * 4));
  add(t0, 1.2, 0.35 * gain, 0, (t) => Math.sin(TAU * 36 * t) * Math.exp(-t * 3));
}

function punch(t0, gain = 0.6, pan = 0) {
  kick(t0, 0.5 * gain);
  const lp = lowpass();
  add(t0, 0.18, gain, pan, (t) => { const x = noise(); return (x - lp(x, 800)) * Math.exp(-t * 28); });
}

function flick(t0, gain = 0.28, pan = 0) {
  add(t0, 0.08, gain, pan, (t) => Math.sin(TAU * (2600 - 9000 * t) * t) * Math.exp(-t * 60) + noise() * 0.3 * Math.exp(-t * 90));
}

// ---------------------------------------------------------------- arrangement
// Am - F - C - G, one chord per bar (2 s). Roots for bass, triads for plucks.
const CHORDS = [[57, [69, 72, 76]], [53, [69, 72, 77]], [48, [67, 72, 76]], [55, [67, 71, 74]]];
const chordAt = (t) => CHORDS[Math.floor(t / 2) % 4];

// Hook: two impacts, wobble ticks, a riser into the tear.
impact(b(Q.pull), 1);
impact(b(Q.slam), 0.8);
flick(b(Q.wobble[0]), 0.18, -0.4);
flick(b(Q.wobble[1]), 0.18, 0.4);
riser(b(Q.wobble[0]), b(Q.burst) - b(Q.wobble[0]), 0.2);
rip(b(Q.tear));
whoosh(b(Q.burst) - 0.1, 0.5, 0.35);

// Groove from the fan-out to the lockup, with a breakdown before the hero flip.
const BREAK = [b(Q.breakdown), b(Q.hero)];
for (let beat = Q.fan; beat < Q.logo; beat++) {
  const t = b(beat);
  const inBreak = t >= BREAK[0] && t < BREAK[1];
  if (!inBreak) kick(t, 0.75);
  if (!inBreak && beat % 2 === 1) clap(t);
  hat(t + BEAT / 2, inBreak ? 0.05 : 0.09, beat % 2 ? 0.35 : -0.35);
  const [root, triad] = chordAt(t);
  if (!inBreak) bass(t, BEAT * 0.95, root - 12 + 12);
  for (let s = 0; s < 4; s++) {
    const note = triad[(beat * 4 + s) % 3] + (s === 3 ? 12 : 0);
    pluck(t + s * BEAT / 4, note, inBreak ? 0.05 : 0.08, s % 2 ? 0.45 : -0.45);
  }
}
for (let i = 0; i < 8; i++) clap(BREAK[0] + i * 0.125, 0.12 + i * 0.03);
riser(BREAK[0], BREAK[1] - BREAK[0], 0.28);

// Card flips on beats 8-11, then the hero.
[-0.5, 0.5, -0.25, 0.25].forEach((pan, i) => flick(b(Q.flips[i]), 0.3, pan));
impact(b(Q.hero), 1.1);
[81, 84, 88, 91].forEach((n, i) => bell(b(Q.hero) + i * 0.06, n, 0.1, i % 2 ? 0.4 : -0.4, 1.2));
add(b(Q.hero), 2.2, 0.12, 0, (t) => noise() * Math.exp(-t * 2.2));

// Collect whip, battle slam and hits.
whoosh(b(Q.collect) - 0.15, 0.45, 0.3, -0.2);
impact(b(Q.battle), 0.9);
punch(b(Q.hits[0]), 0.6, 0.3);
punch(b(Q.hits[1]), 0.6, -0.3);
punch(b(Q.hits[2]), 0.6, 0.3);
whoosh(b(Q.hits[3]), 0.25, 0.25, -0.3);
whoosh(b(Q.battleOut), 0.35, 0.25, 0.2);

// Rarity chips: one rising tick per tier.
[69, 72, 76, 79, 84].forEach((n, i) => bell(b(Q.rarity) + i * b(Q.rarityStep), n, 0.07, i % 2 ? 0.3 : -0.3, 3));

// Lockup: a chime on the logo, one pluck per word, a pop for the pill.
impact(b(Q.logoIn), 0.7);
[57, 64, 69, 73, 76].forEach((n, i) => bell(b(Q.logoIn) + i * 0.04, n + 12, 0.08, 0, 0.9));
Q.words.map(b).forEach((t, i) => pluck(t, [76, 79, 81][i], 0.12));
flick(b(Q.cta), 0.25);

// ---------------------------------------------------------------- master
let peak = 0;
for (let i = 0; i < N; i++) {
  const fadeOut = Math.min(1, (N - i) / (SR * 0.8));
  L[i] = Math.tanh(L[i] * 1.1) * fadeOut;
  R[i] = Math.tanh(R[i] * 1.1) * fadeOut;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const scale = 0.89 / peak;

const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  out.writeInt16LE(Math.round(L[i] * scale * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(R[i] * scale * 32767), 46 + i * 4);
}
mkdirSync('out', { recursive: true });
writeFileSync('out/score.wav', out);
console.log(`out/score.wav: ${DUR}s stereo, peak normalized from ${peak.toFixed(2)}`);
