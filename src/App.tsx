import { useEffect, useRef, useState } from "react";
import { useStore, uid } from "./state/store";
import { engine } from "./audio/AudioEngine";
import { LiveRecorder, base64ToArrayBuffer, encodeWavBase64, computePeaks, downloadWav } from "./audio/Recorder";
import { VoiceControl } from "./voice/VoiceControl";
import { runCommand, suggest, registerRecorder, registerHarmonizeOpener, registerMixdown, registerStems } from "./commands";
import CommandBar from "./components/CommandBar";
import Transport from "./components/Transport";
import Arrange from "./components/Arrange";
import DrumSequencer from "./components/DrumSequencer";
import Mixer from "./components/Mixer";
import ProjectMenu from "./components/ProjectMenu";
import HarmonizePanel from "./components/HarmonizePanel";
import SoundLibrary from "./components/SoundLibrary";
import Icon from "./components/Icon";

export default function App() {
  // scoped selectors: this component only re-renders on these, never on playhead ticks
  const projectName = useStore((s) => s.project.name);
  const projectId = useStore((s) => s.project.id);
  const recording = useStore((s) => s.recording);
  const voiceOn = useStore((s) => s.voiceOn);
  const lastVoice = useStore((s) => s.lastVoice);
  const rename = useStore((s) => s.rename);
  const addAudioTrack = useStore((s) => s.addAudioTrack);
  const setVoiceOn = useStore((s) => s.setVoiceOn);
  const importTrack = useStore((s) => s.importTrack);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const [showProjects, setShowProjects] = useState(false);
  const [showHarmonize, setShowHarmonize] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [busy, setBusy] = useState("");
  const recorder = useRef(new LiveRecorder());
  const recStart = useRef(0);
  const voice = useRef<VoiceControl | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const raf = useRef(0);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("Importing " + file.name);
    try {
      const buf = await engine.decode(await file.arrayBuffer());
      const clip = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, ""),
        start: 0,
        duration: buf.duration,
        audio: encodeWavBase64(buf),
        peaks: computePeaks(buf, 800),
      };
      engine.setBuffer(clip.id, buf);
      importTrack(clip.name, clip);
    } catch {
      alert("Could not read that audio file.");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const doMixdown = async () => {
    setBusy("Rendering mixdown...");
    try {
      const buf = await engine.renderMixdown();
      downloadWav(buf, useStore.getState().project.name || "mixdown");
    } catch (e) {
      console.warn(e);
      alert("Mixdown failed.");
    } finally {
      setBusy("");
    }
  };

  const doStems = async () => {
    const p = useStore.getState().project;
    setBusy("Rendering stems...");
    try {
      for (const t of p.tracks) {
        const buf = await engine.renderStem(t.id);
        downloadWav(buf, `${p.name}-${t.name}`.replace(/[^\w-]+/g, "_"));
      }
    } catch (e) {
      console.warn(e);
      alert("Stem export failed.");
    } finally {
      setBusy("");
    }
  };

  // smooth playhead straight from the audio clock; also catch engine auto-stop at loop end
  useEffect(() => {
    const loop = () => {
      const st = useStore.getState();
      if (engine.playing) useStore.setState({ playhead: engine.playhead() });
      else if (st.playing) st.stop();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // rehydrate recorded audio buffers when a project loads
  useEffect(() => {
    (async () => {
      for (const t of useStore.getState().project.tracks)
        for (const c of t.clips) {
          if (c.audio && !engine.hasBuffer(c.id)) {
            try {
              const ab = await base64ToArrayBuffer(c.audio);
              engine.setBuffer(c.id, await engine.decode(ab));
            } catch (e) {
              console.warn("decode failed", e);
            }
          }
        }
    })();
  }, [projectId]);

  const beginRecording = async () => {
    if (useStore.getState().recording) return;
    engine.resume();
    recStart.current = useStore.getState().playhead;
    if (useStore.getState().project.countIn) {
      await new Promise((r) => setTimeout(r, engine.countInClicks()));
    }
    const st = useStore.getState();
    if (!st.playing) st.play();
    try {
      await recorder.current.start();
      st.setRecording(true);
    } catch (e) {
      alert("Could not access the microphone. Check permissions.");
    }
  };
  const endRecording = async () => {
    const st = useStore.getState();
    if (!st.recording) return;
    st.setRecording(false);
    try {
      const res = await recorder.current.stop(engine.ctx!);
      const clip = {
        id: uid(),
        name: "Take",
        start: recStart.current,
        duration: res.duration,
        audio: res.wavBase64,
        peaks: res.peaks,
      };
      engine.setBuffer(clip.id, res.buffer);
      st.addClipToArmed(clip);
    } catch (e) {
      console.warn("recording failed", e);
    }
  };
  const doRecord = () => (useStore.getState().recording ? endRecording() : beginRecording());

  // run a typed or spoken command through the shared command layer
  const dispatch = (text: string) => {
    const r = runCommand(text);
    useStore.getState().setFeedback(r.message);
    useStore.getState().setSuggestions(r.ok ? [] : suggest(text));
  };

  // wire the command layer's bridges to the React-side handlers (once)
  useEffect(() => {
    registerRecorder({
      start: beginRecording,
      stop: endRecording,
      isRecording: () => useStore.getState().recording,
    });
    registerHarmonizeOpener(() => setShowHarmonize(true));
    registerMixdown(() => doMixdown());
    registerStems(() => doStems());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleVoice = () => {
    if (!voice.current) {
      voice.current = new VoiceControl((text) => {
        useStore.getState().setLastVoice(text);
        dispatch(text);
      });
    }
    if (!voice.current.supported) {
      alert("Voice control needs a Chromium browser (Chrome / Edge).");
      return;
    }
    if (voiceOn) {
      voice.current.stop();
      setVoiceOn(false);
    } else {
      voice.current.start();
      setVoiceOn(true);
    }
  };

  // keyboard: space = play/stop, R = record
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); st.redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); st.duplicateSelected(); return; }
      if (mod) return; // leave other ctrl/cmd combos to the browser
      if (e.key === "Delete" || e.key === "Backspace") { if (st.deleteSelected()) e.preventDefault(); return; }
      if (e.code === "Space") { e.preventDefault(); st.playing ? st.stop() : st.play(); return; }
      const k = e.key.toLowerCase();
      if (k === "r") doRecord();
      else if (k === "s") st.splitAtPlayhead();
      else if (k === "n") st.toggleSnap();
      else if (k === "=" || k === "+") st.zoomIn();
      else if (k === "-" || k === "_") st.zoomOut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand" title="Ensemble - a simple, fast DAW">
          <span className="dot" />
          Ensemble <small>studio</small>
        </div>
        <input
          className="proj-name"
          value={projectName}
          onChange={(e) => rename(e.target.value)}
          title="Project name (click to rename). Changes autosave automatically."
        />
        <button className="btn ghost icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Icon name="undo" size={16} /></button>
        <button className="btn ghost icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" size={16} /></button>
        <button className="btn ghost" onClick={() => setShowProjects(true)} title="Projects: start a new song, open a saved one, save, or export to a file">
          <Icon name="folder" size={15} /> Projects
        </button>
        <button className="btn ghost" onClick={() => addAudioTrack()} title="Add a new empty audio track to record onto">
          <Icon name="plus" size={15} /> Audio Track
        </button>
        <button className="btn ghost" onClick={() => fileInput.current?.click()} title="Import an existing audio file (wav/mp3/etc.) as a new track - e.g. a guitar part to harmonize with">
          <Icon name="import" size={15} /> Import
        </button>
        <button className="btn ghost" onClick={() => setShowLibrary(true)} title="Sound Library: browse and audition generated instruments and drum kits, add them as tracks">
          <Icon name="wave" size={15} /> Sounds
        </button>
        <button className="btn ghost" onClick={() => setShowHarmonize(true)} title="Harmonize: analyze a track and auto-generate matching instruments and drums">
          <Icon name="sparkles" size={15} /> Harmonize
        </button>
        <button className="btn ghost" onClick={doStems} title="Export stems: bounce each track to its own .wav file">
          <Icon name="layers" size={15} /> Stems
        </button>
        <button className="btn ghost" onClick={doMixdown} title="Mix down the whole song to a .wav file you can share">
          <Icon name="download" size={15} /> Export WAV
        </button>
        <input ref={fileInput} type="file" accept="audio/*" style={{ display: "none" }} onChange={onImportFile} />

        <div className="spacer" />

        {busy && <span className="hint" style={{ color: "var(--amber)" }}>{busy}</span>}

        {voiceOn ? (
          <div className="voice-listening">
            <span className="wave"><span /><span /><span /><span /></span>
            listening
            {lastVoice && <span className="heard">"{lastVoice}"</span>}
          </div>
        ) : (
          <span className="hint">space = play · R = record</span>
        )}
        <button className={"btn" + (voiceOn ? " on" : " ghost")} onClick={toggleVoice} title={'Voice control: drive Ensemble hands-free. Try saying "play", "stop", "record", "add a track", "set tempo to 128", "louder". Needs Chrome or Edge.'}>
          <Icon name="mic" size={15} /> Voice
        </button>
        <div className="savechip" title="Your work is saved to this browser automatically as you go">
          <span className="pulse" /> autosaved
        </div>
      </div>

      <Transport onRecord={doRecord} />

      <CommandBar onRun={dispatch} />

      <div className="main">
        <Arrange />
      </div>

      <div className="dock">
        <DrumSequencer />
        <Mixer />
      </div>

      {showProjects && <ProjectMenu onClose={() => setShowProjects(false)} />}
      {showHarmonize && <HarmonizePanel onClose={() => setShowHarmonize(false)} />}
      {showLibrary && <SoundLibrary onClose={() => setShowLibrary(false)} />}
    </div>
  );
}
