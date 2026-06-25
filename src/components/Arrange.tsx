import { useEffect, useRef, useState } from "react";
import { useStore, snapSec } from "../state/store";
import type { Clip, Track } from "../types";
import PianoRoll from "./PianoRoll";
import Icon from "./Icon";

const HEAD = 210;
const GRIDS = ["1", "1/2", "1/4", "1/8", "1/16"];

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

type DragState =
  | { mode: "move" | "trim-r" | "trim-l"; startX: number; origStart: number; origDur: number; origOffset: number }
  | null;

function ClipView({ clip, track, pxPerSec }: { clip: Clip; track: Track; pxPerSec: number }) {
  const selectClip = useStore((s) => s.selectClip);
  const moveClip = useStore((s) => s.moveClip);
  const trimClip = useStore((s) => s.trimClip);
  const selected = useStore((s) => s.selectedClip);
  const isSel = selected?.clipId === clip.id;
  const drag = useRef<DragState>(null);

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = useStore.getState().project;
    const dx = (e.clientX - d.startX) / pxPerSec;
    if (d.mode === "move") {
      moveClip(track.id, clip.id, d.origStart + dx);
    } else if (d.mode === "trim-r") {
      const end = snapSec(p, d.origStart + d.origDur + dx);
      trimClip(track.id, clip.id, d.origStart, Math.max(0.05, end - d.origStart), d.origOffset);
    } else {
      const ns = Math.min(snapSec(p, d.origStart + dx), d.origStart + d.origDur - 0.05);
      trimClip(track.id, clip.id, Math.max(0, ns), d.origDur - (ns - d.origStart), d.origOffset + (ns - d.origStart));
    }
  };
  const onUp = () => {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  const begin = (e: React.PointerEvent, mode: "move" | "trim-r" | "trim-l") => {
    e.stopPropagation();
    e.preventDefault();
    selectClip(track.id, clip.id);
    drag.current = { mode, startX: e.clientX, origStart: clip.start, origDur: clip.duration, origOffset: clip.offset ?? 0 };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={"clip" + (isSel ? " sel" : "")}
      onPointerDown={(e) => begin(e, "move")}
      title={`${clip.name} - drag to move, edge handles to trim. ${clip.duration.toFixed(1)}s`}
      style={{ left: clip.start * pxPerSec, width: Math.max(14, clip.duration * pxPerSec) }}
    >
      <WaveCanvas peaks={clip.peaks} color={track.color} />
      <span className="clabel">{clip.name}</span>
      <div className="clip-h l" onPointerDown={(e) => begin(e, "trim-l")} title="Trim start" />
      <div className="clip-h r" onPointerDown={(e) => begin(e, "trim-r")} title="Trim end" />
    </div>
  );
}

function InstrumentLane({ track }: { track: Track }) {
  const notes = track.instrument?.notes ?? [];
  const pxPerStep = useStore((s) => s.project.zoom) / 16;
  if (!notes.length) return <div className="lane-empty">double-click to edit notes</div>;
  let lo = Infinity, hi = -Infinity;
  for (const n of notes) { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; }
  const span = Math.max(12, hi - lo);
  return (
    <>
      {notes.map((n, i) => {
        const y = 1 - (n.midi - lo) / span;
        return (
          <div key={i} title={`MIDI ${n.midi}`}
            style={{ position: "absolute", left: n.step * pxPerStep, width: Math.max(3, n.len * pxPerStep - 1),
              top: `calc(10px + ${y * 64}px)`, height: 6, borderRadius: 3, background: track.color, opacity: 0.85 }} />
        );
      })}
    </>
  );
}

