import React, { useMemo, useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import clsx from "clsx";
import "./index.css";
import "./App.css";
import { api, getSummary, createTask, deleteTask, createEvent } from "./api";

const METRICS = [
  { value: "count", label: "Count" },
  { value: "timer", label: "Timer" },
  { value: "check", label: "Checkbox" },
];

const fetcher = (url) => fetch(url).then((r) => r.json());

function useTasks() {
  const { data, error, isLoading } = useSWR(`${api("/tasks")}`, fetcher, {
    revalidateOnFocus: true,
  });
  return { tasks: data || [], error, isLoading };
}

function TopBar() {
  return (
    <div className="px-4 py-4 border-b bg-white/70 backdrop-blur sticky top-0 z-10">
      <h1 className="text-2xl font-semibold">Task Metrics</h1>
      <p className="text-sm text-gray-500">Create tasks with different metrics and update them from the action column.</p>
    </div>
  );
}

function TaskForm() {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("count");
  const [goal, setGoal] = useState("");
  const [color, setColor] = useState("#6366F1");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createTask({ name, metric, goal: goal ? Number(goal) : null, color });
      setName("");
      setGoal("");
      setMetric("count");
      mutate(api("/tasks"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 bg-white rounded-lg shadow border">
      <input
        className="input"
        placeholder="Task name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
        {METRICS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="input"
        placeholder={metric === "timer" ? "Goal (minutes)" : "Goal (count)"}
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        min="0"
      />
      <input type="color" className="input h-10" value={color} onChange={(e) => setColor(e.target.value)} />
      <button className="btn-primary" disabled={submitting}>
        {submitting ? "Adding..." : "Add Task"}
      </button>
    </form>
  );
}

function TaskRow({ task, onDelete }) {
  const { data: summary, mutate: revalidate } = useSWR(api(`/tasks/${task.id}/summary`), fetcher);

  return (
    <div className="grid grid-cols-[1fr,1fr] md:grid-cols-[1fr,340px] gap-3 items-center">
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-white">
        <div className="w-3 h-10 rounded" style={{ backgroundColor: task.color }} />
        <div className="flex-1">
          <div className="font-medium">{task.name}</div>
          <div className="text-xs text-gray-500">{task.metric}{task.goal ? ` • goal: ${task.goal}` : ""}</div>
          <SummaryBar task={task} summary={summary} />
        </div>
        <button className="btn danger" onClick={() => onDelete(task.id)} title="Delete task">
          ✕
        </button>
      </div>
      <div className="p-3 rounded-lg border bg-white">
        <ActionCell task={task} summary={summary} onActionDone={revalidate} />
      </div>
    </div>
  );
}

function SummaryBar({ task, summary }) {
  if (!summary) return null;
  if (task.metric === "count") {
    const current = summary.total || 0;
    const goal = task.goal || 0;
    const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
    return (
      <div className="mt-2">
        <div className="text-xs text-gray-500 mb-1">{current}{goal ? ` / ${goal}` : ""}</div>
        {goal ? (
          <div className="h-2 bg-gray-100 rounded">
            <div className="h-2 rounded" style={{ width: `${pct}%`, backgroundColor: task.color }} />
          </div>
        ) : null}
      </div>
    );
  }
  if (task.metric === "timer") {
    const totalSec = summary.total_sec || 0;
    const minutes = Math.floor(totalSec / 60);
    const goal = task.goal || 0;
    const pct = goal > 0 ? Math.min(100, Math.round((minutes / goal) * 100)) : 0;
    return (
      <div className="mt-2">
        <div className="text-xs text-gray-500 mb-1">{minutes} min{goal ? ` / ${goal}` : ""}</div>
        {goal ? (
          <div className="h-2 bg-gray-100 rounded">
            <div className="h-2 rounded" style={{ width: `${pct}%`, backgroundColor: task.color }} />
          </div>
        ) : null}
      </div>
    );
  }
  if (task.metric === "check") {
    const done = !!summary.done;
    return <div className={clsx("mt-2 text-xs", done ? "text-green-600" : "text-gray-500")}>{done ? "Done" : "Not done"}</div>;
  }
  return null;
}

function ActionCell({ task, summary, onActionDone }) {
  if (task.metric === "count") {
    return <CountCell task={task} summary={summary} onActionDone={onActionDone} />;
  }
  if (task.metric === "timer") {
    return <TimerCell task={task} summary={summary} onActionDone={onActionDone} />;
  }
  if (task.metric === "check") {
    return <CheckCell task={task} summary={summary} onActionDone={onActionDone} />;
  }
  return null;
}

function CountCell({ task, onActionDone }) {
  const [busy, setBusy] = useState(false);
  const inc = async (val = 1) => {
    setBusy(true);
    try {
      await createEvent(task.id, { type: "increment", value: val });
    } finally {
      setBusy(false);
      onActionDone();
    }
  };
  return (
    <div className="flex items-center gap-2">
      <button className="btn" disabled={busy} onClick={() => inc(1)}>+1</button>
      <button className="btn" disabled={busy} onClick={() => inc(5)}>+5</button>
      <button className="btn" disabled={busy} onClick={() => inc(10)}>+10</button>
    </div>
  );
}

function TimerCell({ task, onActionDone }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startAt, setStartAt] = useState(null);

  useEffect(() => {
    let t;
    if (running) {
      t = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startAt) / 1000));
      }, 500);
    }
    return () => t && clearInterval(t);
  }, [running, startAt]);

  const start = async () => {
    await createEvent(task.id, { type: "timer_start" });
    setStartAt(Date.now());
    setElapsed(0);
    setRunning(true);
  };

  const stop = async () => {
    const seconds = Math.max(0, Math.floor((Date.now() - startAt) / 1000));
    await createEvent(task.id, { type: "timer_stop", value: seconds });
    setRunning(false);
    setStartAt(null);
    setElapsed(0);
    onActionDone();
  };

  return (
    <div className="flex items-center gap-3">
      {!running ? (
        <button className="btn" onClick={start}>Start</button>
      ) : (
        <>
          <div className="text-sm tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</div>
          <button className="btn danger" onClick={stop}>Stop</button>
        </>
      )}
    </div>
  );
}

function CheckCell({ task, summary, onActionDone }) {
  const done = !!summary?.done;
  const [busy, setBusy] = useState(false);

  const doCheck = async () => {
    setBusy(true);
    try {
      await createEvent(task.id, { type: "check" });
    } finally {
      setBusy(false);
      onActionDone();
    }
  };

  return (
    <div>
      <button className="btn" disabled={busy || done} onClick={doCheck}>{done ? "Completed" : "Mark done"}</button>
    </div>
  );
}

export default function App() {
  const { tasks, isLoading } = useTasks();

  const onDelete = async (id) => {
    await deleteTask(id);
    mutate(api("/tasks"));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <TaskForm />
        {isLoading && <div className="text-sm text-gray-500">Loading tasks…</div>}
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onDelete={onDelete} />
          ))}
          {!tasks.length && !isLoading && (
            <div className="p-6 text-center text-gray-500 border rounded-lg bg-white">
              No tasks yet. Create one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}