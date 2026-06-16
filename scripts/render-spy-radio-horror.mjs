/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const defaultSource = path.join(downloads, "spy-radio-station-34545 - evil chopped reverse edit.mp3");

const sourceInput = path.resolve(process.argv[2] || defaultSource);
const title = "Spy Radio: Bad Trip Station";
const slug = "spy-radio-bad-trip-station";

const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const prompt = `
Prompt (internal): produce a cinematic backrooms horror from one sample source.
1) Start as a nostalgic broadcast memory: warm, roomy, and emotionally beautiful.
2) Let the same memory become “wrong”: pitch sag, late transients, phase slip, and unstable geometry.
3) Inject hallway-size motion with slow room mutation: tiny closet -> endless corridor -> tiled atrium -> dead office.
4) Keep rhythm as machine memory: sparse low thumps, delayed impacts, and elevator-like metallic glides.
5) Add non-verbal human traces (breath/inhaler vowels / harmonic vowels), no clear words.
6) Recur the memory motif in corrupted phases: delayed return, missing fragment, inversion, and reversed tails.
7) Build toward a final section where low frequencies drain then one controlled sub-pressure return and a breathless close.
`;

const SR = 44100;
const DURATION = 210;
const N = DURATION * SR;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const outReport = path.join(downloads, `${slug}-verification.json`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);
const stagingReport = path.join(renderRoot, `${slug}-verification.json`);
const stagingSource = path.join(renderRoot, "source-edit.wav");

let seed = 0x5f3759df;

const stems = {
  sourceMemory: bus("source-memory-misremembered"),
  ghostVocals: bus("ghost-vocal-ghosts"),
  room: bus("horror-room-size"),
  sub: bus("deep-pressure-center"),
  impacts: bus("impact-and-thump-memory"),
  tape: bus("tape-failure-scars"),
  corridor: bus("corridor-smear-movement"),
  collapse: bus("final-empty-arrival")
};

if (!fs.existsSync(sourceInput)) {
  throw new Error(`Source sample missing: ${sourceInput}`);
}

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
  const p = clamp(pan, -1, 1);
  const a = (p + 1) * Math.PI / 4;
  return [Math.cos(a), Math.sin(a)];
}

function runCommand(cmd, args, label = cmd) {
  const proc = spawnSync(cmd, args, { encoding: "utf8" });
  if (proc.status !== 0) {
    throw new Error(`${label} failed:\n${proc.stderr || proc.stdout}`);
  }
  return proc;
}

function ensureSource(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing source: ${file}`);
  return file;
}

function decodeSourceToWav(mp3Path, wavPath) {
  runCommand("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    mp3Path,
    "-ac",
    "2",
    "-ar",
    String(SR),
    "-sample_fmt",
    "s16",
    wavPath
  ], `ffmpeg decode ${path.basename(mp3Path)}`);
}

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Not a WAV file: ${file}`);
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= b.length) {
    const id = b.toString("ascii", offset, offset + 4);
    const size = b.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        sampleRate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14)
      };
    }
    if (id === "data") {
      data = b.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`Unsupported WAV layout: ${file}`);
  if (![1, 3].includes(fmt.format)) throw new Error(`Unsupported PCM type: ${file}`);
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / bytes / fmt.channels);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const frame = [];
    for (let c = 0; c < fmt.channels; c += 1) {
      const p = (i * fmt.channels + c) * bytes;
      let value = 0;
      if (fmt.format === 3 && fmt.bits === 32) value = data.readFloatLE(p);
      else if (fmt.bits === 16) value = data.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) {
        const raw = data[p] | (data[p + 1] << 8) | (data[p + 2] << 16);
        value = ((raw & 0x800000) ? raw | 0xff000000 : raw) / 8388608;
      } else if (fmt.bits === 32) {
        value = data.readInt32LE(p) / 2147483648;
      }
      frame.push(value);
    }
    l[i] = frame[0] ?? 0;
    r[i] = frame[1] ?? frame[0] ?? 0;
  }
  return resample({ file, sampleRate: fmt.sampleRate, length: frames, l, r });
}

