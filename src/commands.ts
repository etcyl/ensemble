// One command grammar for every input modality (typed text, voice-to-text, and
// the GUI buttons, which call the same store actions). Parsing is intentionally
// forgiving: it looks for intent and a channel number, not exact phrasing.
import { useStore } from "./state/store";
import type { Track, TrackFx } from "./types";

// recognize a note division in spoken/typed text -> sync id, "" (free), or null
function parseDivision(t: string): string | null {
  if (/\b(unsync|un-sync|free|no sync|millisecond)\b/.test(t)) return "";
  const dotted = /\bdotted\b/.test(t);
  const triplet = /\btriplets?\b/.test(t);
  const base = /\bquarter\b/.test(t) ? "1/4"
    : /\b(eighth|8th)\b/.test(t) ? "1/8"
    : /\b(sixteenth|16th)\b/.test(t) ? "1/16"
    : /\bhalf\b/.test(t) ? "1/2" : null;
  if (!base) return null;
  if (triplet && base === "1/8") return "1/8t";
  if (dotted) return base + ".";
  return base;
}

export interface CommandResult { ok: boolean; message: string; }

// the recorder lives in the React layer; commands talk to it through this bridge
type Recorder = { start: () => void; stop: () => void; isRecording: () => boolean };
let recorder: Recorder = { start: () => {}, stop: () => {}, isRecording: () => false };
export function registerRecorder(r: Recorder) { recorder = r; }

// the Harmonize panel opener (also React-side)
let openHarmonize: () => void = () => {};
export function registerHarmonizeOpener(fn: () => void) { openHarmonize = fn; }
let runMixdown: () => void = () => {};
export function registerMixdown(fn: () => void) { runMixdown = fn; }
let runStems: () => void = () => {};
export function registerStems(fn: () => void) { runStems = fn; }

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, eighty: 80, hundred: 100,
};
function parseNumber(t: string): number | null {
  const d = t.match(/\b(\d{1,3})\b/);
  if (d) return parseInt(d[1], 10);
  // simple compounds like "one twenty" -> 120, "one forty" -> 140
  const comp = t.match(/\bone\s+(twenty|thirty|forty|fifty|sixty|eighty)\b/);
  if (comp) return 100 + NUM_WORDS[comp[1]];
  for (const k in NUM_WORDS) if (new RegExp("\\b" + k + "\\b").test(t)) return NUM_WORDS[k];
  return null;
}

function channelTrack(t: string): Track | null {
  const tracks = useStore.getState().project.tracks;
  const n = parseNumber(t);
  if (n && n >= 1 && n <= tracks.length) return tracks[n - 1];
  return null;
}
function targetTrack(t: string): Track | null {
  const tracks = useStore.getState().project.tracks;
  return (
    channelTrack(t) ||
    tracks.find((x) => x.armed && x.type === "audio") ||
    tracks.find((x) => x.type === "audio") ||
    tracks[0] ||
    null
  );
}
function chName(tr: Track) {
  const idx = useStore.getState().project.tracks.indexOf(tr);
  return `channel ${idx + 1} (${tr.name})`;
}

function band(t: string): "eqLow" | "eqMid" | "eqHigh" | null {
  if (/\b(bass|low|lows|bottom|sub)\b/.test(t)) return "eqLow";
  if (/\b(mid|mids|middle|mid-?range)\b/.test(t)) return "eqMid";
  if (/\b(treble|high|highs|top|bright|presence)\b/.test(t)) return "eqHigh";
  return null;
}
const UP = /\b(up|more|boost|raise|increase|add|higher|brighten)\b/;
const DOWN = /\b(down|less|cut|lower|reduce|drop|darken)\b/;

// resolve which effects target a command refers to: a channel or the master bus
function resolveFx(t: string): { fx: TrackFx; set: (p: Partial<TrackFx>) => void; name: string } | null {
  const S = useStore.getState();
  if (/\bmaster|master bus|main mix|the mix\b/.test(t))
    return { fx: S.project.masterFx, set: S.setMasterFx, name: "the master" };
  const tr = targetTrack(t);
  if (!tr) return null;
  return { fx: tr.fx, set: (p) => S.setTrackFx(tr.id, p), name: chName(tr) };
}

