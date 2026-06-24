import { useStore } from "../state/store";
import { engine } from "../audio/AudioEngine";
import { DRUM_LIBRARY, DRUM_KITS } from "../audio/DrumSynth";
import type { DrumVoice } from "../types";

const VOICES: DrumVoice[] = ["kick", "snare", "hat", "clap", "tom", "ride"];
const SLOT_LABEL: Record<DrumVoice, string> = {
  kick: "kick", snare: "snare", hat: "hat", clap: "clap", tom: "tom", ride: "cymbal",
};

export default function DrumSequencer() {
  const drum = useStore((s) => s.project.drum);
  const playing = useStore((s) => s.playing);
  const step = useStore((s) => s.activeStep);
  const toggleStep = useStore((s) => s.toggleStep);
  const setSwing = useStore((s) => s.setSwing);
  const clearDrum = useStore((s) => s.clearDrum);
  const setKit = useStore((s) => s.setKit);
  const setVoiceSound = useStore((s) => s.setVoiceSound);

  return (
    <div className="panel">
      <h3 title="Beat Maker: a 16-step drum sequencer. Each row is a drum sound, each square is a 1/16-note step. Click squares to switch them on. It always plays in time with the project tempo.">
        Beat Maker
        <select
          className="kit-select"
          value={drum.kitId}
          onChange={(e) => setKit(e.target.value)}
          title="Drum kit: pick a full set of sounds at once. You can still swap any single piece on its own row."
        >
          {DRUM_KITS.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
          {drum.kitId === "custom" && <option value="custom">Custom</option>}
        </select>
        <span className="line" />
        <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }} title="Swing: nudges every other step later for a looser, less robotic groove. All the way left = dead straight.">
          swing
          <input
            className="slider"
            type="range"
            min={0}
            max={0.6}
            step={0.02}
            value={drum.swing}
            onChange={(e) => setSwing(+e.target.value)}
            style={{ width: 64 }}
            title={`Swing: ${Math.round((drum.swing / 0.6) * 100)}%`}
          />
        </label>
        <button className="btn ghost" style={{ padding: "4px 9px" }} onClick={clearDrum} title="Clear the whole pattern (turn every step off). Keeps your kit.">
          clear
        </button>
      </h3>
      <div className="drumgrid">
        {VOICES.map((v) => (
          <div className="drumrow" key={v}>
            <div className="voicecol">
              <div className="voicelbl" onClick={() => engine.audition(v)} title={`${SLOT_LABEL[v]} - click to hear the current sound`}>
                {SLOT_LABEL[v]}
              </div>
              <select
                className="voicepick"
                value={drum.sounds?.[v]}
                onChange={(e) => { setVoiceSound(v, e.target.value); engine.audition(v, e.target.value); }}
                title={`Swap the ${SLOT_LABEL[v]} sound`}
              >
                {DRUM_LIBRARY[v].map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="steps">
              {drum.voices[v].map((on, i) => (
                <button
                  key={i}
                  title={`${SLOT_LABEL[v]} - step ${i + 1} of 16${i % 4 === 0 ? " (downbeat)" : ""}. Click to toggle.`}
                  className={
                    "cell" + (on ? " on" : "") + (playing && step === i ? " now" : "")
                  }
                  onClick={() => toggleStep(v, i)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