function resample(src) {
  if (src.sampleRate === SR) return src;
  const frames = Math.floor(src.length * SR / src.sampleRate);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const x = i * src.sampleRate / SR;
    const j = Math.floor(x);
    const f = x - j;
    const k = Math.min(src.length - 1, j + 1);
    l[i] = src.l[j] * (1 - f) + src.l[k] * f;
    r[i] = src.r[j] * (1 - f) + src.r[k] * f;
  }
  return { ...src, sampleRate: SR, length: frames, l, r };
}

function sampleAt(src, channel, position) {
  if (!src.length) return 0;
  let i = Math.floor(position);
  i %= src.length;
  if (i < 0) i += src.length;
  const f = position - Math.floor(position);
  const next = (i + 1) % src.length;
  const data = channel === 0 ? src.l : src.r;
  return data[i] * (1 - f) + data[next] * f;
}

function safeSourceTime(src, t) {
  const max = Math.max(0.1, src.length / SR - 0.15);
  return ((t % max) + max) % max;
}

function addSample(b, src, opt) {
  const start = Math.floor((opt.time ?? 0) * SR);
  const len = Math.floor((opt.length ?? 6) * SR);
  const sourceStart = safeSourceTime(src, opt.src ?? 0) * SR;
  const [pl, pr] = panGains(opt.pan ?? 0);
  const fade = Math.min(Math.floor((opt.fade ?? 0.8) * SR), Math.floor(len / 2));

  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const t = i / SR;
    const localSag = opt.sag ? (1 - opt.sag * p) : 1;
    const drift = 1
      + Math.sin((opt.time + t) * 0.021) * (opt.wow ?? 0)
      + Math.sin((opt.time + t) * 0.137) * (opt.wow ?? 0) * 0.6;
    const rate = (opt.rate ?? 1) * localSag * drift;
    const pos = opt.reverse ? (len - i - 1) * rate + sourceStart : i * rate + sourceStart;
    let l = sampleAt(src, 0, pos);
    let r = sampleAt(src, 1, pos);
    if (opt.crush) {
      const steps = 1 << Math.max(4, Math.floor(13 - opt.crush * 7));
      l = Math.round(l * steps) / steps;
      r = Math.round(r * steps) / steps;
    }
    let env = 1;
    if (fade > 0) env *= Math.min(1, i / fade, (len - i) / fade);
    if (opt.attack) env *= smoothstep(i / (opt.attack * SR));
    if (opt.release) env *= smoothstep((len - i) / (opt.release * SR));
    if (opt.gate) {
      const q = ((t + (opt.gate.phase ?? 0)) % opt.gate.period) / opt.gate.period;
      env *= q < opt.gate.duty ? 1 : opt.gate.floor;
    }
    if (opt.dropouts) env *= rand() < opt.dropouts ? 0.14 : 1;
    b.l[di] += l * (opt.gain ?? 0.08) * env * pl;
    b.r[di] += r * (opt.gain ?? 0.08) * env * pr;
  }
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
    const freq = opt.freq + ((opt.freqEnd ?? opt.freq) - opt.freq) * p;
    let v = Math.sin(2 * Math.PI * freq * t + (opt.phase ?? 0));
    if (opt.type === "tri") v = Math.asin(v) * 2 / Math.PI;
    if (opt.type === "saw") v = 2 * ((freq * t) % 1) - 1;
    const wobble = opt.tremolo ? 0.82 + 0.18 * Math.sin(2 * Math.PI * opt.tremolo * t) : 1;
    const env = smoothstep(i / ((opt.attack ?? 2) * SR)) * smoothstep((len - i) / ((opt.release ?? 2) * SR));
    b.l[di] += v * (opt.gain ?? 0.02) * env * wobble * pl;
    b.r[di] += v * (opt.gain ?? 0.02) * env * wobble * pr;
  }
}

