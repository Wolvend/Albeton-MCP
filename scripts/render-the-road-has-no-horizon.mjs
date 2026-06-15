/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const slug = "the-road-has-no-horizon";
const title = "The Road Has No Horizon";
const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const DURATION = 204;
const N = DURATION * SR;
let seed = 0x6d2b79f5;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const outReport = path.join(downloads, `${slug}-verification.json`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);
const stagingReport = path.join(renderRoot, `${slug}-verification.json`);

const stems = {
  motif: bus("original-dead-road-motif"),
  horizon: bus("horizon-air-and-fluorescent-sky"),
  pressure: bus("mono-sub-pressure"),
  voices: bus("synthetic-nonverbal-vocal-apparitions"),
  lab: bus("fictional-lab-transmission"),
  ground: bus("distant-ground-failures"),
  wires: bus("wire-fence-resonance"),
  void: bus("empty-field-void-tail")
};

function bus(name) {
  return { name, l: new Float32Array(N), r: new Float32Array(N) };
}

function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function panGains(pan) {
  const angle = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function addTone(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const t = i / SR;
    const bend = 1 + Math.sin((opt.time + t) * (opt.driftRate ?? 0.017)) * (opt.drift ?? 0);
    const freq = (opt.freq + ((opt.freqEnd ?? opt.freq) - opt.freq) * p) * bend;
    let v = Math.sin(2 * Math.PI * freq * t + (opt.phase ?? 0));
    if (opt.type === "tri") v = Math.asin(v) * 2 / Math.PI;
    if (opt.type === "softsquare") v = Math.tanh(v * 3.2);
    if (opt.partials) {
      v = 0;
      for (const [multiple, gain, phase] of opt.partials) {
        v += Math.sin(2 * Math.PI * freq * multiple * t + phase) * gain;
      }
    }
    const trem = opt.tremolo ? 0.75 + 0.25 * Math.sin(2 * Math.PI * opt.tremolo * t + 0.6) : 1;
    const env = smoothstep(i / ((opt.attack ?? 0.8) * SR)) * smoothstep((len - i) / ((opt.release ?? 1.8) * SR));
    b.l[di] += v * (opt.gain ?? 0.04) * env * trem * pl;
    b.r[di] += v * (opt.gain ?? 0.04) * env * trem * pr;
  }
}

function addNoise(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  let lowL = 0;
  let lowR = 0;
  let slow = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    lowL += ((rand() * 2 - 1) - lowL) * (opt.lowpass ?? 0.003);
    lowR += ((rand() * 2 - 1) - lowR) * (opt.lowpass ?? 0.003);
    slow += ((rand() * 2 - 1) - slow) * (opt.slowpass ?? 0.0002);
    const t = i / SR;
    const env = smoothstep(i / ((opt.attack ?? 5) * SR)) * smoothstep((len - i) / ((opt.release ?? 5) * SR));
    const breathe = 0.78 + 0.22 * Math.sin(2 * Math.PI * (opt.breathe ?? 0.011) * t + 1.1);
    const dust = rand() > (opt.dustThreshold ?? 0.999985) ? (rand() * 2 - 1) * (opt.dust ?? 0.07) : 0;
    b.l[di] += (lowL + slow * 0.58 + dust) * (opt.gain ?? 0.03) * env * breathe * pl;
    b.r[di] += (lowR + slow * 0.48 + dust * 0.42) * (opt.gain ?? 0.03) * env * breathe * pr;
  }
}

function addBell(b, opt) {
  const partials = [
    [1, 0.72, 0.1],
    [2.01, 0.23, 1.2],
    [2.97, 0.13, 2.2],
    [4.16, 0.07, 0.7]
  ];
  addTone(b, { ...opt, type: "sine", partials, attack: opt.attack ?? 0.012, release: opt.release ?? 3.8, drift: opt.drift ?? 0.003 });
}

