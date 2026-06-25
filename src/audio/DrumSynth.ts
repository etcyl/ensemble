import type { DrumVoice } from "../types";

// Organically synthesized drum voices (no samples needed).
// Each "sound" is a render function scheduling a one-shot hit at AudioContext time `t`.
// Sounds are grouped by slot (kick/snare/hat/clap/tom/cymbal) so the UI can swap
// any single piece, and "kits" are named presets that pick one sound per slot.

function noiseBuffer(ctx: BaseAudioContext, seconds = 1): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
let cachedNoise: AudioBuffer | null = null;
function getNoise(ctx: BaseAudioContext) {
  if (!cachedNoise || cachedNoise.sampleRate !== ctx.sampleRate)
    cachedNoise = noiseBuffer(ctx);
  return cachedNoise;
}

function env(ctx: BaseAudioContext, t: number, attack: number, decay: number, peak = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

// --- primitives -------------------------------------------------------------
function membrane(
  ctx: BaseAudioContext, dest: AudioNode, t: number,
  type: OscillatorType, f0: number, f1: number, decay: number, gain: number, vel: number
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + decay * 0.5);
  const g = env(ctx, t, 0.002, decay, gain * vel);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

function noiseHit(
  ctx: BaseAudioContext, dest: AudioNode, t: number,
  filter: BiquadFilterType, freq: number, q: number, decay: number, gain: number, vel: number
) {
  const n = ctx.createBufferSource();
  n.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = env(ctx, t, 0.001, decay, gain * vel);
  n.connect(f).connect(g).connect(dest);
  n.start(t);
  n.stop(t + decay + 0.05);
}

type Render = (ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number) => void;
export interface SoundDef { id: string; name: string; render: Render; }

// --- the sound library ------------------------------------------------------
export const DRUM_LIBRARY: Record<DrumVoice, SoundDef[]> = {
  kick: [
    { id: "kick-round", name: "Round", render: (c, d, t, v) => membrane(c, d, t, "sine", 150, 45, 0.32, 1, v) },
    { id: "kick-808", name: "808 Sub", render: (c, d, t, v) => membrane(c, d, t, "sine", 120, 38, 0.7, 1, v) },
    { id: "kick-punch", name: "Punch", render: (c, d, t, v) => { membrane(c, d, t, "sine", 190, 50, 0.16, 1, v); noiseHit(c, d, t, "highpass", 2500, 0.7, 0.02, 0.5, v); } },
    { id: "kick-acoustic", name: "Acoustic", render: (c, d, t, v) => { membrane(c, d, t, "triangle", 160, 58, 0.26, 0.95, v); noiseHit(c, d, t, "lowpass", 400, 0.7, 0.03, 0.3, v); } },
  ],
  snare: [
    { id: "snare-classic", name: "Classic", render: (c, d, t, v) => { noiseHit(c, d, t, "highpass", 1400, 0.7, 0.18, 0.7, v); membrane(c, d, t, "triangle", 190, 180, 0.12, 0.5, v); } },
    { id: "snare-trap", name: "Trap", render: (c, d, t, v) => { noiseHit(c, d, t, "highpass", 1900, 0.7, 0.11, 0.75, v); membrane(c, d, t, "triangle", 230, 220, 0.07, 0.4, v); } },
    { id: "snare-rim", name: "Rimshot", render: (c, d, t, v) => { noiseHit(c, d, t, "bandpass", 2400, 3, 0.05, 0.7, v); membrane(c, d, t, "square", 420, 400, 0.04, 0.3, v); } },
    { id: "snare-acoustic", name: "Acoustic", render: (c, d, t, v) => { noiseHit(c, d, t, "highpass", 1100, 0.6, 0.24, 0.6, v); membrane(c, d, t, "triangle", 170, 150, 0.16, 0.5, v); } },
    { id: "snare-brush", name: "Brush", render: (c, d, t, v) => noiseHit(c, d, t, "bandpass", 3000, 0.8, 0.3, 0.5, v) },
  ],
  hat: [
    { id: "hat-closed", name: "Closed", render: (c, d, t, v) => noiseHit(c, d, t, "highpass", 8000, 0.7, 0.05, 0.4, v) },
    { id: "hat-tight", name: "Tight", render: (c, d, t, v) => noiseHit(c, d, t, "highpass", 9500, 0.7, 0.028, 0.38, v) },
    { id: "hat-open", name: "Open", render: (c, d, t, v) => noiseHit(c, d, t, "highpass", 7000, 0.7, 0.28, 0.32, v) },
    { id: "hat-pedal", name: "Pedal", render: (c, d, t, v) => noiseHit(c, d, t, "highpass", 6000, 0.7, 0.07, 0.3, v) },
  ],
  clap: [
    { id: "clap-clap", name: "Clap", render: (c, d, t, v) => {
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = 0; f.connect(g).connect(d);
      for (let i = 0; i < 3; i++) { const to = t + i * 0.012; g.gain.setValueAtTime(0.6 * v, to); g.gain.exponentialRampToValueAtTime(0.001, to + 0.05); }
      const n = c.createBufferSource(); n.buffer = getNoise(c); n.connect(f); n.start(t); n.stop(t + 0.12);
    } },
    { id: "clap-snap", name: "Snap", render: (c, d, t, v) => noiseHit(c, d, t, "bandpass", 2200, 2, 0.05, 0.6, v) },
    { id: "clap-rim", name: "Rim Click", render: (c, d, t, v) => { noiseHit(c, d, t, "bandpass", 1800, 4, 0.03, 0.6, v); membrane(c, d, t, "square", 500, 480, 0.03, 0.25, v); } },
  ],
  tom: [
    { id: "tom-mid", name: "Mid", render: (c, d, t, v) => membrane(c, d, t, "sine", 220, 90, 0.28, 1, v) },
    { id: "tom-low", name: "Low", render: (c, d, t, v) => membrane(c, d, t, "sine", 150, 62, 0.34, 1, v) },
    { id: "tom-high", name: "High", render: (c, d, t, v) => membrane(c, d, t, "sine", 300, 140, 0.22, 1, v) },
    { id: "tom-floor", name: "Floor", render: (c, d, t, v) => membrane(c, d, t, "triangle", 110, 55, 0.4, 1, v) },
    { id: "tom-roto", name: "Roto", render: (c, d, t, v) => membrane(c, d, t, "sine", 360, 200, 0.18, 0.9, v) },
  ],
  // the 6th slot is a cymbal slot (stored under the legacy key "ride")
  ride: [
    { id: "cym-ride", name: "Ride", render: (c, d, t, v) => noiseHit(c, d, t, "bandpass", 6000, 1.5, 0.5, 0.3, v) },
    { id: "cym-crash", name: "Crash", render: (c, d, t, v) => { noiseHit(c, d, t, "highpass", 5000, 0.5, 1.0, 0.35, v); noiseHit(c, d, t, "bandpass", 9000, 1, 0.9, 0.2, v); } },
    { id: "cym-splash", name: "Splash", render: (c, d, t, v) => noiseHit(c, d, t, "highpass", 7000, 0.6, 0.35, 0.32, v) },
    { id: "cym-bell", name: "Bell", render: (c, d, t, v) => { membrane(c, d, t, "square", 740, 740, 0.5, 0.2, v); noiseHit(c, d, t, "bandpass", 5200, 4, 0.4, 0.2, v); } },
    { id: "cym-china", name: "China", render: (c, d, t, v) => { noiseHit(c, d, t, "highpass", 4000, 0.4, 0.7, 0.4, v); noiseHit(c, d, t, "bandpass", 11000, 0.8, 0.6, 0.25, v); } },
  ],
};

// extra variants appended to keep the diffs small but the palette large
DRUM_LIBRARY.kick.push(
  { id: "kick-tight", name: "Tight", render: (c, d, t, v) => membrane(c, d, t, "sine", 170, 55, 0.12, 1, v) },
  { id: "kick-deep", name: "Deep", render: (c, d, t, v) => membrane(c, d, t, "sine", 110, 35, 0.5, 1, v) },
);
DRUM_LIBRARY.snare.push(
  { id: "snare-deep", name: "Deep", render: (c, d, t, v) => { noiseHit(c, d, t, "highpass", 1000, 0.6, 0.22, 0.6, v); membrane(c, d, t, "triangle", 150, 140, 0.16, 0.5, v); } },
  { id: "snare-clap", name: "Clap-Snare", render: (c, d, t, v) => { noiseHit(c, d, t, "bandpass", 1600, 1, 0.12, 0.7, v); noiseHit(c, d, t, "highpass", 2000, 0.7, 0.08, 0.4, v); } },
);
DRUM_LIBRARY.hat.push(
  { id: "hat-shaker", name: "Shaker", render: (c, d, t, v) => noiseHit(c, d, t, "bandpass", 9000, 0.6, 0.06, 0.3, v) },
  { id: "hat-wide", name: "Wide Open", render: (c, d, t, v) => noiseHit(c, d, t, "highpass", 6500, 0.6, 0.45, 0.3, v) },
);
DRUM_LIBRARY.clap.push(
  { id: "clap-808", name: "808 Clap", render: (c, d, t, v) => noiseHit(c, d, t, "bandpass", 1400, 1.2, 0.14, 0.6, v) },
);

export interface Kit { id: string; name: string; sounds: Record<DrumVoice, string>; }

export const DRUM_KITS: Kit[] = [
  { id: "studio", name: "Studio", sounds: { kick: "kick-round", snare: "snare-classic", hat: "hat-closed", clap: "clap-clap", tom: "tom-mid", ride: "cym-ride" } },
  { id: "trap", name: "808 / Trap", sounds: { kick: "kick-808", snare: "snare-trap", hat: "hat-tight", clap: "clap-snap", tom: "tom-low", ride: "cym-crash" } },
  { id: "acoustic", name: "Acoustic", sounds: { kick: "kick-acoustic", snare: "snare-acoustic", hat: "hat-pedal", clap: "clap-rim", tom: "tom-high", ride: "cym-ride" } },
  { id: "punchy", name: "Punchy Pop", sounds: { kick: "kick-punch", snare: "snare-classic", hat: "hat-tight", clap: "clap-clap", tom: "tom-mid", ride: "cym-splash" } },
  { id: "lofi", name: "Lo-Fi", sounds: { kick: "kick-808", snare: "snare-brush", hat: "hat-open", clap: "clap-snap", tom: "tom-floor", ride: "cym-bell" } },
  { id: "house", name: "House", sounds: { kick: "kick-tight", snare: "snare-clap", hat: "hat-shaker", clap: "clap-808", tom: "tom-mid", ride: "cym-splash" } },
  { id: "techno", name: "Techno", sounds: { kick: "kick-deep", snare: "snare-rim", hat: "hat-tight", clap: "clap-808", tom: "tom-roto", ride: "cym-china" } },
  { id: "rock", name: "Rock", sounds: { kick: "kick-punch", snare: "snare-deep", hat: "hat-closed", clap: "clap-clap", tom: "tom-floor", ride: "cym-crash" } },
  { id: "jazz", name: "Jazz Brush", sounds: { kick: "kick-round", snare: "snare-brush", hat: "hat-pedal", clap: "clap-rim", tom: "tom-high", ride: "cym-ride" } },
  { id: "edm", name: "EDM", sounds: { kick: "kick-deep", snare: "snare-clap", hat: "hat-wide", clap: "clap-808", tom: "tom-roto", ride: "cym-china" } },
];

export function defaultKit(): Kit {
  return DRUM_KITS[0];
}
export function defaultSounds(): Record<DrumVoice, string> {
  return { ...DRUM_KITS[0].sounds };
}

function lookup(voice: DrumVoice, soundId: string | undefined): SoundDef {
  const list = DRUM_LIBRARY[voice];
  return list.find((s) => s.id === soundId) ?? list[0];
}

// schedule a hit using the selected sound for that slot
export function playDrum(
  ctx: BaseAudioContext, dest: AudioNode, voice: DrumVoice,
  soundId: string | undefined, t: number, velocity = 1
) {
  lookup(voice, soundId).render(ctx, dest, t, velocity);
}
