export type TrackType = "audio" | "drum" | "instrument";

export type InstrumentSound = "bass" | "keys" | "pluck" | "lead";

// a note placed on the arrangement grid (16th-note steps from bar 1)
export interface Note {
  step: number; // absolute 16th-note index in the arrangement
  midi: number; // pitch
  len: number; // length in 16th steps
  vel?: number; // 0..1
}

export interface InstrumentConfig {
  sound: InstrumentSound;
  notes: Note[];
}

export interface HarmonizeSettings {
  key: number; // 0..11 (C..B)
  scale: "major" | "minor";
  progressionId: string;
  energy: number; // 0..1 - drives note density + velocity ("frenticism")
  instruments: InstrumentSound[]; // which melodic parts to generate
  octave: Record<InstrumentSound, number>; // per-instrument octave offset
  style: string; // style preset id (rock, lofi, cinematic, ...)
  addDrums: boolean; // also generate a fitting drum pattern
}

// what the analyzer estimates from an existing track; all fields user-correctable
export interface TrackAnalysis {
  sourceTrackId: string;
  sourceName: string;
  bpm: number; // detected tempo
  energy: number; // 0..1 frenticism
  key: number; // 0..11
  scale: "major" | "minor";
  noteStrengths: number[]; // 12 pitch-class strengths 0..1
  notes: number[]; // pitch classes judged "in use"
}

export interface Clip {
  id: string;
  name: string;
  start: number; // seconds on the timeline
  duration: number; // seconds
  // base64-encoded WAV for persistence; the live AudioBuffer lives in the engine
  audio?: string;
  peaks?: number[]; // downsampled waveform for drawing
}

// per-track insert effects
export interface TrackFx {
  reverb: number; // 0..1 wet send
  eqLow: number; // dB -12..+12 (low shelf)
  eqMid: number; // dB -12..+12 (mid peak)
  eqHigh: number; // dB -12..+12 (high shelf)
}

export function defaultFx(): TrackFx {
  return { reverb: 0, eqLow: 0, eqMid: 0, eqHigh: 0 };
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number; // 0..1.5
  pan: number; // -1..1
  muted: boolean;
  soloed: boolean;
  armed: boolean; // record-enabled
  clips: Clip[];
  fx: TrackFx;
  instrument?: InstrumentConfig; // present on instrument tracks
}

// 16-step grid per drum voice
export type DrumVoice = "kick" | "snare" | "hat" | "clap" | "tom" | "ride";

export interface DrumPattern {
  steps: number; // 16
  swing: number; // 0..1
  voices: Record<DrumVoice, boolean[]>;
  kitId: string; // selected kit preset
  sounds: Record<DrumVoice, string>; // chosen sound id per slot (overrides kit)
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  bars: number; // timeline length in bars
  metronome: boolean;
  loop: boolean; // loop the arrangement on playback
  master: number; // master volume 0..1.5
  tracks: Track[];
  drum: DrumPattern;
  drumTrackId: string | null;
  harmonize: HarmonizeSettings;
  updatedAt: number;
}
