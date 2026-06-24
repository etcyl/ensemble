import type { DrumPattern, DrumVoice, HarmonizeSettings, InstrumentSound, Note, Track } from "../types";
import { defaultFx } from "../types";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export interface Progression { id: string; name: string; degrees: number[]; }

// degrees are 0-based scale degrees (0 = I/i, 4 = V/v, 5 = vi/VI, ...)
export const PROGRESSIONS: Progression[] = [
  { id: "pop", name: "Pop (I-V-vi-IV)", degrees: [0, 4, 5, 3] },
  { id: "ballad", name: "Ballad (I-vi-IV-V)", degrees: [0, 5, 3, 4] },
  { id: "sad", name: "Emotional (vi-IV-I-V)", degrees: [5, 3, 0, 4] },
  { id: "jazz", name: "Jazz (ii-V-I-vi)", degrees: [1, 4, 0, 5] },
  { id: "epic", name: "Epic (i-VI-III-VII)", degrees: [0, 5, 2, 6] },
  { id: "drive", name: "Driving (I-IV-V-IV)", degrees: [0, 3, 4, 3] },
];

export interface Style { id: string; name: string; arp: number; swing: number; }
export const STYLES: Style[] = [
  { id: "pop", name: "Pop", arp: 8, swing: 0 },
  { id: "rock", name: "Rock", arp: 8, swing: 0 },
  { id: "lofi", name: "Lo-Fi", arp: 8, swing: 0.32 },
  { id: "cinematic", name: "Cinematic", arp: 4, swing: 0 },
  { id: "funk", name: "Funk", arp: 16, swing: 0.2 },
  { id: "edm", name: "EDM", arp: 16, swing: 0 },
];

export function defaultHarmonize(): HarmonizeSettings {
  return {
    key: 0,
    scale: "minor",
    progressionId: "pop",
    energy: 0.5,
    instruments: ["bass", "keys", "pluck"],
    octave: { bass: 0, keys: 0, pluck: 1, lead: 1 },
    style: "pop",
    addDrums: false,
  };
}

const row16 = () => new Array(16).fill(false) as boolean[];

// Build a drum pattern that fits a style and energy. Returns the per-voice grid.
export function generateBeat(
  energy: number,
  styleId: string
): Record<DrumVoice, boolean[]> {
  const v: Record<DrumVoice, boolean[]> = {
    kick: row16(), snare: row16(), hat: row16(), clap: row16(), tom: row16(), ride: row16(),
  };
  const hi = energy > 0.66, mid = energy > 0.33;
  const hats = (every: number) => { for (let i = 0; i < 16; i += every) v.hat[i] = true; };
  switch (styleId) {
    case "edm":
      [0, 4, 8, 12].forEach((i) => (v.kick[i] = true));
      [4, 12].forEach((i) => (v.clap[i] = true));
      [2, 6, 10, 14].forEach((i) => (v.hat[i] = true));
      hats(hi ? 1 : 2);
      break;
    case "funk":
      [0, 6, 10].forEach((i) => (v.kick[i] = true));
      [4, 12].forEach((i) => (v.snare[i] = true));
      hats(1);
      if (hi) [7, 15].forEach((i) => (v.snare[i] = true));
      break;
    case "cinematic":
      v.kick[0] = true; if (mid) v.kick[8] = true;
      v.tom[6] = v.tom[14] = true;
      v.ride[0] = v.ride[8] = true;
      break;
    case "lofi":
      v.kick[0] = true; v.kick[10] = true;
      v.snare[4] = v.snare[12] = true;
      hats(2);
      break;
    case "rock":
      v.kick[0] = v.kick[8] = true; if (hi) v.kick[10] = true;
      v.snare[4] = v.snare[12] = true;
      hats(hi ? 1 : 2);
      break;
    default: // pop
      v.kick[0] = v.kick[8] = true; if (hi) { v.kick[4] = true; v.kick[12] = true; }
      v.snare[4] = v.snare[12] = true;
      hats(hi ? 1 : 2);
      if (mid) v.hat[2] = v.hat[6] = v.hat[10] = v.hat[14] = true;
  }
  return v;
}

const COLORS: Record<InstrumentSound, string> = {
  bass: "#6f93d9",
  keys: "#a986ba",
  pluck: "#7fae9c",
  lead: "#e8b04b",
};
const NAMES: Record<InstrumentSound, string> = {
  bass: "Bass",
  keys: "Keys",
  pluck: "Arp",
  lead: "Lead",
};

