import { create } from "zustand";
import type { Project, Track, DrumVoice, DrumPattern, TrackFx } from "../types";
import { defaultFx, FX_RANGES } from "../types";
import { engine } from "../audio/AudioEngine";
import { loadAutosave, saveAutosave } from "./persistence";
import { DRUM_KITS, defaultSounds } from "../audio/DrumSynth";
import { defaultHarmonize, generateHarmony, generateBeat, STYLES } from "../audio/music";
import type { HarmonizeSettings, Clip, Note } from "../types";

// grid + snap helpers (used by the arrange view and clip editing)
export function gridSeconds(p: Project): number {
  const bar = (60 / p.bpm) * 4;
  if (p.grid === "1") return bar;
  const m = p.grid.match(/^1\/(\d+)$/);
  return bar / (m ? parseInt(m[1], 10) : 4);
}
export function snapSec(p: Project, sec: number): number {
  if (!p.snap) return Math.max(0, sec);
  const g = gridSeconds(p);
  return Math.max(0, Math.round(sec / g) * g);
}

const PALETTE = ["#e8b04b", "#d98b6f", "#7fae9c", "#b07fb0", "#6f93d9", "#c9805a"];
let colorIdx = 0;
const nextColor = () => PALETTE[colorIdx++ % PALETTE.length];

export const uid = () => Math.random().toString(36).slice(2, 10);

function emptyDrum(): DrumPattern {
  const row = () => new Array(16).fill(false);
  return {
    steps: 16,
    swing: 0,
    kitId: DRUM_KITS[0].id,
    sounds: defaultSounds(),
    voices: {
      kick: row(),
      snare: row(),
      hat: row(),
      clap: row(),
      tom: row(),
      ride: row(),
    },
  };
}

function fourOnFloor(): DrumPattern {
  const d = emptyDrum();
  for (let i = 0; i < 16; i += 4) d.voices.kick[i] = true;
  d.voices.snare[4] = d.voices.snare[12] = true;
  for (let i = 2; i < 16; i += 4) d.voices.hat[i] = true;
  return d;
}

export function newProject(name = "Untitled"): Project {
  const drumId = uid();
  return {
    id: uid(),
    name,
    bpm: 120,
    bars: 8,
    metronome: true,
    loop: false,
    master: 0.9,
    drum: fourOnFloor(),
    drumTrackId: drumId,
    harmonize: defaultHarmonize(),
    masterFx: defaultFx(),
    snap: true,
    grid: "1/4",
    zoom: 80,
    loopStart: null,
    loopEnd: null,
    countIn: false,
    tracks: [
      {
        id: drumId,
        name: "Drums",
        type: "drum",
        color: nextColor(),
        volume: 0.9,
        pan: 0,
        muted: false,
        soloed: false,
        armed: false,
        clips: [],
        fx: defaultFx(),
      },
    ],
    updatedAt: Date.now(),
  };
}

interface State {
  project: Project;
  playing: boolean;
  recording: boolean;
  playhead: number;
  activeStep: number;
  voiceOn: boolean;
  lastVoice: string;
  feedback: string;
  suggestions: string[];

  setProject: (p: Project) => void;
  rename: (name: string) => void;
  setBpm: (bpm: number) => void;
  setBars: (bars: number) => void;
  toggleMetronome: () => void;
  toggleLoop: () => void;
  setMaster: (v: number) => void;

  addAudioTrack: () => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  setTrackFx: (id: string, patch: Partial<TrackFx>) => void;
  clearTrackClips: (id: string) => void;

  toggleStep: (voice: DrumVoice, i: number) => void;
  setSwing: (v: number) => void;
  clearDrum: () => void;
  setKit: (kitId: string) => void;
  setVoiceSound: (voice: DrumVoice, soundId: string) => void;
  setHarmonize: (patch: Partial<HarmonizeSettings>) => void;
  applyHarmonize: () => void;
  clearHarmonize: () => void;

  play: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  toggleRecord: () => void;
  setRecording: (b: boolean) => void;