function addNoise(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  let hpL = 0;
  let hpR = 0;
  let drift = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const raw = rand() * 2 - 1;
    const envelope = smoothstep(i / ((opt.attack ?? 1) * SR)) * smoothstep((len - i) / ((opt.release ?? 1) * SR));
    hpL += (raw - hpL) * (opt.lowpass ?? 0.004);
    hpR += (raw - hpR) * (opt.lowpass ?? 0.004);
    drift += ((rand() * 2 - 1) - drift) * (opt.slowpass ?? 0.0009);
    const scar = rand() > (opt.scarThreshold ?? 0.99996) ? (rand() * 2 - 1) * (opt.scar ?? 0.08) : 0;
    const breathe = 0.88 + 0.12 * Math.sin(2 * Math.PI * (opt.breathe ?? 0.017) * (i / SR) + 1.1);
    b.l[di] += (hpL + scar + drift * 0.2) * (opt.gain ?? 0.03) * envelope * breathe * pl;
    b.r[di] += (hpR * 0.95 + scar * 0.7 + drift * 0.12) * (opt.gain ?? 0.03) * envelope * breathe * pr;
    if (opt.gated && i / SR > 0.5 && rand() < opt.gated) b.l[di] *= 0.38;
    if (opt.gated && i / SR > 0.5 && rand() < opt.gated) b.r[di] *= 0.38;
  }
}

function addGhostVowel(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  const shapes = [
    [300, 780, 2240],
    [380, 980, 2360],
    [560, 1120, 2610],
    [610, 1210, 2740]
  ];
  const formants = shapes[opt.shape ?? 0];
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const t = i / SR;
    let voiced = 0;
    for (let h = 1; h <= 7; h += 1) {
      voiced += Math.sin(2 * Math.PI * opt.freq * (1 - p * 0.04) * h * t + h * 0.25) / (h * 1.55);
    }
    let formant = 0;
    for (const f of formants) {
      formant += Math.sin(2 * Math.PI * f * (1 + Math.sin(t * 0.17) * 0.002) * t) * 0.034;
    }
    const env = smoothstep(i / ((opt.attack ?? 2.5) * SR)) * smoothstep((len - i) / ((opt.release ?? 4.6) * SR));
    const near = opt.near ? 1.2 + 0.2 * Math.sin(t * 3.4) : 0.8;
    b.l[di] += (voiced * 0.35 + formant) * (opt.gain ?? 0.03) * env * near * pl;
    b.r[di] += (voiced * 0.31 + formant * 0.95) * (opt.gain ?? 0.03) * env * near * pr;
  }
}

