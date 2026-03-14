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
    # Pipeline stages for Policy Sales (Updated for Smart Lead Distribution)
    NEW = "new"  # Just created/uploaded
    CONTACTED = "contacted"  # First contact made
    FOLLOW_UP = "follow_up"  # Needs follow-up
    APPOINTMENT_SET = "appointment_set"  # Appointment scheduled
    SOA_COMPLETED = "soa_completed"  # Scope of Appointment signed
    POLICY_SUBMITTED = "policy_submitted"  # Application submitted
    CLOSED_WON = "closed_won"  # Policy issued/placed
    CLOSED_LOST = "closed_lost"  # Lost opportunity
    # Legacy stages (kept for backwards compatibility)
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

class AssignmentMethod(str, Enum):
    MANUAL = "manual"
    ROUND_ROBIN = "round_robin"
    TERRITORY = "territory"
    WORKLOAD = "workload"
    MANAGER_GROUP = "manager_group"

class ComplianceStatus(str, Enum):
    MISSING_SOA = "missing_soa"
    PENDING_SIGNATURE = "pending_signature"
    SIGNED = "signed"
    COMPLIANT = "compliant"
    NON_COMPLIANT = "non_compliant"

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

# Commission Status Enum
class CommissionStatus(str, Enum):
    ESTIMATED = "estimated"
    PENDING = "pending"
    APPROVED = "approved"
    PAID = "paid"

# Commission Tracking Models
class CommissionRecordCreate(BaseModel):
    lead_id: Optional[str] = None
    production_id: Optional[str] = None
    policy_type: str
    carrier: str
    premium: float
    estimated_commission: float
    commission_status: str = "estimated"
    notes: Optional[str] = ""

class CommissionRecordUpdate(BaseModel):
    commission_status: Optional[str] = None
    paid_amount: Optional[float] = None
    payment_date: Optional[str] = None  # ISO date string
    notes: Optional[str] = None

class CommissionRecordResponse(BaseModel):
    id: str
    lead_id: Optional[str]
    lead_name: Optional[str]
    production_id: Optional[str]
    policy_type: str
    carrier: str
    premium: float
    estimated_commission: float
    agent_commission: float
    manager_override: float
    agency_share: float
    paid_amount: Optional[float]
    commission_status: str
    payment_date: Optional[datetime]
    created_by_user: str
    agent_name: Optional[str]
    created_date: datetime
    notes: str

class CommissionSummary(BaseModel):
    total_estimated: float
    total_pending: float
    total_approved: float
    total_paid: float
    records_count: int
    by_status: Dict[str, int]
    by_carrier: Dict[str, float]
    by_policy_type: Dict[str, float]

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

# ==================== TERRITORY MODELS ====================

class TerritoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    geographic_type: str = "zip_codes"  # zip_codes, cities, counties, states, custom
    zip_codes: Optional[List[str]] = []
    cities: Optional[List[str]] = []
    counties: Optional[List[str]] = []
    states: Optional[List[str]] = []
    custom_areas: Optional[List[str]] = []  # For custom service areas
    assigned_agents: Optional[List[str]] = []  # Agent IDs

class TerritoryResponse(BaseModel):
    id: str
    name: str
    description: str
    geographic_type: str
    zip_codes: List[str]
    cities: List[str]
    counties: List[str]
    states: List[str]
    custom_areas: List[str]
    assigned_agents: List[str]
    agent_names: List[str]
    lead_count: int
    created_by: str
    created_date: datetime

class TerritoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    geographic_type: Optional[str] = None
    zip_codes: Optional[List[str]] = None
    cities: Optional[List[str]] = None
    counties: Optional[List[str]] = None
    states: Optional[List[str]] = None
    custom_areas: Optional[List[str]] = None
    assigned_agents: Optional[List[str]] = None

class LeadAssignment(BaseModel):
    lead_id: str
    agent_id: str
    notes: Optional[str] = None

class BulkLeadAssignment(BaseModel):
    lead_ids: List[str]
    agent_id: str

class LeadDistributionRequest(BaseModel):
    lead_ids: List[str]
    agent_ids: List[str]
    method: str = "round_robin"  # round_robin, territory_based, workload_balanced

class BulkLeadUpload(BaseModel):
    leads: List[Dict[str, Any]]
    auto_assign: bool = False
    territory_based: bool = False

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

