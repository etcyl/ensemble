import { useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/AudioEngine";
import { SOUND_LIBRARY, soundCategories } from "../audio/InstrumentSynth";
import { DRUM_KITS } from "../audio/DrumSynth";
import Icon from "./Icon";

export default function SoundLibrary({ onClose }: { onClose: () => void }) {
  const addInstrumentTrack = useStore((s) => s.addInstrumentTrack);
  const setKit = useStore((s) => s.setKit);
  const currentKit = useStore((s) => s.project.drum.kitId);
  const cats = soundCategories();
  const [tab, setTab] = useState<string>("Instruments");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal lib-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sound Library</h2>
        <p>Every sound here is generated in-app - no downloads. Audition one, then add it as a track, or apply a drum kit to the Beat Maker.</p>

        <div className="lib-tabs">
          <button className={"lib-tab" + (tab === "Instruments" ? " on" : "")} onClick={() => setTab("Instruments")}>Instruments</button>
          <button className={"lib-tab" + (tab === "Drum Kits" ? " on" : "")} onClick={() => setTab("Drum Kits")}>Drum Kits</button>
        </div>

        {tab === "Instruments" && (
          <div className="lib-scroll">
            {cats.map((cat) => (
              <div key={cat} className="lib-cat">
                <h3 className="fxp-h">{cat}</h3>
                <div className="lib-grid">
                  {SOUND_LIBRARY.filter((s) => s.category === cat).map((s) => (
                    <div className="lib-item" key={s.id}>
                      <button className="lib-play" title={`Hear ${s.name}`} onClick={() => engine.previewSound(s.id)}>
                        <Icon name="play" size={13} />
                      </button>
                      <span className="lib-name">{s.name}</span>
                      <button className="btn ghost tiny" title="Add this sound as a new instrument track" onClick={() => { addInstrumentTrack(s.id, s.name); }}>
                        <Icon name="plus" size={13} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "Drum Kits" && (
          <div className="lib-scroll">
            <div className="lib-grid">
              {DRUM_KITS.map((k) => (
                <div className={"lib-item" + (currentKit === k.id ? " on" : "")} key={k.id}>
                  <Icon name="grid" size={14} />
                  <span className="lib-name">{k.name}</span>
                  <button className="btn ghost tiny" title="Load this kit into the Beat Maker" onClick={() => setKit(k.id)}>
                    {currentKit === k.id ? "Active" : "Use"}
                  </button>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>Tip: after loading a kit you can still swap any single drum on its row in the Beat Maker.</p>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn accent" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
