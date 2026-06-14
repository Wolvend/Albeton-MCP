/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const renderRoot = path.join(root, "samples", "staging", "occult-liminal-backrooms");
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const BPM = 56;
const DURATION = 168;
const N = DURATION * SR;
const SECTION = 28;

const masterWavOut = path.join(downloads, "occult-liminal-backrooms-master.wav");
const masterMp3Out = path.join(downloads, "occult-liminal-backrooms-master.mp3");
const attrOut = path.join(downloads, "occult-liminal-backrooms-attribution.txt");
const stagingMaster = path.join(renderRoot, "occult-liminal-backrooms-master.wav");

const stems = {
  ballroom: makeBus("ballroom-memory"),
  concrete: makeBus("concrete-room"),
  sub: makeBus("sub-pressure"),
  tape: makeBus("tape-artifacts"),
  occult: makeBus("occult-smear"),
  impacts: makeBus("impacts"),
};

let seed = 0x9e3779b9;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function makeBus(name) {
  return { name, l: new Float32Array(N), r: new Float32Array(N) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function panGains(pan) {
  const angle = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
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
    if (id === "data") data = b.subarray(body, body + size);
    off = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`Missing fmt/data chunks: ${file}`);
  if (![1, 3].includes(fmt.format)) throw new Error(`Unsupported WAV format ${fmt.format}: ${file}`);

  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / bytes / fmt.channels);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const samples = [];
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
      samples.push(v);
    }
    l[i] = samples[0] ?? 0;
    r[i] = samples[1] ?? samples[0] ?? 0;
  }
  return resample({ file, sampleRate: fmt.sampleRate, length: frames, l, r });
}

function resample(src) {
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

function sampleAt(src, channel, pos) {
  if (pos < 0 || pos >= src.length - 2) return 0;
  const j = Math.floor(pos);
  const f = pos - j;
  const arr = channel === "l" ? src.l : src.r;
  return arr[j] * (1 - f) + arr[j + 1] * f;
}

function addSample(bus, src, opt) {
  const time = opt.time ?? 0;
  const srcSec = opt.src ?? 0;
  const rate = opt.rate ?? 1;
  const lengthSec = opt.length ?? 8;
  const start = Math.floor(time * SR);
  const len = Math.floor(lengthSec * SR);
  const sourceStart = srcSec * SR;
  const [pl, pr] = panGains(opt.pan ?? 0);
  const fade = Math.min(Math.floor((opt.fade ?? 0.25) * SR), Math.floor(len / 2));
  const gain = opt.gain ?? 1;
  const reverse = opt.reverse ?? false;
  const wow = opt.wow ?? 0;
  const crush = opt.crush ?? 0;
  const tremolo = opt.tremolo ?? 0;
  for (let i = 0; i < len; i++) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const drift = 1 + Math.sin(2 * Math.PI * 0.085 * (time + t)) * wow + Math.sin(2 * Math.PI * 0.021 * (time + t)) * wow * 1.7;
    const local = reverse ? (len - 1 - i) * rate * drift : i * rate * drift;
    const sx = sourceStart + local;
    let sl = sampleAt(src, "l", sx);
    let sr = sampleAt(src, "r", sx);
    if (crush > 0) {
      const steps = 1 << Math.max(4, Math.floor(13 - crush * 8));
      sl = Math.round(sl * steps) / steps;
      sr = Math.round(sr * steps) / steps;
    }
    let env = 1;
    if (fade > 0) env *= Math.min(1, i / fade, (len - i) / fade);
    if (opt.attack) env *= smoothstep(i / (opt.attack * SR));
    if (opt.release) env *= smoothstep((len - i) / (opt.release * SR));
    if (tremolo > 0) env *= 1 - tremolo * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.72 * (time + t)));
    bus.l[di] += sl * gain * env * pl;
    bus.r[di] += sr * gain * env * pr;
  }
}

function addTone(bus, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  const gain = opt.gain ?? 0.1;
  const type = opt.type ?? "sine";
  const freqEnd = opt.freqEnd ?? opt.freq;
  for (let i = 0; i < len; i++) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const f = opt.freq + (freqEnd - opt.freq) * p;
    const t = i / SR;
    let v = Math.sin(2 * Math.PI * f * t);
    if (type === "tri") v = Math.asin(v) * 2 / Math.PI;
    if (type === "saw") v = 2 * ((f * t) % 1) - 1;
    const env = smoothstep(i / ((opt.attack ?? 0.5) * SR)) * smoothstep((len - i) / ((opt.release ?? 1.5) * SR));
    bus.l[di] += v * gain * env * pl;
    bus.r[di] += v * gain * env * pr;
  }
}

