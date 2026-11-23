export type MasteringSettings = {
  bass: number;
  warmth: number;
  glue: number;
  width: number;
  loudness: number;
  air: number;
};

export type AudioAnalysis = {
  lufs: number;
  peak: number;
  rms: number;
  lowRatio: number;
  clipped: boolean;
};

export const SAMPLE_RATE = 48000;
export const CEILING_DB = -1;
export const DEFAULT_SETTINGS: MasteringSettings = {
  bass: 0,
  warmth: 25,
  glue: 35,
  width: 105,
  loudness: -14,
  air: 0.7,
};

export const PROFILES = [
  {
    name: "Balanced",
    description: "Natural, open, and true to your mix.",
    settings: DEFAULT_SETTINGS,
  },
  {
    name: "Warm & full",
    description: "A little more body. A little more soul.",
    settings: {
      bass: 1,
      warmth: 55,
      glue: 40,
      width: 100,
      loudness: -14,
      air: -0.4,
    },
  },
  {
    name: "Open & airy",
    description: "Space, clarity, and a lighter touch.",
    settings: {
      bass: -0.5,
      warmth: 12,
      glue: 20,
      width: 118,
      loudness: -14,
      air: 1.8,
    },
  },
  {
    name: "Loud & punchy",
    description: "Up front, with a little extra impact.",
    settings: {
      bass: 0.5,
      warmth: 35,
      glue: 58,
      width: 108,
      loudness: -10,
      air: 0.8,
    },
  },
  {
    name: "Transparent",
    description: "Your mix, with the lightest finishing touch.",
    settings: {
      bass: 0,
      warmth: 0,
      glue: 10,
      width: 100,
      loudness: -16,
      air: 0,
    },
  },
];

const dbToGain = (db: number) => Math.pow(10, db / 20);
const gainToDb = (gain: number) => 20 * Math.log10(Math.max(1e-8, gain));
export const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

async function checkpoint(signal?: AbortSignal) {
  await yieldToBrowser();
  signal?.throwIfAborted();
}