function highpass(data, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = rc / (rc + dt);
  let y = 0;
  let prev = 0;
  for (let i = 0; i < data.length; i += 1) {
    const x = data[i];
    y = a * (y + x - prev);
    data[i] = y;
    prev = x;
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

function reverbRoomSweep(b, options) {
  for (const section of options) {
    const start = Math.floor(section.start * SR);
    const end = Math.floor(section.end * SR);
    for (let i = start; i < Math.min(end, N); i += 1) {
      const stage = (i - start) / Math.max(1, end - start);
      const morph = stage < 0.83 ? smoothstep(stage / 0.83) : smoothstep((1 - stage) / 0.17);
      for (let j = 0; j < section.taps.length; j += 1) {
        const delay = Math.floor(section.taps[j] * SR);
        const src = i - delay;
        if (src <= 0) continue;
        const wet = section.wet * (0.48 + morph * 0.52) / Math.sqrt(j + 1);
        b.l[i] += b.l[src] * wet * (1 - section.width);
        b.r[i] += b.r[src] * wet * section.width;
      }
    }
  }
}

function stereoWander(b, depth) {
  const inL = b.l.slice();
  const inR = b.r.slice();
  const microBase = Math.max(1, Math.floor(0.0007 * SR));
  const microSpread = Math.max(1, Math.floor(0.0019 * depth * SR));
  const widthAmp = clamp(0.55 + depth * 2.3, 0.25, 3.25);
  const driftAmp = 0.4 + depth * 0.9;
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const drift = Math.sin(t * 0.024 + Math.sin(t * 0.007) * 2.5) * driftAmp;
    const micro = Math.min(microBase + Math.floor(Math.sin(t * 0.011) * microSpread * 0.5 + microSpread * 0.5), N - 1);
    const j = Math.max(0, i - micro);
    const left = inL[j];
    const right = inR[j];
    const mid = 0.5 * (left + right);
    const side = 0.5 * (left - right);
    const cross = Math.sin(t * 0.022) * (0.025 + depth * 0.04);
    const width = clamp(1 + drift * 2.2, 0.35, widthAmp);
    b.l[i] = (mid * (1 + cross) + side * width) * 0.96;
    b.r[i] = (mid * (1 - cross) - side * width) * 0.96;
  }
}

function crossDelay(b, lSeconds, rSeconds, wet) {
  const dl = Math.max(1, Math.floor(lSeconds * SR));
  const dr = Math.max(1, Math.floor(rSeconds * SR));
  for (let i = N - 1; i >= Math.max(dl, dr); i -= 1) {
    b.l[i] += b.r[i - dr] * wet;
    b.r[i] += b.l[i - dl] * wet;
  }
}

function saturate(b, drive) {
  const denom = Math.tanh(drive);
  for (let i = 0; i < N; i += 1) {
    b.l[i] = Math.tanh(b.l[i] * drive) / denom;
    b.r[i] = Math.tanh(b.r[i] * drive) / denom;
  }
}

function gainBus(bus, amount) {
  for (let i = 0; i < N; i += 1) {
    bus.l[i] *= amount;
    bus.r[i] *= amount;
  }
}

function mixBuses(all) {
  const l = new Float32Array(N);
  const r = new Float32Array(N);
  for (const b of all) {
    for (let i = 0; i < N; i += 1) {
      l[i] += b.l[i];
      r[i] += b.r[i];
    }
  }
  return { l, r };
}

function metrics(l, r) {
  let peak = 0;
  let rms = 0;
  let monoPeak = 0;
  let lr = 0;
  let ll = 0;
  let rr = 0;
  let side = 0;

  for (let i = 0; i < l.length; i += 1) {
    const sl = l[i];
    const sr = r[i];
    const m = (sl + sr) * 0.5;
    const s = (sl - sr) * 0.5;
    peak = Math.max(peak, Math.abs(sl), Math.abs(sr));
    monoPeak = Math.max(monoPeak, Math.abs(m));
    rms += sl * sl + sr * sr;
    lr += sl * sr;
    ll += sl * sl;
    rr += sr * sr;
    side += s * s;
  }

  return {
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(rms / (l.length * 2)).toFixed(4)),
    monoPeak: Number(monoPeak.toFixed(4)),
    midSideRatio: Number((Math.sqrt(side / Math.max(peak, 1e-12))).toFixed(4)),
    correlation: Number((lr / Math.sqrt(Math.max(ll * rr, 1e-12))).toFixed(4))
  };
}

function writeWav24(file, l, r) {
  const bytes = l.length * 6;
  const out = Buffer.alloc(44 + bytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + bytes, 4);
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
  out.writeUInt32LE(bytes, 40);

  let p = 44;
  for (let i = 0; i < l.length; i += 1) {
    const vl = Math.round(clamp(l[i], -1, 0.999999) * 8388607);
    const vr = Math.round(clamp(r[i], -1, 0.999999) * 8388607);
    const lInt = vl < 0 ? vl + 0x1000000 : vl;
    const rInt = vr < 0 ? vr + 0x1000000 : vr;
    out[p] = lInt & 0xff;
    out[p + 1] = (lInt >> 8) & 0xff;
    out[p + 2] = (lInt >> 16) & 0xff;
    out[p + 3] = rInt & 0xff;
    out[p + 4] = (rInt >> 8) & 0xff;
    out[p + 5] = (rInt >> 16) & 0xff;
    p += 6;
  }
  fs.writeFileSync(file, out);
}

