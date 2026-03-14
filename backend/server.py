from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import secrets
import base64
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors
import math
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'agentroute_db')]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'agentroute-production-secret-key-2025')
ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 10080))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI(title="AgentRoute AI - Insurance Agency Platform")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== ENUMS ====================

class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    AGENT = "agent"

class LeadStage(str, Enum):
    # Pipeline stages for Policy Sales
    NEW_LEAD = "new_lead"
    APPOINTMENT_SCHEDULED = "appointment_scheduled"
    APPLICATION_SUBMITTED = "application_submitted"
    UNDERWRITING_REVIEW = "underwriting_review"
    ADDITIONAL_REQUIREMENTS = "additional_requirements"
    APPROVED = "approved"
    POLICY_ISSUED = "policy_issued"
    POLICY_PLACED = "policy_placed"
    COMMISSION_PENDING = "commission_pending"
    COMMISSION_PAID = "commission_paid"

class UnderwritingStatus(str, Enum):
    NOT_SUBMITTED = "not_submitted"
    SUBMITTED = "submitted"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    DECLINED = "declined"
    ISSUED = "issued"

class TaskType(str, Enum):
    FOLLOW_UP = "follow_up"
    CALL = "call"
    APPOINTMENT = "appointment"
    DOCUMENT_COLLECTION = "document_collection"
    REVIEW = "review"
    RENEWAL = "renewal"

# ==================== PYDANTIC MODELS ====================

# User Models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Optional[str] = "agent"
    manager_id: Optional[str] = None
    phone: Optional[str] = None
    territory: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    manager_id: Optional[str]
    subscription_status: str
    created_at: datetime
    last_login: Optional[datetime]
    phone: Optional[str]
    territory: Optional[str]
    commission_rate: Optional[float]
    is_active: bool

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# Lead Models
class LeadCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    source: Optional[str] = "manual"
    referral_source: Optional[str] = None
    referred_by_lead_id: Optional[str] = None

class LeadResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    address: str
    notes: str
    source: str
    stage: str
    underwriting_status: str
    created_by_user: str
    assigned_to_user: Optional[str]
    created_date: datetime
    last_contact_date: Optional[datetime]
    next_follow_up: Optional[datetime]
    latitude: Optional[float]
    longitude: Optional[float]
    referral_source: Optional[str]
    renewal_date: Optional[datetime]

# Appointment Models
class AppointmentCreate(BaseModel):
    lead_id: str
    appointment_date: str
    appointment_time: str
    notes: Optional[str] = ""
    status: Optional[str] = "scheduled"
    appointment_type: Optional[str] = "in_person"

class AppointmentResponse(BaseModel):
    id: str
    lead_id: str
    appointment_date: str
    appointment_time: str
    notes: str
    status: str
    appointment_type: str
    created_by_user: str
    created_date: datetime
    outcome: Optional[str]
    follow_up_notes: Optional[str]

# Task/Reminder Models
class TaskCreate(BaseModel):
    lead_id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    task_type: str = "follow_up"
    due_date: str
    due_time: Optional[str] = "09:00"
    priority: Optional[str] = "medium"

class TaskResponse(BaseModel):
    id: str
    lead_id: Optional[str]
    title: str
    description: str
    task_type: str
    due_date: str
    due_time: str
    priority: str
    status: str
    created_by_user: str
    created_date: datetime
    completed_date: Optional[datetime]

# Production/Policy Models
class ProductionCreate(BaseModel):
    lead_id: Optional[str] = None
    policy_type: str
    carrier: str
    premium: float
    commission: float
    policy_number: Optional[str] = ""
    status: Optional[str] = "submitted"
    notes: Optional[str] = ""

class ProductionResponse(BaseModel):
    id: str
    lead_id: Optional[str]
    policy_type: str
    carrier: str
    premium: float
    commission: float
    agent_commission: float
    manager_override: float
    agency_share: float
    policy_number: str
    status: str
    notes: str
    created_by_user: str
    created_date: datetime
    issue_date: Optional[datetime]

# Scope Models
class ScopeCreate(BaseModel):
    lead_id: str
    form_fields: Dict[str, Any]
    typed_name: str  # Beneficiary typed name
    signature: Optional[str] = ""  # Beneficiary signature
    agent_typed_name: Optional[str] = ""  # Agent typed name
    agent_signature: Optional[str] = ""  # Agent signature

class ScopeResponse(BaseModel):
    id: str
    lead_id: str
    form_fields: Dict[str, Any]
    typed_name: str
    signature: str
    agent_typed_name: str
    agent_signature: str
    pdf_base64: Optional[str] = None  # Stored PDF
    created_date: datetime
    created_by_user: str
    delivery_history: Optional[List[Dict[str, Any]]] = []  # Track sends/shares

# SOA Delivery Models
class ScopeDeliveryLog(BaseModel):
    scope_id: str
    delivery_method: str  # "email", "sms", "share", "airdrop", "other"
    recipient_contact: Optional[str] = None  # email or phone if available
    notes: Optional[str] = None

class ScopeDeliveryResponse(BaseModel):
    id: str
    scope_id: str
    lead_id: str
    delivery_method: str
    recipient_contact: Optional[str]
    notes: Optional[str]
    delivered_at: datetime
    delivered_by_user: str

# Activity/Timeline Models
class ActivityLog(BaseModel):
    id: str
    user_id: str
    lead_id: Optional[str]
    activity_type: str
    description: str
    metadata: Dict[str, Any]
    created_at: datetime

# Team/Agent Models
class AgentStats(BaseModel):
    id: str
    name: str
    email: str
    role: str
    leads_count: int
    appointments_scheduled: int
    appointments_completed: int
    applications_submitted: int
    policies_issued: int
    total_premium: float
    total_commission: float
    last_login: Optional[datetime]
    is_active: bool
    scorecard_grade: str

class TeamSnapshot(BaseModel):
    total_agents: int
    active_today: int
    needs_coaching: int
    overdue_leads: int
    top_producers: List[Dict]

# Commission Split Models
class CommissionSplit(BaseModel):
    agent_rate: float = 0.6
    manager_rate: float = 0.2
    agency_rate: float = 0.2

# Training Models
class TrainingResource(BaseModel):
    id: str
    title: str
    description: str

# Pipeline Models
class PipelineStageInfo(BaseModel):
    stage: str
    label: str
    count: int
    total_premium: float
    total_commission: float
    leads: List[Dict[str, Any]]

class PipelineResponse(BaseModel):
    stages: List[PipelineStageInfo]
    summary: Dict[str, Any]
    is_team_view: bool

class PipelineCaseUpdate(BaseModel):
    lead_id: str
    new_stage: str
    notes: Optional[str] = None
    premium: Optional[float] = None
    commission: Optional[float] = None
    policy_type: Optional[str] = None

# ==================== HELPER FUNCTIONS ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def require_manager_or_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Manager or Admin access required")
    return current_user

async def get_user_accessible_ids(user_id: str, role: str) -> List[str]:
    """Get all user IDs that this user can access based on role"""
    if role == "admin":
        users = await db.users.find({"deleted_at": None}, {"id": 1}).to_list(10000)
        return [u["id"] for u in users]
    elif role == "manager":
        downline = await db.users.find({"manager_id": user_id, "deleted_at": None}, {"id": 1}).to_list(1000)
        return [user_id] + [u["id"] for u in downline]
    else:
        return [user_id]

async def log_activity(user_id: str, activity_type: str, description: str, lead_id: str = None, metadata: dict = None):
    activity = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "lead_id": lead_id,
        "activity_type": activity_type,
        "description": description,
        "metadata": metadata or {},
        "created_at": datetime.utcnow()
    }
    await db.activity_logs.insert_one(activity)

def calculate_agent_grade(stats: dict) -> str:
    """Calculate agent scorecard grade based on performance"""
    score = 0
    if stats.get("leads_contacted", 0) >= 20: score += 20
    elif stats.get("leads_contacted", 0) >= 10: score += 10
    if stats.get("appointments_set", 0) >= 10: score += 20
    elif stats.get("appointments_set", 0) >= 5: score += 10
    if stats.get("appointments_completed", 0) >= 8: score += 20
    elif stats.get("appointments_completed", 0) >= 4: score += 10
    if stats.get("close_rate", 0) >= 0.3: score += 20
    elif stats.get("close_rate", 0) >= 0.15: score += 10
    if stats.get("follow_up_rate", 0) >= 0.9: score += 20
    elif stats.get("follow_up_rate", 0) >= 0.7: score += 10
    
    if score >= 80: return "A"
    elif score >= 60: return "B"
    elif score >= 40: return "C"
    elif score >= 20: return "D"
    else: return "F"

