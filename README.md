# Ensemble

A deliberately simple, fast DAW. Where Cubase/Logic give you a thousand panels,
Ensemble gives you the few things you actually reach for: lay down tracks, record
live, build a beat that locks to the tempo, and mix. Optional voice control so you
can drive it hands-free while an instrument is in your hands.

Everything runs locally in the browser engine (Web Audio API). No accounts, no cloud.

## Run it locally (web)

```bash
npm install
npm run dev          # opens http://localhost:5180
```

## What works today (v1)

- **Transport** play/stop/record, bar.beat + clock readout, rewind, click track
- **Tempo** 40-260 BPM, project length in bars, swing
- **Live recording** from your mic onto record-armed audio tracks, drawn as waveforms
- **Beat maker** a 16-step drum sequencer with six organically synthesized voices
  (kick, snare, hat, clap, tom, ride) that always lock to the project tempo
- **Multitrack arrange** view with a moving playhead; click the ruler to scrub
- **Mixer** per-track volume / pan / mute / solo, master fader + live level meter
- **Projects** new / name / open / save / export `.json`, with continuous **autosave**
- **Beat Maker kits**: 5 kit presets plus per-piece sound swapping (kicks, snares,
  hats, claps, toms, cymbal: ride/crash/splash/bell)
- **Loop**: seamless arrangement looping on playback
- **Import**: drop in an existing audio file (wav/mp3/m4a) as a track
- **Harmonize**: analyze a track (tempo, energy/frenticism, key, scale, notes) and
  auto-generate matching Bass / Keys / Arp / Lead and a fitting drum beat. The analysis
  is shown as an editable preview - correct the key, scale, energy, chords, style and
  per-instrument octaves before generating.
- **Export WAV**: bounce the whole song (drums + instruments + recordings) to a stereo
  .wav via an offline render, respecting the mix
- **Voice commands** (Chromium browsers): "play", "stop", "record", "add track",
  "set tempo to 120", "metronome off", "louder" / "softer", "harmonize", "export"
- **Keyboard**: `Space` play/stop, `R` record
- **Arrangement editing**: move / trim / split / duplicate / delete clips, snap-to-grid,
  timeline zoom, a draggable loop/cycle region, and full undo/redo
- **Piano roll**: edit instrument-track notes (add / move / resize / delete) on a grid,
  and swap the track's voice from the sound library
- **Sound library**: 20 generated instrument voices (basses, keys, pads, plucks, leads,
  bells, brass) and 10 drum kits - audition and add from the Sounds browser, all synthesized
- **Per-channel + master FX**: sweepable 3-band EQ, reverb, tempo-syncable delay,
  compression - on every channel and on the master bus
- **Recording aids**: one-bar count-in and tap tempo
- **Export**: full stereo mixdown or per-track stems to .wav
- **User guide**: a comprehensive PDF at `docs/Ensemble-Guide.pdf` (`npm run guide` to rebuild);
  a DAW parity gap-analysis lives in `docs/DAW_PARITY.md`

### Keyboard + voice cheat sheet
| Action | Key | Say |
|---|---|---|
| Play / Stop | Space | "play" / "stop" |
| Record | R | "record" |
| Add audio track | - | "add a track" |
| Set tempo | - | "set tempo to 128" |
| Toggle click | - | "metronome off" |

## Architecture (built for speed)

- **`src/audio/AudioEngine.ts`** - a single `AudioContext`, a lookahead scheduler
  (25 ms tick, 120 ms horizon) for sample-accurate drum + metronome timing, and a
  per-track `gain -> stereo-pan -> master` graph. The playhead is read from the audio
  clock (`ctx.currentTime`), not from React, so visuals never drift from sound.
- **`src/audio/DrumSynth.ts`** - drum voices generated from oscillators + filtered
  noise. No sample files to load, so startup is instant and the kit is tweakable.
- **`src/audio/Recorder.ts`** - `getUserMedia` + `MediaRecorder`, decoded to an
  `AudioBuffer` and encoded to WAV for persistence; waveform peaks precomputed once.
- **`src/state/store.ts`** - a small Zustand store. Audio nodes live in the engine
  (non-serializable); only plain data lives in the store and is what autosaves.
- **`src/voice/VoiceControl.ts`** - a tiny, forgiving grammar over the Web Speech API.

Rendering stays cheap: only the timecode and playhead re-render each frame; the heavy
audio work happens off the main React path.

## Package as a desktop app (Windows / macOS / Linux)

Ensemble ships as a native desktop build via **Electron + electron-builder**. Node is
the only prerequisite.

```bash
npm install

# run the desktop shell against the live dev server (hot reload)
npm run desktop:dev

# run the desktop shell against a production build
npm run desktop

# produce an installer/binary for the current OS:
npm run dist          # auto-detects host OS
npm run dist:win      # -> release/Ensemble-Setup-x.y.z.exe   (NSIS)
npm run dist:mac      # -> release/Ensemble-x.y.z.dmg
npm run dist:linux    # -> release/Ensemble-x.y.z.AppImage
```

Cross-compiling is limited: build the macOS `.dmg` on a Mac and the Linux `.AppImage`
on Linux (or run all three from CI). Output lands in `release/`.

### Optional: leaner binaries with Tauri
If you want ~10 MB native binaries and faster cold start instead of Electron's bundled
Chromium, the same `dist/` front-end packages under Tauri. It needs the Rust toolchain
(`rustup`), then `npm i -D @tauri-apps/cli` and `npx tauri init` pointing
`frontendDist` at `../dist` and `devUrl` at `http://localhost:5180`. The web app code
is unchanged. Electron is the default here because it builds with Node alone.

## Roadmap (not yet built)

- Instrument sample libraries (real guitar/bass/piano samples) alongside the synths
- Automation lanes (draw volume/FX curves over time)
- Audio warp / time-stretch and pitch correction (needs heavier DSP)
- Deeper analysis (chord-change detection over time, not just an overall key)
- See `docs/DAW_PARITY.md` for the full Cubase/Ableton gap analysis
```