function ffprobe(file) {
  const probe = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_name,sample_rate,channels,bits_per_sample",
    "-of",
    "json",
    file
  ], { encoding: "utf8" });
  return {
    command: `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${file}`,
    status: probe.status,
    json: probe.stdout ? JSON.parse(probe.stdout) : null
  };
}

function ebur128(file) {
  const loudness = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    file,
    "-filter_complex",
    "ebur128=peak=true",
    "-f",
    "null",
    "-"
  ], { encoding: "utf8" });
  return {
    command: "ffmpeg -hide_banner -nostats -i " + file + " -filter_complex ebur128=peak=true -f null -",
    status: loudness.status,
    stderrTail: (loudness.stderr || "").split(/\r?\n/).slice(-24).join("\n")
  };
}

decodeSourceToWav(ensureSource(sourceInput), stagingSource);
const source = readWav(stagingSource);

for (const p of [
  { time: 0, src: 0.8, length: 36, rate: 0.55, gain: 0.28, pan: -0.16, wow: 0.003, reverse: false },
  { time: 22, src: 6.2, length: 24, rate: 0.49, gain: 0.18, pan: 0.08, wow: 0.006, sag: 0.01, reverse: false },
  { time: 48, src: 12.9, length: 30, rate: 0.4, gain: 0.16, pan: 0.18, wow: 0.01, reverse: false }
]) {
  addSample(stems.sourceMemory, source, {
    ...p,
    fade: 4,
    attack: 4,
    release: 5,
    gate: { period: 1.3, duty: 0.71, floor: 0.22 },
    crush: 0.03
  });
}

let loopCursor = 86;
for (const step of [4.0, 3.7, 3.2, 5.5, 2.9]) {
  addSample(stems.sourceMemory, source, {
    time: loopCursor,
    src: 18.2 + rand() * 12,
    length: step,
    rate: 0.82 - loopCursor / 500,
    gain: 0.19 + (loopCursor / 900),
    pan: ((loopCursor / 17) % 1) * 1.4 - 0.7,
    reverse: rand() < 0.35,
    wow: 0.022,
    sag: (loopCursor / 800) * 0.07,
    gate: { period: 0.66, duty: 0.62, floor: 0.29 },
    fade: 2.1,
    crush: 0.12,
    dropouts: 0.004,
    attack: 1.4,
    release: 1.2
  });
  loopCursor += step * (0.75 + 0.15 * rand());
}

addNoise(stems.room, {
  time: 0,
  length: DURATION,
  gain: 0.038,
  lowpass: 0.0022,
  slowpass: 0.00018,
  attack: 8,
  release: 10,
  scarThreshold: 0.99999,
  scar: 0.01,
  breathe: 0.018,
  pan: -0.2
});

for (const f of [50.1, 78.4, 110.2, 141.3, 173.5, 199.8]) {
  addTone(stems.room, {
    time: f / 2,
    length: 170,
    freq: f,
    freqEnd: f * (1 + rand() * 0.004),
    gain: f < 80 ? 0.021 : 0.006,
    attack: 8,
    release: 8,
    tremolo: 0.014,
    pan: rand() * 0.5 - 0.25,
    type: f % 2 === 0 ? "tri" : "sine"
  });
}

for (let i = 0; i < 9; i += 1) {
  addGhostVowel(stems.ghostVocals, {
    time: 56 + i * 12 + (i % 2 === 0 ? 0 : 0.9),
    length: 10 + (i % 3),
    freq: [49.2, 52.3, 58.9, 73.4][i % 4],
    gain: 0.042 + (i % 4) * 0.003,
    pan: i % 2 === 0 ? (-0.7 + rand() * 0.2) : (0.65 - rand() * 0.2),
    shape: i % 4,
    near: i > 1 && i < 7,
    attack: 2.4,
    release: 3.9
  });
}

