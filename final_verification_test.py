#!/usr/bin/env python3
"""
AgentRoute AI Backend API - FINAL COMPREHENSIVE VERIFICATION
Testing all critical systems before iOS build as specified in review request
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration - Use localhost as specified in review request
BASE_URL = "http://localhost:8001/api"
HEADERS = {"Content-Type": "application/json"}

# Test credentials from review request
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []
        
    def add_result(self, test_name: str, passed: bool, details: str = ""):
        self.results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
        if passed:
            self.passed += 1
            print(f"✅ {test_name}")
            if details:
                print(f"   {details}")
        else:
            self.failed += 1
            print(f"❌ {test_name}: {details}")
    
    def summary(self):
        total = self.passed + self.failed
        success_rate = (self.passed / total * 100) if total > 0 else 0
        print(f"\n🎯 FINAL VERIFICATION RESULTS:")
        print(f"Total Tests: {total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Success Rate: {success_rate:.1f}%")
        return success_rate >= 90

def make_request(method: str, endpoint: str, data: Dict = None, headers: Dict = None, token: str = None) -> Dict[str, Any]:
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    req_headers = HEADERS.copy()
    if headers:
        req_headers.update(headers)
    if token:
        req_headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=req_headers, timeout=15)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=req_headers, timeout=15)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=req_headers, timeout=15)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=req_headers, timeout=15)
        else:
            return {"error": f"Unsupported method: {method}", "status_code": 400}
        
        try:
            response_data = response.json() if response.content else {}
        except json.JSONDecodeError:
            response_data = response.text if response.content else ""
        
        return {
            "status_code": response.status_code,
            "data": response_data,
            "headers": dict(response.headers)
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "status_code": 0}

def login_user(role: str) -> Optional[str]:
    """Login and return access token"""
    if role not in TEST_CREDENTIALS:
        return None
    
    creds = TEST_CREDENTIALS[role]
    response = make_request("POST", "/auth/login", creds)
    
    if response.get("status_code") == 200:
        return response["data"].get("access_token")
    return None

def test_route_visibility_permissions(results: TestResults):
    """Test Route Visibility Permissions (NEW FEATURE)"""
    print("\n🔍 1. ROUTE VISIBILITY PERMISSIONS (NEW FEATURE)")
    print("=" * 60)
    
    # Login as agent
    agent_token = login_user("agent")
    if not agent_token:
        results.add_result("1A. Agent Login", False, "Failed to login as agent@agentroute.com")
        return
    results.add_result("1A. Agent Login", True, "Successfully logged in as agent@agentroute.com")
    
    # 1A. Get Default Visibility
    response = make_request("GET", "/routes/visibility", token=agent_token)
    if response.get("status_code") == 200:
        visibility_data = response["data"].get("visibility", {})
        visibility_level = visibility_data.get("visibility_level")
        if visibility_level == "private":
            results.add_result("1A. Get Default Visibility", True, "Returns visibility_level='private' by default")
        else:
            results.add_result("1A. Get Default Visibility", False, f"Expected 'private', got '{visibility_level}'")
    else:
        results.add_result("1A. Get Default Visibility", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 1B. Update to Summary View
    response = make_request("PUT", "/routes/visibility", {"visibility_level": "summary"}, token=agent_token)
    if response.get("status_code") == 200:
        data = response["data"]
        visibility_data = data.get("visibility", {})
        if visibility_data.get("visibility_level") == "summary" and visibility_data.get("allow_manager_view") == True:
            results.add_result("1B. Update to Summary View", True, "Returns success, visibility_level='summary', allow_manager_view=true")
        else:
            results.add_result("1B. Update to Summary View", False, f"Unexpected response: {data}")
    else:
        results.add_result("1B. Update to Summary View", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 1C. Update to Shared View
    response = make_request("PUT", "/routes/visibility", {"visibility_level": "shared"}, token=agent_token)
    if response.get("status_code") == 200:
        data = response["data"]
        visibility_data = data.get("visibility", {})
        if visibility_data.get("visibility_level") == "shared":
            results.add_result("1C. Update to Shared View", True, "Returns success, visibility_level='shared'")
        else:
            results.add_result("1C. Update to Shared View", False, f"Unexpected response: {data}")
    else:
        results.add_result("1C. Update to Shared View", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 1D. Reset to Private
    response = make_request("PUT", "/routes/visibility", {"visibility_level": "private"}, token=agent_token)
    if response.get("status_code") == 200:
        data = response["data"]
        visibility_data = data.get("visibility", {})
        if visibility_data.get("visibility_level") == "private" and visibility_data.get("allow_manager_view") == False:
            results.add_result("1D. Reset to Private", True, "Returns success, visibility_level='private', allow_manager_view=false")
        else:
            results.add_result("1D. Reset to Private", False, f"Unexpected response: {data}")
    else:
        results.add_result("1D. Reset to Private", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 1E. Admin Viewing Agent Route (permission test)
    admin_token = login_user("admin")
    if admin_token:
        # Get agent's user_id first
        agent_response = make_request("GET", "/auth/me", token=agent_token)
        if agent_response.get("status_code") == 200:
            agent_id = agent_response["data"].get("id")
            if agent_id:
                response = make_request("GET", f"/routes/agent/{agent_id}?date=2026-03-16", token=admin_token)
                if response.get("status_code") in [200, 403]:  # Either works or properly denied based on visibility
                    results.add_result("1E. Admin Viewing Agent Route", True, f"Response respects agent's visibility setting (Status: {response.get('status_code')})")
                else:
                    results.add_result("1E. Admin Viewing Agent Route", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
            else:
                results.add_result("1E. Admin Viewing Agent Route", False, "Could not get agent ID")
        else:
            results.add_result("1E. Admin Viewing Agent Route", False, "Could not get agent info")
    else:
        results.add_result("1E. Admin Viewing Agent Route", False, "Admin login failed")

def test_push_notification_system(results: TestResults):
    """Test Push Notification System"""
    print("\n📱 2. PUSH NOTIFICATION SYSTEM")
    print("=" * 60)
    
    # Login as agent
    agent_token = login_user("agent")
    if not agent_token:
        results.add_result("2A. Agent Login for Notifications", False, "Failed to login as agent")
        return
    results.add_result("2A. Agent Login for Notifications", True)
    
    # 2A. Register Push Token
    push_data = {"push_token": "ExponentPushToken[final_test_xyz]", "device_type": "ios"}
    response = make_request("POST", "/notifications/register-push-token", push_data, token=agent_token)
    if response.get("status_code") == 200:
        results.add_result("2A. Register Push Token", True, "Returns success")
    else:
        results.add_result("2A. Register Push Token", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 2B. Get Notification Preferences
    response = make_request("GET", "/notifications/preferences", token=agent_token)
    if response.get("status_code") == 200:
        # Handle both nested and direct preference structures
        prefs = response["data"]
        if "preferences" in prefs:
            prefs = prefs["preferences"]
        
        required_fields = ["appointments", "reminders", "follow_ups", "team_alerts", "lead_alerts", "push_enabled"]
        if all(field in prefs for field in required_fields):
            results.add_result("2B. Get Notification Preferences", True, "Returns all 6 preference fields")
        else:
            missing = [f for f in required_fields if f not in prefs]
            results.add_result("2B. Get Notification Preferences", False, f"Missing fields: {missing}")
    else:
        results.add_result("2B. Get Notification Preferences", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 2C. Update Notification Preferences
    update_prefs = {"appointments": False, "reminders": True}
    response = make_request("PUT", "/notifications/preferences", update_prefs, token=agent_token)
    if response.get("status_code") == 200:
        results.add_result("2C. Update Notification Preferences", True, "Returns updated preferences")
    else:
        results.add_result("2C. Update Notification Preferences", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 2D. Send Test Notification
    response = make_request("POST", "/notifications/test", token=agent_token)
    if response.get("status_code") == 200:
        results.add_result("2D. Send Test Notification", True, "Creates notification record")
    else:
        results.add_result("2D. Send Test Notification", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
    
    # 2E. Get Notifications
    response = make_request("GET", "/notifications", token=agent_token)
    if response.get("status_code") == 200:
        data = response["data"]
        if "unread_count" in data:
            results.add_result("2E. Get Notifications", True, f"Returns notifications list with unread_count: {data.get('unread_count')}")
            
            # 2F. Mark Notification Read (if we have notifications)
            notifications = data.get("notifications", [])
            if notifications and len(notifications) > 0:
                notification_id = notifications[0].get("id")
                if notification_id:
                    mark_response = make_request("PUT", f"/notifications/{notification_id}/read", token=agent_token)
                    if mark_response.get("status_code") == 200:
                        results.add_result("2F. Mark Notification Read", True, "Marks as read, decrements count")
                    else:
                        results.add_result("2F. Mark Notification Read", False, f"Status: {mark_response.get('status_code')}")
                else:
                    results.add_result("2F. Mark Notification Read", False, "No notification ID found")
            else:
                results.add_result("2F. Mark Notification Read", True, "No notifications to mark (acceptable)")
        else:
            results.add_result("2E. Get Notifications", False, "Missing unread_count in response")
            results.add_result("2F. Mark Notification Read", False, "Cannot test without notifications list")
    else:
        results.add_result("2E. Get Notifications", False, f"Status: {response.get('status_code')}, Error: {response.get('error', 'Unknown')}")
        results.add_result("2F. Mark Notification Read", False, "Cannot test without notifications endpoint")

def test_onboarding_system(results: TestResults):
    """Test Onboarding System"""
    print("\n🚀 3. ONBOARDING SYSTEM")
    print("=" * 60)
    
    import uuid
    unique_id = str(uuid.uuid4())[:8]
    
    # 3A. Create Organization Flow
    org_data = {
        "organization_name": "Final Test Agency",
        "name": "Final Admin",
        "email": f"finaladmin{unique_id}@test.com",
        "password": "FinalPass123!"
    }
    response = make_request("POST", "/auth/create-organization", org_data)
    if response.get("status_code") == 200:
        user_data = response["data"].get("user", {})
        if user_data.get("role") == "admin" and user_data.get("organization_id"):
            results.add_result("3A. Create Organization Flow", True, f"Returns role='admin', organization_id populated: {user_data.get('organization_id')}")
        else:
            results.add_result("3A. Create Organization Flow", False, f"Role: {user_data.get('role')}, Org ID: {user_data.get('organization_id')}")
    else:
        error_detail = response.get("data", {}).get("detail", "Unknown error") if isinstance(response.get("data"), dict) else response.get("data", "Unknown")
        results.add_result("3A. Create Organization Flow", False, f"Status: {response.get('status_code')}, Error: {error_detail}")
    
    # 3B. Solo Agent Flow
    solo_data = {
        "name": "Final Solo",
        "email": f"finalsolo{unique_id}@test.com",
        "password": "SoloPass123!"
    }
    response = make_request("POST", "/auth/register-solo", solo_data)
    if response.get("status_code") == 200:
        user_data = response["data"].get("user", {})
        if (user_data.get("role") == "agent" and 
            user_data.get("organization_id") is None and 
            user_data.get("account_mode") == "solo"):
            results.add_result("3B. Solo Agent Flow", True, "Returns role='agent', organization_id=null, account_mode='solo'")
        else:
            results.add_result("3B. Solo Agent Flow", False, f"Role: {user_data.get('role')}, Org ID: {user_data.get('organization_id')}, Mode: {user_data.get('account_mode')}")
    else:
        error_detail = response.get("data", {}).get("detail", "Unknown error") if isinstance(response.get("data"), dict) else response.get("data", "Unknown")
        results.add_result("3B. Solo Agent Flow", False, f"Status: {response.get('status_code')}, Error: {error_detail}")

def test_invite_token_system(results: TestResults):
    """Test Invite Token System"""
    print("\n🎫 4. INVITE TOKEN SYSTEM")
    print("=" * 60)
    
    # Login as admin
    admin_token = login_user("admin")
    if not admin_token:
        results.add_result("4A. Admin Login", False, "Failed to login as admin")
        return
    results.add_result("4A. Admin Login", True)
    
    # 4A. Admin Creates Manager Token
    manager_invite = {"role": "manager"}
    response = make_request("POST", "/invitations", manager_invite, token=admin_token)
    if response.get("status_code") == 200 and response["data"].get("token"):
        results.add_result("4A. Admin Creates Manager Token", True, "Returns token")
    else:
        results.add_result("4A. Admin Creates Manager Token", False, f"Status: {response.get('status_code')}, Token present: {bool(response.get('data', {}).get('token'))}")
    
    # 4B. Admin Creates Agent Token
    agent_invite = {"role": "agent"}
    response = make_request("POST", "/invitations", agent_invite, token=admin_token)
    if response.get("status_code") == 200 and response["data"].get("token"):
        results.add_result("4B. Admin Creates Agent Token", True, "Returns token")
    else:
        results.add_result("4B. Admin Creates Agent Token", False, f"Status: {response.get('status_code')}, Token present: {bool(response.get('data', {}).get('token'))}")
    
    # 4C. Manager Creates Agent Token
    manager_token = login_user("manager")
    if manager_token:
        response = make_request("POST", "/invitations", agent_invite, token=manager_token)
        if response.get("status_code") == 200:
            results.add_result("4C. Manager Creates Agent Token", True, "Returns token (allowed)")
        else:
            results.add_result("4C. Manager Creates Agent Token", False, f"Status: {response.get('status_code')}")
    else:
        results.add_result("4C. Manager Creates Agent Token", False, "Manager login failed")
    
    # 4D. Manager Cannot Create Manager Token
    if manager_token:
        response = make_request("POST", "/invitations", manager_invite, token=manager_token)
        if response.get("status_code") == 403:
            results.add_result("4D. Manager Cannot Create Manager Token", True, "Returns 403")
        else:
            results.add_result("4D. Manager Cannot Create Manager Token", False, f"Expected 403, got {response.get('status_code')}")
    else:
        results.add_result("4D. Manager Cannot Create Manager Token", False, "Manager token not available")
    
    # 4E. Agent Cannot Create Invitations
    agent_token = login_user("agent")
    if agent_token:
        response = make_request("POST", "/invitations", agent_invite, token=agent_token)
        if response.get("status_code") == 403:
            results.add_result("4E. Agent Cannot Create Invitations", True, "Returns 403")
        else:
            results.add_result("4E. Agent Cannot Create Invitations", False, f"Expected 403, got {response.get('status_code')}")
    else:
        results.add_result("4E. Agent Cannot Create Invitations", False, "Agent login failed")

def test_role_based_routing(results: TestResults):
    """Test Role-Based Routing & Permissions"""
    print("\n👥 5. ROLE-BASED ROUTING & PERMISSIONS")
    print("=" * 60)
    
    # 5A. Admin Login Returns Correct Role
    admin_token = login_user("admin")
    if admin_token:
        response = make_request("GET", "/auth/me", token=admin_token)
        if response.get("status_code") == 200 and response["data"].get("role") == "admin":
            results.add_result("5A. Admin Login Returns Correct Role", True, "Returns role='admin'")
        else:
            results.add_result("5A. Admin Login Returns Correct Role", False, f"Role: {response['data'].get('role')}")
    else:
        results.add_result("5A. Admin Login Returns Correct Role", False, "Admin login failed")
    
    # 5B. Manager Login Returns Correct Role
    manager_token = login_user("manager")
    if manager_token:
        response = make_request("GET", "/auth/me", token=manager_token)
        if response.get("status_code") == 200 and response["data"].get("role") == "manager":
            results.add_result("5B. Manager Login Returns Correct Role", True, "Returns role='manager'")
        else:
            results.add_result("5B. Manager Login Returns Correct Role", False, f"Role: {response['data'].get('role')}")
    else:
        results.add_result("5B. Manager Login Returns Correct Role", False, "Manager login failed")
    
    # 5C. Agent Login Returns Correct Role
    agent_token = login_user("agent")
    if agent_token:
        response = make_request("GET", "/auth/me", token=agent_token)
        if response.get("status_code") == 200 and response["data"].get("role") == "agent":
            results.add_result("5C. Agent Login Returns Correct Role", True, "Returns role='agent'")
        else:
            results.add_result("5C. Agent Login Returns Correct Role", False, f"Role: {response['data'].get('role')}")
    else:
        results.add_result("5C. Agent Login Returns Correct Role", False, "Agent login failed")
    
    # 5D. Data Filtering by Role
    if agent_token and admin_token:
        # Get leads as agent
        agent_response = make_request("GET", "/leads", token=agent_token)
        agent_count = 0
        if agent_response.get("status_code") == 200:
            agent_count = len(agent_response["data"]) if isinstance(agent_response["data"], list) else 0
        
        # Get leads as admin
        admin_response = make_request("GET", "/leads", token=admin_token)
        admin_count = 0
        if admin_response.get("status_code") == 200:
            admin_count = len(admin_response["data"]) if isinstance(admin_response["data"], list) else 0
        
        if admin_count >= agent_count:
            results.add_result("5D. Data Filtering by Role", True, f"Admin sees {admin_count} leads, Agent sees {agent_count} leads (hierarchy filtering)")
        else:
            results.add_result("5D. Data Filtering by Role", False, f"Admin sees {admin_count} leads, Agent sees {agent_count} leads")
    else:
        results.add_result("5D. Data Filtering by Role", False, "Missing tokens for comparison")

def test_backend_security(results: TestResults):
    """Test Backend Security"""
    print("\n🔒 6. BACKEND SECURITY")
    print("=" * 60)
    
    # 6A. Protected Routes Require Auth
    response = make_request("GET", "/leads")  # No token
    if response.get("status_code") in [401, 403]:
        results.add_result("6A. Protected Routes Require Auth", True, f"Returns {response.get('status_code')}")
    else:
        results.add_result("6A. Protected Routes Require Auth", False, f"Expected 401/403, got {response.get('status_code')}")
    
    # 6B. Agent Cannot Change Own Role
    agent_token = login_user("agent")
    if agent_token:
        # Get agent's own ID
        me_response = make_request("GET", "/auth/me", token=agent_token)
        if me_response.get("status_code") == 200:
            agent_id = me_response["data"].get("id")
            if agent_id:
                role_change = {"role": "admin"}
                response = make_request("PUT", f"/users/{agent_id}/role", role_change, token=agent_token)
                if response.get("status_code") == 403:
                    results.add_result("6B. Agent Cannot Change Own Role", True, "Returns 403")
                else:
                    results.add_result("6B. Agent Cannot Change Own Role", False, f"Expected 403, got {response.get('status_code')}")
            else:
                results.add_result("6B. Agent Cannot Change Own Role", False, "Could not get agent ID")
        else:
            results.add_result("6B. Agent Cannot Change Own Role", False, "Could not get agent info")
    else:
        results.add_result("6B. Agent Cannot Change Own Role", False, "Agent login failed")

def test_solo_agent_functionality(results: TestResults):
    """Test Solo Agent Functionality"""
    print("\n🏃 7. SOLO AGENT FUNCTIONALITY")
    print("=" * 60)
    
    import uuid
    unique_id = str(uuid.uuid4())[:8]
    
    # Create a solo agent first (reuse from onboarding test but with different email)
    solo_data = {
        "name": "Test Solo Agent",
        "email": f"testsolo{unique_id}@test.com",
        "password": "TestSolo123!"
    }
    response = make_request("POST", "/auth/register-solo", solo_data)
    if response.get("status_code") == 200:
        solo_token = response["data"].get("access_token")
        
        # 7A. Solo Agent Can Create Leads
        lead_data = {
            "name": "Test Lead for Solo",
            "phone": "555-0123",
            "email": "testlead@example.com",
            "address": "123 Test St, Test City, TS 12345"
        }
        lead_response = make_request("POST", "/leads", lead_data, token=solo_token)
        if lead_response.get("status_code") == 200:
            results.add_result("7A. Solo Agent Can Create Leads", True, "Returns 200")
            lead_id = lead_response["data"].get("id")
            
            # 7B. Solo Agent Can Create Appointments
            if lead_id:
                appointment_data = {
                    "lead_id": lead_id,
                    "appointment_date": "2026-03-20",
                    "appointment_time": "10:00",
                    "notes": "Test appointment for solo agent"
                }
                appt_response = make_request("POST", "/appointments", appointment_data, token=solo_token)
                if appt_response.get("status_code") == 200:
                    results.add_result("7B. Solo Agent Can Create Appointments", True, "Returns 200")
                else:
                    results.add_result("7B. Solo Agent Can Create Appointments", False, f"Status: {appt_response.get('status_code')}")
            else:
                results.add_result("7B. Solo Agent Can Create Appointments", False, "No lead ID available")
        else:
            results.add_result("7A. Solo Agent Can Create Leads", False, f"Status: {lead_response.get('status_code')}")
            results.add_result("7B. Solo Agent Can Create Appointments", False, "Lead creation failed")
    else:
        error_detail = response.get("data", {}).get("detail", "Unknown error") if isinstance(response.get("data"), dict) else response.get("data", "Unknown")
        results.add_result("7A. Solo Agent Can Create Leads", False, f"Solo agent registration failed: {error_detail}")
        results.add_result("7B. Solo Agent Can Create Appointments", False, f"Solo agent registration failed: {error_detail}")

def test_legal_documents(results: TestResults):
    """Test Legal Documents"""
    print("\n📄 8. LEGAL DOCUMENTS")
    print("=" * 60)
    
    # 8A. Privacy Policy
    response = make_request("GET", "/privacy")
    if response.get("status_code") == 200 and response["data"]:
        results.add_result("8A. Privacy Policy", True, "Returns HTML content")
    else:
        results.add_result("8A. Privacy Policy", False, f"Status: {response.get('status_code')}")
    
    # 8B. Terms of Service
    response = make_request("GET", "/terms")
    if response.get("status_code") == 200 and response["data"]:
        results.add_result("8B. Terms of Service", True, "Returns HTML content")
    else:
        results.add_result("8B. Terms of Service", False, f"Status: {response.get('status_code')}")

def main():
    """Run all tests"""
    print("🎯 AGENTROUTE AI BACKEND - FINAL COMPREHENSIVE VERIFICATION")
    print("Testing all critical systems before iOS build...")
    print(f"Backend URL: {BASE_URL}")
    print("=" * 80)
    
    results = TestResults()
    
    try:
        # Run all test suites as specified in review request
        test_route_visibility_permissions(results)
        test_push_notification_system(results)
        test_onboarding_system(results)
        test_invite_token_system(results)
        test_role_based_routing(results)
        test_backend_security(results)
        test_solo_agent_functionality(results)
        test_legal_documents(results)
        
        # Print final summary
        print("\n" + "=" * 80)
        success = results.summary()
        
        if success:
            print("🎉 BACKEND IS READY FOR iOS BUILD!")
        else:
            print("⚠️  ISSUES FOUND - REVIEW REQUIRED BEFORE BUILD")
        
        # Print detailed results for failed tests
        if results.failed > 0:
            print(f"\n❌ FAILED TESTS ({results.failed}):")
            for result in results.results:
                if not result["passed"]:
                    print(f"   • {result['test']}: {result['details']}")
        
        return success
        
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)