async def geocode_address(lead_id: str, address: str) -> Optional[dict]:
    """Geocode address using AI"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key: return None
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"geocode_{lead_id}",
            system_message="Return ONLY JSON: {\"latitude\": number, \"longitude\": number}"
        ).with_model("openai", "gpt-4.1")
        
        response = await chat.send_message(UserMessage(text=f"Geocode: {address}"))
        import json
        if "{" in response:
            coords = json.loads(response[response.find("{"):response.rfind("}")+1])
            if coords.get("latitude") and coords.get("longitude"):
                await db.lead_geocodes.update_one(
                    {"lead_id": lead_id},
                    {"$set": {"lead_id": lead_id, "latitude": coords["latitude"], "longitude": coords["longitude"], "updated_at": datetime.utcnow()}},
                    upsert=True
                )
                return coords
    except Exception as e:
        logger.error(f"Geocode error: {e}")
    return None

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": user_data.name,
        "email": user_data.email.lower(),
        "password_hash": get_password_hash(user_data.password),
        "role": user_data.role if user_data.role in ["admin", "manager", "agent"] else "agent",
        "manager_id": user_data.manager_id,
        "phone": user_data.phone,
        "territory": user_data.territory,
        "subscription_status": "trial",
        "commission_rate": 0.6,
        "created_at": datetime.utcnow(),
        "last_login": datetime.utcnow(),
        "is_active": True,
        "deleted_at": None,
        "reset_token": None,
        "reset_token_expiry": None
    }
    await db.users.insert_one(user_doc)
    await log_activity(user_id, "register", "User registered")
    
    access_token = create_access_token(data={"sub": user_id})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user_id, name=user_data.name, email=user_data.email.lower(),
            role=user_doc["role"], manager_id=user_doc["manager_id"],
            subscription_status="trial", created_at=user_doc["created_at"],
            last_login=user_doc["last_login"], phone=user_doc["phone"],
            territory=user_doc["territory"], commission_rate=user_doc["commission_rate"],
            is_active=True
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: dict):
    email = credentials.get("email", "").lower()
    password = credentials.get("password", "")
    
    user = await db.users.find_one({"email": email, "deleted_at": None})
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": datetime.utcnow()}})
    await log_activity(user["id"], "login", "User logged in")
    
    access_token = create_access_token(data={"sub": user["id"]})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"], name=user["name"], email=user["email"],
            role=user.get("role", "agent"), manager_id=user.get("manager_id"),
            subscription_status=user.get("subscription_status", "trial"),
            created_at=user["created_at"], last_login=datetime.utcnow(),
            phone=user.get("phone"), territory=user.get("territory"),
            commission_rate=user.get("commission_rate", 0.6),
            is_active=user.get("is_active", True)
        )
    )

@api_router.post("/auth/forgot-password")
async def forgot_password(request: dict):
    email = request.get("email", "").lower()
    user = await db.users.find_one({"email": email})
    if not user:
        return {"message": "If email exists, reset link sent", "dev_token": None}
    
    reset_token = secrets.token_urlsafe(32)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"reset_token": reset_token, "reset_token_expiry": datetime.utcnow() + timedelta(hours=1)}}
    )
    
    logger.info(f"PASSWORD RESET TOKEN for {email}: {reset_token}")
    return {"message": "If email exists, reset link sent", "dev_token": reset_token}

@api_router.post("/auth/reset-password")
async def reset_password(request: dict):
    token = request.get("token", "")
    new_password = request.get("new_password", "")
    
    user = await db.users.find_one({"reset_token": token, "reset_token_expiry": {"$gt": datetime.utcnow()}})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": get_password_hash(new_password), "reset_token": None, "reset_token_expiry": None}}
    )
    return {"message": "Password reset successfully"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"], name=current_user["name"], email=current_user["email"],
        role=current_user.get("role", "agent"), manager_id=current_user.get("manager_id"),
        subscription_status=current_user.get("subscription_status", "trial"),
        created_at=current_user["created_at"], last_login=current_user.get("last_login"),
        phone=current_user.get("phone"), territory=current_user.get("territory"),
        commission_rate=current_user.get("commission_rate", 0.6),
        is_active=current_user.get("is_active", True)
    )

@api_router.delete("/auth/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"deleted_at": datetime.utcnow()}})
    await log_activity(current_user["id"], "account_deleted", "Account deletion requested")
    return {"message": "Account scheduled for deletion"}

# ==================== LEADS ROUTES ====================

@api_router.get("/leads", response_model=List[LeadResponse])
async def get_leads(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    leads = await db.leads.find({"$or": [{"created_by_user": {"$in": user_ids}}, {"assigned_to_user": {"$in": user_ids}}]}).to_list(10000)
    
    result = []
    for lead in leads:
        geocode = await db.lead_geocodes.find_one({"lead_id": lead["id"]})
        result.append(LeadResponse(
            id=lead["id"], name=lead["name"], phone=lead.get("phone", ""),
            email=lead.get("email", ""), address=lead.get("address", ""),
            notes=lead.get("notes", ""), source=lead.get("source", "manual"),
            stage=lead.get("stage", "new_lead"), underwriting_status=lead.get("underwriting_status", "not_submitted"),
            created_by_user=lead["created_by_user"], assigned_to_user=lead.get("assigned_to_user"),
            created_date=lead["created_date"], last_contact_date=lead.get("last_contact_date"),
            next_follow_up=lead.get("next_follow_up"),
            latitude=geocode["latitude"] if geocode else None,
            longitude=geocode["longitude"] if geocode else None,
            referral_source=lead.get("referral_source"),
            renewal_date=lead.get("renewal_date")
        ))
    return result

@api_router.post("/leads", response_model=LeadResponse)
async def create_lead(lead_data: LeadCreate, current_user: dict = Depends(get_current_user)):
    lead_id = str(uuid.uuid4())
    lead_doc = {
        "id": lead_id,
        "name": lead_data.name,
        "phone": lead_data.phone or "",
        "email": lead_data.email or "",
        "address": lead_data.address or "",
        "notes": lead_data.notes or "",
        "source": lead_data.source or "manual",
        "stage": "new_lead",
        "underwriting_status": "not_submitted",
        "referral_source": lead_data.referral_source,
        "referred_by_lead_id": lead_data.referred_by_lead_id,
        "created_by_user": current_user["id"],
        "assigned_to_user": current_user["id"],
        "created_date": datetime.utcnow(),
        "last_contact_date": None,
        "next_follow_up": None,
        "renewal_date": None
    }
    await db.leads.insert_one(lead_doc)
    
    if lead_data.address:
        await geocode_address(lead_id, lead_data.address)
    
    await log_activity(current_user["id"], "lead_created", f"Created lead: {lead_data.name}", lead_id)
    
    return LeadResponse(**{**lead_doc, "latitude": None, "longitude": None})

@api_router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    lead = await db.leads.find_one({"id": lead_id, "$or": [{"created_by_user": {"$in": user_ids}}, {"assigned_to_user": {"$in": user_ids}}]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    geocode = await db.lead_geocodes.find_one({"lead_id": lead_id})
    return LeadResponse(
        id=lead["id"], name=lead["name"], phone=lead.get("phone", ""),
        email=lead.get("email", ""), address=lead.get("address", ""),
        notes=lead.get("notes", ""), source=lead.get("source", "manual"),
        stage=lead.get("stage", "new_lead"), underwriting_status=lead.get("underwriting_status", "not_submitted"),
        created_by_user=lead["created_by_user"], assigned_to_user=lead.get("assigned_to_user"),
        created_date=lead["created_date"], last_contact_date=lead.get("last_contact_date"),
        next_follow_up=lead.get("next_follow_up"),
        latitude=geocode["latitude"] if geocode else None,
        longitude=geocode["longitude"] if geocode else None,
        referral_source=lead.get("referral_source"),
        renewal_date=lead.get("renewal_date")
    )

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, lead_data: dict, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    update_data = {k: v for k, v in lead_data.items() if v is not None and k != "id"}
    if update_data:
        if "address" in update_data and update_data["address"] != lead.get("address"):
            await geocode_address(lead_id, update_data["address"])
        await db.leads.update_one({"id": lead_id}, {"$set": update_data})
        await log_activity(current_user["id"], "lead_updated", f"Updated lead", lead_id, update_data)
    
    return {"message": "Lead updated"}

@api_router.put("/leads/{lead_id}/stage")
async def update_lead_stage(lead_id: str, stage_data: dict, current_user: dict = Depends(get_current_user)):
    """Update lead pipeline stage"""
    new_stage = stage_data.get("stage")
    valid_stages = [s.value for s in LeadStage]
    if new_stage not in valid_stages:
        raise HTTPException(status_code=400, detail="Invalid stage")
    
    await db.leads.update_one({"id": lead_id}, {"$set": {"stage": new_stage}})
    await log_activity(current_user["id"], "stage_changed", f"Lead moved to {new_stage}", lead_id)
    return {"message": "Stage updated", "stage": new_stage}

@api_router.put("/leads/{lead_id}/underwriting")
async def update_underwriting_status(lead_id: str, status_data: dict, current_user: dict = Depends(get_current_user)):
    """Update underwriting status"""
    new_status = status_data.get("status")
    valid_statuses = [s.value for s in UnderwritingStatus]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    await db.leads.update_one({"id": lead_id}, {"$set": {"underwriting_status": new_status}})
    await log_activity(current_user["id"], "underwriting_updated", f"Underwriting: {new_status}", lead_id)
    return {"message": "Underwriting status updated", "status": new_status}

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    await db.leads.delete_one({"id": lead_id, "created_by_user": current_user["id"]})
    await db.appointments.delete_many({"lead_id": lead_id})
    await db.tasks.delete_many({"lead_id": lead_id})
    return {"message": "Lead deleted"}

@api_router.get("/leads/{lead_id}/timeline")
async def get_lead_timeline(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get complete activity timeline for a lead"""
    activities = await db.activity_logs.find({"lead_id": lead_id}).sort("created_at", -1).to_list(100)
    appointments = await db.appointments.find({"lead_id": lead_id}).to_list(100)
    scopes = await db.scope_forms.find({"lead_id": lead_id}).to_list(100)
    tasks = await db.tasks.find({"lead_id": lead_id}).to_list(100)
    
    timeline = []
    for a in activities:
        timeline.append({"type": "activity", "date": a["created_at"], "data": a})
    for apt in appointments:
        timeline.append({"type": "appointment", "date": apt["created_date"], "data": apt})
    for s in scopes:
        timeline.append({"type": "scope", "date": s["created_date"], "data": s})
    for t in tasks:
        timeline.append({"type": "task", "date": t["created_date"], "data": t})
    
    timeline.sort(key=lambda x: x["date"], reverse=True)
    return timeline

# ==================== APPOINTMENTS ROUTES ====================