function addMotifReturn(time, rate, gain, corruption, pan) {
  const base = [146.83, 164.81, 155.56, 123.47, 110.0, 116.54];
  const offsets = [0, 1.05, 2.25, 3.02, 4.36, 5.22];
  for (let i = 0; i < base.length; i += 1) {
    if (corruption > 0.45 && (i === 2 || i === 4) && rand() > 0.35) continue;
    const late = corruption * (i % 2 ? 0.21 : -0.08);
    const freq = base[i] * rate * (1 - corruption * 0.1) * (1 + (rand() - 0.5) * corruption * 0.025);
    addBell(stems.motif, {
      time: time + offsets[i] * (1 + corruption * 0.18) + late,
      length: 5.4 + corruption * 2.2,
      freq,
      freqEnd: freq * (1 - corruption * 0.045),
      gain: gain * (1 - i * 0.035),
      pan: pan + ((i % 3) - 1) * 0.08,
      drift: 0.004 + corruption * 0.014,
      tremolo: corruption > 0.5 ? 0.53 : 0
    });
  }
}

function addVocalApparition(time, length, freq, gain, pan, shape, near) {
  const start = Math.floor(time * SR);
  const len = Math.floor(length * SR);
  const [pl, pr] = panGains(pan);
  const formants = [
    [360, 880, 2300],
    [470, 1080, 2520],
    [610, 1320, 2900],
    [730, 1500, 3180]
  ][shape % 4];
  let breathL = 0;
  let breathR = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    breathL += ((rand() * 2 - 1) - breathL) * 0.017;
    breathR += ((rand() * 2 - 1) - breathR) * 0.012;
    const sag = 1 - p * (0.045 + shape * 0.008);
    let throat = 0;
    for (let h = 1; h <= 10; h += 1) {
      throat += Math.sin(2 * Math.PI * freq * h * sag * t + h * 0.51) / (h * 1.55);
    }
    let mouth = 0;
    for (let f = 0; f < formants.length; f += 1) {
      mouth += Math.sin(2 * Math.PI * formants[f] * (1 + Math.sin(t * 0.2 + f) * 0.002) * t) * [0.035, 0.021, 0.012][f];
    }
    const almostPhrase = 0.7 + 0.3 * Math.sin(2 * Math.PI * (0.083 + shape * 0.011) * t + 0.4);
    const env = smoothstep(i / (5.5 * SR)) * smoothstep((len - i) / (7 * SR));
    const proximity = near ? 1.22 + 0.14 * Math.sin(t * 3.4) : 1;
    stems.voices.l[di] += (throat * 0.31 + mouth + breathL * 0.13) * gain * env * almostPhrase * proximity * pl;
    stems.voices.r[di] += (throat * 0.27 + mouth * 1.08 - breathR * 0.1) * gain * env * almostPhrase * proximity * pr;
  }
}

function addGroundFailure(time, length, freq, gain, pan) {
  const start = Math.floor(time * SR);
  const len = Math.floor(length * SR);
  const [pl, pr] = panGains(pan);
  let grit = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    grit += ((rand() * 2 - 1) - grit) * 0.018;
    const body = Math.sin(2 * Math.PI * freq * (1 - p * 0.55) * t) * Math.exp(-p * 7.8);
    const metal = Math.sin(2 * Math.PI * (freq * 1.73) * t + 0.4) * Math.exp(-p * 12);
    const cable = Math.sin(2 * Math.PI * (freq * 0.21 + 8.5) * t) * Math.exp(-p * 2.6);
    const env = smoothstep(i / (0.014 * SR)) * smoothstep((len - i) / (0.28 * SR));
    const v = (body + metal * 0.13 + cable * 0.34 + grit * 0.08) * gain * env;
    stems.ground.l[di] += v * pl;
    stems.ground.r[di] += v * pr;
  }
}

function highpass(data, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = rc / (rc + dt);
  let y = 0;
  let previous = 0;
  for (let i = 0; i < data.length; i += 1) {
    const x = data[i];
    y = a * (y + x - previous);
    data[i] = y;
    previous = x;
  }
}

