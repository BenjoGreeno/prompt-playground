import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo import MongoClient
from dotenv import load_dotenv

# Load env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

MONGO_URL = os.environ.get("MONGO_URL")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL not set in environment")

client = MongoClient(MONGO_URL)
db = client["taskdb"]

app = FastAPI(title="Task Metrics API")

# CORS - allow frontend domain via env at runtime; in cluster, ingress handles this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class MetricType(str):
    COUNT = "count"  # increment per tap
    TIMER = "timer"  # start/stop timer sessions
    CHECK = "check"  # checkbox complete

class TaskCreate(BaseModel):
    name: str
    color: str = Field("#6366F1", description="Tile color hex")
    metric: str = Field(MetricType.COUNT, description="count|timer|check")
    goal: Optional[int] = Field(None, description="Goal units (sets/minutes/checks)")

class Task(TaskCreate):
    id: str
    created_at: datetime

class Event(BaseModel):
    id: str
    task_id: str
    type: str  # increment|timer_start|timer_stop|check
    value: Optional[int] = None  # for count increments or duration (seconds)
    at: datetime

# Helpers
TASKS_COL = db["tasks"]
EVENTS_COL = db["events"]

# Ensure indexes
TASKS_COL.create_index("id", unique=True)
EVENTS_COL.create_index("task_id")
EVENTS_COL.create_index("at")

# API routes (must be prefixed with /api)
@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}

@app.get("/api/tasks", response_model=List[Task])
def list_tasks():
    items = []
    for doc in TASKS_COL.find({}, {"_id": 0}):
        items.append(Task(**doc))
    return items

@app.post("/api/tasks", response_model=Task)
def create_task(payload: TaskCreate):
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "name": payload.name,
        "color": payload.color,
        "metric": payload.metric,
        "goal": payload.goal,
        "created_at": datetime.utcnow(),
    }
    TASKS_COL.insert_one(doc)
    doc.pop("_id", None)
    return Task(**doc)

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    TASKS_COL.delete_one({"id": task_id})
    EVENTS_COL.delete_many({"task_id": task_id})
    return {"ok": True}

class EventCreate(BaseModel):
    type: str
    value: Optional[int] = None

@app.post("/api/tasks/{task_id}/events", response_model=Event)
def create_event(task_id: str, payload: EventCreate):
    # Validate task exists
    t = TASKS_COL.find_one({"id": task_id})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    eid = str(uuid.uuid4())
    now = datetime.utcnow()
    doc = {
        "id": eid,
        "task_id": task_id,
        "type": payload.type,
        "value": payload.value,
        "at": now,
    }
    EVENTS_COL.insert_one(doc)
    doc.pop("_id", None)
    return Event(**doc)

@app.get("/api/tasks/{task_id}/summary")
def task_summary(task_id: str):
    t = TASKS_COL.find_one({"id": task_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    metric = t.get("metric")

    if metric == MetricType.COUNT:
        total = 0
        for e in EVENTS_COL.find({"task_id": task_id, "type": "increment"}):
            total += int(e.get("value") or 1)
        return {"total": total, "goal": t.get("goal")}
    elif metric == MetricType.TIMER:
        # Sum durations from timer_stop events; value=duration_sec
        total_sec = 0
        for e in EVENTS_COL.find({"task_id": task_id, "type": "timer_stop"}):
            total_sec += int(e.get("value") or 0)
        return {"total_sec": total_sec, "goal": t.get("goal")}
    elif metric == MetricType.CHECK:
        done = EVENTS_COL.count_documents({"task_id": task_id, "type": "check"}) > 0
        return {"done": done}
    else:
        return {"message": "Unknown metric"}

# Binding for supervisor: keep server on 0.0.0.0:8001, no hardcoding in env files changed here.
# Note: We do not start uvicorn here; supervisor will run it. This file just defines app.