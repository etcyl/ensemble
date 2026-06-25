// Synthesized melodic instruments (no samples). A small param-driven voice engine
// powers a broad, growable library of sounds - all generated, nothing to download.

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// the four roles the Harmonize generator targets (kept stable for its octave map)
export type InstrumentRole = "bass" | "keys" | "pluck" | "lead";
export const INSTRUMENTS: { id: InstrumentRole; name: string }[] = [
  { id: "bass", name: "Bass" },
  { id: "keys", name: "Keys / Pad" },
  { id: "pluck", name: "Pluck / Arp" },
  { id: "lead", name: "Lead" },
];

interface OscSpec { type: OscillatorType; detune?: number; octave?: number; gain?: number; }
interface VoiceParams {
  oscs: OscSpec[];
  filter?: { type: BiquadFilterType; freq: number; q?: number; envAmt?: number; sweepTo?: number };
  amp: { a: number; d: number; s: number; r: number };
  gain?: number;
  vibrato?: { rate: number; depth: number };
  noise?: number; // attack/breath noise amount
}

export interface SoundDef { id: string; name: string; category: string; params: VoiceParams; }

function adsr(param: AudioParam, t: number, dur: number, a: number, d: number, s: number, r: number, peak: number) {
  const sustain = peak * s;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.linearRampToValueAtTime(sustain, t + a + d);
  param.setValueAtTime(sustain, t + Math.max(a + d, dur));
  param.exponentialRampToValueAtTime(0.0001, t + Math.max(a + d, dur) + r);
}

let noiseBuf: AudioBuffer | null = null;
function getNoise(ctx: BaseAudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function renderVoice(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, midi: number, t: number, dur: number, vel: number) {
  const freq = midiToFreq(midi);
  const amp = ctx.createGain();
  let node: AudioNode = amp;

  // optional filter between oscillators and amp
  let oscDest: AudioNode = amp;
  let filter: BiquadFilterNode | null = null;
  if (p.filter) {
    filter = ctx.createBiquadFilter();
    filter.type = p.filter.type;
    filter.Q.value = p.filter.q ?? 0.8;
    const base = p.filter.freq;
    if (p.filter.sweepTo != null) {
      filter.frequency.setValueAtTime(base, t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, p.filter.sweepTo), t + Math.min(0.4, dur));
    } else filter.frequency.value = base;
    filter.connect(amp);
    oscDest = filter;
  }

  const stop = t + Math.max(p.amp.a + p.amp.d, dur) + p.amp.r + 0.1;
  const oscNodes: OscillatorNode[] = [];
  for (const o of p.oscs) {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = freq * Math.pow(2, o.octave ?? 0);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1 / p.oscs.length;
    osc.connect(g).connect(oscDest);
    osc.start(t);
    osc.stop(stop);
    oscNodes.push(osc);
  }
  if (p.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = p.vibrato.rate;
    const lg = ctx.createGain();
    lg.gain.value = freq * p.vibrato.depth;
    lfo.connect(lg);
    oscNodes.forEach((o) => lg.connect(o.frequency));
    lfo.connect(lg);
    lfo.start(t);
    lfo.stop(stop);
  }
  if (p.noise) {
    const n = ctx.createBufferSource();
    n.buffer = getNoise(ctx);
    const ng = ctx.createGain();
    ng.gain.value = 0;
    adsr(ng.gain, t, Math.min(dur, 0.15), 0.002, 0.08, 0, 0.05, p.noise * vel);
    n.connect(ng).connect(oscDest);
    n.start(t);
    n.stop(t + 0.3);
  }

  adsr(amp.gain, t, dur, p.amp.a, p.amp.d, p.amp.s, p.amp.r, (p.gain ?? 0.8) * vel);
  node.connect(dest);
}

