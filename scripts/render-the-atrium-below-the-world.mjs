/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const slug = "the-atrium-below-the-world";
const title = "The Atrium Below The World";
const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const DURATION = 192;
const N = DURATION * SR;
let seed = 0x47a9b31d;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const outReport = path.join(downloads, `${slug}-verification.json`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);
const stagingReport = path.join(renderRoot, `${slug}-verification.json`);

const stems = {
  chords: bus("vapor-mall-chords"),
  motif: bus("underwater-mallet-memory"),
  pa: bus("submerged-pa-memory"),
  pads: bus("alien-atrium-pads"),
  choir: bus("nordic-choir-horn-shadows"),
  pressure: bus("deep-pressure-mono"),
  ambience: bus("mall-ambience-current"),
  metal: bus("dead-escalator-metal-details"),
  bloom: bus("final-atrium-bloom")
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

function midiToFreq(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function db(value) {
  return value <= 0 ? -120 : 20 * Math.log10(value);
}

function addTone(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.max(1, Math.floor(opt.length * SR));
  const [pl, pr] = panGains(opt.pan ?? 0);
  let phase = opt.phase ?? 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const t = i / SR;
    const drift = 1
      + Math.sin((opt.time + t) * (opt.driftRate ?? 0.019)) * (opt.drift ?? 0)
      + Math.sin((opt.time + t) * (opt.flutterRate ?? 2.9)) * (opt.flutter ?? 0);
    const freq = (opt.freq + ((opt.freqEnd ?? opt.freq) - opt.freq) * p) * drift;
    phase += 2 * Math.PI * freq / SR;
    let v = Math.sin(phase);
    if (opt.type === "tri") v = Math.asin(Math.sin(phase)) * 2 / Math.PI;
    if (opt.type === "softsquare") v = Math.tanh(Math.sin(phase) * 2.6);
    if (opt.type === "epiano") {
      v = Math.sin(phase) * 0.52
        + Math.sin(phase * 2.01 + 0.4) * 0.24
        + Math.sin(phase * 3.98 + 1.7) * 0.1
        + Math.sin(phase * 6.02 + 0.9) * 0.038;
      v = Math.tanh(v * 1.45);
    }
    if (opt.type === "mallet") {
      v = Math.sin(phase) * 0.48
        + Math.sin(phase * 2.41 + 0.3) * 0.23
        + Math.sin(phase * 3.91 + 1.8) * 0.13
        + Math.sin(phase * 6.7 + 0.2) * 0.07;
      v *= 1 - p * 0.42;
    }
    if (opt.type === "pad") {
      v = Math.sin(phase) * 0.34
        + Math.sin(phase * 0.501 + 1.4) * 0.22
        + Math.sin(phase * 1.997 + 0.8) * 0.16
        + Math.sin(phase * 3.003 + 2.2) * 0.08;
      v = Math.tanh(v * 1.2);
    }
    if (opt.type === "horn") {
      v = Math.sin(phase) * 0.46
        + Math.sin(phase * 2 + 0.1) * 0.18
        + Math.sin(phase * 3 + 1.1) * 0.08;
      v = Math.tanh(v * 1.55);
    }
    const trem = opt.tremolo ? 0.72 + 0.28 * Math.sin(2 * Math.PI * opt.tremolo * t + 0.6) : 1;
    const env = smoothstep(i / ((opt.attack ?? 0.8) * SR)) * smoothstep((len - i) / ((opt.release ?? 1.8) * SR));
    b.l[di] += v * (opt.gain ?? 0.04) * env * trem * pl;
    b.r[di] += v * (opt.gain ?? 0.04) * env * trem * pr;
  }
}

function addNoise(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.max(1, Math.floor(opt.length * SR));
  const [pl, pr] = panGains(opt.pan ?? 0);
  let lowL = 0;
  let lowR = 0;
  let slow = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    lowL += ((rand() * 2 - 1) - lowL) * (opt.lowpass ?? 0.002);
    lowR += ((rand() * 2 - 1) - lowR) * (opt.lowpass ?? 0.002);
    slow += ((rand() * 2 - 1) - slow) * (opt.slowpass ?? 0.0001);
    const env = smoothstep(i / ((opt.attack ?? 5) * SR)) * smoothstep((len - i) / ((opt.release ?? 5) * SR));
    const breathe = 0.78 + 0.22 * Math.sin(2 * Math.PI * (opt.breathe ?? 0.012) * t + 1.2);
    const scar = rand() > (opt.scarThreshold ?? 0.99999) ? (rand() * 2 - 1) * (opt.scar ?? 0.04) : 0;
    const pulse = opt.pulse ? Math.sin(2 * Math.PI * opt.pulse * t) * 0.08 : 0;
    b.l[di] += (lowL + slow * 0.62 + scar + pulse) * (opt.gain ?? 0.03) * env * breathe * pl;
    b.r[di] += (lowR + slow * 0.48 + scar * 0.38 - pulse * 0.6) * (opt.gain ?? 0.03) * env * breathe * pr;
  }
}

