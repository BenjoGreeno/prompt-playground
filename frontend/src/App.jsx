import React, { useMemo, useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import clsx from "clsx";
import "./index.css";
import "./App.css";
import { api, getSummary, createTask, deleteTask, createEvent, createTemplate, deleteTemplate, getDailyTasks, generateDailyTasks, getDailyReport, formatDate } from "./api";

const METRICS = [
  { value: "count", label: "Count" },
  { value: "timer", label: "Timer" },
  { value: "check", label: "Checkbox" },
];

const fetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.detail || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

function useTasks() {
  const { data, error, isLoading } = useSWR(`${api("/tasks")}`, fetcher, {
    revalidateOnFocus: true,
    errorRetryCount: 3,
    errorRetryInterval: 1000
  });
  return { tasks: data || [], error, isLoading };
}

function TopBar({ activeTab, setActiveTab }) {
  return (
    <div className="px-4 py-4 border-b bg-white/70 backdrop-blur sticky top-0 z-10">
      <h1 className="text-2xl font-semibold">Task Metrics</h1>
      <div className="flex gap-4 mt-3">
        <button 
          className={clsx("px-3 py-1 rounded text-sm", activeTab === 'tasks' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-800')}
          onClick={() => setActiveTab('tasks')}
        >
          All Tasks
        </button>
        <button 
          className={clsx("px-3 py-1 rounded text-sm", activeTab === 'daily' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-800')}
          onClick={() => setActiveTab('daily')}
        >
          Daily View
        </button>
        <button 
          className={clsx("px-3 py-1 rounded text-sm", activeTab === 'templates' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-800')}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
      </div>
    </div>
  );
}

function TaskForm() {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("count");
  const [goal, setGoal] = useState("");
  const [color, setColor] = useState("#6366F1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTask({ name: name.trim(), metric, goal: goal ? Number(goal) : null, color });
      setName("");
      setGoal("");
      setMetric("count");
      mutate(api("/tasks"));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Error: {error}
        </div>
      )}
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
    </div>
  );
}

function TaskRow({ task, onDelete, onActionDone }) {
  const { data: summary, error: summaryError, mutate: revalidate } = useSWR(api(`/tasks/${task.id}/summary`), fetcher);
  const [deleteError, setDeleteError] = useState(null);
  
  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await onDelete(task.id);
    } catch (err) {
      setDeleteError(err.message);
    }
  };
  
  const handleActionDone = () => {
    revalidate();
    if (onActionDone) onActionDone();
  };

  return (
    <div className="grid grid-cols-[1fr,1fr] md:grid-cols-[1fr,340px] gap-3 items-center">
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-white">
        <div className="w-3 h-10 rounded" style={{ backgroundColor: task.color }} />
        <div className="flex-1">
          <div className="font-medium">{task.name}</div>
          <div className="text-xs text-gray-500">{task.metric}{task.goal ? ` • goal: ${task.goal}` : ""}</div>
          <SummaryBar task={task} summary={summary} />
        </div>
        <button className="btn danger" onClick={handleDelete} title="Delete task">
          ✕
        </button>
        {deleteError && (
          <div className="text-xs text-red-600 mt-1">{deleteError}</div>
        )}
        {summaryError && (
          <div className="text-xs text-red-600 mt-1">Failed to load summary</div>
        )}
      </div>
      <div className="p-3 rounded-lg border bg-white">
        <ActionCell task={task} summary={summary} onActionDone={handleActionDone} />
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
  const [error, setError] = useState(null);
  
  const inc = async (val = 1) => {
    setBusy(true);
    setError(null);
    try {
      await createEvent(task.id, { type: "increment", value: val });
      onActionDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button className="btn" disabled={busy} onClick={() => inc(1)}>+1</button>
        <button className="btn" disabled={busy} onClick={() => inc(5)}>+5</button>
        <button className="btn" disabled={busy} onClick={() => inc(10)}>+10</button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

function TimerCell({ task, onActionDone }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startAt, setStartAt] = useState(null);
  const [error, setError] = useState(null);

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
    setError(null);
    try {
      await createEvent(task.id, { type: "timer_start" });
      setStartAt(Date.now());
      setElapsed(0);
      setRunning(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const stop = async () => {
    setError(null);
    try {
      const seconds = Math.max(0, Math.floor((Date.now() - startAt) / 1000));
      await createEvent(task.id, { type: "timer_stop", value: seconds });
      setRunning(false);
      setStartAt(null);
      setElapsed(0);
      onActionDone();
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
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
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

function CheckCell({ task, summary, onActionDone }) {
  const done = !!summary?.done;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const doCheck = async () => {
    setBusy(true);
    setError(null);
    try {
      await createEvent(task.id, { type: "check" });
      onActionDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button className="btn" disabled={busy || done} onClick={doCheck}>{done ? "Completed" : "Mark done"}</button>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

function DailyView() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateStr = formatDate(selectedDate);
  
  const { data: dailyTasks, error: tasksError, mutate: mutateTasks } = useSWR(`daily-tasks-${dateStr}`, () => getDailyTasks(dateStr));
  const { data: dailyReport, mutate: mutateReport } = useSWR(`daily-report-${dateStr}`, () => getDailyReport(dateStr));
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);

  const handleGenerateTasks = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      await generateDailyTasks(dateStr);
      mutateTasks();
      mutateReport();
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const onDelete = async (id) => {
    try {
      await deleteTask(id);
      mutateTasks();
      mutateReport();
    } catch (error) {
      throw error;
    }
  };

  const onActionDone = () => {
    mutateTasks();
    mutateReport();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="input"
          />
          <button
            onClick={handleGenerateTasks}
            disabled={generating}
            className="btn"
          >
            {generating ? 'Generating...' : 'Generate Tasks'}
          </button>
        </div>
      </div>
      
      {generateError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {generateError}
        </div>
      )}
      
      {dailyReport && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white rounded-lg border">
            <div className="text-2xl font-bold text-blue-600">{dailyReport.total_tasks}</div>
            <div className="text-sm text-gray-500">Total Tasks</div>
          </div>
          <div className="p-4 bg-white rounded-lg border">
            <div className="text-2xl font-bold text-green-600">{dailyReport.completed_tasks}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
          <div className="p-4 bg-white rounded-lg border">
            <div className="text-2xl font-bold text-purple-600">{dailyReport.completion_rate}%</div>
            <div className="text-sm text-gray-500">Completion Rate</div>
          </div>
          <div className="p-4 bg-white rounded-lg border">
            <div className="text-sm text-gray-500 mb-1">By Type</div>
            <div className="text-xs space-y-1">
              <div>Count: {dailyReport.metrics.count}</div>
              <div>Timer: {dailyReport.metrics.timer}</div>
              <div>Check: {dailyReport.metrics.check}</div>
            </div>
          </div>
        </div>
      )}
      
      {tasksError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          Failed to load daily tasks: {tasksError.message}
        </div>
      )}
      
      <div className="space-y-3">
        {dailyTasks?.map((task) => (
          <TaskRow key={task.id} task={task} onDelete={onDelete} onActionDone={onActionDone} />
        ))}
        {dailyTasks?.length === 0 && (
          <div className="p-6 text-center text-gray-500 border rounded-lg bg-white">
            No tasks for {dateStr}. Generate tasks from templates above.
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateView() {
  const { data: templates, error: templatesError, mutate: mutateTemplates } = useSWR('templates', () => fetch(api('/templates')).then(r => r.json()));
  
  const onDeleteTemplate = async (id) => {
    try {
      await deleteTemplate(id);
      mutateTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  return (
    <div className="space-y-4">
      <TemplateForm onCreated={() => mutateTemplates()} />
      
      {templatesError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          Failed to load templates: {templatesError.message}
        </div>
      )}
      
      <div className="space-y-3">
        {templates?.map((template) => (
          <TemplateRow key={template.id} template={template} onDelete={onDeleteTemplate} />
        ))}
        {templates?.length === 0 && (
          <div className="p-6 text-center text-gray-500 border rounded-lg bg-white">
            No templates yet. Create one above.
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('daily');
  const { tasks, error: tasksError, isLoading } = useTasks();

  const onDelete = async (id) => {
    try {
      await deleteTask(id);
      mutate(api("/tasks"));
    } catch (error) {
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {activeTab === 'tasks' && (
          <>
            {tasksError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                Failed to load tasks: {tasksError.message}
              </div>
            )}
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
          </>
        )}
        
        {activeTab === 'daily' && <DailyView />}
        {activeTab === 'templates' && <TemplateView />}
      </div>
    </div>
  );
}

function TemplateForm({ onCreated }) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("count");
  const [goal, setGoal] = useState("");
  const [color, setColor] = useState("#6366F1");
  const [activeDays, setActiveDays] = useState([1, 2, 3, 4, 5]); // Weekdays by default
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || activeDays.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTemplate({ 
        name: name.trim(), 
        metric, 
        goal: goal ? Number(goal) : null, 
        color,
        active_days: activeDays
      });
      setName("");
      setGoal("");
      setMetric("count");
      setActiveDays([1, 2, 3, 4, 5]);
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDay = (day) => {
    setActiveDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Error: {error}
        </div>
      )}
      <form onSubmit={onSubmit} className="p-4 bg-white rounded-lg shadow border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="input"
            placeholder="Template name"
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
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Active Days</label>
          <div className="flex gap-2">
            {dayNames.map((day, index) => (
              <button
                key={index}
                type="button"
                onClick={() => toggleDay(index)}
                className={clsx(
                  "px-3 py-1 text-sm rounded",
                  activeDays.includes(index)
                    ? "bg-blue-100 text-blue-700 border border-blue-300"
                    : "bg-gray-100 text-gray-600 border border-gray-300"
                )}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
        
        <button className="btn-primary" disabled={submitting || !name.trim() || activeDays.length === 0}>
          {submitting ? "Creating..." : "Create Template"}
        </button>
      </form>
    </div>
  );
}

function TemplateRow({ template, onDelete }) {
  const [deleteError, setDeleteError] = useState(null);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await onDelete(template.id);
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-white">
      <div className="w-3 h-10 rounded" style={{ backgroundColor: template.color }} />
      <div className="flex-1">
        <div className="font-medium">{template.name}</div>
        <div className="text-xs text-gray-500">
          {template.metric}{template.goal ? ` • goal: ${template.goal}` : ""}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Days: {template.active_days.map(day => dayNames[day]).join(', ')}
        </div>
      </div>
      <button className="btn danger" onClick={handleDelete} title="Delete template">
        ✕
      </button>
      {deleteError && (
        <div className="text-xs text-red-600 mt-1">{deleteError}</div>
      )}
    </div>
  );
}