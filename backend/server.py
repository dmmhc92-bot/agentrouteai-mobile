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
SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError("FATAL: JWT_SECRET_KEY environment variable is required but not set")
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
    role: Optional[str] = "agent"  # Will be enforced to agent for public signup
    manager_id: Optional[str] = None
    phone: Optional[str] = None
    territory: Optional[str] = None
    invite_token: Optional[str] = None  # For accepting invitations

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    manager_id: Optional[str]
    admin_id: Optional[str] = None
    organization_id: Optional[str] = None
    subscription_status: str
    created_at: datetime
    last_login: Optional[datetime]
    phone: Optional[str]
    territory: Optional[str]
    commission_rate: Optional[float]
    is_active: bool
    approval_status: Optional[str] = "approved"
    account_mode: Optional[str] = "solo"  # 'solo' or 'connected'
    organization_name: Optional[str] = None
    upline_name: Optional[str] = None
    joined_team_at: Optional[datetime] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# Invitation Models
class InvitationCreate(BaseModel):
    email: Optional[EmailStr] = None  # Optional - can create open invite without email
    role: str  # 'manager' or 'agent'
    name: Optional[str] = None

class InvitationResponse(BaseModel):
    id: str
    email: Optional[str]
    role: str
    name: Optional[str]
    status: str
    admin_id: str
    manager_id: Optional[str]
    organization_id: str
    invited_by_user_id: str
    invited_by_name: str
    created_at: datetime
    expires_at: datetime
    token: Optional[str] = None  # Include token for sharing
    invite_link: Optional[str] = None

class InvitationAccept(BaseModel):
    token: str
    name: str
    password: str
    phone: Optional[str] = None

# Account Mode Models
class JoinTeamRequest(BaseModel):
    token: str

class LeaveTeamRequest(BaseModel):
    confirm: bool = False

# User Management Models
class UserRoleUpdate(BaseModel):
    role: str  # 'manager' or 'agent'

class UserStatusUpdate(BaseModel):
    is_active: bool

class UserReassign(BaseModel):
    new_manager_id: str

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

class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class InviteStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

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

# ==================== ACTIVITY & COMPLIANCE MODELS ====================

class LeadActivityEntry(BaseModel):
    id: str
    lead_id: str
    activity_type: str  # created, assigned, contacted, stage_changed, note_added, appointment_set, soa_completed
    description: str
    performed_by: str
    performed_by_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: datetime

class LeadActivityCreate(BaseModel):
    lead_id: str
    activity_type: str
    description: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None

class ComplianceRecord(BaseModel):
    lead_id: str
    lead_name: str
    appointment_id: Optional[str] = None
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    soa_id: Optional[str] = None
    soa_signed: bool = False
    soa_signature_timestamp: Optional[datetime] = None
    soa_pdf_available: bool = False
    compliance_status: str  # missing_soa, pending_signature, signed, compliant
    agent_id: str
    agent_name: str
    created_date: Optional[datetime] = None
    last_updated: Optional[datetime] = None

class ComplianceSummary(BaseModel):
    total_leads: int
    leads_with_soa: int
    leads_without_soa: int
    signed_soas: int
    pending_soas: int
    appointments_without_soa: int
    compliant_appointments: int
    compliance_rate: float

class LeadDistributionSummary(BaseModel):
    total_leads: int
    unassigned_leads: int
    assigned_leads: int
    leads_by_stage: Dict[str, int]
    leads_by_agent: List[Dict[str, Any]]
    distribution_methods_used: Dict[str, int]
    avg_leads_per_agent: float
    top_performing_agents: List[Dict[str, Any]]

class AgentPerformanceMetrics(BaseModel):
    agent_id: str
    agent_name: str
    agent_email: str
    total_leads: int
    leads_by_stage: Dict[str, int]
    conversion_rate: float
    avg_response_time_hours: Optional[float]
    soa_completion_rate: float
    closed_won: int
    closed_lost: int
    active_pipeline: int
    last_activity: Optional[datetime]

class SmartDistributionRequest(BaseModel):
    lead_ids: List[str]
    method: str = "equal"  # equal, territory, availability, manager_group
    target_agent_ids: Optional[List[str]] = None
    manager_id: Optional[str] = None  # For manager_group distribution
    respect_territories: bool = True
    balance_workload: bool = True

class SmartDistributionResult(BaseModel):
    total_distributed: int
    assignments: List[Dict[str, Any]]
    skipped: List[Dict[str, str]]  # Lead IDs and reasons for skipping
    method_used: str

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

async def get_user_accessible_ids(user_id: str, role: str, admin_id: str = None, organization_id: str = None) -> List[str]:
    """Get all user IDs that this user can access based on role and organization hierarchy"""
    if role == "admin":
        # Admin sees all users in their organization
        if organization_id:
            users = await db.users.find({"organization_id": organization_id, "deleted_at": None}, {"id": 1}).to_list(10000)
        else:
            # Fallback for existing admins without organization_id
            users = await db.users.find({"deleted_at": None}, {"id": 1}).to_list(10000)
        return [u["id"] for u in users]
    elif role == "manager":
        # Manager sees themselves and their direct agents
        downline = await db.users.find({"manager_id": user_id, "deleted_at": None}, {"id": 1}).to_list(1000)
        return [user_id] + [u["id"] for u in downline]
    else:
        # Agent sees only themselves
        return [user_id]

async def get_user_hierarchy_ids(current_user: dict) -> List[str]:
    """Enhanced helper to get accessible user IDs with full hierarchy context"""
    user_id = current_user["id"]
    role = current_user.get("role", "agent")
    admin_id = current_user.get("admin_id")
    organization_id = current_user.get("organization_id")
    return await get_user_accessible_ids(user_id, role, admin_id, organization_id)

async def get_or_create_organization(admin_user: dict) -> str:
    """Get or create an organization ID for an admin user"""
    if admin_user.get("organization_id"):
        return admin_user["organization_id"]
    
    # Create new organization ID based on admin's ID
    org_id = f"org_{admin_user['id'][:8]}"
    await db.users.update_one(
        {"id": admin_user["id"]},
        {"$set": {"organization_id": org_id, "admin_id": admin_user["id"]}}
    )
    return org_id

def generate_invite_token() -> str:
    """Generate a secure invitation token"""
    return secrets.token_urlsafe(32)

async def validate_hierarchy_permission(current_user: dict, target_role: str, action: str) -> bool:
    """
    Validate that the current user can perform the action on the target role.
    - Admin can create/manage Managers and Agents
    - Manager can only create/manage Agents under themselves
    - Agent cannot create anyone
    """
    current_role = current_user.get("role", "agent")
    
    if current_role == "admin":
        # Admin can manage managers and agents
        if target_role in ["manager", "agent"]:
            return True
        return False  # Cannot create another admin
    elif current_role == "manager":
        # Manager can only manage agents
        if target_role == "agent" and action in ["invite", "view", "manage"]:
            return True
        return False
    else:
        # Agent cannot manage anyone
        return False

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
    """
    Register a new user.
    
    Hierarchy Rules:
    - If invite_token provided: User gets role/hierarchy from invitation
    - If first user in system: Becomes Admin with new organization
    - Otherwise: Public signup defaults to Agent only (no self-role selection)
    """
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    # Initialize hierarchy fields
    role = "agent"  # Default role for public signup
    admin_id = None
    manager_id = None
    organization_id = None
    invited_by_user_id = None
    approval_status = "approved"
    
    # Check if this is an invited user
    if user_data.invite_token:
        invitation = await db.invitations.find_one({
            "token": user_data.invite_token,
            "status": "pending",
            "expires_at": {"$gt": now}
        })
        
        if not invitation:
            raise HTTPException(status_code=400, detail="Invalid or expired invitation token")
        
        if invitation.get("email", "").lower() != user_data.email.lower():
            raise HTTPException(status_code=400, detail="Email does not match invitation")
        
        # Accept invitation - set role and hierarchy from invite
        role = invitation.get("role", "agent")
        admin_id = invitation.get("admin_id")
        manager_id = invitation.get("manager_id")
        organization_id = invitation.get("organization_id")
        invited_by_user_id = invitation.get("invited_by_user_id")
        
        # Mark invitation as accepted
        await db.invitations.update_one(
            {"id": invitation["id"]},
            {"$set": {"status": "accepted", "accepted_at": now, "accepted_by_user_id": user_id}}
        )
        
        logger.info(f"User {user_data.email} accepted invitation for role {role}")
    else:
        # Check if this is the first user (becomes Admin)
        user_count = await db.users.count_documents({"deleted_at": None})
        
        if user_count == 0:
            # First user becomes Admin with their own organization
            role = "admin"
            organization_id = f"org_{user_id[:8]}"
            admin_id = user_id
            logger.info(f"First user {user_data.email} registered as Admin with org {organization_id}")
        else:
            # Public signup: Always agent, no self-role selection allowed
            # Ignore any role passed in user_data for security
            role = "agent"
            approval_status = "pending"  # Require approval for self-signup agents
            logger.info(f"Public signup {user_data.email} registered as Agent (pending approval)")
    
    user_doc = {
        "id": user_id,
        "name": user_data.name,
        "email": user_data.email.lower(),
        "password_hash": get_password_hash(user_data.password),
        "role": role,
        "admin_id": admin_id,
        "manager_id": manager_id,
        "organization_id": organization_id,
        "invited_by_user_id": invited_by_user_id,
        "approval_status": approval_status,
        "phone": user_data.phone,
        "territory": user_data.territory,
        "subscription_status": "trial",
        "commission_rate": 0.6,
        "created_at": now,
        "updated_at": now,
        "last_login": now,
        "is_active": True,
        "deleted_at": None,
        "reset_token": None,
        "reset_token_expiry": None
    }
    await db.users.insert_one(user_doc)
    await log_activity(user_id, "register", f"User registered as {role}")
    
    access_token = create_access_token(data={"sub": user_id})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user_id, 
            name=user_data.name, 
            email=user_data.email.lower(),
            role=role, 
            manager_id=manager_id,
            admin_id=admin_id,
            organization_id=organization_id,
            subscription_status="trial", 
            created_at=user_doc["created_at"],
            last_login=user_doc["last_login"], 
            phone=user_doc["phone"],
            territory=user_doc["territory"], 
            commission_rate=user_doc["commission_rate"],
            is_active=True,
            approval_status=approval_status
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: dict):
    email = credentials.get("email", "").lower()
    password = credentials.get("password", "")
    
    user = await db.users.find_one({"email": email, "deleted_at": None})
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact your administrator.")
    
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": datetime.utcnow()}})
    await log_activity(user["id"], "login", "User logged in")
    
    access_token = create_access_token(data={"sub": user["id"]})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"], 
            name=user["name"], 
            email=user["email"],
            role=user.get("role", "agent"), 
            manager_id=user.get("manager_id"),
            admin_id=user.get("admin_id"),
            organization_id=user.get("organization_id"),
            subscription_status=user.get("subscription_status", "trial"),
            created_at=user["created_at"], 
            last_login=datetime.utcnow(),
            phone=user.get("phone"), 
            territory=user.get("territory"),
            commission_rate=user.get("commission_rate", 0.6),
            is_active=user.get("is_active", True),
            approval_status=user.get("approval_status", "approved")
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
        id=current_user["id"], 
        name=current_user["name"], 
        email=current_user["email"],
        role=current_user.get("role", "agent"), 
        manager_id=current_user.get("manager_id"),
        admin_id=current_user.get("admin_id"),
        organization_id=current_user.get("organization_id"),
        subscription_status=current_user.get("subscription_status", "trial"),
        created_at=current_user["created_at"], 
        last_login=current_user.get("last_login"),
        phone=current_user.get("phone"), 
        territory=current_user.get("territory"),
        commission_rate=current_user.get("commission_rate", 0.6),
        is_active=current_user.get("is_active", True),
        approval_status=current_user.get("approval_status", "approved")
    )

