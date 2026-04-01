#!/usr/bin/env python3
"""
Seed script for AgentRoute AI - Creates test accounts and sample data
Usage: python seed_data.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

mongo_url = os.getenv('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'agentroute_db')
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


async def seed_database():
    """Main seeding function"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"🌱 Seeding database: {db_name}")
    print("=" * 50)
    
    # ==================== SEED USERS ====================
    print("\n👥 Seeding Users...")
    
    # Check if admin exists
    admin = await db.users.find_one({'email': 'admin@agentroute.com'})
    if not admin:
        admin_id = str(uuid.uuid4())
        admin = {
            'id': admin_id,
            'name': 'Admin User',
            'email': 'admin@agentroute.com',
            'password_hash': pwd_context.hash('Admin123!'),
            'role': 'admin',
            'manager_id': None,
            'subscription_status': 'active',
            'created_at': datetime.utcnow(),
            'deleted_at': None,
            'is_active': True,
            'phone': '+1-555-0101',
            'territory': 'All Regions',
            'commission_rate': 0.7
        }
        await db.users.insert_one(admin)
        print(f"  ✅ Created admin@agentroute.com")
    else:
        admin_id = admin['id']
        print(f"  ℹ️  admin@agentroute.com already exists")
    
    # Create or update manager
    manager = await db.users.find_one({'email': 'manager@agentroute.com'})
    if not manager:
        manager_id = str(uuid.uuid4())
        manager = {
            'id': manager_id,
            'name': 'Test Manager',
            'email': 'manager@agentroute.com',
            'password_hash': pwd_context.hash('Manager123!'),
            'role': 'manager',
            'manager_id': admin_id,
            'subscription_status': 'active',
            'created_at': datetime.utcnow(),
            'deleted_at': None,
            'is_active': True,
            'phone': '+1-555-0102',
            'territory': 'Florida',
            'commission_rate': 0.6
        }
        await db.users.insert_one(manager)
        print(f"  ✅ Created manager@agentroute.com")
    else:
        manager_id = manager['id']
        # Update password just in case
        await db.users.update_one(
            {'email': 'manager@agentroute.com'},
            {'$set': {'password_hash': pwd_context.hash('Manager123!'), 'deleted_at': None, 'is_active': True}}
        )
        print(f"  ℹ️  manager@agentroute.com already exists (password reset)")
    
    # Create or update agent
    agent = await db.users.find_one({'email': 'agent@agentroute.com'})
    if not agent:
        agent_id = str(uuid.uuid4())
        agent = {
            'id': agent_id,
            'name': 'Test Agent',
            'email': 'agent@agentroute.com',
            'password_hash': pwd_context.hash('Agent123!'),
            'role': 'agent',
            'manager_id': manager_id,
            'subscription_status': 'active',
            'created_at': datetime.utcnow(),
            'deleted_at': None,
            'is_active': True,
            'phone': '+1-555-0103',
            'territory': 'Florida',
            'commission_rate': 0.5
        }
        await db.users.insert_one(agent)
        print(f"  ✅ Created agent@agentroute.com")
    else:
        agent_id = agent['id']
        # Update password and manager_id just in case
        await db.users.update_one(
            {'email': 'agent@agentroute.com'},
            {'$set': {
                'password_hash': pwd_context.hash('Agent123!'),
                'deleted_at': None,
                'is_active': True,
                'manager_id': manager_id
            }}
        )
        print(f"  ℹ️  agent@agentroute.com already exists (password reset)")
    
    # ==================== SEED LEADS ====================
    print("\n📋 Seeding Leads...")
    
    # Sample lead data with various stages
    lead_templates = [
        # For Agent - Various stages
        {"name": "John Smith", "email": "john.smith@email.com", "phone": "555-0201", "stage": "new", "notes": "Interested in Medicare Advantage"},
        {"name": "Mary Johnson", "email": "mary.j@email.com", "phone": "555-0202", "stage": "contacted", "notes": "Called, needs follow-up next week"},
        {"name": "Robert Williams", "email": "rwilliams@email.com", "phone": "555-0203", "stage": "follow_up", "notes": "Sent brochure, waiting for response"},
        {"name": "Patricia Brown", "email": "pbrown@email.com", "phone": "555-0204", "stage": "appointment_set", "notes": "Appointment on Thursday 2pm"},
        {"name": "Michael Davis", "email": "mdavis@email.com", "phone": "555-0205", "stage": "soa_completed", "notes": "SOA signed, ready for policy discussion"},
        {"name": "Jennifer Miller", "email": "jmiller@email.com", "phone": "555-0206", "stage": "policy_submitted", "notes": "Application submitted to carrier"},
        {"name": "William Wilson", "email": "wwilson@email.com", "phone": "555-0207", "stage": "closed_won", "notes": "Policy issued! Commission pending"},
        {"name": "Elizabeth Moore", "email": "emoore@email.com", "phone": "555-0208", "stage": "closed_lost", "notes": "Went with competitor"},
        # Additional leads for variety
        {"name": "David Taylor", "email": "dtaylor@email.com", "phone": "555-0209", "stage": "new", "notes": "Referred by existing client"},
        {"name": "Susan Anderson", "email": "sanderson@email.com", "phone": "555-0210", "stage": "contacted", "notes": "Interested in supplemental coverage"},
    ]
    
    leads_created = 0
    lead_ids = []
    
    for i, template in enumerate(lead_templates):
        existing = await db.leads.find_one({'email': template['email']})
        if not existing:
            lead_id = str(uuid.uuid4())
            lead = {
                'id': lead_id,
                'name': template['name'],
                'email': template['email'],
                'phone': template['phone'],
                'address': f"{100 + i} Main Street, Tampa, FL 33601",
                'notes': template['notes'],
                'stage': template['stage'],
                'source': 'seed_data',
                'agent_id': agent_id,
                'manager_id': manager_id,
                'created_by': admin_id,
                'created_at': datetime.utcnow() - timedelta(days=30 - i*2),
                'updated_at': datetime.utcnow(),
                'deleted_at': None,
                'last_contact_date': datetime.utcnow() - timedelta(days=i),
                'is_medicare_eligible': True,
                'medicare_type': 'Medicare Advantage' if i % 2 == 0 else 'Medicare Supplement'
            }
            await db.leads.insert_one(lead)
            lead_ids.append(lead_id)
            leads_created += 1
        else:
            lead_ids.append(existing['id'])
    
    print(f"  ✅ Created {leads_created} new leads (total: {len(lead_templates)})")
    
    # ==================== SEED APPOINTMENTS ====================
    print("\n📅 Seeding Appointments...")
    
    appointments_created = 0
    appointment_ids = []
    
    # Create appointments for leads in appointment_set stage or later
    appointment_lead_indices = [3, 4, 5, 6]  # Patricia, Michael, Jennifer, William
    
    for i, idx in enumerate(appointment_lead_indices):
        if idx < len(lead_ids):
            lead_id = lead_ids[idx]
            lead = lead_templates[idx]
            
            existing = await db.appointments.find_one({'lead_id': lead_id})
            if not existing:
                apt_id = str(uuid.uuid4())
                apt_date = datetime.utcnow() + timedelta(days=i-2)  # Some past, some future
                appointment = {
                    'id': apt_id,
                    'lead_id': lead_id,
                    'agent_id': agent_id,
                    'title': f"Meeting with {lead['name']}",
                    'description': f"Discuss Medicare options - {lead['notes']}",
                    'date': apt_date,
                    'time': f"{10 + i}:00",
                    'duration': 60,
                    'location': f"{100 + idx} Main Street, Tampa, FL",
                    'status': 'completed' if i < 2 else 'scheduled',
                    'type': 'in_person',
                    'created_at': datetime.utcnow() - timedelta(days=7),
                    'updated_at': datetime.utcnow(),
                    'deleted_at': None,
                    'notes': lead['notes'],
                    'reminder_sent': False
                }
                await db.appointments.insert_one(appointment)
                appointment_ids.append(apt_id)
                appointments_created += 1
            else:
                appointment_ids.append(existing['id'])
    
    print(f"  ✅ Created {appointments_created} new appointments")
    
    # ==================== SEED SCOPE OF APPOINTMENTS (SOA) ====================
    print("\n📝 Seeding Scope of Appointments (SOA)...")
    
    soas_created = 0
    
    # Create SOAs for completed appointments
    for i, apt_id in enumerate(appointment_ids[:2]):  # First 2 appointments are completed
        existing = await db.scope_of_appointments.find_one({'appointment_id': apt_id})
        if not existing:
            apt = await db.appointments.find_one({'id': apt_id})
            if apt:
                lead = await db.leads.find_one({'id': apt.get('lead_id')})
                soa_id = str(uuid.uuid4())
                soa = {
                    'id': soa_id,
                    'lead_id': apt.get('lead_id'),
                    'appointment_id': apt_id,
                    'agent_id': agent_id,
                    'beneficiary_name': lead['name'] if lead else f"Beneficiary {i}",
                    'beneficiary_address': f"{100 + i} Main Street, Tampa, FL 33601",
                    'beneficiary_phone': lead['phone'] if lead else f"555-000{i}",
                    'agent_name': 'Test Agent',
                    'agent_npn': 'NPN123456',
                    'appointment_date': apt['date'],
                    'products_discussed': ['Medicare Advantage', 'Part D Prescription Drug'],
                    'beneficiary_signature': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',  # 1x1 placeholder
                    'agent_signature': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    'signature_date': datetime.utcnow(),
                    'status': 'signed',
                    'created_at': datetime.utcnow() - timedelta(days=3),
                    'updated_at': datetime.utcnow(),
                    'deleted_at': None,
                    'pdf_generated': True,
                    'pdf_url': None
                }
                await db.scope_of_appointments.insert_one(soa)
                soas_created += 1
    
    print(f"  ✅ Created {soas_created} new SOAs")
    
    # ==================== SEED COMPLIANCE RECORDS ====================
    print("\n✅ Seeding Compliance Records...")
    
    compliance_created = 0
    
    for i, lead_id in enumerate(lead_ids[:6]):  # First 6 leads
        lead = lead_templates[i]
        existing = await db.compliance_records.find_one({'lead_id': lead_id})
        if not existing:
            # Determine compliance status based on lead stage
            if lead['stage'] in ['soa_completed', 'policy_submitted', 'closed_won']:
                compliance_status = 'compliant'
            elif lead['stage'] in ['appointment_set']:
                compliance_status = 'pending'
            else:
                compliance_status = 'missing_soa'
            
            record = {
                'id': str(uuid.uuid4()),
                'lead_id': lead_id,
                'lead_name': lead['name'],
                'agent_id': agent_id,
                'agent_name': 'Test Agent',
                'compliance_status': compliance_status,
                'appointment_date': datetime.utcnow() - timedelta(days=i),
                'soa_id': None,
                'notes': f"Auto-generated compliance record for {lead['name']}",
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            await db.compliance_records.insert_one(record)
            compliance_created += 1
    
    print(f"  ✅ Created {compliance_created} new compliance records")
    
    # ==================== SEED LEAD ACTIVITIES ====================
    print("\n📊 Seeding Lead Activities...")
    
    activities_created = 0
    activity_types = ['call', 'email', 'meeting', 'note', 'status_change']
    
    for i, lead_id in enumerate(lead_ids[:5]):  # First 5 leads
        lead = lead_templates[i]
        # Create 2-3 activities per lead
        for j in range(2 + (i % 2)):
            activity = {
                'id': str(uuid.uuid4()),
                'lead_id': lead_id,
                'user_id': agent_id,
                'activity_type': activity_types[(i + j) % len(activity_types)],
                'timestamp': datetime.utcnow() - timedelta(days=j, hours=i),
                'details': f"Activity {j+1} for {lead['name']}",
                'created_at': datetime.utcnow() - timedelta(days=j)
            }
            await db.lead_activities.insert_one(activity)
            activities_created += 1
    
    print(f"  ✅ Created {activities_created} lead activities")
    
    # ==================== SUMMARY ====================
    print("\n" + "=" * 50)
    print("🎉 Seeding Complete!")
    print("=" * 50)
    print("\n📌 Test Credentials:")
    print("  Admin:   admin@agentroute.com / Admin123!")
    print("  Manager: manager@agentroute.com / Manager123!")
    print("  Agent:   agent@agentroute.com / Agent123!")
    print("\n📊 Data Summary:")
    
    user_count = await db.users.count_documents({'deleted_at': None})
    lead_count = await db.leads.count_documents({'deleted_at': None})
    apt_count = await db.appointments.count_documents({'deleted_at': None})
    soa_count = await db.scope_of_appointments.count_documents({'deleted_at': None})
    
    print(f"  Users: {user_count}")
    print(f"  Leads: {lead_count}")
    print(f"  Appointments: {apt_count}")
    print(f"  SOAs: {soa_count}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_database())
