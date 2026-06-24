import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import type { Clip, Track } from "../types";

const PX_PER_BAR = 80;
const HEAD = 210;

function secsPerBar(bpm: number) {
  return (60 / bpm) * 4;
}

function WaveCanvas({ peaks, color }: { peaks?: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = (c.width = c.clientWidth * devicePixelRatio);
    const h = (c.height = c.clientHeight * devicePixelRatio);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    if (!peaks || !peaks.length) return;
    ctx.fillStyle = color;
    const mid = h / 2;
    const step = w / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const ph = Math.max(1, peaks[i] * h * 0.9);
      ctx.fillRect(i * step, mid - ph / 2, Math.max(1, step - 0.5), ph);
    }
  }, [peaks, color]);
  return <canvas ref={ref} />;
}

function ClipView({ clip, color, pxPerSec }: { clip: Clip; color: string; pxPerSec: number }) {
  return (
    <div
      className="clip"
      title={`${clip.name} - recorded audio clip, ${clip.duration.toFixed(1)}s long`}
      style={{
        left: clip.start * pxPerSec,
        width: Math.max(20, clip.duration * pxPerSec),
      }}
    >
      <WaveCanvas peaks={clip.peaks} color={color} />
      <span className="clabel">{clip.name}</span>
    </div>
  );
}

function InstrumentLane({ track }: { track: Track }) {
  const notes = track.instrument?.notes ?? [];
  if (!notes.length) return null;
  const pxPerStep = PX_PER_BAR / 16;
  let lo = Infinity, hi = -Infinity;
  for (const n of notes) { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; }
  const span = Math.max(12, hi - lo);
  return (
    <>
      {notes.map((n, i) => {
        const y = 1 - (n.midi - lo) / span; // 0 top .. 1 bottom
        return (
          <div
            key={i}
            title={`MIDI ${n.midi}`}
            style={{
              position: "absolute",
              left: n.step * pxPerStep,
              width: Math.max(3, n.len * pxPerStep - 1),
              top: `calc(10px + ${y * 64}px)`,
              height: 6,
              borderRadius: 3,
              background: track.color,
              opacity: 0.85,
            }}
          />
        );
      })}
    </>
  );
}

function DrumLanePreview({ track }: { track: Track }) {
  const drum = useStore((s) => s.project.drum);
  const bars = useStore((s) => s.project.bars);
  // tile the 16-step kick/snare pattern across bars as a glanceable preview
  const cells = [];
  for (let b = 0; b < bars; b++) {
    cells.push(
      <div className="step-preview" key={b} style={{ left: b * PX_PER_BAR, width: PX_PER_BAR, position: "absolute", top: 8, bottom: 8 }}>
        {Array.from({ length: 16 }).map((_, i) => {
          const on = drum.voices.kick[i] || drum.voices.snare[i] || drum.voices.hat[i];
          return <div key={i} className={"sp" + (on ? " on" : "")} style={{ opacity: on ? 0.7 : 0.3, background: on ? track.color : "rgba(255,255,255,0.06)" }} />;
        })}
      </div>
    );
  }
  return <>{cells}</>;
}

export default function Arrange() {
  const project = useStore((s) => s.project);
  const playhead = useStore((s) => s.playhead);
  const updateTrack = useStore((s) => s.updateTrack);
  const removeTrack = useStore((s) => s.removeTrack);
  const seek = useStore((s) => s.seek);

  const spb = secsPerBar(project.bpm);
  const pxPerSec = PX_PER_BAR / spb;
  const innerW = HEAD + project.bars * PX_PER_BAR;

  const onRuler = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + (e.currentTarget as HTMLElement).scrollLeft - HEAD;
    if (x < 0) return;
    seek(x / pxPerSec);
  };

  return (
    <div className="arrange">
      <div style={{ position: "relative", minWidth: innerW }}>
        <div className="ruler" onClick={onRuler} title="Timeline ruler (bar numbers). Click anywhere to move the playhead there.">
          {Array.from({ length: project.bars }).map((_, b) => (
            <div className="bar" key={b} style={{ width: PX_PER_BAR }} title={`Bar ${b + 1}`}>
              {b + 1}
            </div>
          ))}
        </div>

        {project.tracks.map((t) => (
          <div className="track-row" key={t.id}>
            <div className="track-head">
              <div className="top">
                <span className="swatch" style={{ background: t.color }} title="Track color" />
                <input
                  className="tname"
                  value={t.name}
                  onChange={(e) => updateTrack(t.id, { name: e.target.value })}
                  title="Track name (click to rename)"
                />
                {t.type === "audio" && (
                  <button className="minibtn x" title="Delete this track" onClick={() => removeTrack(t.id)}>
                    ✕
                  </button>
                )}
              </div>
              <div className="ctrls">
                <button className={"minibtn m" + (t.muted ? " on" : "")} title="Mute: silence this track" onClick={() => updateTrack(t.id, { muted: !t.muted })}>M</button>
                <button className={"minibtn s" + (t.soloed ? " on" : "")} title="Solo: hear only this track (mutes all others)" onClick={() => updateTrack(t.id, { soloed: !t.soloed })}>S</button>
                {t.type === "audio" && (
                  <button className={"minibtn r" + (t.armed ? " on" : "")} title="Record-arm: new recordings land on this track. Only one track is armed at a time." onClick={() => updateTrack(t.id, { armed: !t.armed })}>●</button>
                )}
                <span className="hint" style={{ marginLeft: "auto", textTransform: "uppercase", fontSize: 9 }} title={t.type === "drum" ? "Drum track: driven by the Beat Maker below" : "Audio track: holds your live recordings"}>{t.type}</span>
              </div>
              <div className="vol" title="Track volume">
                <input className="slider" type="range" min={0} max={1.5} step={0.01} value={t.volume} onChange={(e) => updateTrack(t.id, { volume: +e.target.value })} title={`Track volume: ${Math.round(t.volume * 100)}%`} />
              </div>
            </div>
            <div className={"lane" + (t.type === "drum" ? " drum" : "")}>
              {t.type === "drum" ? (
                <DrumLanePreview track={t} />
              ) : t.type === "instrument" ? (
                <InstrumentLane track={t} />
              ) : (
                t.clips.map((c) => <ClipView key={c.id} clip={c} color={t.color} pxPerSec={pxPerSec} />)
              )}
            </div>
          </div>
        ))}

        <div className="playhead" style={{ left: HEAD + playhead * pxPerSec }} />
      </div>
    </div>
  );
}