function addNoise(bus, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  let lpL = 0;
  let lpR = 0;
  let bp = 0;
  const [pl, pr] = panGains(opt.pan ?? 0);
  for (let i = 0; i < len; i++) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const n = rand() * 2 - 1;
    lpL += (n - lpL) * (opt.lowpass ?? 0.006);
    lpR += ((rand() * 2 - 1) - lpR) * (opt.lowpass ?? 0.006);
    bp = bp * 0.96 + n * 0.04;
    const env = smoothstep(i / ((opt.attack ?? 2) * SR)) * smoothstep((len - i) / ((opt.release ?? 2) * SR));
    const crack = rand() > (opt.crackleThreshold ?? 0.9995) ? (rand() * 2 - 1) * (opt.crackle ?? 0.2) : 0;
    const vL = (lpL + bp * (opt.band ?? 0.2) + crack) * (opt.gain ?? 0.1) * env;
    const vR = (lpR + bp * (opt.band ?? 0.2) + crack * 0.65) * (opt.gain ?? 0.1) * env;
    bus.l[di] += vL * pl;
    bus.r[di] += vR * pr;
  }
}

function addImpact(time, gain, tone = 58) {
  addTone(stems.impacts, { time, length: 3.8, freq: tone, freqEnd: tone * 0.45, gain, attack: 0.005, release: 3.3, pan: -0.08 });
  addNoise(stems.impacts, { time, length: 2.3, gain: gain * 0.35, lowpass: 0.035, attack: 0.002, release: 1.8, pan: 0.12, crackleThreshold: 0.996, crackle: 0.35 });
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
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    y = a * (y + x - prev);
    arr[i] = y;
    prev = x;
  }
}

function addCrossDelay(bus, delaySec, wet, feedback) {
  const d = Math.floor(delaySec * SR);
  for (let i = d; i < N; i++) {
    const dl = bus.r[i - d] * wet;
    const dr = bus.l[i - d] * wet;
    bus.l[i] += dl + bus.l[i - d] * feedback * 0.025;
    bus.r[i] += dr + bus.r[i - d] * feedback * 0.025;
  }
}

function writeWav(file, l, r) {
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
    b.writeInt16LE(Math.round(clamp(l[i], -1, 1) * 32767), p); p += 2;
    b.writeInt16LE(Math.round(clamp(r[i], -1, 1) * 32767), p); p += 2;
  }
  fs.writeFileSync(file, b);
}

function metrics(l, r) {
  let peak = 0;
  let rms = 0;
  for (let i = 0; i < N; i++) {
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    rms += l[i] * l[i] + r[i] * r[i];
  }
  return { peak, rms: Math.sqrt(rms / (N * 2)) };
}

const ballroomDir = path.join(root, "samples", "staging", "online-liminal-ballroom");
const ballroom = [
  "05 That Haunting Waltz.wav",
  "10 Nocturne .wav",
  "06 When You And I Were Seventeen w.wav",
  "07 Oriental Nights.wav",
].map((f) => readWav(path.join(ballroomDir, f)));

const drumDir = path.join(root, "samples", "staging", "online-realistic-liminal", "drumshots-44k");
const cymbalPath = path.join(drumDir, "JBK_Cymbal_18.wav");
const rimPath = path.join(drumDir, "JBK_Rim_10b.wav");
const cymbal = fs.existsSync(cymbalPath) ? readWav(cymbalPath) : null;
const rim = fs.existsSync(rimPath) ? readWav(rimPath) : null;

function arrangeBallroom() {
  const hook = ballroom[0];
  const hookStarts = [14.7, 15.25, 16.1, 17.45, 21.35, 22.05];
  for (let s = 0; s < 6; s++) {
    const start = s * SECTION;
    const src = ballroom[s % ballroom.length];
    const rate = [0.55, 0.48, 0.43, 0.39, 0.34, 0.28][s];
    const gain = [0.48, 0.38, 0.34, 0.3, 0.36, 0.22][s];
    addSample(stems.ballroom, src, {
      time: start,
      src: 7 + s * 5.3,
      length: SECTION + 5,
      rate,
      gain,
      pan: (s % 2 ? 0.18 : -0.18),
      fade: 4.5,
      attack: s === 0 ? 5 : 2,
      release: 5,
      wow: 0.018 + s * 0.004,
      crush: 0.08 + s * 0.035,
      tremolo: s >= 3 ? 0.16 : 0.04,
    });
  }
  for (let i = 0; i < 18; i++) {
    const t = 7.5 + i * 7.25 + (i % 3) * 0.9;
    const section = Math.floor(t / SECTION);
    const reverse = section >= 3 && i % 2 === 0;
    addSample(stems.ballroom, hook, {
      time: t,
      src: hookStarts[i % hookStarts.length],
      length: 3.5 + (i % 4) * 0.8,
      rate: 0.42 - section * 0.018,
      gain: 0.25 + (i % 5) * 0.025,
      pan: ((i % 7) - 3) * 0.11,
      fade: 0.5,
      reverse,
      wow: 0.014,
      crush: 0.08,
      tremolo: 0.08,
    });
  }
}