function lowpass(data, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < data.length; i += 1) {
    y += (data[i] - y) * a;
    data[i] = y;
  }
}

function filterBus(b, hp, lp) {
  if (hp) {
    highpass(b.l, hp);
    highpass(b.r, hp);
  }
  if (lp) {
    lowpass(b.l, lp);
    lowpass(b.r, lp);
  }
}

function saturateBus(b, drive) {
  const denom = Math.tanh(drive);
  for (let i = 0; i < N; i += 1) {
    b.l[i] = Math.tanh(b.l[i] * drive) / denom;
    b.r[i] = Math.tanh(b.r[i] * drive) / denom;
  }
}

function shiftingRoom(b, amount) {
  const rooms = [
    { start: 0, end: 34, taps: [0.021, 0.058, 0.097], wet: 0.04, width: 0.11 },
    { start: 34, end: 76, taps: [0.21, 0.55, 1.15, 2.1], wet: 0.066, width: 0.82 },
    { start: 76, end: 129, taps: [0.36, 0.91, 1.94, 3.52, 5.7], wet: 0.062, width: 1.18 },
    { start: 129, end: 166, taps: [0.05, 0.18, 0.49, 0.97], wet: 0.048, width: 0.36 },
    { start: 166, end: 204, taps: [0.7, 1.4, 2.9, 5.8, 8.1], wet: 0.05, width: 1.25 }
  ];
  for (const room of rooms) {
    const s = Math.floor(room.start * SR);
    const e = Math.min(N, Math.floor(room.end * SR));
    for (const tap of room.taps) {
      const d = Math.floor(tap * SR);
      for (let i = Math.max(s + d, d); i < e; i += 1) {
        const t = i / SR;
        const wet = room.wet * amount * (0.55 + 0.45 * Math.sin(t * 0.012 + tap * 2.7));
        const left = b.l[i - d];
        const right = b.r[i - d];
        b.l[i] += (right * room.width + left * (1 - room.width) * 0.15) * wet;
        b.r[i] += (left * room.width + right * (1 - room.width) * 0.15) * wet;
      }
    }
  }
}

function driftStereo(b, depth) {
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const mid = (b.l[i] + b.r[i]) * 0.5;
    const side = (b.l[i] - b.r[i]) * 0.5;
    const width = 0.72 + depth * (0.5 + 0.5 * Math.sin(t * 0.019 + Math.sin(t * 0.004) * 2.5));
    const lean = Math.sin(t * 0.023 + 1.2) * depth * 0.075;
    b.l[i] = mid * (1 - lean) + side * width;
    b.r[i] = mid * (1 + lean) - side * width;
  }
}

function crossDelay(b, leftSeconds, rightSeconds, wet) {
  const dl = Math.max(1, Math.floor(leftSeconds * SR));
  const dr = Math.max(1, Math.floor(rightSeconds * SR));
  for (let i = N - 1; i >= Math.max(dl, dr); i -= 1) {
    b.l[i] += b.r[i - dl] * wet;
    b.r[i] += b.l[i - dr] * wet;
  }
}

function scaleBus(b, gain) {
  for (let i = 0; i < N; i += 1) {
    b.l[i] *= gain;
    b.r[i] *= gain;
  }
}

function sumBuses(buses) {
  const l = new Float32Array(N);
  const r = new Float32Array(N);
  for (const b of buses) {
    for (let i = 0; i < N; i += 1) {
      l[i] += b.l[i];
      r[i] += b.r[i];
    }
  }
  return { name: "master", l, r };
}

function metrics(b) {
  let peak = 0;
  let sum = 0;
  let monoPeak = 0;
  let lr = 0;
  let ll = 0;
  let rr = 0;
  for (let i = 0; i < N; i += 1) {
    const l = b.l[i];
    const r = b.r[i];
    const mono = (l + r) * 0.5;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    monoPeak = Math.max(monoPeak, Math.abs(mono));
    sum += l * l + r * r;
    lr += l * r;
    ll += l * l;
    rr += r * r;
  }
  return {
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(sum / (N * 2)).toFixed(4)),
    monoPeak: Number(monoPeak.toFixed(4)),
    correlation: Number((lr / Math.sqrt(Math.max(ll * rr, 1e-12))).toFixed(4))
  };
}

