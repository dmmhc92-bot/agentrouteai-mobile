from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
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
from datetime import datetime, timedelta, date
from passlib.context import CryptContext
from jose import JWTError, jwt
import secrets
import base64
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.units import inch
import math
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'fallback-secret-key')
ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 10080))

# Email Configuration (Ready for SendGrid)
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@agentroute.ai')

# Stripe Configuration (Ready for Stripe)
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY', '')
STRIPE_PRICE_ID = os.environ.get('STRIPE_PRICE_ID', '')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Create the main app
app = FastAPI(title="AgentRoute AI API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== ENUMS ====================

class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    AGENT = "agent"

class ActivityType(str, Enum):
    LOGIN = "login"
    LEAD_CREATED = "lead_created"
    LEAD_UPDATED = "lead_updated"
    APPOINTMENT_CREATED = "appointment_created"
    APPOINTMENT_COMPLETED = "appointment_completed"
    SCOPE_CREATED = "scope_created"
    PRODUCTION_ADDED = "production_added"

# ==================== MODELS ====================

# User Models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Optional[str] = "agent"
    manager_id: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

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
    profile_image: Optional[str]

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    profile_image: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# Lead Models
class LeadCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    source: Optional[str] = "manual"
    status: Optional[str] = "new"

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class LeadResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    address: str
    notes: str
    source: str
    status: str
    created_by_user: str
    created_date: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None

# Appointment Models
class AppointmentCreate(BaseModel):
    lead_id: str
    appointment_date: str
    appointment_time: str
    notes: Optional[str] = ""
    status: Optional[str] = "scheduled"

class AppointmentUpdate(BaseModel):
    lead_id: Optional[str] = None
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class AppointmentResponse(BaseModel):
    id: str
    lead_id: str
    appointment_date: str
    appointment_time: str
    notes: str
    status: str
    created_by_user: str
    created_date: datetime

# Scope of Appointment Models
class ScopeCreate(BaseModel):
    lead_id: str
    form_fields: Dict[str, Any]
    typed_name: str
    signature: Optional[str] = ""

class ScopeResponse(BaseModel):
    id: str
    lead_id: str
    form_fields: Dict[str, Any]
    typed_name: str
    signature: str
    created_date: datetime
    created_by_user: str

# Production Models
class ProductionCreate(BaseModel):
    lead_id: Optional[str] = None
    policy_type: str
    premium: float
    commission: float
    carrier: str
    policy_number: Optional[str] = ""
    status: Optional[str] = "submitted"
    notes: Optional[str] = ""

class ProductionResponse(BaseModel):
    id: str
    lead_id: Optional[str]
    policy_type: str
    premium: float
    commission: float
    carrier: str
    policy_number: str
    status: str
    notes: str
    created_by_user: str
    created_date: datetime

class ProductionSummary(BaseModel):
    total_premium: float
    total_commission: float
    policy_count: int
    period: str

# Activity Log Models
class ActivityLog(BaseModel):
    id: str
    user_id: str
    activity_type: str
    description: str
    metadata: Dict[str, Any]
    created_at: datetime

# AI Assistant Models
class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[datetime] = None

class ChatRequest(BaseModel):
    message: str
    lead_context: Optional[str] = None
    lead_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    timestamp: datetime
    suggestions: Optional[List[str]] = None
    talking_points: Optional[List[str]] = None
    documents_needed: Optional[List[str]] = None
    follow_up_reminder: Optional[str] = None

# OCR Models
class OCRRequest(BaseModel):
    image_base64: str

class OCRResponse(BaseModel):
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    raw_text: str

# Subscription Models
class SubscriptionStatus(BaseModel):
    status: str
    plan: str
    expires_at: Optional[datetime] = None
    is_trial: bool
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None

# Route Planning Models
class RouteStop(BaseModel):
    lead_id: str
    lead_name: str
    address: str
    appointment_id: Optional[str] = None
    appointment_time: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    order: int
    talking_points: Optional[List[str]] = None
    documents_needed: Optional[List[str]] = None

class DailyRouteRequest(BaseModel):
    date: str
    start_address: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None

class DailyRouteResponse(BaseModel):
    date: str
    stops: List[RouteStop]
    total_distance_km: float
    estimated_duration_mins: int
    optimized: bool
    ai_suggestions: Optional[str] = None

# Team/Hierarchy Models
class TeamMember(BaseModel):
    id: str
    name: str
    email: str
    role: str
    leads_count: int
    appointments_count: int
    production_total: float
    commission_total: float
    last_login: Optional[datetime]

class DownlineStats(BaseModel):
    total_agents: int
    total_leads: int
    total_appointments: int
    total_production: float
    total_commission: float

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
    
    user = await db.users.find_one({"id": user_id})
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

async def log_activity(user_id: str, activity_type: str, description: str, metadata: dict = None):
    """Log user activity for tracking"""
    activity = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "activity_type": activity_type,
        "description": description,
        "metadata": metadata or {},
        "created_at": datetime.utcnow()
    }
    await db.activity_logs.insert_one(activity)

async def send_email(to_email: str, subject: str, html_content: str):
    """Send email via SendGrid or log to console"""
    if SENDGRID_API_KEY:
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail
            
            sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
            message = Mail(
                from_email=SENDER_EMAIL,
                to_emails=to_email,
                subject=subject,
                html_content=html_content
            )
            response = sg.send(message)
            logger.info(f"Email sent to {to_email}, status: {response.status_code}")
            return True
        except Exception as e:
            logger.error(f"SendGrid error: {e}")
            return False
    else:
        # Mock email - log to console
        logger.info("=" * 60)
        logger.info(f"MOCK EMAIL (SendGrid not configured)")
        logger.info(f"To: {to_email}")
        logger.info(f"Subject: {subject}")
        logger.info(f"Content: {html_content[:200]}...")
        logger.info("=" * 60)
        return True

