/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const outDir = path.join(root, "samples", "staging", "online-realistic-liminal", "renders");
fs.mkdirSync(outDir, { recursive: true });

const wavOut = path.join(outDir, "wild-real-liminal-breakcore-ballroom-backrooms-master.wav");
const mp3Out = path.join(downloads, "wild-real-liminal-breakcore-ballroom-backrooms-master.mp3");
const attrOut = path.join(downloads, "wild-real-liminal-breakcore-ballroom-backrooms-attribution.txt");

const SR = 44100;
const BPM = 176;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 112;
const DURATION = BAR * BARS;
const N = Math.ceil(DURATION * SR);
const left = new Float32Array(N);
const right = new Float32Array(N);
const duck = new Float32Array(N);

let seed = 0xdecafbad;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Not a RIFF/WAVE file: ${file}`);
  }
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        sampleRate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14),
      };
    }
    if (id === "data") {
      data = b.subarray(body, body + size);
    }
    off = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`Missing fmt/data chunks: ${file}`);
  if (![1, 3].includes(fmt.format)) throw new Error(`Unsupported WAV format ${fmt.format}: ${file}`);

  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / bytes / fmt.channels);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const vals = [];
    for (let c = 0; c < fmt.channels; c++) {
      const p = (i * fmt.channels + c) * bytes;
      let v;
      if (fmt.format === 3 && fmt.bits === 32) v = data.readFloatLE(p);
      else if (fmt.bits === 16) v = data.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) {
        const raw = data[p] | (data[p + 1] << 8) | (data[p + 2] << 16);
        v = ((raw & 0x800000) ? raw | 0xff000000 : raw) / 8388608;
      } else if (fmt.bits === 32) v = data.readInt32LE(p) / 2147483648;
      else throw new Error(`Unsupported bit depth ${fmt.bits}: ${file}`);
      vals.push(v);
    }
    l[i] = vals[0] ?? 0;
    r[i] = vals[1] ?? vals[0] ?? 0;
  }
  return { file, sampleRate: fmt.sampleRate, length: frames, l, r };
}

function resampleTo44k(src) {
  if (src.sampleRate === SR) return src;
  const frames = Math.floor(src.length * SR / src.sampleRate);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const x = i * src.sampleRate / SR;
    const j = Math.floor(x);
    const f = x - j;
    const j2 = Math.min(src.length - 1, j + 1);
    l[i] = src.l[j] * (1 - f) + src.l[j2] * f;
    r[i] = src.r[j] * (1 - f) + src.r[j2] * f;
  }
  return { ...src, sampleRate: SR, length: frames, l, r };
}

function panGains(pan) {
  const p = Math.max(-1, Math.min(1, pan));
  const angle = (p + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function addSample(src, opt) {
  const rate = opt.rate ?? 1;
  const dstStart = Math.floor((opt.time ?? 0) * SR);
  const srcStart = (opt.src ?? 0) * SR;
  const len = Math.floor((opt.length ?? ((src.length - srcStart) / SR / Math.abs(rate))) * SR);
  const gain = opt.gain ?? 1;
  const [pl, pr] = panGains(opt.pan ?? 0);
  const fade = Math.min(Math.floor((opt.fade ?? 0.02) * SR), Math.floor(len / 2));
  const reverse = opt.reverse ?? false;
  const lo = opt.lofi ?? 0;
  const ducked = opt.ducked ?? false;
  for (let i = 0; i < len; i++) {
    const di = dstStart + i;
    if (di < 0 || di >= N) continue;
    let sx = reverse ? srcStart + (len - 1 - i) * rate : srcStart + i * rate;
    if (sx < 0 || sx >= src.length - 2) continue;
    const j = Math.floor(sx);
    const f = sx - j;
    let sl = src.l[j] * (1 - f) + src.l[j + 1] * f;
    let sr = src.r[j] * (1 - f) + src.r[j + 1] * f;
    if (lo > 0) {
      const crush = 1 << Math.max(3, Math.floor(12 - lo * 8));
      sl = Math.round(sl * crush) / crush;
      sr = Math.round(sr * crush) / crush;
    }
    let env = 1;
    if (fade > 0) env *= Math.min(1, i / fade, (len - i) / fade);
    if (opt.attack) env *= smoothstep(i / (opt.attack * SR));
    if (opt.release) env *= smoothstep((len - i) / (opt.release * SR));
    const d = ducked ? (1 - 0.45 * duck[di]) : 1;
    left[di] += sl * gain * env * pl * d;
    right[di] += sr * gain * env * pr * d;
  }
}

function addMonoShot(src, time, opt = {}) {
  addSample(src, {
    time,
    src: opt.src ?? 0,
    length: opt.length,
    rate: opt.rate ?? 1,
    gain: opt.gain ?? 1,
    pan: opt.pan ?? 0,
    fade: opt.fade ?? 0.0015,
    lofi: opt.lofi ?? 0,
  });
  if (opt.duck) {
    const start = Math.floor(time * SR);
    const attack = Math.floor(0.003 * SR);
    const release = Math.floor((opt.duckRelease ?? 0.18) * SR);
    for (let i = 0; i < attack + release; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= N) continue;
      const v = i < attack ? i / attack : 1 - ((i - attack) / release);
      duck[idx] = Math.max(duck[idx], Math.max(0, v) * (opt.duckAmount ?? 1));
    }
  }
}

function addTone(time, lenSec, freq, gain, pan = 0, type = "sine") {
  const start = Math.floor(time * SR);
  const len = Math.floor(lenSec * SR);
  const [pl, pr] = panGains(pan);
  for (let i = 0; i < len; i++) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    let v = Math.sin(2 * Math.PI * freq * t);
    if (type === "tri") v = Math.asin(v) * 2 / Math.PI;
    const env = smoothstep(i / (0.02 * SR)) * smoothstep((len - i) / (0.08 * SR));
    const d = 1 - 0.65 * duck[di];
    left[di] += v * gain * env * pl * d;
    right[di] += v * gain * env * pr * d;
  }
}

function addNoiseBed() {
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const section = t < 8 * BAR ? 0.05 : t > 96 * BAR ? 0.08 : 0.025;
    const n = (rand() * 2 - 1) * section;
    lpL = lpL * 0.997 + n * 0.003;
    lpR = lpR * 0.997 + (rand() * 2 - 1) * section * 0.003;
    const crack = rand() > 0.99972 ? (rand() * 2 - 1) * 0.4 : 0;
    const hum = Math.sin(2 * Math.PI * 50 * t) * 0.004 + Math.sin(2 * Math.PI * 100 * t) * 0.002;
    left[i] += lpL + crack * 0.7 + hum;
    right[i] += lpR + crack * 0.55 + hum;
  }
}

function addDelayReturn(delaySec, feedback, wet) {
  const d = Math.floor(delaySec * SR);
  for (let i = d; i < N; i++) {
    left[i] += right[i - d] * wet;
    right[i] += left[i - d] * wet;
    left[i] += left[i - d] * feedback * 0.03;
    right[i] += right[i - d] * feedback * 0.03;
  }
}

function onePoleLowpass(arr, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < arr.length; i++) {
    y += a * (arr[i] - y);
    arr[i] = y;
  }
}

function highpass(arr, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = rc / (rc + dt);
  let y = 0;
  let xPrev = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    y = a * (y + x - xPrev);
    arr[i] = y;
    xPrev = x;
  }
}

function writeWav(file) {
  const dataBytes = N * 4;
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(dataBytes, 40);
  let p = 44;
  for (let i = 0; i < N; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    b.writeInt16LE(Math.round(l * 32767), p); p += 2;
    b.writeInt16LE(Math.round(r * 32767), p); p += 2;
  }
  fs.writeFileSync(file, b);
}

const ballroomDir = path.join(root, "samples", "staging", "online-liminal-ballroom");
const drumDir = path.join(root, "samples", "staging", "online-realistic-liminal", "drumshots-44k");
const ballroom = [
  "05 That Haunting Waltz.wav",
  "10 Nocturne .wav",
  "06 When You And I Were Seventeen w.wav",
  "07 Oriental Nights.wav",
].map((f) => resampleTo44k(readWav(path.join(ballroomDir, f))));
const drums = Object.fromEntries([
  "JBK_Kick_120.wav",
  "JBK_Kick_147a.wav",
  "JBK_Snare_10.wav",
  "JBK_Snare_121.wav",
  "JBK_Snare_132a.wav",
  "JBK_Closed_Hat_139a.wav",
  "JBK_Closed_Hat_143.wav",
  "JBK_Rim_10b.wav",
  "JBK_Cymbal_18.wav",
].map((f) => [f, resampleTo44k(readWav(path.join(drumDir, f)))]));

function barTime(bar, beat = 0) {
  return bar * BAR + beat * BEAT;
}

function arrangeSamples() {
  addNoiseBed();

  // A decayed ballroom bed gives the track its realism; rate changes create the liminal pitch drift.
  for (let b = 0; b < BARS; b += 8) {
    const src = ballroom[(b / 8) % ballroom.length];
    const srcPos = 7 + ((b * 2.7) % 38);
    const sectionGain = b < 8 ? 0.7 : b < 48 ? 0.48 : b < 64 ? 0.68 : b < 96 ? 0.42 : 0.58;
    const rate = b < 8 ? 0.62 : b < 64 ? 0.74 + (rand() - 0.5) * 0.04 : 0.68 + (rand() - 0.5) * 0.05;
    addSample(src, { time: barTime(b), src: srcPos, length: BAR * 9.5, rate, gain: sectionGain, pan: (rand() - 0.5) * 0.35, fade: 0.8, attack: 0.5, release: 1.2, lofi: b > 88 ? 0.35 : 0.12, ducked: true });
  }

  // Recurring hook, made from real record chops rather than a synth melody.
  const hookSrc = ballroom[0];
  const hookStarts = [14.6, 15.1, 16.05, 17.2, 21.4, 22.15, 24.0, 25.1];
  for (const startBar of [8, 16, 32, 64, 72, 80]) {
    for (let i = 0; i < 16; i++) {
      const pick = hookStarts[(i + Math.floor(startBar / 8)) % hookStarts.length];
      const t = barTime(startBar, i * 0.5);
      const rate = i % 4 === 3 ? 0.53 : 0.71 + (i % 3) * 0.018;
      const rev = startBar >= 80 && i % 7 === 0;
      addSample(hookSrc, { time: t, src: pick, length: BEAT * 0.52, rate, gain: startBar >= 64 ? 0.62 : 0.5, pan: ((i % 5) - 2) * 0.16, fade: 0.035, reverse: rev, lofi: 0.08, ducked: true });
    }
  }

  // Reverse swells and memory-smear edits.
  for (const b of [7, 15, 23, 31, 47, 63, 79, 95]) {
    const src = ballroom[(b + 1) % ballroom.length];
    addSample(src, { time: barTime(b, 2.1), src: 32 + (b % 13), length: BEAT * 1.8, rate: 0.58, gain: 0.42, pan: (rand() - 0.5) * 0.5, fade: 0.12, reverse: true, lofi: 0.25 });
  }
}

function arrangeDrums() {
  const kickA = drums["JBK_Kick_120.wav"];
  const kickB = drums["JBK_Kick_147a.wav"];
  const snareA = drums["JBK_Snare_10.wav"];
  const snareB = drums["JBK_Snare_121.wav"];
  const snareC = drums["JBK_Snare_132a.wav"];
  const hatA = drums["JBK_Closed_Hat_139a.wav"];
  const hatB = drums["JBK_Closed_Hat_143.wav"];
  const rim = drums["JBK_Rim_10b.wav"];
  const cym = drums["JBK_Cymbal_18.wav"];

  for (let b = 8; b < 100; b++) {
    const drop = (b >= 24 && b < 48) || (b >= 64 && b < 96);
    const busy = drop || (b >= 16 && b < 24);
    const t0 = barTime(b);
    const baseGain = drop ? 1.1 : 0.82;

    for (const beat of [0, 1.5, 2.72, 3.25]) addMonoShot((beat === 0 ? kickB : kickA), t0 + beat * BEAT, { gain: baseGain * (beat === 0 ? 0.98 : 0.72), pan: -0.03, duck: true, duckAmount: 1, duckRelease: 0.16 });
    if (b % 4 === 3) addMonoShot(kickA, t0 + 3.72 * BEAT, { gain: 0.78, pan: -0.06, duck: true, duckRelease: 0.08 });

    for (const beat of [1, 3]) addMonoShot(snareA, t0 + beat * BEAT, { gain: drop ? 0.96 : 0.82, pan: 0.05, duck: true, duckAmount: 0.65, duckRelease: 0.1 });
    for (const beat of [0.82, 2.55, 3.58]) addMonoShot(snareB, t0 + beat * BEAT, { gain: busy ? 0.42 : 0.22, pan: (rand() - 0.5) * 0.25, rate: 0.94 + rand() * 0.12 });
    if (drop && b % 2 === 1) {
      for (let k = 0; k < 5; k++) addMonoShot(snareC, t0 + (3.25 + k * 0.125) * BEAT, { gain: 0.24 + k * 0.035, pan: -0.2 + k * 0.1, rate: 0.88 + k * 0.035 });
    }

    const hatStep = drop ? 0.25 : 0.5;
    for (let beat = 0; beat < 4; beat += hatStep) {
      if (!drop && rand() < 0.16) continue;
      addMonoShot((beat * 4) % 2 === 0 ? hatA : hatB, t0 + beat * BEAT, { gain: (drop ? 0.24 : 0.16) * (0.75 + rand() * 0.5), pan: (rand() - 0.5) * 0.7, rate: 0.95 + rand() * 0.18, length: 0.16 });
    }

    if (b % 8 === 0) addMonoShot(cym, t0, { gain: drop ? 0.52 : 0.34, pan: 0.24, rate: 0.88, length: 1.5 });
    if (busy) for (const beat of [0.5, 2.25, 3.75]) addMonoShot(rim, t0 + beat * BEAT, { gain: 0.25, pan: (rand() - 0.5) * 0.45, rate: 0.8 + rand() * 0.35 });

    // Breakcore edits, but still anchored by a groove.
    if (drop && b % 4 === 2) {
      for (let k = 0; k < 12; k++) {
        const beat = 2.5 + k * 0.0625;
        addMonoShot(k % 3 === 0 ? snareA : snareC, t0 + beat * BEAT, { gain: 0.18 + k * 0.012, pan: (k % 2 ? 0.22 : -0.22), rate: 0.78 + k * 0.025, length: 0.09 });
      }
    }
  }
}

function arrangeSub() {
  const notes = [43.65, 43.65, 38.89, 32.7, 43.65, 51.91, 38.89, 36.71];
  for (let b = 8; b < 96; b += 2) {
    const active = (b >= 24 && b < 48) || (b >= 64 && b < 96) || (b >= 16 && b < 24);
    if (!active) continue;
    for (let i = 0; i < 4; i++) {
      const f = notes[(b / 2 + i) % notes.length];
      addTone(barTime(b, i), BEAT * 0.78, f, 0.115, 0, "sine");
    }
  }
}

arrangeSamples();
arrangeDrums();
arrangeSub();

// Mix polish: tame rumble on full mix, add space, saturate, normalize.
highpass(left, 24);
highpass(right, 24);
addDelayReturn(BEAT * 0.75, 0.38, 0.045);
onePoleLowpass(left, 16500);
onePoleLowpass(right, 16500);

let peak = 0;
let rms = 0;
for (let i = 0; i < N; i++) {
  left[i] = Math.tanh(left[i] * 1.28);
  right[i] = Math.tanh(right[i] * 1.28);
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  rms += left[i] * left[i] + right[i] * right[i];
}
const norm = Math.min(1.0, 0.96 / peak);
for (let i = 0; i < N; i++) {
  left[i] *= norm;
  right[i] *= norm;
}
rms = Math.sqrt(rms / (N * 2));

writeWav(wavOut);

const ff = spawnSync("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  wavOut,
  "-codec:a",
  "libmp3lame",
  "-b:a",
  "320k",
  mp3Out,
], { encoding: "utf8" });
if (ff.status !== 0) {
  throw new Error(`ffmpeg mp3 export failed: ${ff.stderr || ff.stdout}`);
}

fs.writeFileSync(attrOut, [
  "Wild Real Liminal Breakcore Ballroom Backrooms master",
  "",
  "Direction: original sample-collage composition using public-domain/PD-marked source recordings and drum one-shots.",
  "",
  "Sources:",
  "- Internet Archive: Original Jungle Breaks, Public Domain Mark 1.0, https://archive.org/details/back03st",
  "- Internet Archive: Cole McElroy Spanish Ballroom Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/ColeMcElroySpanishBallroomOrchestra78rpmCollection",
  "- Internet Archive: Nathan Glantz Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/NathanGlantzOrchestra78rpmCollection",
  "",
  "Process:",
  "- Real jungle one-shot drums programmed into breakcore/DnB patterns.",
  "- 78rpm ballroom recordings chopped, reversed, pitched, filtered, ducked, and layered.",
  "- Generated elements limited to utility sub, vinyl wear, noise, delay, saturation, and limiting.",
].join("\n"));

console.log(JSON.stringify({
  ok: true,
  wavOut,
  mp3Out,
  attrOut,
  durationSeconds: Number(DURATION.toFixed(2)),
  bpm: BPM,
  peak: Number(peak.toFixed(4)),
  rms: Number(rms.toFixed(4)),
}, null, 2));