function writeWav24(file, b) {
  const dataBytes = N * 2 * 3;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2 * 3, 28);
  out.writeUInt16LE(2 * 3, 32);
  out.writeUInt16LE(24, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
  let p = 44;
  for (let i = 0; i < N; i += 1) {
    const l = Math.round(clamp(b.l[i], -1, 0.999999) * 8388607);
    const r = Math.round(clamp(b.r[i], -1, 0.999999) * 8388607);
    out.writeIntLE(l, p, 3);
    out.writeIntLE(r, p + 3, 3);
    p += 6;
  }
  fs.writeFileSync(file, out);
}

function ffprobe(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_name,sample_rate,channels,bits_per_sample",
    "-of", "json",
    file
  ], { encoding: "utf8" });
  return { status: result.status, json: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

function ebur128(file) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", file,
    "-filter_complex", "ebur128=peak=true",
    "-f", "null",
    "-"
  ], { encoding: "utf8" });
  return { status: result.status, stderrTail: (result.stderr || "").split(/\r?\n/).slice(-24).join("\n") };
}

for (const event of [
  [6, 0.96, 0.062, 0.0],
  [31.4, 0.88, 0.052, -0.18],
  [57.9, 0.74, 0.047, 0.21],
  [88.3, 0.59, 0.054, -0.11],
  [124.2, 0.43, 0.056, 0.16],
  [166.4, 0.31, 0.039, -0.04]
]) {
  const [time, rate, gain, pan] = event;
  addMotifReturn(time, rate, gain, Math.max(0, (time - 20) / 150), pan);
}

addNoise(stems.horizon, { time: 0, length: DURATION, gain: 0.035, lowpass: 0.0012, slowpass: 0.00008, attack: 9, release: 12, breathe: 0.009, dustThreshold: 0.99999, pan: -0.12 });
for (const [time, length, freq, gain, pan] of [
  [0, DURATION, 59.94, 0.018, 0],
  [18, 178, 119.88, 0.007, -0.15],
  [46, 116, 183.2, 0.005, 0.22],
  [99, 82, 244.1, 0.004, -0.32]
]) {
  addTone(stems.horizon, { time, length, freq, freqEnd: freq * 0.991, gain, pan, attack: 9, release: 10, tremolo: 0.022, type: "softsquare" });
}

for (const [time, length, freq, end, gain] of [
  [25, 31, 37, 33, 0.036],
  [64, 44, 33, 27, 0.048],
  [115, 39, 29, 23, 0.052],
  [176, 19, 24, 30, 0.092]
]) {
  addTone(stems.pressure, { time, length, freq, freqEnd: end, gain, pan: 0, attack: 8, release: 9, tremolo: 0.047, type: "sine2" });
}
for (let t = 0; t < DURATION; t += 1 / SR) {
  if (t < 160 || t > 172) continue;
  const i = Math.floor(t * SR);
  const edge = Math.min(smoothstep((t - 160) / 2.6), smoothstep((172 - t) / 2.6));
  stems.pressure.l[i] *= 1 - edge * 0.97;
  stems.pressure.r[i] *= 1 - edge * 0.97;
}

for (const event of [
  [42, 19, 132, 0.032, -0.76, 0, false],
  [61, 23, 176, 0.034, 0.68, 1, true],
  [94, 30, 99, 0.044, -0.38, 2, true],
  [132, 34, 82, 0.049, 0.42, 3, true],
  [170, 24, 147, 0.038, -0.62, 1, true]
]) {
  addVocalApparition(...event);
}