export async function decodeAudio(
  file: File,
  context: AudioContext,
  status: (message: string) => void,
): Promise<AudioBuffer> {
  if (file.size > 200 * 1024 * 1024)
    throw new Error(
      "This mix is a little too large. Please choose a file under 200 MB.",
    );
  if (!/\.(wav|wave|flac|m4a|mp3|aac)$/i.test(file.name)) {
    throw new Error(
      "Choose a WAV, FLAC, M4A (AAC or ALAC), or MP3 audio file.",
    );
  }
  const bytes = await file.arrayBuffer();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(bytes.slice(0));
  } catch {
    status("Opening the local compatibility decoder...");
    // The self-hosted WASM decoder is only loaded if the browser cannot decode a codec.
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();
    const base = new URL(
      `${import.meta.env.BASE_URL}codecs/`,
      window.location.origin,
    ).href;
    try {
      await ffmpeg.load(
        {
          classWorkerURL: `${base}worker.js`,
          coreURL: `${base}ffmpeg-core.js`,
          wasmURL: `${base}ffmpeg-core.wasm`,
        },
        { signal: AbortSignal.timeout(60000) },
      );
      status("Decoding your audio, entirely on this device...");
      const input = `input.${file.name.split(".").pop()?.toLowerCase() || "audio"}`;
      await ffmpeg.writeFile(input, new Uint8Array(bytes));
      const code = await ffmpeg.exec([
        "-i",
        input,
        "-vn",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-c:a",
        "pcm_f32le",
        "decoded.wav",
      ]);
      if (code !== 0) throw new Error("decode");
      const result = await ffmpeg.readFile("decoded.wav");
      if (typeof result === "string") throw new Error("decode");
      buffer = await context.decodeAudioData(new Uint8Array(result).buffer);
    } catch {
      throw new Error(
        "We could not read this audio file. It may be damaged or protected. Try exporting an uncompressed WAV from your DAW.",
      );
    } finally {
      ffmpeg.terminate();
    }
  }
  if (buffer.duration > 900)
    throw new Error(
      "For a smooth local session, choose a track shorter than 15 minutes.",
    );
  if (buffer.duration < 0.1)
    throw new Error("This audio file is too short to master.");
  status("Preparing a 48 kHz stereo session...");
  const offline = new OfflineAudioContext(
    2,
    Math.ceil(buffer.duration * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

// BS.1770 K-weighting at 48 kHz, followed by absolute and relative loudness gating.
export async function analyzeAudio(
  buffer: AudioBuffer,
  signal?: AbortSignal,
): Promise<AudioAnalysis> {
  const blockSize = 4800;
  const blockCount = Math.ceil(buffer.length / blockSize);
  const energies = new Float64Array(blockCount);
  let peak = 0;
  let sum = 0;
  let lowSum = 0;
  let clippedSamples = 0;
  const channels = Math.min(2, buffer.numberOfChannels);
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    let hx1 = 0,
      hx2 = 0,
      hy1 = 0,
      hy2 = 0;
    let low = 0;
    const lowCoefficient = 1 - Math.exp((-2 * Math.PI * 180) / SAMPLE_RATE);
    for (let i = 0; i < data.length; i++) {
      const x = Number.isFinite(data[i]) ? data[i] : 0;
      const absolute = Math.abs(x);
      if (absolute > peak) peak = absolute;
      if (absolute > 0.999) clippedSamples++;
      sum += x * x;
      low += lowCoefficient * (x - low);
      lowSum += low * low;
      const y =
        1.53512485958697 * x -
        2.69169618940638 * x1 +
        1.19839281085285 * x2 +
        1.69065929318241 * y1 -
        0.73248077421585 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      const h =
        y - 2 * hx1 + hx2 + 1.99004745483398 * hy1 - 0.99007225036621 * hy2;
      hx2 = hx1;
      hx1 = y;
      hy2 = hy1;
      hy1 = h;
      energies[Math.floor(i / blockSize)] += (h * h) / blockSize;
      if (i > 0 && i % 500000 === 0) await checkpoint(signal);
    }
  }
  const windows: number[] = [];
  if (blockCount < 4) {
    windows.push(
      energies.reduce((a, b) => a + b, 0) /
        Math.max(1, buffer.length / blockSize),
    );
  } else {
    for (let i = 0; i <= blockCount - 4; i++) {
      windows.push(
        (energies[i] + energies[i + 1] + energies[i + 2] + energies[i + 3]) / 4,
      );
    }
  }
  const absoluteGated = windows.filter(
    (energy) => -0.691 + 10 * Math.log10(Math.max(1e-16, energy)) > -70,
  );
  const average =
    absoluteGated.reduce((a, b) => a + b, 0) /
    Math.max(1, absoluteGated.length);
  const relativeGated = absoluteGated.filter(
    (energy) => energy >= average * 0.1,
  );
  const gatedEnergy =
    relativeGated.reduce((a, b) => a + b, 0) /
    Math.max(1, relativeGated.length);
  return {
    lufs: Math.max(-70, -0.691 + 10 * Math.log10(Math.max(1e-16, gatedEnergy))),
    peak: gainToDb(peak),
    rms: gainToDb(Math.sqrt(sum / (buffer.length * channels))),
    lowRatio: lowSum / Math.max(1e-10, sum),
    clipped: clippedSamples > buffer.length * channels * 0.0002,
  };
}

export async function masterAudio(
  input: AudioBuffer,
  settings: MasteringSettings,
  analysis: AudioAnalysis,
  progress: (message: string, amount: number) => void,
  signal?: AbortSignal,
): Promise<{ buffer: AudioBuffer; analysis: AudioAnalysis }> {
  progress("Clearing space in the low end", 18);
  await checkpoint(signal);
  const offline = new OfflineAudioContext(2, input.length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = input;
  const highpass = offline.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 27;
  highpass.Q.value = 0.707;
  const bass = offline.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 105;
  bass.gain.value =
    settings.bass - Math.max(0, Math.min(1.5, (analysis.lowRatio - 0.42) * 5));
  const mud = offline.createBiquadFilter();
  mud.type = "peaking";
  mud.frequency.value = 290;
  mud.Q.value = 0.65;
  mud.gain.value = -Math.max(0.25, Math.min(1.8, analysis.lowRatio * 3));
  const air = offline.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 8500;
  air.gain.value = settings.air;
  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -20 - settings.glue * 0.07;
  compressor.knee.value = 12;
  compressor.ratio.value = 1 + settings.glue * 0.027;
  compressor.attack.value = 0.028;
  compressor.release.value = 0.19;
  source
    .connect(highpass)
    .connect(bass)
    .connect(mud)
    .connect(air)
    .connect(compressor)
    .connect(offline.destination);
  source.start();
  progress("Finding the glue, keeping the dynamics", 32);
  const processed = await offline.startRendering();
  signal?.throwIfAborted();
  const left = processed.getChannelData(0);
  const right = processed.getChannelData(1);
  const saturationMix = (settings.warmth / 100) * 0.3;
  const drive = 1 + (settings.warmth / 100) * 1.8;
  const width = settings.width / 100;
  const sideCoefficient = 1 - Math.exp((-2 * Math.PI * 115) / SAMPLE_RATE);
  let lowSide = 0;
  for (let i = 0; i < processed.length; i++) {
    let l = left[i];
    let r = right[i];
    if (saturationMix > 0) {
      l =
        l * (1 - saturationMix) +
        (Math.tanh(l * drive) / drive) * saturationMix;
      r =
        r * (1 - saturationMix) +
        (Math.tanh(r * drive) / drive) * saturationMix;
    }
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    lowSide += sideCoefficient * (side - lowSide);
    const shapedSide = (side - lowSide) * width + lowSide * 0.55;
    left[i] = mid + shapedSide;
    right[i] = mid - shapedSide;
    if (i > 0 && i % 500000 === 0) await checkpoint(signal);
  }
  progress("Measuring perceptual loudness", 52);
  const shapedAnalysis = await analyzeAudio(processed, signal);
  const gain = dbToGain(Math.min(20, settings.loudness - shapedAnalysis.lufs));
  for (let i = 0; i < processed.length; i++) {
    left[i] *= gain;
    right[i] *= gain;
  }
  progress("Catching peaks, not crushing them", 70);
  await checkpoint(signal);
  // Stereo-linked 5 ms lookahead limiter. A bounded deque keeps the pass O(n).
  const lookahead = 240;
  const queueSize = lookahead + 3;
  const queueIndices = new Int32Array(queueSize);
  const queueValues = new Float32Array(queueSize);
  let head = 0,
    tail = 0,
    envelope = 1;
  const release = Math.exp(-1 / (SAMPLE_RATE * 0.085));
  const ceiling = dbToGain(CEILING_DB - 0.18);
  for (let scan = 0; scan < processed.length + lookahead; scan++) {
    if (scan < processed.length) {
      const value = Math.max(Math.abs(left[scan]), Math.abs(right[scan]));
      while (
        tail !== head &&
        queueValues[(tail - 1 + queueSize) % queueSize] <= value
      )
        tail = (tail - 1 + queueSize) % queueSize;
      queueIndices[tail] = scan;
      queueValues[tail] = value;
      tail = (tail + 1) % queueSize;
    }
    const i = scan - lookahead;
    if (i < 0) continue;
    while (head !== tail && queueIndices[head] < i)
      head = (head + 1) % queueSize;
    const maximum = head === tail ? 0 : queueValues[head];
    const target = Math.min(1, ceiling / Math.max(1e-10, maximum));
    envelope =
      target < envelope ? target : release * envelope + (1 - release) * target;
    left[i] = Math.max(-ceiling, Math.min(ceiling, left[i] * envelope));
    right[i] = Math.max(-ceiling, Math.min(ceiling, right[i] * envelope));
    if (scan > 0 && scan % 500000 === 0) await checkpoint(signal);
  }
  progress("Checking inter-sample peaks", 86);
  const truePeak = await measureTruePeak(processed, signal);
  const peakCorrection = Math.min(
    1,
    dbToGain(CEILING_DB - 0.1) / Math.max(1e-8, truePeak),
  );
  if (peakCorrection < 1) {
    for (let i = 0; i < processed.length; i++) {
      left[i] *= peakCorrection;
      right[i] *= peakCorrection;
    }
  }
  progress("One last listen. All done.", 95);
  const finalAnalysis = await analyzeAudio(processed, signal);
  finalAnalysis.peak = gainToDb(truePeak * peakCorrection);
  return { buffer: processed, analysis: finalAnalysis };
}

// 4x, 64-tap Kaiser-windowed sinc interpolation. Chunk overlap bounds meter memory.
export async function measureTruePeak(
  buffer: AudioBuffer,
  signal?: AbortSignal,
): Promise<number> {
  const taps = 64;
  const half = taps / 2;
  const besselI0 = (x: number) => {
    let sum = 1,
      term = 1;
    for (let j = 1; j < 35; j++) {
      term *= (x * x) / (4 * j * j);
      sum += term;
      if (term < sum * 1e-14) break;
    }
    return sum;
  };
  const normalization = besselI0(9);
  const kernels = [0.25, 0.5, 0.75].map((phase) => {
    const values = Float64Array.from({ length: taps }, (_, k) => {
      const x = k - (half - 1) - phase;
      const sinc =
        Math.abs(x) < 1e-10 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      return (
        (sinc *
          besselI0(9 * Math.sqrt(Math.max(0, 1 - (x * x) / (half * half))))) /
        normalization
      );
    });
    const sum = values.reduce((a, b) => a + b, 0);
    return values.map((value) => value / sum);
  });
  const [quarter, midpoint, threeQuarter] = kernels;
  const chunkSize = SAMPLE_RATE * 4;
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let frame = 0; frame < data.length; frame += chunkSize) {
      signal?.throwIfAborted();
      const count = Math.min(chunkSize, data.length - frame);
      const finalChunk = frame + count === data.length;
      const samples = new Float32Array(count + taps + (finalChunk ? half : 0));
      const first = Math.max(0, frame - half);
      const last = Math.min(data.length, frame + count + half);
      samples.set(data.subarray(first, last), first - frame + half);
      for (let i = 0; i < count + (finalChunk ? half : 0); i++) {
        let a = 0,
          b = 0,
          c = 0;
        for (let k = 0; k < taps; k++) {
          const value = samples[i + k + 1];
          a += value * quarter[k];
          b += value * midpoint[k];
          c += value * threeQuarter[k];
        }
        peak = Math.max(
          peak,
          Math.abs(samples[i + half]),
          Math.abs(a),
          Math.abs(b),
          Math.abs(c),
        );
      }
      await checkpoint(signal);
    }
  }
  return peak;
}

