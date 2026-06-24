import { useState } from "react";
import { useStore } from "../state/store";
import { NOTE_NAMES, PROGRESSIONS, STYLES } from "../audio/music";
import { INSTRUMENTS } from "../audio/InstrumentSynth";
import { analyzeBuffer } from "../audio/analyze";
import { engine } from "../audio/AudioEngine";
import type { InstrumentSound, TrackAnalysis } from "../types";

export default function HarmonizePanel({ onClose }: { onClose: () => void }) {
  const h = useStore((s) => s.project.harmonize);
  const tracks = useStore((s) => s.project.tracks);
  const bpm = useStore((s) => s.project.bpm);
  const setHarmonize = useStore((s) => s.setHarmonize);
  const applyHarmonize = useStore((s) => s.applyHarmonize);
  const clearHarmonize = useStore((s) => s.clearHarmonize);
  const setBpm = useStore((s) => s.setBpm);
  const hasInstruments = tracks.some((t) => t.type === "instrument");

  const sources = tracks.filter((t) => t.type === "audio" && t.clips.length > 0);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null);

  const analyze = () => {
    const tr = tracks.find((t) => t.id === sourceId);
    const clip = tr?.clips[0];
    const buf = clip ? engine.getBuffer(clip.id) : undefined;
    if (!tr || !buf) return;
    const a = analyzeBuffer(buf, tr.id, tr.name);
    setAnalysis(a);
    // pre-fill the (correctable) settings from the analysis
    setHarmonize({ key: a.key, scale: a.scale, energy: a.energy });
  };

  const toggleInstrument = (id: InstrumentSound) => {
    const has = h.instruments.includes(id);
    setHarmonize({ instruments: has ? h.instruments.filter((x) => x !== id) : [...h.instruments, id] });
  };
  const setOctave = (id: InstrumentSound, delta: number) =>
    setHarmonize({ octave: { ...h.octave, [id]: Math.max(-2, Math.min(2, h.octave[id] + delta)) } });

  const energyLabel = h.energy < 0.34 ? "Relaxed" : h.energy < 0.67 ? "Moving" : "Frantic";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>🎻 Harmonize</h2>
        <p>
          Add instruments (and drums) that match your song. Optionally analyze an existing track
          first, review what Ensemble thinks, correct anything, then generate. Everything stays
          locked to {bpm} BPM.
        </p>

        {/* ---- analysis ---- */}
        <div className="harm-section">
          <div className="harm-row">
            <label className="harm-field grow" title="Pick a recorded or imported track to analyze (e.g. a guitar part).">
              <span>Analyze a track</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={!sources.length}>
                {!sources.length && <option>No audio tracks yet - record or import one</option>}
                {sources.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button className="btn" onClick={analyze} disabled={!sources.length}
              title="Estimate tempo, energy, key and notes from this track. Estimates only - you can correct them below.">
              Analyze
            </button>
          </div>

          {analysis && (
            <div className="harm-analysis">
              <div className="harm-readout">
                <b>Ensemble hears:</b> {analysis.sourceName} - about {analysis.bpm} BPM,{" "}
                {energyLabel.toLowerCase()} energy, key of {NOTE_NAMES[analysis.key]} {analysis.scale}.
                <button className="btn ghost tiny" onClick={() => setBpm(analysis.bpm)}
                  title="Set the project tempo to the detected BPM">Use {analysis.bpm} BPM</button>
              </div>
              <div className="chroma" title="Detected notes (pitch classes). Taller = stronger. Click one to make it the key.">
                {analysis.noteStrengths.map((v, i) => (
                  <button key={i} className={"chroma-bar" + (i === h.key ? " key" : "")}
                    onClick={() => setHarmonize({ key: i })}
                    title={`${NOTE_NAMES[i]} - click to set as key`}>
                    <span style={{ height: `${Math.max(6, v * 100)}%` }} />
                    <em>{NOTE_NAMES[i]}</em>
                  </button>
                ))}
              </div>
              <p className="hint">These are estimates. Correct the key, scale, energy or chords below before generating.</p>
            </div>
          )}
        </div>

        {/* ---- correctable settings ---- */}
        <div className="harm-grid">
          <label className="harm-field" title="Musical key (root note).">
            <span>Key</span>
            <select value={h.key} onChange={(e) => setHarmonize({ key: +e.target.value })}>
              {NOTE_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
          </label>
          <label className="harm-field" title="Major = bright, minor = moody.">
            <span>Scale</span>
            <select value={h.scale} onChange={(e) => setHarmonize({ scale: e.target.value as "major" | "minor" })}>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </label>
          <label className="harm-field" title="Chords the parts follow, one per bar.">
            <span>Chords</span>
            <select value={h.progressionId} onChange={(e) => setHarmonize({ progressionId: e.target.value })}>
              {PROGRESSIONS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="harm-field" title="Overall style. Affects feel, arp speed, swing and the generated beat.">
            <span>Style</span>
            <select value={h.style} onChange={(e) => setHarmonize({ style: e.target.value })}>
              {STYLES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </label>
          <label className="harm-field grow" title="Frenticism: how busy and hard the parts play.">
            <span>Energy - {energyLabel}</span>
            <input className="slider" type="range" min={0} max={1} step={0.01}
              value={h.energy} onChange={(e) => setHarmonize({ energy: +e.target.value })} />
          </label>
        </div>

        <h3 style={{ margin: "14px 0 8px" }}>Instruments &amp; fine-tuning</h3>
        <div className="harm-instruments">
          <div className={"harm-inst" + (h.addDrums ? " on" : "")}>
            <button className="harm-toggle" onClick={() => setHarmonize({ addDrums: !h.addDrums })}
              title="Also generate a drum beat that fits the style and energy">
              <span className="check">{h.addDrums ? "✓" : ""}</span> Drums
            </button>
            <div className="harm-oct"><span className="hint">from style</span></div>
          </div>
          {INSTRUMENTS.map((inst) => {
            const on = h.instruments.includes(inst.id);
            return (
              <div className={"harm-inst" + (on ? " on" : "")} key={inst.id}>
                <button className="harm-toggle" onClick={() => toggleInstrument(inst.id)}
                  title={on ? "Click to remove" : "Click to add"}>
                  <span className="check">{on ? "✓" : ""}</span> {inst.name}
                </button>
                <div className="harm-oct" title="Shift this part by whole octaves.">
                  <button onClick={() => setOctave(inst.id, -1)} disabled={!on} title="Octave down">-</button>
                  <span>{h.octave[inst.id] > 0 ? "+" : ""}{h.octave[inst.id]}</span>
                  <button onClick={() => setOctave(inst.id, +1)} disabled={!on} title="Octave up">+</button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="hint" style={{ marginTop: 10 }}>
          Generated parts are normal tracks - tweak them in the Mixer afterwards, or Regenerate to replace.
        </p>

        <div className="modal-actions">
          {hasInstruments && (
            <button className="btn ghost danger" onClick={clearHarmonize} title="Remove all generated instrument tracks">
              Remove generated
            </button>
          )}
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn accent" onClick={() => { applyHarmonize(); onClose(); }}
            title="Create the parts and add them to your song">
            {hasInstruments ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
