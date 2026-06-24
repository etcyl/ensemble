import { useStore } from "../state/store";

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

  const t = fmt(playhead, project.bpm);

  return (
    <div className="transport">
      <button className="tbtn" title="Rewind to the start (bar 1)" onClick={() => seek(0)}>⏮</button>
      <button className={"tbtn play" + (playing ? " on" : "")} title="Play / Stop (Spacebar)" onClick={() => (playing ? stop() : play())}>
        {playing ? "⏸" : "▶"}
      </button>
      <button className={"tbtn rec" + (recording ? " on" : "")} title="Record live audio from your mic onto the armed track (R)" onClick={onRecord}>●</button>
      <button
        className={"tbtn loop" + (loop ? " on" : "")}
        title="Loop: when on, playback repeats the whole arrangement instead of stopping at the end"
        onClick={toggleLoop}
      >
        🔁
      </button>

      <div className="timecode" title="Playback position shown as bar.beat" >
        <div>{t.bbt}</div>
      </div>
      <div className="hint" style={{ marginLeft: -8 }} title="Playback position as minutes:seconds">{t.clock}</div>

      <div className="field" title="Tempo in beats per minute. The drums and metronome always lock to this.">
        <label>Tempo</label>
        <div className="row">
          <input className="num" type="number" value={project.bpm} onChange={(e) => setBpm(+e.target.value)} title="Beats per minute (40-260)" />
          <span className="hint">BPM</span>
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
        🅼 Click
      </button>
    </div>
  );
}
