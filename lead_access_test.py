#!/usr/bin/env python3
"""
Test lead access with leads that should be accessible to each role
"""
import requests
import json

BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"

TEST_USERS = {
    "admin": {
        "email": "appstore_admin@agentroute.com",
        "password": "AppStoreAdmin1!"
    },
    "manager": {
        "email": "appstore_manager@agentroute.com", 
        "password": "AppStoreManager1!"
    },
    "agent": {
        "email": "appstore_agent@agentroute.com",
        "password": "AppStoreAgent1!"
    }
}

def get_auth_token(role):
    """Get authentication token for a role"""
    credentials = TEST_USERS[role]
    login_data = {
        "email": credentials["email"],
        "password": credentials["password"]
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=30)
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")
    except Exception as e:
        print(f"Auth failed for {role}: {e}")
    return None

def test_lead_access_with_own_leads():
    """Test individual lead access using leads that each role should be able to access"""
    print("🎯 TESTING INDIVIDUAL LEAD ACCESS WITH ROLE-APPROPRIATE LEADS")
    print("=" * 70)
    
    # Get tokens for all roles
    tokens = {}
    for role in ["admin", "manager", "agent"]:
        token = get_auth_token(role)
        if token:
            tokens[role] = token
            print(f"✅ {role.upper()} authenticated successfully")
        else:
            print(f"❌ {role.upper()} authentication failed")
    
    print()
    
    # Test individual lead access using leads from each role's own list
    for role in ["manager", "agent"]:
        token = tokens.get(role)
        if not token:
            continue
            
        headers = {"Authorization": f"Bearer {token}"}
        
        # First get the leads this role can see
        try:
            response = requests.get(f"{BASE_URL}/leads", headers=headers, timeout=30)
            if response.status_code == 200:
                leads = response.json()
                print(f"📋 {role.upper()} can see {len(leads)} leads")
                
                if leads:
                    # Test accessing the first lead from their own list
                    test_lead = leads[0]
                    lead_id = test_lead.get("id")
                    lead_name = test_lead.get("name", "Unknown")
                    
                    print(f"   Testing access to own lead: {lead_name} ({lead_id})")
                    
                    # Test individual lead access
                    individual_response = requests.get(f"{BASE_URL}/leads/{lead_id}", headers=headers, timeout=30)
                    
                    if individual_response.status_code == 200:
                        print(f"   ✅ {role.upper()}: Can access own lead successfully")
                        try:
                            lead_data = individual_response.json()
                            retrieved_name = lead_data.get("name", "Unknown")
                            print(f"      Retrieved: {retrieved_name}")
                        except:
                            pass
                    elif individual_response.status_code == 404:
                        print(f"   ❌ {role.upper()}: Cannot access own lead (404) - potential issue")
                    elif individual_response.status_code == 403:
                        print(f"   ❌ {role.upper()}: Access denied to own lead (403) - potential issue")
                    else:
                        print(f"   ⚠️  {role.upper()}: Unexpected status {individual_response.status_code}")
                        print(f"      Response: {individual_response.text[:200]}")
                else:
                    print(f"   ⚠️  {role.upper()}: No leads available to test individual access")
            else:
                print(f"❌ {role.upper()}: Cannot get leads list (status {response.status_code})")
        except Exception as e:
            print(f"❌ {role.upper()}: Request failed - {e}")
    
    print()
    
    # Test cross-role access (agent trying to access admin's lead)
    print("🔒 TESTING CROSS-ROLE ACCESS RESTRICTIONS")
    print("-" * 50)
    
    admin_token = tokens.get("admin")
    agent_token = tokens.get("agent")
    
    if admin_token and agent_token:
        # Get a lead that admin can see but agent shouldn't
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        agent_headers = {"Authorization": f"Bearer {agent_token}"}
        
        try:
            admin_response = requests.get(f"{BASE_URL}/leads", headers=admin_headers, timeout=30)
            agent_response = requests.get(f"{BASE_URL}/leads", headers=agent_headers, timeout=30)
            
            if admin_response.status_code == 200 and agent_response.status_code == 200:
                admin_leads = admin_response.json()
                agent_leads = agent_response.json()
                
                # Find a lead that admin has but agent doesn't
                admin_lead_ids = {lead.get("id") for lead in admin_leads}
                agent_lead_ids = {lead.get("id") for lead in agent_leads}
                
                admin_only_leads = admin_lead_ids - agent_lead_ids
                
                if admin_only_leads:
                    test_lead_id = list(admin_only_leads)[0]
                    print(f"📋 Testing agent access to admin-only lead: {test_lead_id}")
                    
                    # Agent tries to access admin's lead
                    cross_access_response = requests.get(f"{BASE_URL}/leads/{test_lead_id}", headers=agent_headers, timeout=30)
                    
                    if cross_access_response.status_code == 404:
                        print("   ✅ Agent properly denied access to admin-only lead (404)")
                    elif cross_access_response.status_code == 403:
                        print("   ✅ Agent properly denied access to admin-only lead (403)")
                    elif cross_access_response.status_code == 200:
                        print("   ❌ CRITICAL: Agent can access admin-only lead!")
                    else:
                        print(f"   ⚠️  Unexpected status {cross_access_response.status_code}")
                else:
                    print("   ⚠️  No admin-only leads found to test cross-access")
        except Exception as e:
            print(f"❌ Cross-role access test failed: {e}")

if __name__ == "__main__":
    test_lead_access_with_own_leads()