@api_router.delete("/auth/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"deleted_at": datetime.utcnow()}})
    await log_activity(current_user["id"], "account_deleted", "Account deletion requested")
    return {"message": "Account scheduled for deletion"}

# ==================== INVITATION ROUTES ====================

@api_router.post("/invitations", response_model=InvitationResponse)
async def create_invitation(invite_data: InvitationCreate, current_user: dict = Depends(get_current_user)):
    """
    Create an invitation for a new user.
    
    Hierarchy Rules:
    - Admin can invite Managers and Agents
    - Manager can only invite Agents (under themselves)
    - Agent cannot invite anyone
    
    Supports:
    - Email-specific invites (sent to a specific person)
    - Open invites (shareable token without specific email)
    """
    current_role = current_user.get("role", "agent")
    target_role = invite_data.role.lower()
    
    # Validate target role
    if target_role not in ["manager", "agent"]:
        raise HTTPException(status_code=400, detail="Can only invite 'manager' or 'agent' roles")
    
    # Validate permission
    if not await validate_hierarchy_permission(current_user, target_role, "invite"):
        raise HTTPException(status_code=403, detail=f"You do not have permission to invite a {target_role}")
    
    # If email is provided, check if already registered or has pending invite
    if invite_data.email:
        existing_user = await db.users.find_one({"email": invite_data.email.lower()})
        if existing_user:
            raise HTTPException(status_code=400, detail="This email is already registered")
        
        existing_invite = await db.invitations.find_one({
            "email": invite_data.email.lower(),
            "status": "pending"
        })
        if existing_invite:
            raise HTTPException(status_code=400, detail="A pending invitation already exists for this email")
    
    # Determine hierarchy context
    if current_role == "admin":
        admin_id = current_user["id"]
        organization_id = current_user.get("organization_id") or await get_or_create_organization(current_user)
        manager_id = None if target_role == "manager" else current_user["id"]
    else:  # manager
        admin_id = current_user.get("admin_id")
        organization_id = current_user.get("organization_id")
        manager_id = current_user["id"]
    
    # Get organization name for display
    admin_user = await db.users.find_one({"id": admin_id}, {"name": 1})
    organization_name = f"{admin_user.get('name', 'Unknown')}'s Team" if admin_user else "Team"
    
    now = datetime.utcnow()
    invite_id = str(uuid.uuid4())
    token = generate_invite_token()
    
    invitation_doc = {
        "id": invite_id,
        "email": invite_data.email.lower() if invite_data.email else None,
        "name": invite_data.name,
        "role": target_role,
        "token": token,
        "status": "pending",
        "admin_id": admin_id,
        "manager_id": manager_id,
        "organization_id": organization_id,
        "organization_name": organization_name,
        "invited_by_user_id": current_user["id"],
        "is_open_invite": invite_data.email is None,  # Track if this is a shareable link
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "accepted_at": None,
        "accepted_by_user_id": None
    }
    
    await db.invitations.insert_one(invitation_doc)
    
    email_display = invite_data.email if invite_data.email else "(open invite)"
    await log_activity(current_user["id"], "invitation_created", f"Created invite for {email_display} as {target_role}")
    logger.info(f"Invitation created: {email_display} as {target_role}, token: {token}")
    
    return InvitationResponse(
        id=invite_id,
        email=invite_data.email.lower() if invite_data.email else None,
        role=target_role,
        name=invite_data.name,
        status="pending",
        admin_id=admin_id,
        manager_id=manager_id,
        organization_id=organization_id,
        invited_by_user_id=current_user["id"],
        invited_by_name=current_user.get("name", "Unknown"),
        created_at=now,
        expires_at=invitation_doc["expires_at"],
        token=token,
        invite_link=f"/invite/{token}"
    )

@api_router.get("/invitations")
async def get_invitations(current_user: dict = Depends(require_manager_or_admin)):
    """Get all invitations for the current user's organization"""
    current_role = current_user.get("role", "agent")
    
    if current_role == "admin":
        # Admin sees all invitations in their organization
        org_id = current_user.get("organization_id")
        if org_id:
            invitations = await db.invitations.find({"organization_id": org_id}).sort("created_at", -1).to_list(1000)
        else:
            invitations = await db.invitations.find({"admin_id": current_user["id"]}).sort("created_at", -1).to_list(1000)
    else:
        # Manager sees only invitations they created
        invitations = await db.invitations.find({"invited_by_user_id": current_user["id"]}).sort("created_at", -1).to_list(1000)
    
    # Enrich with invited_by_name
    result = []
    for inv in invitations:
        inviter = await db.users.find_one({"id": inv.get("invited_by_user_id")}, {"name": 1})
        result.append({
            "id": inv["id"],
            "email": inv["email"],
            "name": inv.get("name"),
            "role": inv["role"],
            "status": inv["status"],
            "admin_id": inv.get("admin_id"),
            "manager_id": inv.get("manager_id"),
            "organization_id": inv.get("organization_id"),
            "invited_by_user_id": inv.get("invited_by_user_id"),
            "invited_by_name": inviter.get("name") if inviter else "Unknown",
            "created_at": inv["created_at"],
            "expires_at": inv["expires_at"],
            "token": inv.get("token")  # Include token for admin to share
        })
    
    return result

@api_router.get("/invitations/{invite_id}")
async def get_invitation(invite_id: str, current_user: dict = Depends(require_manager_or_admin)):
    """Get a specific invitation"""
    invitation = await db.invitations.find_one({"id": invite_id})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Check permission
    current_role = current_user.get("role")
    if current_role != "admin" and invitation.get("invited_by_user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    inviter = await db.users.find_one({"id": invitation.get("invited_by_user_id")}, {"name": 1})
    
    return {
        "id": invitation["id"],
        "email": invitation["email"],
        "name": invitation.get("name"),
        "role": invitation["role"],
        "status": invitation["status"],
        "token": invitation.get("token"),
        "admin_id": invitation.get("admin_id"),
        "manager_id": invitation.get("manager_id"),
        "organization_id": invitation.get("organization_id"),
        "invited_by_user_id": invitation.get("invited_by_user_id"),
        "invited_by_name": inviter.get("name") if inviter else "Unknown",
        "created_at": invitation["created_at"],
        "expires_at": invitation["expires_at"]
    }

@api_router.get("/invitations/validate/{token}")
async def validate_invitation(token: str):
    """Validate an invitation token (public endpoint for signup flow)"""
    invitation = await db.invitations.find_one({
        "token": token,
        "status": "pending",
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    
    inviter = await db.users.find_one({"id": invitation.get("invited_by_user_id")}, {"name": 1})
    
    return {
        "valid": True,
        "email": invitation["email"],
        "name": invitation.get("name"),
        "role": invitation["role"],
        "invited_by_name": inviter.get("name") if inviter else "Unknown",
        "expires_at": invitation["expires_at"]
    }

@api_router.post("/invitations/{invite_id}/resend")
async def resend_invitation(invite_id: str, current_user: dict = Depends(require_manager_or_admin)):
    """Resend an invitation (extend expiration)"""
    invitation = await db.invitations.find_one({"id": invite_id})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Check permission
    current_role = current_user.get("role")
    if current_role != "admin" and invitation.get("invited_by_user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if invitation.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Can only resend pending invitations")
    
    # Generate new token and extend expiration
    new_token = generate_invite_token()
    new_expiry = datetime.utcnow() + timedelta(days=7)
    
    await db.invitations.update_one(
        {"id": invite_id},
        {"$set": {"token": new_token, "expires_at": new_expiry}}
    )
    
    logger.info(f"Invitation resent: {invitation['email']}, new token: {new_token}")
    
    return {"message": "Invitation resent", "token": new_token, "expires_at": new_expiry}

@api_router.delete("/invitations/{invite_id}")
async def cancel_invitation(invite_id: str, current_user: dict = Depends(require_manager_or_admin)):
    """Cancel a pending invitation"""
    invitation = await db.invitations.find_one({"id": invite_id})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Check permission
    current_role = current_user.get("role")
    if current_role != "admin" and invitation.get("invited_by_user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if invitation.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Can only cancel pending invitations")
    
    await db.invitations.update_one(
        {"id": invite_id},
        {"$set": {"status": "cancelled"}}
    )
    
    await log_activity(current_user["id"], "invitation_cancelled", f"Cancelled invitation for {invitation['email']}")
    
    return {"message": "Invitation cancelled"}

# ==================== USER MANAGEMENT ROUTES ====================

@api_router.get("/users")
async def get_users(current_user: dict = Depends(require_manager_or_admin)):
    """
    Get users based on role hierarchy.
    - Admin sees all users in organization
    - Manager sees only their agents
    """
    current_role = current_user.get("role")
    
    if current_role == "admin":
        org_id = current_user.get("organization_id")
        if org_id:
            query = {"organization_id": org_id, "deleted_at": None}
        else:
            # Fallback for admin without org_id
            query = {"deleted_at": None}
    else:
        # Manager sees agents under them
        query = {"manager_id": current_user["id"], "deleted_at": None}
    
    users = await db.users.find(query).to_list(1000)
    
    result = []
    for user in users:
        # Get manager name if applicable
        manager_name = None
        if user.get("manager_id"):
            manager = await db.users.find_one({"id": user["manager_id"]}, {"name": 1})
            manager_name = manager.get("name") if manager else None
        
        result.append({
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user.get("role", "agent"),
            "manager_id": user.get("manager_id"),
            "manager_name": manager_name,
            "admin_id": user.get("admin_id"),
            "organization_id": user.get("organization_id"),
            "phone": user.get("phone"),
            "territory": user.get("territory"),
            "is_active": user.get("is_active", True),
            "approval_status": user.get("approval_status", "approved"),
            "created_at": user["created_at"],
            "last_login": user.get("last_login")
        })
    
    return result

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role_data: UserRoleUpdate, current_user: dict = Depends(require_admin)):
    """
    Promote/demote a user between Manager and Agent (Admin only).
    Cannot change to/from Admin role.
    """
    target_role = role_data.role.lower()
    
    if target_role not in ["manager", "agent"]:
        raise HTTPException(status_code=400, detail="Can only set role to 'manager' or 'agent'")
    
    target_user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent changing admin role
    if target_user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Cannot change admin role")
    
    # Check same organization
    if target_user.get("organization_id") != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="User is not in your organization")
    
    old_role = target_user.get("role", "agent")
    
    # If demoting from manager to agent, clear any agents' manager_id pointing to this user
    if old_role == "manager" and target_role == "agent":
        await db.users.update_many(
            {"manager_id": user_id},
            {"$set": {"manager_id": None}}
        )
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": target_role, "updated_at": datetime.utcnow()}}
    )
    
    await log_activity(current_user["id"], "user_role_changed", f"Changed {target_user['name']} from {old_role} to {target_role}")
    
    return {"message": f"User role changed to {target_role}", "old_role": old_role, "new_role": target_role}

@api_router.put("/users/{user_id}/status")
async def update_user_status(user_id: str, status_data: UserStatusUpdate, current_user: dict = Depends(require_admin)):
    """Activate or deactivate a user (Admin only)"""
    target_user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Cannot deactivate yourself
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    
    # Check same organization
    if target_user.get("organization_id") != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="User is not in your organization")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_active": status_data.is_active, "updated_at": datetime.utcnow()}}
    )
    
    action = "activated" if status_data.is_active else "deactivated"
    await log_activity(current_user["id"], f"user_{action}", f"{action.capitalize()} user {target_user['name']}")
    
    return {"message": f"User {action}", "is_active": status_data.is_active}

@api_router.put("/users/{user_id}/reassign")
async def reassign_user(user_id: str, reassign_data: UserReassign, current_user: dict = Depends(require_admin)):
    """Reassign an agent to a different manager (Admin only)"""
    target_user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("role") != "agent":
        raise HTTPException(status_code=400, detail="Can only reassign agents")
    
    # Validate new manager
    new_manager = await db.users.find_one({"id": reassign_data.new_manager_id, "deleted_at": None})
    if not new_manager:
        raise HTTPException(status_code=404, detail="New manager not found")
    
    if new_manager.get("role") not in ["manager", "admin"]:
        raise HTTPException(status_code=400, detail="Target must be a manager or admin")
    
    # Check same organization
    if new_manager.get("organization_id") != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="New manager is not in your organization")
    
    old_manager_id = target_user.get("manager_id")
    old_manager = await db.users.find_one({"id": old_manager_id}, {"name": 1}) if old_manager_id else None
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"manager_id": reassign_data.new_manager_id, "updated_at": datetime.utcnow()}}
    )
    
    await log_activity(
        current_user["id"], 
        "user_reassigned", 
        f"Reassigned {target_user['name']} from {old_manager.get('name') if old_manager else 'None'} to {new_manager['name']}"
    )
    
    return {
        "message": "Agent reassigned",
        "old_manager_id": old_manager_id,
        "new_manager_id": reassign_data.new_manager_id,
        "new_manager_name": new_manager["name"]
    }

@api_router.put("/users/{user_id}/approve")
async def approve_user(user_id: str, current_user: dict = Depends(require_admin)):
    """Approve a pending user (Admin only)"""
    target_user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("approval_status") != "pending":
        raise HTTPException(status_code=400, detail="User is not pending approval")
    
    # Assign to admin's organization
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "approval_status": "approved",
            "admin_id": current_user["id"],
            "organization_id": current_user.get("organization_id"),
            "updated_at": datetime.utcnow()
        }}
    )
    
    await log_activity(current_user["id"], "user_approved", f"Approved user {target_user['name']}")
    
    return {"message": "User approved"}

@api_router.get("/users/pending-approval")
async def get_pending_users(current_user: dict = Depends(require_admin)):
    """Get users pending approval (Admin only)"""
    users = await db.users.find({
        "approval_status": "pending",
        "deleted_at": None
    }).to_list(100)
    
    return [{
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "phone": user.get("phone"),
        "created_at": user["created_at"]
    } for user in users]

# ==================== DATA MIGRATION HELPER ====================