function addChord(time, notes, length, gain, section) {
  const spread = [-0.22, -0.08, 0.06, 0.18, 0.28, -0.15];
  notes.forEach((note, i) => {
    const freq = midiToFreq(note);
    addTone(stems.chords, {
      time: time + i * 0.045,
      length,
      freq,
      freqEnd: freq * (0.997 - section * 0.0007),
      gain: gain * (i === 0 ? 0.82 : 1 - i * 0.045),
      pan: spread[i % spread.length],
      attack: 1.7 + section * 0.15,
      release: 4.8,
      drift: 0.003 + section * 0.0014,
      flutter: 0.0007 + section * 0.0002,
      tremolo: 0.045,
      type: "epiano"
    });
    addTone(stems.pads, {
      time: time + 0.18 + i * 0.02,
      length: length + 4.5,
      freq: freq * 0.5,
      freqEnd: freq * (0.493 - section * 0.001),
      gain: gain * 0.25,
      pan: -spread[i % spread.length],
      attack: 6.5,
      release: 8.5,
      drift: 0.006 + section * 0.001,
      type: "pad"
    });
  });
}

function addMalletMotif(time, rate, gain, corruption, pan) {
  const motif = [66, 69, 73, 71, 64, 68, 61];
  const offsets = [0, 1.45, 2.7, 4.1, 5.2, 6.55, 8.35];
  for (let i = 0; i < motif.length; i += 1) {
    if (corruption > 0.42 && (i === 2 || i === 5) && rand() > 0.28) continue;
    const late = corruption * (i % 2 ? 0.34 : -0.11);
    const freq = midiToFreq(motif[i] - Math.floor(corruption * 2)) * rate * (1 + (rand() - 0.5) * corruption * 0.022);
    addTone(stems.motif, {
      time: time + offsets[i] * (1 + corruption * 0.09) + late,
      length: 5.2 + corruption * 2.4,
      freq,
      freqEnd: freq * (1 - corruption * 0.037),
      gain: gain * (1 - i * 0.04),
      pan: pan + ((i % 4) - 1.5) * 0.08,
      attack: corruption > 0.62 ? 0.24 : 0.018,
      release: 4.6 + corruption * 1.8,
      drift: 0.002 + corruption * 0.009,
      flutter: 0.0008 + corruption * 0.002,
      tremolo: corruption > 0.5 ? 0.21 : 0,
      type: "mallet"
    });
  }
}

function addVowelCloud(time, length, base, gain, pan, shape) {
  const formants = [
    [360, 820, 2200],
    [470, 1050, 2460],
    [590, 1280, 2800],
    [720, 1480, 3100]
  ][shape % 4];
  for (let i = 0; i < 3; i += 1) {
    addTone(stems.choir, {
      time: time + i * 0.85,
      length: length + i * 2.2,
      freq: base * (1 + i * 0.5),
      freqEnd: base * (1 + i * 0.5) * 0.984,
      gain: gain * [0.52, 0.24, 0.14][i],
      pan: pan + (i - 1) * 0.18,
      attack: 7.5,
      release: 8.5,
      drift: 0.012,
      tremolo: 0.035 + i * 0.011,
      type: "pad"
    });
    addTone(stems.choir, {
      time: time + i * 0.7,
      length: length * 0.82,
      freq: formants[i] * 0.25,
      freqEnd: formants[i] * 0.247,
      gain: gain * 0.11,
      pan: -pan + (i - 1) * 0.11,
      attack: 5.5,
      release: 7,
      drift: 0.008,
      type: "tri"
    });
  }
}

function addPaMemory(time, length, pitch, gain, pan) {
  addTone(stems.pa, {
    time,
    length,
    freq: pitch,
    freqEnd: pitch * 0.992,
    gain,
    pan,
    attack: 3.2,
    release: 4.8,
    drift: 0.018,
    flutter: 0.003,
    tremolo: 0.09,
    type: "softsquare"
  });
  addNoise(stems.pa, {
    time: time + 0.2,
    length,
    gain: gain * 0.18,
    lowpass: 0.006,
    slowpass: 0.00025,
    attack: 2,
    release: 4,
    scarThreshold: 0.99996,
    scar: 0.025,
    pan: -pan
  });
}

