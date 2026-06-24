import type { TrackAnalysis } from "../types";

// Lightweight, dependency-free audio analysis. These are estimates meant to be
// shown to the user and corrected, not ground truth: tempo, "frenticism"
// (onset density + loudness), musical key/scale, and which pitch classes are in use.

// --- iterative radix-2 FFT (in-place) --------------------------------------
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = cr * re[b] - ci * im[b];
        const ti = cr * im[b] + ci * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// Krumhansl-Schmuckler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(chroma: number[], profile: number[], shift: number): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[(i + shift) % 12] * profile[i];
  return sum;
}

function mono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / ch;
  }
  return out;
}

export function analyzeBuffer(
  buffer: AudioBuffer,
  sourceTrackId: string,
  sourceName: string
): TrackAnalysis {
  const data = mono(buffer);
  const sr = buffer.sampleRate;
  const N = 4096;
  const hop = 2048;
  const chroma = new Array(12).fill(0);
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

  // onset envelope for tempo + frenticism
  const onsets: number[] = [];
  let prevEnergy = 0;
  let rmsSum = 0, rmsCount = 0;

  for (let start = 0; start + N <= data.length; start += hop) {
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    let e = 0;
    for (let i = 0; i < N; i++) {
      const s = data[start + i];
      re[i] = s * hann[i];
      e += s * s;
    }
    rmsSum += e; rmsCount++;
    onsets.push(Math.max(0, e - prevEnergy));
    prevEnergy = e;

    fft(re, im);
    for (let bin = 1; bin < N / 2; bin++) {
      const freq = (bin * sr) / N;
      if (freq < 80 || freq > 2000) continue;
      const mag = Math.hypot(re[bin], im[bin]);
      const pc = ((Math.round(12 * Math.log2(freq / 440)) % 12) + 12 + 9) % 12; // A=440 -> map so C=0
      chroma[pc] += mag;
    }
  }

  // normalize chroma
  const cmax = Math.max(...chroma, 1e-9);
  const normChroma = chroma.map((v) => v / cmax);

  // key detection
  let best = { score: -Infinity, key: 0, scale: "major" as "major" | "minor" };
  for (let k = 0; k < 12; k++) {
    const maj = correlate(normChroma, MAJOR_PROFILE, k);
    const min = correlate(normChroma, MINOR_PROFILE, k);
    if (maj > best.score) best = { score: maj, key: k, scale: "major" };
    if (min > best.score) best = { score: min, key: k, scale: "minor" };
  }

  // notes in use: pitch classes above 45% of the strongest
  const notes = normChroma
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v > 0.45)
    .sort((a, b) => b.v - a.v)
    .map((x) => x.i);

  // tempo via autocorrelation of the onset envelope
  const bpm = estimateTempo(onsets, sr / hop);

  // frenticism: blend of onset density and loudness
  const onsetMean = onsets.reduce((a, b) => a + b, 0) / Math.max(1, onsets.length);
  const onsetPeak = Math.max(...onsets, 1e-9);
  const density = Math.min(1, onsetMean / onsetPeak * 4);
  const rms = Math.sqrt(rmsSum / Math.max(1, rmsCount) / N);
  const energy = Math.max(0, Math.min(1, 0.55 * density + 0.45 * Math.min(1, rms * 6)));

  return {
    sourceTrackId,
    sourceName,
    bpm,
    energy,
    key: best.key,
    scale: best.scale,
    noteStrengths: normChroma,
    notes: notes.length ? notes : [best.key],
  };
}

function estimateTempo(onsets: number[], fps: number): number {
  // search lags for 60..180 BPM
  const minLag = Math.floor((fps * 60) / 180);
  const maxLag = Math.ceil((fps * 60) / 60);
  let bestLag = minLag, bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < onsets.length; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < onsets.length; i++) sum += onsets[i] * onsets[i + lag];
    if (sum > bestVal) { bestVal = sum; bestLag = lag; }
  }
  const bpm = (fps * 60) / bestLag;
  return Math.max(60, Math.min(180, Math.round(bpm)));
}