function arrangeConcreteRoom() {
  addNoise(stems.concrete, { time: 0, length: DURATION, gain: 0.13, lowpass: 0.0017, band: 0.28, attack: 6, release: 8, crackleThreshold: 0.99984, crackle: 0.12 });
  for (const hum of [49.7, 59.8, 99.4, 119.6, 183.5]) {
    addTone(stems.concrete, { time: 0, length: DURATION, freq: hum, freqEnd: hum * (0.998 + rand() * 0.006), gain: hum < 70 ? 0.016 : 0.007, attack: 8, release: 9, pan: rand() * 0.8 - 0.4 });
  }
  for (let t = 37; t < 150; t += 13.7) {
    addNoise(stems.concrete, { time: t, length: 5.5, gain: 0.07, lowpass: 0.004, band: 0.4, attack: 1.7, release: 3.5, pan: rand() * 1.2 - 0.6, crackleThreshold: 0.999, crackle: 0.18 });
  }
}

function arrangeSubPressure() {
  for (let s = 1; s < 6; s++) {
    const start = s * SECTION - 5;
    addTone(stems.sub, { time: start, length: SECTION + 8, freq: 34 - s * 1.7, freqEnd: 27 - s * 0.9, gain: 0.07 + s * 0.008, attack: 7, release: 8, pan: 0 });
  }
  for (const t of [30, 47, 61, 84, 103, 119, 141]) {
    addTone(stems.sub, { time: t, length: 5.8, freq: 45, freqEnd: 24, gain: 0.13, attack: 0.03, release: 5.4, pan: 0 });
  }
}

function arrangeTapeArtifacts() {
  addNoise(stems.tape, { time: 0, length: DURATION, gain: 0.08, lowpass: 0.012, band: 0.62, attack: 2, release: 2, crackleThreshold: 0.9993, crackle: 0.45 });
  for (let t = 2; t < DURATION; t += 1.85 + rand() * 2.4) {
    if (rand() < 0.58) {
      addNoise(stems.tape, { time: t, length: 0.08 + rand() * 0.24, gain: 0.16 + rand() * 0.14, lowpass: 0.08, band: 0.15, attack: 0.005, release: 0.08, pan: rand() * 1.6 - 0.8, crackleThreshold: 0.98, crackle: 0.3 });
    }
  }
  for (const t of [55.5, 56.8, 58.1, 89.2, 90.4, 91.6, 126.8, 128.1, 129.4]) {
    addTone(stems.tape, { time: t, length: 0.16, freq: 720 + rand() * 180, gain: 0.035, attack: 0.01, release: 0.08, pan: rand() * 1.2 - 0.6, type: "sine" });
  }
}

function arrangeOccultSmear() {
  const src = ballroom[1];
  for (let i = 0; i < 14; i++) {
    const t = 70 + i * 5.2;
    addSample(stems.occult, src, {
      time: t,
      src: 10 + (i % 8) * 2.1,
      length: 13.5,
      rate: 0.22 + (i % 3) * 0.025,
      gain: 0.2 + (i % 4) * 0.025,
      pan: ((i % 5) - 2) * 0.22,
      fade: 2.4,
      reverse: i % 2 === 0,
      wow: 0.025,
      crush: 0.22,
      tremolo: 0.22,
    });
  }
  for (const f of [196, 233.08, 261.63, 311.13]) {
    addTone(stems.occult, { time: 96, length: 49, freq: f * 0.5, freqEnd: f * 0.46, gain: 0.011, attack: 9, release: 14, pan: rand() * 1.2 - 0.6, type: "tri" });
  }
}

function arrangeImpacts() {
  for (const [t, gain, tone] of [[28, 0.17, 54], [56, 0.13, 49], [84, 0.15, 58], [112, 0.2, 46], [140, 0.1, 42]]) addImpact(t, gain, tone);
  if (cymbal) {
    for (const t of [25.5, 53.8, 82, 110.5, 137.5]) {
      addSample(stems.impacts, cymbal, { time: t, src: 0, length: 3.5, rate: 0.38, gain: 0.16, pan: rand() * 0.8 - 0.4, fade: 0.7, reverse: true, wow: 0.01, crush: 0.14 });
    }
  }
  if (rim) {
    for (const t of [43.2, 66.6, 73.1, 101.7, 122.8]) {
      addSample(stems.impacts, rim, { time: t, src: 0, length: 1.2, rate: 0.42, gain: 0.07, pan: rand() * 1.2 - 0.6, fade: 0.1, wow: 0.02, crush: 0.28 });
    }
  }
}

