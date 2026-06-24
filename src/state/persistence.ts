import type { Project } from "../types";

const AUTOSAVE = "ensemble:autosave";
const INDEX = "ensemble:projects";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export function saveAutosave(p: Project) {
  try {
    localStorage.setItem(AUTOSAVE, JSON.stringify(p));
  } catch (e) {
    console.warn("autosave failed (storage full?)", e);
  }
}

export function loadAutosave(): Project | null {
  const raw = localStorage.getItem(AUTOSAVE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export function saveProject(p: Project) {
  localStorage.setItem("ensemble:proj:" + p.id, JSON.stringify(p));
  const idx = listProjects().filter((m) => m.id !== p.id);
  idx.push({ id: p.id, name: p.name, updatedAt: p.updatedAt });
  idx.sort((a, b) => b.updatedAt - a.updatedAt);
  localStorage.setItem(INDEX, JSON.stringify(idx));
  saveAutosave(p);
}

export function listProjects(): ProjectMeta[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? "[]");
  } catch {
    return [];
  }
}

export function loadProject(id: string): Project | null {
  const raw = localStorage.getItem("ensemble:proj:" + id);
  return raw ? (JSON.parse(raw) as Project) : null;
}

export function deleteProject(id: string) {
  localStorage.removeItem("ensemble:proj:" + id);
  localStorage.setItem(
    INDEX,
    JSON.stringify(listProjects().filter((m) => m.id !== id))
  );
}

export function exportProject(p: Project) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.name.replace(/[^\w-]+/g, "_")}.ensemble.json`;
  a.click();
  URL.revokeObjectURL(url);
}
