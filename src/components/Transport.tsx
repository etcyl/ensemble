import { useRef } from "react";
import { useStore } from "../state/store";
import Icon from "./Icon";

function fmt(sec: number, bpm: number) {
  const spb = (60 / bpm) * 4;
  const bar = Math.floor(sec / spb) + 1;
  const beat = Math.floor((sec % spb) / (60 / bpm)) + 1;
  const mm = Math.floor(sec / 60);
  const ss = (sec % 60).toFixed(1).padStart(4, "0");
  return { bbt: `${bar}.${beat}`, clock: `${mm}:${ss}` };
}

export default function Transport({ onRecord }: { onRecord: () => void }) {
  const playing = useStore((s) => s.playing);
  const recording = useStore((s) => s.recording);
  const playhead = useStore((s) => s.playhead);
  const project = useStore((s) => s.project);
  const play = useStore((s) => s.play);
  const stop = useStore((s) => s.stop);
  const seek = useStore((s) => s.seek);
  const setBpm = useStore((s) => s.setBpm);
  const setBars = useStore((s) => s.setBars);
  const toggleMetronome = useStore((s) => s.toggleMetronome);
  const toggleLoop = useStore((s) => s.toggleLoop);
  const loop = useStore((s) => s.project.loop);
  const countIn = useStore((s) => s.project.countIn);
  const toggleCountIn = useStore((s) => s.toggleCountIn);

  const taps = useRef<number[]>([]);
  const tap = () => {
    const now = Date.now();
    taps.current = taps.current.filter((t) => now - t < 2000);
    taps.current.push(now);
    if (taps.current.length >= 2) {
      let sum = 0;
      for (let i = 1; i < taps.current.length; i++) sum += taps.current[i] - taps.current[i - 1];
      const bpm = Math.round(60000 / (sum / (taps.current.length - 1)));
      if (bpm >= 40 && bpm <= 260) setBpm(bpm);
    }
  };

  const t = fmt(playhead, project.bpm);

  return (
    <div className="transport">
      <button className="tbtn" title="Rewind to the start (bar 1)" onClick={() => seek(0)}><Icon name="rewind" /></button>
      <button className={"tbtn play" + (playing ? " on" : "")} title="Play / Stop (Spacebar)" onClick={() => (playing ? stop() : play())}>
        <Icon name={playing ? "pause" : "play"} />
      </button>
      <button className={"tbtn rec" + (recording ? " on" : "")} title="Record live audio from your mic onto the armed track (R)" onClick={onRecord}><Icon name="record" size={16} /></button>
      <button
        className={"tbtn loop" + (loop ? " on" : "")}
        title="Loop: when on, playback repeats the whole arrangement (or the loop region) instead of stopping"
        onClick={toggleLoop}
      >
        <Icon name="loop" />
      </button>

      <div className="timecode" title="Playback position shown as bar.beat" >
        <div>{t.bbt}</div>
      </div>
      <div className="hint" style={{ marginLeft: -8 }} title="Playback position as minutes:seconds">{t.clock}</div>

      <div className="field" title="Tempo in beats per minute. The drums and metronome always lock to this.">
        <label>Tempo</label>
        <div className="row">
          <input className="num" type="number" value={project.bpm} onChange={(e) => setBpm(+e.target.value)} title="Beats per minute (40-260)" />
          <button className="btn ghost" style={{ padding: "5px 9px" }} onClick={tap} title="Tap tempo: click in time (4+ taps) to set the BPM">Tap</button>
        </div>
      </div>

      <div className="field" title="How many bars long the song is. The arrangement and loop span this length.">
        <label>Length</label>
        <div className="row">
          <input className="num" type="number" value={project.bars} onChange={(e) => setBars(+e.target.value)} title="Song length in bars (1-64)" />
          <span className="hint">bars</span>
        </div>
      </div>

      <button className={"btn" + (project.metronome ? " on" : " ghost")} onClick={toggleMetronome} title="Metronome: plays a click on each beat while you record or play, to keep time">
        <Icon name="metronome" size={15} /> Click
      </button>
      <button className={"btn" + (countIn ? " on" : " ghost")} onClick={toggleCountIn} title="Count-in: play one bar of clicks before recording starts">
        1-bar in
      </button>
    </div>
  );
}