  setVoiceOn: (b: boolean) => void;
  setLastVoice: (s: string) => void;
  setFeedback: (s: string) => void;
  setSuggestions: (s: string[]) => void;
  addClipToArmed: (clip: Track["clips"][number]) => void;
  importTrack: (name: string, clip: Clip) => string;

  // editing / view
  selectedClip: { trackId: string; clipId: string } | null;
  canUndo: boolean;
  canRedo: boolean;
  selectClip: (trackId: string | null, clipId?: string | null) => void;
  moveClip: (trackId: string, clipId: string, newStart: number) => void;
  trimClip: (trackId: string, clipId: string, start: number, duration: number, offset: number) => void;
  splitAtPlayhead: () => boolean;
  duplicateSelected: () => boolean;
  deleteSelected: () => boolean;
  moveTrack: (id: string, dir: -1 | 1) => boolean;
  setInstrumentNotes: (trackId: string, notes: Note[]) => void;
  setInstrumentSound: (trackId: string, sound: string) => void;
  addInstrumentTrack: (sound: string, name: string) => string;

  toggleSnap: () => void;
  setGrid: (g: string) => void;
  setZoom: (px: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setLoopRegion: (start: number | null, end: number | null) => void;
  toggleCountIn: () => void;
  setMasterFx: (patch: Partial<TrackFx>) => void;

  undo: () => void;
  redo: () => void;

  _tick: (playhead: number, step: number) => void;
}

function pushMixer(p: Project) {
  const anySolo = p.tracks.some((t) => t.soloed);
  for (const t of p.tracks) {
    const audible = !t.muted && (!anySolo || t.soloed);
    engine.applyTrackParams(t.id, t.volume, t.pan, audible);
    engine.applyTrackFx(t.id, t.fx ?? defaultFx());
  }
  engine.setMaster(p.master);
  engine.applyMasterFx(p.masterFx ?? defaultFx());
}

// fill in fields added after a project was first saved
function normalize(p: Project): Project {
  if (p.loop === undefined) p.loop = false;
  if (!p.drum.sounds) p.drum.sounds = defaultSounds();
  if (!p.drum.kitId) p.drum.kitId = DRUM_KITS[0].id;
  if (!p.harmonize) p.harmonize = defaultHarmonize();
  if (p.harmonize.style === undefined) p.harmonize.style = "pop";
  if (p.harmonize.addDrums === undefined) p.harmonize.addDrums = false;
  for (const t of p.tracks) t.fx = { ...defaultFx(), ...(t.fx ?? {}) };
  if (!p.masterFx) p.masterFx = defaultFx(); else p.masterFx = { ...defaultFx(), ...p.masterFx };
  if (p.snap === undefined) p.snap = true;
  if (!p.grid) p.grid = "1/4";
  if (!p.zoom) p.zoom = 80;
  if (p.loopStart === undefined) p.loopStart = null;
  if (p.loopEnd === undefined) p.loopEnd = null;
  if (p.countIn === undefined) p.countIn = false;
  return p;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedAutosave(p: Project) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveAutosave(p), 400);
}

