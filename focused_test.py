#!/usr/bin/env python3
"""
Focused test for specific issues identified in test_result.md
"""
import requests
import json
import sys

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

def test_specific_issues():
    """Test the specific issues from test_result.md"""
    print("🔍 TESTING SPECIFIC ISSUES FROM test_result.md")
    print("=" * 60)
    
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
    
    # Issue 1: Command Center APIs - Agent access
    print("🏢 ISSUE 1: Command Center APIs - Agent Permission Boundaries")
    print("-" * 60)
    
    agent_token = tokens.get("agent")
    if agent_token:
        headers = {"Authorization": f"Bearer {agent_token}"}
        
        # Test endpoints that agent should NOT have access to
        restricted_endpoints = ["/team/agents", "/team/snapshot"]
        
        for endpoint in restricted_endpoints:
            try:
                response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=30)
                if response.status_code == 403:
                    print(f"✅ {endpoint}: Properly denied (403)")
                elif response.status_code == 200:
                    print(f"❌ {endpoint}: CRITICAL - Agent has unauthorized access!")
                    try:
                        data = response.json()
                        print(f"    Response data: {json.dumps(data, indent=2)[:200]}...")
                    except:
                        print(f"    Response: {response.text[:200]}")
                else:
                    print(f"⚠️  {endpoint}: Unexpected status {response.status_code}")
            except Exception as e:
                print(f"❌ {endpoint}: Request failed - {e}")
    else:
        print("❌ Cannot test - no agent token")
    
    print()
    
    # Issue 2: Pipeline APIs - 500 Error for agents
    print("📊 ISSUE 2: Pipeline APIs - 500 Error Check")
    print("-" * 60)
    
    for role in ["admin", "manager", "agent"]:
        token = tokens.get(role)
        if token:
            headers = {"Authorization": f"Bearer {token}"}
            try:
                response = requests.get(f"{BASE_URL}/pipeline", headers=headers, timeout=30)
                if response.status_code == 200:
                    print(f"✅ {role.upper()}: Pipeline API working (200)")
                    try:
                        data = response.json()
                        stages = data.get("stages", [])
                        print(f"    Retrieved {len(stages)} stages")
                    except Exception as e:
                        print(f"    JSON parsing error: {e}")
                elif response.status_code == 500:
                    print(f"❌ {role.upper()}: CRITICAL - 500 Internal Server Error!")
                    print(f"    Response: {response.text[:300]}")
                else:
                    print(f"⚠️  {role.upper()}: Unexpected status {response.status_code}")
                    print(f"    Response: {response.text[:200]}")
            except Exception as e:
                print(f"❌ {role.upper()}: Request failed - {e}")
        else:
            print(f"❌ {role.upper()}: Cannot test - no token")
    
    print()
    
    # Issue 3: Individual Lead Access
    print("🎯 ISSUE 3: Individual Lead Access")
    print("-" * 60)
    
    # First get a lead ID from admin
    admin_token = tokens.get("admin")
    test_lead_id = None
    
    if admin_token:
        headers = {"Authorization": f"Bearer {admin_token}"}
        try:
            response = requests.get(f"{BASE_URL}/leads", headers=headers, timeout=30)
            if response.status_code == 200:
                leads = response.json()
                if leads:
                    test_lead_id = leads[0].get("id")
                    print(f"📋 Using test lead ID: {test_lead_id}")
        except Exception as e:
            print(f"❌ Failed to get test lead ID: {e}")
    
    if test_lead_id:
        for role in ["admin", "manager", "agent"]:
            token = tokens.get(role)
            if token:
                headers = {"Authorization": f"Bearer {token}"}
                try:
                    response = requests.get(f"{BASE_URL}/leads/{test_lead_id}", headers=headers, timeout=30)
                    if response.status_code == 200:
                        print(f"✅ {role.upper()}: Individual lead access working")
                        try:
                            data = response.json()
                            lead_name = data.get("name", "Unknown")
                            print(f"    Lead: {lead_name}")
                        except:
                            pass
                    elif response.status_code == 404:
                        print(f"⚠️  {role.upper()}: Lead not found (404) - may be permission-based")
                    elif response.status_code == 403:
                        print(f"✅ {role.upper()}: Properly denied access (403)")
                    else:
                        print(f"❌ {role.upper()}: Unexpected status {response.status_code}")
                        print(f"    Response: {response.text[:200]}")
                except Exception as e:
                    print(f"❌ {role.upper()}: Request failed - {e}")
            else:
                print(f"❌ {role.upper()}: Cannot test - no token")
    else:
        print("❌ Cannot test individual lead access - no test lead ID")
    
    print()
    
    # Additional check: Data integrity
    print("📊 DATA INTEGRITY CHECK")
    print("-" * 60)
    
    for role in ["admin", "manager", "agent"]:
        token = tokens.get(role)
        if token:
            headers = {"Authorization": f"Bearer {token}"}
            try:
                # Get leads count
                leads_response = requests.get(f"{BASE_URL}/leads", headers=headers, timeout=30)
                leads_count = 0
                if leads_response.status_code == 200:
                    leads = leads_response.json()
                    leads_count = len(leads)
                
                # Get appointments count
                appointments_response = requests.get(f"{BASE_URL}/appointments", headers=headers, timeout=30)
                appointments_count = 0
                if appointments_response.status_code == 200:
                    appointments = appointments_response.json()
                    appointments_count = len(appointments)
                
                print(f"📈 {role.upper()}: {leads_count} leads, {appointments_count} appointments")
                
            except Exception as e:
                print(f"❌ {role.upper()}: Data integrity check failed - {e}")

if __name__ == "__main__":
    test_specific_issues()