async def get_user_downline_ids(user_id: str, role: str) -> List[str]:
    """Get all user IDs that a manager/admin can access"""
    if role == "admin":
        # Admin can see all users
        users = await db.users.find({}, {"id": 1}).to_list(10000)
        return [u["id"] for u in users]
    elif role == "manager":
        # Manager can see their direct downline
        downline = await db.users.find({"manager_id": user_id}, {"id": 1}).to_list(1000)
        return [user_id] + [u["id"] for u in downline]
    else:
        # Agent can only see themselves
        return [user_id]

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing_user = await db.users.find_one({"email": user_data.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate manager_id if provided
    if user_data.manager_id:
        manager = await db.users.find_one({"id": user_data.manager_id})
        if not manager or manager.get("role") not in ["admin", "manager"]:
            raise HTTPException(status_code=400, detail="Invalid manager ID")
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": user_data.name,
        "email": user_data.email.lower(),
        "password_hash": get_password_hash(user_data.password),
        "role": user_data.role if user_data.role in ["admin", "manager", "agent"] else "agent",
        "manager_id": user_data.manager_id,
        "subscription_status": "trial",
        "created_at": datetime.utcnow(),
        "last_login": datetime.utcnow(),
        "reset_token": None,
        "reset_token_expiry": None,
        "phone": None,
        "profile_image": None,
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "deleted_at": None
    }
    await db.users.insert_one(user_doc)
    
    # Log activity
    await log_activity(user_id, "login", "User registered and logged in")
    
    # Create token
    access_token = create_access_token(data={"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user_id,
            name=user_data.name,
            email=user_data.email.lower(),
            role=user_doc["role"],
            manager_id=user_doc["manager_id"],
            subscription_status="trial",
            created_at=user_doc["created_at"],
            last_login=user_doc["last_login"],
            phone=None,
            profile_image=None
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower(), "deleted_at": None})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Update last login
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Log activity
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
            subscription_status=user.get("subscription_status", "trial"),
            created_at=user["created_at"],
            last_login=datetime.utcnow(),
            phone=user.get("phone"),
            profile_image=user.get("profile_image")
        )
    )

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    user = await db.users.find_one({"email": request.email.lower()})
    if not user:
        return {"message": "If the email exists, a reset link has been sent"}
    
    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    reset_expiry = datetime.utcnow() + timedelta(hours=1)
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"reset_token": reset_token, "reset_token_expiry": reset_expiry}}
    )
    
    # Send email (or log)
    reset_link = f"agentroute://reset-password?token={reset_token}"
    email_content = f"""
    <h2>Password Reset Request</h2>
    <p>Hi {user['name']},</p>
    <p>You requested to reset your password. Use the following token:</p>
    <p><strong>{reset_token}</strong></p>
    <p>Or click this link: <a href="{reset_link}">Reset Password</a></p>
    <p>This token expires in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
    """
    
    await send_email(request.email, "AgentRoute AI - Password Reset", email_content)
    
    # Return dev_token in development mode
    return {"message": "If the email exists, a reset link has been sent", "dev_token": reset_token}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    user = await db.users.find_one({
        "reset_token": request.token,
        "reset_token_expiry": {"$gt": datetime.utcnow()}
    })
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "password_hash": get_password_hash(request.new_password),
                "reset_token": None,
                "reset_token_expiry": None
            }
        }
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
        subscription_status=current_user.get("subscription_status", "trial"),
        created_at=current_user["created_at"],
        last_login=current_user.get("last_login"),
        phone=current_user.get("phone"),
        profile_image=current_user.get("profile_image")
    )

@api_router.put("/auth/profile", response_model=UserResponse)
async def update_profile(profile: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in profile.dict().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"id": current_user["id"]})
    return UserResponse(
        id=updated_user["id"],
        name=updated_user["name"],
        email=updated_user["email"],
        role=updated_user.get("role", "agent"),
        manager_id=updated_user.get("manager_id"),
        subscription_status=updated_user.get("subscription_status", "trial"),
        created_at=updated_user["created_at"],
        last_login=updated_user.get("last_login"),
        phone=updated_user.get("phone"),
        profile_image=updated_user.get("profile_image")
    )

@api_router.delete("/auth/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Soft delete user account - required for App Store compliance"""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"deleted_at": datetime.utcnow()}}
    )
    
    await log_activity(current_user["id"], "account_deleted", "User requested account deletion")
    
    return {"message": "Account scheduled for deletion. Your data will be removed within 30 days."}

# ==================== TEAM/HIERARCHY ROUTES ====================

@api_router.get("/team/downline", response_model=List[TeamMember])
async def get_downline(current_user: dict = Depends(require_manager_or_admin)):
    """Get all downline users for manager/admin"""
    
    if current_user.get("role") == "admin":
        # Admin sees all non-admin users
        query = {"role": {"$ne": "admin"}, "deleted_at": None}
    else:
        # Manager sees their direct downline
        query = {"manager_id": current_user["id"], "deleted_at": None}
    
    users = await db.users.find(query).to_list(1000)
    
    result = []
    for user in users:
        # Get stats for each user
        leads_count = await db.leads.count_documents({"created_by_user": user["id"]})
        appointments_count = await db.appointments.count_documents({"created_by_user": user["id"]})
        
        # Get production totals
        production = await db.production.aggregate([
            {"$match": {"created_by_user": user["id"]}},
            {"$group": {"_id": None, "total_premium": {"$sum": "$premium"}, "total_commission": {"$sum": "$commission"}}}
        ]).to_list(1)
        
        prod_total = production[0] if production else {"total_premium": 0, "total_commission": 0}
        
        result.append(TeamMember(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            role=user.get("role", "agent"),
            leads_count=leads_count,
            appointments_count=appointments_count,
            production_total=prod_total.get("total_premium", 0),
            commission_total=prod_total.get("total_commission", 0),
            last_login=user.get("last_login")
        ))
    
    return result

@api_router.get("/team/downline/{user_id}/stats")
async def get_downline_user_stats(user_id: str, current_user: dict = Depends(require_manager_or_admin)):
    """Get detailed stats for a specific downline user"""
    
    # Verify access
    if current_user.get("role") != "admin":
        target_user = await db.users.find_one({"id": user_id})
        if not target_user or target_user.get("manager_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all data
    leads = await db.leads.find({"created_by_user": user_id}).to_list(1000)
    appointments = await db.appointments.find({"created_by_user": user_id}).to_list(1000)
    scopes = await db.scope_forms.find({"created_by_user": user_id}).to_list(1000)
    production = await db.production.find({"created_by_user": user_id}).to_list(1000)
    activities = await db.activity_logs.find({"user_id": user_id}).sort("created_at", -1).limit(50).to_list(50)
    
    return {
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user.get("role"),
            "last_login": user.get("last_login"),
            "created_at": user["created_at"]
        },
        "leads": leads,
        "appointments": appointments,
        "scopes": scopes,
        "production": production,
        "activities": activities,
        "summary": {
            "total_leads": len(leads),
            "total_appointments": len(appointments),
            "completed_appointments": len([a for a in appointments if a.get("status") == "completed"]),
            "total_scopes": len(scopes),
            "total_production": sum(p.get("premium", 0) for p in production),
            "total_commission": sum(p.get("commission", 0) for p in production)
        }
    }

@api_router.get("/team/stats", response_model=DownlineStats)
async def get_team_stats(current_user: dict = Depends(require_manager_or_admin)):
    """Get aggregate stats for entire team"""
    
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    total_agents = await db.users.count_documents({"id": {"$in": user_ids}, "role": "agent", "deleted_at": None})
    total_leads = await db.leads.count_documents({"created_by_user": {"$in": user_ids}})
    total_appointments = await db.appointments.count_documents({"created_by_user": {"$in": user_ids}})
    
    production = await db.production.aggregate([
        {"$match": {"created_by_user": {"$in": user_ids}}},
        {"$group": {"_id": None, "total_premium": {"$sum": "$premium"}, "total_commission": {"$sum": "$commission"}}}
    ]).to_list(1)
    
    prod_totals = production[0] if production else {"total_premium": 0, "total_commission": 0}
    
    return DownlineStats(
        total_agents=total_agents,
        total_leads=total_leads,
        total_appointments=total_appointments,
        total_production=prod_totals.get("total_premium", 0),
        total_commission=prod_totals.get("total_commission", 0)
    )

