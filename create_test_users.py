#!/usr/bin/env python3
"""
Create specific test users for AgentRoute CRM testing
"""
import asyncio
import os
import uuid
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

mongo_url = os.getenv('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'agentroute_db')
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

async def create_test_users():
    """Create specific test users for the review request"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🔧 Creating AgentRoute CRM Test Users...")
    print("=" * 50)
    
    # Organization setup
    org_id = "org_appstore_test"
    
    # Create organization if it doesn't exist
    org = await db.organizations.find_one({"id": org_id})
    if not org:
        org_doc = {
            "id": org_id,
            "name": "AppStore Test Organization",
            "owner_user_id": None,  # Will be set to admin
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "is_active": True,
            "settings": {
                "allow_manager_invites": True,
                "require_approval": False,
                "default_commission_rate": 0.6
            }
        }
        await db.organizations.insert_one(org_doc)
        print("  ✅ Created AppStore Test Organization")
    
    # Test users to create
    test_users = [
        {
            "email": "appstore_admin@agentroute.com",
            "password": "AppStoreAdmin1!",
            "name": "AppStore Admin",
            "role": "admin",
            "manager_id": None,
            "phone": "+1-555-9001",
            "territory": "All Regions"
        },
        {
            "email": "appstore_manager@agentroute.com", 
            "password": "AppStoreManager1!",
            "name": "AppStore Manager",
            "role": "manager",
            "manager_id": None,  # Will be set to admin
            "phone": "+1-555-9002",
            "territory": "Florida"
        },
        {
            "email": "appstore_agent@agentroute.com",
            "password": "AppStoreAgent1!",
            "name": "AppStore Agent", 
            "role": "agent",
            "manager_id": None,  # Will be set to manager
            "phone": "+1-555-9003",
            "territory": "Tampa"
        }
    ]
    
    admin_id = None
    manager_id = None
    
    for user_data in test_users:
        existing = await db.users.find_one({"email": user_data["email"]})
        
        if existing:
            # Update existing user
            user_id = existing["id"]
            update_data = {
                "password_hash": pwd_context.hash(user_data["password"]),
                "name": user_data["name"],
                "role": user_data["role"],
                "phone": user_data["phone"],
                "territory": user_data["territory"],
                "is_active": True,
                "deleted_at": None,
                "approval_status": "approved",
                "subscription_status": "premium",
                "organization_id": org_id,
                "updated_at": datetime.utcnow()
            }
            
            # Set hierarchy
            if user_data["role"] == "admin":
                admin_id = user_id
                update_data["admin_id"] = user_id
                update_data["manager_id"] = None
            elif user_data["role"] == "manager":
                manager_id = user_id
                update_data["admin_id"] = admin_id
                update_data["manager_id"] = admin_id
            else:  # agent
                update_data["admin_id"] = admin_id
                update_data["manager_id"] = manager_id
            
            await db.users.update_one({"id": user_id}, {"$set": update_data})
            print(f"  ✅ Updated {user_data['email']} ({user_data['role']})")
        else:
            # Create new user
            user_id = str(uuid.uuid4())
            
            user_doc = {
                "id": user_id,
                "name": user_data["name"],
                "email": user_data["email"],
                "password_hash": pwd_context.hash(user_data["password"]),
                "role": user_data["role"],
                "phone": user_data["phone"],
                "territory": user_data["territory"],
                "organization_id": org_id,
                "subscription_status": "premium",
                "commission_rate": 0.6,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "last_login": None,
                "is_active": True,
                "deleted_at": None,
                "approval_status": "approved",
                "reset_token": None,
                "reset_token_expiry": None,
                "notification_preferences": {
                    "appointments": True,
                    "reminders": True,
                    "follow_ups": True,
                    "team_alerts": True,
                    "lead_alerts": True,
                    "push_enabled": True
                }
            }
            
            # Set hierarchy
            if user_data["role"] == "admin":
                admin_id = user_id
                user_doc["admin_id"] = user_id
                user_doc["manager_id"] = None
            elif user_data["role"] == "manager":
                manager_id = user_id
                user_doc["admin_id"] = admin_id
                user_doc["manager_id"] = admin_id
            else:  # agent
                user_doc["admin_id"] = admin_id
                user_doc["manager_id"] = manager_id
            
            await db.users.insert_one(user_doc)
            print(f"  ✅ Created {user_data['email']} ({user_data['role']})")
        
        # Store IDs for hierarchy setup
        if user_data["role"] == "admin":
            admin_id = user_id
        elif user_data["role"] == "manager":
            manager_id = user_id
    
    # Update organization owner
    if admin_id:
        await db.organizations.update_one(
            {"id": org_id},
            {"$set": {"owner_user_id": admin_id}}
        )
    
    # Create some test leads for the agent
    if manager_id:
        lead_templates = [
            {"name": "Test Lead 1", "email": "testlead1@example.com", "phone": "555-1001", "stage": "new"},
            {"name": "Test Lead 2", "email": "testlead2@example.com", "phone": "555-1002", "stage": "contacted"},
            {"name": "Manager Lead 1", "email": "mgrlead1@example.com", "phone": "555-2001", "stage": "follow_up"},
        ]
        
        for i, template in enumerate(lead_templates):
            existing = await db.leads.find_one({"email": template["email"]})
            if not existing:
                lead_id = str(uuid.uuid4())
                assigned_to = manager_id if "Manager" in template["name"] else None
                
                lead = {
                    "id": lead_id,
                    "name": template["name"],
                    "email": template["email"],
                    "phone": template["phone"],
                    "address": f"123 Test Street #{i+1}, Tampa, FL 33601",
                    "notes": f"Test lead for permission testing - {template['name']}",
                    "stage": template["stage"],
                    "underwriting_status": "not_submitted",
                    "source": "test_data",
                    "created_by_user": admin_id,
                    "assigned_to_user": assigned_to,
                    "created_date": datetime.utcnow(),
                    "last_contact_date": None,
                    "next_follow_up": None,
                    "latitude": None,
                    "longitude": None,
                    "referral_source": None,
                    "renewal_date": None
                }
                await db.leads.insert_one(lead)
                print(f"  ✅ Created test lead: {template['name']}")
    
    print("\n" + "=" * 50)
    print("🎉 Test Users Created Successfully!")
    print("=" * 50)
    print("\n📌 Test Credentials:")
    print("  Admin:   appstore_admin@agentroute.com / AppStoreAdmin1!")
    print("  Manager: appstore_manager@agentroute.com / AppStoreManager1!")
    print("  Agent:   appstore_agent@agentroute.com / AppStoreAgent1!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_test_users())