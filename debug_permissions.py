#!/usr/bin/env python3
"""
Debug permission enforcement for invite system
"""

import requests
import json

API_BASE_URL = "https://pipeline-proof.preview.emergentagent.com/api"

# Test credentials
TEST_CREDENTIALS = {
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

def login_and_test_permission(role, target_role):
    """Login and test permission enforcement"""
    print(f"\n=== Testing {role} trying to create {target_role} invite ===")
    
    # Login
    try:
        response = requests.post(f"{API_BASE_URL}/auth/login", json=TEST_CREDENTIALS[role], timeout=30)
        print(f"Login response: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Login failed: {response.text}")
            return
        
        token = response.json().get("access_token")
        print(f"Token obtained: {token[:20]}...")
        
        # Try to create invitation
        headers = {"Authorization": f"Bearer {token}"}
        invite_data = {
            "email": f"test{target_role}@test.com",
            "role": target_role,
            "name": f"Test {target_role}"
        }
        
        print(f"Making request to create {target_role} invite...")
        invite_response = requests.post(f"{API_BASE_URL}/invitations", 
                                      json=invite_data, 
                                      headers=headers, 
                                      timeout=30)
        
        print(f"Invite response status: {invite_response.status_code}")
        print(f"Invite response text: {invite_response.text}")
        
        if invite_response.status_code == 403:
            print(f"✅ CORRECT: {role} blocked from creating {target_role} invite")
        elif invite_response.status_code == 200:
            print(f"❌ INCORRECT: {role} was allowed to create {target_role} invite")
        else:
            print(f"❌ UNEXPECTED: Got status {invite_response.status_code}")
            
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")

if __name__ == "__main__":
    # Test manager trying to create manager invite (should fail)
    login_and_test_permission("manager", "manager")
    
    # Test agent trying to create agent invite (should fail)  
    login_and_test_permission("agent", "agent")