@api_router.post("/team/assign-agent")
async def assign_agent_to_manager(agent_id: str, manager_id: str, current_user: dict = Depends(require_admin)):
    """Admin can assign agents to managers"""
    
    agent = await db.users.find_one({"id": agent_id, "role": "agent"})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    manager = await db.users.find_one({"id": manager_id, "role": {"$in": ["manager", "admin"]}})
    if not manager:
        raise HTTPException(status_code=404, detail="Manager not found")
    
    await db.users.update_one({"id": agent_id}, {"$set": {"manager_id": manager_id}})
    
    return {"message": f"Agent assigned to manager successfully"}

# ==================== LEADS ROUTES ====================

@api_router.get("/leads", response_model=List[LeadResponse])
async def get_leads(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    leads = await db.leads.find({"created_by_user": {"$in": user_ids}}).to_list(10000)
    
    result = []
    for lead in leads:
        # Get geocode if available
        geocode = await db.lead_geocodes.find_one({"lead_id": lead["id"]})
        
        result.append(LeadResponse(
            id=lead["id"],
            name=lead["name"],
            phone=lead.get("phone", ""),
            email=lead.get("email", ""),
            address=lead.get("address", ""),
            notes=lead.get("notes", ""),
            source=lead.get("source", "manual"),
            status=lead.get("status", "new"),
            created_by_user=lead["created_by_user"],
            created_date=lead["created_date"],
            latitude=geocode["latitude"] if geocode else None,
            longitude=geocode["longitude"] if geocode else None
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
        "status": lead_data.status or "new",
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow()
    }
    await db.leads.insert_one(lead_doc)
    
    # Auto-geocode if address provided
    if lead_data.address:
        try:
            await geocode_address_internal(lead_id, lead_data.address)
        except:
            pass  # Don't fail lead creation if geocoding fails
    
    # Log activity
    await log_activity(current_user["id"], "lead_created", f"Created lead: {lead_data.name}", {"lead_id": lead_id})
    
    return LeadResponse(**lead_doc, latitude=None, longitude=None)

@api_router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    lead = await db.leads.find_one({"id": lead_id, "created_by_user": {"$in": user_ids}})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    geocode = await db.lead_geocodes.find_one({"lead_id": lead_id})
    
    return LeadResponse(
        id=lead["id"],
        name=lead["name"],
        phone=lead.get("phone", ""),
        email=lead.get("email", ""),
        address=lead.get("address", ""),
        notes=lead.get("notes", ""),
        source=lead.get("source", "manual"),
        status=lead.get("status", "new"),
        created_by_user=lead["created_by_user"],
        created_date=lead["created_date"],
        latitude=geocode["latitude"] if geocode else None,
        longitude=geocode["longitude"] if geocode else None
    )

@api_router.put("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, lead_data: LeadUpdate, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    update_data = {k: v for k, v in lead_data.dict().items() if v is not None}
    
    # Re-geocode if address changed
    if "address" in update_data and update_data["address"] != lead.get("address"):
        try:
            await geocode_address_internal(lead_id, update_data["address"])
        except:
            pass
    
    if update_data:
        await db.leads.update_one({"id": lead_id}, {"$set": update_data})
        await log_activity(current_user["id"], "lead_updated", f"Updated lead: {lead['name']}", {"lead_id": lead_id})
    
    updated_lead = await db.leads.find_one({"id": lead_id})
    geocode = await db.lead_geocodes.find_one({"lead_id": lead_id})
    
    return LeadResponse(
        id=updated_lead["id"],
        name=updated_lead["name"],
        phone=updated_lead.get("phone", ""),
        email=updated_lead.get("email", ""),
        address=updated_lead.get("address", ""),
        notes=updated_lead.get("notes", ""),
        source=updated_lead.get("source", "manual"),
        status=updated_lead.get("status", "new"),
        created_by_user=updated_lead["created_by_user"],
        created_date=updated_lead["created_date"],
        latitude=geocode["latitude"] if geocode else None,
        longitude=geocode["longitude"] if geocode else None
    )

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    await db.leads.delete_one({"id": lead_id})
    await db.appointments.delete_many({"lead_id": lead_id})
    await db.scope_forms.delete_many({"lead_id": lead_id})
    await db.lead_geocodes.delete_many({"lead_id": lead_id})
    
    return {"message": "Lead deleted successfully"}

# ==================== APPOINTMENTS ROUTES ====================

@api_router.get("/appointments", response_model=List[AppointmentResponse])
async def get_appointments(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    appointments = await db.appointments.find({"created_by_user": {"$in": user_ids}}).to_list(10000)
    return [AppointmentResponse(
        id=apt["id"],
        lead_id=apt["lead_id"],
        appointment_date=apt["appointment_date"],
        appointment_time=apt["appointment_time"],
        notes=apt.get("notes", ""),
        status=apt.get("status", "scheduled"),
        created_by_user=apt["created_by_user"],
        created_date=apt["created_date"]
    ) for apt in appointments]

@api_router.post("/appointments", response_model=AppointmentResponse)
async def create_appointment(apt_data: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": apt_data.lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    apt_id = str(uuid.uuid4())
    apt_doc = {
        "id": apt_id,
        "lead_id": apt_data.lead_id,
        "appointment_date": apt_data.appointment_date,
        "appointment_time": apt_data.appointment_time,
        "notes": apt_data.notes or "",
        "status": apt_data.status or "scheduled",
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow()
    }
    await db.appointments.insert_one(apt_doc)
    
    await log_activity(current_user["id"], "appointment_created", f"Scheduled appointment with {lead['name']}", {"appointment_id": apt_id, "lead_id": apt_data.lead_id})
    
    return AppointmentResponse(**apt_doc)

@api_router.get("/appointments/{apt_id}", response_model=AppointmentResponse)
async def get_appointment(apt_id: str, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
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
        created_by_user=apt["created_by_user"],
        created_date=apt["created_date"]
    )

@api_router.put("/appointments/{apt_id}", response_model=AppointmentResponse)
async def update_appointment(apt_id: str, apt_data: AppointmentUpdate, current_user: dict = Depends(get_current_user)):
    apt = await db.appointments.find_one({"id": apt_id, "created_by_user": current_user["id"]})
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    update_data = {k: v for k, v in apt_data.dict().items() if v is not None}
    if update_data:
        await db.appointments.update_one({"id": apt_id}, {"$set": update_data})
        
        if update_data.get("status") == "completed":
            await log_activity(current_user["id"], "appointment_completed", "Completed appointment", {"appointment_id": apt_id})
    
    updated_apt = await db.appointments.find_one({"id": apt_id})
    return AppointmentResponse(
        id=updated_apt["id"],
        lead_id=updated_apt["lead_id"],
        appointment_date=updated_apt["appointment_date"],
        appointment_time=updated_apt["appointment_time"],
        notes=updated_apt.get("notes", ""),
        status=updated_apt.get("status", "scheduled"),
        created_by_user=updated_apt["created_by_user"],
        created_date=updated_apt["created_date"]
    )

@api_router.delete("/appointments/{apt_id}")
async def delete_appointment(apt_id: str, current_user: dict = Depends(get_current_user)):
    apt = await db.appointments.find_one({"id": apt_id, "created_by_user": current_user["id"]})
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    await db.appointments.delete_one({"id": apt_id})
    return {"message": "Appointment deleted successfully"}

@api_router.get("/appointments/lead/{lead_id}", response_model=List[AppointmentResponse])
async def get_lead_appointments(lead_id: str, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    appointments = await db.appointments.find({
        "lead_id": lead_id,
        "created_by_user": {"$in": user_ids}
    }).to_list(1000)
    
    return [AppointmentResponse(
        id=apt["id"],
        lead_id=apt["lead_id"],
        appointment_date=apt["appointment_date"],
        appointment_time=apt["appointment_time"],
        notes=apt.get("notes", ""),
        status=apt.get("status", "scheduled"),
        created_by_user=apt["created_by_user"],
        created_date=apt["created_date"]
    ) for apt in appointments]

# ==================== SCOPE OF APPOINTMENT ROUTES ====================

@api_router.post("/scope", response_model=ScopeResponse)
async def create_scope(scope_data: ScopeCreate, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": scope_data.lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    scope_id = str(uuid.uuid4())
    scope_doc = {
        "id": scope_id,
        "lead_id": scope_data.lead_id,
        "form_fields": scope_data.form_fields,
        "typed_name": scope_data.typed_name,
        "signature": scope_data.signature or "",
        "created_date": datetime.utcnow(),
        "created_by_user": current_user["id"]
    }
    await db.scope_forms.insert_one(scope_doc)
    
    await log_activity(current_user["id"], "scope_created", f"Created Scope of Appointment for {lead['name']}", {"scope_id": scope_id, "lead_id": scope_data.lead_id})
    
    return ScopeResponse(**scope_doc)

@api_router.get("/scope/{scope_id}", response_model=ScopeResponse)
async def get_scope(scope_id: str, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    scope = await db.scope_forms.find_one({"id": scope_id, "created_by_user": {"$in": user_ids}})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope form not found")
    
    return ScopeResponse(**scope)

@api_router.get("/scope/lead/{lead_id}", response_model=List[ScopeResponse])
async def get_lead_scopes(lead_id: str, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    scopes = await db.scope_forms.find({
        "lead_id": lead_id,
        "created_by_user": {"$in": user_ids}
    }).to_list(100)
    
    return [ScopeResponse(**scope) for scope in scopes]

@api_router.get("/scope/{scope_id}/pdf")
async def get_scope_pdf(scope_id: str, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    scope = await db.scope_forms.find_one({"id": scope_id, "created_by_user": {"$in": user_ids}})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope form not found")
    
    lead = await db.leads.find_one({"id": scope["lead_id"]})
    lead_name = lead["name"] if lead else "Unknown"
    lead_phone = lead.get("phone", "") if lead else ""
    lead_address = lead.get("address", "") if lead else ""
    
    agent = await db.users.find_one({"id": current_user["id"]})
    agent_name = agent["name"] if agent else "Unknown"
    
    # Generate Professional PDF
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    form_fields = scope.get("form_fields", {})
    
    # Header with border
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
    p.drawString(40, height - 95, f"Document ID: {scope_id[:8].upper()}")
    p.drawRightString(width - 40, height - 95, f"Date: {scope['created_date'].strftime('%B %d, %Y')}")
    
    y = height - 130
    
    # Section 1: Beneficiary Information
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 1: BENEFICIARY INFORMATION")
    y -= 5
    p.setStrokeColor(colors.HexColor("#1E40AF"))
    p.setLineWidth(1)
    p.line(40, y, width - 40, y)
    y -= 20
    
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 10)
    
    beneficiary_name = form_fields.get("beneficiary_name", lead_name)
    beneficiary_phone = form_fields.get("beneficiary_phone", lead_phone)
    
    p.drawString(40, y, f"Beneficiary Name: {beneficiary_name}")
    p.drawString(300, y, f"Phone: {beneficiary_phone}")
    y -= 18
    p.drawString(40, y, f"Address: {lead_address}")
    y -= 30
    
    # Section 2: Agent Information
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 2: AGENT/BROKER INFORMATION")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 20
    
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 10)
    agent_form_name = form_fields.get("agent_name", agent_name)
    agent_license = form_fields.get("agent_license", "")
    
    p.drawString(40, y, f"Agent/Broker Name: {agent_form_name}")
    p.drawString(300, y, f"License #: {agent_license}")
    y -= 30
    
    # Section 3: Products
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 3: PRODUCTS TO BE DISCUSSED")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 15
    
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 9)
    p.drawString(40, y, "Please indicate the type(s) of product(s) you want the agent/broker to discuss:")
    y -= 20
    
    products = [
        ("medicare_advantage", "Medicare Advantage Plans (Part C) - HMO, PPO, PFFS, SNP"),
        ("medicare_supplement", "Medicare Supplement (Medigap) Insurance"),
        ("prescription_drug", "Medicare Prescription Drug Plans (Part D)"),
        ("dental_vision", "Dental, Vision, and/or Hearing Products"),
    ]
    
    p.setFont("Helvetica", 10)
    for key, label in products:
        checked = form_fields.get(key, False)
        p.rect(50, y - 2, 12, 12, stroke=1, fill=0)
        if checked:
            p.setFillColor(colors.HexColor("#1E40AF"))
            p.drawString(53, y, "X")
            p.setFillColor(colors.black)
        p.drawString(70, y, label)
        y -= 20
    
    other = form_fields.get("other_products", "")
    p.rect(50, y - 2, 12, 12, stroke=1, fill=0)
    if other:
        p.drawString(53, y, "X")
    p.drawString(70, y, f"Other: {other if other else '_' * 50}")
    y -= 35
    
    # Section 4: Consent
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 4: BENEFICIARY CONSENT AND ACKNOWLEDGMENT")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 15
    
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 9)
    consent_text = [
        "By signing this form, I agree to a meeting with a sales agent to discuss the types of products I",
        "have selected above. I understand that this is not an enrollment form and that I am under no",
        "obligation to enroll in any plan. The agent may only discuss the products I have indicated above.",
        "",
        "I understand that the Centers for Medicare & Medicaid Services (CMS) requires agents to document",
        "the specific product types I want to discuss prior to any appointment for Medicare sales."
    ]
    
    for line in consent_text:
        p.drawString(40, y, line)
        y -= 12
    
    y -= 20
    
    # Section 5: Signature
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 5: SIGNATURE")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 25
    
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 10)
    
    if scope.get("signature"):
        try:
            sig_data = scope["signature"]
            if sig_data.startswith("data:"):
                sig_data = sig_data.split(",")[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = ImageReader(BytesIO(sig_bytes))
            p.drawImage(sig_image, 40, y - 60, width=180, height=60, preserveAspectRatio=True)
        except Exception as e:
            logger.error(f"Error adding signature to PDF: {e}")
            p.line(40, y - 40, 220, y - 40)
    else:
        p.line(40, y - 40, 220, y - 40)
    
    p.drawString(40, y - 55, "Beneficiary Signature")
    
    p.line(280, y - 40, 420, y - 40)
    p.drawString(280, y - 55, "Date")
    p.setFont("Helvetica-Bold", 10)
    p.drawString(280, y - 35, scope['created_date'].strftime('%m/%d/%Y'))
    
    p.setFont("Helvetica", 10)
    p.line(450, y - 40, width - 40, y - 40)
    p.drawString(450, y - 55, "Printed Name")
    p.setFont("Helvetica-Bold", 10)
    p.drawString(450, y - 35, scope['typed_name'])
    
    y -= 80
    
    # Footer
    p.setFont("Helvetica", 8)
    p.setFillColor(colors.HexColor("#64748B"))
    p.drawCentredString(width/2, 40, "This document is valid for the appointment date listed above.")
    p.drawCentredString(width/2, 28, f"Generated by AgentRoute AI - Document ID: {scope_id}")
    
    p.save()
    buffer.seek(0)
    
    pdf_base64 = base64.b64encode(buffer.read()).decode()
    return {"pdf_base64": pdf_base64, "filename": f"SOA_{lead_name.replace(' ', '_')}_{scope['created_date'].strftime('%Y%m%d')}.pdf"}

# ==================== PRODUCTION ROUTES ====================

@api_router.post("/production", response_model=ProductionResponse)
async def create_production(prod_data: ProductionCreate, current_user: dict = Depends(get_current_user)):
    prod_id = str(uuid.uuid4())
    prod_doc = {
        "id": prod_id,
        "lead_id": prod_data.lead_id,
        "policy_type": prod_data.policy_type,
        "premium": prod_data.premium,
        "commission": prod_data.commission,
        "carrier": prod_data.carrier,
        "policy_number": prod_data.policy_number or "",
        "status": prod_data.status or "submitted",
        "notes": prod_data.notes or "",
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow()
    }
    await db.production.insert_one(prod_doc)
    
    await log_activity(current_user["id"], "production_added", f"Added production: {prod_data.policy_type} - ${prod_data.premium}", {"production_id": prod_id})
    
    return ProductionResponse(**prod_doc)

@api_router.get("/production", response_model=List[ProductionResponse])
async def get_production(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    production = await db.production.find({"created_by_user": {"$in": user_ids}}).to_list(10000)
    return [ProductionResponse(**p) for p in production]

@api_router.get("/production/summary")
async def get_production_summary(
    period: str = "month",
    current_user: dict = Depends(get_current_user)
):
    """Get production summary for daily, weekly, or monthly periods"""
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    now = datetime.utcnow()
    
    if period == "day":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=now.weekday())
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # month
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    production = await db.production.aggregate([
        {
            "$match": {
                "created_by_user": {"$in": user_ids},
                "created_date": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_premium": {"$sum": "$premium"},
                "total_commission": {"$sum": "$commission"},
                "policy_count": {"$sum": 1}
            }
        }
    ]).to_list(1)
    
    result = production[0] if production else {"total_premium": 0, "total_commission": 0, "policy_count": 0}
    
    return ProductionSummary(
        total_premium=result.get("total_premium", 0),
        total_commission=result.get("total_commission", 0),
        policy_count=result.get("policy_count", 0),
        period=period
    )

@api_router.get("/production/dashboard")
async def get_production_dashboard(current_user: dict = Depends(get_current_user)):
    """Get comprehensive production dashboard data"""
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    now = datetime.utcnow()
    
    # Calculate period starts
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    async def get_period_stats(start_date):
        result = await db.production.aggregate([
            {
                "$match": {
                    "created_by_user": {"$in": user_ids},
                    "created_date": {"$gte": start_date}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_premium": {"$sum": "$premium"},
                    "total_commission": {"$sum": "$commission"},
                    "policy_count": {"$sum": 1}
                }
            }
        ]).to_list(1)
        return result[0] if result else {"total_premium": 0, "total_commission": 0, "policy_count": 0}
    
    daily = await get_period_stats(day_start)
    weekly = await get_period_stats(week_start)
    monthly = await get_period_stats(month_start)
    
    # Get recent production
    recent = await db.production.find(
        {"created_by_user": {"$in": user_ids}}
    ).sort("created_date", -1).limit(10).to_list(10)
    
    return {
        "daily": {
            "premium": daily.get("total_premium", 0),
            "commission": daily.get("total_commission", 0),
            "policies": daily.get("policy_count", 0)
        },
        "weekly": {
            "premium": weekly.get("total_premium", 0),
            "commission": weekly.get("total_commission", 0),
            "policies": weekly.get("policy_count", 0)
        },
        "monthly": {
            "premium": monthly.get("total_premium", 0),
            "commission": monthly.get("total_commission", 0),
            "policies": monthly.get("policy_count", 0)
        },
        "recent_production": recent
    }

# ==================== ACTIVITY ROUTES ====================

@api_router.get("/activity", response_model=List[ActivityLog])
async def get_activity(limit: int = 50, current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    activities = await db.activity_logs.find(
        {"user_id": {"$in": user_ids}}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return [ActivityLog(**a) for a in activities]

# ==================== AI ASSISTANT ROUTES ====================

@api_router.post("/ai-coach/chat", response_model=ChatResponse)
async def ai_coach_chat(chat_req: ChatRequest, current_user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        # Build context
        lead_context = ""
        talking_points = []
        documents_needed = []
        
        if chat_req.lead_id:
            lead = await db.leads.find_one({"id": chat_req.lead_id})
            if lead:
                lead_context = f"\nLead Information:\n- Name: {lead['name']}\n- Phone: {lead.get('phone', 'N/A')}\n- Email: {lead.get('email', 'N/A')}\n- Address: {lead.get('address', 'N/A')}\n- Notes: {lead.get('notes', 'N/A')}\n- Status: {lead.get('status', 'N/A')}"
                
                # Get appointments
                appointments = await db.appointments.find({"lead_id": chat_req.lead_id}).to_list(10)
                if appointments:
                    lead_context += f"\n- Appointments: {len(appointments)} scheduled"
                
                # Get scopes
                scopes = await db.scope_forms.find({"lead_id": chat_req.lead_id}).to_list(10)
                if scopes:
                    lead_context += f"\n- Scope Documents: {len(scopes)} created"
                else:
                    documents_needed.append("Scope of Appointment")
        
        if chat_req.lead_context:
            lead_context += f"\n{chat_req.lead_context}"
        
        system_message = f"""You are an expert AI sales coach for Medicare insurance field sales agents. Your role is to:
1. Provide actionable sales tips and strategies
2. Help agents improve their pitch and closing techniques
3. Analyze lead notes and suggest next steps
4. Recommend talking points for appointments
5. Identify required documents for meetings
6. Suggest optimal visit order based on lead information
7. Provide follow-up reminders

Be concise, practical, and supportive. Focus on real-world applicable advice for Medicare sales.
{lead_context}"""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"coach_{current_user['id']}_{datetime.utcnow().strftime('%Y%m%d')}",
            system_message=system_message
        ).with_model("openai", "gpt-4.1")
        
        user_message = UserMessage(text=chat_req.message)
        response = await chat.send_message(user_message)
        
        # Save chat history
        await db.chat_history.insert_one({
            "user_id": current_user["id"],
            "role": "user",
            "content": chat_req.message,
            "timestamp": datetime.utcnow()
        })
        await db.chat_history.insert_one({
            "user_id": current_user["id"],
            "role": "assistant",
            "content": response,
            "timestamp": datetime.utcnow()
        })
        
        return ChatResponse(
            response=response,
            timestamp=datetime.utcnow(),
            talking_points=talking_points if talking_points else None,
            documents_needed=documents_needed if documents_needed else None
        )
        
    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except Exception as e:
        logger.error(f"AI Coach error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

@api_router.post("/ai-coach/lead-suggestions/{lead_id}")
async def get_lead_suggestions(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get AI-powered suggestions for a specific lead"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        lead = await db.leads.find_one({"id": lead_id, "created_by_user": current_user["id"]})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Get related data
        appointments = await db.appointments.find({"lead_id": lead_id}).to_list(10)
        scopes = await db.scope_forms.find({"lead_id": lead_id}).to_list(10)
        
        context = f"""
Lead: {lead['name']}
Phone: {lead.get('phone', 'N/A')}
Email: {lead.get('email', 'N/A')}
Address: {lead.get('address', 'N/A')}
Notes: {lead.get('notes', 'N/A')}
Status: {lead.get('status', 'new')}
Appointments: {len(appointments)}
Scope Documents: {len(scopes)}
"""
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"suggestions_{lead_id}",
            system_message="You are a Medicare sales expert. Provide brief, actionable recommendations."
        ).with_model("openai", "gpt-4.1")
        
        prompt = f"""Based on this lead information, provide:
1. Top 3 talking points for the next meeting
2. Required documents to bring
3. Suggested follow-up timeline
4. Potential objections to prepare for

{context}

Respond in JSON format:
{{"talking_points": [...], "documents_needed": [...], "follow_up": "...", "objections": [...]}}"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse response
        import json
        try:
            if "{" in response:
                json_str = response[response.find("{"):response.rfind("}")+1]
                suggestions = json.loads(json_str)
            else:
                suggestions = {
                    "talking_points": ["Review Medicare options", "Discuss coverage needs", "Present plan comparisons"],
                    "documents_needed": ["Scope of Appointment", "Plan comparison sheets"],
                    "follow_up": "Schedule follow-up within 48 hours",
                    "objections": ["Cost concerns", "Timing concerns"]
                }
        except:
            suggestions = {
                "talking_points": ["Review Medicare options", "Discuss coverage needs", "Present plan comparisons"],
                "documents_needed": ["Scope of Appointment" if not scopes else "Plan materials"],
                "follow_up": "Schedule follow-up within 48 hours",
                "objections": ["Cost concerns", "Timing concerns"]
            }
        
        return suggestions
        
    except Exception as e:
        logger.error(f"Lead suggestions error: {e}")
        return {
            "talking_points": ["Discuss Medicare coverage options", "Review current plan", "Present alternatives"],
            "documents_needed": ["Scope of Appointment"],
            "follow_up": "Follow up within 48 hours",
            "objections": ["Be prepared for cost questions"]
        }

@api_router.get("/ai-coach/history", response_model=List[ChatMessage])
async def get_chat_history(current_user: dict = Depends(get_current_user)):
    messages = await db.chat_history.find(
        {"user_id": current_user["id"]}
    ).sort("timestamp", -1).limit(50).to_list(50)
    
    return [ChatMessage(
        role=msg["role"],
        content=msg["content"],
        timestamp=msg["timestamp"]
    ) for msg in reversed(messages)]

# ==================== OCR ROUTES ====================

@api_router.post("/ocr/scan", response_model=OCRResponse)
async def scan_business_card(ocr_req: OCRRequest, current_user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OCR service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"ocr_{current_user['id']}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an OCR assistant specialized in reading business cards. 
Extract the following information from the business card image:
- Name (full name of the person)
- Phone (phone number)
- Email (email address)
- Address (business or mailing address)

Return ONLY a JSON object with these exact keys: name, phone, email, address
If a field is not found, use an empty string.
Example: {"name": "John Smith", "phone": "555-1234", "email": "john@company.com", "address": "123 Main St"}"""
        ).with_model("openai", "gpt-4.1")
        
        image_data = ocr_req.image_base64
        if image_data.startswith("data:"):
            image_data = image_data.split(",")[1]
        
        user_message = UserMessage(
            text="Please extract contact information from this business card image and return as JSON.",
            image_urls=[f"data:image/jpeg;base64,{image_data}"]
        )
        
        response = await chat.send_message(user_message)
        
        import json
        try:
            if "{" in response and "}" in response:
                json_str = response[response.find("{"):response.rfind("}")+1]
                extracted = json.loads(json_str)
            else:
                extracted = {}
        except json.JSONDecodeError:
            extracted = {}
        
        return OCRResponse(
            name=extracted.get("name", ""),
            phone=extracted.get("phone", ""),
            email=extracted.get("email", ""),
            address=extracted.get("address", ""),
            raw_text=response
        )
        
    except ImportError:
        raise HTTPException(status_code=500, detail="OCR service not available")
    except Exception as e:
        logger.error(f"OCR error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR service error: {str(e)}")

# ==================== SUBSCRIPTION ROUTES ====================

@api_router.get("/subscription/status", response_model=SubscriptionStatus)
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    status = current_user.get("subscription_status", "trial")
    
    created_at = current_user.get("created_at", datetime.utcnow())
    trial_expires = created_at + timedelta(days=30)
    
    if status == "trial" and datetime.utcnow() > trial_expires:
        status = "expired"
    
    return SubscriptionStatus(
        status=status,
        plan="monthly" if status == "active" else "trial" if status == "trial" else "none",
        expires_at=trial_expires if status == "trial" else None,
        is_trial=status == "trial",
        stripe_customer_id=current_user.get("stripe_customer_id"),
        stripe_subscription_id=current_user.get("stripe_subscription_id")
    )

@api_router.post("/subscription/subscribe")
async def subscribe(current_user: dict = Depends(get_current_user)):
    """Subscribe user - mock implementation ready for Stripe"""
    if STRIPE_SECRET_KEY:
        # Real Stripe implementation would go here
        try:
            import stripe
            stripe.api_key = STRIPE_SECRET_KEY
            
            # Create or get customer
            if not current_user.get("stripe_customer_id"):
                customer = stripe.Customer.create(
                    email=current_user["email"],
                    name=current_user["name"]
                )
                await db.users.update_one(
                    {"id": current_user["id"]},
                    {"$set": {"stripe_customer_id": customer.id}}
                )
            
            # Create checkout session
            session = stripe.checkout.Session.create(
                customer=current_user.get("stripe_customer_id"),
                payment_method_types=['card'],
                line_items=[{
                    'price': STRIPE_PRICE_ID,
                    'quantity': 1,
                }],
                mode='subscription',
                success_url='agentroute://subscription-success',
                cancel_url='agentroute://subscription-cancel',
            )
            
            return {"checkout_url": session.url, "session_id": session.id}
        except Exception as e:
            logger.error(f"Stripe error: {e}")
            raise HTTPException(status_code=500, detail="Payment service error")
    else:
        # Mock subscription
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"subscription_status": "active"}}
        )
        
        logger.info(f"MOCK SUBSCRIPTION: User {current_user['email']} subscribed (Stripe not configured)")
        
        return {"message": "Subscription activated (mock)", "status": "active"}

@api_router.post("/subscription/restore")
async def restore_purchases(current_user: dict = Depends(get_current_user)):
    if STRIPE_SECRET_KEY and current_user.get("stripe_customer_id"):
        try:
            import stripe
            stripe.api_key = STRIPE_SECRET_KEY
            
            subscriptions = stripe.Subscription.list(
                customer=current_user["stripe_customer_id"],
                status='active'
            )
            
            if subscriptions.data:
                await db.users.update_one(
                    {"id": current_user["id"]},
                    {"$set": {
                        "subscription_status": "active",
                        "stripe_subscription_id": subscriptions.data[0].id
                    }}
                )
                return {"message": "Subscription restored", "status": "active"}
            
            return {"message": "No active subscriptions found", "status": current_user.get("subscription_status", "trial")}
        except Exception as e:
            logger.error(f"Stripe restore error: {e}")
    
    return {"message": "No purchases to restore", "status": current_user.get("subscription_status", "trial")}

# ==================== ROUTE PLANNING ROUTES ====================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def nearest_neighbor_route(stops: List[dict], start_lat: float = None, start_lng: float = None) -> List[dict]:
    if len(stops) == 0:
        return stops
    
    if len(stops) == 1:
        stops[0]['order'] = 1
        return stops
    
    valid_stops = [s for s in stops if s.get('latitude') and s.get('longitude')]
    invalid_stops = [s for s in stops if not s.get('latitude') or not s.get('longitude')]
    
    if not valid_stops:
        for i, stop in enumerate(stops):
            stop['order'] = i + 1
        return stops
    
    if start_lat and start_lng:
        current_lat, current_lng = start_lat, start_lng
    else:
        current_lat = valid_stops[0]['latitude']
        current_lng = valid_stops[0]['longitude']
    
    unvisited = valid_stops.copy()
    ordered = []
    
    while unvisited:
        nearest_idx = 0
        nearest_dist = float('inf')
        
        for i, stop in enumerate(unvisited):
            dist = haversine_distance(current_lat, current_lng, stop['latitude'], stop['longitude'])
            if dist < nearest_dist:
                nearest_dist = dist
                nearest_idx = i
        
        nearest_stop = unvisited.pop(nearest_idx)
        ordered.append(nearest_stop)
        current_lat = nearest_stop['latitude']
        current_lng = nearest_stop['longitude']
    
    ordered.extend(invalid_stops)
    
    for i, stop in enumerate(ordered):
        stop['order'] = i + 1
    
    return ordered

async def geocode_address_internal(lead_id: str, address: str) -> dict:
    """Internal geocoding function"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            return None
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"geocode_{lead_id}",
            system_message="""You are a geocoding assistant. Given an address, provide approximate latitude and longitude coordinates.
Return ONLY a JSON object with 'latitude' and 'longitude' as numbers.
Example: {"latitude": 40.7128, "longitude": -74.0060}"""
        ).with_model("openai", "gpt-4.1")
        
        response = await chat.send_message(UserMessage(text=f"Geocode this address: {address}"))
        
        import json
        if "{" in response and "}" in response:
            json_str = response[response.find("{"):response.rfind("}")+1]
            coords = json.loads(json_str)
            lat = coords.get("latitude")
            lng = coords.get("longitude")
            
            if lat and lng:
                await db.lead_geocodes.update_one(
                    {"lead_id": lead_id},
                    {"$set": {
                        "lead_id": lead_id,
                        "address": address,
                        "latitude": lat,
                        "longitude": lng,
                        "updated_at": datetime.utcnow()
                    }},
                    upsert=True
                )
                return {"latitude": lat, "longitude": lng}
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
    
    return None

@api_router.post("/routes/daily", response_model=DailyRouteResponse)
async def get_daily_route(route_req: DailyRouteRequest, current_user: dict = Depends(get_current_user)):
    appointments = await db.appointments.find({
        "created_by_user": current_user["id"],
        "appointment_date": route_req.date,
        "status": "scheduled"
    }).to_list(100)
    
    if not appointments:
        return DailyRouteResponse(
            date=route_req.date,
            stops=[],
            total_distance_km=0,
            estimated_duration_mins=0,
            optimized=True
        )
    
    stops = []
    for apt in appointments:
        lead = await db.leads.find_one({"id": apt["lead_id"]})
        if lead:
            lead_geocode = await db.lead_geocodes.find_one({"lead_id": lead["id"]})
            
            # Get AI suggestions for this lead
            suggestions = None
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                api_key = os.environ.get("EMERGENT_LLM_KEY")
                if api_key and lead.get("notes"):
                    chat = LlmChat(
                        api_key=api_key,
                        session_id=f"route_tips_{lead['id']}",
                        system_message="Provide 2 brief talking points for a Medicare sales meeting. Be concise."
                    ).with_model("openai", "gpt-4.1")
                    tips_response = await chat.send_message(UserMessage(text=f"Lead notes: {lead.get('notes', 'No notes')}"))
                    suggestions = tips_response.split("\n")[:2]
            except:
                pass
            
            # Check if scope exists
            scope_exists = await db.scope_forms.count_documents({"lead_id": lead["id"]}) > 0
            docs_needed = [] if scope_exists else ["Scope of Appointment"]
            
            stop = {
                "lead_id": lead["id"],
                "lead_name": lead["name"],
                "address": lead.get("address", ""),
                "appointment_id": apt["id"],
                "appointment_time": apt["appointment_time"],
                "latitude": lead_geocode["latitude"] if lead_geocode else None,
                "longitude": lead_geocode["longitude"] if lead_geocode else None,
                "order": 0,
                "talking_points": suggestions,
                "documents_needed": docs_needed
            }
            stops.append(stop)
    
    stops.sort(key=lambda x: x["appointment_time"] or "23:59")
    
    has_coords = any(s.get('latitude') and s.get('longitude') for s in stops)
    if has_coords:
        stops = nearest_neighbor_route(
            stops,
            start_lat=route_req.start_lat,
            start_lng=route_req.start_lng
        )
    else:
        for i, stop in enumerate(stops):
            stop['order'] = i + 1
    
    total_distance = 0
    for i in range(len(stops) - 1):
        if stops[i].get('latitude') and stops[i+1].get('latitude'):
            total_distance += haversine_distance(
                stops[i]['latitude'], stops[i]['longitude'],
                stops[i+1]['latitude'], stops[i+1]['longitude']
            )
    
    drive_time = (total_distance / 50) * 60
    stop_time = len(stops) * 30
    estimated_duration = int(drive_time + stop_time)
    
    return DailyRouteResponse(
        date=route_req.date,
        stops=[RouteStop(**s) for s in stops],
        total_distance_km=round(total_distance, 2),
        estimated_duration_mins=estimated_duration,
        optimized=has_coords,
        ai_suggestions=f"Optimized route with {len(stops)} stops. Estimated drive time: {int(drive_time)} minutes."
    )

@api_router.post("/routes/geocode")
async def geocode_lead_address(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if not lead.get("address"):
        raise HTTPException(status_code=400, detail="Lead has no address")
    
    result = await geocode_address_internal(lead_id, lead["address"])
    if result:
        return {"success": True, **result}
    return {"success": False, "error": "Could not geocode address"}

@api_router.get("/routes/leads-with-coordinates")
async def get_leads_with_coordinates(current_user: dict = Depends(get_current_user)):
    user_ids = await get_user_downline_ids(current_user["id"], current_user.get("role", "agent"))
    
    leads = await db.leads.find({"created_by_user": {"$in": user_ids}}).to_list(1000)
    
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

@api_router.post("/routes/batch-geocode")
async def batch_geocode_leads(current_user: dict = Depends(get_current_user)):
    leads = await db.leads.find({
        "created_by_user": current_user["id"],
        "address": {"$ne": ""}
    }).to_list(100)
    
    geocoded_count = 0
    failed_count = 0
    
    for lead in leads:
        existing = await db.lead_geocodes.find_one({"lead_id": lead["id"]})
        if existing:
            continue
        
        result = await geocode_address_internal(lead["id"], lead["address"])
        if result:
            geocoded_count += 1
        else:
            failed_count += 1
    
    return {
        "geocoded": geocoded_count,
        "failed": failed_count,
        "message": f"Geocoded {geocoded_count} leads, {failed_count} failed"
    }

# ==================== LEGAL/COMPLIANCE ROUTES ====================

@api_router.get("/legal/privacy-policy")
async def get_privacy_policy():
    return {
        "title": "Privacy Policy",
        "last_updated": "2024-01-01",
        "content": """
# AgentRoute AI Privacy Policy

Last Updated: January 1, 2024

## Information We Collect

### Personal Information
- Name and contact information (email, phone)
- Account credentials (securely hashed passwords)
- Location data (for route optimization, only when permitted)

### Lead Data
- Customer contact information you enter
- Appointment schedules
- Scope of Appointment documents
- Notes and activity history

### Usage Data
- App usage analytics
- Feature interactions
- Error logs

## How We Use Your Information

1. **Service Delivery**: To provide lead management, route planning, and document generation
2. **AI Features**: To power the AI sales coach and OCR scanning
3. **Communication**: To send password resets and important updates
4. **Improvement**: To enhance app features and fix bugs

## Data Storage

- All data is stored securely in encrypted databases
- Passwords are hashed using industry-standard bcrypt
- We never store or access your passwords in plain text

## Data Sharing

We do NOT sell your data. We only share data:
- With your explicit consent
- To comply with legal requirements
- With service providers (AI, email) under strict agreements

## Your Rights

You can:
- Access your data
- Request data deletion
- Export your data
- Opt out of non-essential communications

## Contact

For privacy concerns: privacy@agentroute.ai
""",
        "url": "https://agentroute.ai/privacy"
    }

@api_router.get("/legal/terms")
async def get_terms_of_use():
    return {
        "title": "Terms of Use",
        "last_updated": "2024-01-01",
        "content": """
# AgentRoute AI Terms of Use

Last Updated: January 1, 2024

## Acceptance of Terms

By using AgentRoute AI, you agree to these terms.

## Service Description

AgentRoute AI is a sales productivity app for insurance agents, providing:
- Lead management
- Appointment scheduling
- Route optimization
- Document generation
- AI-powered coaching

## User Responsibilities

You agree to:
- Provide accurate information
- Maintain account security
- Comply with applicable laws
- Not misuse the service

## Subscription

- Monthly subscription: $30/month
- 30-day free trial included
- Cancel anytime

## Intellectual Property

All app content, features, and functionality are owned by AgentRoute AI.

## Limitation of Liability

AgentRoute AI is provided "as is" without warranties. We are not liable for:
- Business losses
- Data loss beyond our control
- Third-party service issues

## Termination

We may terminate accounts that violate these terms.

## Changes to Terms

We may update these terms. Continued use constitutes acceptance.

## Contact

support@agentroute.ai
""",
        "url": "https://agentroute.ai/terms"
    }

@api_router.get("/legal/data-disclosure")
async def get_data_disclosure():
    return {
        "title": "Data Disclosure Statement",
        "content": """
## How Your Data is Used

### Lead Information
Your customer lead data (names, phones, addresses) is:
- Stored securely in our database
- Only accessible by you and your authorized upline
- Used to provide app features (routing, documents)
- Never sold to third parties

### Location Data
When you grant permission, we use location to:
- Calculate optimal routes
- Estimate travel times
- This data is not stored permanently

### AI Processing
When you use AI features:
- Queries are processed by OpenAI
- No lead data is used for AI training
- Responses are generated in real-time

### Document Storage
Scope of Appointment documents:
- Stored in our secure database
- Accessible for export/sharing
- Retained until you delete them

### Data Retention
- Active accounts: Data retained while subscribed
- Deleted accounts: Data removed within 30 days
- Export available before deletion
""",
        "categories": [
            {"name": "Personal Data", "collected": True, "shared": False, "sold": False},
            {"name": "Lead Data", "collected": True, "shared": False, "sold": False},
            {"name": "Location", "collected": True, "shared": False, "sold": False},
            {"name": "Usage Analytics", "collected": True, "shared": False, "sold": False}
        ]
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "AgentRoute AI API", "version": "2.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