@api_router.get("/appointments")
async def get_appointments(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    appointments = await db.appointments.find({"created_by_user": {"$in": user_ids}}).to_list(10000)
    return [AppointmentResponse(
        id=apt["id"], lead_id=apt["lead_id"], appointment_date=apt["appointment_date"],
        appointment_time=apt["appointment_time"], notes=apt.get("notes", ""),
        status=apt.get("status", "scheduled"), appointment_type=apt.get("appointment_type", "in_person"),
        created_by_user=apt["created_by_user"], created_date=apt["created_date"],
        outcome=apt.get("outcome"), follow_up_notes=apt.get("follow_up_notes")
    ) for apt in appointments]

@api_router.post("/appointments")
async def create_appointment(apt_data: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    apt_id = str(uuid.uuid4())
    apt_doc = {
        "id": apt_id,
        "lead_id": apt_data.lead_id,
        "appointment_date": apt_data.appointment_date,
        "appointment_time": apt_data.appointment_time,
        "notes": apt_data.notes or "",
        "status": apt_data.status or "scheduled",
        "appointment_type": apt_data.appointment_type or "in_person",
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow(),
        "outcome": None,
        "follow_up_notes": None
    }
    await db.appointments.insert_one(apt_doc)
    await db.leads.update_one({"id": apt_data.lead_id}, {"$set": {"stage": "appointment_scheduled"}})
    await log_activity(current_user["id"], "appointment_created", "Scheduled appointment", apt_data.lead_id)
    return AppointmentResponse(**apt_doc)

@api_router.put("/appointments/{apt_id}")
async def update_appointment(apt_id: str, apt_data: dict, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in apt_data.items() if v is not None}
    if update_data:
        await db.appointments.update_one({"id": apt_id}, {"$set": update_data})
        
        if update_data.get("status") == "completed":
            apt = await db.appointments.find_one({"id": apt_id})
            if apt:
                await db.leads.update_one({"id": apt["lead_id"]}, {"$set": {"stage": "appointment_completed", "last_contact_date": datetime.utcnow()}})
                await log_activity(current_user["id"], "appointment_completed", "Completed appointment", apt["lead_id"])
    
    return {"message": "Appointment updated"}

@api_router.delete("/appointments/{apt_id}")
async def delete_appointment(apt_id: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.delete_one({"id": apt_id, "created_by_user": current_user["id"]})
    return {"message": "Appointment deleted"}

@api_router.get("/appointments/lead/{lead_id}")
async def get_lead_appointments(lead_id: str, current_user: dict = Depends(get_current_user)):
    appointments = await db.appointments.find({"lead_id": lead_id}).to_list(100)
    return [AppointmentResponse(
        id=apt["id"], lead_id=apt["lead_id"], appointment_date=apt["appointment_date"],
        appointment_time=apt["appointment_time"], notes=apt.get("notes", ""),
        status=apt.get("status", "scheduled"), appointment_type=apt.get("appointment_type", "in_person"),
        created_by_user=apt["created_by_user"], created_date=apt["created_date"],
        outcome=apt.get("outcome"), follow_up_notes=apt.get("follow_up_notes")
    ) for apt in appointments]

# ==================== TASKS/REMINDERS ROUTES ====================

@api_router.get("/tasks")
async def get_tasks(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    tasks = await db.tasks.find({"created_by_user": {"$in": user_ids}}).to_list(10000)
    return [TaskResponse(**t) for t in tasks]

@api_router.post("/tasks")
async def create_task(task_data: TaskCreate, current_user: dict = Depends(get_current_user)):
    task_id = str(uuid.uuid4())
    task_doc = {
        "id": task_id,
        "lead_id": task_data.lead_id,
        "title": task_data.title,
        "description": task_data.description or "",
        "task_type": task_data.task_type,
        "due_date": task_data.due_date,
        "due_time": task_data.due_time or "09:00",
        "priority": task_data.priority or "medium",
        "status": "pending",
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow(),
        "completed_date": None
    }
    await db.tasks.insert_one(task_doc)
    
    if task_data.lead_id:
        await db.leads.update_one({"id": task_data.lead_id}, {"$set": {"next_follow_up": datetime.fromisoformat(task_data.due_date)}})
    
    await log_activity(current_user["id"], "task_created", f"Created task: {task_data.title}", task_data.lead_id)
    return TaskResponse(**task_doc)

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task_data: dict, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in task_data.items() if v is not None}
    if update_data.get("status") == "completed":
        update_data["completed_date"] = datetime.utcnow()
    
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    return {"message": "Task updated"}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    await db.tasks.delete_one({"id": task_id, "created_by_user": current_user["id"]})
    return {"message": "Task deleted"}

@api_router.get("/tasks/overdue")
async def get_overdue_tasks(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    today = datetime.utcnow().strftime("%Y-%m-%d")
    tasks = await db.tasks.find({
        "created_by_user": {"$in": user_ids},
        "status": "pending",
        "due_date": {"$lt": today}
    }).to_list(1000)
    return tasks

# ==================== PRODUCTION ROUTES ====================

@api_router.get("/production")
async def get_production(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    production = await db.production.find({"created_by_user": {"$in": user_ids}}).to_list(10000)
    return [ProductionResponse(**p) for p in production]

@api_router.post("/production")
async def create_production(prod_data: ProductionCreate, current_user: dict = Depends(get_current_user)):
    # Get commission splits
    user = current_user
    agent_rate = user.get("commission_rate", 0.6)
    manager_rate = 0.2
    agency_rate = 1.0 - agent_rate - manager_rate
    
    prod_id = str(uuid.uuid4())
    prod_doc = {
        "id": prod_id,
        "lead_id": prod_data.lead_id,
        "policy_type": prod_data.policy_type,
        "carrier": prod_data.carrier,
        "premium": prod_data.premium,
        "commission": prod_data.commission,
        "agent_commission": prod_data.commission * agent_rate,
        "manager_override": prod_data.commission * manager_rate,
        "agency_share": prod_data.commission * agency_rate,
        "policy_number": prod_data.policy_number or "",
        "status": prod_data.status or "submitted",
        "notes": prod_data.notes or "",
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow(),
        "issue_date": None
    }
    await db.production.insert_one(prod_doc)
    
    if prod_data.lead_id:
        await db.leads.update_one({"id": prod_data.lead_id}, {"$set": {"stage": "application_submitted", "underwriting_status": "submitted"}})
    
    await log_activity(current_user["id"], "production_created", f"Submitted: {prod_data.policy_type}", prod_data.lead_id)
    return ProductionResponse(**prod_doc)

@api_router.get("/production/dashboard")
async def get_production_dashboard(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    now = datetime.utcnow()
    
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    async def get_stats(start_date):
        pipeline = [
            {"$match": {"created_by_user": {"$in": user_ids}, "created_date": {"$gte": start_date}}},
            {"$group": {"_id": None, "premium": {"$sum": "$premium"}, "commission": {"$sum": "$commission"}, "count": {"$sum": 1}}}
        ]
        result = await db.production.aggregate(pipeline).to_list(1)
        return result[0] if result else {"premium": 0, "commission": 0, "count": 0}
    
    daily = await get_stats(day_start)
    weekly = await get_stats(week_start)
    monthly = await get_stats(month_start)
    
    # Get pipeline counts
    leads_count = await db.leads.count_documents({"created_by_user": {"$in": user_ids}})
    appointments_scheduled = await db.appointments.count_documents({"created_by_user": {"$in": user_ids}, "status": "scheduled"})
    appointments_completed = await db.appointments.count_documents({"created_by_user": {"$in": user_ids}, "status": "completed"})
    applications_submitted = await db.leads.count_documents({"created_by_user": {"$in": user_ids}, "stage": "application_submitted"})
    policies_issued = await db.leads.count_documents({"created_by_user": {"$in": user_ids}, "stage": "policy_issued"})
    
    return {
        "daily": {"premium": daily["premium"], "commission": daily["commission"], "policies": daily["count"]},
        "weekly": {"premium": weekly["premium"], "commission": weekly["commission"], "policies": weekly["count"]},
        "monthly": {"premium": monthly["premium"], "commission": monthly["commission"], "policies": monthly["count"]},
        "pipeline": {
            "leads": leads_count,
            "appointments_scheduled": appointments_scheduled,
            "appointments_completed": appointments_completed,
            "applications_submitted": applications_submitted,
            "policies_issued": policies_issued
        }
    }

# ==================== POLICY SALES PIPELINE ROUTES ====================

# Stage labels for display
PIPELINE_STAGE_LABELS = {
    "new_lead": "Lead",
    "appointment_scheduled": "Appointment Scheduled",
    "application_submitted": "Application Submitted",
    "underwriting_review": "Underwriting Review",
    "additional_requirements": "Additional Requirements",
    "approved": "Approved",
    "policy_issued": "Policy Issued",
    "policy_placed": "Policy Placed",
    "commission_pending": "Commission Pending",
    "commission_paid": "Commission Paid"
}

@api_router.get("/pipeline")
async def get_pipeline(team_view: bool = False, current_user: dict = Depends(get_current_user)):
    """
    Get the sales pipeline view.
    - Agents see only their own cases
    - Managers/Admins can see full team pipeline with team_view=true
    """
    user_role = current_user.get("role", "agent")
    is_team_view = team_view and user_role in ["admin", "manager"]
    
    # Determine which user IDs to include
    if is_team_view:
        if user_role == "admin":
            # Admin sees all users
            user_ids = [u["id"] async for u in db.users.find({}, {"id": 1})]
        else:
            # Manager sees their direct reports + themselves
            user_ids = [current_user["id"]]
            async for agent in db.users.find({"manager_id": current_user["id"]}, {"id": 1}):
                user_ids.append(agent["id"])
    else:
        user_ids = [current_user["id"]]
    
    # Get all leads for these users
    leads_cursor = db.leads.find({"created_by_user": {"$in": user_ids}})
    all_leads = await leads_cursor.to_list(1000)
    
    # Get production data for commission calculations
    production_cursor = db.production.find({"created_by_user": {"$in": user_ids}})
    all_production = await production_cursor.to_list(1000)
    
    # Build production lookup by lead_id
    production_by_lead = {}
    for prod in all_production:
        lead_id = prod.get("lead_id")
        if lead_id:
            if lead_id not in production_by_lead:
                production_by_lead[lead_id] = {"premium": 0, "commission": 0, "count": 0}
            production_by_lead[lead_id]["premium"] += prod.get("premium", 0)
            production_by_lead[lead_id]["commission"] += prod.get("agent_commission", prod.get("commission", 0))
            production_by_lead[lead_id]["count"] += 1
    
    # Organize leads by stage
    stages = []
    total_premium = 0
    total_commission = 0
    total_cases = len(all_leads)
    
    for stage_value in LeadStage:
        stage_leads = [l for l in all_leads if l.get("stage") == stage_value.value]
        stage_premium = 0
        stage_commission = 0
        
        formatted_leads = []
        for lead in stage_leads:
            lead_id = lead.get("id")
            prod_info = production_by_lead.get(lead_id, {"premium": 0, "commission": 0})
            stage_premium += prod_info["premium"]
            stage_commission += prod_info["commission"]
            
            # Get agent name if team view
            agent_name = None
            if is_team_view:
                agent = await db.users.find_one({"id": lead.get("created_by_user")}, {"name": 1})
                agent_name = agent.get("name") if agent else "Unknown"
            
            formatted_leads.append({
                "id": lead_id,
                "name": lead.get("name"),
                "phone": lead.get("phone"),
                "email": lead.get("email"),
                "created_date": lead.get("created_date").isoformat() if lead.get("created_date") else None,
                "last_contact_date": lead.get("last_contact_date").isoformat() if lead.get("last_contact_date") else None,
                "premium": prod_info["premium"],
                "commission": prod_info["commission"],
                "agent_name": agent_name,
                "agent_id": lead.get("created_by_user"),
                "underwriting_status": lead.get("underwriting_status", "not_submitted"),
                "policy_type": lead.get("policy_type"),
                "notes": lead.get("notes", "")[:100]  # Truncate for list view
            })
        
        total_premium += stage_premium
        total_commission += stage_commission
        
        stages.append({
            "stage": stage_value.value,
            "label": PIPELINE_STAGE_LABELS.get(stage_value.value, stage_value.value),
            "count": len(stage_leads),
            "total_premium": stage_premium,
            "total_commission": stage_commission,
            "leads": formatted_leads
        })
    
    # Summary stats
    summary = {
        "total_cases": total_cases,
        "total_premium": total_premium,
        "total_commission": total_commission,
        "conversion_rate": round((len([l for l in all_leads if l.get("stage") in ["policy_issued", "policy_placed", "commission_pending", "commission_paid"]]) / total_cases * 100) if total_cases > 0 else 0, 1),
        "stages_summary": {s["stage"]: s["count"] for s in stages}
    }
    
    return {
        "stages": stages,
        "summary": summary,
        "is_team_view": is_team_view
    }

@api_router.put("/pipeline/move")
async def move_pipeline_case(update: PipelineCaseUpdate, current_user: dict = Depends(get_current_user)):
    """
    Move a case to a different pipeline stage.
    Optionally update premium/commission when moving to certain stages.
    """
    # Validate stage
    valid_stages = [s.value for s in LeadStage]
    if update.new_stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {valid_stages}")
    
    # Get the lead
    lead = await db.leads.find_one({"id": update.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check authorization
    user_role = current_user.get("role", "agent")
    if user_role == "agent" and lead.get("created_by_user") != current_user["id"]:
        # Check if assigned to this agent
        if lead.get("assigned_to_user") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized to update this lead")
    
    old_stage = lead.get("stage", "new_lead")
    
    # Update the lead stage
    update_data = {
        "stage": update.new_stage,
        "last_contact_date": datetime.utcnow()
    }
    
    # If notes provided, append to existing notes
    if update.notes:
        existing_notes = lead.get("notes", "")
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        new_note = f"\n[{timestamp}] Stage: {PIPELINE_STAGE_LABELS.get(update.new_stage, update.new_stage)} - {update.notes}"
        update_data["notes"] = existing_notes + new_note
    
    # Update underwriting status based on stage
    stage_to_underwriting = {
        "application_submitted": "submitted",
        "underwriting_review": "pending_review",
        "additional_requirements": "pending_review",
        "approved": "approved",
        "policy_issued": "issued",
        "policy_placed": "issued"
    }
    if update.new_stage in stage_to_underwriting:
        update_data["underwriting_status"] = stage_to_underwriting[update.new_stage]
    
    await db.leads.update_one({"id": update.lead_id}, {"$set": update_data})
    
    # If moving to application_submitted or later with premium/commission, create production record
    production_stages = ["application_submitted", "underwriting_review", "approved", "policy_issued", "policy_placed", "commission_pending", "commission_paid"]
    if update.new_stage in production_stages and update.premium and update.premium > 0:
        # Check if production record already exists for this lead
        existing_prod = await db.production.find_one({"lead_id": update.lead_id})
        
        if not existing_prod:
            # Get commission splits
            user = await db.users.find_one({"id": current_user["id"]})
            agent_rate = user.get("commission_rate", 0.6) if user else 0.6
            manager_rate = 0.2
            agency_rate = 0.2
            
            commission = update.commission or (update.premium * 0.1)  # Default 10% commission if not specified
            
            prod_doc = {
                "id": str(uuid.uuid4()),
                "lead_id": update.lead_id,
                "user_id": lead.get("created_by_user"),
                "policy_type": update.policy_type or "unknown",
                "premium": update.premium,
                "commission": commission,
                "agent_commission": commission * agent_rate,
                "manager_override": commission * manager_rate,
                "agency_share": commission * agency_rate,
                "created_by_user": current_user["id"],
                "created_date": datetime.utcnow(),
                "status": "pending" if update.new_stage != "commission_paid" else "paid"
            }
            await db.production.insert_one(prod_doc)
        else:
            # Update existing production record
            prod_update = {}
            if update.premium:
                prod_update["premium"] = update.premium
            if update.commission:
                user = await db.users.find_one({"id": current_user["id"]})
                agent_rate = user.get("commission_rate", 0.6) if user else 0.6
                prod_update["commission"] = update.commission
                prod_update["agent_commission"] = update.commission * agent_rate
            if update.new_stage == "commission_paid":
                prod_update["status"] = "paid"
                prod_update["paid_date"] = datetime.utcnow()
            
            if prod_update:
                await db.production.update_one({"lead_id": update.lead_id}, {"$set": prod_update})
    
    # Log the activity
    await log_activity(
        current_user["id"], 
        "pipeline_move", 
        f"Moved from {PIPELINE_STAGE_LABELS.get(old_stage, old_stage)} to {PIPELINE_STAGE_LABELS.get(update.new_stage, update.new_stage)}",
        update.lead_id
    )
    
    return {
        "message": "Pipeline stage updated",
        "lead_id": update.lead_id,
        "old_stage": old_stage,
        "new_stage": update.new_stage
    }

@api_router.get("/pipeline/stats")
async def get_pipeline_stats(team_view: bool = False, current_user: dict = Depends(get_current_user)):
    """
    Get pipeline statistics for production tracking.
    """
    user_role = current_user.get("role", "agent")
    is_team_view = team_view and user_role in ["admin", "manager"]
    
    # Determine which user IDs to include
    if is_team_view:
        if user_role == "admin":
            user_ids = [u["id"] async for u in db.users.find({}, {"id": 1})]
        else:
            user_ids = [current_user["id"]]
            async for agent in db.users.find({"manager_id": current_user["id"]}, {"id": 1}):
                user_ids.append(agent["id"])
    else:
        user_ids = [current_user["id"]]
    
    # Calculate date ranges
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)
    
    async def get_period_stats(start_date):
        pipeline = [
            {"$match": {"created_by_user": {"$in": user_ids}, "created_date": {"$gte": start_date}}},
            {"$group": {
                "_id": None,
                "premium": {"$sum": "$premium"},
                "commission": {"$sum": "$agent_commission"},
                "count": {"$sum": 1}
            }}
        ]
        result = await db.production.aggregate(pipeline).to_list(1)
        return result[0] if result else {"premium": 0, "commission": 0, "count": 0}
    
    daily = await get_period_stats(today_start)
    weekly = await get_period_stats(week_start)
    monthly = await get_period_stats(month_start)
    
    # Get stage counts
    stage_counts = {}
    for stage in LeadStage:
        count = await db.leads.count_documents({
            "created_by_user": {"$in": user_ids},
            "stage": stage.value
        })
        stage_counts[stage.value] = count
    
    # Calculate velocity (average days in each stage)
    # For now, just return basic stats
    
    return {
        "production": {
            "daily": {"premium": daily["premium"], "commission": daily["commission"], "policies": daily["count"]},
            "weekly": {"premium": weekly["premium"], "commission": weekly["commission"], "policies": weekly["count"]},
            "monthly": {"premium": monthly["premium"], "commission": monthly["commission"], "policies": monthly["count"]}
        },
        "stage_counts": stage_counts,
        "total_in_pipeline": sum(stage_counts.values()),
        "active_cases": sum(stage_counts[s] for s in ["appointment_scheduled", "application_submitted", "underwriting_review", "additional_requirements"]),
        "closed_won": sum(stage_counts[s] for s in ["policy_issued", "policy_placed", "commission_pending", "commission_paid"]),
        "is_team_view": is_team_view
    }

@api_router.post("/scope")
async def create_scope(scope_data: ScopeCreate, current_user: dict = Depends(get_current_user)):
    """Create a new Scope of Appointment document with both signatures"""
    scope_id = str(uuid.uuid4())
    
    # Get lead and agent info for PDF generation
    lead = await db.leads.find_one({"id": scope_data.lead_id})
    agent = await db.users.find_one({"id": current_user["id"]})
    
    scope_doc = {
        "id": scope_id,
        "lead_id": scope_data.lead_id,
        "form_fields": scope_data.form_fields,
        "typed_name": scope_data.typed_name,
        "signature": scope_data.signature or "",
        "agent_typed_name": scope_data.agent_typed_name or agent.get("name", "") if agent else "",
        "agent_signature": scope_data.agent_signature or "",
        "created_date": datetime.utcnow(),
        "created_by_user": current_user["id"],
        "pdf_base64": None  # Will be generated
    }
    
    # Generate PDF and store it
    try:
        pdf_data = await generate_scope_pdf(scope_doc, lead, agent)
        scope_doc["pdf_base64"] = pdf_data["pdf_base64"]
    except Exception as e:
        logger.error(f"Failed to generate PDF: {e}")
    
    await db.scope_forms.insert_one(scope_doc)
    await log_activity(current_user["id"], "scope_created", "Created Scope of Appointment", scope_data.lead_id)
    
    return {
        "id": scope_doc["id"],
        "lead_id": scope_doc["lead_id"],
        "form_fields": scope_doc["form_fields"],
        "typed_name": scope_doc["typed_name"],
        "signature": scope_doc["signature"],
        "agent_typed_name": scope_doc["agent_typed_name"],
        "agent_signature": scope_doc["agent_signature"],
        "pdf_base64": scope_doc.get("pdf_base64"),
        "created_date": scope_doc["created_date"],
        "created_by_user": scope_doc["created_by_user"]
    }

@api_router.get("/scope/{scope_id}")
async def get_scope(scope_id: str, current_user: dict = Depends(get_current_user)):
    scope = await db.scope_forms.find_one({"id": scope_id})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    # Remove MongoDB ObjectId to prevent serialization issues
    scope.pop("_id", None)
    
    # Ensure all fields exist
    scope.setdefault("agent_typed_name", "")
    scope.setdefault("agent_signature", "")
    scope.setdefault("pdf_base64", None)
    return scope

@api_router.get("/scope/lead/{lead_id}")
async def get_lead_scopes(lead_id: str, current_user: dict = Depends(get_current_user)):
    scopes = await db.scope_forms.find({"lead_id": lead_id}).to_list(100)
    # Ensure all fields exist and remove MongoDB ObjectId
    for s in scopes:
        s.pop("_id", None)  # Remove MongoDB ObjectId to prevent serialization issues
        s.setdefault("agent_typed_name", "")
        s.setdefault("agent_signature", "")
        s.setdefault("pdf_base64", None)
    return scopes

# Admin/Manager endpoint to view all SOAs
@api_router.get("/scope/admin/all")
async def get_all_scopes(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get all SOA documents - Admin/Manager only"""
    user_role = current_user.get("role", "agent")
    
    if user_role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin or Manager access required")
    
    # Determine which users' documents to show
    if user_role == "admin":
        # Admin sees all
        query = {}
    else:
        # Manager sees their agents' documents
        agent_ids = [current_user["id"]]
        async for agent in db.users.find({"manager_id": current_user["id"]}, {"id": 1}):
            agent_ids.append(agent["id"])
        query = {"created_by_user": {"$in": agent_ids}}
    
    # Get scopes with pagination
    scopes = await db.scope_forms.find(query).sort("created_date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.scope_forms.count_documents(query)
    
    # Enrich with lead and agent info
    enriched_scopes = []
    for scope in scopes:
        lead = await db.leads.find_one({"id": scope.get("lead_id")}, {"name": 1, "phone": 1})
        agent = await db.users.find_one({"id": scope.get("created_by_user")}, {"name": 1, "email": 1})
        
        enriched_scopes.append({
            "id": scope["id"],
            "lead_id": scope.get("lead_id"),
            "lead_name": lead.get("name") if lead else "Unknown",
            "lead_phone": lead.get("phone") if lead else "",
            "agent_name": agent.get("name") if agent else "Unknown",
            "agent_email": agent.get("email") if agent else "",
            "beneficiary_name": scope.get("form_fields", {}).get("beneficiary_name", ""),
            "typed_name": scope.get("typed_name", ""),
            "created_date": scope.get("created_date"),
            "has_pdf": bool(scope.get("pdf_base64")),
            "products": {
                "medicare_advantage": scope.get("form_fields", {}).get("medicare_advantage", False),
                "medicare_supplement": scope.get("form_fields", {}).get("medicare_supplement", False),
                "prescription_drug": scope.get("form_fields", {}).get("prescription_drug", False),
                "dental_vision": scope.get("form_fields", {}).get("dental_vision", False),
            }
        })
    
    return {
        "scopes": enriched_scopes,
        "total": total,
        "skip": skip,
        "limit": limit
    }

async def generate_scope_pdf(scope: dict, lead: dict, agent: dict) -> dict:
    """Generate professional PDF for Scope of Appointment with dual signatures"""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from io import BytesIO
    import base64
    
    lead_name = lead.get("name", "Unknown") if lead else "Unknown"
    agent_name = agent.get("name", "Unknown") if agent else "Unknown"
    scope_id = scope.get("id", "")
    
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    form_fields = scope.get("form_fields", {})
    
    # Header
    p.setStrokeColor(colors.HexColor("#1E40AF"))
    p.setLineWidth(2)
    p.rect(30, height - 100, width - 60, 70, stroke=1, fill=0)
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 22)
    p.drawCentredString(width/2, height - 55, "SCOPE OF APPOINTMENT")
    p.setFillColor(colors.HexColor("#475569"))
    p.setFont("Helvetica", 10)
    p.drawCentredString(width/2, height - 75, "Medicare Sales Appointment Confirmation Document")
    
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 8)
    p.drawString(40, height - 95, f"Doc ID: {scope_id[:8].upper()}")
    created_date = scope.get("created_date", datetime.utcnow())
    if isinstance(created_date, str):
        created_date = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
    p.drawRightString(width - 40, height - 95, f"Date: {created_date.strftime('%B %d, %Y')}")
    
    y = height - 130
    
    # Section 1: Beneficiary Information
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 1: BENEFICIARY/AUTHORIZED REPRESENTATIVE")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 20
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 10)
    p.drawString(40, y, f"Name: {form_fields.get('beneficiary_name', lead_name)}")
    y -= 18
    p.drawString(40, y, f"Phone: {form_fields.get('beneficiary_phone', lead.get('phone', 'N/A') if lead else 'N/A')}")
    y -= 18
    if lead and lead.get("address"):
        p.drawString(40, y, f"Address: {lead.get('address', 'N/A')}")
        y -= 18
    y -= 15
    
    # Section 2: Agent Information
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 2: LICENSED SALES REPRESENTATIVE")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 20
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 10)
    p.drawString(40, y, f"Agent/Broker Name: {form_fields.get('agent_name', agent_name)}")
    y -= 18
    p.drawString(40, y, f"License Number: {form_fields.get('agent_license', 'N/A')}")
    y -= 18
    p.drawString(40, y, f"Agency: AgentRoute AI Insurance Services")
    y -= 25
    
    # Section 3: Products
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 3: PRODUCTS TO BE DISCUSSED")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 15
    p.setFillColor(colors.HexColor("#475569"))
    p.setFont("Helvetica-Oblique", 9)
    p.drawString(40, y, "Please indicate the type(s) of product(s) you want the agent/broker to discuss:")
    y -= 18
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 10)
    
    products = [
        ("medicare_advantage", "Medicare Advantage Plans (Part C) - HMO, PPO, PFFS, SNP"),
        ("medicare_supplement", "Medicare Supplement (Medigap) Insurance"),
        ("prescription_drug", "Medicare Prescription Drug Plans (Part D)"),
        ("dental_vision", "Dental, Vision, and/or Hearing Products"),
    ]
    for key, label in products:
        checked = "☑" if form_fields.get(key) else "☐"
        p.drawString(50, y, f"{checked} {label}")
        y -= 16
    
    if form_fields.get("other_products"):
        p.drawString(50, y, f"☑ Other: {form_fields.get('other_products')}")
        y -= 16
    y -= 15
    
    # Section 4: Consent
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 4: CONSENT & ACKNOWLEDGMENT")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 15
    
    # Consent box
    p.setFillColor(colors.HexColor("#F8FAFC"))
    p.rect(40, y - 60, width - 80, 60, stroke=0, fill=1)
    p.setFillColor(colors.HexColor("#475569"))
    p.setFont("Helvetica", 8)
    consent_text = [
        "By signing below, I agree to a meeting with a sales agent to discuss the types of products I have",
        "selected above. I understand that this is not an enrollment form and I am under no obligation to",
        "enroll in any plan. The agent may only discuss the products I have indicated above. I understand",
        "that the Centers for Medicare & Medicaid Services (CMS) requires documentation of specific",
        "product types prior to any Medicare sales appointment."
    ]
    text_y = y - 12
    for line in consent_text:
        p.drawString(50, text_y, line)
        text_y -= 10
    y -= 75
    
    # Section 5: Signatures
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 5: SIGNATURES")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 25
    
    p.setFillColor(colors.black)
    
    # Beneficiary Signature
    p.setFont("Helvetica-Bold", 10)
    p.drawString(40, y, "Beneficiary/Authorized Representative:")
    y -= 5
    
    # Draw signature if exists
    if scope.get("signature"):
        try:
            sig_data = scope["signature"]
            if sig_data.startswith("data:"):
                sig_data = sig_data.split(",")[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = ImageReader(BytesIO(sig_bytes))
            p.drawImage(sig_image, 40, y - 45, width=140, height=40, preserveAspectRatio=True)
        except Exception as e:
            logger.error(f"Error drawing beneficiary signature: {e}")
    
    p.line(40, y - 50, 200, y - 50)
    p.setFont("Helvetica", 8)
    p.drawString(40, y - 60, "Signature")
    
    p.line(220, y - 50, 320, y - 50)
    p.drawString(220, y - 60, "Date")
    p.setFont("Helvetica", 10)
    p.drawString(220, y - 45, created_date.strftime('%m/%d/%Y'))
    
    p.line(340, y - 50, 550, y - 50)
    p.setFont("Helvetica", 8)
    p.drawString(340, y - 60, "Printed Name")
    p.setFont("Helvetica", 10)
    p.drawString(340, y - 45, scope.get('typed_name', ''))
    
    y -= 80
    
    # Agent Signature
    p.setFont("Helvetica-Bold", 10)
    p.drawString(40, y, "Licensed Sales Representative:")
    y -= 5
    
    # Draw agent signature if exists
    if scope.get("agent_signature"):
        try:
            sig_data = scope["agent_signature"]
            if sig_data.startswith("data:"):
                sig_data = sig_data.split(",")[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = ImageReader(BytesIO(sig_bytes))
            p.drawImage(sig_image, 40, y - 45, width=140, height=40, preserveAspectRatio=True)
        except Exception as e:
            logger.error(f"Error drawing agent signature: {e}")
    
    p.line(40, y - 50, 200, y - 50)
    p.setFont("Helvetica", 8)
    p.drawString(40, y - 60, "Signature")
    
    p.line(220, y - 50, 320, y - 50)
    p.drawString(220, y - 60, "Date")
    p.setFont("Helvetica", 10)
    p.drawString(220, y - 45, created_date.strftime('%m/%d/%Y'))
    
    p.line(340, y - 50, 550, y - 50)
    p.setFont("Helvetica", 8)
    p.drawString(340, y - 60, "Printed Name")
    p.setFont("Helvetica", 10)
    p.drawString(340, y - 45, scope.get('agent_typed_name', agent_name))
    
    # Footer
    p.setFont("Helvetica", 8)
    p.setFillColor(colors.HexColor("#64748B"))
    p.drawCentredString(width/2, 30, f"AgentRoute AI - Document ID: {scope_id} - This document is valid for the appointment date listed")
    
    p.save()
    buffer.seek(0)
    pdf_base64 = base64.b64encode(buffer.read()).decode()
    
    return {
        "pdf_base64": pdf_base64, 
        "filename": f"SOA_{lead_name.replace(' ', '_')}_{created_date.strftime('%Y%m%d')}.pdf"
    }

@api_router.get("/scope/{scope_id}/pdf")
async def get_scope_pdf(scope_id: str, current_user: dict = Depends(get_current_user)):
    """Get or regenerate PDF for a scope document"""
    scope = await db.scope_forms.find_one({"id": scope_id})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    # If PDF is already stored, return it
    if scope.get("pdf_base64"):
        lead = await db.leads.find_one({"id": scope["lead_id"]})
        lead_name = lead.get("name", "Unknown") if lead else "Unknown"
        created_date = scope.get("created_date", datetime.utcnow())
        if isinstance(created_date, str):
            created_date = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
        return {
            "pdf_base64": scope["pdf_base64"],
            "filename": f"SOA_{lead_name.replace(' ', '_')}_{created_date.strftime('%Y%m%d')}.pdf"
        }
    
    # Otherwise, generate it
    lead = await db.leads.find_one({"id": scope["lead_id"]})
    agent = await db.users.find_one({"id": scope.get("created_by_user")})
    
    pdf_data = await generate_scope_pdf(scope, lead, agent)
    
    # Store the generated PDF
    await db.scope_forms.update_one(
        {"id": scope_id},
        {"$set": {"pdf_base64": pdf_data["pdf_base64"]}}
    )
    
    return pdf_data

# ==================== SOA DELIVERY LOGGING ====================

@api_router.post("/scope/{scope_id}/log-delivery")
async def log_scope_delivery(scope_id: str, delivery_data: ScopeDeliveryLog, current_user: dict = Depends(get_current_user)):
    """Log when an SOA document is shared/sent to a client"""
    scope = await db.scope_forms.find_one({"id": scope_id})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    # Create delivery log entry
    delivery_entry = {
        "id": str(uuid.uuid4()),
        "scope_id": scope_id,
        "lead_id": scope.get("lead_id"),
        "delivery_method": delivery_data.delivery_method,
        "recipient_contact": delivery_data.recipient_contact,
        "notes": delivery_data.notes,
        "delivered_at": datetime.utcnow(),
        "delivered_by_user": current_user["id"]
    }
    
    # Update scope document with delivery history
    await db.scope_forms.update_one(
        {"id": scope_id},
        {"$push": {"delivery_history": delivery_entry}}
    )
    
    # Log activity
    await log_activity(
        current_user["id"],
        "scope_delivered",
        f"SOA sent via {delivery_data.delivery_method}",
        scope.get("lead_id")
    )
    
    return ScopeDeliveryResponse(
        id=delivery_entry["id"],
        scope_id=scope_id,
        lead_id=scope.get("lead_id", ""),
        delivery_method=delivery_data.delivery_method,
        recipient_contact=delivery_data.recipient_contact,
        notes=delivery_data.notes,
        delivered_at=delivery_entry["delivered_at"],
        delivered_by_user=current_user["id"]
    )

@api_router.get("/scope/{scope_id}/delivery-history")
async def get_scope_delivery_history(scope_id: str, current_user: dict = Depends(get_current_user)):
    """Get delivery history for an SOA document"""
    scope = await db.scope_forms.find_one({"id": scope_id})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    return {
        "scope_id": scope_id,
        "delivery_history": scope.get("delivery_history", [])
    }

# ==================== AI ASSISTANT ROUTES ====================

@api_router.post("/ai/chat")
async def ai_chat(request: dict, current_user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI not configured")
        
        message = request.get("message", "")
        lead_id = request.get("lead_id")
        
        context = ""
        if lead_id:
            lead = await db.leads.find_one({"id": lead_id})
            if lead:
                context = f"\nLead: {lead['name']}, Stage: {lead.get('stage')}, Notes: {lead.get('notes', 'None')}"
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"chat_{current_user['id']}",
            system_message=f"You are an expert Medicare insurance sales coach. Be concise and actionable.{context}"
        ).with_model("openai", "gpt-4.1")
        
        response = await chat.send_message(UserMessage(text=message))
        return {"response": response, "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        logger.error(f"AI error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ai/follow-up")
async def generate_follow_up(request: dict, current_user: dict = Depends(get_current_user)):
    """Generate AI follow-up message based on appointment outcome"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI not configured")
        
        lead_id = request.get("lead_id")
        outcome = request.get("outcome", "")
        message_type = request.get("type", "email")  # email, text, call
        
        lead = await db.leads.find_one({"id": lead_id})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"followup_{lead_id}",
            system_message="Generate professional insurance sales follow-up messages. Be personable but concise."
        ).with_model("openai", "gpt-4.1")
        
        prompt = f"Generate a {message_type} follow-up for {lead['name']} after this meeting outcome: {outcome}"
        response = await chat.send_message(UserMessage(text=prompt))
        
        return {"message": response, "type": message_type, "lead_name": lead["name"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ai/appointment-prep/{lead_id}")
async def get_appointment_prep(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get AI-powered appointment preparation summary"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        
        lead = await db.leads.find_one({"id": lead_id})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        appointments = await db.appointments.find({"lead_id": lead_id}).to_list(10)
        scopes = await db.scope_forms.find({"lead_id": lead_id}).to_list(10)
        
        if not api_key:
            return {
                "lead_name": lead["name"],
                "summary": f"Meeting with {lead['name']}",
                "talking_points": ["Review Medicare options", "Discuss coverage needs", "Present plan comparisons"],
                "documents_needed": ["Scope of Appointment"] if not scopes else ["Plan materials"],
                "notes": lead.get("notes", "No previous notes")
            }
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"prep_{lead_id}",
            system_message="Provide brief, actionable appointment prep. Return JSON."
        ).with_model("openai", "gpt-4.1")
        
        prompt = f"""Prepare for meeting with:
Name: {lead['name']}
Notes: {lead.get('notes', 'None')}
Stage: {lead.get('stage', 'new')}
Previous appointments: {len(appointments)}
Has Scope: {len(scopes) > 0}

Return JSON: {{"talking_points": [...], "documents_needed": [...], "focus_areas": [...]}}"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        import json
        try:
            if "{" in response:
                data = json.loads(response[response.find("{"):response.rfind("}")+1])
            else:
                data = {}
        except:
            data = {}
        
        return {
            "lead_name": lead["name"],
            "summary": f"Meeting with {lead['name']} - {lead.get('stage', 'new').replace('_', ' ').title()}",
            "talking_points": data.get("talking_points", ["Review Medicare options", "Discuss needs"]),
            "documents_needed": data.get("documents_needed", ["Scope of Appointment"] if not scopes else []),
            "focus_areas": data.get("focus_areas", []),
            "notes": lead.get("notes", "")
        }
    except Exception as e:
        logger.error(f"Prep error: {e}")
        return {"lead_name": "", "summary": "Error loading prep", "talking_points": [], "documents_needed": [], "notes": ""}

@api_router.get("/ai/chat-history")
async def get_chat_history(current_user: dict = Depends(get_current_user)):
    messages = await db.chat_history.find({"user_id": current_user["id"]}).sort("timestamp", -1).limit(50).to_list(50)
    # Convert ObjectId to string for JSON serialization
    for msg in messages:
        if "_id" in msg:
            msg["_id"] = str(msg["_id"])
    return list(reversed(messages))

# ==================== OCR/SCANNER ROUTES ====================

@api_router.post("/ocr/scan")
async def scan_document(request: dict, current_user: dict = Depends(get_current_user)):
    """
    Scan a business card image and extract contact information.
    Returns: name, phone, email, company, address, job_title
    """
    import tempfile
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OCR not configured - EMERGENT_LLM_KEY not set")
        
        image_base64 = request.get("image_base64", "")
        if not image_base64:
            raise HTTPException(status_code=400, detail="No image provided")
        
        # Strip data URL prefix if present and detect mime type
        mime_type = "image/jpeg"
        if image_base64.startswith("data:"):
            parts = image_base64.split(",")
            if len(parts) == 2:
                header = parts[0]
                image_base64 = parts[1]
                if "image/png" in header:
                    mime_type = "image/png"
                elif "image/webp" in header:
                    mime_type = "image/webp"
        
        # Determine file extension
        ext = ".jpg"
        if mime_type == "image/png":
            ext = ".png"
        elif mime_type == "image/webp":
            ext = ".webp"
        
        # Write image to temporary file (Gemini requires file path)
        import base64
        image_bytes = base64.b64decode(image_base64)
        
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp_file:
            tmp_file.write(image_bytes)
            tmp_path = tmp_file.name
        
        try:
            # Enhanced system prompt for comprehensive business card extraction
            system_prompt = """You are an expert OCR system specialized in extracting contact information from business cards.

Extract ALL available information from the business card image and return ONLY a valid JSON object with these fields:
{
  "name": "Full name of the person (first and last name)",
  "phone": "Primary phone number (include country code if visible)",
  "email": "Email address",
  "company": "Company or organization name",
  "job_title": "Job title or position",
  "address": "Full business address (street, city, state, zip)",
  "website": "Website URL if present",
  "mobile": "Mobile/cell phone if different from main phone"
}

Rules:
- Return ONLY the JSON object, no other text or markdown
- Use empty string "" for fields not found on the card
- Clean up phone numbers to a consistent format
- Preserve the exact email address
- For addresses, include all parts visible (street, suite, city, state, zip)
"""
            
            chat = LlmChat(
                api_key=api_key,
                session_id=f"ocr_{uuid.uuid4().hex[:8]}",
                system_message=system_prompt
            ).with_model("gemini", "gemini-2.0-flash")
            
            # Use FileContentWithMimeType for Gemini (uses file path)
            file_content = FileContentWithMimeType(
                file_path=tmp_path,
                mime_type=mime_type
            )
            
            # Send message with image
            response = await chat.send_message(UserMessage(
                text="Extract all contact information from this business card image. Return only JSON, no markdown.",
                file_contents=[file_content]
            ))
            
            logger.info(f"OCR raw response: {response[:500] if response else 'empty'}")
            
            import json
            extracted = {}
            try:
                # Remove any markdown formatting
                clean_response = response.strip()
                if clean_response.startswith("```"):
                    lines = clean_response.split("\n")
                    clean_lines = [l for l in lines if not l.startswith("```")]
                    clean_response = "\n".join(clean_lines).strip()
                
                # Find JSON in response
                if "{" in clean_response and "}" in clean_response:
                    json_start = clean_response.find("{")
                    json_end = clean_response.rfind("}") + 1
                    json_str = clean_response[json_start:json_end]
                    extracted = json.loads(json_str)
            except json.JSONDecodeError as je:
                logger.error(f"JSON parse error: {je}, response: {response[:200]}")
                extracted = {}
            
            # Normalize and clean the extracted data
            result = {
                "name": (extracted.get("name") or "").strip(),
                "phone": (extracted.get("phone") or extracted.get("mobile") or "").strip(),
                "email": (extracted.get("email") or "").strip().lower() if extracted.get("email") else "",
                "company": (extracted.get("company") or "").strip(),
                "job_title": (extracted.get("job_title") or "").strip(),
                "address": (extracted.get("address") or "").strip(),
                "website": (extracted.get("website") or "").strip(),
                "raw_text": response
            }
            
            logger.info(f"OCR extracted: name={result['name']}, company={result['company']}, email={result['email']}")
            return result
            
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

# ==================== ROUTING ROUTES ====================

@api_router.post("/routes/daily")
async def get_daily_route(request: dict, current_user: dict = Depends(get_current_user)):
    date = request.get("date")
    start_lat = request.get("start_lat")
    start_lng = request.get("start_lng")
    
    appointments = await db.appointments.find({
        "created_by_user": current_user["id"],
        "appointment_date": date,
        "status": "scheduled"
    }).to_list(100)
    
    stops = []
    for apt in appointments:
        lead = await db.leads.find_one({"id": apt["lead_id"]})
        if lead:
            geocode = await db.lead_geocodes.find_one({"lead_id": lead["id"]})
            scopes = await db.scope_forms.count_documents({"lead_id": lead["id"]})
            
            stops.append({
                "lead_id": lead["id"],
                "lead_name": lead["name"],
                "address": lead.get("address", ""),
                "appointment_id": apt["id"],
                "appointment_time": apt["appointment_time"],
                "latitude": geocode["latitude"] if geocode else None,
                "longitude": geocode["longitude"] if geocode else None,
                "order": 0,
                "documents_needed": [] if scopes > 0 else ["Scope of Appointment"],
                "notes": lead.get("notes", "")
            })
    
    # Simple nearest neighbor optimization
    if stops and start_lat and start_lng:
        ordered = []
        unvisited = [s for s in stops if s.get("latitude")]
        no_coords = [s for s in stops if not s.get("latitude")]
        
        current = (start_lat, start_lng)
        while unvisited:
            nearest = min(unvisited, key=lambda s: math.sqrt((s["latitude"]-current[0])**2 + (s["longitude"]-current[1])**2))
            unvisited.remove(nearest)
            ordered.append(nearest)
            current = (nearest["latitude"], nearest["longitude"])
        
        stops = ordered + no_coords
    
    for i, stop in enumerate(stops):
        stop["order"] = i + 1
    
    # Calculate distance
    total_distance = 0
    for i in range(len(stops) - 1):
        if stops[i].get("latitude") and stops[i+1].get("latitude"):
            lat1, lon1 = math.radians(stops[i]["latitude"]), math.radians(stops[i]["longitude"])
            lat2, lon2 = math.radians(stops[i+1]["latitude"]), math.radians(stops[i+1]["longitude"])
            dlat, dlon = lat2 - lat1, lon2 - lon1
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            total_distance += 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return {
        "date": date,
        "stops": stops,
        "total_distance_km": round(total_distance, 2),
        "estimated_duration_mins": int((total_distance / 50) * 60 + len(stops) * 30),
        "optimized": any(s.get("latitude") for s in stops)
    }

@api_router.post("/routes/geocode")
async def geocode_lead(request: dict, current_user: dict = Depends(get_current_user)):
    lead_id = request.get("lead_id")
    lead = await db.leads.find_one({"id": lead_id})
    if not lead or not lead.get("address"):
        raise HTTPException(status_code=400, detail="Lead or address not found")
    
    result = await geocode_address(lead_id, lead["address"])
    return {"success": result is not None, **(result or {})}

@api_router.get("/routes/leads-with-coordinates")
async def get_leads_with_coords(current_user: dict = Depends(get_current_user)):
    leads = await db.leads.find({"created_by_user": current_user["id"]}).to_list(1000)
    result = []
    for lead in leads:
        geocode = await db.lead_geocodes.find_one({"lead_id": lead["id"]})
        result.append({
            "id": lead["id"],
            "name": lead["name"],
            "address": lead.get("address", ""),
            "latitude": geocode["latitude"] if geocode else None,
            "longitude": geocode["longitude"] if geocode else None,
            "has_coordinates": geocode is not None
        })
    return result

# ==================== ADMIN/MANAGER COMMAND CENTER ====================

@api_router.get("/team/agents")
async def get_team_agents(current_user: dict = Depends(require_manager_or_admin)):
    """Get all agents for Admin/Manager Command Center"""
    if current_user.get("role") == "admin":
        query = {"role": {"$in": ["agent", "manager"]}, "deleted_at": None}
    else:
        query = {"manager_id": current_user["id"], "deleted_at": None}
    
    users = await db.users.find(query).to_list(1000)
    
    result = []
    for user in users:
        leads = await db.leads.count_documents({"created_by_user": user["id"]})
        apt_scheduled = await db.appointments.count_documents({"created_by_user": user["id"], "status": "scheduled"})
        apt_completed = await db.appointments.count_documents({"created_by_user": user["id"], "status": "completed"})
        apps_submitted = await db.leads.count_documents({"created_by_user": user["id"], "stage": "application_submitted"})
        policies_issued = await db.leads.count_documents({"created_by_user": user["id"], "stage": "policy_issued"})
        
        prod_stats = await db.production.aggregate([
            {"$match": {"created_by_user": user["id"]}},
            {"$group": {"_id": None, "premium": {"$sum": "$premium"}, "commission": {"$sum": "$agent_commission"}}}
        ]).to_list(1)
        prod = prod_stats[0] if prod_stats else {"premium": 0, "commission": 0}
        
        # Calculate grade
        grade = calculate_agent_grade({
            "leads_contacted": leads,
            "appointments_set": apt_scheduled + apt_completed,
            "appointments_completed": apt_completed,
            "close_rate": policies_issued / max(leads, 1),
            "follow_up_rate": 0.8
        })
        
        result.append(AgentStats(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            role=user.get("role", "agent"),
            leads_count=leads,
            appointments_scheduled=apt_scheduled,
            appointments_completed=apt_completed,
            applications_submitted=apps_submitted,
            policies_issued=policies_issued,
            total_premium=prod.get("premium", 0),
            total_commission=prod.get("commission", 0),
            last_login=user.get("last_login"),
            is_active=user.get("is_active", True),
            scorecard_grade=grade
        ))
    
    return result

@api_router.get("/team/agents/{agent_id}/details")
async def get_agent_details(agent_id: str, current_user: dict = Depends(require_manager_or_admin)):
    """Get full agent details for Command Center"""
    agent = await db.users.find_one({"id": agent_id, "deleted_at": None})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Verify access
    if current_user.get("role") != "admin" and agent.get("manager_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    leads = await db.leads.find({"created_by_user": agent_id}).to_list(1000)
    appointments = await db.appointments.find({"created_by_user": agent_id}).to_list(1000)
    scopes = await db.scope_forms.find({"created_by_user": agent_id}).to_list(1000)
    production = await db.production.find({"created_by_user": agent_id}).to_list(1000)
    activities = await db.activity_logs.find({"user_id": agent_id}).sort("created_at", -1).limit(50).to_list(50)
    tasks = await db.tasks.find({"created_by_user": agent_id}).to_list(100)
    
    overdue_tasks = [t for t in tasks if t["status"] == "pending" and t["due_date"] < datetime.utcnow().strftime("%Y-%m-%d")]
    
    return {
        "agent": {
            "id": agent["id"],
            "name": agent["name"],
            "email": agent["email"],
            "phone": agent.get("phone"),
            "role": agent.get("role"),
            "territory": agent.get("territory"),
            "commission_rate": agent.get("commission_rate", 0.6),
            "last_login": agent.get("last_login"),
            "created_at": agent["created_at"]
        },
        "leads": leads,
        "appointments": appointments,
        "scopes": scopes,
        "production": production,
        "activities": activities,
        "tasks": tasks,
        "summary": {
            "total_leads": len(leads),
            "leads_by_stage": {stage.value: len([l for l in leads if l.get("stage") == stage.value]) for stage in LeadStage},
            "total_appointments": len(appointments),
            "appointments_completed": len([a for a in appointments if a.get("status") == "completed"]),
            "total_scopes": len(scopes),
            "total_production": sum(p.get("premium", 0) for p in production),
            "total_commission": sum(p.get("agent_commission", 0) for p in production),
            "overdue_tasks": len(overdue_tasks),
            "pending_follow_ups": len([t for t in tasks if t["status"] == "pending"])
        }
    }

@api_router.get("/team/snapshot")
async def get_team_snapshot(current_user: dict = Depends(require_manager_or_admin)):
    """Get team snapshot for quick overview"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    
    total_agents = await db.users.count_documents({"id": {"$in": user_ids}, "role": "agent", "deleted_at": None})
    active_today = await db.users.count_documents({"id": {"$in": user_ids}, "last_login": {"$gte": today}, "deleted_at": None})
    
    # Agents needing coaching (no login in 3 days or low activity)
    three_days_ago = today - timedelta(days=3)
    needs_coaching = await db.users.count_documents({
        "id": {"$in": user_ids},
        "role": "agent",
        "$or": [{"last_login": {"$lt": three_days_ago}}, {"last_login": None}],
        "deleted_at": None
    })
    
    # Overdue leads
    overdue = await db.tasks.count_documents({
        "created_by_user": {"$in": user_ids},
        "status": "pending",
        "due_date": {"$lt": today.strftime("%Y-%m-%d")}
    })
    
    # Top producers (this month)
    month_start = today.replace(day=1)
    top_producers_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "created_date": {"$gte": month_start}}},
        {"$group": {"_id": "$created_by_user", "total": {"$sum": "$premium"}}},
        {"$sort": {"total": -1}},
        {"$limit": 5}
    ]
    top_prod = await db.production.aggregate(top_producers_pipeline).to_list(5)
    
    top_producers = []
    for p in top_prod:
        user = await db.users.find_one({"id": p["_id"]})
        if user:
            top_producers.append({"id": user["id"], "name": user["name"], "total": p["total"]})
    
    return TeamSnapshot(
        total_agents=total_agents,
        active_today=active_today,
        needs_coaching=needs_coaching,
        overdue_leads=overdue,
        top_producers=top_producers
    )

@api_router.get("/team/leaderboard")
async def get_leaderboard(period: str = "month", current_user: dict = Depends(require_manager_or_admin)):
    """Get team leaderboard"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    now = datetime.utcnow()
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=now.weekday())
    else:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Production leaderboard
    prod_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "created_date": {"$gte": start}}},
        {"$group": {"_id": "$created_by_user", "premium": {"$sum": "$premium"}, "commission": {"$sum": "$agent_commission"}, "policies": {"$sum": 1}}},
        {"$sort": {"premium": -1}}
    ]
    production = await db.production.aggregate(prod_pipeline).to_list(100)
    
    # Appointments leaderboard
    apt_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "created_date": {"$gte": start}}},
        {"$group": {"_id": "$created_by_user", "total": {"$sum": 1}, "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}}}},
        {"$sort": {"completed": -1}}
    ]
    appointments = await db.appointments.aggregate(apt_pipeline).to_list(100)
    
    # Build response
    leaderboard = []
    for i, p in enumerate(production):
        user = await db.users.find_one({"id": p["_id"]})
        if user:
            apt_data = next((a for a in appointments if a["_id"] == p["_id"]), {"total": 0, "completed": 0})
            leaderboard.append({
                "rank": i + 1,
                "id": user["id"],
                "name": user["name"],
                "premium": p["premium"],
                "commission": p["commission"],
                "policies": p["policies"],
                "appointments_set": apt_data["total"],
                "appointments_completed": apt_data["completed"]
            })
    
    return {"period": period, "leaderboard": leaderboard}

@api_router.post("/team/leads/assign")
async def assign_lead(request: dict, current_user: dict = Depends(require_manager_or_admin)):
    """Assign or reassign lead to agent"""
    lead_id = request.get("lead_id")
    agent_id = request.get("agent_id")
    
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    agent = await db.users.find_one({"id": agent_id, "deleted_at": None})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    await db.leads.update_one({"id": lead_id}, {"$set": {"assigned_to_user": agent_id}})
    await log_activity(current_user["id"], "lead_assigned", f"Lead assigned to {agent['name']}", lead_id)
    
    return {"message": "Lead assigned", "agent_name": agent["name"]}

@api_router.post("/team/leads/distribute")
async def distribute_leads(request: dict, current_user: dict = Depends(require_manager_or_admin)):
    """Auto-distribute leads among agents"""
    lead_ids = request.get("lead_ids", [])
    agent_ids = request.get("agent_ids", [])
    
    if not lead_ids or not agent_ids:
        raise HTTPException(status_code=400, detail="Provide lead_ids and agent_ids")
    
    assigned = 0
    for i, lead_id in enumerate(lead_ids):
        agent_id = agent_ids[i % len(agent_ids)]  # Round-robin
        await db.leads.update_one({"id": lead_id}, {"$set": {"assigned_to_user": agent_id}})
        assigned += 1
    
    return {"message": f"Distributed {assigned} leads among {len(agent_ids)} agents"}

@api_router.get("/team/coaching-alerts")
async def get_coaching_alerts(current_user: dict = Depends(require_manager_or_admin)):
    """Get agents needing coaching attention"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    today = datetime.utcnow()
    alerts = []
    
    agents = await db.users.find({"id": {"$in": user_ids}, "role": "agent", "deleted_at": None}).to_list(1000)
    
    for agent in agents:
        agent_alerts = []
        
        # No login in 3+ days
        if agent.get("last_login"):
            days_since_login = (today - agent["last_login"]).days
            if days_since_login >= 3:
                agent_alerts.append({"type": "inactive", "message": f"No login in {days_since_login} days"})
        
        # Low activity (no leads created this week)
        week_start = today - timedelta(days=today.weekday())
        recent_leads = await db.leads.count_documents({"created_by_user": agent["id"], "created_date": {"$gte": week_start}})
        if recent_leads == 0:
            agent_alerts.append({"type": "low_activity", "message": "No leads created this week"})
        
        # Overdue follow-ups
        overdue = await db.tasks.count_documents({
            "created_by_user": agent["id"],
            "status": "pending",
            "due_date": {"$lt": today.strftime("%Y-%m-%d")}
        })
        if overdue > 0:
            agent_alerts.append({"type": "overdue", "message": f"{overdue} overdue follow-ups"})
        
        # Stalled pipeline (applications in underwriting > 14 days)
        stalled = await db.leads.count_documents({
            "created_by_user": agent["id"],
            "underwriting_status": "pending_review"
        })
        if stalled > 0:
            agent_alerts.append({"type": "stalled", "message": f"{stalled} stalled applications"})
        
        if agent_alerts:
            alerts.append({
                "agent_id": agent["id"],
                "agent_name": agent["name"],
                "alerts": agent_alerts
            })
    
    return alerts

# ==================== SUBSCRIPTION ROUTES ====================

@api_router.get("/subscription/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    status = current_user.get("subscription_status", "trial")
    created_at = current_user.get("created_at", datetime.utcnow())
    trial_expires = created_at + timedelta(days=30)
    
    if status == "trial" and datetime.utcnow() > trial_expires:
        status = "expired"
    
    return {
        "status": status,
        "plan": "monthly" if status == "active" else "trial",
        "expires_at": trial_expires.isoformat() if status == "trial" else None,
        "is_trial": status == "trial"
    }

@api_router.post("/subscription/subscribe")
async def subscribe(current_user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"subscription_status": "active"}})
    logger.info(f"MOCK SUBSCRIPTION: {current_user['email']} subscribed")
    return {"message": "Subscription activated (mock)", "status": "active"}

# ==================== TRAINING RESOURCES ====================

@api_router.get("/training")
async def get_training_resources(current_user: dict = Depends(get_current_user)):
    resources = await db.training_resources.find({}).to_list(1000)
    return resources

@api_router.post("/training")
async def create_training_resource(request: dict, current_user: dict = Depends(require_admin)):
    resource = {
        "id": str(uuid.uuid4()),
        "title": request.get("title"),
        "description": request.get("description", ""),
        "resource_type": request.get("resource_type", "document"),
        "url": request.get("url"),
        "content": request.get("content"),
        "category": request.get("category", "general"),
        "created_date": datetime.utcnow(),
        "created_by": current_user["id"]
    }
    await db.training_resources.insert_one(resource)
    return resource

# ==================== LEGAL/COMPLIANCE ====================

@api_router.get("/legal/privacy-policy")
async def get_privacy_policy():
    return {
        "title": "Privacy Policy",
        "last_updated": "2024-01-01",
        "content": """# AgentRoute AI Privacy Policy

## Information We Collect
- Personal information (name, email, phone)
- Lead and customer data you enter
- Location data (for routing, with permission)
- Usage analytics

## How We Use Data
- Provide app functionality
- Power AI features
- Send notifications and reminders

## Data Storage
- Encrypted database storage
- Passwords are hashed (never stored in plain text)
- We never sell your data

## Your Rights
- Access and export your data
- Delete your account
- Opt out of communications

Contact: privacy@agentroute.ai"""
    }

@api_router.get("/legal/terms")
async def get_terms():
    return {
        "title": "Terms of Service",
        "last_updated": "2024-01-01",
        "content": """# Terms of Service

By using AgentRoute AI, you agree to these terms.

## Service
AgentRoute AI provides sales productivity tools for insurance agents.

## User Responsibilities
- Maintain account security
- Comply with insurance regulations
- Provide accurate information

## Subscription
- 30-day free trial
- $30/month after trial
- Cancel anytime

## Disclaimers
This app is a productivity tool and does not provide insurance advice.

Contact: support@agentroute.ai"""
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "AgentRoute AI - Insurance Agency Platform", "version": "3.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include router and CORS
app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
