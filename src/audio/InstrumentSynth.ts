import type { InstrumentSound } from "../types";

// Synthesized melodic instruments (no samples). Each plays one pitched note,
// scheduled at AudioContext time `t` for `dur` seconds into `dest`.

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export const INSTRUMENTS: { id: InstrumentSound; name: string }[] = [
  { id: "bass", name: "Bass" },
  { id: "keys", name: "Keys / Pad" },
  { id: "pluck", name: "Pluck / Arp" },
  { id: "lead", name: "Lead" },
];

export function playNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sound: InstrumentSound,
  midi: number,
  t: number,
  dur: number,
  vel = 0.8
) {
  const freq = midiToFreq(midi);
  const g = ctx.createGain();
  const out = g;

  switch (sound) {
    case "bass": {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = freq / 2;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + Math.min(0.3, dur));
      o.connect(lp);
      sub.connect(lp);
      lp.connect(out);
      adsr(g.gain, t, dur, 0.006, 0.08, 0.75, 0.08, vel);
      o.start(t); sub.start(t);
      o.stop(t + dur + 0.15); sub.stop(t + dur + 0.15);
      break;
    }
    case "keys": {
      // soft detuned pad
      const freqs = [freq, freq * 1.005, freq * 0.995];
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      lp.connect(out);
      const oscs = freqs.map((f) => {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        o.connect(lp);
        return o;
      });
      adsr(g.gain, t, dur, 0.04, 0.2, 0.7, 0.25, vel * 0.7);
      oscs.forEach((o) => { o.start(t); o.stop(t + dur + 0.3); });
      break;
    }
    case "pluck": {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 180;
      o.connect(hp).connect(out);
      adsr(g.gain, t, Math.min(dur, 0.3), 0.003, 0.12, 0.3, 0.08, vel * 0.85);
      o.start(t);
      o.stop(t + Math.min(dur, 0.3) + 0.12);
      break;
    }
    case "lead": {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = freq;
      // gentle vibrato
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = freq * 0.006;
      lfo.connect(lfoGain).connect(o.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      o.connect(lp).connect(out);
      adsr(g.gain, t, dur, 0.01, 0.06, 0.8, 0.12, vel * 0.6);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.15); lfo.stop(t + dur + 0.15);
      break;
    }
  }

  out.connect(dest);
}

function adsr(
  param: AudioParam, t: number, dur: number,
  a: number, d: number, s: number, r: number, peak: number
) {
  const sustainLevel = peak * s;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.linearRampToValueAtTime(sustainLevel, t + a + d);
  param.setValueAtTime(sustainLevel, t + Math.max(a + d, dur));
  param.exponentialRampToValueAtTime(0.0001, t + Math.max(a + d, dur) + r);
}