// ---- the library --------------------------------------------------------
export const SOUND_LIBRARY: SoundDef[] = [
  // Bass
  { id: "bass", name: "Saw Bass", category: "Bass", params: { oscs: [{ type: "sawtooth" }, { type: "sine", octave: -1, gain: 0.5 }], filter: { type: "lowpass", freq: 900, sweepTo: 220 }, amp: { a: 0.006, d: 0.08, s: 0.75, r: 0.08 } } },
  { id: "subbass", name: "Sub Bass", category: "Bass", params: { oscs: [{ type: "sine" }], filter: { type: "lowpass", freq: 200 }, amp: { a: 0.01, d: 0.1, s: 0.9, r: 0.1 }, gain: 0.9 } },
  { id: "reese", name: "Reese Bass", category: "Bass", params: { oscs: [{ type: "sawtooth", detune: -14 }, { type: "sawtooth", detune: 14 }], filter: { type: "lowpass", freq: 700, q: 4 }, amp: { a: 0.01, d: 0.1, s: 0.8, r: 0.1 } } },
  { id: "fingerbass", name: "Finger Bass", category: "Bass", params: { oscs: [{ type: "triangle" }, { type: "sine", octave: -1, gain: 0.4 }], filter: { type: "lowpass", freq: 1100, sweepTo: 300 }, amp: { a: 0.004, d: 0.12, s: 0.5, r: 0.1 } } },
  // Keys
  { id: "keys", name: "Soft Pad Keys", category: "Keys", params: { oscs: [{ type: "triangle" }, { type: "triangle", detune: 6 }, { type: "triangle", detune: -6 }], filter: { type: "lowpass", freq: 2600 }, amp: { a: 0.04, d: 0.2, s: 0.7, r: 0.25 }, gain: 0.6 } },
  { id: "epiano", name: "Electric Piano", category: "Keys", params: { oscs: [{ type: "sine" }, { type: "sine", octave: 1, gain: 0.25 }], filter: { type: "lowpass", freq: 3200 }, amp: { a: 0.003, d: 0.4, s: 0.3, r: 0.2 }, gain: 0.7 } },
  { id: "organ", name: "Drawbar Organ", category: "Keys", params: { oscs: [{ type: "sine" }, { type: "sine", octave: 1, gain: 0.4 }, { type: "sine", octave: 2, gain: 0.2 }], amp: { a: 0.01, d: 0.05, s: 0.95, r: 0.08 }, gain: 0.55 } },
  { id: "clav", name: "Clavinet", category: "Keys", params: { oscs: [{ type: "square" }], filter: { type: "bandpass", freq: 1800, q: 2 }, amp: { a: 0.002, d: 0.12, s: 0.2, r: 0.08 }, gain: 0.6 } },
  // Pads
  { id: "warmpad", name: "Warm Pad", category: "Pads", params: { oscs: [{ type: "sawtooth", detune: -8 }, { type: "sawtooth", detune: 8 }], filter: { type: "lowpass", freq: 1800 }, amp: { a: 0.4, d: 0.4, s: 0.8, r: 0.6 }, gain: 0.45 } },
  { id: "strings", name: "Strings", category: "Pads", params: { oscs: [{ type: "sawtooth", detune: -6 }, { type: "sawtooth", detune: 6 }, { type: "sawtooth", octave: 1, gain: 0.2 }], filter: { type: "lowpass", freq: 3000 }, amp: { a: 0.18, d: 0.3, s: 0.85, r: 0.4 }, vibrato: { rate: 5, depth: 0.004 }, gain: 0.45 } },
  { id: "choir", name: "Choir Aah", category: "Pads", params: { oscs: [{ type: "sawtooth", detune: -5 }, { type: "sawtooth", detune: 5 }], filter: { type: "bandpass", freq: 1200, q: 1.5 }, amp: { a: 0.25, d: 0.3, s: 0.8, r: 0.5 }, vibrato: { rate: 5.5, depth: 0.006 }, gain: 0.5 } },
  // Plucks / synth
  { id: "pluck", name: "Pluck", category: "Plucks", params: { oscs: [{ type: "triangle" }], filter: { type: "highpass", freq: 180 }, amp: { a: 0.003, d: 0.12, s: 0.3, r: 0.08 }, gain: 0.7 } },
  { id: "synthpluck", name: "Synth Pluck", category: "Plucks", params: { oscs: [{ type: "sawtooth" }], filter: { type: "lowpass", freq: 2400, sweepTo: 700 }, amp: { a: 0.002, d: 0.14, s: 0.15, r: 0.08 }, gain: 0.6 } },
  { id: "harp", name: "Harp", category: "Plucks", params: { oscs: [{ type: "triangle" }, { type: "sine", octave: 1, gain: 0.3 }], amp: { a: 0.002, d: 0.5, s: 0.1, r: 0.3 }, gain: 0.6 } },
  // Leads
  { id: "lead", name: "Square Lead", category: "Leads", params: { oscs: [{ type: "square" }], filter: { type: "lowpass", freq: 3200 }, amp: { a: 0.01, d: 0.06, s: 0.8, r: 0.12 }, vibrato: { rate: 5.5, depth: 0.006 }, gain: 0.55 } },
  { id: "sawlead", name: "Saw Lead", category: "Leads", params: { oscs: [{ type: "sawtooth" }, { type: "sawtooth", detune: 8, gain: 0.4 }], filter: { type: "lowpass", freq: 3600 }, amp: { a: 0.008, d: 0.08, s: 0.8, r: 0.12 }, gain: 0.5 } },
  { id: "flute", name: "Flute", category: "Leads", params: { oscs: [{ type: "sine" }], amp: { a: 0.06, d: 0.1, s: 0.85, r: 0.15 }, vibrato: { rate: 5, depth: 0.005 }, noise: 0.25, gain: 0.6 } },
  // Bells / mallets
  { id: "bells", name: "Bells", category: "Bells", params: { oscs: [{ type: "sine" }, { type: "sine", octave: 2, gain: 0.3 }], amp: { a: 0.002, d: 0.8, s: 0.05, r: 0.5 }, gain: 0.55 } },
  { id: "marimba", name: "Marimba", category: "Bells", params: { oscs: [{ type: "sine" }, { type: "sine", octave: 1, gain: 0.2 }], amp: { a: 0.002, d: 0.25, s: 0.02, r: 0.15 }, gain: 0.65 } },
  // Brass
  { id: "brass", name: "Synth Brass", category: "Brass", params: { oscs: [{ type: "sawtooth", detune: -4 }, { type: "sawtooth", detune: 4 }], filter: { type: "lowpass", freq: 2400, sweepTo: 1600 }, amp: { a: 0.05, d: 0.1, s: 0.8, r: 0.15 }, gain: 0.5 } },
];

const BY_ID = new Map(SOUND_LIBRARY.map((s) => [s.id, s]));
export function soundCategories(): string[] {
  return Array.from(new Set(SOUND_LIBRARY.map((s) => s.category)));
}

export function playNote(ctx: BaseAudioContext, dest: AudioNode, sound: string, midi: number, t: number, dur: number, vel = 0.8) {
  const def = BY_ID.get(sound) ?? BY_ID.get("keys")!;
  renderVoice(ctx, dest, def.params, midi, t, dur, vel);
}
