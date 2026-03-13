from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
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
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.units import inch
import math

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

# ==================== MODELS ====================

# User Models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    subscription_status: str
    created_at: datetime

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

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class LeadResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    address: str
    notes: str
    created_by_user: str
    created_date: datetime

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
    signature: Optional[str] = ""  # Base64 encoded signature image

class ScopeResponse(BaseModel):
    id: str
    lead_id: str
    form_fields: Dict[str, Any]
    typed_name: str
    signature: str
    created_date: datetime
    created_by_user: str

# AI Coach Models
class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[datetime] = None

class ChatRequest(BaseModel):
    message: str
    lead_context: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    timestamp: datetime

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

class DailyRouteRequest(BaseModel):
    date: str  # YYYY-MM-DD format
    start_address: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None

class DailyRouteResponse(BaseModel):
    date: str
    stops: List[RouteStop]
    total_distance_km: float
    estimated_duration_mins: int
    optimized: bool

class GeocodedAddress(BaseModel):
    address: str
    latitude: float
    longitude: float

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

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing_user = await db.users.find_one({"email": user_data.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": user_data.name,
        "email": user_data.email.lower(),
        "password_hash": get_password_hash(user_data.password),
        "subscription_status": "trial",
        "created_at": datetime.utcnow(),
        "reset_token": None,
        "reset_token_expiry": None
    }
    await db.users.insert_one(user_doc)
    
    # Create token
    access_token = create_access_token(data={"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user_id,
            name=user_data.name,
            email=user_data.email.lower(),
            subscription_status="trial",
            created_at=user_doc["created_at"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower()})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_access_token(data={"sub": user["id"]})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            subscription_status=user.get("subscription_status", "trial"),
            created_at=user["created_at"]
        )
    )

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    user = await db.users.find_one({"email": request.email.lower()})
    if not user:
        # Don't reveal if email exists
        return {"message": "If the email exists, a reset link has been sent"}
    
    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    reset_expiry = datetime.utcnow() + timedelta(hours=1)
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"reset_token": reset_token, "reset_token_expiry": reset_expiry}}
    )
    
    # Console log the token (for development)
    logger.info("=" * 60)
    logger.info(f"PASSWORD RESET TOKEN for {request.email}:")
    logger.info(f"Token: {reset_token}")
    logger.info(f"Expires: {reset_expiry}")
    logger.info("=" * 60)
    
    return {"message": "If the email exists, a reset link has been sent", "dev_token": reset_token}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    user = await db.users.find_one({
        "reset_token": request.token,
        "reset_token_expiry": {"$gt": datetime.utcnow()}
    })
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Update password
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
        subscription_status=current_user.get("subscription_status", "trial"),
        created_at=current_user["created_at"]
    )

# ==================== LEADS ROUTES ====================

@api_router.get("/leads", response_model=List[LeadResponse])
async def get_leads(current_user: dict = Depends(get_current_user)):
    leads = await db.leads.find({"created_by_user": current_user["id"]}).to_list(1000)
    return [LeadResponse(
        id=lead["id"],
        name=lead["name"],
        phone=lead.get("phone", ""),
        email=lead.get("email", ""),
        address=lead.get("address", ""),
        notes=lead.get("notes", ""),
        created_by_user=lead["created_by_user"],
        created_date=lead["created_date"]
    ) for lead in leads]

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
        "created_by_user": current_user["id"],
        "created_date": datetime.utcnow()
    }
    await db.leads.insert_one(lead_doc)
    
    return LeadResponse(**lead_doc)

@api_router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return LeadResponse(
        id=lead["id"],
        name=lead["name"],
        phone=lead.get("phone", ""),
        email=lead.get("email", ""),
        address=lead.get("address", ""),
        notes=lead.get("notes", ""),
        created_by_user=lead["created_by_user"],
        created_date=lead["created_date"]
    )

@api_router.put("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, lead_data: LeadUpdate, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    update_data = {k: v for k, v in lead_data.dict().items() if v is not None}
    if update_data:
        await db.leads.update_one({"id": lead_id}, {"$set": update_data})
    
    updated_lead = await db.leads.find_one({"id": lead_id})
    return LeadResponse(
        id=updated_lead["id"],
        name=updated_lead["name"],
        phone=updated_lead.get("phone", ""),
        email=updated_lead.get("email", ""),
        address=updated_lead.get("address", ""),
        notes=updated_lead.get("notes", ""),
        created_by_user=updated_lead["created_by_user"],
        created_date=updated_lead["created_date"]
    )

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "created_by_user": current_user["id"]})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Delete lead and related data
    await db.leads.delete_one({"id": lead_id})
    await db.appointments.delete_many({"lead_id": lead_id})
    await db.scope_forms.delete_many({"lead_id": lead_id})
    
    return {"message": "Lead deleted successfully"}

# ==================== APPOINTMENTS ROUTES ====================

@api_router.get("/appointments", response_model=List[AppointmentResponse])
async def get_appointments(current_user: dict = Depends(get_current_user)):
    appointments = await db.appointments.find({"created_by_user": current_user["id"]}).to_list(1000)
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
    # Verify lead exists
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
    
    return AppointmentResponse(**apt_doc)