function addBubblePulse(time, gain, pan) {
  for (let i = 0; i < 5; i += 1) {
    const f = 520 + rand() * 880;
    addTone(stems.ambience, {
      time: time + i * (0.11 + rand() * 0.09),
      length: 0.16 + rand() * 0.18,
      freq: f,
      freqEnd: f * (0.55 + rand() * 0.22),
      gain: gain * (0.7 + rand() * 0.4),
      pan: pan + rand() * 0.34 - 0.17,
      attack: 0.004,
      release: 0.13,
      type: "sine"
    });
  }
}

function addMetal(time, gain, pan) {
  addTone(stems.metal, {
    time,
    length: 4.4 + rand() * 3.6,
    freq: 92 + rand() * 80,
    freqEnd: 28 + rand() * 28,
    gain,
    pan,
    attack: 0.02,
    release: 3.8,
    drift: 0.01,
    type: "tri"
  });
  addNoise(stems.metal, {
    time: time + 0.04,
    length: 2.4 + rand() * 2.8,
    gain: gain * 0.34,
    lowpass: 0.006,
    slowpass: 0.00045,
    attack: 0.015,
    release: 1.9,
    scarThreshold: 0.9995,
    scar: 0.08,
    pan: -pan * 0.4
  });
}

function onePoleLowpass(arr, cutoff) {
  const x = Math.exp(-2 * Math.PI * cutoff / SR);
  let y = 0;
  for (let i = 0; i < arr.length; i += 1) {
    y = (1 - x) * arr[i] + x * y;
    arr[i] = y;
  }
}

function highpass(arr, cutoff) {
  const x = Math.exp(-2 * Math.PI * cutoff / SR);
  let low = 0;
  for (let i = 0; i < arr.length; i += 1) {
    low = (1 - x) * arr[i] + x * low;
    arr[i] -= low;
  }
}

function filterBus(b, hp, lp) {
  highpass(b.l, hp);
  highpass(b.r, hp);
  onePoleLowpass(b.l, lp);
  onePoleLowpass(b.r, lp);
}

function crossDelay(b, leftSeconds, rightSeconds, gain) {
  const dl = Math.floor(leftSeconds * SR);
  const dr = Math.floor(rightSeconds * SR);
  for (let i = Math.max(dl, dr); i < N; i += 1) {
    const addL = b.r[i - dr] * gain;
    const addR = b.l[i - dl] * gain;
    b.l[i] += addL;
    b.r[i] += addR;
  }
}

function roomBloom(b, amount) {
  const taps = [
    [0.19, 0.23, 0.28],
    [0.47, 0.39, 0.18],
    [0.91, 1.13, 0.12],
    [1.77, 1.41, 0.07]
  ];
  for (const [l, r, g] of taps) crossDelay(b, l, r, amount * g);
}

function spatialDrift(b, amount) {
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const mid = (b.l[i] + b.r[i]) * 0.5;
    const side = (b.l[i] - b.r[i]) * 0.5;
    const width = 1 + Math.sin(t * 0.029 + 0.7) * amount + Math.sin(t * 0.006) * amount * 0.6;
    const pan = Math.sin(t * 0.011 + 1.8) * amount * 0.18;
    b.l[i] = mid * (1 - pan) + side * width;
    b.r[i] = mid * (1 + pan) - side * width;
  }
}

function saturateBus(b, drive) {
  for (let i = 0; i < N; i += 1) {
    b.l[i] = Math.tanh(b.l[i] * drive) / drive;
    b.r[i] = Math.tanh(b.r[i] * drive) / drive;
  }
}

function multiplyRange(b, startSeconds, endSeconds, gain) {
  const start = Math.max(0, Math.floor(startSeconds * SR));
  const end = Math.min(N, Math.floor(endSeconds * SR));
  for (let i = start; i < end; i += 1) {
    const p = (i - start) / Math.max(1, end - start);
    const edge = smoothstep(Math.min(p * 3, (1 - p) * 3));
    const m = 1 - edge * (1 - gain);
    b.l[i] *= m;
    b.r[i] *= m;
  }
}