for (const e of [
  { time: 61.2, freq: 420, freqEnd: 360, length: 40, gain: 0.020, pan: -0.45 },
  { time: 99.4, freq: 515, freqEnd: 455, length: 43, gain: 0.020, pan: 0.22 },
  { time: 132.6, freq: 620, freqEnd: 560, length: 34, gain: 0.017, pan: -0.06 },
  { time: 166.2, freq: 500, freqEnd: 430, length: 28, gain: 0.019, pan: 0.54 },
  { time: 195.2, freq: 590, freqEnd: 500, length: 20, gain: 0.018, pan: -0.32 }
]) {
  addTone(stems.corridor, {
    time: e.time,
    length: e.len,
    freq: e.freq,
    freqEnd: e.freqEnd,
    gain: e.gain,
    pan: e.pan,
    attack: 1.1,
    release: 4.8,
    type: "saw"
  });
}

for (const [time] of [
  [71.2], [84.9], [100.4], [125.3], [150.6], [173.2], [198.1]
]) {
  addTone(stems.corridor, {
    time,
    length: 1.6,
    freq: 1160,
    freqEnd: 870,
    gain: 0.018,
    pan: rand() * 1.4 - 0.7,
    attack: 0.018,
    release: 0.9,
    tremolo: 17.2
  });
  addTone(stems.corridor, {
    time: time + 0.18,
    length: 2.9,
    freq: 95,
    freqEnd: 45,
    gain: 0.014,
    pan: -rand() * 0.8 + 0.3,
    attack: 0.05,
    release: 2.2,
    type: "tri"
  });
}

for (const seg of [
  { time: 32, length: 95, freq: 46, freqEnd: 28, gain: 0.028 },
  { time: 132, length: 58, freq: 38, freqEnd: 22, gain: 0.034 },
  { time: 170, length: 24, freq: 30, freqEnd: 20, gain: 0.046 }
]) {
  addTone(stems.sub, {
    time: seg.time,
    length: seg.length,
    freq: seg.freq,
    freqEnd: seg.freqEnd,
    gain: seg.gain,
    pan: 0,
    attack: 4,
    release: 6,
    type: "tri"
  });
}

for (const t of [18.4, 37.2, 53.1, 76.4, 96.5, 118.3, 132.6, 156.9, 181.0, 198.5]) {
  addTone(stems.impacts, {
    time: t,
    length: 6.4 + rand() * 1.2,
    freq: 48 - (t % 11),
    freqEnd: 21,
    gain: 0.095 + rand() * 0.05,
    pan: ((t % 3) - 1) * 0.4,
    attack: 0.01,
    release: 3.4,
    type: "tri"
  });
  addNoise(stems.impacts, {
    time: t + 0.06,
    length: 0.72,
    gain: 0.018,
    lowpass: 0.005,
    slowpass: 0.0025,
    attack: 0.02,
    release: 1.1,
    scarThreshold: 0.99952,
    scar: 0.08,
    pan: (t % 2 === 0 ? -0.6 : 0.6)
  });
}

for (let t = 0.3; t < DURATION; t += 3.2 + rand() * 4.8) {
  if (rand() < 0.26) {
    addNoise(stems.tape, {
      time: t,
      length: 0.08 + rand() * 0.2,
      gain: 0.055 + rand() * 0.03,
      lowpass: 0.032,
      slowpass: 0.009,
      attack: 0.004,
      release: 0.07,
      scarThreshold: 0.975,
      scar: 0.22,
      pan: rand() * 1.2 - 0.6
    });
  }
}

for (const t of [72.6, 108.4, 146.5, 181.9]) {
  addTone(stems.tape, {
    time: t,
    length: 0.4,
    freq: 700 + rand() * 180,
    freqEnd: 520,
    gain: 0.020,
    pan: rand() * 1 - 0.5,
    attack: 0.01,
    release: 0.32,
    type: "sine"
  });
}

