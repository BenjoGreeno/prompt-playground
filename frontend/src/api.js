const BASE = import.meta.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || "/api";

export const api = (path) => `${BASE}${path}`;

export async function createTask(body) {
  const r = await fetch(api("/tasks"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Failed to create task");
  return r.json();
}

export async function deleteTask(id) {
  const r = await fetch(api(`/tasks/${id}`), { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete task");
  return r.json();
}

export async function createEvent(id, body) {
  const r = await fetch(api(`/tasks/${id}/events`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Failed to create event");
  return r.json();
}

export async function getSummary(id) {
  const r = await fetch(api(`/tasks/${id}/summary`));
  if (!r.ok) throw new Error("Failed to fetch summary");
  return r.json();
}