function mixBuses(buses) {
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

function applyGain(buses, gain) {
  for (const b of buses) {
    for (let i = 0; i < N; i += 1) {
      b.l[i] *= gain;
      b.r[i] *= gain;
    }
  }
}

function metrics(b) {
  let peak = 0;
  let sum = 0;
  let sumL = 0;
  let sumR = 0;
  let sumLR = 0;
  let monoPeak = 0;
  for (let i = 0; i < N; i += 1) {
    const l = b.l[i];
    const r = b.r[i];
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    const mono = (l + r) * 0.5;
    monoPeak = Math.max(monoPeak, Math.abs(mono));
    sum += l * l + r * r;
    sumL += l * l;
    sumR += r * r;
    sumLR += l * r;
  }
  const rms = Math.sqrt(sum / Math.max(1, N * 2));
  const corr = sumL > 0 && sumR > 0 ? sumLR / Math.sqrt(sumL * sumR) : 0;
  return {
    samplePeak: Number(peak.toFixed(6)),
    samplePeakDb: Number(db(peak).toFixed(2)),
    rms: Number(rms.toFixed(6)),
    rmsDb: Number(db(rms).toFixed(2)),
    monoPeak: Number(monoPeak.toFixed(6)),
    monoPeakDb: Number(db(monoPeak).toFixed(2)),
    stereoCorrelation: Number(corr.toFixed(4))
  };
}

function writeWav24(file, b) {
  const bytesPerFrame = 6;
  const dataBytes = N * bytesPerFrame;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * bytesPerFrame, 28);
  out.writeUInt16LE(bytesPerFrame, 32);
  out.writeUInt16LE(24, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < N; i += 1) {
    for (const sample of [b.l[i], b.r[i]]) {
      let v = Math.round(clamp(sample, -1, 1) * 8388607);
      if (v < 0) v += 16777216;
      out.writeUIntLE(v, offset, 3);
      offset += 3;
    }
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
  return {
    ok: result.status === 0,
    command: `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${file}`,
    ...(result.stdout ? JSON.parse(result.stdout) : {}),
    ...(result.status === 0 ? {} : { error: result.stderr })
  };
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
  const text = `${result.stdout}\n${result.stderr}`;
  const integrated = [...text.matchAll(/I:\s*(-?\d+(?:\.\d+)?) LUFS/g)].pop()?.[1];
  const truePeak = [...text.matchAll(/Peak:\s*(-?\d+(?:\.\d+)?) dBFS/g)].pop()?.[1];
  return {
    ok: result.status === 0,
    command: `ffmpeg -hide_banner -nostats -i ${file} -filter_complex ebur128=peak=true -f null -`,
    integratedLufs: integrated ? Number(integrated) : null,
    truePeakDbfs: truePeak ? Number(truePeak) : null,
    ...(result.status === 0 ? {} : { error: result.stderr })
  };
}

const progressionA = [
  [42, 49, 56, 60, 64, 68],
  [38, 45, 54, 57, 61, 66],
  [45, 52, 56, 61, 64, 69],
  [40, 47, 54, 59, 62, 66]
];
const progressionB = [
  [42, 49, 57, 60, 65],
  [35, 42, 50, 57, 61],
  [47, 54, 59, 62, 66],
  [41, 48, 56, 59, 64]
];

for (let section = 0; section < 6; section += 1) {
  const base = section * 32;
  const progression = section < 3 ? progressionA : progressionB;
  for (let bar = 0; bar < 4; bar += 1) {
    addChord(base + bar * 8, progression[(bar + (section > 3 ? 1 : 0)) % progression.length], 9.4, 0.043 + section * 0.002, section);
  }
}

for (const item of [
  [8, 0.5, 0.047, 0.05],
  [30, 0.5, 0.041, -0.18],
  [50, 0.5, 0.043, 0.2],
  [73, 0.5, 0.038, -0.3],
  [95, 0.5, 0.035, 0.22],
  [118, 0.495, 0.034, -0.16],
  [141, 0.49, 0.032, 0.28],
  [166, 0.48, 0.03, -0.24]
]) addMalletMotif(item[0], item[1], item[2], item[0] / DURATION, item[3]);

for (const item of [
  [4, 27, 164.81, 0.018, -0.28],
  [38, 24, 146.83, 0.017, 0.25],
  [70, 26, 196.0, 0.016, -0.15],
  [102, 31, 123.47, 0.018, 0.22],
  [134, 30, 110.0, 0.019, -0.3],
  [162, 23, 98.0, 0.017, 0.14]
]) addPaMemory(item[0], item[1], item[2], item[3], item[4]);

for (const item of [
  [32, 40, 73.42, 0.052, -0.2, 0],
  [66, 44, 82.41, 0.049, 0.25, 1],
  [101, 48, 61.74, 0.054, -0.1, 2],
  [132, 52, 55.0, 0.061, 0.18, 3],
  [158, 30, 49.0, 0.048, -0.25, 1]
]) addVowelCloud(item[0], item[1], item[2], item[3], item[4], item[5]);

addNoise(stems.ambience, { time: 0, length: DURATION, gain: 0.028, lowpass: 0.0011, slowpass: 0.00006, attack: 8, release: 12, breathe: 0.008, scarThreshold: 0.999995, pan: -0.08 });
for (const f of [58.9, 119.8, 177.6, 239.4]) {
  addTone(stems.ambience, { time: 0, length: DURATION, freq: f, freqEnd: f * 0.998, gain: f < 80 ? 0.009 : 0.0038, attack: 10, release: 12, pan: rand() * 0.6 - 0.3, type: "tri" });
}
for (let t = 34; t < 162; t += 7.3 + rand() * 5.2) addBubblePulse(t, 0.014 + rand() * 0.011, rand() * 1.5 - 0.75);

for (const f of [31, 38, 46]) {
  addTone(stems.pressure, { time: 24 + rand() * 12, length: 132 + rand() * 22, freq: f, freqEnd: f * 0.84, gain: 0.028, attack: 13, release: 14, pan: 0, type: "tri", tremolo: 0.018 });
}
multiplyRange(stems.pressure, 151, 164, 0.05);
addTone(stems.pressure, { time: 170, length: 17.5, freq: 34, freqEnd: 24, gain: 0.088, attack: 4.2, release: 9, pan: 0, type: "tri" });

for (const t of [27, 45, 61, 82, 108, 126, 147, 168, 184]) addMetal(t + rand() * 1.7, 0.042 + rand() * 0.025, rand() * 1.1 - 0.55);

for (const item of [
  [123, 45, 36.71, 0.02, -0.25],
  [132, 39, 55.0, 0.017, 0.22],
  [144, 35, 73.42, 0.014, -0.08],
  [169, 21, 49.0, 0.026, 0.18],
  [176, 14, 98.0, 0.018, -0.2]
]) {
  addTone(stems.bloom, { time: item[0], length: item[1], freq: item[2], freqEnd: item[2] * 0.982, gain: item[3], pan: item[4], attack: 7, release: 9, drift: 0.012, type: "pad" });
  addTone(stems.bloom, { time: item[0] + 1.7, length: item[1] * 0.72, freq: item[2] * 1.5, freqEnd: item[2] * 1.47, gain: item[3] * 0.38, pan: -item[4], attack: 5, release: 7, drift: 0.009, type: "horn" });
}

filterBus(stems.chords, 65, 4200);
filterBus(stems.motif, 120, 6200);
filterBus(stems.pa, 160, 3100);
filterBus(stems.pads, 35, 2600);
filterBus(stems.choir, 115, 3600);
filterBus(stems.pressure, 18, 160);
filterBus(stems.ambience, 28, 5200);
filterBus(stems.metal, 65, 4100);
filterBus(stems.bloom, 45, 3300);

roomBloom(stems.chords, 0.22);
roomBloom(stems.motif, 0.38);
roomBloom(stems.pa, 0.31);
roomBloom(stems.pads, 0.52);
roomBloom(stems.choir, 0.62);
roomBloom(stems.ambience, 0.18);
roomBloom(stems.metal, 0.16);
roomBloom(stems.bloom, 0.48);
crossDelay(stems.motif, 0.37, 0.51, 0.12);
crossDelay(stems.pa, 0.73, 0.59, 0.08);
crossDelay(stems.choir, 1.21, 1.49, 0.08);
crossDelay(stems.bloom, 0.91, 1.31, 0.09);

spatialDrift(stems.chords, 0.12);
spatialDrift(stems.motif, 0.35);
spatialDrift(stems.pa, 0.28);
spatialDrift(stems.pads, 0.42);
spatialDrift(stems.choir, 0.5);
spatialDrift(stems.ambience, 0.44);
spatialDrift(stems.metal, 0.26);
spatialDrift(stems.bloom, 0.38);

saturateBus(stems.chords, 1.22);
saturateBus(stems.motif, 1.14);
saturateBus(stems.pa, 1.28);
saturateBus(stems.pads, 1.12);
saturateBus(stems.choir, 1.2);
saturateBus(stems.pressure, 1.08);
saturateBus(stems.ambience, 1.18);
saturateBus(stems.metal, 1.31);
saturateBus(stems.bloom, 1.16);

const allStems = Object.values(stems);
let master = mixBuses(allStems);
const rawPeak = metrics(master).samplePeak;
const masterGain = rawPeak > 0 ? clamp(0.86 / rawPeak, 0.35, 6.0) : 1;
applyGain(allStems, masterGain);
master = mixBuses(allStems);

const stemReports = [];
for (const b of allStems) {
  const stemPath = path.join(stemDir, `${b.name}.wav`);
  writeWav24(stemPath, b);
  stemReports.push({ name: b.name, path: stemPath, ...metrics(b), probe: ffprobe(stemPath) });
}

writeWav24(outWav, master);
fs.copyFileSync(outWav, stagingWav);
const mp3 = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outWav, "-codec:a", "libmp3lame", "-b:a", "320k", outMp3], { encoding: "utf8" });
if (mp3.status !== 0) throw new Error(`ffmpeg mp3 render failed: ${mp3.stderr}`);