const dropFrom = 198;
const dropTo = 205;
for (let i = Math.floor(dropFrom * SR); i < Math.min(N, Math.floor(dropTo * SR)); i += 1) {
  const p = (i - dropFrom * SR) / ((dropTo - dropFrom) * SR);
  stems.sub.l[i] *= 1 - p * 0.98;
  stems.sub.r[i] *= 1 - p * 0.98;
  stems.room.l[i] *= 1 - (p * 0.45);
  stems.room.r[i] *= 1 - (p * 0.45);
  stems.sourceMemory.l[i] *= 1 - p;
  stems.sourceMemory.r[i] *= 1 - p;
}

addTone(stems.collapse, {
  time: 205,
  length: 6,
  freq: 46,
  freqEnd: 29,
  gain: 0.065,
  attack: 3.2,
  release: 2,
  pan: 0,
  type: "tri"
});
addNoise(stems.collapse, {
  time: 204,
  length: 2.4,
  gain: 0.042,
  lowpass: 0.01,
  attack: 1.2,
  release: 0.7,
  pan: 0
});

for (const stem of Object.values(stems)) {
  highpass(stem.l, stem === stems.sub ? 24 : 54);
  highpass(stem.r, stem === stems.sub ? 24 : 54);
}

for (const stem of Object.values(stems)) {
  lowpass(stem.l, stem === stems.sourceMemory ? 5600 : stem === stems.ghostVocals ? 4600 : 9000);
  lowpass(stem.r, stem === stems.sourceMemory ? 5300 : stem === stems.ghostVocals ? 4300 : 9000);
}

reverbRoomSweep(stems.room, [
  { start: 0, end: 34, taps: [0.028, 0.052, 0.108], wet: 0.06, width: 0.2 },
  { start: 34, end: 86, taps: [0.19, 0.47, 0.97, 1.79], wet: 0.08, width: 0.8 },
  { start: 86, end: 150, taps: [0.34, 0.79, 1.39, 2.11, 3.8], wet: 0.1, width: 1.15 },
  { start: 150, end: 188, taps: [0.06, 0.13, 0.31, 0.75], wet: 0.06, width: 0.45 },
  { start: 188, end: 210, taps: [0.27, 1.12, 2.24], wet: 0.065, width: 1.1 }
]);
for (const stem of [stems.room, stems.corridor, stems.ghostVocals, stems.sourceMemory]) {
  reverbRoomSweep(stem, [
    { start: 0, end: 34, taps: [0.052, 0.09], wet: stem === stems.ghostVocals ? 0.035 : 0.018, width: 0.15 },
    { start: 34, end: 150, taps: [0.14, 0.36, 0.91], wet: stem === stems.ghostVocals ? 0.065 : 0.03, width: 0.62 },
    { start: 150, end: 210, taps: [0.22, 0.58, 1.26], wet: stem === stems.ghostVocals ? 0.08 : 0.04, width: 1.05 }
  ]);
}

crossDelay(stems.sourceMemory, 0.014, 0.026, 0.11);
crossDelay(stems.ghostVocals, 0.008, 0.033, 0.17);
crossDelay(stems.corridor, 0.023, 0.038, 0.07);
crossDelay(stems.room, 0.053, 0.099, 0.045);

stereoWander(stems.sourceMemory, 0.17);
stereoWander(stems.ghostVocals, 0.48);
stereoWander(stems.corridor, 0.21);
stereoWander(stems.tape, 0.24);

saturate(stems.sourceMemory, 1.17);
saturate(stems.ghostVocals, 1.3);
saturate(stems.room, 1.09);
saturate(stems.tape, 1.4);

let all = Object.values(stems);
let master = mixBuses(all);
const pre = metrics(master.l, master.r);
const gainTarget = 0.86 / Math.max(pre.peak, 0.001);
const preScale = Math.min(gainTarget, 1.95);
if (preScale < 1) {
  for (const stem of all) gainBus(stem, preScale);
}
if (preScale !== 1) {
  master = mixBuses(all);
}
master = mixBuses(all);

