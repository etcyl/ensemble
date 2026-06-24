import { useStore } from "../state/store";
import { FX_RANGES, defaultFx } from "../types";
import type { TrackFx } from "../types";

function Row({
  label, k, value, min, max, step, unit, fmt, onChange, title,
}: {
  label: string; k: keyof TrackFx; value: number; min: number; max: number;
  step: number; unit?: string; fmt?: (v: number) => string; onChange: (k: keyof TrackFx, v: number) => void; title?: string;
}) {
  return (
    <div className="fxp-row" title={title}>
      <span className="fxp-label">{label}</span>
      <input type="range" className="slider" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(k, +e.target.value)} />
      <span className="fxp-val">{fmt ? fmt(value) : value}{unit}</span>
    </div>
  );
}

export default function ChannelFxPanel({ trackId, onClose }: { trackId: string; onClose: () => void }) {
  const track = useStore((s) => s.project.tracks.find((t) => t.id === trackId));
  const setTrackFx = useStore((s) => s.setTrackFx);
  const idx = useStore((s) => s.project.tracks.findIndex((t) => t.id === trackId));
  if (!track) return null;
  const fx = track.fx;
  const set = (k: keyof TrackFx, v: number) => setTrackFx(trackId, { [k]: v } as Partial<TrackFx>);
  const R = FX_RANGES;
  const hz = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v).toString());
  const db = (v: number) => (v > 0 ? "+" : "") + v;
  const pct = (v: number) => Math.round(v * 100) + "%";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <h2>Channel {idx + 1} FX <span style={{ color: track.color }}>· {track.name}</span></h2>
        <p>Sweepable EQ, reverb, delay and compression for this channel. Baked into the exported mix.</p>

        <h3 className="fxp-h">Equalizer</h3>
        <Row label="Low gain" k="eqLow" value={fx.eqLow} min={R.eqLow[0]} max={R.eqLow[1]} step={1} unit=" dB" fmt={db} onChange={set} title="Low shelf gain" />
        <Row label="Low freq" k="eqLowFreq" value={fx.eqLowFreq} min={R.eqLowFreq[0]} max={R.eqLowFreq[1]} step={5} fmt={hz} unit="Hz" onChange={set} title="Frequency below which the low shelf acts" />
        <Row label="Mid gain" k="eqMid" value={fx.eqMid} min={R.eqMid[0]} max={R.eqMid[1]} step={1} unit=" dB" fmt={db} onChange={set} title="Mid peak gain" />
        <Row label="Mid freq" k="eqMidFreq" value={fx.eqMidFreq} min={R.eqMidFreq[0]} max={R.eqMidFreq[1]} step={10} fmt={hz} unit="Hz" onChange={set} title="Center frequency of the mid band (sweep it to find a sound)" />
        <Row label="Mid width" k="eqMidQ" value={fx.eqMidQ} min={R.eqMidQ[0]} max={R.eqMidQ[1]} step={0.1} fmt={(v) => v.toFixed(1)} onChange={set} title="Q: low = wide/gentle, high = narrow/surgical" />
        <Row label="High gain" k="eqHigh" value={fx.eqHigh} min={R.eqHigh[0]} max={R.eqHigh[1]} step={1} unit=" dB" fmt={db} onChange={set} title="High shelf gain" />
        <Row label="High freq" k="eqHighFreq" value={fx.eqHighFreq} min={R.eqHighFreq[0]} max={R.eqHighFreq[1]} step={50} fmt={hz} unit="Hz" onChange={set} title="Frequency above which the high shelf acts" />

        <h3 className="fxp-h">Reverb</h3>
        <Row label="Amount" k="reverb" value={fx.reverb} min={R.reverb[0]} max={R.reverb[1]} step={0.02} fmt={pct} onChange={set} title="Reverb send (dry to wet)" />

        <h3 className="fxp-h">Delay</h3>
        <Row label="Amount" k="delay" value={fx.delay} min={R.delay[0]} max={R.delay[1]} step={0.02} fmt={pct} onChange={set} title="Echo send level" />
        <Row label="Time" k="delayTime" value={fx.delayTime} min={R.delayTime[0]} max={R.delayTime[1]} step={0.01} fmt={(v) => Math.round(v * 1000) + ""} unit="ms" onChange={set} title="Delay time between echoes" />
        <Row label="Feedback" k="delayFeedback" value={fx.delayFeedback} min={R.delayFeedback[0]} max={R.delayFeedback[1]} step={0.02} fmt={pct} onChange={set} title="How much the echo repeats (higher = more repeats)" />

        <h3 className="fxp-h">Compression</h3>
        <Row label="Amount" k="comp" value={fx.comp} min={R.comp[0]} max={R.comp[1]} step={0.02} fmt={pct} onChange={set} title="Evens out the level: higher = more squash and punch" />

        <div className="modal-actions">
          <button className="btn ghost danger" onClick={() => setTrackFx(trackId, defaultFx())} title="Reset all effects on this channel">Reset</button>
          <button className="btn accent" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
