import { useRef } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/AudioEngine";
import { SOUND_LIBRARY } from "../audio/InstrumentSynth";
import type { Note } from "../types";

const ROW_H = 14;
const CELL_W = 17;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const noteName = (m: number) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

type Drag = { mode: "move" | "resize"; index: number; startX: number; startY: number; orig: Note } | null;

export default function PianoRoll({ trackId, onClose }: { trackId: string; onClose: () => void }) {
  const track = useStore((s) => s.project.tracks.find((t) => t.id === trackId));
  const bars = useStore((s) => s.project.bars);
  const setInstrumentNotes = useStore((s) => s.setInstrumentNotes);
  const setInstrumentSound = useStore((s) => s.setInstrumentSound);
  const drag = useRef<Drag>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  if (!track || !track.instrument) return null;
  const notes = track.instrument.notes;
  const cols = bars * 16;

  // pitch range: around the existing notes, clamped, with a sensible default
  let lo = 60, hi = 72;
  if (notes.length) {
    lo = Math.min(...notes.map((n) => n.midi)) - 2;
    hi = Math.max(...notes.map((n) => n.midi)) + 2;
  }
  lo = Math.max(24, Math.min(lo, 60));
  hi = Math.min(96, Math.max(hi, 72));
  const rows: number[] = [];
  for (let m = hi; m >= lo; m--) rows.push(m);

  const setNotes = (ns: Note[]) => setInstrumentNotes(trackId, ns);
  const pointToCell = (clientX: number, clientY: number) => {
    const el = gridRef.current!;
    const rect = el.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left + el.scrollLeft) / CELL_W);
    const row = Math.floor((clientY - rect.top) / ROW_H);
    return { col: Math.max(0, col), midi: hi - row };
  };
  const noteAt = (col: number, midi: number) =>
    notes.findIndex((n) => n.midi === midi && col >= n.step && col < n.step + n.len);

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dCol = Math.round((e.clientX - d.startX) / CELL_W);
    const dRow = Math.round((e.clientY - d.startY) / ROW_H);
    const ns = notes.slice();
    if (d.mode === "move") {
      ns[d.index] = { ...d.orig, step: Math.max(0, d.orig.step + dCol), midi: Math.max(0, Math.min(108, d.orig.midi - dRow)) };
    } else {
      ns[d.index] = { ...d.orig, len: Math.max(1, d.orig.len + dCol) };
    }
    setNotes(ns);
  };
  const onUp = () => {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  const startDrag = (mode: "move" | "resize", index: number, e: React.PointerEvent, orig: Note) => {
    drag.current = { mode, index, startX: e.clientX, startY: e.clientY, orig };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onGridDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".pr-note")) return; // handled by the note
    const { col, midi } = pointToCell(e.clientX, e.clientY);
    const existing = noteAt(col, midi);
    if (existing >= 0) return;
    const note: Note = { step: col, midi, len: 2, vel: 0.8 };
    const ns = [...notes, note];
    setNotes(ns);
    engine.previewInstrument(trackId, midi);
    startDrag("resize", ns.length - 1, e, note); // drag right to set length
  };

  const onNoteDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    const n = notes[index];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nearRight = e.clientX > rect.right - 7;
    engine.previewInstrument(trackId, n.midi);
    startDrag(nearRight ? "resize" : "move", index, e, n);
  };
  const onNoteDouble = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setNotes(notes.filter((_, i) => i !== index));
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal pr-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Piano Roll <span style={{ color: track.color }}>· {track.name}</span></h2>
        <div className="pr-soundbar">
          <span className="fxp-label">Sound</span>
          <select className="fxp-select" style={{ maxWidth: 220 }} value={track.instrument.sound}
            title="The instrument voice this track plays - pick from the library"
            onChange={(e) => { setInstrumentSound(trackId, e.target.value); engine.previewSound(e.target.value); }}>
            {SOUND_LIBRARY.map((s) => <option key={s.id} value={s.id}>{s.category} - {s.name}</option>)}
          </select>
        </div>
        <p>Click to add a note (drag to set length), drag a note to move, drag its right edge to resize, double-click to delete.</p>
        <div className="pr-wrap">
          <div className="pr-keys" style={{ height: rows.length * ROW_H }}>
            {rows.map((m) => (
              <div key={m} className={"pr-key" + (isBlack(m) ? " black" : "")} style={{ height: ROW_H }}>
                {m % 12 === 0 ? noteName(m) : ""}
              </div>
            ))}
          </div>
          <div className="pr-grid" ref={gridRef} onPointerDown={onGridDown}
            style={{ width: cols * CELL_W, height: rows.length * ROW_H,
              backgroundSize: `${CELL_W}px ${ROW_H}px, ${CELL_W * 4}px ${ROW_H}px, ${CELL_W * 16}px ${ROW_H}px` }}>
            {rows.map((m) => isBlack(m) && (
              <div key={m} className="pr-blackrow" style={{ top: (hi - m) * ROW_H, height: ROW_H }} />
            ))}
            {notes.map((n, i) => (hi - n.midi >= 0 && n.midi >= lo) && (
              <div key={i} className="pr-note" title={`${noteName(n.midi)} - double-click to delete`}
                onPointerDown={(e) => onNoteDown(e, i)} onDoubleClick={(e) => onNoteDouble(e, i)}
                style={{ left: n.step * CELL_W, top: (hi - n.midi) * ROW_H + 1, width: n.len * CELL_W - 1, height: ROW_H - 2, background: track.color }} />
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn ghost danger" onClick={() => setNotes([])} title="Remove every note from this track">Clear notes</button>
          <button className="btn accent" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
