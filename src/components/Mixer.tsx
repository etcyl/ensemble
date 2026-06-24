import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/AudioEngine";

export default function Mixer() {
  const tracks = useStore((s) => s.project.tracks);
  const master = useStore((s) => s.project.master);
  const setMaster = useStore((s) => s.setMaster);
  const updateTrack = useStore((s) => s.updateTrack);
  const setTrackFx = useStore((s) => s.setTrackFx);
  const [level, setLevel] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const loop = () => {
      setLevel(engine.masterLevel());
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div className="panel">
      <h3 title="Mixer: balance your tracks. Each strip is one track with a volume fader, a left/right pan slider, and Mute/Solo. The Master strip on the right sets overall output.">
        Mixer <span className="line" />
      </h3>
      <div className="mixer">
        {tracks.map((t) => (
          <div className="strip" key={t.id} title={`${t.name} channel strip`}>
            <div className="nm" style={{ color: t.color }} title={t.name}>{t.name}</div>
            <input
              className="fader"
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={t.volume}
              onChange={(e) => updateTrack(t.id, { volume: +e.target.value })}
              title={`Volume: ${Math.round(t.volume * 100)}% - drag up/down to set how loud this track is`}
            />
            <input
              className="pan slider"
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={t.pan}
              onChange={(e) => updateTrack(t.id, { pan: +e.target.value })}
              title={`Pan: ${t.pan === 0 ? "Center" : t.pan < 0 ? "Left " + Math.round(-t.pan * 100) + "%" : "Right " + Math.round(t.pan * 100) + "%"} - places the track in the stereo field`}
            />
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className={"minibtn m" + (t.muted ? " on" : "")}
                title="Mute: silence this track"
                onClick={() => updateTrack(t.id, { muted: !t.muted })}
              >
                M
              </button>
              <button
                className={"minibtn s" + (t.soloed ? " on" : "")}
                title="Solo: hear only this track"
                onClick={() => updateTrack(t.id, { soloed: !t.soloed })}
              >
                S
              </button>
            </div>
            <div className="fx" title="Per-channel effects: 3-band EQ and a reverb send. You can also set these by command, e.g. 'add reverb to channel 1' or 'cut the lows on channel 2'.">
              <div className="fxrow">
                <span>LO</span>
                <input className="slider" type="range" min={-12} max={12} step={1} value={t.fx.eqLow}
                  title={`EQ low shelf: ${t.fx.eqLow > 0 ? "+" : ""}${t.fx.eqLow} dB`}
                  onChange={(e) => setTrackFx(t.id, { eqLow: +e.target.value })} />
              </div>
              <div className="fxrow">
                <span>MID</span>
                <input className="slider" type="range" min={-12} max={12} step={1} value={t.fx.eqMid}
                  title={`EQ mid: ${t.fx.eqMid > 0 ? "+" : ""}${t.fx.eqMid} dB`}
                  onChange={(e) => setTrackFx(t.id, { eqMid: +e.target.value })} />
              </div>
              <div className="fxrow">
                <span>HI</span>
                <input className="slider" type="range" min={-12} max={12} step={1} value={t.fx.eqHigh}
                  title={`EQ high shelf: ${t.fx.eqHigh > 0 ? "+" : ""}${t.fx.eqHigh} dB`}
                  onChange={(e) => setTrackFx(t.id, { eqHigh: +e.target.value })} />
              </div>
              <div className="fxrow rev">
                <span>REV</span>
                <input className="slider" type="range" min={0} max={1} step={0.02} value={t.fx.reverb}
                  title={`Reverb send: ${Math.round(t.fx.reverb * 100)}%`}
                  onChange={(e) => setTrackFx(t.id, { reverb: +e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        <div className="strip master" title="Master output: the final mix everyone hears">
          <div className="nm" style={{ color: "var(--amber)" }}>Master</div>
          <div className="faderwrap">
            <input
              className="fader"
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={master}
              onChange={(e) => setMaster(+e.target.value)}
              title={`Master volume: ${Math.round(master * 100)}%`}
            />
            <div className="meter" title="Output level meter: shows how loud the mix is right now. Keep it out of the red to avoid clipping.">
              <div className="fill" style={{ height: `${Math.min(100, level * 130)}%` }} />
            </div>
          </div>
          <div className="hint">{Math.round(master * 100)}%</div>
        </div>
      </div>
    </div>
  );
}
