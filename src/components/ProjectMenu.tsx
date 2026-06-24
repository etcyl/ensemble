import { useState } from "react";
import { useStore, newProject } from "../state/store";
import {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  exportProject,
} from "../state/persistence";

export default function ProjectMenu({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const [name, setName] = useState("New Song");
  const [list, setList] = useState(listProjects());

  const refresh = () => setList(listProjects());

  const create = () => {
    saveProject(project); // keep current before switching
    setProject(newProject(name || "Untitled"));
    refresh();
    onClose();
  };
  const open = (id: string) => {
    saveProject(project);
    const p = loadProject(id);
    if (p) setProject(p);
    onClose();
  };
  const del = (id: string) => {
    deleteProject(id);
    refresh();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Projects</h2>
        <p>Everything autosaves as you work. Saved songs live in this browser.</p>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="proj-name"
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New song name"
            title="Name for a brand-new song"
          />
          <button className="btn accent" onClick={create} title="Save the current song, then start a fresh empty one with this name">+ New</button>
        </div>

        <div className="proj-list">
          {list.length === 0 && <div className="hint">No saved songs yet.</div>}
          {list.map((m) => (
            <div className="proj-item" key={m.id}>
              <div className="meta">
                <div className="n">{m.name}</div>
                <div className="d">{new Date(m.updatedAt).toLocaleString()}</div>
              </div>
              <button className="btn ghost" onClick={() => open(m.id)} title="Open this song (your current one is saved first)">Open</button>
              <button className="btn ghost danger" onClick={() => del(m.id)} title="Delete this saved song permanently">✕</button>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => exportProject(project)} title="Download this song as a .json file you can back up or share">Export .json</button>
          <button className="btn" onClick={() => { saveProject(project); refresh(); }} title="Save the current song to this browser's project list">Save current</button>
          <button className="btn accent" onClick={onClose} title="Close this dialog">Done</button>
        </div>
      </div>
    </div>
  );
}
