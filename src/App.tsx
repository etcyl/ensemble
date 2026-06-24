import { useEffect, useRef, useState } from "react";
import { useStore, uid } from "./state/store";
import { engine } from "./audio/AudioEngine";
import { LiveRecorder, base64ToArrayBuffer, encodeWavBase64, computePeaks, downloadWav } from "./audio/Recorder";
import { VoiceControl } from "./voice/VoiceControl";
import { runCommand, suggest, registerRecorder, registerHarmonizeOpener, registerMixdown } from "./commands";
import CommandBar from "./components/CommandBar";
import Transport from "./components/Transport";
import Arrange from "./components/Arrange";
import DrumSequencer from "./components/DrumSequencer";
import Mixer from "./components/Mixer";
import ProjectMenu from "./components/ProjectMenu";
import HarmonizePanel from "./components/HarmonizePanel";

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

  const [showProjects, setShowProjects] = useState(false);
  const [showHarmonize, setShowHarmonize] = useState(false);
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
    const st = useStore.getState();
    if (st.recording) return;
    engine.resume();
    recStart.current = st.playhead;
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
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        const st = useStore.getState();
        st.playing ? st.stop() : st.play();
      } else if (e.key.toLowerCase() === "r") {
        doRecord();
      }
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
        <button className="btn ghost" onClick={() => setShowProjects(true)} title="Projects: start a new song, open a saved one, save, or export to a file">
          📁 Projects
        </button>
        <button className="btn ghost" onClick={() => addAudioTrack()} title="Add a new empty audio track to record onto">
          ＋ Audio Track
        </button>
        <button className="btn ghost" onClick={() => fileInput.current?.click()} title="Import an existing audio file (wav/mp3/etc.) as a new track - e.g. a guitar part to harmonize with">
          ⤓ Import
        </button>
        <button className="btn ghost" onClick={() => setShowHarmonize(true)} title="Harmonize: analyze a track and auto-generate matching instruments and drums">
          🎻 Harmonize
        </button>
        <button className="btn ghost" onClick={doMixdown} title="Mix down the whole song to a .wav file you can share">
          ⬇ Export WAV
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
          🎙 Voice
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
    </div>
  );
}