@api_router.post("/admin/migrate-hierarchy")
async def migrate_existing_users(current_user: dict = Depends(require_admin)):
    """
    Migrate existing users to the new hierarchy system.
    - First user (by created_at) becomes Admin
    - All other users become Agents under that Admin
    """
    # Get the first admin (current user should be admin)
    admin = current_user
    org_id = admin.get("organization_id")
    
    if not org_id:
        org_id = await get_or_create_organization(admin)
    
    # Update admin's own record
    await db.users.update_one(
        {"id": admin["id"]},
        {"$set": {
            "admin_id": admin["id"],
            "organization_id": org_id,
            "approval_status": "approved",
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Update all other users without organization_id
    result = await db.users.update_many(
        {"organization_id": None, "deleted_at": None, "id": {"$ne": admin["id"]}},
        {"$set": {
            "admin_id": admin["id"],
            "organization_id": org_id,
            "role": "agent",  # Default to agent for existing users
            "approval_status": "approved",
            "updated_at": datetime.utcnow()
        }}
    )
    
    await log_activity(admin["id"], "hierarchy_migration", f"Migrated {result.modified_count} users to organization {org_id}")
    
    return {
        "message": "Migration complete",
        "organization_id": org_id,
        "users_migrated": result.modified_count
    }

# ==================== ACCOUNT MODE ROUTES ====================

@api_router.get("/account/mode")
async def get_account_mode(current_user: dict = Depends(get_current_user)):
    """Get the current account mode and team information"""
    is_connected = bool(current_user.get("organization_id"))
    
    team_info = None
    if is_connected:
        # Get organization/team info
        admin_id = current_user.get("admin_id")
        manager_id = current_user.get("manager_id")
        
        admin = await db.users.find_one({"id": admin_id}, {"name": 1}) if admin_id else None
        manager = await db.users.find_one({"id": manager_id}, {"name": 1}) if manager_id and manager_id != admin_id else None
        
        team_info = {
            "organization_id": current_user.get("organization_id"),
            "organization_name": f"{admin.get('name', 'Unknown')}'s Team" if admin else "Team",
            "admin_id": admin_id,
            "admin_name": admin.get("name") if admin else None,
            "manager_id": manager_id,
            "manager_name": manager.get("name") if manager else None,
            "upline_name": manager.get("name") if manager else (admin.get("name") if admin else None),
            "joined_at": current_user.get("joined_team_at"),
            "role": current_user.get("role", "agent")
        }
    
    return {
        "account_mode": "connected" if is_connected else "solo",
        "is_connected": is_connected,
        "team_info": team_info
    }

@api_router.post("/account/join-team")
async def join_team(join_data: JoinTeamRequest, current_user: dict = Depends(get_current_user)):
    """
    Join a team using an invitation token.
    Allows existing solo users to connect to a hierarchy.
    """
    # Check if already connected to a team
    if current_user.get("organization_id"):
        raise HTTPException(
            status_code=400, 
            detail="You are already connected to a team. Leave your current team first to join a new one."
        )
    
    now = datetime.utcnow()
    
    # Validate invitation token
    invitation = await db.invitations.find_one({
        "token": join_data.token,
        "status": "pending",
        "expires_at": {"$gt": now}
    })
    
    if not invitation:
        raise HTTPException(status_code=400, detail="Invalid or expired invitation token")
    
    # If invitation has a specific email, verify it matches
    if invitation.get("email") and invitation["email"].lower() != current_user["email"].lower():
        raise HTTPException(status_code=400, detail="This invitation is for a different email address")
    
    # Get role and hierarchy from invitation
    role = invitation.get("role", "agent")
    admin_id = invitation.get("admin_id")
    manager_id = invitation.get("manager_id")
    organization_id = invitation.get("organization_id")
    
    # Update user with team connection
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "role": role,
            "admin_id": admin_id,
            "manager_id": manager_id,
            "organization_id": organization_id,
            "invited_by_user_id": invitation.get("invited_by_user_id"),
            "account_mode": "connected",
            "joined_team_at": now,
            "approval_status": "approved",
            "updated_at": now
        }}
    )
    
    # Mark invitation as accepted
    await db.invitations.update_one(
        {"id": invitation["id"]},
        {"$set": {
            "status": "accepted",
            "accepted_at": now,
            "accepted_by_user_id": current_user["id"]
        }}
    )
    
    # Get team info for response
    admin = await db.users.find_one({"id": admin_id}, {"name": 1}) if admin_id else None
    manager = await db.users.find_one({"id": manager_id}, {"name": 1}) if manager_id and manager_id != admin_id else None
    
    await log_activity(current_user["id"], "joined_team", f"Joined team as {role}")
    
    return {
        "message": f"Successfully joined team as {role}",
        "account_mode": "connected",
        "role": role,
        "organization_id": organization_id,
        "organization_name": f"{admin.get('name', 'Unknown')}'s Team" if admin else "Team",
        "upline_name": manager.get("name") if manager else (admin.get("name") if admin else None)
    }

@api_router.post("/account/leave-team")
async def leave_team(leave_data: LeaveTeamRequest, current_user: dict = Depends(get_current_user)):
    """
    Leave the current team and return to solo mode.
    All personal/agent-owned records move with the user.
    """
    if not leave_data.confirm:
        raise HTTPException(status_code=400, detail="Please confirm your intent to leave the team")
    
    # Check if actually connected
    if not current_user.get("organization_id"):
        raise HTTPException(status_code=400, detail="You are not currently connected to a team")
    
    # Admins cannot leave their own organization
    if current_user.get("role") == "admin" and current_user.get("admin_id") == current_user["id"]:
        raise HTTPException(
            status_code=400, 
            detail="As the team admin, you cannot leave. Transfer ownership or delete the organization instead."
        )
    
    now = datetime.utcnow()
    old_org_id = current_user.get("organization_id")
    old_manager_id = current_user.get("manager_id")
    
    # Update user to solo mode - clear all team references
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "role": "agent",  # Reset to agent role in solo mode
            "admin_id": None,
            "manager_id": None,
            "organization_id": None,
            "invited_by_user_id": None,
            "account_mode": "solo",
            "left_team_at": now,
            "updated_at": now
        },
        "$unset": {
            "joined_team_at": ""
        }}
    )
    
    # Update all user-owned records to solo visibility
    # Leads
    await db.leads.update_many(
        {"owner_agent_id": current_user["id"]},
        {"$set": {
            "organization_id": None,
            "manager_id": None,
            "admin_id": None,
            "visibility_scope": "solo"
        }}
    )
    
    # Appointments
    await db.appointments.update_many(
        {"owner_agent_id": current_user["id"]},
        {"$set": {
            "organization_id": None,
            "manager_id": None,
            "admin_id": None,
            "visibility_scope": "solo"
        }}
    )
    
    # Scopes
    await db.scopes.update_many(
        {"created_by_user": current_user["id"]},
        {"$set": {
            "organization_id": None,
            "manager_id": None,
            "admin_id": None,
            "visibility_scope": "solo"
        }}
    )
    
    # If user was a manager, clear manager_id from their former agents
    if current_user.get("role") == "manager":
        await db.users.update_many(
            {"manager_id": current_user["id"], "organization_id": old_org_id},
            {"$set": {"manager_id": old_manager_id}}  # Reassign to the former manager's manager
        )
    
    await log_activity(current_user["id"], "left_team", f"Left team {old_org_id}")
    
    return {
        "message": "Successfully left the team and returned to solo mode",
        "account_mode": "solo",
        "records_updated": True
    }

@api_router.get("/account/validate-invite/{token}")
async def validate_invite_for_join(token: str, current_user: dict = Depends(get_current_user)):
    """
    Validate an invitation token for an existing user wanting to join a team.
    Different from signup validation - this is for users who already have an account.
    """
    now = datetime.utcnow()
    
    invitation = await db.invitations.find_one({
        "token": token,
        "status": "pending",
        "expires_at": {"$gt": now}
    })
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation token")
    
    # Check email match if invitation is email-specific
    if invitation.get("email") and invitation["email"].lower() != current_user["email"].lower():
        raise HTTPException(status_code=400, detail="This invitation is for a different email address")
    
    # Check if already connected
    if current_user.get("organization_id"):
        raise HTTPException(
            status_code=400, 
            detail="You are already connected to a team. Leave your current team first."
        )
    
    # Get inviter and organization info
    inviter = await db.users.find_one({"id": invitation.get("invited_by_user_id")}, {"name": 1})
    admin = await db.users.find_one({"id": invitation.get("admin_id")}, {"name": 1})
    
    return {
        "valid": True,
        "role": invitation["role"],
        "organization_name": invitation.get("organization_name") or (f"{admin.get('name', 'Unknown')}'s Team" if admin else "Team"),
        "invited_by_name": inviter.get("name") if inviter else "Unknown",
        "expires_at": invitation["expires_at"]
    }

# ==================== LEADS ROUTES ====================

@api_router.get("/leads", response_model=List[LeadResponse])
async def get_leads(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_hierarchy_ids(current_user)
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
        # Hierarchy ownership fields
        "owner_agent_id": current_user["id"],
        "manager_id": current_user.get("manager_id"),
        "admin_id": current_user.get("admin_id"),
        "organization_id": current_user.get("organization_id"),
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
    user_ids = await get_user_hierarchy_ids(current_user)
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
    user_ids = await get_user_hierarchy_ids(current_user)
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
        "follow_up_notes": None,
        # Hierarchy ownership fields
        "owner_agent_id": current_user["id"],
        "manager_id": current_user.get("manager_id"),
        "admin_id": current_user.get("admin_id"),
        "organization_id": current_user.get("organization_id")
    }
    await db.appointments.insert_one(apt_doc)
    await db.leads.update_one({"id": apt_data.lead_id}, {"$set": {"stage": "appointment_scheduled"}})
    await log_activity(current_user["id"], "appointment_created", "Scheduled appointment", apt_data.lead_id)
    return AppointmentResponse(**apt_doc)