// scale degree -> midi (degree can exceed 6, wrapping up octaves)
function degToMidi(rootMidi: number, intervals: number[], degree: number): number {
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return rootMidi + 12 * oct + intervals[idx];
}

function triad(rootMidi: number, intervals: number[], degree: number): number[] {
  return [degree, degree + 2, degree + 4].map((d) => degToMidi(rootMidi, intervals, d));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function mkTrack(sound: InstrumentSound, notes: Note[]): Track {
  return {
    id: uid(),
    name: NAMES[sound],
    type: "instrument",
    color: COLORS[sound],
    volume: sound === "bass" ? 0.95 : sound === "keys" ? 0.7 : 0.8,
    pan: sound === "pluck" ? 0.25 : sound === "keys" ? -0.2 : 0,
    muted: false,
    soloed: false,
    armed: false,
    clips: [],
    fx: defaultFx(),
    instrument: { sound, notes },
  };
}

// Build instrument tracks that fit the chosen key/scale/progression and match
// the busyness of the current drum pattern. Deterministic given the settings,
// so the fine-tuning controls always produce a predictable result.
export function generateHarmony(
  s: HarmonizeSettings,
  bars: number,
  drum: DrumPattern
): Track[] {
  const intervals = SCALES[s.scale];
  const prog = PROGRESSIONS.find((p) => p.id === s.progressionId) ?? PROGRESSIONS[0];
  const style = STYLES.find((x) => x.id === s.style) ?? STYLES[0];
  const baseRoot = 48 + s.key; // C3-ish
  const vel = 0.5 + s.energy * 0.5;
  const hatHits = drum.voices.hat.filter(Boolean).length;

  const tracks: Track[] = [];

  const chordForBar = (bar: number) => {
    const degree = prog.degrees[bar % prog.degrees.length];
    return triad(baseRoot, intervals, degree);
  };

  if (s.instruments.includes("bass")) {
    const notes: Note[] = [];
    const oct = s.octave.bass * 12;
    for (let bar = 0; bar < bars; bar++) {
      const root = chordForBar(bar)[0] - 12 + oct; // an octave below the chord
      const base = bar * 16;
      if (s.energy < 0.34) notes.push({ step: base, midi: root, len: 16, vel });
      else if (s.energy < 0.67) {
        notes.push({ step: base, midi: root, len: 8, vel });
        notes.push({ step: base + 8, midi: root, len: 8, vel });
      } else {
        for (let q = 0; q < 4; q++)
          notes.push({ step: base + q * 4, midi: q === 3 ? root + 7 : root, len: 4, vel });
      }
    }
    tracks.push(mkTrack("bass", notes));
  }

  if (s.instruments.includes("keys")) {
    const notes: Note[] = [];
    const oct = s.octave.keys * 12;
    for (let bar = 0; bar < bars; bar++) {
      for (const m of chordForBar(bar))
        notes.push({ step: bar * 16, midi: m + oct, len: 16, vel: vel * 0.8 });
    }
    tracks.push(mkTrack("keys", notes));
  }

  if (s.instruments.includes("pluck")) {
    const notes: Note[] = [];
    const oct = s.octave.pluck * 12;
    // arp rate follows the style baseline, nudged by hat density + energy
    const busy = hatHits >= 8 || s.energy > 0.75;
    const calm = hatHits < 4 && s.energy < 0.4;
    const subdiv = busy ? Math.max(style.arp, 8) : calm ? Math.min(style.arp, 4) : style.arp;
    const stepLen = 16 / subdiv;
    for (let bar = 0; bar < bars; bar++) {
      const chord = chordForBar(bar);
      for (let j = 0; j < subdiv; j++) {
        const tone = chord[j % chord.length] + (Math.floor(j / chord.length) % 2 ? 12 : 0);
        notes.push({ step: bar * 16 + j * stepLen, midi: tone + oct, len: stepLen, vel: vel * 0.8 });
      }
    }
    tracks.push(mkTrack("pluck", notes));
  }

  if (s.instruments.includes("lead")) {
    const notes: Note[] = [];
    const oct = s.octave.lead * 12;
    for (let bar = 0; bar < bars; bar++) {
      const chord = chordForBar(bar);
      const top = chord[2] + 12 + oct;
      notes.push({ step: bar * 16, midi: top, len: 8, vel: vel * 0.7 });
      if (s.energy > 0.5) {
        const next = chordForBar(bar + 1)[0] + 12 + oct;
        notes.push({ step: bar * 16 + 8, midi: next, len: 8, vel: vel * 0.7 });
      }
    }
    tracks.push(mkTrack("lead", notes));
  }

  return tracks;
}