@api_router.get("/appointments/{apt_id}", response_model=AppointmentResponse)
async def get_appointment(apt_id: str, current_user: dict = Depends(get_current_user)):
    apt = await db.appointments.find_one({"id": apt_id, "created_by_user": current_user["id"]})
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
    appointments = await db.appointments.find({
        "lead_id": lead_id,
        "created_by_user": current_user["id"]
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
    # Verify lead exists
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
    
    return ScopeResponse(**scope_doc)

@api_router.get("/scope/{scope_id}", response_model=ScopeResponse)
async def get_scope(scope_id: str, current_user: dict = Depends(get_current_user)):
    scope = await db.scope_forms.find_one({"id": scope_id, "created_by_user": current_user["id"]})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope form not found")
    
    return ScopeResponse(**scope)

@api_router.get("/scope/lead/{lead_id}", response_model=List[ScopeResponse])
async def get_lead_scopes(lead_id: str, current_user: dict = Depends(get_current_user)):
    scopes = await db.scope_forms.find({
        "lead_id": lead_id,
        "created_by_user": current_user["id"]
    }).to_list(100)
    
    return [ScopeResponse(**scope) for scope in scopes]

@api_router.get("/scope/{scope_id}/pdf")
async def get_scope_pdf(scope_id: str, current_user: dict = Depends(get_current_user)):
    scope = await db.scope_forms.find_one({"id": scope_id, "created_by_user": current_user["id"]})
    if not scope:
        raise HTTPException(status_code=404, detail="Scope form not found")
    
    # Get lead info
    lead = await db.leads.find_one({"id": scope["lead_id"]})
    lead_name = lead["name"] if lead else "Unknown"
    lead_phone = lead.get("phone", "") if lead else ""
    lead_address = lead.get("address", "") if lead else ""
    
    # Get agent info
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
    
    # Company/Form Title
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 22)
    p.drawCentredString(width/2, height - 55, "SCOPE OF APPOINTMENT")
    
    p.setFillColor(colors.HexColor("#475569"))
    p.setFont("Helvetica", 10)
    p.drawCentredString(width/2, height - 75, "Medicare Sales Appointment Confirmation Document")
    
    # Document ID and Date
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
    
    # Section 3: Products to be Discussed
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
        # Draw checkbox
        p.rect(50, y - 2, 12, 12, stroke=1, fill=0)
        if checked:
            p.setFillColor(colors.HexColor("#1E40AF"))
            p.drawString(53, y, "X")
            p.setFillColor(colors.black)
        p.drawString(70, y, label)
        y -= 20
    
    # Other products
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
    
    # Signature Section
    p.setFillColor(colors.HexColor("#1E40AF"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "SECTION 5: SIGNATURE")
    y -= 5
    p.line(40, y, width - 40, y)
    y -= 25
    
    p.setFillColor(colors.black)
    p.setFont("Helvetica", 10)
    
    # Signature image or line
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
    
    # Date
    p.line(280, y - 40, 420, y - 40)
    p.drawString(280, y - 55, "Date")
    p.setFont("Helvetica-Bold", 10)
    p.drawString(280, y - 35, scope['created_date'].strftime('%m/%d/%Y'))
    
    # Typed name
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

# ==================== AI COACH ROUTES ====================

@api_router.post("/ai-coach/chat", response_model=ChatResponse)
async def ai_coach_chat(chat_req: ChatRequest, current_user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        system_message = """You are an expert AI sales coach for field sales agents. Your role is to:
1. Provide actionable sales tips and strategies
2. Help agents improve their pitch and closing techniques
3. Analyze lead notes and suggest next steps
4. Offer motivation and encouragement
5. Share industry best practices

Be concise, practical, and supportive. Focus on real-world applicable advice."""

        if chat_req.lead_context:
            system_message += f"\n\nContext about the current lead:\n{chat_req.lead_context}"
        
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
        
        return ChatResponse(response=response, timestamp=datetime.utcnow())
        
    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except Exception as e:
        logger.error(f"AI Coach error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

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
        
        # Use GPT-4.1 vision to extract text from business card
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
        
        # Send image for analysis
        image_data = ocr_req.image_base64
        if image_data.startswith("data:"):
            image_data = image_data.split(",")[1]
        
        user_message = UserMessage(
            text="Please extract contact information from this business card image and return as JSON.",
            image_urls=[f"data:image/jpeg;base64,{image_data}"]
        )
        
        response = await chat.send_message(user_message)
        
        # Parse the JSON response
        import json
        try:
            # Try to extract JSON from the response
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

# ==================== SUBSCRIPTION ROUTES (MOCK) ====================

@api_router.get("/subscription/status", response_model=SubscriptionStatus)
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    status = current_user.get("subscription_status", "trial")
    
    # Check if trial has expired (30 days from creation)
    created_at = current_user.get("created_at", datetime.utcnow())
    trial_expires = created_at + timedelta(days=30)
    
    if status == "trial" and datetime.utcnow() > trial_expires:
        status = "expired"
    
    return SubscriptionStatus(
        status=status,
        plan="monthly" if status == "active" else "trial" if status == "trial" else "none",
        expires_at=trial_expires if status == "trial" else None,
        is_trial=status == "trial"
    )

@api_router.post("/subscription/subscribe")
async def subscribe(current_user: dict = Depends(get_current_user)):
    # Mock subscription - in production this would integrate with Stripe
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"subscription_status": "active"}}
    )
    
    return {"message": "Subscription activated (mock)", "status": "active"}

@api_router.post("/subscription/restore")
async def restore_purchases(current_user: dict = Depends(get_current_user)):
    # Mock restore - in production this would verify with App Store
    return {"message": "No purchases to restore", "status": current_user.get("subscription_status", "trial")}

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "AgentRoute AI API", "version": "1.0.0"}

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
