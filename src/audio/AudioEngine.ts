import type { Project, DrumVoice, TrackFx } from "../types";
import { defaultFx } from "../types";
import { playDrum } from "./DrumSynth";
import { playNote } from "./InstrumentSynth";
import { delaySeconds } from "./timing";

const DRUM_VOICES: DrumVoice[] = ["kick", "snare", "hat", "clap", "tom", "ride"];

interface TrackNodes {
  gain: GainNode; // input + volume
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  dry: GainNode;
  wet: GainNode; // reverb send level
  conv: ConvolverNode;
  delayNode: DelayNode;
  delayWet: GainNode;
  delayFb: GainNode;
  pan: StereoPannerNode;
}

// Build one track's effect chain: input -> EQ -> comp -> [dry + reverb + delay] -> pan -> master
function buildTrackChain(ctx: BaseAudioContext, master: AudioNode, impulse: AudioBuffer): TrackNodes {
  const gain = ctx.createGain();
  const low = ctx.createBiquadFilter(); low.type = "lowshelf";
  const mid = ctx.createBiquadFilter(); mid.type = "peaking";
  const high = ctx.createBiquadFilter(); high.type = "highshelf";
  const comp = ctx.createDynamicsCompressor();
  const dry = ctx.createGain();
  const wet = ctx.createGain(); wet.gain.value = 0;
  const conv = ctx.createConvolver(); conv.buffer = impulse;
  const delayNode = ctx.createDelay(2);
  const delayWet = ctx.createGain(); delayWet.gain.value = 0;
  const delayFb = ctx.createGain(); delayFb.gain.value = 0;
  const pan = ctx.createStereoPanner();

  gain.connect(low); low.connect(mid); mid.connect(high); high.connect(comp);
  comp.connect(dry); dry.connect(pan);
  comp.connect(conv); conv.connect(wet); wet.connect(pan);
  comp.connect(delayNode);
  delayNode.connect(delayWet); delayWet.connect(pan);
  delayNode.connect(delayFb); delayFb.connect(delayNode); // feedback loop
  pan.connect(master);
  return { gain, low, mid, high, comp, dry, wet, conv, delayNode, delayWet, delayFb, pan };
}

function applyFxToNodes(n: TrackNodes, fx: TrackFx, bpm: number) {
  n.low.frequency.value = fx.eqLowFreq; n.low.gain.value = fx.eqLow;
  n.mid.frequency.value = fx.eqMidFreq; n.mid.Q.value = fx.eqMidQ; n.mid.gain.value = fx.eqMid;
  n.high.frequency.value = fx.eqHighFreq; n.high.gain.value = fx.eqHigh;
  // compressor: amount maps threshold + ratio (amount 0 = effectively transparent)
  n.comp.threshold.value = -6 - fx.comp * 34;
  n.comp.ratio.value = 1 + fx.comp * 11;
  n.comp.knee.value = 24;
  n.comp.attack.value = 0.005;
  n.comp.release.value = 0.2;
  n.wet.gain.value = Math.min(0.9, fx.reverb);
  n.delayWet.gain.value = Math.min(0.9, fx.delay);
  n.delayNode.delayTime.value = delaySeconds(bpm, fx.delaySync, fx.delayTime);
  n.delayFb.gain.value = Math.min(0.9, fx.delayFeedback);
  // keep dry mostly full; trim a touch as sends rise
  n.dry.gain.value = 1 - Math.min(0.4, (fx.reverb + fx.delay) * 0.2);
}