export function runCommand(raw: string): CommandResult {
  const t = raw.toLowerCase().trim();
  if (!t) return { ok: false, message: "" };
  const S = useStore.getState();
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const no = (message: string): CommandResult => ({ ok: false, message });

  // --- recording / playback mode ---
  if (/\b(stop|halt|pause)\b/.test(t)) {
    if (recorder.isRecording()) recorder.stop();
    S.stop();
    return ok("Stopped.");
  }
  if (/\brecord\b|\barm\b/.test(t)) {
    const tr = channelTrack(t);
    if (tr && tr.type === "audio") S.updateTrack(tr.id, { armed: true });
    recorder.start();
    return ok(tr ? `Recording ${chName(tr)}.` : "Recording.");
  }
  if (/\bplayback\b|set .* to (play|playback)|\bmonitor off\b/.test(t)) {
    const tr = channelTrack(t);
    if (tr) {
      S.updateTrack(tr.id, { armed: false, muted: false });
      return ok(`${chName(tr)} set to playback.`);
    }
    return no("Which channel? Try \"set channel 1 to playback\".");
  }

  // --- editing / history / view ---
  if (/\bundo\b/.test(t)) { S.undo(); return ok("Undone."); }
  if (/\bredo\b/.test(t)) { S.redo(); return ok("Redone."); }
  if (/\bduplicate\b|\bcopy clip\b/.test(t)) return S.duplicateSelected() ? ok("Duplicated the clip.") : no("Select a clip first.");
  if (/\bsplit\b/.test(t)) return S.splitAtPlayhead() ? ok("Split the clip at the playhead.") : no("Put the playhead inside a selected clip, then split.");
  if (/\b(delete|remove)\b.*\bclip\b|\bdelete selection\b/.test(t)) return S.deleteSelected() ? ok("Deleted the clip.") : no("Select a clip first.");
  if (/\bsnap\b/.test(t)) {
    const on = /\bon\b/.test(t), off = /\boff\b/.test(t);
    if ((on && !S.project.snap) || (off && S.project.snap) || (!on && !off)) S.toggleSnap();
    return ok(`Snap ${useStore.getState().project.snap ? "on" : "off"}.`);
  }
  if (/\bzoom\b/.test(t)) { const out = /\bout\b/.test(t); out ? S.zoomOut() : S.zoomIn(); return ok(`Zoomed ${out ? "out" : "in"}.`); }
  if (/count[- ]?in/.test(t)) {
    const on = /\bon\b/.test(t), off = /\boff\b/.test(t);
    if ((on && !S.project.countIn) || (off && S.project.countIn) || (!on && !off)) S.toggleCountIn();
    return ok(`Count-in ${useStore.getState().project.countIn ? "on" : "off"}.`);
  }
  if (/(clear|remove|no)\b.*\b(loop|cycle)\b/.test(t)) { S.setLoopRegion(null, null); return ok("Loop region cleared."); }
  if (/\b(move|reorder)\b.*\b(up|down)\b/.test(t)) {
    const tr = channelTrack(t);
    if (tr) { const dir = /\bup\b/.test(t) ? -1 : 1; return S.moveTrack(tr.id, dir) ? ok(`Moved ${chName(tr)} ${dir < 0 ? "up" : "down"}.`) : no("Can't move further."); }
  }
  if (/\bstems\b|stem export|export tracks|bounce tracks/.test(t)) { runStems(); return ok("Exporting stems..."); }

  // --- erase / clear ---
  if (/\b(erase|clear|wipe|delete)\b/.test(t)) {
    if (/\b(beat|pattern|drums?)\b/.test(t)) { S.clearDrum(); return ok("Cleared the beat."); }
    const tr = channelTrack(t);
    if (tr) { S.clearTrackClips(tr.id); return ok(`Erased ${chName(tr)}.`); }
    return no("Which channel to erase? Try \"erase channel 2\".");
  }

  // --- reverb (channel or master) ---
  if (/\breverb\b|\bverb\b/.test(t)) {
    const tg = resolveFx(t);
    if (!tg) return no("No channel to add reverb to.");
    let v = tg.fx.reverb;
    if (/\b(remove|no|kill|off|none|dry)\b/.test(t)) v = 0;
    else if (DOWN.test(t)) v = v - 0.15;
    else if (/\bmore\b|increase|wetter/.test(t)) v = (v || 0.3) + 0.15;
    else v = Math.max(v, 0.4);
    tg.set({ reverb: v });
    return ok(`Reverb on ${tg.name}: ${Math.round(Math.max(0, Math.min(1, v)) * 100)}%.`);
  }

  // --- delay / echo (with optional tempo sync) ---
  if (/\bdelay\b|\becho\b/.test(t)) {
    const tg = resolveFx(t);
    if (!tg) return no("No channel for delay.");
    const patch: Partial<TrackFx> = {};
    const div = parseDivision(t);
    if (div !== null) { patch.delaySync = div; if (div) patch.delay = Math.max(tg.fx.delay, 0.4); }
    if (/\b(remove|no|kill|off|none)\b/.test(t)) patch.delay = 0;
    else if (DOWN.test(t)) patch.delay = tg.fx.delay - 0.15;
    else if (/\bmore\b|increase/.test(t)) patch.delay = (tg.fx.delay || 0.3) + 0.15;
    else if (div === null) patch.delay = Math.max(tg.fx.delay, 0.4);
    tg.set(patch);
    const amt = patch.delay ?? tg.fx.delay;
    const sync = patch.delaySync ?? tg.fx.delaySync;
    return ok(`Delay on ${tg.name}: ${Math.round(Math.max(0, Math.min(1, amt)) * 100)}%${sync ? ` synced to ${sync}` : ""}.`);
  }

  // --- compression ---
  if (/\bcompress|compression\b|\bcomp\b|limiter/.test(t)) {
    const tg = resolveFx(t);
    if (!tg) return no("No channel to compress.");
    let v = tg.fx.comp;
    if (/\b(remove|no|kill|off|none)\b/.test(t)) v = 0;
    else if (DOWN.test(t)) v = v - 0.2;
    else if (/\bmore\b|increase|harder/.test(t)) v = (v || 0.3) + 0.2;
    else v = Math.max(v, 0.5);
    tg.set({ comp: v });
    return ok(`Compression on ${tg.name}: ${Math.round(Math.max(0, Math.min(1, v)) * 100)}%.`);
  }

  // --- EQ ---
  if (/\beq\b|equaliz/.test(t) || (band(t) && (UP.test(t) || DOWN.test(t)))) {
    const tg = resolveFx(t);
    if (!tg) return no("No channel to EQ.");
    const b = band(t) ?? "eqMid";
    const dir = DOWN.test(t) && !UP.test(t) ? -3 : 3;
    const next = tg.fx[b] + dir;
    tg.set({ [b]: next } as Partial<TrackFx>);
    const label = b === "eqLow" ? "lows" : b === "eqMid" ? "mids" : "highs";
    return ok(`${dir > 0 ? "Boosted" : "Cut"} ${label} on ${tg.name} (${next > 0 ? "+" : ""}${next} dB).`);
  }

  // --- mute / solo ---
  if (/\bunmute\b/.test(t)) { const tr = channelTrack(t); if (tr) { S.updateTrack(tr.id, { muted: false }); return ok(`Unmuted ${chName(tr)}.`); } }
  if (/\bmute\b/.test(t)) { const tr = channelTrack(t); if (tr) { S.updateTrack(tr.id, { muted: true }); return ok(`Muted ${chName(tr)}.`); } }
  if (/\b(unsolo|clear solo)\b/.test(t)) { const tr = channelTrack(t); if (tr) { S.updateTrack(tr.id, { soloed: false }); return ok(`Solo off ${chName(tr)}.`); } }
  if (/\bsolo\b/.test(t)) { const tr = channelTrack(t); if (tr) { S.updateTrack(tr.id, { soloed: true }); return ok(`Soloed ${chName(tr)}.`); } }

  // --- volume / pan ---
  if (/\b(louder|volume up|turn up|quieter|softer|volume down|turn down)\b/.test(t)) {
    const up = /\b(louder|volume up|turn up)\b/.test(t);
    const tr = channelTrack(t);
    if (tr) {
      const v = Math.max(0, Math.min(1.5, tr.volume + (up ? 0.12 : -0.12)));
      S.updateTrack(tr.id, { volume: v });
      return ok(`${chName(tr)} ${up ? "louder" : "softer"} (${Math.round(v * 100)}%).`);
    }
    S.setMaster(Math.max(0, Math.min(1.5, S.project.master + (up ? 0.1 : -0.1))));
    return ok(`Master ${up ? "up" : "down"}.`);
  }
  if (/\bpan\b/.test(t)) {
    const tr = channelTrack(t);
    if (tr) {
      const pan = /\bleft\b/.test(t) ? -0.7 : /\bright\b/.test(t) ? 0.7 : 0;
      S.updateTrack(tr.id, { pan });
      return ok(`Panned ${chName(tr)} ${pan < 0 ? "left" : pan > 0 ? "right" : "center"}.`);
    }
  }

  // --- transport / project ---
  if (/\b(tempo|bpm|speed)\b/.test(t)) {
    const n = parseNumber(t);
    if (n && n >= 40 && n <= 260) { S.setBpm(n); return ok(`Tempo ${n} BPM.`); }
  }
  if (/\bloop\b/.test(t)) {
    const on = /\b(on|enable)\b/.test(t), off = /\b(off|disable|stop)\b/.test(t);
    if (S.project.loop !== (on || !off ? true : false) || on || off) {
      if (on && !S.project.loop) S.toggleLoop();
      else if (off && S.project.loop) S.toggleLoop();
      else S.toggleLoop();
    }
    return ok(`Loop ${useStore.getState().project.loop ? "on" : "off"}.`);
  }
  if (/metronome|\bclick\b/.test(t)) {
    const off = /\b(off|stop|mute|no)\b/.test(t);
    if (S.project.metronome === off) S.toggleMetronome();
    return ok(`Metronome ${useStore.getState().project.metronome ? "on" : "off"}.`);
  }
  if (/\b(add|new)\b.*\b(track|channel)\b/.test(t)) { S.addAudioTrack(); return ok("Added an audio track."); }
  if (/\b(harmonize|harmonise|accompany)\b|add (drums|bass|keys|instruments?)/.test(t)) { openHarmonize(); return ok("Opened Harmonize."); }
  if (/\b(mixdown|mix down|bounce|export|render)\b/.test(t)) { runMixdown(); return ok("Rendering mixdown..."); }
  if (/\b(play|start|go|begin)\b/.test(t)) { S.play(); return ok("Playing."); }

  return no(`Sorry, I didn't understand "${raw}".`);
}

