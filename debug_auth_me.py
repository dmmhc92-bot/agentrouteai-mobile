#!/usr/bin/env python3
"""
Debug the /api/auth/me endpoint to understand response structure
"""

import requests
import json

# Test Configuration
BASE_URL = "https://secure-dashboard-32.preview.emergentagent.com/api"

# Admin credentials
admin_credentials = {
    "email": "admin@agentroute.com",
    "password": "Admin123!"
}

def debug_auth_me():
    # Login first
    print("🔍 Debugging /api/auth/me endpoint...")
    print(f"Logging in with {admin_credentials['email']}...")
    
    login_response = requests.post(f"{BASE_URL}/auth/login", json=admin_credentials)
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        print(f"Response: {login_response.text}")
        return
    
    login_data = login_response.json()
    token = login_data.get("access_token")
    print(f"✅ Login successful, token: {token[:20]}..." if token else "❌ No token received")
    
    # Check login response structure
    print(f"\n📋 Login Response Structure:")
    print(json.dumps(login_data, indent=2))
    
    # Test /auth/me endpoint
    headers = {"Authorization": f"Bearer {token}"}
    me_response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    
    print(f"\n🔍 /auth/me Response:")
    print(f"Status Code: {me_response.status_code}")
    print(f"Response Headers: {dict(me_response.headers)}")
    
    if me_response.status_code == 200:
        me_data = me_response.json()
        print(f"Response Structure:")
        print(json.dumps(me_data, indent=2))
    else:
        print(f"Error Response: {me_response.text}")

if __name__ == "__main__":
    debug_auth_me()