@api_router.get("/appointments/{apt_id}")
async def get_appointment(apt_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single appointment by ID"""
    user_ids = await get_user_hierarchy_ids(current_user)
    
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
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    agent = await db.users.find_one({"id": current_user["id"]})
    
    # Validate signatures exist
    if not scope_data.signature or len(scope_data.signature) < 100:
        logger.warning(f"Missing or invalid beneficiary signature: length={len(scope_data.signature or '')}")
        raise HTTPException(status_code=400, detail="Valid beneficiary signature is required")
    
    if not scope_data.agent_signature or len(scope_data.agent_signature) < 100:
        logger.warning(f"Missing or invalid agent signature: length={len(scope_data.agent_signature or '')}")
        raise HTTPException(status_code=400, detail="Valid agent signature is required")
    
    logger.info(f"Creating SOA for lead {scope_data.lead_id} - Beneficiary sig length: {len(scope_data.signature)}, Agent sig length: {len(scope_data.agent_signature)}")
    
    # Extract signature timestamps from form_fields if available
    form_fields = scope_data.form_fields or {}
    beneficiary_signed_at = form_fields.get('beneficiary_signed_at') or datetime.utcnow().isoformat()
    agent_signed_at = form_fields.get('agent_signed_at') or datetime.utcnow().isoformat()
    
    scope_doc = {
        "id": scope_id,
        "lead_id": scope_data.lead_id,
        "form_fields": form_fields,
        "typed_name": scope_data.typed_name,
        "signature": scope_data.signature,
        "agent_typed_name": scope_data.agent_typed_name or (agent.get("name", "") if agent else ""),
        "agent_signature": scope_data.agent_signature,
        "beneficiary_signed_at": beneficiary_signed_at,
        "agent_signed_at": agent_signed_at,
        "created_date": datetime.utcnow(),
        "created_by_user": current_user["id"],
        "status": "signed",  # Mark as signed since we have both signatures
        "pdf_base64": None  # Will be generated
    }
    
    # Generate PDF and store it
    pdf_error = None
    try:
        logger.info(f"Generating PDF for SOA {scope_id}")
        # Use internal PDF generation (same as generate_stamped_pdf endpoint)
        pdf_result = await _generate_pdf_internal(scope_doc)
        scope_doc["pdf_base64"] = pdf_result["pdf_base64"]
        logger.info(f"PDF generated successfully for SOA {scope_id}, size: {len(pdf_result['pdf_base64'])} chars")
    except Exception as e:
        pdf_error = str(e)
        logger.error(f"Failed to generate PDF for SOA {scope_id}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
    
    # Save the document even if PDF fails (signatures are stored)
    await db.scope_forms.insert_one(scope_doc)
    await log_activity(current_user["id"], "scope_created", "Created Scope of Appointment", scope_data.lead_id)
    
    # Update lead stage to SOA_COMPLETED if PDF was generated
    if scope_doc.get("pdf_base64"):
        await db.leads.update_one(
            {"id": scope_data.lead_id},
            {"$set": {"stage": "soa_completed", "soa_status": "signed"}}
        )
    
    response = {
        "id": scope_doc["id"],
        "lead_id": scope_doc["lead_id"],
        "form_fields": scope_doc["form_fields"],
        "typed_name": scope_doc["typed_name"],
        "signature": scope_doc["signature"],
        "agent_typed_name": scope_doc["agent_typed_name"],
        "agent_signature": scope_doc["agent_signature"],
        "beneficiary_signed_at": scope_doc["beneficiary_signed_at"],
        "agent_signed_at": scope_doc["agent_signed_at"],
        "pdf_base64": scope_doc.get("pdf_base64"),
        "created_date": scope_doc["created_date"],
        "created_by_user": scope_doc["created_by_user"],
        "status": scope_doc["status"]
    }
    
    # Include pdf_error in response if PDF generation failed
    if pdf_error:
        response["pdf_error"] = f"PDF generation failed: {pdf_error}. Signature was saved - PDF can be regenerated."
    
    return response

@api_router.get("/scope/{scope_id}")
async def get_scope(scope_id: str, current_user: dict = Depends(get_current_user)):
    logger.info(f"[Scope Get] Fetching scope: {scope_id}, user: {current_user.get('id')}")
    
    scope = await db.scope_forms.find_one({"id": scope_id})
    if not scope:
        logger.warning(f"[Scope Get] Scope not found: {scope_id}")
        raise HTTPException(status_code=404, detail="Scope not found")
    
    # Remove MongoDB ObjectId to prevent serialization issues
    scope.pop("_id", None)
    
    # Ensure all fields exist
    scope.setdefault("agent_typed_name", "")
    scope.setdefault("agent_signature", "")
    scope.setdefault("pdf_base64", None)
    scope.setdefault("beneficiary_signed_at", None)
    scope.setdefault("agent_signed_at", None)
    scope.setdefault("status", "signed" if scope.get("signature") else "draft")
    scope.setdefault("delivery_history", [])
    
    logger.info(f"[Scope Get] Scope found: {scope_id}, typed_name: {scope.get('typed_name')}")
    return scope

async def _generate_pdf_internal(scope: dict) -> dict:
    """
    Internal PDF generation - shared by create_scope and generate-pdf endpoint.
    Uses the main stamping pipeline with transparent signatures.
    """
    import os
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.utils import ImageReader
    from PIL import Image
    from io import BytesIO
    from PyPDF2 import PdfReader, PdfWriter
    import base64
    import cairosvg
    from datetime import datetime
    
    scope_id = scope.get("id", "unknown")
    logger.info(f"[PDF Gen Internal] Starting for scope {scope_id}")
    
    # Extract field values
    form_fields = scope.get('form_fields', {})
    beneficiary_name = scope.get('beneficiary_name') or scope.get('typed_name') or form_fields.get('beneficiary_name') or ''
    beneficiary_phone = scope.get('beneficiary_phone') or form_fields.get('beneficiary_phone') or ''
    beneficiary_address = scope.get('beneficiary_address') or form_fields.get('beneficiary_address') or ''
    agent_name = scope.get('agent_name') or scope.get('agent_typed_name') or form_fields.get('agent_name') or ''
    agent_phone = scope.get('agent_phone') or form_fields.get('agent_phone') or ''
    appointment_date = scope.get('appointment_date') or form_fields.get('appointment_date') or ''
    signature_date = scope.get('signature_date') or form_fields.get('signature_date') or ''
    contact_method = scope.get('initial_contact_method') or form_fields.get('initial_contact_method') or ''
    plans_to_represent = scope.get('plans_to_represent') or form_fields.get('plans_to_represent') or ''
    auth_rep_name = scope.get('auth_rep_name') or form_fields.get('auth_rep_name') or ''
    auth_rep_relationship = scope.get('auth_rep_relationship') or form_fields.get('auth_rep_relationship') or ''
    products = scope.get('products_to_discuss') or form_fields.get('products') or []
    beneficiary_sig = scope.get('signature') or ''
    agent_sig = scope.get('agent_signature') or ''
    
    # Load template PDF
    template_path = '/app/backend/original_soa_form.pdf'
    if not os.path.exists(template_path):
        raise ValueError(f"Template not found: {template_path}")
    
    reader = PdfReader(template_path)
    writer = PdfWriter()
    
    # Page dimensions
    page_width = float(reader.pages[0].mediabox.width)
    page_height = float(reader.pages[0].mediabox.height)
    
    # PAGE 1 COORDS (checkboxes)
    PAGE_1_COORDS = {
        'checkbox_medicare_advantage': {'x': 53, 'y': 533},
        'checkbox_prescription_drug': {'x': 53, 'y': 452},
        'checkbox_hospital_indemnity': {'x': 53, 'y': 343},
        'checkbox_dental_vision_hearing': {'x': 53, 'y': 255},
        'checkbox_medicare_supplement': {'x': 53, 'y': 210},
    }
    
    # PAGE 2 COORDS (text + signatures)
    PAGE_2_COORDS = {
        'beneficiary_name': {'x': 75, 'y': 696, 'size': 10, 'max': 30},
        'beneficiary_phone': {'x': 347, 'y': 696, 'size': 10, 'max': 20},
        'beneficiary_address': {'x': 86, 'y': 669, 'size': 9, 'max': 60},
        'beneficiary_signature': {'x': 80, 'y': 620, 'w': 200, 'h': 45},
        'signature_date': {'x': 450, 'y': 630, 'size': 10},
        'auth_rep_name': {'x': 168, 'y': 582, 'size': 9, 'max': 35},
        'auth_rep_relationship': {'x': 220, 'y': 554, 'size': 9, 'max': 30},
        'agent_name': {'x': 108, 'y': 476, 'size': 10, 'max': 25},
        'agent_phone': {'x': 379, 'y': 476, 'size': 10, 'max': 15},
        'contact_method': {'x': 381, 'y': 446, 'size': 9, 'max': 20},
        'plans_to_represent': {'x': 282, 'y': 387, 'size': 9, 'max': 35},
        'appointment_date': {'x': 480, 'y': 387, 'size': 9},
        'agent_signature': {'x': 80, 'y': 390, 'w': 200, 'h': 40},
    }
    
    stamped_items = []
    
    # Create PAGE 1 overlay (checkboxes)
    p1_buf = BytesIO()
    c1 = rl_canvas.Canvas(p1_buf, pagesize=(page_width, page_height))
    
    product_map = {
        'medicare_advantage': 'checkbox_medicare_advantage',
        'prescription_drug': 'checkbox_prescription_drug',
        'hospital_indemnity': 'checkbox_hospital_indemnity',
        'dental_vision_hearing': 'checkbox_dental_vision_hearing',
        'medicare_supplement': 'checkbox_medicare_supplement',
    }
    
    for prod in products:
        key = product_map.get(prod)
        if key and key in PAGE_1_COORDS:
            coords = PAGE_1_COORDS[key]
            c1.setFont("Helvetica-Bold", 14)
            c1.setFillColorRGB(0, 0, 0)
            c1.drawString(coords['x'], coords['y'], "✓")
            stamped_items.append(f"PAGE 1: CHECK @ ({coords['x']}, {coords['y']})")
    
    c1.save()
    p1_buf.seek(0)
    
    # Create PAGE 2 overlay (text + signatures)
    p2_buf = BytesIO()
    c2 = rl_canvas.Canvas(p2_buf, pagesize=(page_width, page_height))
    
    def stamp_text(field_name, value):
        if not value:
            return
        coords = PAGE_2_COORDS.get(field_name)
        if not coords:
            return
        text = str(value)[:coords.get('max', 50)]
        c2.setFont("Helvetica", coords.get('size', 10))
        c2.setFillColorRGB(0, 0, 0)
        c2.drawString(coords['x'], coords['y'], text)
        stamped_items.append(f"PAGE 2: '{field_name}' @ ({coords['x']}, {coords['y']})")
    
    def stamp_sig(sig_data, field_name):
        if not sig_data or len(sig_data) < 50:
            return
        coords = PAGE_2_COORDS.get(field_name)
        if not coords:
            return
        try:
            # Decode
            if sig_data.startswith('data:image/svg+xml;base64,'):
                sig_b64 = sig_data.split(',', 1)[1]
                sig_bytes = base64.b64decode(sig_b64)
                sig_bytes = cairosvg.svg2png(bytestring=sig_bytes, output_width=300, output_height=80)
            elif sig_data.startswith('data:image'):
                sig_b64 = sig_data.split(',', 1)[1]
                sig_bytes = base64.b64decode(sig_b64)
            else:
                sig_bytes = base64.b64decode(sig_data)
            
            # Load as RGBA, crop to ink, save transparent PNG
            img = Image.open(BytesIO(sig_bytes)).convert('RGBA')
            bbox = img.split()[-1].getbbox()
            if bbox:
                img = img.crop(bbox)
            
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            
            c2.drawImage(ImageReader(buffer), coords['x'], coords['y'], width=160, height=40, mask='auto')
            
            # Timestamp below
            ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            c2.setFont("Helvetica", 5)
            c2.setFillColorRGB(0.5, 0.5, 0.5)
            c2.drawString(coords['x'], coords['y'] - 12, f"Signed electronically on {ts} via mobile application")
            
            stamped_items.append(f"PAGE 2: SIG '{field_name}' @ ({coords['x']}, {coords['y']})")
        except Exception as e:
            logger.error(f"[PDF Gen Internal] SIG '{field_name}' failed: {e}")
    
    # Stamp text fields
    stamp_text('beneficiary_name', beneficiary_name)
    stamp_text('beneficiary_phone', beneficiary_phone)
    stamp_text('beneficiary_address', beneficiary_address)
    stamp_text('signature_date', signature_date)
    stamp_text('auth_rep_name', auth_rep_name)
    stamp_text('auth_rep_relationship', auth_rep_relationship)
    stamp_text('agent_name', agent_name)
    stamp_text('agent_phone', agent_phone)
    stamp_text('contact_method', contact_method)
    stamp_text('plans_to_represent', plans_to_represent)
    stamp_text('appointment_date', appointment_date)
    
    # Stamp signatures
    stamp_sig(beneficiary_sig, 'beneficiary_signature')
    stamp_sig(agent_sig, 'agent_signature')
    
    c2.save()
    p2_buf.seek(0)
    
    # Merge overlays with template
    p1_overlay = PdfReader(p1_buf)
    p2_overlay = PdfReader(p2_buf)
    
    for i, page in enumerate(reader.pages):
        if i == 0 and len(p1_overlay.pages) > 0:
            page.merge_page(p1_overlay.pages[0])
        elif i == 1 and len(p2_overlay.pages) > 0:
            page.merge_page(p2_overlay.pages[0])
        writer.add_page(page)
    
    # Write final PDF
    output = BytesIO()
    writer.write(output)
    output.seek(0)
    pdf_base64 = base64.b64encode(output.read()).decode()
    
    logger.info(f"[PDF Gen Internal] Complete - {len(stamped_items)} items, {len(pdf_base64)} chars")
    
    return {"pdf_base64": pdf_base64, "items_stamped": len(stamped_items)}

@api_router.post("/scope/{scope_id}/generate-pdf")
async def generate_stamped_pdf(scope_id: str, current_user: dict = Depends(get_current_user)):
    """
    SINGLE SOURCE OF TRUTH for SOA PDF generation.
    
    PAGE MAPPING:
    - Page 1 (index 0): Product checkboxes ONLY
    - Page 2 (index 1): All text fields, signatures, dates
    
    Returns a visibly filled, flattened PDF for View/Print/Share/Save.
    """
    import os
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.utils import ImageReader
    from PIL import Image
    from io import BytesIO
    from PyPDF2 import PdfReader, PdfWriter
    import base64
    
    logger.info(f"[PDF Gen] ========== STARTING PDF GENERATION ==========")
    logger.info(f"[PDF Gen] Scope ID: {scope_id}")
    
    # Get scope data
    scope = await db.scope_forms.find_one({"id": scope_id})
    if not scope:
        logger.error(f"[PDF Gen] Scope not found: {scope_id}")
        raise HTTPException(status_code=404, detail="Scope not found")
    
    # Check authorization
    user_id = current_user.get("id")
    user_role = current_user.get("role")
    
    if user_role not in ["admin", "manager"]:
        if scope.get("created_by_user") != user_id:
            lead = await db.leads.find_one({"id": scope.get("lead_id")})
            if not lead or (lead.get("assigned_agent_id") and lead.get("assigned_agent_id") != user_id):
                raise HTTPException(status_code=403, detail="Access denied")
    
    # ==================== EXTRACT ALL FIELD VALUES ====================
    form_fields = scope.get('form_fields', {})
    
    beneficiary_name = scope.get('beneficiary_name') or scope.get('typed_name') or form_fields.get('beneficiary_name') or ''
    beneficiary_phone = scope.get('beneficiary_phone') or form_fields.get('beneficiary_phone') or ''
    beneficiary_address = scope.get('beneficiary_address') or form_fields.get('beneficiary_address') or ''
    agent_name = scope.get('agent_name') or scope.get('agent_typed_name') or form_fields.get('agent_name') or ''
    agent_phone = scope.get('agent_phone') or form_fields.get('agent_phone') or ''
    appointment_date = scope.get('appointment_date') or form_fields.get('appointment_date') or ''
    signature_date = scope.get('signature_date') or form_fields.get('signature_date') or ''
    contact_method = scope.get('initial_contact_method') or form_fields.get('initial_contact_method') or ''
    plans_to_represent = scope.get('plans_to_represent') or form_fields.get('plans_to_represent') or ''
    auth_rep_name = scope.get('auth_rep_name') or form_fields.get('auth_rep_name') or ''
    auth_rep_relationship = scope.get('auth_rep_relationship') or form_fields.get('auth_rep_relationship') or ''
    
    # Products/checkboxes
    products = scope.get('products_to_discuss', [])
    if not products:
        if form_fields.get('medicare_advantage'): products.append('medicare_advantage')
        if form_fields.get('medicare_supplement'): products.append('medicare_supplement')
        if form_fields.get('prescription_drug'): products.append('prescription_drug')
        if form_fields.get('dental_vision_hearing'): products.append('dental_vision_hearing')
        if form_fields.get('hospital_indemnity'): products.append('hospital_indemnity')
    
    # Signatures
    beneficiary_signature = scope.get('signature', '')
    agent_signature = scope.get('agent_signature', '')
    
    # Log input values
    logger.info(f"[PDF Gen] beneficiary_name = '{beneficiary_name}'")
    logger.info(f"[PDF Gen] beneficiary_phone = '{beneficiary_phone}'")
    logger.info(f"[PDF Gen] beneficiary_address = '{beneficiary_address}'")
    logger.info(f"[PDF Gen] agent_name = '{agent_name}'")
    logger.info(f"[PDF Gen] agent_phone = '{agent_phone}'")
    logger.info(f"[PDF Gen] signature_date = '{signature_date}'")
    logger.info(f"[PDF Gen] contact_method = '{contact_method}'")
    logger.info(f"[PDF Gen] plans_to_represent = '{plans_to_represent}'")
    logger.info(f"[PDF Gen] products = {products}")
    logger.info(f"[PDF Gen] beneficiary_sig = {'YES' if beneficiary_signature else 'NO'}")
    logger.info(f"[PDF Gen] agent_sig = {'YES' if agent_signature else 'NO'}")
    
    # ==================== LOAD ORIGINAL PDF ====================
    original_pdf_path = '/app/backend/original_soa_form.pdf'
    
    if not os.path.exists(original_pdf_path):
        raise HTTPException(status_code=500, detail="Original PDF form not found")
    
    with open(original_pdf_path, 'rb') as f:
        original_reader = PdfReader(f)
        page_width = float(original_reader.pages[0].mediabox.width)
        page_height = float(original_reader.pages[0].mediabox.height)
    
    logger.info(f"[PDF Gen] PDF: {page_width}x{page_height}, {len(original_reader.pages)} pages")
    
    # ==================== PAGE 1 COORDINATES (Product Checkboxes ONLY) ====================
    # Page 1 contains only the product selection checkboxes
    # Y coordinates from form analysis (PDF origin is bottom-left)
    PAGE_1_COORDS = {
        # Checkboxes - X is around 53 (center of checkbox area 46-71)
        'checkbox_medicare_advantage': {'x': 53, 'y': 533},     # Part C - Y center 533
        'checkbox_prescription_drug': {'x': 53, 'y': 452},      # Part D - Y center 452
        'checkbox_hospital_indemnity': {'x': 53, 'y': 343},     # Hospital - Y center 343
        'checkbox_dental_vision_hearing': {'x': 53, 'y': 255},  # Dental/Vision/Hearing - Y center 255
        'checkbox_medicare_supplement': {'x': 53, 'y': 210},    # Medigap - Y center 210
    }
    
    # ==================== PAGE 2 COORDINATES (All Text Fields & Signatures) ====================
    # Page 2 contains beneficiary info, agent info, signatures
    PAGE_2_COORDS = {
        # Beneficiary section (top of page 2)
        'beneficiary_name': {'x': 75, 'y': 696, 'size': 10, 'max': 30},      # Name field Y 683-709
        'beneficiary_phone': {'x': 347, 'y': 696, 'size': 10, 'max': 20},    # Phone field Y 683-709
        'beneficiary_address': {'x': 86, 'y': 669, 'size': 9, 'max': 60},    # Address Y 656-682
        
        # Signature area - signature goes above the line, date to the right
        'beneficiary_signature': {'x': 80, 'y': 620, 'w': 200, 'h': 45},     # Above signature line
        'signature_date': {'x': 450, 'y': 630, 'size': 10},                   # Right side of signature area
        
        # Auth rep section (below signature)
        'auth_rep_name': {'x': 168, 'y': 582, 'size': 9, 'max': 35},         # Y 570-595
        'auth_rep_relationship': {'x': 220, 'y': 554, 'size': 9, 'max': 30}, # Y 540-568
        
        # Agent section
        'agent_name': {'x': 108, 'y': 476, 'size': 10, 'max': 25},           # Y 462-489
        'agent_phone': {'x': 379, 'y': 476, 'size': 10, 'max': 15},          # Y 462-489
        'contact_method': {'x': 381, 'y': 446, 'size': 9, 'max': 20},        # Y 432-461
        'plans_to_represent': {'x': 282, 'y': 387, 'size': 9, 'max': 35},    # Y 373-402
        'appointment_date': {'x': 480, 'y': 387, 'size': 9},                  # Near plans field
        
        # Agent signature - on the "Agent's Signature" line
        'agent_signature': {'x': 80, 'y': 390, 'w': 200, 'h': 40},           # Agent signature line
    }
    
    stamped_items = []
    
    # ==================== CREATE PAGE 1 OVERLAY (Checkboxes Only) ====================
    logger.info("[PDF Gen] Creating PAGE 1 overlay (checkboxes)...")
    page1_overlay = BytesIO()
    c1 = rl_canvas.Canvas(page1_overlay, pagesize=(page_width, page_height))
    
    def stamp_check_p1(product_key, label):
        if product_key in products:
            coords = PAGE_1_COORDS.get(f'checkbox_{product_key}')
            if coords:
                c1.setFont("ZapfDingbats", 14)
                c1.setFillColorRGB(0, 0, 0)
                c1.drawString(coords['x'], coords['y'], "4")  # Checkmark
                stamped_items.append(f"PAGE 1: CHECK '{label}' @ ({coords['x']}, {coords['y']})")
                logger.info(f"[PDF Gen] PAGE 1: STAMPED CHECK '{label}' @ ({coords['x']}, {coords['y']})")
    
    stamp_check_p1('medicare_advantage', 'Medicare Advantage')
    stamp_check_p1('prescription_drug', 'Prescription Drug')
    stamp_check_p1('hospital_indemnity', 'Hospital Indemnity')
    stamp_check_p1('dental_vision_hearing', 'Dental/Vision')
    stamp_check_p1('medicare_supplement', 'Medicare Supplement')
    
    c1.save()
    page1_overlay.seek(0)
    
    # ==================== CREATE PAGE 2 OVERLAY (All Text Fields & Signatures) ====================
    logger.info("[PDF Gen] Creating PAGE 2 overlay (text fields & signatures)...")
    page2_overlay = BytesIO()
    c2 = rl_canvas.Canvas(page2_overlay, pagesize=(page_width, page_height))
    
    def stamp_text_p2(field_name, value):
        if not value:
            logger.info(f"[PDF Gen] PAGE 2: SKIP '{field_name}' - empty")
            return
        coords = PAGE_2_COORDS.get(field_name)
        if not coords:
            logger.warning(f"[PDF Gen] PAGE 2: No coords for '{field_name}'")
            return
        text = str(value)
        max_len = coords.get('max')
        if max_len and len(text) > max_len:
            text = text[:max_len]
        size = coords.get('size', 10)
        c2.setFont("Helvetica", size)
        c2.setFillColorRGB(0, 0, 0)
        c2.drawString(coords['x'], coords['y'], text)
        stamped_items.append(f"PAGE 2: '{field_name}' = '{text}' @ ({coords['x']}, {coords['y']})")
        logger.info(f"[PDF Gen] PAGE 2: STAMPED '{field_name}' = '{text}' @ ({coords['x']}, {coords['y']})")
    
    def stamp_sig_p2(sig_data, field_name):
        """
        Stamp signature with transparent background.
        White pixels (R,G,B > 245) become transparent, ink strokes remain.
        """
        import cairosvg
        from datetime import datetime
        
        if not sig_data or not isinstance(sig_data, str) or len(sig_data.strip()) < 20:
            logger.info(f"[PDF Gen] PAGE 2: SKIP '{field_name}' - empty or too short")
            return False
        
        coords = PAGE_2_COORDS.get(field_name)
        if not coords:
            logger.warning(f"[PDF Gen] PAGE 2: No coords for '{field_name}'")
            return False
        
        try:
            sig_data = sig_data.strip()
            logger.info(f"[PDF Gen] PAGE 2: SIG '{field_name}' - payload length={len(sig_data)}")
            
            # ==================== 1. DECODE TO PNG BYTES ====================
            if sig_data.startswith('data:image/svg+xml;base64,'):
                sig_b64 = sig_data.split(',', 1)[1]
                svg_bytes = base64.b64decode(sig_b64)
                sig_bytes = cairosvg.svg2png(bytestring=svg_bytes, output_width=300, output_height=80)
                logger.info(f"[PDF Gen] PAGE 2: SIG '{field_name}' - SVG→PNG ({len(sig_bytes)} bytes)")
                
            elif sig_data.startswith('data:image/png;base64,'):
                sig_b64 = sig_data.split(',', 1)[1]
                sig_bytes = base64.b64decode(sig_b64)
                logger.info(f"[PDF Gen] PAGE 2: SIG '{field_name}' - PNG ({len(sig_bytes)} bytes)")
                
            elif sig_data.startswith('data:image'):
                parts = sig_data.split(',', 1)
                if len(parts) != 2:
                    logger.error(f"[PDF Gen] PAGE 2: SIG '{field_name}' FAILED - malformed data URI")
                    return False
                if 'svg+xml' in sig_data:
                    svg_bytes = base64.b64decode(parts[1])
                    sig_bytes = cairosvg.svg2png(bytestring=svg_bytes, output_width=300, output_height=80)
                else:
                    sig_bytes = base64.b64decode(parts[1])
            else:
                sig_bytes = base64.b64decode(sig_data)
            
            # ==================== 2. LOAD AS RGBA ====================
            img = Image.open(BytesIO(sig_bytes))
            img = img.convert('RGBA')
            logger.info(f"[PDF Gen] PAGE 2: SIG '{field_name}' - RGBA size: {img.size}")
            
            # ==================== 3. WHITE PIXELS → TRANSPARENT ====================
            # For every pixel: if R,G,B all > 245, set alpha = 0
            # Otherwise keep original pixel unchanged
            # Do NOT convert to RGB, do NOT composite
            pixels = img.load()
            width, height = img.size
            for y in range(height):
                for x in range(width):
                    r, g, b, a = pixels[x, y]
                    if r > 245 and g > 245 and b > 245:
                        pixels[x, y] = (r, g, b, 0)  # Keep RGB, set alpha to 0
            
            logger.info(f"[PDF Gen] PAGE 2: SIG '{field_name}' - white pixels made transparent")
            
            # ==================== 4. SAVE AS RGBA PNG ====================
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            
            # ==================== 5. STAMP WITH REPORTLAB ====================
            sig_x = coords['x']
            sig_y = coords['y']
            
            c2.drawImage(
                ImageReader(buffer),
                sig_x,
                sig_y,
                width=160,
                height=40,
                mask='auto'
            )
            
            # Timestamp below signature
            server_timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            c2.setFont("Helvetica", 5)
            c2.setFillColorRGB(0.5, 0.5, 0.5)
            c2.drawString(sig_x, sig_y - 12, f"Signed electronically on {server_timestamp} via mobile application")
            
            stamped_items.append(f"PAGE 2: SIG '{field_name}' @ ({sig_x}, {sig_y})")
            logger.info(f"[PDF Gen] PAGE 2: STAMPED SIG '{field_name}' @ ({sig_x}, {sig_y})")
            return True
            
        except Exception as e:
            logger.error(f"[PDF Gen] PAGE 2: SIG '{field_name}' FAILED - {e}")
            return False
    
    # Stamp all text fields on page 2
    stamp_text_p2('beneficiary_name', beneficiary_name)
    stamp_text_p2('beneficiary_phone', beneficiary_phone)
    stamp_text_p2('beneficiary_address', beneficiary_address)
    stamp_text_p2('signature_date', signature_date)
    stamp_text_p2('auth_rep_name', auth_rep_name)
    stamp_text_p2('auth_rep_relationship', auth_rep_relationship)
    stamp_text_p2('agent_name', agent_name)
    stamp_text_p2('agent_phone', agent_phone)
    stamp_text_p2('contact_method', contact_method)
    stamp_text_p2('plans_to_represent', plans_to_represent)
    stamp_text_p2('appointment_date', appointment_date)
    
    # Stamp signatures on page 2
    stamp_sig_p2(beneficiary_signature, 'beneficiary_signature')
    stamp_sig_p2(agent_signature, 'agent_signature')
    
    c2.save()
    page2_overlay.seek(0)
    
    # ==================== MERGE OVERLAYS WITH ORIGINAL PDF ====================
    logger.info("[PDF Gen] Merging overlays with original PDF...")
    
    with open(original_pdf_path, 'rb') as f:
        orig_reader = PdfReader(f)
        overlay1_reader = PdfReader(page1_overlay)
        overlay2_reader = PdfReader(page2_overlay)
        writer = PdfWriter()
        
        # Page 1: Original + checkboxes overlay
        page1 = orig_reader.pages[0]
        if overlay1_reader.pages:
            page1.merge_page(overlay1_reader.pages[0])
            logger.info("[PDF Gen] Merged PAGE 1 overlay (checkboxes)")
        writer.add_page(page1)
        
        # Page 2: Original + text/signatures overlay
        if len(orig_reader.pages) > 1:
            page2 = orig_reader.pages[1]
            if overlay2_reader.pages:
                page2.merge_page(overlay2_reader.pages[0])
                logger.info("[PDF Gen] Merged PAGE 2 overlay (text fields & signatures)")
            writer.add_page(page2)
        
        # Write final PDF
        output = BytesIO()
        writer.write(output)
        output.seek(0)
        pdf_bytes = output.read()
    
    pdf_base64 = base64.b64encode(pdf_bytes).decode()
    
    # ==================== FINAL LOG ====================
    logger.info(f"[PDF Gen] --- STAMPED {len(stamped_items)} ITEMS ---")
    for item in stamped_items:
        logger.info(f"[PDF Gen]   {item}")
    logger.info(f"[PDF Gen] Final PDF: {len(pdf_bytes)} bytes")
    logger.info(f"[PDF Gen] ========== COMPLETE ==========")
    
    # Save to DB
    await db.scope_forms.update_one(
        {"id": scope_id},
        {"$set": {"stamped_pdf_base64": pdf_base64, "pdf_generated_at": datetime.utcnow().isoformat()}}
    )
    
    return {
        "pdf_base64": pdf_base64,
        "filename": f"SOA_{beneficiary_name.replace(' ', '_') if beneficiary_name else 'Document'}_{scope_id[:8]}.pdf",
        "size_bytes": len(pdf_bytes),
        "generated_at": datetime.utcnow().isoformat(),
        "items_stamped": len(stamped_items)
    }


@api_router.get("/scope/{scope_id}/pdf")
async def get_scope_pdf(scope_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get the generated PDF. Always generates fresh.
    This is the SINGLE endpoint for View/Print/Share/Save.
    """
    return await generate_stamped_pdf(scope_id, current_user)

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

# HTML Privacy Policy page for in-app viewing
from fastapi.responses import HTMLResponse

@api_router.get("/privacy-policy", response_class=HTMLResponse)
async def get_privacy_policy_html():
    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy - AgentRoute AI</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #0F172A;
            color: #E2E8F0;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            line-height: 1.6;
        }
        h1 { color: #3B82F6; font-size: 24px; margin-bottom: 10px; }
        h2 { color: #94A3B8; font-size: 18px; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #334155; padding-bottom: 8px; }
        p, li { color: #CBD5E1; margin-bottom: 10px; }
        ul { padding-left: 20px; }
        .last-updated { color: #64748B; font-size: 14px; margin-bottom: 30px; }
        .contact { margin-top: 40px; padding: 20px; background: #1E293B; border-radius: 12px; }
        .contact a { color: #3B82F6; }
        .highlight { background: #1E293B; padding: 15px; border-radius: 8px; margin: 15px 0; }
    </style>
</head>
<body>
    <h1>AgentRoute AI Privacy Policy</h1>
    <p class="last-updated">Last Updated: March 15, 2026</p>
    
    <h2>Information We Collect</h2>
    <ul>
        <li>Personal information (name, email, phone number)</li>
        <li>Lead and customer data you enter into the app</li>
        <li>Location data (for route optimization, with your permission)</li>
        <li>Usage analytics to improve our services</li>
        <li>Account mode preferences (Solo or Team membership)</li>
        <li>Organization and hierarchy information when connected to a team</li>
    </ul>
    
    <h2>Account Modes</h2>
    <p>AgentRoute AI supports two account modes:</p>
    <div class="highlight">
        <p><strong>Solo Mode:</strong> You operate independently. All your data is private and only accessible to you.</p>
        <p><strong>Team/Hierarchy Mode:</strong> When connected to an organization, certain data may be visible to your Admin, Manager, or Upline according to their role permissions.</p>
    </div>
    
    <h2>Team/Hierarchy Data Visibility</h2>
    <p>When you join a team or organization:</p>
    <ul>
        <li>Admins can view all team member activity, leads, and performance</li>
        <li>Managers can view data for agents directly under their supervision</li>
        <li>Agents can only view their own records unless explicit sharing is enabled</li>
        <li>Your personal profile information remains private</li>
    </ul>
    
    <h2>Data Ownership & Portability</h2>
    <ul>
        <li>Records you create as an agent are owned by you</li>
        <li>If you leave a team, your agent-owned records remain with you</li>
        <li>Your former team loses access to your records immediately upon separation</li>
        <li>Only records explicitly marked as team-owned remain with the organization</li>
    </ul>
    
    <h2>Invitation Tokens</h2>
    <p>When joining a team via invitation:</p>
    <ul>
        <li>Invitation tokens are system-generated and unique</li>
        <li>Tokens contain encrypted organization and role information</li>
        <li>Tokens expire after 7 days</li>
        <li>Used or revoked tokens cannot be reused</li>
    </ul>
    
    <h2>How We Use Your Data</h2>
    <ul>
        <li>Provide and improve app functionality</li>
        <li>Power AI-driven features and recommendations</li>
        <li>Send notifications, reminders, and important updates</li>
        <li>Analyze usage patterns to enhance user experience</li>
        <li>Facilitate team collaboration when in hierarchy mode</li>
    </ul>
    
    <h2>Data Storage & Security</h2>
    <ul>
        <li>All data is stored in encrypted databases</li>
        <li>Passwords are securely hashed (never stored in plain text)</li>
        <li>We use industry-standard security protocols</li>
        <li>We never sell your personal data to third parties</li>
        <li>Role-based access control protects team data boundaries</li>
    </ul>
    
    <h2>Your Rights</h2>
    <ul>
        <li>Access and export your data at any time</li>
        <li>Request deletion of your account and all associated data</li>
        <li>Opt out of marketing communications</li>
        <li>Update or correct your personal information</li>
        <li>Switch between Solo and Team modes at any time</li>
        <li>Leave a team without deleting your account</li>
    </ul>
    
    <h2>Account Deletion</h2>
    <p>You can delete your account at any time through the Settings screen in the app. When you delete your account:</p>
    <ul>
        <li>Your personal information will be permanently removed</li>
        <li>Your leads, appointments, and documents will be deleted</li>
        <li>This action cannot be undone</li>
        <li>Note: Leaving a team does NOT delete your account</li>
    </ul>
    
    <h2>Third-Party Services</h2>
    <p>We may use third-party services for:</p>
    <ul>
        <li>AI processing (OpenAI, Google)</li>
        <li>Analytics and crash reporting</li>
        <li>Push notifications</li>
    </ul>
    
    <div class="contact">
        <h2 style="margin-top: 0;">Contact Us</h2>
        <p>For privacy-related questions or concerns:</p>
        <p>Email: <a href="mailto:agentrouteai@gmail.com">agentrouteai@gmail.com</a></p>
    </div>
</body>
</html>
    """
    return HTMLResponse(content=html_content)

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

# HTML Terms of Service page for in-app viewing
@api_router.get("/terms-of-service", response_class=HTMLResponse)
async def get_terms_of_service_html():
    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terms of Service - AgentRoute AI</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #0F172A;
            color: #E2E8F0;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            line-height: 1.6;
        }
        h1 { color: #3B82F6; font-size: 24px; margin-bottom: 10px; }
        h2 { color: #94A3B8; font-size: 18px; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #334155; padding-bottom: 8px; }
        h3 { color: #94A3B8; font-size: 16px; margin-top: 20px; margin-bottom: 10px; }
        p, li { color: #CBD5E1; margin-bottom: 10px; }
        ul { padding-left: 20px; }
        .last-updated { color: #64748B; font-size: 14px; margin-bottom: 30px; }
        .contact { margin-top: 40px; padding: 20px; background: #1E293B; border-radius: 12px; }
        .contact a { color: #3B82F6; }
        .highlight { background: #1E293B; padding: 15px; border-radius: 8px; margin: 15px 0; }
    </style>
</head>
<body>
    <h1>AgentRoute AI Terms of Service</h1>
    <p class="last-updated">Last Updated: January 1, 2024</p>
    
    <p>Welcome to AgentRoute AI. By accessing or using our mobile application and services, you agree to be bound by these Terms of Service.</p>
    
    <h2>1. Acceptance of Terms</h2>
    <p>By downloading, installing, or using AgentRoute AI, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree to these Terms, do not use the Service.</p>
    
    <h2>2. Description of Service</h2>
    <p>AgentRoute AI is a mobile application designed to help insurance sales agents:</p>
    <ul>
        <li>Manage leads and customer relationships</li>
        <li>Schedule and track appointments</li>
        <li>Generate and manage Scope of Appointment documents</li>
        <li>Optimize sales routes and planning</li>
        <li>Access AI-powered sales coaching and assistance</li>
        <li>Track commissions and sales performance</li>
    </ul>
    
    <h2>3. User Accounts</h2>
    <h3>3.1 Registration</h3>
    <p>To use certain features of the Service, you must create an account. You agree to provide accurate, current, and complete information during registration.</p>
    
    <h3>3.2 Account Security</h3>
    <p>You are responsible for:</p>
    <ul>
        <li>Maintaining the confidentiality of your account credentials</li>
        <li>All activities that occur under your account</li>
        <li>Notifying us immediately of any unauthorized access</li>
    </ul>
    
    <h2>4. Subscription and Payment</h2>
    <div class="highlight">
        <p><strong>Free Trial:</strong> New users receive a 30-day free trial with full access to all features.</p>
        <p><strong>Subscription:</strong> After the trial period, continued access requires a paid subscription at $30/month.</p>
        <p><strong>Cancellation:</strong> You may cancel your subscription at any time. Access will continue until the end of the current billing period.</p>
    </div>
    
    <h2>5. User Responsibilities</h2>
    <p>As a user of AgentRoute AI, you agree to:</p>
    <ul>
        <li>Comply with all applicable insurance laws and regulations</li>
        <li>Provide accurate and truthful information to clients</li>
        <li>Maintain proper licensing for insurance sales activities</li>
        <li>Use the Service only for lawful purposes</li>
        <li>Not share your account with others</li>
        <li>Respect the privacy of your clients and leads</li>
    </ul>
    
    <h2>6. Intellectual Property</h2>
    <p>The Service, including its content, features, and functionality, is owned by AgentRoute AI and is protected by copyright, trademark, and other intellectual property laws.</p>
    
    <h2>7. Data and Privacy</h2>
    <p>Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and use of your information as described in our Privacy Policy.</p>
    
    <h2>8. Disclaimers</h2>
    <ul>
        <li>AgentRoute AI is a productivity tool and does not provide insurance, legal, or financial advice</li>
        <li>The Service is provided "as is" without warranties of any kind</li>
        <li>We do not guarantee that the Service will be uninterrupted or error-free</li>
        <li>AI-generated content is for assistance only and should be reviewed before use</li>
    </ul>
    
    <h2>9. Limitation of Liability</h2>
    <p>To the maximum extent permitted by law, AgentRoute AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</p>
    
    <h2>10. Account Termination</h2>
    <p>We reserve the right to suspend or terminate your account if you:</p>
    <ul>
        <li>Violate these Terms of Service</li>
        <li>Engage in fraudulent or illegal activities</li>
        <li>Fail to pay subscription fees when due</li>
    </ul>
    <p>You may also delete your account at any time through the app's Settings.</p>
    
    <h2>11. Account Modes and Team Membership</h2>
    <div class="highlight">
        <p><strong>Solo Mode:</strong> You may use AgentRoute AI as an independent agent with full ownership of your data.</p>
        <p><strong>Team/Hierarchy Mode:</strong> You may join an organization or team using an invitation token/link provided by an Admin or Manager.</p>
    </div>
    
    <h3>11.1 Joining a Team</h3>
    <ul>
        <li>You can join a team during signup or later from Settings</li>
        <li>Your role (Admin, Manager, or Agent) is assigned by the inviting party, not self-selected</li>
        <li>Joining a team grants your Admin/Manager visibility into your activity according to their role permissions</li>
    </ul>
    
    <h3>11.2 Leaving a Team</h3>
    <ul>
        <li>You may leave a team at any time from Settings</li>
        <li>Leaving a team does NOT delete your account</li>
        <li>Your agent-owned records (leads, appointments, notes) remain with you</li>
        <li>Your former team immediately loses access to your records upon separation</li>
    </ul>
    
    <h3>11.3 Data Ownership in Teams</h3>
    <ul>
        <li>Records you create as an agent are owned by you</li>
        <li>While connected to a team, your Admin/Manager may view your records per their role</li>
        <li>When you leave, your agent-owned data moves with you into Solo mode</li>
        <li>Only explicitly shared or team-owned records remain with the organization</li>
    </ul>
    
    <h2>12. Invitation Tokens</h2>
    <ul>
        <li>Invitation tokens are generated by authorized Admins and Managers</li>
        <li>Tokens contain organization and role assignment information</li>
        <li>Users cannot self-select Admin or Manager roles through signup</li>
        <li>Tokens expire after 7 days and cannot be reused after acceptance</li>
        <li>Sharing invitation tokens is the responsibility of the inviting party</li>
    </ul>
    
    <h2>13. Changes to Terms</h2>
    <p>We may update these Terms from time to time. We will notify you of any material changes by posting the new Terms in the app or sending you an email.</p>
    
    <h2>14. Governing Law</h2>
    <p>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.</p>
    
    <div class="contact">
        <h2 style="margin-top: 0;">Contact Us</h2>
        <p>If you have any questions about these Terms, please contact us:</p>
        <p>Email: <a href="mailto:agentrouteai@gmail.com">agentrouteai@gmail.com</a></p>
    </div>
</body>
</html>
    """
    return HTMLResponse(content=html_content)

# Short URL aliases for legal pages
@api_router.get("/privacy", response_class=HTMLResponse)
async def get_privacy_short():
    """Short URL alias for Privacy Policy"""
    return await get_privacy_policy_html()

@api_router.get("/terms", response_class=HTMLResponse)
async def get_terms_short():
    """Short URL alias for Terms of Service"""
    return await get_terms_of_service_html()

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

# ==================== SMART LEAD DISTRIBUTION SYSTEM ====================

@api_router.get("/smart-distribution/summary")
async def get_distribution_summary(current_user: dict = Depends(require_manager_or_admin)):
    """Get comprehensive lead distribution summary for Admin/Manager dashboards"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Total leads
    total_leads = await db.leads.count_documents({
        "$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ],
        "deleted_at": None
    })
    
    # Unassigned leads
    unassigned_leads = await db.leads.count_documents({
        "created_by_user": {"$in": user_ids},
        "$or": [
            {"assigned_to_user": None},
            {"assigned_to_user": {"$exists": False}},
            {"assigned_to_user": ""}
        ],
        "deleted_at": None
    })
    
    # Assigned leads
    assigned_leads = total_leads - unassigned_leads
    
    # Leads by stage
    pipeline_stages = await db.leads.aggregate([
        {"$match": {
            "$or": [
                {"created_by_user": {"$in": user_ids}},
                {"assigned_to_user": {"$in": user_ids}}
            ],
            "deleted_at": None
        }},
        {"$group": {"_id": "$stage", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    leads_by_stage = {item["_id"] or "new": item["count"] for item in pipeline_stages}
    
    # Leads by agent
    agent_pipeline = await db.leads.aggregate([
        {"$match": {
            "assigned_to_user": {"$in": user_ids, "$ne": None},
            "deleted_at": None
        }},
        {"$group": {"_id": "$assigned_to_user", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    leads_by_agent = []
    for item in agent_pipeline:
        agent = await db.users.find_one({"id": item["_id"]})
        if agent:
            leads_by_agent.append({
                "agent_id": item["_id"],
                "agent_name": agent.get("name", "Unknown"),
                "lead_count": item["count"]
            })
    
    # Distribution methods used (from activity log)
    distribution_methods = await db.lead_activities.aggregate([
        {"$match": {"activity_type": "assigned"}},
        {"$group": {"_id": "$assignment_method", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    methods_used = {item["_id"] or "manual": item["count"] for item in distribution_methods}
    
    # Calculate averages
    agent_count = len(leads_by_agent) if leads_by_agent else 1
    avg_leads_per_agent = assigned_leads / agent_count if agent_count > 0 else 0
    
    # Top performing agents (by closed_won stage)
    top_agents_pipeline = await db.leads.aggregate([
        {"$match": {
            "assigned_to_user": {"$in": user_ids},
            "stage": {"$in": ["closed_won", "policy_issued", "policy_placed", "commission_paid"]},
            "deleted_at": None
        }},
        {"$group": {"_id": "$assigned_to_user", "won_count": {"$sum": 1}}},
        {"$sort": {"won_count": -1}},
        {"$limit": 5}
    ]).to_list(5)
    
    top_performing_agents = []
    for item in top_agents_pipeline:
        agent = await db.users.find_one({"id": item["_id"]})
        if agent:
            top_performing_agents.append({
                "agent_id": item["_id"],
                "agent_name": agent.get("name", "Unknown"),
                "closed_won": item["won_count"]
            })
    
    return LeadDistributionSummary(
        total_leads=total_leads,
        unassigned_leads=unassigned_leads,
        assigned_leads=assigned_leads,
        leads_by_stage=leads_by_stage,
        leads_by_agent=leads_by_agent,
        distribution_methods_used=methods_used,
        avg_leads_per_agent=round(avg_leads_per_agent, 1),
        top_performing_agents=top_performing_agents
    )

@api_router.get("/smart-distribution/agents")
async def get_agent_performance_metrics(current_user: dict = Depends(require_manager_or_admin)):
    """Get detailed performance metrics for all agents under current user"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Get all agents
    agents = await db.users.find({
        "id": {"$in": user_ids},
        "role": {"$in": ["agent", "manager"]},
        "deleted_at": None
    }).to_list(100)
    
    metrics = []
    for agent in agents:
        agent_id = agent["id"]
        
        # Total leads assigned to agent
        total_leads = await db.leads.count_documents({
            "assigned_to_user": agent_id,
            "deleted_at": None
        })
        
        # Leads by stage
        stage_pipeline = await db.leads.aggregate([
            {"$match": {"assigned_to_user": agent_id, "deleted_at": None}},
            {"$group": {"_id": "$stage", "count": {"$sum": 1}}}
        ]).to_list(20)
        
        leads_by_stage = {item["_id"] or "new": item["count"] for item in stage_pipeline}
        
        # Closed won/lost
        closed_won = leads_by_stage.get("closed_won", 0) + leads_by_stage.get("policy_issued", 0) + leads_by_stage.get("policy_placed", 0)
        closed_lost = leads_by_stage.get("closed_lost", 0)
        
        # Active pipeline (not closed)
        active_pipeline = total_leads - closed_won - closed_lost
        
        # Conversion rate
        total_closed = closed_won + closed_lost
        conversion_rate = (closed_won / total_closed * 100) if total_closed > 0 else 0
        
        # SOA completion rate
        leads_with_appointments = await db.leads.count_documents({
            "assigned_to_user": agent_id,
            "stage": {"$in": ["appointment_set", "appointment_scheduled", "soa_completed", "policy_submitted", "closed_won"]},
            "deleted_at": None
        })
        
        soas_completed = await db.scope_forms.count_documents({
            "created_by_user": agent_id
        })
        
        soa_completion_rate = (soas_completed / leads_with_appointments * 100) if leads_with_appointments > 0 else 0
        
        # Last activity
        last_lead = await db.leads.find_one(
            {"assigned_to_user": agent_id},
            sort=[("last_contact_date", -1)]
        )
        last_activity = last_lead.get("last_contact_date") if last_lead else None
        
        metrics.append(AgentPerformanceMetrics(
            agent_id=agent_id,
            agent_name=agent.get("name", "Unknown"),
            agent_email=agent.get("email", ""),
            total_leads=total_leads,
            leads_by_stage=leads_by_stage,
            conversion_rate=round(conversion_rate, 1),
            avg_response_time_hours=None,  # Could be calculated from activity timestamps
            soa_completion_rate=round(soa_completion_rate, 1),
            closed_won=closed_won,
            closed_lost=closed_lost,
            active_pipeline=active_pipeline,
            last_activity=last_activity
        ))
    
    return metrics

@api_router.post("/smart-distribution/distribute")
async def smart_distribute_leads(request: SmartDistributionRequest, current_user: dict = Depends(require_manager_or_admin)):
    """Smart lead distribution with multiple methods"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Get the leads to distribute
    leads = await db.leads.find({
        "id": {"$in": request.lead_ids},
        "deleted_at": None
    }).to_list(len(request.lead_ids))
    
    if not leads:
        raise HTTPException(status_code=404, detail="No valid leads found")
    
    # Get available agents
    if request.target_agent_ids:
        agent_ids = request.target_agent_ids
    elif request.manager_id and request.method == "manager_group":
        # Get agents under the specified manager
        agents = await db.users.find({
            "manager_id": request.manager_id,
            "role": "agent",
            "deleted_at": None
        }).to_list(100)
        agent_ids = [a["id"] for a in agents]
    else:
        # Get all agents accessible to current user
        agents = await db.users.find({
            "id": {"$in": user_ids},
            "role": "agent",
            "deleted_at": None
        }).to_list(100)
        agent_ids = [a["id"] for a in agents]
    
    if not agent_ids:
        raise HTTPException(status_code=400, detail="No agents available for distribution")
    
    # Get current workloads for each agent
    agent_workloads = {}
    for aid in agent_ids:
        workload = await db.leads.count_documents({
            "assigned_to_user": aid,
            "stage": {"$nin": ["closed_won", "closed_lost"]},
            "deleted_at": None
        })
        agent_workloads[aid] = workload
    
    # Get territories if needed
    territories = {}
    if request.method == "territory" or request.respect_territories:
        terr_docs = await db.territories.find({
            "assigned_agents": {"$in": agent_ids}
        }).to_list(100)
        for t in terr_docs:
            for aid in t.get("assigned_agents", []):
                if aid not in territories:
                    territories[aid] = []
                territories[aid].append({
                    "zip_codes": t.get("zip_codes", []),
                    "cities": t.get("cities", []),
                    "states": t.get("states", [])
                })
    
    assignments = []
    skipped = []
    agent_index = 0
    
    for lead in leads:
        assigned_agent_id = None
        skip_reason = None
        
        if request.method == "equal" or request.method == "round_robin":
            # Simple round-robin
            assigned_agent_id = agent_ids[agent_index % len(agent_ids)]
            agent_index += 1
            
        elif request.method == "territory":
            # Match by territory (zip code)
            lead_address = lead.get("address", "")
            lead_zip = ""
            # Extract zip code from address (last 5 digits)
            import re
            zip_match = re.search(r'\b(\d{5})\b', lead_address)
            if zip_match:
                lead_zip = zip_match.group(1)
            
            # Find agent with matching territory
            for aid, terrs in territories.items():
                for t in terrs:
                    if lead_zip in t.get("zip_codes", []):
                        assigned_agent_id = aid
                        break
                if assigned_agent_id:
                    break
            
            if not assigned_agent_id:
                # Fall back to round-robin if no territory match
                if request.balance_workload:
                    assigned_agent_id = min(agent_workloads, key=agent_workloads.get)
                else:
                    assigned_agent_id = agent_ids[agent_index % len(agent_ids)]
                    agent_index += 1
                    
        elif request.method == "availability" or request.method == "workload":
            # Assign to agent with lowest workload
            assigned_agent_id = min(agent_workloads, key=agent_workloads.get)
            agent_workloads[assigned_agent_id] += 1  # Update workload
            
        elif request.method == "manager_group":
            # Already filtered agents by manager, use round-robin
            assigned_agent_id = agent_ids[agent_index % len(agent_ids)]
            agent_index += 1
        
        if assigned_agent_id:
            # Update lead
            await db.leads.update_one(
                {"id": lead["id"]},
                {"$set": {
                    "assigned_to_user": assigned_agent_id,
                    "assignment_date": datetime.utcnow(),
                    "assignment_method": request.method
                }}
            )
            
            # Log activity
            agent = await db.users.find_one({"id": assigned_agent_id})
            agent_name = agent.get("name", "Unknown") if agent else "Unknown"
            
            await db.lead_activities.insert_one({
                "id": str(uuid.uuid4()),
                "lead_id": lead["id"],
                "activity_type": "assigned",
                "description": f"Lead assigned to {agent_name} via {request.method} distribution",
                "performed_by": current_user["id"],
                "performed_by_name": current_user.get("name", "System"),
                "old_value": lead.get("assigned_to_user"),
                "new_value": assigned_agent_id,
                "assignment_method": request.method,
                "created_at": datetime.utcnow()
            })
            
            assignments.append({
                "lead_id": lead["id"],
                "lead_name": lead.get("name", "Unknown"),
                "agent_id": assigned_agent_id,
                "agent_name": agent_name
            })
        else:
            skipped.append({
                "lead_id": lead["id"],
                "reason": skip_reason or "Could not find suitable agent"
            })
    
    return SmartDistributionResult(
        total_distributed=len(assignments),
        assignments=assignments,
        skipped=skipped,
        method_used=request.method
    )

@api_router.get("/smart-distribution/activity/{lead_id}")
async def get_lead_activity_history(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get activity history for a specific lead"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Verify lead access
    lead = await db.leads.find_one({
        "id": lead_id,
        "$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ],
        "deleted_at": None
    })
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Get activities
    activities = await db.lead_activities.find({
        "lead_id": lead_id
    }).sort("created_at", -1).to_list(100)
    
    return [
        LeadActivityEntry(
            id=a["id"],
            lead_id=a["lead_id"],
            activity_type=a["activity_type"],
            description=a["description"],
            performed_by=a["performed_by"],
            performed_by_name=a.get("performed_by_name", "Unknown"),
            old_value=a.get("old_value"),
            new_value=a.get("new_value"),
            created_at=a["created_at"]
        )
        for a in activities
    ]

@api_router.post("/smart-distribution/activity")
async def log_lead_activity(activity: LeadActivityCreate, current_user: dict = Depends(get_current_user)):
    """Log a new activity for a lead"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Verify lead access
    lead = await db.leads.find_one({
        "id": activity.lead_id,
        "$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ],
        "deleted_at": None
    })
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    activity_doc = {
        "id": str(uuid.uuid4()),
        "lead_id": activity.lead_id,
        "activity_type": activity.activity_type,
        "description": activity.description,
        "performed_by": current_user["id"],
        "performed_by_name": current_user.get("name", "Unknown"),
        "old_value": activity.old_value,
        "new_value": activity.new_value,
        "created_at": datetime.utcnow()
    }
    
    await db.lead_activities.insert_one(activity_doc)
    
    # Update lead's last_contact_date if relevant activity
    if activity.activity_type in ["contacted", "call", "email", "meeting"]:
        await db.leads.update_one(
            {"id": activity.lead_id},
            {"$set": {"last_contact_date": datetime.utcnow()}}
        )
    
    return activity_doc

# ==================== MEDICARE COMPLIANCE TRACKING SYSTEM ====================

@api_router.get("/compliance/summary")
async def get_compliance_summary(current_user: dict = Depends(require_manager_or_admin)):
    """Get Medicare compliance summary for Admin/Manager dashboards"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Total leads
    total_leads = await db.leads.count_documents({
        "$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ],
        "deleted_at": None
    })
    
    # Get all leads with their SOA status
    leads = await db.leads.find({
        "$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ],
        "deleted_at": None
    }).to_list(10000)
    
    lead_ids = [l["id"] for l in leads]
    
    # Get all SOAs for these leads
    soas = await db.scope_forms.find({
        "lead_id": {"$in": lead_ids}
    }).to_list(10000)
    
    soa_by_lead = {}
    for soa in soas:
        if soa["lead_id"] not in soa_by_lead:
            soa_by_lead[soa["lead_id"]] = []
        soa_by_lead[soa["lead_id"]].append(soa)
    
    # Count leads with/without SOA
    leads_with_soa = len([l for l in leads if l["id"] in soa_by_lead])
    leads_without_soa = total_leads - leads_with_soa
    
    # Count signed SOAs
    signed_soas = 0
    pending_soas = 0
    for lead_id, lead_soas in soa_by_lead.items():
        for soa in lead_soas:
            if soa.get("signature") and soa.get("signature") != "":
                signed_soas += 1
            else:
                pending_soas += 1
    
    # Get appointments
    appointments = await db.appointments.find({
        "lead_id": {"$in": lead_ids},
        "status": {"$in": ["scheduled", "pending", "completed"]}
    }).to_list(10000)
    
    # Appointments without SOA
    appointments_without_soa = 0
    compliant_appointments = 0
    
    for apt in appointments:
        apt_lead_soas = soa_by_lead.get(apt["lead_id"], [])
        has_signed_soa = any(s.get("signature") for s in apt_lead_soas)
        
        if not apt_lead_soas:
            appointments_without_soa += 1
        elif has_signed_soa:
            compliant_appointments += 1
        else:
            appointments_without_soa += 1
    
    # Calculate compliance rate
    total_requiring_compliance = len(appointments)
    compliance_rate = (compliant_appointments / total_requiring_compliance * 100) if total_requiring_compliance > 0 else 100.0
    
    return ComplianceSummary(
        total_leads=total_leads,
        leads_with_soa=leads_with_soa,
        leads_without_soa=leads_without_soa,
        signed_soas=signed_soas,
        pending_soas=pending_soas,
        appointments_without_soa=appointments_without_soa,
        compliant_appointments=compliant_appointments,
        compliance_rate=round(compliance_rate, 1)
    )

@api_router.get("/compliance/records")
async def get_compliance_records(
    status: Optional[str] = None,  # missing_soa, pending_signature, signed, compliant
    limit: int = 50,
    current_user: dict = Depends(require_manager_or_admin)
):
    """Get detailed compliance records for each lead/appointment"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Get leads with their appointments and SOAs
    leads = await db.leads.find({
        "$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ],
        "deleted_at": None
    }).to_list(1000)
    
    records = []
    
    for lead in leads:
        # Get appointments for this lead
        appointments = await db.appointments.find({
            "lead_id": lead["id"],
            "status": {"$ne": "cancelled"}
        }).to_list(100)
        
        # Get SOAs for this lead
        soas = await db.scope_forms.find({
            "lead_id": lead["id"]
        }).to_list(100)
        
        # Get agent info
        agent_id = lead.get("assigned_to_user") or lead.get("created_by_user")
        agent = await db.users.find_one({"id": agent_id})
        agent_name = agent.get("name", "Unknown") if agent else "Unknown"
        
        # Determine compliance status
        has_soa = len(soas) > 0
        has_signed_soa = any(s.get("signature") and s.get("signature") != "" for s in soas)
        has_pdf = any(s.get("pdf_base64") for s in soas)
        
        if not has_soa:
            compliance_status = "missing_soa"
        elif not has_signed_soa:
            compliance_status = "pending_signature"
        elif has_signed_soa and has_pdf:
            compliance_status = "compliant"
        else:
            compliance_status = "signed"
        
        # Filter by status if provided
        if status and compliance_status != status:
            continue
        
        # Get the most recent SOA and appointment
        latest_soa = soas[0] if soas else None
        latest_apt = appointments[0] if appointments else None
        
        record = ComplianceRecord(
            lead_id=lead["id"],
            lead_name=lead.get("name", "Unknown"),
            appointment_id=latest_apt["id"] if latest_apt else None,
            appointment_date=latest_apt.get("appointment_date") if latest_apt else None,
            appointment_time=latest_apt.get("appointment_time") if latest_apt else None,
            soa_id=latest_soa["id"] if latest_soa else None,
            soa_signed=has_signed_soa,
            soa_signature_timestamp=latest_soa.get("created_date") if latest_soa and has_signed_soa else None,
            soa_pdf_available=has_pdf,
            compliance_status=compliance_status,
            agent_id=agent_id,
            agent_name=agent_name,
            created_date=lead.get("created_date", datetime.utcnow()),
            last_updated=lead.get("last_contact_date", lead.get("created_date", datetime.utcnow()))
        )
        
        records.append(record)
        
        if len(records) >= limit:
            break
    
    return records

@api_router.get("/compliance/lead/{lead_id}")
async def get_lead_compliance_status(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get compliance status for a specific lead"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Get lead
    lead = await db.leads.find_one({
        "id": lead_id,
        "$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ],
        "deleted_at": None
    })
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Get appointments
    appointments = await db.appointments.find({
        "lead_id": lead_id,
        "status": {"$ne": "cancelled"}
    }).to_list(100)
    
    # Get SOAs
    soas = await db.scope_forms.find({
        "lead_id": lead_id
    }).to_list(100)
    
    # Determine compliance
    has_soa = len(soas) > 0
    has_signed_soa = any(s.get("signature") and s.get("signature") != "" for s in soas)
    has_pdf = any(s.get("pdf_base64") for s in soas)
    has_appointment = len(appointments) > 0
    
    if not has_soa:
        compliance_status = "missing_soa"
        compliance_message = "No Scope of Appointment on file"
    elif not has_signed_soa:
        compliance_status = "pending_signature"
        compliance_message = "SOA exists but awaiting signature"
    elif has_signed_soa and has_pdf:
        compliance_status = "compliant"
        compliance_message = "Fully compliant - SOA signed and PDF available"
    else:
        compliance_status = "signed"
        compliance_message = "SOA signed, PDF generation pending"
    
    return {
        "lead_id": lead_id,
        "lead_name": lead.get("name", "Unknown"),
        "compliance_status": compliance_status,
        "compliance_message": compliance_message,
        "has_appointment": has_appointment,
        "appointment_count": len(appointments),
        "has_soa": has_soa,
        "soa_count": len(soas),
        "has_signed_soa": has_signed_soa,
        "has_pdf": has_pdf,
        "soas": [
            {
                "id": s["id"],
                "typed_name": s.get("typed_name", ""),
                "signed": bool(s.get("signature")),
                "created_date": s.get("created_date"),
                "has_pdf": bool(s.get("pdf_base64"))
            }
            for s in soas
        ],
        "appointments": [
            {
                "id": a["id"],
                "date": a.get("appointment_date"),
                "time": a.get("appointment_time"),
                "status": a.get("status", "scheduled")
            }
            for a in appointments
        ]
    }

@api_router.get("/compliance/appointment/{appointment_id}")
async def get_appointment_compliance_status(appointment_id: str, current_user: dict = Depends(get_current_user)):
    """Get compliance status for a specific appointment"""
    user_ids = await get_user_accessible_ids(current_user["id"], current_user.get("role", "agent"))
    
    # Get appointment
    appointment = await db.appointments.find_one({
        "id": appointment_id,
        "created_by_user": {"$in": user_ids}
    })
    
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    lead_id = appointment.get("lead_id")
    
    # Get lead
    lead = await db.leads.find_one({"id": lead_id})
    
    # Get SOAs for the lead
    soas = await db.scope_forms.find({
        "lead_id": lead_id
    }).to_list(100)
    
    has_soa = len(soas) > 0
    has_signed_soa = any(s.get("signature") and s.get("signature") != "" for s in soas)
    has_pdf = any(s.get("pdf_base64") for s in soas)
    
    # Determine compliance
    if not has_soa:
        compliance_status = "missing_soa"
        is_compliant = False
    elif not has_signed_soa:
        compliance_status = "pending_signature"
        is_compliant = False
    else:
        compliance_status = "compliant"
        is_compliant = True
    
    return {
        "appointment_id": appointment_id,
        "lead_id": lead_id,
        "lead_name": lead.get("name", "Unknown") if lead else "Unknown",
        "appointment_date": appointment.get("appointment_date"),
        "appointment_time": appointment.get("appointment_time"),
        "appointment_status": appointment.get("status", "scheduled"),
        "compliance_status": compliance_status,
        "is_compliant": is_compliant,
        "has_soa": has_soa,
        "has_signed_soa": has_signed_soa,
        "has_pdf": has_pdf,
        "soas": [
            {
                "id": s["id"],
                "typed_name": s.get("typed_name", ""),
                "signed": bool(s.get("signature")),
                "created_date": s.get("created_date")
            }
            for s in soas
        ]
    }

@api_router.get("/compliance/dashboard-cards")
async def get_compliance_dashboard_cards(current_user: dict = Depends(get_current_user)):
    """Get compliance summary cards for any dashboard"""
    user_role = current_user.get("role", "agent")
    user_ids = await get_user_accessible_ids(current_user["id"], user_role)
    
    # For agents, only show their own compliance
    if user_role == "agent":
        query = {"$or": [
            {"created_by_user": current_user["id"]},
            {"assigned_to_user": current_user["id"]}
        ], "deleted_at": None}
    else:
        query = {"$or": [
            {"created_by_user": {"$in": user_ids}},
            {"assigned_to_user": {"$in": user_ids}}
        ], "deleted_at": None}
    
    # Get leads
    leads = await db.leads.find(query).to_list(10000)
    lead_ids = [l["id"] for l in leads]
    
    # Get SOAs
    soas = await db.scope_forms.find({
        "lead_id": {"$in": lead_ids}
    }).to_list(10000)
    
    soa_by_lead = {}
    for soa in soas:
        if soa["lead_id"] not in soa_by_lead:
            soa_by_lead[soa["lead_id"]] = []
        soa_by_lead[soa["lead_id"]].append(soa)
    
    # Get upcoming appointments (next 7 days)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    week_later = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
    
    upcoming_appointments = await db.appointments.find({
        "lead_id": {"$in": lead_ids},
        "appointment_date": {"$gte": today, "$lte": week_later},
        "status": {"$in": ["scheduled", "pending"]}
    }).to_list(1000)
    
    # Calculate metrics
    missing_soa_count = 0
    signed_soa_count = 0
    pending_appointments_no_soa = 0
    compliant_appointments = 0
    
    for lead in leads:
        lead_soas = soa_by_lead.get(lead["id"], [])
        if not lead_soas:
            missing_soa_count += 1
        elif any(s.get("signature") for s in lead_soas):
            signed_soa_count += 1
    
    for apt in upcoming_appointments:
        lead_soas = soa_by_lead.get(apt["lead_id"], [])
        if not lead_soas:
            pending_appointments_no_soa += 1
        elif any(s.get("signature") for s in lead_soas):
            compliant_appointments += 1
        else:
            pending_appointments_no_soa += 1
    
    return {
        "missing_soa": {
            "count": missing_soa_count,
            "label": "Missing SOA",
            "color": "#EF4444",
            "icon": "alert-circle"
        },
        "signed_soa": {
            "count": signed_soa_count,
            "label": "Signed SOA",
            "color": "#22C55E",
            "icon": "checkmark-circle"
        },
        "pending_no_soa": {
            "count": pending_appointments_no_soa,
            "label": "Appointments Without SOA",
            "color": "#F59E0B",
            "icon": "warning"
        },
        "compliant_appointments": {
            "count": compliant_appointments,
            "label": "Compliant Appointments",
            "color": "#3B82F6",
            "icon": "shield-checkmark"
        },
        "total_leads": len(leads),
        "total_upcoming_appointments": len(upcoming_appointments)
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