function DrumLanePreview({ track }: { track: Track }) {
  const drum = useStore((s) => s.project.drum);
  const bars = useStore((s) => s.project.bars);
  const pxPerBar = useStore((s) => s.project.zoom);
  const cells = [];
  for (let b = 0; b < bars; b++) {
    cells.push(
      <div className="step-preview" key={b} style={{ left: b * pxPerBar, width: pxPerBar, position: "absolute", top: 8, bottom: 8 }}>
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
  const moveTrack = useStore((s) => s.moveTrack);
  const seek = useStore((s) => s.seek);
  const selectClip = useStore((s) => s.selectClip);
  const toggleSnap = useStore((s) => s.toggleSnap);
  const setGrid = useStore((s) => s.setGrid);
  const zoomIn = useStore((s) => s.zoomIn);
  const zoomOut = useStore((s) => s.zoomOut);
  const setLoopRegion = useStore((s) => s.setLoopRegion);
  const [pianoTrack, setPianoTrack] = useState<string | null>(null);

  const pxPerBar = project.zoom;
  const spb = secsPerBar(project.bpm);
  const pxPerSec = pxPerBar / spb;
  const innerW = HEAD + project.bars * pxPerBar;

  const rulerDrag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);
  const xToSec = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return (clientX - rect.left - HEAD) / pxPerSec;
  };
  const onRulerDown = (e: React.PointerEvent) => {
    const host = e.currentTarget.parentElement as HTMLElement; // arrange-inner
    const t0 = Math.max(0, xToSec(e.clientX, host));
    rulerDrag.current = { x0: e.clientX, t0, moved: false };
    const mv = (ev: PointerEvent) => {
      if (!rulerDrag.current) return;
      if (Math.abs(ev.clientX - rulerDrag.current.x0) > 4) rulerDrag.current.moved = true;
      if (rulerDrag.current.moved) {
        const t1 = Math.max(0, xToSec(ev.clientX, host));
        const a = snapSec(project, Math.min(rulerDrag.current.t0, t1));
        const b = snapSec(project, Math.max(rulerDrag.current.t0, t1));
        setLoopRegion(a, Math.max(a + 0.05, b));
      }
    };
    const up = (ev: PointerEvent) => {
      if (rulerDrag.current && !rulerDrag.current.moved) seek(Math.max(0, xToSec(ev.clientX, host)));
      rulerDrag.current = null;
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const hasRegion = project.loopStart != null && project.loopEnd != null;

  return (
    <div className="arrange">
      <div className="arr-toolbar">
        <button className={"btn ghost tiny" + (project.snap ? " on" : "")} onClick={toggleSnap} title="Snap edits to the grid (N)"><Icon name="grid" size={13} /> Snap</button>
        <select className="grid-select" value={project.grid} onChange={(e) => setGrid(e.target.value)} title="Grid resolution that clips and the loop region snap to">
          {GRIDS.map((g) => <option key={g} value={g}>{g === "1" ? "Bar" : g}</option>)}
        </select>
        <button className="btn ghost tiny" onClick={zoomOut} title="Zoom out (-)"><Icon name="minus" size={13} /></button>
        <button className="btn ghost tiny" onClick={zoomIn} title="Zoom in (+)"><Icon name="plus" size={13} /></button>
        {hasRegion && (
          <button className="btn ghost tiny danger" onClick={() => setLoopRegion(null, null)} title="Clear the loop/cycle region"><Icon name="x" size={13} /> Loop</button>
        )}
        <span className="hint" style={{ marginLeft: "auto" }}>drag the ruler to set a loop region · click to seek</span>
      </div>
      <div className="arr-scroll">
        <div className="arrange-inner" style={{ position: "relative", minWidth: innerW }} onPointerDown={() => selectClip(null)}>
          <div className="ruler" onPointerDown={onRulerDown} title="Timeline: click to move the playhead, drag to set a loop region">
            {Array.from({ length: project.bars }).map((_, b) => (
              <div className="bar" key={b} style={{ width: pxPerBar }} title={`Bar ${b + 1}`}>{b + 1}</div>
            ))}
          </div>

          {hasRegion && (
            <div className="loop-region" style={{ left: HEAD + (project.loopStart ?? 0) * pxPerSec, width: ((project.loopEnd ?? 0) - (project.loopStart ?? 0)) * pxPerSec }} />
          )}

          {project.tracks.map((t, i) => (
            <div className="track-row" key={t.id}>
              <div className="track-head">
                <div className="top">
                  <span className="swatch" style={{ background: t.color }} title="Track color" />
                  <input className="tname" value={t.name} onChange={(e) => updateTrack(t.id, { name: e.target.value })} title="Track name" />
                  <button className="minibtn x2" title="Move up" disabled={i === 0} onClick={() => moveTrack(t.id, -1)}><Icon name="up" size={12} /></button>
                  <button className="minibtn x2" title="Move down" disabled={i === project.tracks.length - 1} onClick={() => moveTrack(t.id, 1)}><Icon name="down" size={12} /></button>
                  {t.type === "audio" && <button className="minibtn x" title="Delete this track" onClick={() => removeTrack(t.id)}><Icon name="x" size={12} /></button>}
                </div>
                <div className="ctrls">
                  <button className={"minibtn m" + (t.muted ? " on" : "")} title="Mute" onClick={() => updateTrack(t.id, { muted: !t.muted })}>M</button>
                  <button className={"minibtn s" + (t.soloed ? " on" : "")} title="Solo" onClick={() => updateTrack(t.id, { soloed: !t.soloed })}>S</button>
                  {t.type === "audio" && <button className={"minibtn r" + (t.armed ? " on" : "")} title="Record-arm" onClick={() => updateTrack(t.id, { armed: !t.armed })}><Icon name="record" size={10} /></button>}
                  {t.type === "instrument" && <button className="minibtn edit" title="Edit notes in the piano roll" onClick={() => setPianoTrack(t.id)}><Icon name="pencil" size={12} /></button>}
                  <span className="hint" style={{ marginLeft: "auto", textTransform: "uppercase", fontSize: 9 }}>{t.type}</span>
                </div>
                <div className="vol" title="Track volume">
                  <input className="slider" type="range" min={0} max={1.5} step={0.01} value={t.volume} onChange={(e) => updateTrack(t.id, { volume: +e.target.value })} title={`Track volume: ${Math.round(t.volume * 100)}%`} />
                </div>
              </div>
              <div className={"lane" + (t.type === "drum" ? " drum" : "")}
                onDoubleClick={t.type === "instrument" ? () => setPianoTrack(t.id) : undefined}>
                {t.type === "drum" ? (
                  <DrumLanePreview track={t} />
                ) : t.type === "instrument" ? (
                  <InstrumentLane track={t} />
                ) : (
                  t.clips.map((c) => <ClipView key={c.id} clip={c} track={t} pxPerSec={pxPerSec} />)
                )}
              </div>
            </div>
          ))}

          <div className="playhead" style={{ left: HEAD + playhead * pxPerSec }} />
        </div>
      </div>
      {pianoTrack && <PianoRoll trackId={pianoTrack} onClose={() => setPianoTrack(null)} />}
    </div>
  );
}
