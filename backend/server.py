import os
import uuid
from datetime import datetime, timezone, date
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

class TaskTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field("#6366F1", description="Tile color hex", pattern=r'^#[0-9A-Fa-f]{6}$')
    metric: str = Field(MetricType.COUNT, description="count|timer|check")
    goal: Optional[int] = Field(None, description="Goal units (sets/minutes/checks)", ge=1, le=10000)
    active_days: List[int] = Field(..., description="Days of week (0=Monday, 6=Sunday)")
    
    @validator('metric')
    def validate_metric(cls, v):
        if v not in [MetricType.COUNT, MetricType.TIMER, MetricType.CHECK]:
            raise ValueError('Invalid metric type')
        return v
    
    @validator('active_days')
    def validate_active_days(cls, v):
        if not v or not all(0 <= day <= 6 for day in v):
            raise ValueError('Active days must be 0-6 (Monday-Sunday)')
        return sorted(list(set(v)))  # Remove duplicates and sort

class TaskTemplate(TaskTemplateCreate):
    id: str
    created_at: datetime

class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field("#6366F1", description="Tile color hex", pattern=r'^#[0-9A-Fa-f]{6}$')
    metric: str = Field(MetricType.COUNT, description="count|timer|check")
    goal: Optional[int] = Field(None, description="Goal units (sets/minutes/checks)", ge=1, le=10000)
    template_id: Optional[str] = Field(None, description="Template ID if created from template")
    scheduled_date: Optional[date] = Field(None, description="Date this task is scheduled for")
    
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
    db["tasks"].create_index("scheduled_date")
    db["tasks"].create_index("template_id")
    db["templates"].create_index("id", unique=True)
    db["events"].create_index("task_id")
    db["events"].create_index("at")