for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const fadeIn = smoothstep(t / 3.5);
  const fadeOut = t > DURATION - 12 ? smoothstep((DURATION - t) / 12) : 1;
  const blackout = t > 180 ? 1 - smoothstep((t - 180) / 1.8) * 0.04 : 1;
  master.l[i] *= fadeIn * fadeOut * blackout;
  master.r[i] *= fadeIn * fadeOut * blackout;
}

const beforeLimit = metrics(master.l, master.r);
const peakLimit = 0.82 / Math.max(beforeLimit.peak, 0.001);
if (peakLimit < 1) {
  gainBus(master, peakLimit);
}

const final = metrics(master.l, master.r);
if (final.peak > 0.965) {
  throw new Error(`Master peak ${final.peak} exceeds -0.3 dBFS ceiling.`);
}


for (const stem of all) {
  const stemPath = path.join(stemDir, `${stem.name}.wav`);
  writeWav24(stemPath, stem.l, stem.r);
}

writeWav24(stagingWav, master.l, master.r);
writeWav24(outWav, master.l, master.r);

runCommand("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  outWav,
  "-codec:a",
  "libmp3lame",
  "-b:a",
  "320k",
  outMp3
]);

const stemReports = all.map((stem) => {
  const stemPath = path.join(stemDir, `${stem.name}.wav`);
  return {
    name: stem.name,
    path: stemPath,
    ...metrics(stem.l, stem.r),
    probe: ffprobe(stemPath)
  };
});

const report = {
  ok: true,
  title,
  slug,
  durationSeconds: DURATION,
  sampleRate: SR,
  bitDepth: 24,
  bpmReference: 54,
  sourceSamplesUsed: 1,
  sourcePaths: [sourceInput],
  productionPrompt: prompt,
  safety: {
    abletonWrites: false,
    uiMouseControl: false,
    downloads: false,
    arbitraryUrlFetch: false,
    subliminalCommands: false,
    copies: false
  },
  outputs: {
    masterWav: outWav,
    masterMp3: outMp3,
    stagingMaster: stagingWav,
    attribution: outAttr,
    verificationReport: outReport,
    stemDirectory: stemDir,
    sourceWav: stagingSource
  },
  preNormalize: pre,
  postNormalize: final,
  master: {
    ...final,
    probe: ffprobe(outWav),
    loudness: ebur128(outWav)
  },
  stems: stemReports,
  commands: [
    `ffmpeg -y -hide_banner -loglevel error -i "${sourceInput}" -ac 2 -ar ${SR} -sample_fmt s16 "${stagingSource}"`,
    `ffmpeg -y -hide_banner -loglevel error -i ${outWav} -codec:a libmp3lame -b:a 320k ${outMp3}`,
    `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${outWav}`,
    `ffmpeg -hide_banner -nostats -i ${outWav} -filter_complex ebur128=peak=true -f null -`
  ]
};

fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
fs.writeFileSync(stagingReport, JSON.stringify(report, null, 2));

fs.writeFileSync(outAttr, [
  title,
  "",
  "Offline single-source horror transformation using a user-provided sample.",
  "Source: spy-radio-station-34545 - evil chopped reverse edit.mp3",
  "",
  "Production direction:",
  "- Start as nostalgic broadcast memory, then destabilize room perception and timing.",
  "- Use nonverbal ghost textures, irregular impacts, and tape scars instead of a static hiss bed.",
  "- Keep a centered sub core until the late collapse section, then reintroduce one pressure return.",
  "- No Ableton writes, UI/mouse control, plugin installs, arbitrary URL fetches, external downloads, YouTube/SoundCloud ripping, or network actions.",
  "",
  "Prompt used for this render:",
  prompt.trim(),
  "",
  "Source files:",
  `- ${sourceInput}`,
  `- ${stagingSource} (normalized staging source)`
].join("\n"));

console.log(JSON.stringify(report, null, 2));