export const useStore = create<State>((set, get) => {
  // undo/redo history (coalesces rapid edits within a gesture into one step)
  let past: Project[] = [];
  let future: Project[] = [];
  let lastCommitAt = 0;

  const commit = (project: Project, opts?: { history?: boolean }) => {
    const now = Date.now();
    if (opts?.history !== false) {
      if (now - lastCommitAt > 600) {
        past.push(get().project);
        if (past.length > 60) past.shift();
        future = [];
      }
      lastCommitAt = now;
    }
    project.updatedAt = now;
    set({ project, canUndo: past.length > 0, canRedo: future.length > 0 });
    debouncedAutosave(project); // localStorage write is debounced; audio stays immediate
    pushMixer(project);
  };

  const restore = (project: Project) => {
    set({ project, canUndo: past.length > 0, canRedo: future.length > 0 });
    saveAutosave(project);
    pushMixer(project);
    lastCommitAt = 0;
  };

  return {
    selectedClip: null,
    canUndo: false,
    canRedo: false,
    project: normalize(loadAutosave() ?? newProject()),
    playing: false,
    recording: false,
    playhead: 0,
    activeStep: -1,
    voiceOn: false,
    lastVoice: "",
    feedback: "",
    suggestions: [],

    setProject: (raw) => {
      const p = normalize(raw);
      engine.stop();
      set({ project: p, playing: false, playhead: 0, activeStep: -1 });
      saveAutosave(p);
      pushMixer(p);
    },
    rename: (name) => commit({ ...get().project, name }),
    setBpm: (bpm) => commit({ ...get().project, bpm: Math.max(40, Math.min(260, Math.round(bpm))) }),
    setBars: (bars) => commit({ ...get().project, bars: Math.max(1, Math.min(64, Math.round(bars))) }),
    toggleMetronome: () => commit({ ...get().project, metronome: !get().project.metronome }),
    toggleLoop: () => commit({ ...get().project, loop: !get().project.loop }),
    setMaster: (v) => commit({ ...get().project, master: v }),

    addAudioTrack: () => {
      const p = get().project;
      const t: Track = {
        id: uid(),
        name: `Audio ${p.tracks.filter((x) => x.type === "audio").length + 1}`,
        type: "audio",
        color: nextColor(),
        volume: 0.9,
        pan: 0,
        muted: false,
        soloed: false,
        armed: p.tracks.every((x) => !x.armed),
        clips: [],
        fx: defaultFx(),
      };
      commit({ ...p, tracks: [...p.tracks, t] });
    },
    removeTrack: (id) => {
      const p = get().project;
      if (p.tracks.find((t) => t.id === id)?.type === "drum") return;
      commit({ ...p, tracks: p.tracks.filter((t) => t.id !== id) });
    },
    updateTrack: (id, patch) => {
      const p = get().project;
      let tracks = p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      // single record-arm
      if (patch.armed) tracks = tracks.map((t) => (t.id === id ? t : { ...t, armed: false }));
      commit({ ...p, tracks });
    },

    setTrackFx: (id, patch) => {
      const p = get().project;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const tracks = p.tracks.map((t) => {
        if (t.id !== id) return t;
        const fx = { ...t.fx, ...patch };
        for (const k in FX_RANGES) {
          const key = k as keyof TrackFx;
          const range = FX_RANGES[key];
          if (range) (fx as any)[key] = clamp((fx as any)[key], range[0], range[1]);
        }
        return { ...t, fx };
      });
      commit({ ...p, tracks });
    },
    clearTrackClips: (id) => {
      const p = get().project;
      commit({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, clips: [] } : t)) });
    },

    toggleStep: (voice, i) => {
      const p = get().project;
      const voices = { ...p.drum.voices };
      voices[voice] = voices[voice].map((v, idx) => (idx === i ? !v : v));
      commit({ ...p, drum: { ...p.drum, voices } });
    },
    setSwing: (v) => commit({ ...get().project, drum: { ...get().project.drum, swing: v } }),
    clearDrum: () => {
      const d = get().project.drum;
      commit({ ...get().project, drum: { ...emptyDrum(), kitId: d.kitId, sounds: d.sounds } });
    },
    setKit: (kitId) => {
      const kit = DRUM_KITS.find((k) => k.id === kitId);
      if (!kit) return;
      commit({ ...get().project, drum: { ...get().project.drum, kitId, sounds: { ...kit.sounds } } });
    },
    setVoiceSound: (voice, soundId) => {
      const d = get().project.drum;
      commit({ ...get().project, drum: { ...d, kitId: "custom", sounds: { ...d.sounds, [voice]: soundId } } });
    },

    setHarmonize: (patch) =>
      commit({ ...get().project, harmonize: { ...get().project.harmonize, ...patch } }),
    applyHarmonize: () => {
      const p = get().project;
      const h = p.harmonize;
      const generated = generateHarmony(h, p.bars, p.drum);
      // replace any previously generated instrument tracks
      const kept = p.tracks.filter((t) => t.type !== "instrument");
      let drum = p.drum;
      if (h.addDrums) {
        const style = STYLES.find((s) => s.id === h.style);
        drum = { ...p.drum, voices: generateBeat(h.energy, h.style), swing: style?.swing ?? p.drum.swing };
      }
      commit({ ...p, drum, tracks: [...kept, ...generated] });
    },
    clearHarmonize: () => {
      const p = get().project;
      commit({ ...p, tracks: p.tracks.filter((t) => t.type !== "instrument") });
    },

    play: () => {
      const p = get().project;
      const from = get().playhead;
      engine.start(from >= p.bars * (60 / p.bpm) * 4 ? 0 : from, get()._tick);
      set({ playing: true });
    },
    stop: () => {
      engine.stop();
      set({ playing: false, activeStep: -1 });
    },
    seek: (sec) => {
      if (get().playing) {
        engine.stop();
        engine.start(sec, get()._tick);
      }
      set({ playhead: Math.max(0, sec) });
    },
    toggleRecord: () => set({ recording: !get().recording }),
    setRecording: (b) => set({ recording: b }),

    setVoiceOn: (b) => set({ voiceOn: b }),
    setLastVoice: (s) => set({ lastVoice: s }),
    setFeedback: (s) => set({ feedback: s }),
    setSuggestions: (s) => set({ suggestions: s }),

    addClipToArmed: (clip) => {
      const p = get().project;
      let target = p.tracks.find((t) => t.armed && t.type === "audio");
      let tracks = p.tracks;
      if (!target) {
        target = {
          id: uid(),
          name: `Audio ${p.tracks.filter((x) => x.type === "audio").length + 1}`,
          type: "audio",
          color: nextColor(),
          volume: 0.9,
          pan: 0,
          muted: false,
          soloed: false,
          armed: true,
          clips: [],
          fx: defaultFx(),
        };
        tracks = [...tracks, target];
      }
      tracks = tracks.map((t) =>
        t.id === target!.id ? { ...t, clips: [...t.clips, clip] } : t
      );
      commit({ ...p, tracks });
    },

    importTrack: (name, clip) => {
      const p = get().project;
      const t: Track = {
        id: uid(),
        name,
        type: "audio",
        color: nextColor(),
        volume: 0.9,
        pan: 0,
        muted: false,
        soloed: false,
        armed: false,
        clips: [clip],
        fx: defaultFx(),
      };
      commit({ ...p, tracks: [...p.tracks, t] });
      return t.id;
    },

    // ---- clip editing ----
    selectClip: (trackId, clipId = null) =>
      set({ selectedClip: trackId && clipId ? { trackId, clipId } : null }),

    moveClip: (trackId, clipId, newStart) => {
      const p = get().project;
      const start = snapSec(p, newStart);
      commit({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, start } : c)) } : t
        ),
      });
    },
    trimClip: (trackId, clipId, start, duration, offset) => {
      const p = get().project;
      commit({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId
            ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, start: Math.max(0, start), duration: Math.max(0.05, duration), offset: Math.max(0, offset) } : c)) }
            : t
        ),
      });
    },
    splitAtPlayhead: () => {
      const p = get().project;
      const sel = get().selectedClip;
      if (!sel) return false;
      const ph = get().playhead;
      const t = p.tracks.find((x) => x.id === sel.trackId);
      const c = t?.clips.find((x) => x.id === sel.clipId);
      if (!t || !c || ph <= c.start + 0.02 || ph >= c.start + c.duration - 0.02) return false;
      const leftDur = ph - c.start;
      const left: Clip = { ...c, duration: leftDur };
      const right: Clip = { ...c, id: uid(), start: ph, duration: c.duration - leftDur, offset: (c.offset ?? 0) + leftDur };
      if (engine.getBuffer(c.id)) engine.setBuffer(right.id, engine.getBuffer(c.id)!);
      commit({
        ...p,
        tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, clips: x.clips.flatMap((cc) => (cc.id === c.id ? [left, right] : [cc])) } : x)),
      });
      return true;
    },
    duplicateSelected: () => {
      const p = get().project;
      const sel = get().selectedClip;
      if (!sel) return false;
      const t = p.tracks.find((x) => x.id === sel.trackId);
      const c = t?.clips.find((x) => x.id === sel.clipId);
      if (!t || !c) return false;
      const copy: Clip = { ...c, id: uid(), start: c.start + c.duration };
      if (engine.getBuffer(c.id)) engine.setBuffer(copy.id, engine.getBuffer(c.id)!);
      commit({ ...p, tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, clips: [...x.clips, copy] } : x)) });
      set({ selectedClip: { trackId: t.id, clipId: copy.id } });
      return true;
    },
    deleteSelected: () => {
      const p = get().project;
      const sel = get().selectedClip;
      if (!sel) return false;
      const t = p.tracks.find((x) => x.id === sel.trackId);
      if (!t || !t.clips.some((c) => c.id === sel.clipId)) return false;
      commit({ ...p, tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, clips: x.clips.filter((c) => c.id !== sel.clipId) } : x)) });
      set({ selectedClip: null });
      return true;
    },
    moveTrack: (id, dir) => {
      const p = get().project;
      const i = p.tracks.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.tracks.length) return false;
      const tracks = [...p.tracks];
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      commit({ ...p, tracks });
      return true;
    },
    setInstrumentNotes: (trackId, notes) => {
      const p = get().project;
      commit({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId && t.instrument ? { ...t, instrument: { ...t.instrument, notes } } : t)),
      });
    },
    setInstrumentSound: (trackId, sound) => {
      const p = get().project;
      commit({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId && t.instrument ? { ...t, instrument: { ...t.instrument, sound } } : t)),
      });
    },
    addInstrumentTrack: (sound, name) => {
      const p = get().project;
      const t: Track = {
        id: uid(), name, type: "instrument", color: nextColor(),
        volume: 0.8, pan: 0, muted: false, soloed: false, armed: false,
        clips: [], fx: defaultFx(), instrument: { sound, notes: [] },
      };
      commit({ ...p, tracks: [...p.tracks, t] });
      return t.id;
    },

    // ---- view / transport options ----
    toggleSnap: () => commit({ ...get().project, snap: !get().project.snap }, { history: false }),
    setGrid: (g) => commit({ ...get().project, grid: g }, { history: false }),
    setZoom: (px) => commit({ ...get().project, zoom: Math.max(24, Math.min(320, px)) }, { history: false }),
    zoomIn: () => commit({ ...get().project, zoom: Math.min(320, get().project.zoom * 1.3) }, { history: false }),
    zoomOut: () => commit({ ...get().project, zoom: Math.max(24, get().project.zoom / 1.3) }, { history: false }),
    setLoopRegion: (start, end) =>
      commit({ ...get().project, loopStart: start, loopEnd: end, loop: start != null }, { history: false }),
    toggleCountIn: () => commit({ ...get().project, countIn: !get().project.countIn }, { history: false }),
    setMasterFx: (patch) => {
      const p = get().project;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const fx = { ...p.masterFx, ...patch };
      for (const k in FX_RANGES) {
        const key = k as keyof TrackFx;
        const r = FX_RANGES[key];
        if (r) (fx as any)[key] = clamp((fx as any)[key], r[0], r[1]);
      }
      commit({ ...p, masterFx: fx }, { history: false });
    },

    undo: () => {
      if (!past.length) return;
      future.push(get().project);
      restore(past.pop()!);
    },
    redo: () => {
      if (!future.length) return;
      past.push(get().project);
      restore(future.pop()!);
    },

    _tick: (playhead, step) => set({ playhead, activeStep: step }),
  };
});

// wire engine to read live project
engine.wire(() => useStore.getState().project);
pushMixer(useStore.getState().project);