@api_router.get("/appointments/{apt_id}")
async def get_appointment(apt_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single appointment by ID"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    apt = await db.appointments.find_one({"id": apt_id, "created_by_user": {"$in": user_ids}})
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    return AppointmentResponse(
        id=apt["id"], 
        lead_id=apt["lead_id"], 
        appointment_date=apt["appointment_date"],
        appointment_time=apt["appointment_time"], 
        notes=apt.get("notes", ""),
        status=apt.get("status", "scheduled"), 
        appointment_type=apt.get("appointment_type", "in_person"),
        created_by_user=apt["created_by_user"],
        created_date=apt.get("created_date"),
        outcome=apt.get("outcome"),
        follow_up_notes=apt.get("follow_up_notes")
    )

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
    """Generate professional PDF for Scope of Appointment matching official CMS document style"""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from io import BytesIO
    import base64
    
    lead_name = lead.get("name", "Unknown") if lead else "Unknown"
    agent_name = agent.get("name", "Unknown") if agent else "Unknown"
    scope_id = scope.get("id", "")
    form_fields = scope.get("form_fields", {})
    
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    # Colors
    primary_blue = colors.HexColor("#1E40AF")
    light_blue = colors.HexColor("#DBEAFE")
    dark_gray = colors.HexColor("#1F2937")
    medium_gray = colors.HexColor("#64748B")
    light_gray = colors.HexColor("#F1F5F9")
    
    # Header with professional title
    p.setFillColor(light_blue)
    p.rect(0, height - 80, width, 80, stroke=0, fill=1)
    
    p.setFillColor(primary_blue)
    p.setFont("Helvetica-Bold", 20)
    p.drawCentredString(width/2, height - 35, "SCOPE OF APPOINTMENT")
    
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    p.drawCentredString(width/2, height - 52, "Medicare Sales Appointment Confirmation")
    
    p.setFont("Helvetica", 8)
    p.setFillColor(medium_gray)
    created_date = scope.get("created_date", datetime.utcnow())
    if isinstance(created_date, str):
        created_date = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
    p.drawString(40, height - 72, f"Document ID: {scope_id[:12].upper()}")
    p.drawRightString(width - 40, height - 72, f"Generated: {created_date.strftime('%B %d, %Y')}")
    
    y = height - 100
    
    # Section function for consistent styling
    def draw_section_header(title, y_pos):
        p.setFillColor(primary_blue)
        p.setFont("Helvetica-Bold", 11)
        p.drawString(40, y_pos, title)
        y_pos -= 3
        p.setStrokeColor(primary_blue)
        p.setLineWidth(0.5)
        p.line(40, y_pos, width - 40, y_pos)
        return y_pos - 15
    
    def draw_field(label, value, y_pos, x=40, label_width=120):
        p.setFillColor(medium_gray)
        p.setFont("Helvetica", 9)
        p.drawString(x, y_pos, f"{label}:")
        p.setFillColor(dark_gray)
        p.setFont("Helvetica", 10)
        p.drawString(x + label_width, y_pos, str(value) if value else "N/A")
        return y_pos - 16
    
    # Section 1: Beneficiary Information
    y = draw_section_header("SECTION 1: BENEFICIARY/AUTHORIZED REPRESENTATIVE", y)
    
    beneficiary_name = form_fields.get('beneficiary_name', lead_name)
    y = draw_field("Beneficiary Name", beneficiary_name, y)
    y = draw_field("Phone", form_fields.get('beneficiary_phone', lead.get('phone', '') if lead else ''), y)
    y = draw_field("Address", form_fields.get('beneficiary_address', lead.get('address', '') if lead else ''), y)
    
    if form_fields.get('auth_rep_name'):
        y = draw_field("Authorized Rep", form_fields.get('auth_rep_name', ''), y)
        y = draw_field("Relationship", form_fields.get('auth_rep_relationship', ''), y)
    
    y -= 10
    
    # Section 2: Licensed Sales Representative
    y = draw_section_header("SECTION 2: LICENSED SALES REPRESENTATIVE", y)
    
    y = draw_field("Agent Name", form_fields.get('agent_name', agent_name), y)
    y = draw_field("License Number", form_fields.get('agent_license', ''), y)
    
    # Two columns for agent info
    p.setFillColor(medium_gray)
    p.setFont("Helvetica", 9)
    p.drawString(40, y, "Phone:")
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    p.drawString(160, y, form_fields.get('agent_phone', '') or "N/A")
    
    p.setFillColor(medium_gray)
    p.setFont("Helvetica", 9)
    p.drawString(300, y, "Agent ID/NPN:")
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    p.drawString(400, y, form_fields.get('agent_id_number', '') or "N/A")
    y -= 25
    
    # Section 3: Method of Contact
    y = draw_section_header("SECTION 3: INITIAL METHOD OF CONTACT", y)
    
    contact_method = form_fields.get('initial_contact_method', 'phone')
    contact_labels = {
        'phone': 'Phone Call',
        'in_person': 'In Person',
        'email': 'Email',
        'mail': 'Direct Mail',
        'referral': 'Referral',
        'other': 'Other'
    }
    y = draw_field("Contact Method", contact_labels.get(contact_method, contact_method), y)
    y -= 5
    
    # Section 4: Products to be Discussed
    y = draw_section_header("SECTION 4: PRODUCTS TO BE DISCUSSED", y)
    
    p.setFillColor(medium_gray)
    p.setFont("Helvetica-Oblique", 9)
    p.drawString(40, y, "The beneficiary has requested information about the following product type(s):")
    y -= 18
    
    # Product checkboxes
    products = [
        ("medicare_advantage", "Medicare Advantage Plans (Part C) - HMO, PPO, PFFS, SNP"),
        ("medicare_supplement", "Medicare Supplement (Medigap) Insurance"),
        ("prescription_drug", "Medicare Prescription Drug Plans (Part D)"),
        ("dental_vision_hearing", "Dental, Vision, and Hearing Products"),
        ("hospital_indemnity", "Hospital Indemnity Insurance"),
    ]
    
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    for key, label in products:
        checked = "☑" if form_fields.get(key) else "☐"
        p.drawString(50, y, f"{checked}  {label}")
        y -= 14
    
    if form_fields.get("other_products"):
        p.drawString(50, y, f"☑  Other: {form_fields.get('other_products')}")
        y -= 14
    
    if form_fields.get("plans_to_represent"):
        y -= 5
        p.setFillColor(medium_gray)
        p.setFont("Helvetica", 9)
        p.drawString(50, y, "Plans to be represented:")
        y -= 12
        p.setFillColor(dark_gray)
        p.setFont("Helvetica", 10)
        p.drawString(50, y, form_fields.get('plans_to_represent', ''))
        y -= 14
    
    y -= 10
    
    # Section 5: Appointment Date
    y = draw_section_header("SECTION 5: APPOINTMENT DETAILS", y)
    
    apt_date = form_fields.get('appointment_date', created_date.strftime('%Y-%m-%d'))
    if isinstance(apt_date, str) and apt_date:
        try:
            apt_parsed = datetime.strptime(apt_date, '%Y-%m-%d')
            apt_formatted = apt_parsed.strftime('%B %d, %Y')
        except:
            apt_formatted = apt_date
    else:
        apt_formatted = "N/A"
    
    y = draw_field("Scheduled Appointment Date", apt_formatted, y)
    y -= 10
    
    # Section 6: Consent & Acknowledgment
    y = draw_section_header("SECTION 6: CONSENT & ACKNOWLEDGMENT", y)
    
    # Consent box
    p.setFillColor(light_gray)
    p.rect(40, y - 55, width - 80, 55, stroke=0, fill=1)
    
    consent_text = [
        "By signing below, I agree to a meeting with a sales agent to discuss the types of products I have",
        "selected above. I understand that this is not an enrollment form and I am under no obligation to",
        "enroll. The agent may only discuss the products I have indicated above. I understand that CMS",
        "requires documentation of specific product types prior to any Medicare sales appointment."
    ]
    
    p.setFillColor(medium_gray)
    p.setFont("Helvetica", 8)
    text_y = y - 10
    for line in consent_text:
        p.drawString(50, text_y, line)
        text_y -= 11
    
    y -= 65
    
    # Check if we need a second page for signatures
    if y < 200:
        p.showPage()
        y = height - 50
    
    # Section 7: Signatures
    y = draw_section_header("SECTION 7: SIGNATURES", y)
    
    p.setFillColor(dark_gray)
    
    # Beneficiary/Auth Rep Signature Block
    p.setFont("Helvetica-Bold", 9)
    p.drawString(40, y, "BENEFICIARY/AUTHORIZED REPRESENTATIVE:")
    y -= 5
    
    # Draw signature box
    p.setStrokeColor(colors.HexColor("#CBD5E1"))
    p.setLineWidth(0.5)
    p.rect(40, y - 45, 180, 40, stroke=1, fill=0)
    
    # Draw beneficiary signature if exists
    if scope.get("signature"):
        try:
            sig_data = scope["signature"]
            # Parse data URI format: data:image/type;base64,DATA
            if sig_data.startswith("data:"):
                # Extract mime type and base64 data
                header, encoded = sig_data.split(",", 1)
                mime_type = header.split(";")[0].split(":")[1] if ":" in header else ""
                sig_bytes = base64.b64decode(encoded)
                
                # Handle SVG by converting to PNG using simple rasterization
                if "svg" in mime_type.lower():
                    # SVG cannot be directly used by ReportLab
                    # Draw a placeholder or skip - frontend should send PNG
                    logger.warning("SVG signature detected - frontend should send PNG format")
                    # Draw the typed name as fallback
                    p.setFont("Helvetica-Oblique", 14)
                    p.setFillColor(dark_gray)
                    typed_name = scope.get('typed_name', '')
                    if typed_name:
                        p.drawString(50, y - 30, typed_name)
                else:
                    # PNG/JPEG can be used directly
                    sig_image = ImageReader(BytesIO(sig_bytes))
                    p.drawImage(sig_image, 45, y - 42, width=170, height=35, preserveAspectRatio=True, mask='auto')
            else:
                # Raw base64 without data URI prefix
                sig_bytes = base64.b64decode(sig_data)
                sig_image = ImageReader(BytesIO(sig_bytes))
                p.drawImage(sig_image, 45, y - 42, width=170, height=35, preserveAspectRatio=True, mask='auto')
        except Exception as e:
            logger.error(f"Error drawing beneficiary signature: {e}")
    
    # Labels under signature
    p.setFont("Helvetica", 8)
    p.setFillColor(medium_gray)
    p.drawString(40, y - 55, "Signature")
    
    # Date field
    p.line(240, y - 45, 320, y - 45)
    p.drawString(240, y - 55, "Date")
    sig_date = form_fields.get('signature_date', created_date.strftime('%Y-%m-%d'))
    if isinstance(sig_date, str) and sig_date:
        try:
            sig_parsed = datetime.strptime(sig_date, '%Y-%m-%d')
            sig_formatted = sig_parsed.strftime('%m/%d/%Y')
        except:
            sig_formatted = sig_date
    else:
        sig_formatted = created_date.strftime('%m/%d/%Y')
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    p.drawString(240, y - 40, sig_formatted)
    
    # Printed name field
    p.setStrokeColor(colors.HexColor("#CBD5E1"))
    p.line(340, y - 45, width - 40, y - 45)
    p.setFont("Helvetica", 8)
    p.setFillColor(medium_gray)
    p.drawString(340, y - 55, "Printed Name")
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    typed_name = scope.get('typed_name', form_fields.get('beneficiary_name', ''))
    p.drawString(340, y - 40, typed_name)
    
    y -= 75
    
    # Agent Signature Block
    p.setFillColor(dark_gray)
    p.setFont("Helvetica-Bold", 9)
    p.drawString(40, y, "LICENSED SALES REPRESENTATIVE:")
    y -= 5
    
    # Draw signature box
    p.setStrokeColor(colors.HexColor("#CBD5E1"))
    p.rect(40, y - 45, 180, 40, stroke=1, fill=0)
    
    # Draw agent signature if exists
    if scope.get("agent_signature"):
        try:
            sig_data = scope["agent_signature"]
            # Parse data URI format: data:image/type;base64,DATA
            if sig_data.startswith("data:"):
                # Extract mime type and base64 data
                header, encoded = sig_data.split(",", 1)
                mime_type = header.split(";")[0].split(":")[1] if ":" in header else ""
                sig_bytes = base64.b64decode(encoded)
                
                # Handle SVG by converting to PNG using simple rasterization
                if "svg" in mime_type.lower():
                    # SVG cannot be directly used by ReportLab
                    # Draw a placeholder or skip - frontend should send PNG
                    logger.warning("SVG agent signature detected - frontend should send PNG format")
                    # Draw the typed name as fallback
                    p.setFont("Helvetica-Oblique", 14)
                    p.setFillColor(dark_gray)
                    agent_typed = scope.get('agent_typed_name', '')
                    if agent_typed:
                        p.drawString(50, y - 30, agent_typed)
                else:
                    # PNG/JPEG can be used directly
                    sig_image = ImageReader(BytesIO(sig_bytes))
                    p.drawImage(sig_image, 45, y - 42, width=170, height=35, preserveAspectRatio=True, mask='auto')
            else:
                # Raw base64 without data URI prefix
                sig_bytes = base64.b64decode(sig_data)
                sig_image = ImageReader(BytesIO(sig_bytes))
                p.drawImage(sig_image, 45, y - 42, width=170, height=35, preserveAspectRatio=True, mask='auto')
        except Exception as e:
            logger.error(f"Error drawing agent signature: {e}")
    
    # Labels under agent signature
    p.setFont("Helvetica", 8)
    p.setFillColor(medium_gray)
    p.drawString(40, y - 55, "Signature")
    
    # Date field
    p.line(240, y - 45, 320, y - 45)
    p.drawString(240, y - 55, "Date")
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    p.drawString(240, y - 40, sig_formatted)
    
    # Printed name field
    p.line(340, y - 45, width - 40, y - 45)
    p.setFont("Helvetica", 8)
    p.setFillColor(medium_gray)
    p.drawString(340, y - 55, "Printed Name")
    p.setFillColor(dark_gray)
    p.setFont("Helvetica", 10)
    agent_typed = scope.get('agent_typed_name', form_fields.get('agent_name', agent_name))
    p.drawString(340, y - 40, agent_typed)
    
    # Professional footer
    p.setFillColor(light_gray)
    p.rect(0, 0, width, 40, stroke=0, fill=1)
    p.setFont("Helvetica", 7)
    p.setFillColor(medium_gray)
    p.drawCentredString(width/2, 25, f"AgentRoute AI Insurance Services • Document ID: {scope_id}")
    p.drawCentredString(width/2, 14, "This Scope of Appointment is valid only for the appointment date and products specified above.")
    
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

# ==================== COMMISSION TRACKING ROUTES ====================

@api_router.get("/commissions")
async def get_commissions(
    status: Optional[str] = None,
    team_view: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get commission records with role-based access.
    - Agents see only their own commissions
    - Managers see their downline + their own
    - Admins see all commissions
    """
    user_role = current_user.get("role", "agent")
    is_team_view = team_view and user_role in ["admin", "manager"]
    
    # Determine which user IDs to include
    if is_team_view or user_role == "admin":
        if user_role == "admin":
            user_ids = [u["id"] async for u in db.users.find({}, {"id": 1})]
        else:
            user_ids = [current_user["id"]]
            async for agent in db.users.find({"manager_id": current_user["id"]}, {"id": 1}):
                user_ids.append(agent["id"])
    else:
        user_ids = [current_user["id"]]
    
    # Build query
    query = {"created_by_user": {"$in": user_ids}}
    if status:
        valid_statuses = [s.value for s in CommissionStatus]
        if status in valid_statuses:
            query["commission_status"] = status
    
    # Get commission records
    commissions = await db.commissions.find(query).sort("created_date", -1).to_list(1000)
    
    # Enrich with lead and agent names
    result = []
    for comm in commissions:
        lead_name = None
        if comm.get("lead_id"):
            lead = await db.leads.find_one({"id": comm["lead_id"]}, {"name": 1})
            lead_name = lead.get("name") if lead else None
        
        agent_name = None
        agent = await db.users.find_one({"id": comm.get("created_by_user")}, {"name": 1})
        agent_name = agent.get("name") if agent else None
        
        result.append(CommissionRecordResponse(
            id=comm["id"],
            lead_id=comm.get("lead_id"),
            lead_name=lead_name,
            production_id=comm.get("production_id"),
            policy_type=comm.get("policy_type", ""),
            carrier=comm.get("carrier", ""),
            premium=comm.get("premium", 0),
            estimated_commission=comm.get("estimated_commission", 0),
            agent_commission=comm.get("agent_commission", 0),
            manager_override=comm.get("manager_override", 0),
            agency_share=comm.get("agency_share", 0),
            paid_amount=comm.get("paid_amount"),
            commission_status=comm.get("commission_status", "estimated"),
            payment_date=comm.get("payment_date"),
            created_by_user=comm.get("created_by_user", ""),
            agent_name=agent_name,
            created_date=comm.get("created_date", datetime.utcnow()),
            notes=comm.get("notes", "")
        ))
    
    return result

@api_router.post("/commissions")
async def create_commission(
    commission_data: CommissionRecordCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new commission record"""
    # Get commission splits based on user
    user = await db.users.find_one({"id": current_user["id"]})
    agent_rate = user.get("commission_rate", 0.6) if user else 0.6
    manager_rate = 0.2
    agency_rate = 0.2
    
    commission_id = str(uuid.uuid4())
    commission_doc = {
        "id": commission_id,
        "lead_id": commission_data.lead_id,
        "production_id": commission_data.production_id,
        "policy_type": commission_data.policy_type,
        "carrier": commission_data.carrier,
        "premium": commission_data.premium,
        "estimated_commission": commission_data.estimated_commission,
        "agent_commission": commission_data.estimated_commission * agent_rate,
        "manager_override": commission_data.estimated_commission * manager_rate,
        "agency_share": commission_data.estimated_commission * agency_rate,
        "paid_amount": None,
        "commission_status": commission_data.commission_status,
        "payment_date": None,
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow(),
        "notes": commission_data.notes or ""
    }
    
    await db.commissions.insert_one(commission_doc)
    await log_activity(
        current_user["id"],
        "commission_created",
        f"Commission created: {commission_data.policy_type} - ${commission_data.estimated_commission}",
        commission_data.lead_id
    )
    
    # Get lead name for response
    lead_name = None
    if commission_data.lead_id:
        lead = await db.leads.find_one({"id": commission_data.lead_id}, {"name": 1})
        lead_name = lead.get("name") if lead else None
    
    return CommissionRecordResponse(
        id=commission_id,
        lead_id=commission_data.lead_id,
        lead_name=lead_name,
        production_id=commission_data.production_id,
        policy_type=commission_data.policy_type,
        carrier=commission_data.carrier,
        premium=commission_data.premium,
        estimated_commission=commission_data.estimated_commission,
        agent_commission=commission_doc["agent_commission"],
        manager_override=commission_doc["manager_override"],
        agency_share=commission_doc["agency_share"],
        paid_amount=None,
        commission_status=commission_data.commission_status,
        payment_date=None,
        created_by_user=current_user["id"],
        agent_name=user.get("name") if user else None,
        created_date=commission_doc["created_date"],
        notes=commission_doc["notes"]
    )

@api_router.put("/commissions/{commission_id}")
async def update_commission(
    commission_id: str,
    update_data: CommissionRecordUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update commission status, paid amount, or payment date"""
    commission = await db.commissions.find_one({"id": commission_id})
    if not commission:
        raise HTTPException(status_code=404, detail="Commission record not found")
    
    # Check authorization (agent can only update their own, manager/admin can update downline)
    user_role = current_user.get("role", "agent")
    if user_role == "agent" and commission.get("created_by_user") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to update this commission")
    
    # Build update dict
    update_dict = {}
    if update_data.commission_status:
        valid_statuses = [s.value for s in CommissionStatus]
        if update_data.commission_status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        update_dict["commission_status"] = update_data.commission_status
    
    if update_data.paid_amount is not None:
        update_dict["paid_amount"] = update_data.paid_amount
    
    if update_data.payment_date:
        update_dict["payment_date"] = datetime.fromisoformat(update_data.payment_date.replace('Z', '+00:00'))
    
    if update_data.notes is not None:
        update_dict["notes"] = update_data.notes
    
    if update_dict:
        await db.commissions.update_one({"id": commission_id}, {"$set": update_dict})
        await log_activity(
            current_user["id"],
            "commission_updated",
            f"Commission updated: {update_data.commission_status or 'status unchanged'}",
            commission.get("lead_id")
        )
    
    return {"message": "Commission updated", "commission_id": commission_id}

@api_router.get("/commissions/{commission_id}")
async def get_commission(commission_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single commission record"""
    commission = await db.commissions.find_one({"id": commission_id})
    if not commission:
        raise HTTPException(status_code=404, detail="Commission record not found")
    
    # Get lead and agent names
    lead_name = None
    if commission.get("lead_id"):
        lead = await db.leads.find_one({"id": commission["lead_id"]}, {"name": 1})
        lead_name = lead.get("name") if lead else None
    
    agent_name = None
    agent = await db.users.find_one({"id": commission.get("created_by_user")}, {"name": 1})
    agent_name = agent.get("name") if agent else None
    
    return CommissionRecordResponse(
        id=commission["id"],
        lead_id=commission.get("lead_id"),
        lead_name=lead_name,
        production_id=commission.get("production_id"),
        policy_type=commission.get("policy_type", ""),
        carrier=commission.get("carrier", ""),
        premium=commission.get("premium", 0),
        estimated_commission=commission.get("estimated_commission", 0),
        agent_commission=commission.get("agent_commission", 0),
        manager_override=commission.get("manager_override", 0),
        agency_share=commission.get("agency_share", 0),
        paid_amount=commission.get("paid_amount"),
        commission_status=commission.get("commission_status", "estimated"),
        payment_date=commission.get("payment_date"),
        created_by_user=commission.get("created_by_user", ""),
        agent_name=agent_name,
        created_date=commission.get("created_date", datetime.utcnow()),
        notes=commission.get("notes", "")
    )

@api_router.get("/commissions/summary/totals")
async def get_commission_summary(
    team_view: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get commission summary totals by status.
    Supports role-based access.
    """
    user_role = current_user.get("role", "agent")
    is_team_view = team_view and user_role in ["admin", "manager"]
    
    # Determine which user IDs to include
    if is_team_view or user_role == "admin":
        if user_role == "admin":
            user_ids = [u["id"] async for u in db.users.find({}, {"id": 1})]
        else:
            user_ids = [current_user["id"]]
            async for agent in db.users.find({"manager_id": current_user["id"]}, {"id": 1}):
                user_ids.append(agent["id"])
    else:
        user_ids = [current_user["id"]]
    
    # Aggregate by status
    pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}}},
        {"$group": {
            "_id": "$commission_status",
            "total": {"$sum": "$estimated_commission"},
            "agent_total": {"$sum": "$agent_commission"},
            "count": {"$sum": 1}
        }}
    ]
    status_results = await db.commissions.aggregate(pipeline).to_list(10)
    
    # Build totals
    totals = {
        "estimated": 0,
        "pending": 0,
        "approved": 0,
        "paid": 0
    }
    agent_totals = {
        "estimated": 0,
        "pending": 0,
        "approved": 0,
        "paid": 0
    }
    by_status = {}
    
    for result in status_results:
        status = result["_id"] or "estimated"
        if status in totals:
            totals[status] = result["total"]
            agent_totals[status] = result["agent_total"]
        by_status[status] = result["count"]
    
    # Aggregate by carrier
    carrier_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}}},
        {"$group": {
            "_id": "$carrier",
            "total": {"$sum": "$estimated_commission"}
        }}
    ]
    carrier_results = await db.commissions.aggregate(carrier_pipeline).to_list(100)
    by_carrier = {r["_id"]: r["total"] for r in carrier_results if r["_id"]}
    
    # Aggregate by policy type
    policy_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}}},
        {"$group": {
            "_id": "$policy_type",
            "total": {"$sum": "$estimated_commission"}
        }}
    ]
    policy_results = await db.commissions.aggregate(policy_pipeline).to_list(100)
    by_policy_type = {r["_id"]: r["total"] for r in policy_results if r["_id"]}
    
    # Get paid amounts sum
    paid_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "paid_amount": {"$ne": None}}},
        {"$group": {
            "_id": None,
            "total_paid": {"$sum": "$paid_amount"}
        }}
    ]
    paid_result = await db.commissions.aggregate(paid_pipeline).to_list(1)
    total_paid_amount = paid_result[0]["total_paid"] if paid_result else 0
    
    total_count = await db.commissions.count_documents({"created_by_user": {"$in": user_ids}})
    
    return {
        "total_estimated": totals["estimated"],
        "total_pending": totals["pending"],
        "total_approved": totals["approved"],
        "total_paid": totals["paid"],
        "total_paid_amount": total_paid_amount,
        "agent_totals": agent_totals,
        "records_count": total_count,
        "by_status": by_status,
        "by_carrier": by_carrier,
        "by_policy_type": by_policy_type,
        "is_team_view": is_team_view
    }

@api_router.get("/commissions/agent/{agent_id}")
async def get_agent_commissions(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get commissions for a specific agent.
    Only managers/admins can view other agents' commissions.
    """
    user_role = current_user.get("role", "agent")
    
    # Authorization check
    if agent_id != current_user["id"]:
        if user_role == "agent":
            raise HTTPException(status_code=403, detail="Not authorized to view other agents' commissions")
        elif user_role == "manager":
            # Check if agent is in manager's downline
            agent = await db.users.find_one({"id": agent_id})
            if not agent or agent.get("manager_id") != current_user["id"]:
                raise HTTPException(status_code=403, detail="Agent not in your downline")
    
    # Get commissions
    commissions = await db.commissions.find({"created_by_user": agent_id}).sort("created_date", -1).to_list(500)
    
    # Get agent info
    agent = await db.users.find_one({"id": agent_id}, {"name": 1, "email": 1})
    agent_name = agent.get("name") if agent else "Unknown"
    
    # Calculate summary
    total_estimated = sum(c.get("estimated_commission", 0) for c in commissions)
    total_agent = sum(c.get("agent_commission", 0) for c in commissions)
    total_paid = sum(c.get("paid_amount", 0) or 0 for c in commissions if c.get("commission_status") == "paid")
    
    status_counts = {}
    for c in commissions:
        status = c.get("commission_status", "estimated")
        status_counts[status] = status_counts.get(status, 0) + 1
    
    return {
        "agent_id": agent_id,
        "agent_name": agent_name,
        "total_records": len(commissions),
        "total_estimated_commission": total_estimated,
        "total_agent_commission": total_agent,
        "total_paid": total_paid,
        "status_breakdown": status_counts,
        "commissions": [
            {
                "id": c["id"],
                "lead_id": c.get("lead_id"),
                "policy_type": c.get("policy_type"),
                "carrier": c.get("carrier"),
                "premium": c.get("premium", 0),
                "estimated_commission": c.get("estimated_commission", 0),
                "agent_commission": c.get("agent_commission", 0),
                "paid_amount": c.get("paid_amount"),
                "commission_status": c.get("commission_status", "estimated"),
                "payment_date": c.get("payment_date"),
                "created_date": c.get("created_date")
            }
            for c in commissions[:50]  # Limit to 50 records
        ]
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
    Scan a business card, contact sheet, lead form, or flyer to extract contact information.
    Returns: name, phone, email, company, address, city, state, zip, job_title, notes, confidence scores
    """
    import tempfile
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OCR not configured - EMERGENT_LLM_KEY not set")
        
        image_base64 = request.get("image_base64", "")
        document_type = request.get("document_type", "auto")  # auto, business_card, contact_sheet, handwritten, flyer
        
        if not image_base64:
            raise HTTPException(status_code=400, detail="No image provided. Please capture or select an image to scan.")
        
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
                elif "image/gif" in header:
                    mime_type = "image/gif"
        
        # Validate base64 string
        if len(image_base64) < 100:
            raise HTTPException(status_code=400, detail="Image data is too small. Please capture a valid image.")
        
        # Determine file extension
        ext = ".jpg"
        if mime_type == "image/png":
            ext = ".png"
        elif mime_type == "image/webp":
            ext = ".webp"
        elif mime_type == "image/gif":
            ext = ".gif"
        
        # Write image to temporary file (Gemini requires file path)
        import base64
        try:
            image_bytes = base64.b64decode(image_base64)
        except Exception as decode_error:
            logger.error(f"Base64 decode error: {decode_error}")
            raise HTTPException(status_code=400, detail="Invalid image format. Please try capturing the image again.")
        
        # Validate minimum image size (at least 500 bytes for a meaningful image)
        if len(image_bytes) < 500:
            raise HTTPException(status_code=400, detail="Image is too small to scan. Please capture a clearer image with more detail.")
        
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp_file:
            tmp_file.write(image_bytes)
            tmp_path = tmp_file.name
        
        try:
            # Enhanced system prompt for comprehensive lead extraction from multiple document types
            system_prompt = """You are an expert OCR system specialized in extracting contact and lead information from various document types including:
- Business cards
- Printed contact sheets
- Handwritten lead forms or notes
- Marketing flyers with contact information
- Sign-up forms

Extract ALL available information and return ONLY a valid JSON object with these fields:
{
  "name": "Full name of the person (first and last name)",
  "phone": "Primary phone number (cleaned, digits only with country code if visible)",
  "email": "Email address (exact as written)",
  "company": "Company or organization name",
  "job_title": "Job title or position",
  "street_address": "Street address line",
  "city": "City name",
  "state": "State (2-letter code if US)",
  "zip_code": "ZIP or postal code",
  "website": "Website URL if present",
  "mobile": "Mobile/cell phone if different from main phone",
  "notes": "Any additional relevant text, interests, or notes found",
  "confidence": {
    "name": 0.0 to 1.0,
    "phone": 0.0 to 1.0,
    "email": 0.0 to 1.0,
    "company": 0.0 to 1.0,
    "address": 0.0 to 1.0,
    "overall": 0.0 to 1.0
  },
  "document_type_detected": "business_card" | "contact_sheet" | "handwritten" | "flyer" | "form" | "unknown"
}

Rules:
- Return ONLY the JSON object, no other text or markdown
- Use empty string "" for fields not found
- Clean up phone numbers: remove spaces/dashes, keep country code
- Preserve exact email addresses
- For addresses, parse into separate street, city, state, zip when possible
- For handwritten text, do your best but lower the confidence score
- Set confidence scores: 1.0 = very clear, 0.7 = likely correct, 0.5 = uncertain, 0.3 = guessing
- Include any useful notes like "Medicare interested" or "Call after 5pm" in notes field
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
                text="Extract all contact and lead information from this image. This could be a business card, contact form, handwritten notes, or flyer. Return only JSON, no markdown.",
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
            
            # Build full address from parts if available
            address_parts = []
            street = (extracted.get("street_address") or "").strip()
            city = (extracted.get("city") or "").strip()
            state = (extracted.get("state") or "").strip()
            zip_code = (extracted.get("zip_code") or "").strip()
            
            if street:
                address_parts.append(street)
            if city:
                address_parts.append(city)
            if state and zip_code:
                address_parts.append(f"{state} {zip_code}")
            elif state:
                address_parts.append(state)
            elif zip_code:
                address_parts.append(zip_code)
            
            full_address = ", ".join(address_parts) if address_parts else (extracted.get("address") or "").strip()
            
            # Get confidence scores
            confidence = extracted.get("confidence", {})
            if not isinstance(confidence, dict):
                confidence = {}
            
            # Normalize and clean the extracted data
            result = {
                "name": (extracted.get("name") or "").strip(),
                "phone": (extracted.get("phone") or extracted.get("mobile") or "").strip(),
                "email": (extracted.get("email") or "").strip().lower() if extracted.get("email") else "",
                "company": (extracted.get("company") or "").strip(),
                "job_title": (extracted.get("job_title") or "").strip(),
                "street_address": street,
                "city": city,
                "state": state,
                "zip_code": zip_code,
                "address": full_address,
                "website": (extracted.get("website") or "").strip(),
                "notes": (extracted.get("notes") or "").strip(),
                "confidence": {
                    "name": confidence.get("name", 0.5),
                    "phone": confidence.get("phone", 0.5),
                    "email": confidence.get("email", 0.5),
                    "company": confidence.get("company", 0.5),
                    "address": confidence.get("address", 0.5),
                    "overall": confidence.get("overall", 0.5)
                },
                "document_type_detected": extracted.get("document_type_detected", "unknown"),
                "raw_text": response
            }
            
            logger.info(f"OCR extracted: name={result['name']}, company={result['company']}, email={result['email']}, confidence={result['confidence'].get('overall', 0)}")
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
        error_message = str(e)
        # Provide user-friendly error messages
        if "BadRequestError" in error_message or "INVALID_ARGUMENT" in error_message:
            raise HTTPException(status_code=400, detail="The image could not be processed. Please ensure the image is clear, well-lit, and contains readable text.")
        elif "not valid" in error_message.lower():
            raise HTTPException(status_code=400, detail="Invalid image format. Please try capturing the image again with the camera or selecting a different image.")
        elif "timeout" in error_message.lower():
            raise HTTPException(status_code=504, detail="Processing took too long. Please try again with a simpler image.")
        else:
            raise HTTPException(status_code=500, detail="Failed to process image. Please try again.")

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
    
    leads_raw = await db.leads.find({"created_by_user": agent_id}).to_list(1000)
    appointments_raw = await db.appointments.find({"created_by_user": agent_id}).to_list(1000)
    scopes_raw = await db.scope_forms.find({"created_by_user": agent_id}).to_list(1000)
    production_raw = await db.production.find({"created_by_user": agent_id}).to_list(1000)
    activities_raw = await db.activity_logs.find({"user_id": agent_id}).sort("created_at", -1).limit(50).to_list(50)
    tasks_raw = await db.tasks.find({"created_by_user": agent_id}).to_list(100)
    
    # Remove MongoDB _id from all documents
    def sanitize(doc):
        if "_id" in doc:
            del doc["_id"]
        return doc
    
    leads = [sanitize(l) for l in leads_raw]
    appointments = [sanitize(a) for a in appointments_raw]
    scopes = [sanitize(s) for s in scopes_raw]
    production = [sanitize(p) for p in production_raw]
    activities = [sanitize(a) for a in activities_raw]
    tasks = [sanitize(t) for t in tasks_raw]
    
    overdue_tasks = [t for t in tasks if t.get("status") == "pending" and t.get("due_date", "") < datetime.utcnow().strftime("%Y-%m-%d")]
    
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
            "pending_follow_ups": len([t for t in tasks if t.get("status") == "pending"])
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

# ==================== TERRITORY MANAGEMENT ROUTES ====================

@api_router.get("/territories")
async def get_territories(current_user: dict = Depends(get_current_user)):
    """Get territories based on user role"""
    user_role = current_user.get("role", "agent")
    
    if user_role == "admin":
        territories = await db.territories.find({}).to_list(1000)
    elif user_role == "manager":
        # Manager sees territories they created or assigned to their agents
        downline_ids = [agent["id"] async for agent in db.users.find({"manager_id": current_user["id"]}, {"id": 1})]
        downline_ids.append(current_user["id"])
        territories = await db.territories.find({
            "$or": [
                {"created_by": current_user["id"]},
                {"assigned_agents": {"$in": downline_ids}}
            ]
        }).to_list(1000)
    else:
        # Agent sees territories assigned to them
        territories = await db.territories.find({"assigned_agents": current_user["id"]}).to_list(1000)
    
    result = []
    for t in territories:
        if "_id" in t:
            del t["_id"]
        # Get agent names
        agent_names = []
        for agent_id in t.get("assigned_agents", []):
            agent = await db.users.find_one({"id": agent_id}, {"name": 1})
            if agent:
                agent_names.append(agent["name"])
        
        # Count leads in this territory
        lead_count = 0
        zip_codes = t.get("zip_codes", [])
        if zip_codes:
            lead_count = await db.leads.count_documents({"address": {"$regex": "|".join(zip_codes)}})
        
        result.append(TerritoryResponse(
            id=t["id"],
            name=t["name"],
            description=t.get("description", ""),
            geographic_type=t.get("geographic_type", "zip_codes"),
            zip_codes=t.get("zip_codes", []),
            cities=t.get("cities", []),
            counties=t.get("counties", []),
            states=t.get("states", []),
            custom_areas=t.get("custom_areas", []),
            assigned_agents=t.get("assigned_agents", []),
            agent_names=agent_names,
            lead_count=lead_count,
            created_by=t.get("created_by", ""),
            created_date=t.get("created_date", datetime.utcnow())
        ))
    
    return result

@api_router.post("/territories")
async def create_territory(territory: TerritoryCreate, current_user: dict = Depends(require_manager_or_admin)):
    """Create a new territory"""
    territory_id = str(uuid.uuid4())
    territory_doc = {
        "id": territory_id,
        "name": territory.name,
        "description": territory.description,
        "geographic_type": territory.geographic_type,
        "zip_codes": territory.zip_codes or [],
        "cities": territory.cities or [],
        "counties": territory.counties or [],
        "states": territory.states or [],
        "custom_areas": territory.custom_areas or [],
        "assigned_agents": territory.assigned_agents or [],
        "created_by": current_user["id"],
        "created_date": datetime.utcnow()
    }
    
    await db.territories.insert_one(territory_doc)
    await log_activity(current_user["id"], "territory_created", f"Territory '{territory.name}' created")
    
    return {"id": territory_id, "message": "Territory created"}

@api_router.get("/territories/{territory_id}")
async def get_territory(territory_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific territory"""
    territory = await db.territories.find_one({"id": territory_id})
    if not territory:
        raise HTTPException(status_code=404, detail="Territory not found")
    
    if "_id" in territory:
        del territory["_id"]
    
    # Get agent names
    agent_names = []
    for agent_id in territory.get("assigned_agents", []):
        agent = await db.users.find_one({"id": agent_id}, {"name": 1})
        if agent:
            agent_names.append(agent["name"])
    
    territory["agent_names"] = agent_names
    
    # Get leads in territory
    leads = []
    zip_codes = territory.get("zip_codes", [])
    if zip_codes:
        for zc in zip_codes:
            territory_leads = await db.leads.find({"address": {"$regex": zc}}).to_list(100)
            for lead in territory_leads:
                if "_id" in lead:
                    del lead["_id"]
                leads.append(lead)
    
    territory["leads"] = leads
    territory["lead_count"] = len(leads)
    
    return territory

@api_router.put("/territories/{territory_id}")
async def update_territory(territory_id: str, update: TerritoryUpdate, current_user: dict = Depends(require_manager_or_admin)):
    """Update a territory"""
    territory = await db.territories.find_one({"id": territory_id})
    if not territory:
        raise HTTPException(status_code=404, detail="Territory not found")
    
    update_dict = {}
    if update.name is not None:
        update_dict["name"] = update.name
    if update.description is not None:
        update_dict["description"] = update.description
    if update.geographic_type is not None:
        update_dict["geographic_type"] = update.geographic_type
    if update.zip_codes is not None:
        update_dict["zip_codes"] = update.zip_codes
    if update.cities is not None:
        update_dict["cities"] = update.cities
    if update.counties is not None:
        update_dict["counties"] = update.counties
    if update.states is not None:
        update_dict["states"] = update.states
    if update.custom_areas is not None:
        update_dict["custom_areas"] = update.custom_areas
    if update.assigned_agents is not None:
        update_dict["assigned_agents"] = update.assigned_agents
    
    if update_dict:
        await db.territories.update_one({"id": territory_id}, {"$set": update_dict})
    
    return {"message": "Territory updated"}

@api_router.delete("/territories/{territory_id}")
async def delete_territory(territory_id: str, current_user: dict = Depends(require_manager_or_admin)):
    """Delete a territory"""
    result = await db.territories.delete_one({"id": territory_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Territory not found")
    return {"message": "Territory deleted"}

# ==================== LEAD DISTRIBUTION ROUTES ====================

@api_router.get("/lead-distribution/unassigned")
async def get_unassigned_leads(current_user: dict = Depends(require_manager_or_admin)):
    """Get leads that are not assigned to any agent"""
    leads = await db.leads.find({
        "$or": [
            {"assigned_to_user": None},
            {"assigned_to_user": {"$exists": False}},
            {"assigned_to_user": ""}
        ]
    }).sort("created_date", -1).to_list(500)
    
    result = []
    for lead in leads:
        if "_id" in lead:
            del lead["_id"]
        result.append(lead)
    
    return result

@api_router.get("/lead-distribution/assignments")
async def get_lead_assignments(current_user: dict = Depends(require_manager_or_admin)):
    """Get summary of lead assignments per agent"""
    user_role = current_user.get("role", "agent")
    
    if user_role == "admin":
        agents = await db.users.find({"role": "agent", "deleted_at": None}).to_list(1000)
    else:
        agents = await db.users.find({"manager_id": current_user["id"], "deleted_at": None}).to_list(1000)
    
    assignments = []
    for agent in agents:
        assigned_count = await db.leads.count_documents({"assigned_to_user": agent["id"]})
        created_count = await db.leads.count_documents({"created_by_user": agent["id"]})
        
        # Get territory info
        territories = await db.territories.find({"assigned_agents": agent["id"]}).to_list(10)
        territory_names = [t["name"] for t in territories]
        
        assignments.append({
            "agent_id": agent["id"],
            "agent_name": agent["name"],
            "agent_email": agent["email"],
            "assigned_leads": assigned_count,
            "created_leads": created_count,
            "total_leads": assigned_count + created_count,
            "territories": territory_names,
            "workload_score": assigned_count + created_count  # For balancing
        })
    
    return sorted(assignments, key=lambda x: x["total_leads"], reverse=True)

@api_router.post("/lead-distribution/assign")
async def assign_lead_to_agent(assignment: LeadAssignment, current_user: dict = Depends(require_manager_or_admin)):
    """Assign a single lead to an agent"""
    lead = await db.leads.find_one({"id": assignment.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    agent = await db.users.find_one({"id": assignment.agent_id, "deleted_at": None})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update lead assignment
    update_data = {
        "assigned_to_user": assignment.agent_id,
        "assignment_date": datetime.utcnow(),
        "assigned_by": current_user["id"]
    }
    
    if assignment.notes:
        update_data["assignment_notes"] = assignment.notes
    
    await db.leads.update_one({"id": assignment.lead_id}, {"$set": update_data})
    await log_activity(current_user["id"], "lead_assigned", f"Lead assigned to {agent['name']}", assignment.lead_id)
    
    return {"message": f"Lead assigned to {agent['name']}", "agent_name": agent["name"]}

@api_router.post("/lead-distribution/bulk-assign")
async def bulk_assign_leads(assignment: BulkLeadAssignment, current_user: dict = Depends(require_manager_or_admin)):
    """Assign multiple leads to a single agent"""
    agent = await db.users.find_one({"id": assignment.agent_id, "deleted_at": None})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    assigned = 0
    for lead_id in assignment.lead_ids:
        result = await db.leads.update_one(
            {"id": lead_id},
            {"$set": {
                "assigned_to_user": assignment.agent_id,
                "assignment_date": datetime.utcnow(),
                "assigned_by": current_user["id"]
            }}
        )
        if result.modified_count > 0:
            assigned += 1
    
    await log_activity(current_user["id"], "bulk_lead_assignment", f"{assigned} leads assigned to {agent['name']}")
    
    return {"message": f"{assigned} leads assigned to {agent['name']}", "assigned_count": assigned}

@api_router.post("/lead-distribution/auto-distribute")
async def auto_distribute_leads(request: LeadDistributionRequest, current_user: dict = Depends(require_manager_or_admin)):
    """Auto-distribute leads among agents using specified method"""
    if not request.lead_ids:
        raise HTTPException(status_code=400, detail="No leads provided")
    if not request.agent_ids:
        raise HTTPException(status_code=400, detail="No agents provided")
    
    # Verify agents exist
    agents = await db.users.find({"id": {"$in": request.agent_ids}, "deleted_at": None}).to_list(100)
    if len(agents) != len(request.agent_ids):
        raise HTTPException(status_code=400, detail="Some agents not found")
    
    assigned = 0
    agent_assignments = {agent["id"]: 0 for agent in agents}
    
    if request.method == "round_robin":
        # Simple round-robin distribution
        for i, lead_id in enumerate(request.lead_ids):
            agent_id = request.agent_ids[i % len(request.agent_ids)]
            await db.leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "assigned_to_user": agent_id,
                    "assignment_date": datetime.utcnow(),
                    "assigned_by": current_user["id"],
                    "assignment_method": "auto_round_robin"
                }}
            )
            agent_assignments[agent_id] += 1
            assigned += 1
    
    elif request.method == "workload_balanced":
        # Balance based on existing workload
        agent_workloads = {}
        for agent in agents:
            count = await db.leads.count_documents({
                "$or": [{"assigned_to_user": agent["id"]}, {"created_by_user": agent["id"]}]
            })
            agent_workloads[agent["id"]] = count
        
        for lead_id in request.lead_ids:
            # Assign to agent with lowest workload
            min_agent = min(agent_workloads, key=agent_workloads.get)
            await db.leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "assigned_to_user": min_agent,
                    "assignment_date": datetime.utcnow(),
                    "assigned_by": current_user["id"],
                    "assignment_method": "auto_workload_balanced"
                }}
            )
            agent_workloads[min_agent] += 1
            agent_assignments[min_agent] += 1
            assigned += 1
    
    elif request.method == "territory_based":
        # Assign based on territory match
        for lead_id in request.lead_ids:
            lead = await db.leads.find_one({"id": lead_id})
            if not lead:
                continue
            
            lead_address = lead.get("address", "")
            assigned_agent = None
            
            # Check each agent's territories
            for agent_id in request.agent_ids:
                territories = await db.territories.find({"assigned_agents": agent_id}).to_list(100)
                for territory in territories:
                    for zc in territory.get("zip_codes", []):
                        if zc in lead_address:
                            assigned_agent = agent_id
                            break
                    if assigned_agent:
                        break
                if assigned_agent:
                    break
            
            # If no territory match, use round-robin fallback
            if not assigned_agent:
                min_agent = min(agent_assignments, key=agent_assignments.get)
                assigned_agent = min_agent
            
            await db.leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "assigned_to_user": assigned_agent,
                    "assignment_date": datetime.utcnow(),
                    "assigned_by": current_user["id"],
                    "assignment_method": "auto_territory_based"
                }}
            )
            agent_assignments[assigned_agent] += 1
            assigned += 1
    
    await log_activity(current_user["id"], "auto_lead_distribution", f"{assigned} leads auto-distributed via {request.method}")
    
    # Build result with agent names
    distribution_result = []
    for agent in agents:
        distribution_result.append({
            "agent_id": agent["id"],
            "agent_name": agent["name"],
            "assigned_count": agent_assignments.get(agent["id"], 0)
        })
    
    return {
        "message": f"Distributed {assigned} leads among {len(agents)} agents",
        "method": request.method,
        "total_assigned": assigned,
        "distribution": distribution_result
    }

@api_router.post("/lead-distribution/bulk-upload")
async def bulk_upload_leads(upload: BulkLeadUpload, current_user: dict = Depends(require_manager_or_admin)):
    """Upload multiple leads at once with optional auto-assignment"""
    created_leads = []
    
    for lead_data in upload.leads:
        lead_id = str(uuid.uuid4())
        lead_doc = {
            "id": lead_id,
            "name": lead_data.get("name", "Unknown"),
            "phone": lead_data.get("phone", ""),
            "email": lead_data.get("email", ""),
            "address": lead_data.get("address", ""),
            "notes": lead_data.get("notes", ""),
            "source": lead_data.get("source", "bulk_upload"),
            "stage": "new_lead",
            "created_by_user": current_user["id"],
            "created_date": datetime.utcnow(),
            "uploaded_by": current_user["id"]
        }
        
        await db.leads.insert_one(lead_doc)
        created_leads.append(lead_id)
    
    await log_activity(current_user["id"], "bulk_lead_upload", f"Uploaded {len(created_leads)} leads")
    
    # Auto-assign if requested
    if upload.auto_assign and created_leads:
        # Get available agents
        if current_user.get("role") == "admin":
            agents = await db.users.find({"role": "agent", "deleted_at": None}).to_list(100)
        else:
            agents = await db.users.find({"manager_id": current_user["id"], "deleted_at": None}).to_list(100)
        
        if agents:
            agent_ids = [a["id"] for a in agents]
            method = "territory_based" if upload.territory_based else "workload_balanced"
            
            # Auto-distribute
            request = LeadDistributionRequest(
                lead_ids=created_leads,
                agent_ids=agent_ids,
                method=method
            )
            await auto_distribute_leads(request, current_user)
    
    return {
        "message": f"Uploaded {len(created_leads)} leads",
        "lead_count": len(created_leads),
        "lead_ids": created_leads,
        "auto_assigned": upload.auto_assign
    }

@api_router.post("/lead-distribution/reassign")
async def reassign_lead(request: dict, current_user: dict = Depends(require_manager_or_admin)):
    """Reassign a lead from one agent to another"""
    lead_id = request.get("lead_id")
    new_agent_id = request.get("new_agent_id")
    reason = request.get("reason", "")
    
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    new_agent = await db.users.find_one({"id": new_agent_id, "deleted_at": None})
    if not new_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    old_agent_id = lead.get("assigned_to_user")
    old_agent_name = "Unassigned"
    if old_agent_id:
        old_agent = await db.users.find_one({"id": old_agent_id})
        old_agent_name = old_agent["name"] if old_agent else "Unknown"
    
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {
            "assigned_to_user": new_agent_id,
            "assignment_date": datetime.utcnow(),
            "assigned_by": current_user["id"],
            "reassignment_reason": reason,
            "previous_agent": old_agent_id
        }}
    )
    
    await log_activity(
        current_user["id"],
        "lead_reassigned",
        f"Lead reassigned from {old_agent_name} to {new_agent['name']}" + (f" - Reason: {reason}" if reason else ""),
        lead_id
    )
    
    return {
        "message": f"Lead reassigned to {new_agent['name']}",
        "previous_agent": old_agent_name,
        "new_agent": new_agent["name"]
    }

# ==================== AI DAILY PLANNER ROUTES ====================

@api_router.get("/daily-planner")
async def get_daily_planner(current_user: dict = Depends(get_current_user)):
    """
    Generate an AI-powered daily action plan for the agent.
    Analyzes leads, appointments, follow-ups, pipeline stages, and geography
    to create a prioritized list of actions.
    """
    user_id = current_user["id"]
    today = datetime.utcnow()
    today_str = today.strftime("%Y-%m-%d")
    tomorrow = today + timedelta(days=1)
    
    actions = []
    
    # 1. Get today's appointments - HIGHEST PRIORITY
    appointments_today = await db.appointments.find({
        "created_by_user": user_id,
        "date": {"$gte": today_str, "$lt": tomorrow.strftime("%Y-%m-%d")},
        "status": {"$in": ["scheduled", "confirmed"]}
    }).sort("time", 1).to_list(50)
    
    for apt in appointments_today:
        lead = await db.leads.find_one({"id": apt.get("lead_id")})
        lead_name = lead.get("name") if lead else "Unknown"
        actions.append({
            "id": str(uuid.uuid4()),
            "type": "appointment",
            "priority": 1,
            "priority_label": "High",
            "title": f"Appointment with {lead_name}",
            "description": apt.get("notes") or f"Scheduled for {apt.get('time', 'TBD')}",
            "time": apt.get("time"),
            "icon": "calendar",
            "color": "#3B82F6",
            "action_text": "View Appointment",
            "record_type": "appointment",
            "record_id": apt.get("id"),
            "lead_id": apt.get("lead_id"),
            "lead_name": lead_name,
            "address": lead.get("address") if lead else None,
            "reason": "Scheduled appointment today"
        })
    
    # 2. Get overdue follow-ups - HIGH PRIORITY
    overdue_tasks = await db.tasks.find({
        "created_by_user": user_id,
        "status": "pending",
        "due_date": {"$lt": today_str}
    }).sort("due_date", 1).to_list(20)
    
    for task in overdue_tasks:
        lead = await db.leads.find_one({"id": task.get("lead_id")}) if task.get("lead_id") else None
        lead_name = lead.get("name") if lead else "Unknown"
        days_overdue = (today - datetime.strptime(task.get("due_date", today_str), "%Y-%m-%d")).days
        actions.append({
            "id": str(uuid.uuid4()),
            "type": "follow_up",
            "priority": 2,
            "priority_label": "High",
            "title": f"Overdue: {task.get('title', 'Follow-up')}",
            "description": f"{days_overdue} day(s) overdue" + (f" - {lead_name}" if lead_name != "Unknown" else ""),
            "icon": "alert-circle",
            "color": "#EF4444",
            "action_text": "Complete Task",
            "record_type": "task",
            "record_id": task.get("id"),
            "lead_id": task.get("lead_id"),
            "lead_name": lead_name,
            "reason": f"Follow-up is {days_overdue} day(s) overdue"
        })
    
    # 3. Leads needing follow-up (no contact in 7+ days) - MEDIUM-HIGH PRIORITY
    seven_days_ago = today - timedelta(days=7)
    stale_leads = await db.leads.find({
        "$or": [{"created_by_user": user_id}, {"assigned_to_user": user_id}],
        "stage": {"$in": ["new_lead", "appointment_scheduled", "application_submitted"]},
        "$or": [
            {"last_contact_date": {"$lt": seven_days_ago}},
            {"last_contact_date": None},
            {"last_contact_date": {"$exists": False}}
        ]
    }).limit(10).to_list(10)
    
    for lead in stale_leads:
        last_contact = lead.get("last_contact_date")
        if last_contact:
            days_since = (today - last_contact).days
            desc = f"No contact in {days_since} days"
        else:
            desc = "Never contacted"
        
        actions.append({
            "id": str(uuid.uuid4()),
            "type": "call_follow_up",
            "priority": 3,
            "priority_label": "Medium",
            "title": f"Call {lead.get('name')}",
            "description": desc,
            "phone": lead.get("phone"),
            "icon": "call",
            "color": "#F59E0B",
            "action_text": "View Lead",
            "record_type": "lead",
            "record_id": lead.get("id"),
            "lead_id": lead.get("id"),
            "lead_name": lead.get("name"),
            "address": lead.get("address"),
            "reason": desc
        })
    
    # 4. Leads requiring application submission - MEDIUM PRIORITY
    appointment_completed_leads = await db.leads.find({
        "$or": [{"created_by_user": user_id}, {"assigned_to_user": user_id}],
        "stage": "appointment_scheduled"
    }).limit(10).to_list(10)
    
    # Check for completed appointments without application
    for lead in appointment_completed_leads:
        completed_apt = await db.appointments.find_one({
            "lead_id": lead.get("id"),
            "status": "completed"
        })
        if completed_apt:
            actions.append({
                "id": str(uuid.uuid4()),
                "type": "submit_application",
                "priority": 4,
                "priority_label": "Medium",
                "title": f"Submit application for {lead.get('name')}",
                "description": "Appointment completed, ready for submission",
                "icon": "document-text",
                "color": "#8B5CF6",
                "action_text": "Submit Application",
                "record_type": "lead",
                "record_id": lead.get("id"),
                "lead_id": lead.get("id"),
                "lead_name": lead.get("name"),
                "reason": "Appointment completed - submit application"
            })
    
    # 5. Underwriting requirements - MEDIUM PRIORITY
    underwriting_leads = await db.leads.find({
        "$or": [{"created_by_user": user_id}, {"assigned_to_user": user_id}],
        "stage": "additional_requirements"
    }).to_list(20)
    
    for lead in underwriting_leads:
        actions.append({
            "id": str(uuid.uuid4()),
            "type": "resolve_underwriting",
            "priority": 4,
            "priority_label": "Medium",
            "title": f"Resolve requirements for {lead.get('name')}",
            "description": lead.get("underwriting_notes") or "Additional documentation needed",
            "icon": "clipboard",
            "color": "#F97316",
            "action_text": "View Requirements",
            "record_type": "lead",
            "record_id": lead.get("id"),
            "lead_id": lead.get("id"),
            "lead_name": lead.get("name"),
            "reason": "Underwriting requires additional information"
        })
    
    # 6. New leads to visit - MEDIUM-LOW PRIORITY (with geographic clustering)
    new_leads = await db.leads.find({
        "$or": [{"created_by_user": user_id}, {"assigned_to_user": user_id}],
        "stage": "new_lead"
    }).limit(10).to_list(10)
    
    # Group by zip code for geographic proximity
    leads_by_area = {}
    for lead in new_leads:
        address = lead.get("address", "")
        # Extract zip code (simple extraction)
        import re
        zip_match = re.search(r'\b\d{5}\b', address)
        area = zip_match.group() if zip_match else "unknown"
        if area not in leads_by_area:
            leads_by_area[area] = []
        leads_by_area[area].append(lead)
    
    # Prioritize areas with multiple leads
    sorted_areas = sorted(leads_by_area.items(), key=lambda x: len(x[1]), reverse=True)
    
    for area, area_leads in sorted_areas:
        for lead in area_leads[:3]:  # Limit per area
            actions.append({
                "id": str(uuid.uuid4()),
                "type": "visit_lead",
                "priority": 5,
                "priority_label": "Normal",
                "title": f"Visit {lead.get('name')}",
                "description": lead.get("address") or "No address",
                "icon": "location",
                "color": "#22C55E",
                "action_text": "View Lead",
                "record_type": "lead",
                "record_id": lead.get("id"),
                "lead_id": lead.get("id"),
                "lead_name": lead.get("name"),
                "address": lead.get("address"),
                "area": area if area != "unknown" else None,
                "reason": f"New lead in area {area}" if area != "unknown" else "New lead to visit"
            })
    
    # 7. Upcoming appointments to confirm - LOW PRIORITY
    upcoming_appointments = await db.appointments.find({
        "created_by_user": user_id,
        "date": {"$gte": today_str, "$lt": (today + timedelta(days=3)).strftime("%Y-%m-%d")},
        "status": "scheduled"
    }).sort("date", 1).limit(5).to_list(5)
    
    for apt in upcoming_appointments:
        if apt.get("date") != today_str:  # Skip today's (already high priority)
            lead = await db.leads.find_one({"id": apt.get("lead_id")})
            lead_name = lead.get("name") if lead else "Unknown"
            actions.append({
                "id": str(uuid.uuid4()),
                "type": "confirm_appointment",
                "priority": 6,
                "priority_label": "Low",
                "title": f"Confirm appointment with {lead_name}",
                "description": f"Scheduled for {apt.get('date')} at {apt.get('time', 'TBD')}",
                "icon": "checkmark-circle",
                "color": "#64748B",
                "action_text": "View Appointment",
                "record_type": "appointment",
                "record_id": apt.get("id"),
                "lead_id": apt.get("lead_id"),
                "lead_name": lead_name,
                "reason": "Upcoming appointment - confirm attendance"
            })
    
    # Sort by priority and limit total actions
    actions.sort(key=lambda x: (x["priority"], x.get("time") or "99:99"))
    actions = actions[:15]  # Limit to 15 actions per day
    
    # Calculate summary stats
    summary = {
        "total_actions": len(actions),
        "high_priority": len([a for a in actions if a["priority"] <= 2]),
        "medium_priority": len([a for a in actions if 3 <= a["priority"] <= 4]),
        "low_priority": len([a for a in actions if a["priority"] >= 5]),
        "appointments_today": len([a for a in actions if a["type"] == "appointment"]),
        "overdue_items": len([a for a in actions if a["type"] == "follow_up"]),
        "date": today_str,
        "greeting": get_time_greeting()
    }
    
    return {
        "plan_date": today_str,
        "generated_at": datetime.utcnow().isoformat(),
        "agent_id": user_id,
        "agent_name": current_user.get("name"),
        "summary": summary,
        "actions": actions
    }

def get_time_greeting():
    """Get appropriate greeting based on time of day"""
    hour = datetime.utcnow().hour
    if hour < 12:
        return "Good morning"
    elif hour < 17:
        return "Good afternoon"
    else:
        return "Good evening"

@api_router.post("/daily-planner/complete-action")
async def complete_planner_action(request: dict, current_user: dict = Depends(get_current_user)):
    """Mark a daily planner action as completed"""
    action_type = request.get("action_type")
    record_id = request.get("record_id")
    notes = request.get("notes", "")
    
    # Log the completion
    await log_activity(
        current_user["id"],
        "planner_action_completed",
        f"Completed {action_type}: {notes}" if notes else f"Completed {action_type}",
        request.get("lead_id")
    )
    
    # Update relevant records based on action type
    if action_type == "follow_up" and record_id:
        await db.tasks.update_one(
            {"id": record_id},
            {"$set": {"status": "completed", "completed_at": datetime.utcnow()}}
        )
    
    return {"message": "Action completed", "action_type": action_type}

@api_router.get("/daily-planner/team-summary")
async def get_team_planner_summary(current_user: dict = Depends(require_manager_or_admin)):
    """
    Get summary of daily planner actions for all team members.
    Only available to managers and admins.
    """
    user_role = current_user.get("role", "agent")
    today = datetime.utcnow()
    today_str = today.strftime("%Y-%m-%d")
    
    # Get team members
    if user_role == "admin":
        agents = await db.users.find({"role": "agent", "deleted_at": None}).to_list(100)
    else:
        agents = await db.users.find({
            "manager_id": current_user["id"],
            "deleted_at": None
        }).to_list(100)
    
    team_summary = []
    
    for agent in agents:
        agent_id = agent["id"]
        
        # Count key metrics
        appointments_today = await db.appointments.count_documents({
            "created_by_user": agent_id,
            "date": today_str,
            "status": {"$in": ["scheduled", "confirmed"]}
        })
        
        overdue_tasks = await db.tasks.count_documents({
            "created_by_user": agent_id,
            "status": "pending",
            "due_date": {"$lt": today_str}
        })
        
        leads_to_contact = await db.leads.count_documents({
            "$or": [{"created_by_user": agent_id}, {"assigned_to_user": agent_id}],
            "stage": {"$in": ["new_lead", "appointment_scheduled"]},
            "$or": [
                {"last_contact_date": {"$lt": today - timedelta(days=7)}},
                {"last_contact_date": None}
            ]
        })
        
        underwriting_pending = await db.leads.count_documents({
            "$or": [{"created_by_user": agent_id}, {"assigned_to_user": agent_id}],
            "stage": "additional_requirements"
        })
        
        # Calculate activity score (simple heuristic)
        activity_score = min(100, max(0, 100 - (overdue_tasks * 10) - (leads_to_contact * 5)))
        
        team_summary.append({
            "agent_id": agent_id,
            "agent_name": agent.get("name"),
            "agent_email": agent.get("email"),
            "appointments_today": appointments_today,
            "overdue_tasks": overdue_tasks,
            "leads_to_contact": leads_to_contact,
            "underwriting_pending": underwriting_pending,
            "total_action_items": appointments_today + overdue_tasks + leads_to_contact + underwriting_pending,
            "activity_score": activity_score,
            "last_login": agent.get("last_login"),
            "needs_attention": overdue_tasks > 3 or leads_to_contact > 5
        })
    
    # Sort by needs_attention and then by total_action_items
    team_summary.sort(key=lambda x: (-int(x["needs_attention"]), -x["total_action_items"]))
    
    return {
        "date": today_str,
        "total_agents": len(agents),
        "agents_needing_attention": len([a for a in team_summary if a["needs_attention"]]),
        "total_appointments_today": sum(a["appointments_today"] for a in team_summary),
        "total_overdue_tasks": sum(a["overdue_tasks"] for a in team_summary),
        "team_summary": team_summary
    }

# ==================== TEAM TREE VIEW ROUTES ====================

async def build_user_node(user: dict) -> dict:
    """Build a user node with stats for the tree view"""
    user_id = user["id"]
    
    # Count stats
    lead_count = await db.leads.count_documents({
        "$or": [{"created_by_user": user_id}, {"assigned_to_user": user_id}]
    })
    
    # Get production total
    production_records = await db.production.find({"created_by_user": user_id}).to_list(1000)
    production_total = sum(p.get("premium", 0) for p in production_records)
    
    # Get commission total
    commission_records = await db.commissions.find({"created_by_user": user_id}).to_list(1000)
    commission_total = sum(c.get("agent_commission", 0) for c in commission_records)
    
    # Count team members (for managers)
    team_count = await db.users.count_documents({"manager_id": user_id, "deleted_at": None})
    
    # Calculate activity status
    last_login = user.get("last_login")
    activity_status = "inactive"
    activity_color = "#64748B"
    if last_login:
        hours_since = (datetime.utcnow() - last_login).total_seconds() / 3600
        if hours_since < 1:
            activity_status = "online"
            activity_color = "#22C55E"
        elif hours_since < 24:
            activity_status = "today"
            activity_color = "#3B82F6"
        elif hours_since < 72:
            activity_status = "recent"
            activity_color = "#F59E0B"
        else:
            activity_status = "inactive"
            activity_color = "#EF4444"
    
    return {
        "id": user["id"],
        "name": user.get("name", "Unknown"),
        "email": user.get("email", ""),
        "role": user.get("role", "agent"),
        "phone": user.get("phone"),
        "territory": user.get("territory"),
        "lead_count": lead_count,
        "production_total": production_total,
        "commission_total": commission_total,
        "team_count": team_count,
        "last_login": user.get("last_login"),
        "activity_status": activity_status,
        "activity_color": activity_color,
        "commission_rate": user.get("commission_rate", 0.6),
        "children": []
    }

async def build_tree_branch(user_id: str, depth: int = 0, max_depth: int = 5) -> dict:
    """Recursively build a tree branch for a user and their downline"""
    if depth > max_depth:
        return None
    
    user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not user:
        return None
    
    node = await build_user_node(user)
    
    # Get direct reports
    downline = await db.users.find({"manager_id": user_id, "deleted_at": None}).to_list(100)
    
    for subordinate in downline:
        child_node = await build_tree_branch(subordinate["id"], depth + 1, max_depth)
        if child_node:
            node["children"].append(child_node)
    
    return node

@api_router.get("/team/tree")
async def get_team_tree(current_user: dict = Depends(get_current_user)):
    """
    Get the team hierarchy tree.
    - Admin sees the full organization tree
    - Manager sees their own branch (themselves + downline)
    - Agent cannot access (403)
    """
    user_role = current_user.get("role", "agent")
    
    if user_role == "agent":
        raise HTTPException(status_code=403, detail="Agents cannot access the team tree view")
    
    if user_role == "admin":
        # Build full tree starting from admin/managers with no manager
        # Get all top-level users (admins and managers without a manager)
        top_level_users = await db.users.find({
            "$or": [
                {"role": "admin", "deleted_at": None},
                {"role": "manager", "manager_id": None, "deleted_at": None},
                {"role": "manager", "manager_id": {"$exists": False}, "deleted_at": None}
            ]
        }).to_list(100)
        
        tree = []
        processed_ids = set()
        
        for user in top_level_users:
            if user["id"] not in processed_ids:
                branch = await build_tree_branch(user["id"])
                if branch:
                    tree.append(branch)
                    processed_ids.add(user["id"])
        
        # Also get any managers not in tree yet (orphaned)
        all_managers = await db.users.find({"role": "manager", "deleted_at": None}).to_list(100)
        for manager in all_managers:
            if manager["id"] not in processed_ids:
                branch = await build_tree_branch(manager["id"])
                if branch:
                    tree.append(branch)
                    processed_ids.add(manager["id"])
        
        # Get any agents not assigned to a manager
        unassigned_agents = await db.users.find({
            "role": "agent",
            "deleted_at": None,
            "$or": [
                {"manager_id": None},
                {"manager_id": {"$exists": False}}
            ]
        }).to_list(100)
        
        unassigned_branch = {
            "id": "unassigned",
            "name": "Unassigned Agents",
            "email": "",
            "role": "group",
            "lead_count": 0,
            "production_total": 0,
            "commission_total": 0,
            "team_count": len(unassigned_agents),
            "activity_status": "group",
            "activity_color": "#64748B",
            "children": []
        }
        
        for agent in unassigned_agents:
            node = await build_user_node(agent)
            unassigned_branch["children"].append(node)
            unassigned_branch["lead_count"] += node["lead_count"]
            unassigned_branch["production_total"] += node["production_total"]
        
        if unassigned_branch["children"]:
            tree.append(unassigned_branch)
        
        # Calculate totals
        total_users = await db.users.count_documents({"deleted_at": None})
        total_agents = await db.users.count_documents({"role": "agent", "deleted_at": None})
        total_managers = await db.users.count_documents({"role": "manager", "deleted_at": None})
        total_admins = await db.users.count_documents({"role": "admin", "deleted_at": None})
        
        return {
            "tree": tree,
            "summary": {
                "total_users": total_users,
                "total_agents": total_agents,
                "total_managers": total_managers,
                "total_admins": total_admins
            },
            "viewer_role": user_role,
            "viewer_id": current_user["id"]
        }
    
    else:  # Manager
        # Build tree starting from the manager themselves
        branch = await build_tree_branch(current_user["id"])
        
        if not branch:
            raise HTTPException(status_code=404, detail="User tree not found")
        
        # Count team stats
        total_in_branch = 1  # Include self
        
        def count_children(node):
            count = len(node.get("children", []))
            for child in node.get("children", []):
                count += count_children(child)
            return count
        
        total_in_branch += count_children(branch)
        
        return {
            "tree": [branch],
            "summary": {
                "total_users": total_in_branch,
                "total_agents": await db.users.count_documents({"manager_id": current_user["id"], "role": "agent", "deleted_at": None}),
                "total_managers": 0,
                "total_admins": 0
            },
            "viewer_role": user_role,
            "viewer_id": current_user["id"]
        }

@api_router.get("/team/tree/{user_id}")
async def get_user_tree_node(user_id: str, current_user: dict = Depends(require_manager_or_admin)):
    """Get a specific user's tree node with details"""
    user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check access
    user_role = current_user.get("role", "agent")
    if user_role != "admin":
        # Manager can only view themselves or their downline
        if user_id != current_user["id"]:
            is_downline = await db.users.find_one({"id": user_id, "manager_id": current_user["id"]})
            if not is_downline:
                raise HTTPException(status_code=403, detail="Access denied")
    
    node = await build_user_node(user)
    
    # Get additional details
    # Recent activity
    activities = await db.activity_logs.find({"user_id": user_id}).sort("created_at", -1).limit(10).to_list(10)
    recent_activity = []
    for act in activities:
        if "_id" in act:
            del act["_id"]
        recent_activity.append({
            "action": act.get("action_type"),
            "description": act.get("description"),
            "created_at": act.get("created_at")
        })
    
    # Pipeline summary
    leads = await db.leads.find({
        "$or": [{"created_by_user": user_id}, {"assigned_to_user": user_id}]
    }).to_list(500)
    
    pipeline_summary = {}
    for lead in leads:
        stage = lead.get("stage", "new_lead")
        pipeline_summary[stage] = pipeline_summary.get(stage, 0) + 1
    
    node["recent_activity"] = recent_activity
    node["pipeline_summary"] = pipeline_summary
    node["manager_id"] = user.get("manager_id")
    
    # Get manager name if exists
    if user.get("manager_id"):
        manager = await db.users.find_one({"id": user["manager_id"]}, {"name": 1})
        node["manager_name"] = manager.get("name") if manager else None
    
    return node

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

# ==================== AGENCY COMMAND CENTER ====================

class AgencyCommandCenterSummary(BaseModel):
    total_active_agents: int
    leads_this_week: int
    appointments_today: int
    applications_submitted: int
    policies_issued: int
    pending_commissions: float
    paid_commissions: float

class TeamPerformanceSection(BaseModel):
    top_producers: List[Dict[str, Any]]
    top_managers: List[Dict[str, Any]]
    lowest_activity: List[Dict[str, Any]]
    overdue_followups: List[Dict[str, Any]]

class PipelineHealthSection(BaseModel):
    underwriting_review: List[Dict[str, Any]]
    additional_requirements: List[Dict[str, Any]]
    approved_cases: List[Dict[str, Any]]
    issued_policies: List[Dict[str, Any]]
    stalled_cases: List[Dict[str, Any]]

class ActivityTrackingSection(BaseModel):
    logged_in_today: List[Dict[str, Any]]
    not_logged_recently: List[Dict[str, Any]]
    appointments_today: List[Dict[str, Any]]
    overdue_lead_activity: List[Dict[str, Any]]

@api_router.get("/agency-command-center/summary")
async def get_agency_command_center_summary(current_user: dict = Depends(require_manager_or_admin)):
    """Get summary cards for Agency Command Center"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today - timedelta(days=today.weekday())
    
    # Total active agents (logged in within last 7 days)
    seven_days_ago = today - timedelta(days=7)
    total_active_agents = await db.users.count_documents({
        "id": {"$in": user_ids},
        "role": "agent",
        "deleted_at": None,
        "last_login": {"$gte": seven_days_ago}
    })
    
    # Leads created this week
    leads_this_week = await db.leads.count_documents({
        "created_by_user": {"$in": user_ids},
        "created_date": {"$gte": week_start},
        "deleted_at": None
    })
    
    # Appointments scheduled for today
    today_str = today.strftime("%Y-%m-%d")
    appointments_today = await db.appointments.count_documents({
        "created_by_user": {"$in": user_ids},
        "appointment_date": today_str,
        "status": {"$in": ["scheduled", "pending"]}
    })
    
    # Applications submitted (leads in application_submitted or later stages)
    applications_submitted = await db.leads.count_documents({
        "created_by_user": {"$in": user_ids},
        "stage": {"$in": ["application_submitted", "underwriting_review", "additional_requirements", "approved", "policy_issued", "policy_placed"]},
        "deleted_at": None
    })
    
    # Policies issued
    policies_issued = await db.leads.count_documents({
        "created_by_user": {"$in": user_ids},
        "stage": {"$in": ["policy_issued", "policy_placed", "commission_pending", "commission_paid"]},
        "deleted_at": None
    })
    
    # Commission summary
    pending_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "commission_status": {"$in": ["estimated", "pending", "approved"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$estimated_commission"}}}
    ]
    pending_result = await db.commissions.aggregate(pending_pipeline).to_list(1)
    pending_commissions = pending_result[0]["total"] if pending_result else 0
    
    paid_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "commission_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$paid_amount"}}}
    ]
    paid_result = await db.commissions.aggregate(paid_pipeline).to_list(1)
    paid_commissions = paid_result[0]["total"] if paid_result else 0
    
    return AgencyCommandCenterSummary(
        total_active_agents=total_active_agents,
        leads_this_week=leads_this_week,
        appointments_today=appointments_today,
        applications_submitted=applications_submitted,
        policies_issued=policies_issued,
        pending_commissions=pending_commissions,
        paid_commissions=paid_commissions
    )

@api_router.get("/agency-command-center/team-performance")
async def get_agency_team_performance(current_user: dict = Depends(require_manager_or_admin)):
    """Get team performance section data"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today.replace(day=1)
    three_days_ago = today - timedelta(days=3)
    
    # Top producers (by premium this month)
    top_prod_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "created_date": {"$gte": month_start}}},
        {"$group": {"_id": "$created_by_user", "total_premium": {"$sum": "$premium"}, "total_commission": {"$sum": "$agent_commission"}, "policies": {"$sum": 1}}},
        {"$sort": {"total_premium": -1}},
        {"$limit": 10}
    ]
    top_prod = await db.production.aggregate(top_prod_pipeline).to_list(10)
    
    top_producers = []
    for p in top_prod:
        user = await db.users.find_one({"id": p["_id"]})
        if user:
            top_producers.append({
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user.get("role", "agent"),
                "total_premium": p["total_premium"],
                "total_commission": p["total_commission"],
                "policies": p["policies"],
                "last_login": user.get("last_login").isoformat() if user.get("last_login") else None
            })
    
    # Top managers/uplines (by team production)
    managers = await db.users.find({"id": {"$in": user_ids}, "role": {"$in": ["manager", "admin"]}, "deleted_at": None}).to_list(100)
    top_managers = []
    for mgr in managers:
        # Get downline production
        downline = await db.users.find({"manager_id": mgr["id"], "deleted_at": None}, {"id": 1}).to_list(100)
        downline_ids = [d["id"] for d in downline] + [mgr["id"]]
        
        mgr_prod = await db.production.aggregate([
            {"$match": {"created_by_user": {"$in": downline_ids}, "created_date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total_premium": {"$sum": "$premium"}, "total_commission": {"$sum": "$manager_override"}, "policies": {"$sum": 1}}}
        ]).to_list(1)
        
        team_premium = mgr_prod[0]["total_premium"] if mgr_prod else 0
        team_override = mgr_prod[0]["total_commission"] if mgr_prod else 0
        team_policies = mgr_prod[0]["policies"] if mgr_prod else 0
        
        top_managers.append({
            "id": mgr["id"],
            "name": mgr["name"],
            "email": mgr["email"],
            "role": mgr.get("role", "manager"),
            "team_size": len(downline),
            "team_premium": team_premium,
            "override_earned": team_override,
            "team_policies": team_policies,
            "last_login": mgr.get("last_login").isoformat() if mgr.get("last_login") else None
        })
    
    top_managers.sort(key=lambda x: x["team_premium"], reverse=True)
    top_managers = top_managers[:10]
    
    # Lowest activity agents (no login in 3+ days or no leads in 7 days)
    inactive_agents = await db.users.find({
        "id": {"$in": user_ids},
        "role": "agent",
        "deleted_at": None,
        "$or": [
            {"last_login": {"$lt": three_days_ago}},
            {"last_login": None}
        ]
    }).to_list(20)
    
    lowest_activity = []
    for agent in inactive_agents:
        # Get their lead count in last 7 days
        lead_count = await db.leads.count_documents({
            "created_by_user": agent["id"],
            "created_date": {"$gte": today - timedelta(days=7)},
            "deleted_at": None
        })
        lowest_activity.append({
            "id": agent["id"],
            "name": agent["name"],
            "email": agent["email"],
            "last_login": agent.get("last_login").isoformat() if agent.get("last_login") else None,
            "days_since_login": (today - agent.get("last_login", today - timedelta(days=999))).days if agent.get("last_login") else 999,
            "leads_last_7_days": lead_count
        })
    
    lowest_activity.sort(key=lambda x: x["days_since_login"], reverse=True)
    lowest_activity = lowest_activity[:10]
    
    # Overdue follow-ups
    overdue_tasks = await db.tasks.find({
        "created_by_user": {"$in": user_ids},
        "status": "pending",
        "due_date": {"$lt": today.strftime("%Y-%m-%d")}
    }).sort("due_date", 1).to_list(20)
    
    overdue_followups = []
    for task in overdue_tasks:
        user = await db.users.find_one({"id": task["created_by_user"]})
        lead = await db.leads.find_one({"id": task.get("lead_id")}) if task.get("lead_id") else None
        overdue_followups.append({
            "id": task["id"],
            "title": task["title"],
            "task_type": task.get("task_type", "follow_up"),
            "due_date": task["due_date"],
            "days_overdue": (today - datetime.strptime(task["due_date"], "%Y-%m-%d")).days,
            "agent_id": task["created_by_user"],
            "agent_name": user["name"] if user else "Unknown",
            "lead_id": task.get("lead_id"),
            "lead_name": lead["name"] if lead else None
        })
    
    return TeamPerformanceSection(
        top_producers=top_producers,
        top_managers=top_managers,
        lowest_activity=lowest_activity,
        overdue_followups=overdue_followups
    )

@api_router.get("/agency-command-center/pipeline-health")
async def get_agency_pipeline_health(current_user: dict = Depends(require_manager_or_admin)):
    """Get pipeline health section data"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = today - timedelta(days=7)
    
    async def get_leads_by_stage(stages: List[str], limit: int = 20) -> List[Dict]:
        leads = await db.leads.find({
            "created_by_user": {"$in": user_ids},
            "stage": {"$in": stages},
            "deleted_at": None
        }).sort("created_date", -1).to_list(limit)
        
        result = []
        for lead in leads:
            user = await db.users.find_one({"id": lead["created_by_user"]})
            # Check if stalled (no activity in 7 days)
            last_activity = lead.get("last_contact_date") or lead.get("created_date")
            is_stalled = last_activity < seven_days_ago if last_activity else True
            
            result.append({
                "id": lead["id"],
                "name": lead["name"],
                "phone": lead.get("phone", ""),
                "email": lead.get("email", ""),
                "stage": lead["stage"],
                "created_date": lead["created_date"].isoformat() if lead.get("created_date") else None,
                "last_contact_date": lead.get("last_contact_date").isoformat() if lead.get("last_contact_date") else None,
                "agent_id": lead["created_by_user"],
                "agent_name": user["name"] if user else "Unknown",
                "is_stalled": is_stalled,
                "days_in_stage": (today - lead.get("created_date", today)).days
            })
        return result
    
    # Underwriting review
    underwriting_review = await get_leads_by_stage(["underwriting_review"])
    
    # Additional requirements
    additional_requirements = await get_leads_by_stage(["additional_requirements"])
    
    # Approved cases
    approved_cases = await get_leads_by_stage(["approved"])
    
    # Issued policies
    issued_policies = await get_leads_by_stage(["policy_issued", "policy_placed"])
    
    # Stalled cases (no activity in 7+ days, not in final stages)
    active_stages = ["new_lead", "appointment_scheduled", "application_submitted", "underwriting_review", "additional_requirements", "approved"]
    stalled_leads = await db.leads.find({
        "created_by_user": {"$in": user_ids},
        "stage": {"$in": active_stages},
        "deleted_at": None,
        "$or": [
            {"last_contact_date": {"$lt": seven_days_ago}},
            {"last_contact_date": None, "created_date": {"$lt": seven_days_ago}}
        ]
    }).sort("last_contact_date", 1).to_list(20)
    
    stalled_cases = []
    for lead in stalled_leads:
        user = await db.users.find_one({"id": lead["created_by_user"]})
        last_activity = lead.get("last_contact_date") or lead.get("created_date")
        days_stalled = (today - last_activity).days if last_activity else 999
        
        stalled_cases.append({
            "id": lead["id"],
            "name": lead["name"],
            "phone": lead.get("phone", ""),
            "email": lead.get("email", ""),
            "stage": lead["stage"],
            "created_date": lead["created_date"].isoformat() if lead.get("created_date") else None,
            "last_contact_date": lead.get("last_contact_date").isoformat() if lead.get("last_contact_date") else None,
            "agent_id": lead["created_by_user"],
            "agent_name": user["name"] if user else "Unknown",
            "days_stalled": days_stalled
        })
    
    stalled_cases.sort(key=lambda x: x["days_stalled"], reverse=True)
    
    return PipelineHealthSection(
        underwriting_review=underwriting_review,
        additional_requirements=additional_requirements,
        approved_cases=approved_cases,
        issued_policies=issued_policies,
        stalled_cases=stalled_cases
    )

@api_router.get("/agency-command-center/activity-tracking")
async def get_agency_activity_tracking(current_user: dict = Depends(require_manager_or_admin)):
    """Get activity tracking section data"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_str = today.strftime("%Y-%m-%d")
    three_days_ago = today - timedelta(days=3)
    
    # Logged in today
    logged_in_users = await db.users.find({
        "id": {"$in": user_ids},
        "last_login": {"$gte": today},
        "deleted_at": None
    }).to_list(100)
    
    logged_in_today = []
    for user in logged_in_users:
        lead_count = await db.leads.count_documents({"created_by_user": user["id"], "deleted_at": None})
        apt_today = await db.appointments.count_documents({
            "created_by_user": user["id"],
            "appointment_date": today_str
        })
        logged_in_today.append({
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user.get("role", "agent"),
            "last_login": user.get("last_login").isoformat() if user.get("last_login") else None,
            "leads_count": lead_count,
            "appointments_today": apt_today
        })
    
    # Not logged in recently (3+ days)
    not_logged = await db.users.find({
        "id": {"$in": user_ids},
        "role": {"$in": ["agent", "manager"]},
        "deleted_at": None,
        "$or": [
            {"last_login": {"$lt": three_days_ago}},
            {"last_login": None}
        ]
    }).to_list(50)
    
    not_logged_recently = []
    for user in not_logged:
        days_since = (today - user.get("last_login", today - timedelta(days=999))).days if user.get("last_login") else 999
        not_logged_recently.append({
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user.get("role", "agent"),
            "last_login": user.get("last_login").isoformat() if user.get("last_login") else None,
            "days_since_login": days_since
        })
    
    not_logged_recently.sort(key=lambda x: x["days_since_login"], reverse=True)
    
    # Users with appointments today
    apt_today_pipeline = [
        {"$match": {"created_by_user": {"$in": user_ids}, "appointment_date": today_str}},
        {"$group": {"_id": "$created_by_user", "count": {"$sum": 1}, "appointments": {"$push": {"id": "$id", "lead_id": "$lead_id", "time": "$appointment_time", "status": "$status"}}}}
    ]
    apt_grouped = await db.appointments.aggregate(apt_today_pipeline).to_list(100)
    
    appointments_today_list = []
    for apt in apt_grouped:
        user = await db.users.find_one({"id": apt["_id"]})
        if user:
            # Enrich appointments with lead names
            enriched_apts = []
            for a in apt["appointments"][:5]:  # Limit to 5 per agent
                lead = await db.leads.find_one({"id": a["lead_id"]})
                enriched_apts.append({
                    "id": a["id"],
                    "lead_id": a["lead_id"],
                    "lead_name": lead["name"] if lead else "Unknown",
                    "time": a["time"],
                    "status": a["status"]
                })
            
            appointments_today_list.append({
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user.get("role", "agent"),
                "appointment_count": apt["count"],
                "appointments": enriched_apts
            })
    
    # Overdue lead activity (leads with overdue next_follow_up)
    overdue_leads = await db.leads.find({
        "created_by_user": {"$in": user_ids},
        "next_follow_up": {"$lt": today},
        "stage": {"$nin": ["policy_issued", "policy_placed", "commission_pending", "commission_paid"]},
        "deleted_at": None
    }).sort("next_follow_up", 1).to_list(30)
    
    overdue_lead_activity = []
    agent_overdue_map = {}
    
    for lead in overdue_leads:
        agent_id = lead["created_by_user"]
        if agent_id not in agent_overdue_map:
            user = await db.users.find_one({"id": agent_id})
            agent_overdue_map[agent_id] = {
                "id": agent_id,
                "name": user["name"] if user else "Unknown",
                "email": user["email"] if user else "",
                "overdue_count": 0,
                "leads": []
            }
        
        days_overdue = (today - lead["next_follow_up"]).days if lead.get("next_follow_up") else 0
        agent_overdue_map[agent_id]["overdue_count"] += 1
        if len(agent_overdue_map[agent_id]["leads"]) < 5:
            agent_overdue_map[agent_id]["leads"].append({
                "id": lead["id"],
                "name": lead["name"],
                "phone": lead.get("phone", ""),
                "stage": lead["stage"],
                "next_follow_up": lead["next_follow_up"].isoformat() if lead.get("next_follow_up") else None,
                "days_overdue": days_overdue
            })
    
    overdue_lead_activity = list(agent_overdue_map.values())
    overdue_lead_activity.sort(key=lambda x: x["overdue_count"], reverse=True)
    
    return ActivityTrackingSection(
        logged_in_today=logged_in_today,
        not_logged_recently=not_logged_recently,
        appointments_today=appointments_today_list,
        overdue_lead_activity=overdue_lead_activity
    )

@api_router.get("/agency-command-center/full")
async def get_agency_command_center_full(current_user: dict = Depends(require_manager_or_admin)):
    """Get complete Agency Command Center data in one call"""
    summary = await get_agency_command_center_summary(current_user)
    team_performance = await get_agency_team_performance(current_user)
    pipeline_health = await get_agency_pipeline_health(current_user)
    activity_tracking = await get_agency_activity_tracking(current_user)
    
    return {
        "summary": summary,
        "team_performance": team_performance,
        "pipeline_health": pipeline_health,
        "activity_tracking": activity_tracking
    }

# ==================== NEEDS ATTENTION / COACHING ALERTS ====================

class AlertItem(BaseModel):
    id: str
    alert_type: str
    severity: str  # critical, warning, info
    title: str
    subtitle: str
    details: Dict[str, Any]
    related_id: str
    related_type: str  # user, lead, appointment, commission
    created_at: Optional[datetime] = None

class AlertCategory(BaseModel):
    category: str
    title: str
    icon: str
    count: int
    severity: str
    alerts: List[AlertItem]

class NeedsAttentionResponse(BaseModel):
    total_alerts: int
    critical_count: int
    warning_count: int
    categories: List[AlertCategory]

@api_router.get("/needs-attention")
async def get_needs_attention_alerts(current_user: dict = Depends(require_manager_or_admin)):
    """Get all needs attention alerts for leadership dashboard"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    three_days_ago = today - timedelta(days=3)
    seven_days_ago = today - timedelta(days=7)
    fourteen_days_ago = today - timedelta(days=14)
    thirty_days_ago = today - timedelta(days=30)
    today_str = today.strftime("%Y-%m-%d")
    
    categories = []
    total_critical = 0
    total_warning = 0
    
    # ==================== AGENT ALERTS ====================
    
    # 1. Agents not logged in recently (3+ days)
    not_logged_agents = await db.users.find({
        "id": {"$in": user_ids},
        "role": {"$in": ["agent", "manager"]},
        "deleted_at": None,
        "$or": [
            {"last_login": {"$lt": three_days_ago}},
            {"last_login": None}
        ]
    }).to_list(100)
    
    not_logged_alerts = []
    for agent in not_logged_agents:
        days_since = (today - agent.get("last_login", today - timedelta(days=999))).days if agent.get("last_login") else 999
        severity = "critical" if days_since >= 7 else "warning"
        if severity == "critical":
            total_critical += 1
        else:
            total_warning += 1
        
        not_logged_alerts.append(AlertItem(
            id=f"not_logged_{agent['id']}",
            alert_type="not_logged_in",
            severity=severity,
            title=agent["name"],
            subtitle=f"Last login: {days_since} days ago" if days_since < 999 else "Never logged in",
            details={
                "email": agent["email"],
                "role": agent.get("role", "agent"),
                "last_login": agent.get("last_login").isoformat() if agent.get("last_login") else None,
                "days_since_login": days_since
            },
            related_id=agent["id"],
            related_type="user"
        ))
    
    not_logged_alerts.sort(key=lambda x: x.details.get("days_since_login", 999), reverse=True)
    
    if not_logged_alerts:
        categories.append(AlertCategory(
            category="agents_not_logged",
            title="Agents Not Logged In",
            icon="log-out",
            count=len(not_logged_alerts),
            severity="critical" if any(a.severity == "critical" for a in not_logged_alerts) else "warning",
            alerts=not_logged_alerts[:20]
        ))
    
    # 2. Agents with low activity (no leads/appointments in 7 days)
    all_agents = await db.users.find({
        "id": {"$in": user_ids},
        "role": "agent",
        "deleted_at": None,
        "last_login": {"$gte": seven_days_ago}  # Only check active agents
    }).to_list(100)
    
    low_activity_alerts = []
    for agent in all_agents:
        # Check lead activity
        recent_leads = await db.leads.count_documents({
            "created_by_user": agent["id"],
            "created_date": {"$gte": seven_days_ago},
            "deleted_at": None
        })
        recent_appointments = await db.appointments.count_documents({
            "created_by_user": agent["id"],
            "created_date": {"$gte": seven_days_ago}
        })
        
        if recent_leads == 0 and recent_appointments < 2:
            severity = "warning"
            total_warning += 1
            low_activity_alerts.append(AlertItem(
                id=f"low_activity_{agent['id']}",
                alert_type="low_activity",
                severity=severity,
                title=agent["name"],
                subtitle=f"{recent_leads} leads, {recent_appointments} appointments (7 days)",
                details={
                    "email": agent["email"],
                    "recent_leads": recent_leads,
                    "recent_appointments": recent_appointments,
                    "last_login": agent.get("last_login").isoformat() if agent.get("last_login") else None
                },
                related_id=agent["id"],
                related_type="user"
            ))
    
    if low_activity_alerts:
        categories.append(AlertCategory(
            category="low_activity",
            title="Low Activity Agents",
            icon="trending-down",
            count=len(low_activity_alerts),
            severity="warning",
            alerts=low_activity_alerts[:20]
        ))
    
    # ==================== LEAD ALERTS ====================
    
    # 3. Leads not contacted within 48 hours (new leads)
    uncontacted_leads = await db.leads.find({
        "created_by_user": {"$in": user_ids},
        "created_date": {"$lt": today - timedelta(days=2)},
        "last_contact_date": None,
        "stage": "new_lead",
        "deleted_at": None
    }).sort("created_date", 1).to_list(50)
    
    uncontacted_alerts = []
    for lead in uncontacted_leads:
        days_waiting = (today - lead.get("created_date", today)).days
        severity = "critical" if days_waiting >= 5 else "warning"
        if severity == "critical":
            total_critical += 1
        else:
            total_warning += 1
        
        agent = await db.users.find_one({"id": lead["created_by_user"]})
        uncontacted_alerts.append(AlertItem(
            id=f"uncontacted_{lead['id']}",
            alert_type="uncontacted_lead",
            severity=severity,
            title=lead["name"],
            subtitle=f"Waiting {days_waiting} days • {agent['name'] if agent else 'Unknown'}",
            details={
                "phone": lead.get("phone", ""),
                "email": lead.get("email", ""),
                "agent_name": agent["name"] if agent else "Unknown",
                "agent_id": lead["created_by_user"],
                "created_date": lead.get("created_date").isoformat() if lead.get("created_date") else None,
                "days_waiting": days_waiting
            },
            related_id=lead["id"],
            related_type="lead"
        ))
    
    if uncontacted_alerts:
        categories.append(AlertCategory(
            category="uncontacted_leads",
            title="Leads Not Contacted",
            icon="person-add",
            count=len(uncontacted_alerts),
            severity="critical" if any(a.severity == "critical" for a in uncontacted_alerts) else "warning",
            alerts=uncontacted_alerts[:20]
        ))
    
    # 4. Overdue follow-ups
    overdue_tasks = await db.tasks.find({
        "created_by_user": {"$in": user_ids},
        "status": "pending",
        "due_date": {"$lt": today_str}
    }).sort("due_date", 1).to_list(50)
    
    overdue_followup_alerts = []
    for task in overdue_tasks:
        days_overdue = (today - datetime.strptime(task["due_date"], "%Y-%m-%d")).days
        severity = "critical" if days_overdue >= 7 else "warning"
        if severity == "critical":
            total_critical += 1
        else:
            total_warning += 1
        
        agent = await db.users.find_one({"id": task["created_by_user"]})
        lead = await db.leads.find_one({"id": task.get("lead_id")}) if task.get("lead_id") else None
        
        overdue_followup_alerts.append(AlertItem(
            id=f"overdue_task_{task['id']}",
            alert_type="overdue_followup",
            severity=severity,
            title=task["title"],
            subtitle=f"{days_overdue} days overdue • {agent['name'] if agent else 'Unknown'}",
            details={
                "task_type": task.get("task_type", "follow_up"),
                "due_date": task["due_date"],
                "days_overdue": days_overdue,
                "agent_name": agent["name"] if agent else "Unknown",
                "agent_id": task["created_by_user"],
                "lead_id": task.get("lead_id"),
                "lead_name": lead["name"] if lead else None
            },
            related_id=task.get("lead_id") or task["id"],
            related_type="lead" if task.get("lead_id") else "task"
        ))
    
    if overdue_followup_alerts:
        categories.append(AlertCategory(
            category="overdue_followups",
            title="Overdue Follow-ups",
            icon="time",
            count=len(overdue_followup_alerts),
            severity="critical" if any(a.severity == "critical" for a in overdue_followup_alerts) else "warning",
            alerts=overdue_followup_alerts[:20]
        ))
    
    # ==================== APPOINTMENT ALERTS ====================
    
    # 5. Missed appointments (past date, status still scheduled)
    missed_appointments = await db.appointments.find({
        "created_by_user": {"$in": user_ids},
        "appointment_date": {"$lt": today_str},
        "status": {"$in": ["scheduled", "pending"]}
    }).sort("appointment_date", -1).to_list(50)
    
    missed_alerts = []
    for apt in missed_appointments:
        try:
            apt_date = datetime.strptime(apt["appointment_date"], "%Y-%m-%d")
            days_missed = (today - apt_date).days
        except:
            days_missed = 1
        
        severity = "critical" if days_missed >= 3 else "warning"
        if severity == "critical":
            total_critical += 1
        else:
            total_warning += 1
        
        agent = await db.users.find_one({"id": apt["created_by_user"]})
        lead = await db.leads.find_one({"id": apt["lead_id"]})
        
        missed_alerts.append(AlertItem(
            id=f"missed_apt_{apt['id']}",
            alert_type="missed_appointment",
            severity=severity,
            title=lead["name"] if lead else "Unknown Lead",
            subtitle=f"Missed {days_missed} day(s) ago • {agent['name'] if agent else 'Unknown'}",
            details={
                "appointment_date": apt["appointment_date"],
                "appointment_time": apt.get("appointment_time", ""),
                "days_missed": days_missed,
                "agent_name": agent["name"] if agent else "Unknown",
                "agent_id": apt["created_by_user"],
                "lead_id": apt["lead_id"]
            },
            related_id=apt["lead_id"],
            related_type="lead"
        ))
    
    if missed_alerts:
        categories.append(AlertCategory(
            category="missed_appointments",
            title="Missed Appointments",
            icon="calendar-clear",
            count=len(missed_alerts),
            severity="critical" if any(a.severity == "critical" for a in missed_alerts) else "warning",
            alerts=missed_alerts[:20]
        ))
    
    # 6. Appointments with no outcome logged (completed but no outcome)
    no_outcome_appointments = await db.appointments.find({
        "created_by_user": {"$in": user_ids},
        "status": "completed",
        "$or": [{"outcome": None}, {"outcome": ""}, {"outcome": {"$exists": False}}]
    }).sort("appointment_date", -1).to_list(50)
    
    no_outcome_alerts = []
    for apt in no_outcome_appointments:
        severity = "warning"
        total_warning += 1
        
        agent = await db.users.find_one({"id": apt["created_by_user"]})
        lead = await db.leads.find_one({"id": apt["lead_id"]})
        
        no_outcome_alerts.append(AlertItem(
            id=f"no_outcome_{apt['id']}",
            alert_type="no_outcome",
            severity=severity,
            title=lead["name"] if lead else "Unknown Lead",
            subtitle=f"Completed {apt['appointment_date']} • No outcome logged",
            details={
                "appointment_date": apt["appointment_date"],
                "appointment_time": apt.get("appointment_time", ""),
                "agent_name": agent["name"] if agent else "Unknown",
                "agent_id": apt["created_by_user"],
                "lead_id": apt["lead_id"]
            },
            related_id=apt["lead_id"],
            related_type="lead"
        ))
    
    if no_outcome_alerts:
        categories.append(AlertCategory(
            category="no_outcome",
            title="No Outcome Logged",
            icon="help-circle",
            count=len(no_outcome_alerts),
            severity="warning",
            alerts=no_outcome_alerts[:20]
        ))
    
    # ==================== PIPELINE ALERTS ====================
    
    # 7. Applications stalled in pipeline (application_submitted stage for 7+ days)
    stalled_applications = await db.leads.find({
        "created_by_user": {"$in": user_ids},
        "stage": "application_submitted",
        "deleted_at": None,
        "$or": [
            {"last_contact_date": {"$lt": seven_days_ago}},
            {"last_contact_date": None, "created_date": {"$lt": seven_days_ago}}
        ]
    }).to_list(50)
    
    stalled_app_alerts = []
    for lead in stalled_applications:
        last_activity = lead.get("last_contact_date") or lead.get("created_date")
        days_stalled = (today - last_activity).days if last_activity else 999
        
        severity = "critical" if days_stalled >= 14 else "warning"
        if severity == "critical":
            total_critical += 1
        else:
            total_warning += 1
        
        agent = await db.users.find_one({"id": lead["created_by_user"]})
        
        stalled_app_alerts.append(AlertItem(
            id=f"stalled_app_{lead['id']}",
            alert_type="stalled_application",
            severity=severity,
            title=lead["name"],
            subtitle=f"Stalled {days_stalled} days • {agent['name'] if agent else 'Unknown'}",
            details={
                "phone": lead.get("phone", ""),
                "stage": lead["stage"],
                "days_stalled": days_stalled,
                "agent_name": agent["name"] if agent else "Unknown",
                "agent_id": lead["created_by_user"],
                "last_contact": last_activity.isoformat() if last_activity else None
            },
            related_id=lead["id"],
            related_type="lead"
        ))
    
    if stalled_app_alerts:
        categories.append(AlertCategory(
            category="stalled_applications",
            title="Stalled Applications",
            icon="document-text",
            count=len(stalled_app_alerts),
            severity="critical" if any(a.severity == "critical" for a in stalled_app_alerts) else "warning",
            alerts=stalled_app_alerts[:20]
        ))
    
    # 8. Underwriting waiting on requirements (additional_requirements stage)
    waiting_requirements = await db.leads.find({
        "created_by_user": {"$in": user_ids},
        "stage": "additional_requirements",
        "deleted_at": None
    }).to_list(50)
    
    waiting_req_alerts = []
    for lead in waiting_requirements:
        last_activity = lead.get("last_contact_date") or lead.get("created_date")
        days_waiting = (today - last_activity).days if last_activity else 0
        
        severity = "critical" if days_waiting >= 7 else "warning"
        if severity == "critical":
            total_critical += 1
        else:
            total_warning += 1
        
        agent = await db.users.find_one({"id": lead["created_by_user"]})
        
        waiting_req_alerts.append(AlertItem(
            id=f"waiting_req_{lead['id']}",
            alert_type="waiting_requirements",
            severity=severity,
            title=lead["name"],
            subtitle=f"Waiting {days_waiting} days • {agent['name'] if agent else 'Unknown'}",
            details={
                "phone": lead.get("phone", ""),
                "stage": lead["stage"],
                "days_waiting": days_waiting,
                "agent_name": agent["name"] if agent else "Unknown",
                "agent_id": lead["created_by_user"]
            },
            related_id=lead["id"],
            related_type="lead"
        ))
    
    waiting_req_alerts.sort(key=lambda x: x.details.get("days_waiting", 0), reverse=True)
    
    if waiting_req_alerts:
        categories.append(AlertCategory(
            category="waiting_requirements",
            title="Waiting on Requirements",
            icon="clipboard",
            count=len(waiting_req_alerts),
            severity="critical" if any(a.severity == "critical" for a in waiting_req_alerts) else "warning",
            alerts=waiting_req_alerts[:20]
        ))
    
    # ==================== COMMISSION ALERTS ====================
    
    # 9. Commissions pending too long (30+ days in pending status)
    pending_commissions = await db.commissions.find({
        "created_by_user": {"$in": user_ids},
        "commission_status": {"$in": ["pending", "approved"]},
        "created_date": {"$lt": thirty_days_ago}
    }).to_list(50)
    
    commission_alerts = []
    for comm in pending_commissions:
        days_pending = (today - comm.get("created_date", today)).days
        
        severity = "critical" if days_pending >= 60 else "warning"
        if severity == "critical":
            total_critical += 1
        else:
            total_warning += 1
        
        agent = await db.users.find_one({"id": comm["created_by_user"]})
        lead = await db.leads.find_one({"id": comm.get("lead_id")}) if comm.get("lead_id") else None
        
        commission_alerts.append(AlertItem(
            id=f"pending_comm_{comm['id']}",
            alert_type="pending_commission",
            severity=severity,
            title=f"{comm.get('carrier', 'Unknown')} - {comm.get('policy_type', 'Policy')}",
            subtitle=f"Pending {days_pending} days • ${comm.get('estimated_commission', 0):,.0f}",
            details={
                "carrier": comm.get("carrier", ""),
                "policy_type": comm.get("policy_type", ""),
                "estimated_commission": comm.get("estimated_commission", 0),
                "days_pending": days_pending,
                "status": comm.get("commission_status", "pending"),
                "agent_name": agent["name"] if agent else "Unknown",
                "agent_id": comm["created_by_user"],
                "lead_id": comm.get("lead_id"),
                "lead_name": lead["name"] if lead else None
            },
            related_id=comm["id"],
            related_type="commission"
        ))
    
    commission_alerts.sort(key=lambda x: x.details.get("days_pending", 0), reverse=True)
    
    if commission_alerts:
        categories.append(AlertCategory(
            category="pending_commissions",
            title="Commissions Pending Too Long",
            icon="cash",
            count=len(commission_alerts),
            severity="critical" if any(a.severity == "critical" for a in commission_alerts) else "warning",
            alerts=commission_alerts[:20]
        ))
    
    # Sort categories by severity and count
    categories.sort(key=lambda x: (0 if x.severity == "critical" else 1, -x.count))
    
    total_alerts = sum(c.count for c in categories)
    
    return NeedsAttentionResponse(
        total_alerts=total_alerts,
        critical_count=total_critical,
        warning_count=total_warning,
        categories=categories
    )

@api_router.get("/needs-attention/category/{category}")
async def get_needs_attention_category(category: str, current_user: dict = Depends(require_manager_or_admin)):
    """Get all alerts for a specific category"""
    full_response = await get_needs_attention_alerts(current_user)
    
    for cat in full_response.categories:
        if cat.category == category:
            return cat
    
    raise HTTPException(status_code=404, detail=f"Category '{category}' not found")

@api_router.get("/needs-attention/summary")
async def get_needs_attention_summary(current_user: dict = Depends(require_manager_or_admin)):
    """Get just the summary counts for quick overview"""
    full_response = await get_needs_attention_alerts(current_user)
    
    return {
        "total_alerts": full_response.total_alerts,
        "critical_count": full_response.critical_count,
        "warning_count": full_response.warning_count,
        "categories_count": len(full_response.categories),
        "category_summaries": [
            {"category": c.category, "title": c.title, "count": c.count, "severity": c.severity, "icon": c.icon}
            for c in full_response.categories
        ]
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