fs.writeFileSync(outAttr, [
  `${title}`,
  "",
  "Source policy: procedural synthesis only.",
  "External samples used: 0.",
  "Previous masters, stems, ballroom sources, vocal sources, and Mall at the End of Sleep source files are not used.",
  "Game references are mood references only. No copied melodies, motifs, samples, sound effects, or copyrighted source material are used.",
  "",
  "Concept: 1980s mallcore slowed vaporwave under a flooded impossible atrium, with underwater mallet memories, alien-cavern pads, subtle cold choral/horn shadows, and controlled deep pressure.",
  "",
  "Generated by scripts/render-the-atrium-below-the-world.mjs."
].join("\n"));

const masterStats = metrics(master);
const loudness = ebur128(outWav);
const report = {
  ok: masterStats.samplePeakDb <= -0.3,
  title,
  slug,
  durationSeconds: DURATION,
  sampleRate: SR,
  bitDepth: 24,
  channels: 2,
  bpmReference: 62,
  sourceSamplesUsed: 0,
  sourcePolicy: "procedural_only",
  safety: {
    abletonWrites: false,
    uiMouseControl: false,
    downloads: false,
    arbitraryUrlFetch: false,
    subliminalCommands: false,
    copiedGameMaterial: false
  },
  outputs: {
    wav: outWav,
    mp3: outMp3,
    attribution: outAttr,
    verificationReport: outReport,
    stagingWav,
    stagingReport,
    stemsDirectory: stemDir
  },
  arrangement: [
    "0-32s: dead food-court nostalgia, warm e-piano mall chords",
    "32-64s: underwater glass ceiling, buoyant mallet memory and current",
    "64-96s: escalator reef, pitch drift and submerged PA fragments",
    "96-128s: alien service corridor, darker pads and suspended seconds",
    "128-160s: cold atrium choir/horn shadows, deep pressure thins out",
    "160-192s: final bloom under fake skylight, pressure returns controlled"
  ],
  mix: {
    masterGain: Number(masterGain.toFixed(6)),
    rawPeakBeforeGain: Number(rawPeak.toFixed(6)),
    ...masterStats,
    loudness,
    monoFoldDown: {
      peakDb: masterStats.monoPeakDb,
      clips: masterStats.monoPeakDb > -0.3
    }
  },
  stems: stemReports,
  acceptance: {
    noClippingAboveMinusPointThreeDbfs: masterStats.samplePeakDb <= -0.3,
    targetTruePeakAroundMinusOneDbfs: loudness.truePeakDbfs === null ? "ffmpeg_true_peak_unavailable" : loudness.truePeakDbfs <= -1.0,
    expectedStemCount: 9,
    actualStemCount: stemReports.length
  },
  verificationCommands: [
    "npm run render:the-atrium-below-the-world",
    `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${outWav}`,
    `ffmpeg -hide_banner -nostats -i ${outWav} -filter_complex ebur128=peak=true -f null -`
  ]
};

fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
fs.copyFileSync(outReport, stagingReport);
console.log(JSON.stringify({
  ok: report.ok,
  title,
  wav: outWav,
  mp3: outMp3,
  report: outReport,
  stems: stemReports.length,
  samplePeakDb: masterStats.samplePeakDb,
  integratedLufs: loudness.integratedLufs,
  truePeakDbfs: loudness.truePeakDbfs,
  sourceSamplesUsed: 0
}, null, 2));
