import type { Project, DrumVoice } from "../types";
import { playDrum } from "./DrumSynth";
import { playNote } from "./InstrumentSynth";

const DRUM_VOICES: DrumVoice[] = ["kick", "snare", "hat", "clap", "tom", "ride"];

interface TrackNodes {
  gain: GainNode;
  pan: StereoPannerNode;
}

type TickCb = (playhead: number, step: number) => void;

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private analyser!: AnalyserNode;
  private trackNodes = new Map<string, TrackNodes>();
  private buffers = new Map<string, AudioBuffer>(); // clipId -> buffer
  private getProject: () => Project = () => {
    throw new Error("engine not wired");
  };

  // transport
  playing = false;
  private timer: number | null = null;
  private playStartCtx = 0;
  private playStartPos = 0;
  private nextNoteTime = 0;
  private step = 0;
  private scheduledClips = new Set<string>();
  private onTick: TickCb | null = null;

  wire(getProject: () => Project) {
    this.getProject = getProject;
  }

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.master.gain.value = this.getProject().master;
  }

  resume() {
    this.ensureContext();
    if (this.ctx!.state === "suspended") this.ctx!.resume();
  }

  setMaster(v: number) {
    if (this.master) this.master.gain.value = v;
  }

  masterLevel(): number {
    if (!this.ctx) return 0;
    const arr = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(arr);
    let peak = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = Math.abs(arr[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }

  private nodes(trackId: string): TrackNodes {
    let n = this.trackNodes.get(trackId);
    if (!n) {
      const gain = this.ctx!.createGain();
      const pan = this.ctx!.createStereoPanner();
      gain.connect(pan).connect(this.master);
      n = { gain, pan };
      this.trackNodes.set(trackId, n);
    }
    return n;
  }

  applyTrackParams(trackId: string, volume: number, pan: number, audible: boolean) {
    if (!this.ctx) return;
    const n = this.nodes(trackId);
    n.gain.gain.value = audible ? volume : 0;
    n.pan.pan.value = pan;
  }

  // store decoded audio for a clip
  setBuffer(clipId: string, buf: AudioBuffer) {
    this.buffers.set(clipId, buf);
  }
  hasBuffer(clipId: string) {
    return this.buffers.has(clipId);
  }
  getBuffer(clipId: string) {
    return this.buffers.get(clipId);
  }

  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this.ensureContext();
    return await this.ctx!.decodeAudioData(arrayBuffer);
  }

  private audibleTrack(p: Project, trackId: string): boolean {
    const anySolo = p.tracks.some((t) => t.soloed);
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return false;
    if (t.muted) return false;
    if (anySolo && !t.soloed) return false;
    return true;
  }

  private sec16(bpm: number) {
    return 60 / bpm / 4;
  }

  start(position: number, onTick: TickCb) {
    this.resume();
    const p = this.getProject();
    this.onTick = onTick;
    this.playing = true;
    this.playStartPos = position;
    this.playStartCtx = this.ctx!.currentTime + 0.06;
    this.nextNoteTime = this.playStartCtx;
    this.step = Math.round(position / this.sec16(p.bpm));
    this.scheduledClips.clear();

    // refresh mixer params
    for (const t of p.tracks)
      this.applyTrackParams(t.id, t.volume, t.pan, this.audibleTrack(p, t.id));
    this.setMaster(p.master);

    // clips already in progress at the start position
    for (const t of p.tracks) {
      for (const c of t.clips) {
        if (position > c.start && position < c.start + c.duration) {
          this.scheduleClip(t.id, c.id, this.playStartCtx, position - c.start);
        }
      }
    }

    this.timer = window.setInterval(() => this.scheduler(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  playhead(): number {
    if (!this.playing || !this.ctx) return this.playStartPos;
    return this.playStartPos + (this.ctx.currentTime - this.playStartCtx);
  }

  private scheduleClip(trackId: string, clipId: string, when: number, offset = 0) {
    const buf = this.buffers.get(clipId);
    if (!buf) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.connect(this.nodes(trackId).gain);
    src.start(Math.max(when, this.ctx!.currentTime), offset);
    this.scheduledClips.add(clipId);
  }

  private scheduler() {
    if (!this.ctx) return;
    const p = this.getProject();
    const ahead = 0.12;
    const s16 = this.sec16(p.bpm);
    const loopEnd = p.bars * (60 / p.bpm) * 4; // bars * secs/bar
    const drumAudible = p.drumTrackId
      ? this.audibleTrack(p, p.drumTrackId)
      : false;

    // schedule upcoming audio clips
    for (const t of p.tracks) {
      for (const c of t.clips) {
        if (this.scheduledClips.has(c.id)) continue;
        const ctxTime = this.playStartCtx + (c.start - this.playStartPos);
        if (
          c.start >= this.playStartPos &&
          ctxTime < this.ctx.currentTime + ahead
        ) {
          this.scheduleClip(t.id, c.id, ctxTime);
        }
      }
    }

    // schedule drum + metronome steps
    while (this.nextNoteTime < this.ctx.currentTime + ahead) {
      let playhead = this.nextNoteTime - this.playStartCtx + this.playStartPos;

      if (playhead >= loopEnd - 1e-6) {
        if (p.loop) {
          // re-anchor to the start: the boundary lands exactly on a 16th step,
          // so playback wraps without a gap
          this.playStartCtx = this.nextNoteTime;
          this.playStartPos = 0;
          this.step = 0;
          this.scheduledClips.clear();
          playhead = 0;
        } else {
          this.stop();
          this.onTick?.(loopEnd, 0);
          return;
        }
      }

      const stepInBar = ((this.step % 16) + 16) % 16;

      // swing: delay odd 16ths
      const swing = p.drum.swing * s16 * 0.5;
      const t = this.nextNoteTime + (stepInBar % 2 === 1 ? swing : 0);

      if (p.drumTrackId && drumAudible) {
        for (const v of DRUM_VOICES) {
          if (p.drum.voices[v]?.[stepInBar]) {
            playDrum(this.ctx, this.nodes(p.drumTrackId).gain, v, p.drum.sounds?.[v], t);
          }
        }
      }

      // instrument tracks span the whole arrangement (bars*16 steps)
      const total = p.bars * 16;
      const stepInLoop = ((this.step % total) + total) % total;
      for (const tr of p.tracks) {
        if (tr.type !== "instrument" || !tr.instrument) continue;
        if (!this.audibleTrack(p, tr.id)) continue;
        for (const note of tr.instrument.notes) {
          if (note.step === stepInLoop) {
            playNote(
              this.ctx,
              this.nodes(tr.id).gain,
              tr.instrument.sound,
              note.midi,
              this.nextNoteTime,
              note.len * s16,
              note.vel ?? 0.8
            );
          }
        }
      }

      if (p.metronome && stepInBar % 4 === 0) {
        this.click(this.nextNoteTime, stepInBar === 0);
      }

      this.onTick?.(playhead, stepInBar);
      this.nextNoteTime += s16;
      this.step++;
    }
  }

  private click(t: number, accent: boolean) {
    const osc = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    osc.frequency.value = accent ? 1500 : 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(accent ? 0.25 : 0.13, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // render the whole arrangement offline to a stereo AudioBuffer (for WAV export)
  async renderMixdown(): Promise<AudioBuffer> {
    this.ensureContext();
    const p = this.getProject();
    const sr = this.ctx!.sampleRate;
    const s16 = this.sec16(p.bpm);
    const total = p.bars * 16;
    const seconds = total * s16;
    const octx = new OfflineAudioContext(2, Math.ceil((seconds + 1) * sr), sr);

    const master = octx.createGain();
    master.gain.value = p.master;
    master.connect(octx.destination);

    const anySolo = p.tracks.some((t) => t.soloed);
    const gainFor = new Map<string, GainNode>();
    for (const t of p.tracks) {
      const g = octx.createGain();
      const pan = octx.createStereoPanner();
      const audible = !t.muted && (!anySolo || t.soloed);
      g.gain.value = audible ? t.volume : 0;
      pan.pan.value = t.pan;
      g.connect(pan).connect(master);
      gainFor.set(t.id, g);
    }

    const DRUMS: DrumVoice[] = ["kick", "snare", "hat", "clap", "tom", "ride"];
    for (let step = 0; step < total; step++) {
      const t = step * s16;
      const stepInBar = step % 16;
      // drums (loop every bar)
      if (p.drumTrackId) {
        const dg = gainFor.get(p.drumTrackId);
        if (dg) for (const v of DRUMS)
          if (p.drum.voices[v]?.[stepInBar])
            playDrum(octx, dg, v, p.drum.sounds?.[v], t + (stepInBar % 2 ? p.drum.swing * s16 * 0.5 : 0));
      }
    }
    // instruments + audio clips
    for (const tr of p.tracks) {
      const g = gainFor.get(tr.id);
      if (!g) continue;
      if (tr.type === "instrument" && tr.instrument) {
        for (const n of tr.instrument.notes)
          playNote(octx, g, tr.instrument.sound, n.midi, n.step * s16, n.len * s16, n.vel ?? 0.8);
      }
      for (const c of tr.clips) {
        const buf = this.buffers.get(c.id);
        if (!buf) continue;
        const src = octx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(c.start);
      }
    }

    return await octx.startRendering();
  }

  // audition a single drum voice (for clicking pads). Optional explicit sound id
  // so the UI can preview a sound before committing to it.
  audition(voice: DrumVoice, soundId?: string) {
    this.resume();
    const p = this.getProject();
    playDrum(
      this.ctx!,
      p.drumTrackId ? this.nodes(p.drumTrackId).gain : this.master,
      voice,
      soundId ?? p.drum.sounds?.[voice],
      this.ctx!.currentTime + 0.01
    );
  }
}

export const engine = new AudioEngine();