export async function encodeWav24(
  buffer: AudioBuffer,
  progress?: (value: number) => void,
): Promise<Blob> {
  const channels = Math.min(2, buffer.numberOfChannels);
  const dataSize = buffer.length * channels * 3;
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * channels * 3, true);
  view.setUint16(32, channels * 3, true);
  view.setUint16(34, 24, true);
  text(36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = Array.from({ length: channels }, (_, c) =>
    buffer.getChannelData(c),
  );
  let offset = 44;
  let seed = 0x50464d31;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      const value = Math.max(
        -8388608,
        Math.min(8388607, Math.round(sample * 8388607 + random() - random())),
      );
      view.setUint8(offset++, value & 0xff);
      view.setUint8(offset++, (value >> 8) & 0xff);
      view.setUint8(offset++, (value >> 16) & 0xff);
    }
    if (i % 200000 === 0) {
      progress?.(i / buffer.length);
      await yieldToBrowser();
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function createDemo(context: AudioContext): Promise<AudioBuffer> {
  const duration = 24;
  const buffer = context.createBuffer(2, duration * SAMPLE_RATE, SAMPLE_RATE);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const beat = 60 / 100;
  const chords = [
    [146.832, 174.614, 220],
    [116.541, 146.832, 174.614],
    [130.813, 164.814, 196],
    [110, 130.813, 164.814],
  ];
  let seed = 1337;
  let noiseLow = 0;
  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE;
    const chord = chords[Math.floor(t / (beat * 4)) % chords.length];
    const b = t % beat;
    const kick =
      Math.sin(2 * Math.PI * (47 * b + 7 * (1 - Math.exp(-b * 32)))) *
      Math.exp(-b * 16) *
      0.32;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = (seed >>> 0) / 2147483648 - 1;
    noiseLow += 0.25 * (noise - noiseLow);
    const hatTime = t % (beat / 2);
    const hat = (noise - noiseLow) * Math.exp(-hatTime * 90) * 0.06;
    const snareTime = (t + beat) % (beat * 2);
    const snare =
      (noise * 0.7 + Math.sin(snareTime * 2 * Math.PI * 185) * 0.3) *
      Math.exp(-snareTime * 24) *
      0.12;
    let padL = 0,
      padR = 0;
    for (const frequency of chord) {
      const movement = 0.7 + 0.3 * Math.sin(t * 0.8);
      padL +=
        (Math.sin(2 * Math.PI * frequency * t) +
          Math.sin(2 * Math.PI * frequency * 2.001 * t) * 0.18) *
        0.025 *
        movement;
      padR +=
        (Math.sin(2 * Math.PI * frequency * 1.0008 * t) +
          Math.sin(2 * Math.PI * frequency * 1.999 * t) * 0.18) *
        0.025 *
        movement;
    }
    const step = Math.floor(t / (beat / 2));
    const pluckFrequency = chord[[0, 2, 1, 2, 0, 1, 2, 1][step % 8]] * 4;
    const pluck =
      (Math.sin(2 * Math.PI * pluckFrequency * t) +
        Math.sin(2 * Math.PI * pluckFrequency * 2 * t) * 0.2) *
      Math.exp(-hatTime * 9) *
      0.045;
    const bass =
      Math.sin(2 * Math.PI * chord[0] * 0.5 * t) *
      (0.8 + 0.2 * Math.exp(-b * 8)) *
      0.1;
    const fade = Math.min(1, t / 0.15, (duration - t) / 1.2);
    const mono = kick + snare + hat + bass + pluck;
    left[i] = (mono + padL) * fade;
    right[i] = (mono + padR + pluck * Math.sin(t * 0.4) * 0.1) * fade;
    if (i % 250000 === 0) await yieldToBrowser();
  }
  return buffer;
}