// a decaying-noise impulse response for a simple, CPU-cheap reverb
function makeImpulse(ctx: BaseAudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

type TickCb = (playhead: number, step: number) => void;

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private analyser!: AnalyserNode;
  private trackNodes = new Map<string, TrackNodes>();
  private buffers = new Map<string, AudioBuffer>(); // clipId -> buffer
  private impulse: AudioBuffer | null = null;
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

  private masterRack: TrackNodes | null = null;

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.impulse = makeImpulse(this.ctx);
    this.master = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    // tracks -> master (volume) -> master FX rack -> analyser -> output
    this.masterRack = buildTrackChain(this.ctx, this.analyser, this.impulse);
    this.masterRack.gain.gain.value = 1;
    this.master.connect(this.masterRack.gain);
    this.analyser.connect(this.ctx.destination);
    this.master.gain.value = this.getProject().master;
  }

  applyMasterFx(fx: TrackFx) {
    if (!this.ctx || !this.masterRack) return;
    applyFxToNodes(this.masterRack, fx, this.getProject().bpm);
  }

  // schedule a one-bar count-in of clicks; returns its duration in ms
  countInClicks(): number {
    this.resume();
    const p = this.getProject();
    const beat = 60 / p.bpm;
    const t0 = this.ctx!.currentTime + 0.06;
    for (let i = 0; i < 4; i++) this.click(t0 + i * beat, i === 0);
    return Math.round(4 * beat * 1000) + 60;
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
      if (!this.impulse) this.impulse = makeImpulse(this.ctx!);
      n = buildTrackChain(this.ctx!, this.master, this.impulse);
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

  applyTrackFx(trackId: string, fx: TrackFx) {
    if (!this.ctx) return;
    applyFxToNodes(this.nodes(trackId), fx, this.getProject().bpm);
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
          this.scheduleClip(t.id, c, this.playStartCtx, position - c.start);
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

  // schedule a clip. `into` = seconds already elapsed within the clip (for clips
  // already playing at the transport start). Honors the clip's buffer offset + duration.
  private scheduleClip(trackId: string, clip: { id: string; offset?: number; duration: number }, when: number, into = 0) {
    const buf = this.buffers.get(clip.id);
    if (!buf) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.connect(this.nodes(trackId).gain);
    const bufOffset = Math.min(buf.duration, (clip.offset ?? 0) + into);
    const remaining = Math.max(0.01, clip.duration - into);
    src.start(Math.max(when, this.ctx!.currentTime), bufOffset, remaining);
    this.scheduledClips.add(clip.id);
  }

  private scheduler() {
    if (!this.ctx) return;
    const p = this.getProject();
    const ahead = 0.12;
    const s16 = this.sec16(p.bpm);
    const songEnd = p.bars * (60 / p.bpm) * 4; // bars * secs/bar
    const regionStart = p.loop && p.loopStart != null ? p.loopStart : 0;
    const regionEnd = p.loop && p.loopEnd != null ? p.loopEnd : songEnd;
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
          this.scheduleClip(t.id, c, ctxTime);
        }
      }
    }

    // schedule drum + metronome steps
    while (this.nextNoteTime < this.ctx.currentTime + ahead) {
      let playhead = this.nextNoteTime - this.playStartCtx + this.playStartPos;

      const end = p.loop ? regionEnd : songEnd;
      if (playhead >= end - 1e-6) {
        if (p.loop) {
          // re-anchor to the region start (or song start) without a gap
          this.playStartCtx = this.nextNoteTime;
          this.playStartPos = regionStart;
          this.step = Math.round(regionStart / s16);
          this.scheduledClips.clear();
          playhead = regionStart;
        } else {
          this.stop();
          this.onTick?.(songEnd, 0);
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
  renderMixdown(): Promise<AudioBuffer> {
    return this.render();
  }
  // render a single track in isolation (a stem); ignores mute/solo
  renderStem(trackId: string): Promise<AudioBuffer> {
    return this.render(trackId);
  }

  private async render(onlyTrackId?: string): Promise<AudioBuffer> {
    this.ensureContext();
    const p = this.getProject();
    const sr = this.ctx!.sampleRate;
    const s16 = this.sec16(p.bpm);
    const total = p.bars * 16;
    const seconds = total * s16;
    const octx = new OfflineAudioContext(2, Math.ceil((seconds + 2) * sr), sr);
    const impulse = makeImpulse(octx);

    // master volume, then (for the full mix) the master FX rack
    const master = octx.createGain();
    master.gain.value = p.master;
    if (!onlyTrackId) {
      const rack = buildTrackChain(octx, octx.destination, impulse);
      rack.gain.gain.value = 1;
      applyFxToNodes(rack, p.masterFx ?? defaultFx(), p.bpm);
      master.connect(rack.gain);
    } else {
      master.connect(octx.destination);
    }

    const anySolo = p.tracks.some((t) => t.soloed);
    const gainFor = new Map<string, GainNode>();
    for (const t of p.tracks) {
      if (onlyTrackId && t.id !== onlyTrackId) continue;
      const n = buildTrackChain(octx, master, impulse);
      applyFxToNodes(n, t.fx ?? defaultFx(), p.bpm);
      const audible = onlyTrackId ? true : !t.muted && (!anySolo || t.soloed);
      n.gain.gain.value = audible ? t.volume : 0;
      n.pan.pan.value = t.pan;
      gainFor.set(t.id, n.gain);
    }

    const DRUMS: DrumVoice[] = ["kick", "snare", "hat", "clap", "tom", "ride"];
    if (p.drumTrackId && gainFor.has(p.drumTrackId)) {
      const dg = gainFor.get(p.drumTrackId)!;
      for (let step = 0; step < total; step++) {
        const t = step * s16;
        const stepInBar = step % 16;
        for (const v of DRUMS)
          if (p.drum.voices[v]?.[stepInBar])
            playDrum(octx, dg, v, p.drum.sounds?.[v], t + (stepInBar % 2 ? p.drum.swing * s16 * 0.5 : 0));
      }
    }
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
        src.start(c.start, c.offset ?? 0, c.duration);
      }
    }

    return await octx.startRendering();
  }

  // preview one instrument note (piano-roll feedback)
  previewInstrument(trackId: string, midi: number) {
    this.resume();
    const tr = this.getProject().tracks.find((t) => t.id === trackId);
    if (!tr?.instrument) return;
    playNote(this.ctx!, this.nodes(trackId).gain, tr.instrument.sound, midi, this.ctx!.currentTime + 0.01, 0.35, 0.8);
  }

  // audition a library sound directly (no track needed) - plays a short phrase
  previewSound(sound: string, root = 60) {
    this.resume();
    const t0 = this.ctx!.currentTime + 0.02;
    [0, 4, 7, 12].forEach((iv, i) =>
      playNote(this.ctx!, this.master, sound, root + iv, t0 + i * 0.16, 0.22, 0.8)
    );
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
