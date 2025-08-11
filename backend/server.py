import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
from fastapi_csrf_protect import CsrfProtect
from fastapi_csrf_protect.exceptions import CsrfProtectError

# Load env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

MONGO_URL = os.environ.get("MONGO_URL")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL not set in environment")

@contextmanager
def get_db():
    client = None
    try:
        client = MongoClient(MONGO_URL)
        db = client["taskdb"]
        yield db
    finally:
        if client:
            client.close()

# For dependency injection
def get_database():
    with get_db() as db:
        yield db

app = FastAPI(title="Task Metrics API")

# CSRF Protection Settings
class CsrfSettings(BaseModel):
    secret_key: str = os.environ.get("CSRF_SECRET_KEY", "your-secret-key-change-in-production")
    cookie_samesite: str = "lax"
    cookie_secure: bool = False  # Set to True in production with HTTPS

@CsrfProtect.load_config
def get_csrf_config():
    return CsrfSettings()

@app.exception_handler(CsrfProtectError)
def csrf_protect_exception_handler(request: Request, exc: CsrfProtectError):
    return JSONResponse(
        status_code=403,
        content={"detail": "CSRF token validation failed"}
    )

# CORS - allow frontend domain via env at runtime; in cluster, ingress handles this.
# More restrictive CORS - adjust origins as needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

# Models
class MetricType(str):
    COUNT = "count"  # increment per tap
    TIMER = "timer"  # start/stop timer sessions
    CHECK = "check"  # checkbox complete

class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field("#6366F1", description="Tile color hex", pattern=r'^#[0-9A-Fa-f]{6}$')
    metric: str = Field(MetricType.COUNT, description="count|timer|check")
    goal: Optional[int] = Field(None, description="Goal units (sets/minutes/checks)", ge=1, le=10000)
    
    @validator('metric')
    def validate_metric(cls, v):
        if v not in [MetricType.COUNT, MetricType.TIMER, MetricType.CHECK]:
            raise ValueError('Invalid metric type')
        return v

class Task(TaskCreate):
    id: str
    created_at: datetime

class Event(BaseModel):
    id: str
    task_id: str
    type: str  # increment|timer_start|timer_stop|check
    value: Optional[int] = None  # for count increments or duration (seconds)
    at: datetime

# Helper functions
def ensure_indexes(db):
    """Ensure database indexes exist"""
    db["tasks"].create_index("id", unique=True)
    db["events"].create_index("task_id")
    db["events"].create_index("at")

def validate_task_id(task_id: str) -> str:
    """Validate and sanitize task ID"""
    if not task_id or len(task_id) > 50:
        raise HTTPException(status_code=400, detail="Invalid task ID")
    return task_id

# API routes (must be prefixed with /api)
@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}

@app.get("/api/csrf-token")
def get_csrf_token(request: Request, csrf_protect: CsrfProtect = Depends()):
    """Get CSRF token for frontend"""
    csrf_token = csrf_protect.generate_csrf()
    response = JSONResponse({"csrf_token": csrf_token})
    csrf_protect.set_csrf_cookie(csrf_token, response)
    return response

@app.get("/api/tasks", response_model=List[Task])
def list_tasks(db=Depends(get_database)):
    ensure_indexes(db)
    items = []
    try:
        for doc in db["tasks"].find({}, {"_id": 0}).limit(100):  # Add pagination limit
            items.append(Task(**doc))
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve tasks")

@app.post("/api/tasks", response_model=Task)
def create_task(request: Request, payload: TaskCreate, db=Depends(get_database), csrf_protect: CsrfProtect = Depends()):
    csrf_protect.validate_csrf(request)
    ensure_indexes(db)
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "name": payload.name.strip(),
        "color": payload.color,
        "metric": payload.metric,
        "goal": payload.goal,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        db["tasks"].insert_one(doc)
        doc.pop("_id", None)
        return Task(**doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create task")

@app.delete("/api/tasks/{task_id}")
def delete_task(request: Request, task_id: str, db=Depends(get_database), csrf_protect: CsrfProtect = Depends()):
    csrf_protect.validate_csrf(request)
    task_id = validate_task_id(task_id)
    ensure_indexes(db)
    try:
        # Check if task exists first
        task = db["tasks"].find_one({"id": task_id})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # Delete task and related events
        db["tasks"].delete_one({"id": task_id})
        db["events"].delete_many({"task_id": task_id})
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete task")

class EventCreate(BaseModel):
    type: str = Field(..., pattern=r'^(increment|timer_start|timer_stop|check)$')
    value: Optional[int] = Field(None, ge=0, le=86400)  # Max 24 hours in seconds
    
    @validator('value', always=True)
    def validate_value(cls, v, values):
        event_type = values.get('type')
        if event_type == 'timer_stop' and v is None:
            raise ValueError('Value required for timer_stop events')
        if event_type in ['timer_start', 'check'] and v is not None:
            raise ValueError(f'Value not allowed for {event_type} events')
        return v

@app.post("/api/tasks/{task_id}/events", response_model=Event)
def create_event(request: Request, task_id: str, payload: EventCreate, db=Depends(get_database), csrf_protect: CsrfProtect = Depends()):
    csrf_protect.validate_csrf(request)
    task_id = validate_task_id(task_id)
    ensure_indexes(db)
    
    try:
        # Validate task exists
        task = db["tasks"].find_one({"id": task_id})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        eid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        doc = {
            "id": eid,
            "task_id": task_id,
            "type": payload.type,
            "value": payload.value,
            "at": now,
        }
        db["events"].insert_one(doc)
        doc.pop("_id", None)
        return Event(**doc)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create event")

@app.get("/api/tasks/{task_id}/summary")
def task_summary(task_id: str, db=Depends(get_database)):
    task_id = validate_task_id(task_id)
    ensure_indexes(db)
    
    try:
        task = db["tasks"].find_one({"id": task_id}, {"_id": 0})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        metric = task.get("metric")
        
        if metric == MetricType.COUNT:
            # Use aggregation pipeline for better performance
            pipeline = [
                {"$match": {"task_id": task_id, "type": "increment"}},
                {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$value", 1]}}}}
            ]
            result = list(db["events"].aggregate(pipeline))
            total = result[0]["total"] if result else 0
            return {"total": total, "goal": task.get("goal")}
            
        elif metric == MetricType.TIMER:
            # Use aggregation pipeline for better performance
            pipeline = [
                {"$match": {"task_id": task_id, "type": "timer_stop"}},
                {"$group": {"_id": None, "total_sec": {"$sum": {"$ifNull": ["$value", 0]}}}}
            ]
            result = list(db["events"].aggregate(pipeline))
            total_sec = result[0]["total_sec"] if result else 0
            return {"total_sec": total_sec, "goal": task.get("goal")}
            
        elif metric == MetricType.CHECK:
            done = db["events"].count_documents({"task_id": task_id, "type": "check"}) > 0
            return {"done": done}
        else:
            return {"message": "Unknown metric"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve task summary")

# Initialize database indexes on startup
@app.on_event("startup")
async def startup_event():
    with get_db() as db:
        ensure_indexes(db)