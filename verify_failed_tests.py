#!/usr/bin/env python3
"""
Manual verification of the 3 tests that showed timeout issues
"""
import requests
import json
import time

BACKEND_URL = "https://agentroute-app-store.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

def login_user(user_type):
    """Login and return access token"""
    response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json=TEST_CREDENTIALS[user_type],
        headers={"Content-Type": "application/json"},
        timeout=30
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    return None

def test_offline_duplicate():
    """Test 13: Offline lead duplicate prevention"""
    print("Testing offline lead duplicate prevention...")
    
    admin_token = login_user("admin")
    if not admin_token:
        print("❌ Admin login failed")
        return False
    
    # Create offline lead first
    temp_id = f"verify_temp_{int(time.time())}"
    offline_data = {
        "name": "Verification Test Lead",
        "temp_id": temp_id,
        "offline_timestamp": "2026-03-18T05:45:00.000Z"
    }
    
    # First creation should succeed
    response1 = requests.post(
        f"{BACKEND_URL}/leads/offline",
        json=offline_data,
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
        timeout=30
    )
    
    print(f"First creation: {response1.status_code}")
    
    # Second creation with same temp_id should fail with 409
    response2 = requests.post(
        f"{BACKEND_URL}/leads/offline",
        json=offline_data,
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
        timeout=30
    )
    
    print(f"Duplicate creation: {response2.status_code}")
    
    if response2.status_code == 409:
        print("✅ PASS: Duplicate prevention working correctly (409)")
        return True
    else:
        print(f"❌ FAIL: Expected 409, got {response2.status_code}")
        return False

def test_agent_user_access():
    """Test 16: Agent should not access user list"""
    print("Testing agent user access denial...")
    
    agent_token = login_user("agent")
    if not agent_token:
        print("❌ Agent login failed")
        return False
    
    response = requests.get(
        f"{BACKEND_URL}/users",
        headers={"Authorization": f"Bearer {agent_token}"},
        timeout=30
    )
    
    print(f"Agent user access: {response.status_code}")
    
    if response.status_code == 403:
        print("✅ PASS: Agent properly denied access to users (403)")
        return True
    else:
        print(f"❌ FAIL: Expected 403, got {response.status_code}")
        return False

def test_agent_manager_center_access():
    """Test 19: Agent should not access manager command center"""
    print("Testing agent manager command center access denial...")
    
    agent_token = login_user("agent")
    if not agent_token:
        print("❌ Agent login failed")
        return False
    
    response = requests.get(
        f"{BACKEND_URL}/manager/daily-command-center",
        headers={"Authorization": f"Bearer {agent_token}"},
        timeout=30
    )
    
    print(f"Agent manager center access: {response.status_code}")
    
    if response.status_code == 403:
        print("✅ PASS: Agent properly denied access to manager center (403)")
        return True
    else:
        print(f"❌ FAIL: Expected 403, got {response.status_code}")
        return False

if __name__ == "__main__":
    print("🔍 MANUAL VERIFICATION OF FAILED TESTS")
    print("=" * 50)
    
    results = []
    results.append(test_offline_duplicate())
    results.append(test_agent_user_access())
    results.append(test_agent_manager_center_access())
    
    passed = sum(results)
    total = len(results)
    
    print("\n" + "=" * 50)
    print(f"MANUAL VERIFICATION SUMMARY: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL TESTS PASS - 100% SUCCESS RATE CONFIRMED")
    else:
        print(f"❌ {total - passed} tests still failing")