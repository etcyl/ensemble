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
  // 3-band EQ, sweepable
  eqLow: number; // dB -12..+12 (low shelf)
  eqLowFreq: number; // Hz
  eqMid: number; // dB -12..+12 (peaking)
  eqMidFreq: number; // Hz
  eqMidQ: number; // 0.3..8
  eqHigh: number; // dB -12..+12 (high shelf)
  eqHighFreq: number; // Hz
  // reverb send
  reverb: number; // 0..1
  // delay / echo
  delay: number; // 0..1 wet
  delayTime: number; // seconds
  delayFeedback: number; // 0..0.9
  // compression
  comp: number; // 0..1 amount
}

export function defaultFx(): TrackFx {
  return {
    eqLow: 0, eqLowFreq: 160,
    eqMid: 0, eqMidFreq: 1000, eqMidQ: 0.9,
    eqHigh: 0, eqHighFreq: 4500,
    reverb: 0,
    delay: 0, delayTime: 0.3, delayFeedback: 0.35,
    comp: 0,
  };
}

// per-field clamp ranges, shared by the store and UI
export const FX_RANGES: Record<keyof TrackFx, [number, number]> = {
  eqLow: [-12, 12], eqLowFreq: [40, 500],
  eqMid: [-12, 12], eqMidFreq: [200, 6000], eqMidQ: [0.3, 8],
  eqHigh: [-12, 12], eqHighFreq: [1500, 12000],
  reverb: [0, 1],
  delay: [0, 1], delayTime: [0.05, 1.2], delayFeedback: [0, 0.9],
  comp: [0, 1],
};

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