for (const [time, length, freq, gain, pan] of [
  [52, 76, 313, 0.007, -0.26],
  [58, 66, 421, 0.006, 0.31],
  [71, 59, 509, 0.0055, -0.48],
  [100, 48, 761, 0.0048, 0.39],
  [136, 37, 997, 0.004, -0.12]
]) {
  addTone(stems.lab, { time, length, freq, freqEnd: freq * 0.986, gain, pan, attack: 7, release: 10, tremolo: 0.058, type: "tri" });
}
for (const [time, freq, length, gain, pan] of [
  [33.6, 1462, 0.72, 0.014, -0.55],
  [69.4, 1530, 0.54, 0.016, 0.47],
  [103.8, 1321, 0.86, 0.018, -0.04],
  [139.2, 1668, 0.64, 0.017, 0.58],
  [181.6, 1190, 1.2, 0.021, -0.22]
]) {
  addTone(stems.lab, { time, length, freq, freqEnd: freq * 0.981, gain, pan, attack: 0.008, release: 0.06, tremolo: 7.1, type: "sine2" });
}

for (const [time, length, freq, gain, pan] of [
  [18.6, 0.9, 54, 0.052, -0.28],
  [38.2, 1.4, 45, 0.073, 0.22],
  [59.7, 1.0, 73, 0.046, -0.47],
  [83.1, 1.5, 39, 0.078, 0.36],
  [108.8, 1.2, 34, 0.084, -0.08],
  [137.4, 1.6, 31, 0.088, 0.51],
  [174.7, 1.9, 27, 0.115, 0.02],
  [191.5, 1.1, 69, 0.052, -0.52]
]) {
  addGroundFailure(time, length, freq, gain, pan);
}

for (let i = 0; i < 29; i += 1) {
  const time = 35 + i * 4.8 + (rand() - 0.5) * 1.2;
  const freq = 410 + rand() * 620;
  addTone(stems.wires, { time, length: 5.5 + rand() * 6.5, freq, freqEnd: freq * (0.92 - rand() * 0.06), gain: 0.006 + rand() * 0.006, pan: rand() * 1.8 - 0.9, attack: 1.2, release: 3.5, drift: 0.015, type: "tri" });
}

addNoise(stems.void, { time: 76, length: 128, gain: 0.023, lowpass: 0.00075, slowpass: 0.00005, attack: 16, release: 18, breathe: 0.006, dustThreshold: 0.999995, pan: 0.18 });
for (const [time, length, freq, gain, pan] of [
  [79, 48, 73.42, 0.011, -0.32],
  [112, 58, 92.5, 0.01, 0.27],
  [151, 38, 61.74, 0.012, -0.08]
]) {
  addTone(stems.void, { time, length, freq, freqEnd: freq * 0.86, gain, pan, attack: 10, release: 12, drift: 0.009, type: "tri" });
}

filterBus(stems.motif, 70, 4600);
filterBus(stems.horizon, 26, 1350);
filterBus(stems.pressure, 18, 170);
filterBus(stems.voices, 125, 4100);
filterBus(stems.lab, 180, 5600);
filterBus(stems.ground, 24, 1850);
filterBus(stems.wires, 220, 4800);
filterBus(stems.void, 30, 2300);

shiftingRoom(stems.motif, 0.72);
shiftingRoom(stems.horizon, 0.46);
shiftingRoom(stems.voices, 1.08);
shiftingRoom(stems.lab, 0.42);
shiftingRoom(stems.ground, 0.3);
shiftingRoom(stems.wires, 0.98);
shiftingRoom(stems.void, 1.18);

driftStereo(stems.motif, 0.2);
driftStereo(stems.horizon, 0.34);
driftStereo(stems.voices, 0.88);
driftStereo(stems.lab, 0.46);
driftStereo(stems.wires, 0.92);
driftStereo(stems.void, 0.78);

crossDelay(stems.motif, 0.019, 0.031, 0.08);
crossDelay(stems.voices, 0.006, 0.028, 0.18);
crossDelay(stems.lab, 0.012, 0.039, 0.1);
crossDelay(stems.wires, 0.041, 0.073, 0.22);
crossDelay(stems.void, 0.12, 0.18, 0.06);