arrangeBallroom();
arrangeConcreteRoom();
arrangeSubPressure();
arrangeTapeArtifacts();
arrangeOccultSmear();
arrangeImpacts();

highpass(stems.ballroom.l, 75);
highpass(stems.ballroom.r, 75);
onePoleLowpass(stems.ballroom.l, 4200);
onePoleLowpass(stems.ballroom.r, 3900);

highpass(stems.concrete.l, 28);
highpass(stems.concrete.r, 28);
onePoleLowpass(stems.concrete.l, 8500);
onePoleLowpass(stems.concrete.r, 7800);

highpass(stems.tape.l, 140);
highpass(stems.tape.r, 140);
onePoleLowpass(stems.tape.l, 9700);
onePoleLowpass(stems.tape.r, 9100);

highpass(stems.occult.l, 95);
highpass(stems.occult.r, 95);
onePoleLowpass(stems.occult.l, 3200);
onePoleLowpass(stems.occult.r, 3000);
addCrossDelay(stems.ballroom, 0.86, 0.045, 0.38);
addCrossDelay(stems.occult, 1.72, 0.08, 0.5);
addCrossDelay(stems.impacts, 1.18, 0.035, 0.3);

const masterL = new Float32Array(N);
const masterR = new Float32Array(N);
for (const bus of Object.values(stems)) {
  for (let i = 0; i < N; i++) {
    masterL[i] += bus.l[i];
    masterR[i] += bus.r[i];
  }
}

highpass(masterL, 24);
highpass(masterR, 24);
onePoleLowpass(masterL, 14500);
onePoleLowpass(masterR, 14200);

for (let i = 0; i < N; i++) {
  masterL[i] = Math.tanh(masterL[i] * 1.12);
  masterR[i] = Math.tanh(masterR[i] * 1.12);
}

const preNorm = metrics(masterL, masterR);
const norm = Math.min(2.4, 0.88 / Math.max(preNorm.peak, 0.001));
for (let i = 0; i < N; i++) {
  const fadeOut = i > N - SR * 12 ? smoothstep((N - i) / (SR * 12)) : 1;
  masterL[i] *= norm * fadeOut;
  masterR[i] *= norm * fadeOut;
}

const masterMetrics = metrics(masterL, masterR);
if (masterMetrics.peak > 0.966) {
  throw new Error(`Master peak ${masterMetrics.peak.toFixed(4)} exceeds -0.3 dBFS ceiling.`);
}

const stemReports = [];
for (const bus of Object.values(stems)) {
  const stemPath = path.join(stemDir, `${bus.name}.wav`);
  writeWav(stemPath, bus.l, bus.r);
  stemReports.push({ name: bus.name, path: stemPath, ...roundMetrics(metrics(bus.l, bus.r)) });
}

writeWav(stagingMaster, masterL, masterR);
writeWav(masterWavOut, masterL, masterR);

const ff = spawnSync("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  masterWavOut,
  "-codec:a",
  "libmp3lame",
  "-b:a",
  "320k",
  masterMp3Out,
], { encoding: "utf8" });
if (ff.status !== 0) {
  throw new Error(`ffmpeg mp3 export failed: ${ff.stderr || ff.stdout}`);
}

fs.writeFileSync(attrOut, [
  "Occult Liminal Backrooms master",
  "",
  "Direction: original cinematic horror/liminal ambient composition using public-domain/PD-marked source recordings.",
  "No breakcore, EDM drops, trap drums, bright pads, clean synth leads, or intelligible hidden/subliminal commands were used.",
  "",
  "Sources:",
  "- Internet Archive: Cole McElroy Spanish Ballroom Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/ColeMcElroySpanishBallroomOrchestra78rpmCollection",
  "- Internet Archive: Nathan Glantz Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/NathanGlantzOrchestra78rpmCollection",
  "- Optional sparse transition impacts from staged Original Jungle Breaks one-shots, Public Domain Mark 1.0, https://archive.org/details/back03st",
  "",
  "Process:",
  "- 78rpm ballroom recordings slowed, detuned, reversed, filtered, granularly layered, and smeared into a decayed-memory motif.",
  "- Concrete room tone, fluorescent hum, tape artifacts, low sub pressure, reverse swells, and sparse impacts create the horror environment.",
  "- Stems were exported for Ableton editing: ballroom memory, concrete room, sub pressure, tape artifacts, occult smear, impacts.",
].join("\n"));

function roundMetrics(value) {
  return { peak: Number(value.peak.toFixed(4)), rms: Number(value.rms.toFixed(4)) };
}

console.log(JSON.stringify({
  ok: true,
  title: "Occult Liminal Backrooms",
  bpmReference: BPM,
  durationSeconds: DURATION,
  masterWavOut,
  masterMp3Out,
  stagingMaster,
  attrOut,
  stems: stemReports,
  master: roundMetrics(masterMetrics),
}, null, 2));