def validate_task_id(task_id: str) -> str:
    """Validate and sanitize task ID to prevent NoSQL injection"""
    import re
    
    if not task_id:
        raise HTTPException(status_code=400, detail="Task ID is required")
    
    # Check length
    if len(task_id) > 50:
        raise HTTPException(status_code=400, detail="Task ID too long")
    
    # Validate UUID format (our task IDs are UUIDs)
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if not re.match(uuid_pattern, task_id, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Invalid task ID format")
    
    # Return sanitized (lowercase) UUID
    return task_id.lower()

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

# Template endpoints
@app.get("/api/templates", response_model=List[TaskTemplate])
def list_templates(db=Depends(get_database)):
    ensure_indexes(db)
    items = []
    try:
        for doc in db["templates"].find({}, {"_id": 0}).limit(100):
            items.append(TaskTemplate(**doc))
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve templates")

@app.post("/api/templates", response_model=TaskTemplate)
def create_template(request: Request, payload: TaskTemplateCreate, db=Depends(get_database), csrf_protect: CsrfProtect = Depends()):
    csrf_protect.validate_csrf(request)
    ensure_indexes(db)
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "name": payload.name.strip(),
        "color": payload.color,
        "metric": payload.metric,
        "goal": payload.goal,
        "active_days": payload.active_days,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        db["templates"].insert_one(doc)
        doc.pop("_id", None)
        return TaskTemplate(**doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create template")

@app.delete("/api/templates/{template_id}")
def delete_template(request: Request, template_id: str, db=Depends(get_database), csrf_protect: CsrfProtect = Depends()):
    csrf_protect.validate_csrf(request)
    template_id = validate_task_id(template_id)
    ensure_indexes(db)
    try:
        template = db["templates"].find_one({"id": template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        db["templates"].delete_one({"id": template_id})
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete template")

@app.get("/api/tasks", response_model=List[Task])
def list_tasks(date_filter: Optional[str] = None, db=Depends(get_database)):
    ensure_indexes(db)
    items = []
    try:
        query = {}
        if date_filter:
            try:
                filter_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
                query["scheduled_date"] = {"$eq": filter_date.isoformat()}
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        for doc in db["tasks"].find(query, {"_id": 0}).limit(100):
            items.append(Task(**doc))
        return items
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve tasks")

@app.get("/api/tasks/daily/{date_str}", response_model=List[Task])
def get_daily_tasks(date_str: str, db=Depends(get_database)):
    ensure_indexes(db)
    try:
        filter_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    items = []
    try:
        query = {"scheduled_date": {"$eq": filter_date.isoformat()}}
        for doc in db["tasks"].find(query, {"_id": 0}):
            items.append(Task(**doc))
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve daily tasks")

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
        "template_id": payload.template_id,
        "scheduled_date": payload.scheduled_date.isoformat() if payload.scheduled_date else None,
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
            # Use aggregation pipeline with validated inputs
            pipeline = [
                {"$match": {"task_id": {"$eq": task_id}, "type": {"$eq": "increment"}}},
                {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$value", 1]}}}}
            ]
            result = list(db["events"].aggregate(pipeline))
            total = result[0]["total"] if result else 0
            return {"total": total, "goal": task.get("goal")}
            
        elif metric == MetricType.TIMER:
            # Use aggregation pipeline with validated inputs
            pipeline = [
                {"$match": {"task_id": {"$eq": task_id}, "type": {"$eq": "timer_stop"}}},
                {"$group": {"_id": None, "total_sec": {"$sum": {"$ifNull": ["$value", 0]}}}}
            ]
            result = list(db["events"].aggregate(pipeline))
            total_sec = result[0]["total_sec"] if result else 0
            return {"total_sec": total_sec, "goal": task.get("goal")}
            
        elif metric == MetricType.CHECK:
            # Use explicit equality operator to prevent injection
            done = db["events"].count_documents({"task_id": {"$eq": task_id}, "type": {"$eq": "check"}}) > 0
            return {"done": done}
        else:
            return {"message": "Unknown metric"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve task summary")

@app.post("/api/tasks/generate-daily/{date_str}")
def generate_daily_tasks(request: Request, date_str: str, db=Depends(get_database), csrf_protect: CsrfProtect = Depends()):
    """Generate daily tasks from templates for a specific date"""
    csrf_protect.validate_csrf(request)
    ensure_indexes(db)
    
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        weekday = target_date.weekday()  # 0=Monday, 6=Sunday
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    try:
        # Check if tasks already exist for this date with explicit equality
        existing_count = db["tasks"].count_documents({"scheduled_date": {"$eq": target_date.isoformat()}})
        if existing_count > 0:
            return {"message": f"Tasks already exist for {date_str}", "created": 0}
        
        # Find templates that should run on this weekday with explicit operator
        templates = list(db["templates"].find({"active_days": {"$in": [weekday]}}, {"_id": 0}))
        created_tasks = []
        
        for template in templates:
            task_id = str(uuid.uuid4())
            task_doc = {
                "id": task_id,
                "name": template["name"],
                "color": template["color"],
                "metric": template["metric"],
                "goal": template["goal"],
                "template_id": template["id"],
                "scheduled_date": target_date.isoformat(),
                "created_at": datetime.now(timezone.utc),
            }
            db["tasks"].insert_one(task_doc)
            task_doc.pop("_id", None)
            created_tasks.append(task_doc)
        
        return {"message": f"Generated {len(created_tasks)} tasks for {date_str}", "created": len(created_tasks), "tasks": created_tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate daily tasks")

# Daily reporting endpoint
@app.get("/api/reports/daily/{date_str}")
def daily_report(date_str: str, db=Depends(get_database)):
    """Get daily progress report"""
    ensure_indexes(db)
    
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    try:
        # Get all tasks for the date with explicit equality operator
        tasks = list(db["tasks"].find({"scheduled_date": {"$eq": target_date.isoformat()}}, {"_id": 0}))
        
        if not tasks:
            return {"date": date_str, "total_tasks": 0, "completed_tasks": 0, "completion_rate": 0, "metrics": {}}
        
        total_tasks = len(tasks)
        completed_tasks = 0
        metrics = {"count": 0, "timer": 0, "check": 0}
        
        for task in tasks:
            task_id = task["id"]
            metric = task["metric"]
            
            # Check if task has any activity with explicit equality operator
            has_activity = db["events"].count_documents({"task_id": {"$eq": task_id}}) > 0
            if has_activity:
                completed_tasks += 1
                metrics[metric] += 1
        
        completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        
        return {
            "date": date_str,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "completion_rate": round(completion_rate, 1),
            "metrics": metrics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate daily report")

# Initialize database indexes on startup
@app.on_event("startup")
async def startup_event():
    with get_db() as db:
        ensure_indexes(db)