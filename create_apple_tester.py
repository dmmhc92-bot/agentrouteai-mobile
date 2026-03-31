#!/usr/bin/env python3
"""
Create Apple Tester Account for App Store Review
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

async def create_apple_tester():
    """Create Apple tester account"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🍎 Creating Apple Tester Account for App Store Review")
    print("=" * 60)
    
    # Check if Apple tester already exists
    apple_tester = await db.users.find_one({'email': 'admin_tester@apple.com'})
    
    if apple_tester:
        print("  ℹ️  Apple tester account already exists, updating...")
        # Update existing account
        await db.users.update_one(
            {'email': 'admin_tester@apple.com'},
            {'$set': {
                'password_hash': pwd_context.hash('AppleTest123!'),
                'subscription_status': 'premium',
                'apple_reviewer_bypass': True,
                'is_active': True,
                'deleted_at': None,
                'last_login': datetime.utcnow(),
                'role': 'admin'
            }}
        )
        print("  ✅ Apple tester account updated")
    else:
        # Create new Apple tester account
        user_id = str(uuid.uuid4())
        organization_id = f"org_apple_{uuid.uuid4().hex[:8]}"
        
        # Create organization for Apple tester
        org_doc = {
            "id": organization_id,
            "name": "Apple Review Team",
            "owner_user_id": user_id,
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
        
        # Create Apple tester user
        user_doc = {
            'id': user_id,
            'name': 'Apple Tester',
            'email': 'admin_tester@apple.com',
            'password_hash': pwd_context.hash('AppleTest123!'),
            'role': 'admin',
            'admin_id': user_id,  # Self-reference as admin
            'manager_id': None,
            'organization_id': organization_id,
            'organization_owner': True,
            'invited_by_user_id': None,
            'approval_status': 'approved',
            'phone': '+1-800-APL-CARE',
            'territory': 'Global',
            'subscription_status': 'premium',  # Required for Apple review
            'apple_reviewer_bypass': True,     # Required for Apple review
            'commission_rate': 0.6,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            'is_active': True,
            'deleted_at': None,
            'reset_token': None,
            'reset_token_expiry': None,
            'notification_preferences': {
                'appointments': True,
                'reminders': True,
                'follow_ups': True,
                'team_alerts': True,
                'lead_alerts': True,
                'push_enabled': True
            }
        }
        await db.users.insert_one(user_doc)
        print("  ✅ Apple tester account created")
    
    # Verify the account
    apple_tester = await db.users.find_one({'email': 'admin_tester@apple.com'})
    if apple_tester:
        print("\n📋 Apple Tester Account Details:")
        print(f"  Email: {apple_tester['email']}")
        print(f"  Role: {apple_tester['role']}")
        print(f"  Subscription Status: {apple_tester['subscription_status']}")
        print(f"  Apple Reviewer Bypass: {apple_tester.get('apple_reviewer_bypass', False)}")
        print(f"  Active: {apple_tester['is_active']}")
        print(f"  Organization ID: {apple_tester.get('organization_id', 'None')}")
    
    client.close()
    print("\n✅ Apple tester account ready for App Store review!")

if __name__ == "__main__":
    asyncio.run(create_apple_tester())