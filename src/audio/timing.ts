// Tempo / note-division helpers shared by the engine, commands and UI.

export interface Division { id: string; name: string; }

// dropdown options for synced delay ("" = free / use the millisecond time)
export const DELAY_DIVISIONS: Division[] = [
  { id: "", name: "Free" },
  { id: "1/2", name: "1/2 note" },
  { id: "1/4", name: "1/4 note" },
  { id: "1/4.", name: "1/4 dotted" },
  { id: "1/8", name: "1/8 note" },
  { id: "1/8.", name: "1/8 dotted" },
  { id: "1/8t", name: "1/8 triplet" },
  { id: "1/16", name: "1/16 note" },
];

// Convert a sync id like "1/8.", "1/8t" to a beat count (a quarter note = 1 beat).
export function divisionBeats(sync: string): number | null {
  const m = sync.match(/^1\/(\d+)([.t]?)$/);
  if (!m) return null;
  let beats = 4 / parseInt(m[1], 10); // 1/4 -> 1, 1/8 -> 0.5, 1/16 -> 0.25
  if (m[2] === ".") beats *= 1.5; // dotted
  else if (m[2] === "t") beats *= 2 / 3; // triplet
  return beats;
}

// Effective delay time in seconds: synced to tempo, or the free time.
export function delaySeconds(bpm: number, sync: string, freeTime: number): number {
  const beats = sync ? divisionBeats(sync) : null;
  if (beats == null) return freeTime;
  return Math.min(2, (60 / bpm) * beats);
}