// Suggest a few likely commands for an unrecognized input, biased by any words
// the user already typed (channel number, effect names, etc.).
export function suggest(raw: string): string[] {
  const t = raw.toLowerCase();
  const tracks = useStore.getState().project.tracks;
  const n = (() => { const m = t.match(/\b(\d{1,2})\b/); return m ? +m[1] : null; })();
  const ch = n && n >= 1 && n <= tracks.length ? n : 1;
  const pool: { k: RegExp; s: string }[] = [
    { k: /reverb|verb|wet|space/, s: `add reverb to channel ${ch}` },
    { k: /delay|echo/, s: `add delay to channel ${ch}` },
    { k: /comp|squash|punch/, s: `add compression to channel ${ch}` },
    { k: /eq|bass|low|treble|high|mid|bright/, s: `bring up the highs on channel ${ch}` },
    { k: /record|rec|arm|take/, s: `record channel ${ch}` },
    { k: /play(back)?|monitor/, s: `set channel ${ch} to playback` },
    { k: /erase|clear|delete|wipe/, s: `erase channel ${ch}` },
    { k: /mute|silence/, s: `mute channel ${ch}` },
    { k: /solo|alone/, s: `solo channel ${ch}` },
    { k: /loud|soft|volume|gain/, s: `turn up channel ${ch}` },
    { k: /pan|left|right|stereo/, s: `pan channel ${ch} left` },
    { k: /tempo|bpm|speed|fast|slow/, s: `set tempo to 120` },
    { k: /loop|repeat/, s: `loop on` },
    { k: /metro|click|beat keeper/, s: `metronome off` },
    { k: /harmon|accompan|instrument|drums|bass|keys/, s: `harmonize` },
    { k: /export|bounce|mixdown|render|wav|save audio/, s: `export` },
    { k: /stem|separate track/, s: `export stems` },
    { k: /undo|mistake|revert/, s: `undo` },
    { k: /redo/, s: `redo` },
    { k: /split|cut clip|slice/, s: `split clip` },
    { k: /duplicate|copy/, s: `duplicate clip` },
    { k: /snap|grid|quantize/, s: `snap on` },
    { k: /zoom|bigger|smaller|closer/, s: `zoom in` },
    { k: /count.?in|pre.?roll/, s: `count in on` },
    { k: /loop|cycle/, s: `clear loop` },
  ];
  const hits = pool.filter((p) => p.k.test(t)).map((p) => p.s);
  if (hits.length) return Array.from(new Set(hits)).slice(0, 4);
  // generic starter set
  return [`record channel ${ch}`, `add reverb to channel ${ch}`, `set tempo to 120`, `harmonize`];
}
