# Ensemble vs. Cubase / Ableton: parity research and plan

Research synthesized from DAW comparisons and UX guides (Ableton vs Cubase workflow,
piano-roll/automation UX, and the common keyboard-shortcut vocabulary across Pro Tools,
Studio One, Ableton, Reaper). Ensemble's north star is different from those tools: do
what they do, but reach it three ways - GUI, typed command, or voice - and keep it simple.

## The core philosophical split (and where Ensemble sits)
- **Cubase**: linear, timeline-first, deep recording/editing + a big mix console.
- **Ableton**: dual Session (clip/loop launching) + Arrangement (timeline) views.
- **Ensemble**: a single timeline arrangement with a loop-based Beat Maker and a unified
  command layer. We borrow Cubase's clip editing and mixer depth and Ableton's
  loop/quick-mix feel, minus the learning curve.

## Gap analysis -> what we implemented this pass
Clip/arrangement editing (the biggest gap; clips were immovable):
- Select, **drag-move**, **trim**, **split at playhead**, **duplicate**, **delete** clips.
- **Snap to grid** toggle + grid value; **horizontal zoom** (in/out/fit).
- **Loop / cycle region** drawn on the ruler; playback loops just that region.

Production essentials:
- **Undo / redo** with coalesced history (one undo per gesture).
- **Count-in** before recording; **tap tempo**.
- **Track reorder** (move up/down).
- **Master-bus FX** (EQ + compression/limiter on the master output).
- **Stem export** (each track bounced to its own WAV) in addition to the full mixdown.

MIDI / instruments:
- **Piano-roll editor** for instrument tracks: add, move, delete and length notes on a
  pitch x time grid, snapped to the bar grid.

Every one of the above is reachable by GUI, by typed command, and (where it makes sense)
by voice - e.g. "undo", "split clip", "duplicate clip", "snap on", "zoom in",
"count in on", "tap tempo", "export stems", "move channel 2 up", "compress the master".

## Deliberately deferred (honest roadmap)
- Audio warp / time-stretch and pitch correction (Cubase VariAudio / AudioWarp): heavy DSP.
- Full automation lanes (draw volume/FX curves over time).
- Real sample-library instruments (we synthesize) and VST/AU plugin hosting (not possible
  in a sandboxed browser engine).
- Comping / take lanes, and a separate Ableton-style Session clip-launch view.

These are large, mostly-DSP or plugin-host features that do not fit a sandboxed Web Audio
build; they are the next milestones if Ensemble moves to a native audio backend.