saturateBus(stems.motif, 1.24);
saturateBus(stems.horizon, 1.08);
saturateBus(stems.voices, 1.4);
saturateBus(stems.lab, 1.12);
saturateBus(stems.ground, 1.25);
saturateBus(stems.wires, 1.32);
saturateBus(stems.void, 1.18);

const allStems = Object.values(stems);
let master = sumBuses(allStems);
const pre = metrics(master);
const masterGain = 0.79 / Math.max(pre.peak, 0.001);
for (const b of allStems) scaleBus(b, masterGain);
master = sumBuses(allStems);
filterBus(master, 18, 15000);
saturateBus(master, 1.045);
const post = metrics(master);
const limiterGain = post.peak > 0.84 ? 0.84 / post.peak : 1;
if (limiterGain < 1) {
  for (const b of allStems) scaleBus(b, limiterGain);
  master = sumBuses(allStems);
}
for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const fadeIn = smoothstep(t / 4);
  const fadeOut = t > DURATION - 12 ? smoothstep((DURATION - t) / 12) : 1;
  master.l[i] *= fadeIn * fadeOut;
  master.r[i] *= fadeIn * fadeOut;
}
const masterStats = metrics(master);
if (masterStats.peak > 0.966) throw new Error(`Master peak ${masterStats.peak} exceeds -0.3 dBFS ceiling.`);

const stemReports = [];
for (const b of allStems) {
  const stemPath = path.join(stemDir, `${b.name}.wav`);
  writeWav24(stemPath, b);
  stemReports.push({ name: b.name, path: stemPath, ...metrics(b), probe: ffprobe(stemPath) });
}
writeWav24(outWav, master);
fs.copyFileSync(outWav, stagingWav);

const mp3 = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outWav, "-codec:a", "libmp3lame", "-b:a", "320k", outMp3], { encoding: "utf8" });
if (mp3.status !== 0) throw new Error(`ffmpeg MP3 encode failed: ${mp3.stderr || mp3.stdout}`);

fs.writeFileSync(outAttr, [
  title,
  "",
  "Original procedural track rendered offline by the Ableton MCP project.",
  "No external source samples were used. This is not a remix, not a revision, and not derived from the previous ballroom/vocal renders.",
  "No Ableton UI/mouse control, LiveAPI writes, plugin installs, downloads, arbitrary URL fetches, YouTube/SoundCloud ripping, or real subliminal/coercive commands were used.",
  "",
  "Composition notes:",
  "- Original six-note dead-road motif synthesized with bell partials and corrupted on each return.",
  "- Synthetic nonverbal vocal apparitions use formant tones and breath noise only; no words or instructions are present.",
  "- The classified experiment tone is fictional sound design: lab chirps, unstable room reflections, sub-pressure contrast, and empty-field ambience.",
  "- Low end is mono-centered. Wide movement is limited to voices, wire resonance, and void tails.",
  ""
].join("\n"));

const report = {
  ok: true,
  title,
  slug,
  durationSeconds: DURATION,
  sampleRate: SR,
  bitDepth: 24,
  sourceSamplesUsed: 0,
  safety: {
    abletonWrites: false,
    uiMouseControl: false,
    downloads: false,
    arbitraryUrlFetch: false,
    subliminalCommands: false
  },
  outputs: {
    masterWav: outWav,
    masterMp3: outMp3,
    stagingMaster: stagingWav,
    attribution: outAttr,
    verificationReport: outReport,
    stemDirectory: stemDir
  },
  master: { ...masterStats, probe: ffprobe(outWav), loudness: ebur128(outWav) },
  stems: stemReports,
  verificationCommands: [
    "node scripts/render-the-road-has-no-horizon.mjs",
    `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${outWav}`,
    `ffmpeg -hide_banner -nostats -i ${outWav} -filter_complex ebur128=peak=true -f null -`
  ]
};

fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
fs.copyFileSync(outReport, stagingReport);
console.log(JSON.stringify(report, null, 2));
