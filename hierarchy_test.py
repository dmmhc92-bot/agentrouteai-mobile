#!/usr/bin/env python3
"""
Role-Based User Hierarchy System Testing for AgentRoute AI
Focus: Testing the new Role-Based User Hierarchy endpoints comprehensively
"""

import requests
import json
import sys
import os
from datetime import datetime

# Get backend URL from frontend .env
BACKEND_URL = "https://agentrouteai-1.preview.emergentagent.com/api"

# Test credentials from review request
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class HierarchyTestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []
    
    def add_result(self, test_name, success, details=""):
        self.results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
        if success:
            self.passed += 1
            print(f"✅ {test_name}")
        else:
            self.failed += 1
            print(f"❌ {test_name}: {details}")
    
    def summary(self):
        total = self.passed + self.failed
        success_rate = (self.passed / total * 100) if total > 0 else 0
        print(f"\n📊 ROLE-BASED HIERARCHY TEST SUMMARY")
        print(f"Total Tests: {total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Success Rate: {success_rate:.1f}%")
        return success_rate >= 90

def make_request(method, endpoint, headers=None, json_data=None, params=None):
    """Make HTTP request with error handling"""
    try:
        url = f"{BACKEND_URL}{endpoint}"
        response = requests.request(method, url, headers=headers, json=json_data, params=params, timeout=30)
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None

def login_user(email, password):
    """Login and return auth token"""
    response = make_request("POST", "/auth/login", json_data={"email": email, "password": password})
    if response and response.status_code == 200:
        data = response.json()
        return data.get("access_token"), data.get("user")
    return None, None

def get_auth_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def test_role_based_hierarchy_system():
    """Test the comprehensive Role-Based User Hierarchy system"""
    results = HierarchyTestResults()
    
    print("🎯 TESTING ROLE-BASED USER HIERARCHY SYSTEM")
    print("=" * 60)
    
    # Store tokens and user data
    tokens = {}
    users = {}
    
    # 1. EXISTING AUTH VERIFICATION
    print("\n1️⃣ EXISTING AUTH VERIFICATION")
    
    # Test admin login
    admin_token, admin_user = login_user(TEST_CREDENTIALS["admin"]["email"], TEST_CREDENTIALS["admin"]["password"])
    if admin_token and admin_user:
        tokens["admin"] = admin_token
        users["admin"] = admin_user
        results.add_result("Admin Login", True, f"Admin user {admin_user['email']} logged in successfully")
    else:
        results.add_result("Admin Login", False, "Failed to login as admin")
        return results
    
    # Test agent login
    agent_token, agent_user = login_user(TEST_CREDENTIALS["agent"]["email"], TEST_CREDENTIALS["agent"]["password"])
    if agent_token and agent_user:
        tokens["agent"] = agent_token
        users["agent"] = agent_user
        results.add_result("Agent Login", True, f"Agent user {agent_user['email']} logged in successfully")
    else:
        results.add_result("Agent Login", False, "Failed to login as agent")
    
    # Test /auth/me with new fields
    response = make_request("GET", "/auth/me", headers=get_auth_headers(admin_token))
    if response and response.status_code == 200:
        user_data = response.json()
        has_new_fields = all(field in user_data for field in ["admin_id", "organization_id", "approval_status"])
        results.add_result("Auth Me New Fields", has_new_fields, 
                         f"New hierarchy fields present: {has_new_fields}")
    else:
        results.add_result("Auth Me New Fields", False, f"Failed to get user info: {response.status_code if response else 'No response'}")
    
    # 2. USER MANAGEMENT ENDPOINTS (as Admin)
    print("\n2️⃣ USER MANAGEMENT ENDPOINTS (Admin)")
    
    # GET /api/users - should return all users in organization
    response = make_request("GET", "/users", headers=get_auth_headers(admin_token))
    if response and response.status_code == 200:
        users_list = response.json()
        results.add_result("Get Users List", True, f"Retrieved {len(users_list)} users")
    else:
        results.add_result("Get Users List", False, f"Failed: {response.status_code if response else 'No response'}")
    
    # GET /api/users/pending-approval - should return pending users
    response = make_request("GET", "/users/pending-approval", headers=get_auth_headers(admin_token))
    if response and response.status_code == 200:
        pending_users = response.json()
        results.add_result("Get Pending Users", True, f"Retrieved {len(pending_users)} pending users")
    else:
        results.add_result("Get Pending Users", False, f"Failed: {response.status_code if response else 'No response'}")
    
    # 3. INVITATION FLOW
    print("\n3️⃣ INVITATION FLOW")
    
    # POST /api/invitations - Create manager invitation
    invite_data = {
        "email": "testmanager@test.com",
        "role": "manager",
        "name": "Test Manager"
    }
    response = make_request("POST", "/invitations", headers=get_auth_headers(admin_token), json_data=invite_data)
    invitation_id = None
    invitation_token = None
    
    if response and response.status_code == 200:
        invitation = response.json()
        invitation_id = invitation.get("id")
        results.add_result("Create Manager Invitation", True, f"Created invitation for {invite_data['email']}")
    else:
        results.add_result("Create Manager Invitation", False, 
                         f"Failed: {response.status_code if response else 'No response'}")
    
    # GET /api/invitations - List invitations
    response = make_request("GET", "/invitations", headers=get_auth_headers(admin_token))
    if response and response.status_code == 200:
        invitations = response.json()
        results.add_result("List Invitations", True, f"Retrieved {len(invitations)} invitations")
        
        # Find our test invitation and get token
        for inv in invitations:
            if inv.get("email") == "testmanager@test.com":
                invitation_token = inv.get("token")
                break
    else:
        results.add_result("List Invitations", False, f"Failed: {response.status_code if response else 'No response'}")
    
    # GET /api/invitations/validate/{token} - Validate invitation token
    if invitation_token:
        response = make_request("GET", f"/invitations/validate/{invitation_token}")
        if response and response.status_code == 200:
            validation_data = response.json()
            is_valid = validation_data.get("valid", False)
            results.add_result("Validate Invitation Token", is_valid, 
                             f"Token validation: {is_valid}")
        else:
            results.add_result("Validate Invitation Token", False, 
                             f"Failed: {response.status_code if response else 'No response'}")
    else:
        results.add_result("Validate Invitation Token", False, "No invitation token available")
    
    # 4. USER ROLE UPDATES (as Admin)
    print("\n4️⃣ USER ROLE UPDATES (Admin)")
    
    if agent_user and admin_user:
        agent_user_id = agent_user.get("id")
        admin_user_id = admin_user.get("id")
        
        # Don't try to update admin's own role - use agent user instead
        if agent_user_id != admin_user_id:
            # PUT /api/users/{agent_user_id}/role - Promote agent to manager
            role_update = {"role": "manager"}
            response = make_request("PUT", f"/users/{agent_user_id}/role", 
                                  headers=get_auth_headers(admin_token), json_data=role_update)
            if response and response.status_code == 200:
                results.add_result("Promote Agent to Manager", True, "Successfully promoted agent to manager")
            else:
                error_msg = response.text if response else 'No response'
                results.add_result("Promote Agent to Manager", False, 
                                 f"Failed: {response.status_code if response else 'No response'} - {error_msg}")
            
            # PUT /api/users/{agent_user_id}/role - Demote back to agent
            role_update = {"role": "agent"}
            response = make_request("PUT", f"/users/{agent_user_id}/role", 
                                  headers=get_auth_headers(admin_token), json_data=role_update)
            if response and response.status_code == 200:
                results.add_result("Demote Manager to Agent", True, "Successfully demoted manager back to agent")
            else:
                error_msg = response.text if response else 'No response'
                results.add_result("Demote Manager to Agent", False, 
                                 f"Failed: {response.status_code if response else 'No response'} - {error_msg}")
        else:
            results.add_result("Promote Agent to Manager", False, "Cannot test - agent and admin are same user")
            results.add_result("Demote Manager to Agent", False, "Cannot test - agent and admin are same user")
    
    # 5. USER STATUS UPDATES (as Admin)
    print("\n5️⃣ USER STATUS UPDATES (Admin)")
    
    if agent_user and admin_user:
        agent_user_id = agent_user.get("id")
        admin_user_id = admin_user.get("id")
        
        # Don't try to update admin's own status - use agent user instead
        if agent_user_id != admin_user_id:
            # PUT /api/users/{agent_user_id}/status - Deactivate user
            status_update = {"is_active": False}
            response = make_request("PUT", f"/users/{agent_user_id}/status", 
                                  headers=get_auth_headers(admin_token), json_data=status_update)
            if response and response.status_code == 200:
                results.add_result("Deactivate User", True, "Successfully deactivated user")
            else:
                error_msg = response.text if response else 'No response'
                results.add_result("Deactivate User", False, 
                                 f"Failed: {response.status_code if response else 'No response'} - {error_msg}")
            
            # PUT /api/users/{agent_user_id}/status - Reactivate user
            status_update = {"is_active": True}
            response = make_request("PUT", f"/users/{agent_user_id}/status", 
                                  headers=get_auth_headers(admin_token), json_data=status_update)
            if response and response.status_code == 200:
                results.add_result("Reactivate User", True, "Successfully reactivated user")
            else:
                error_msg = response.text if response else 'No response'
                results.add_result("Reactivate User", False, 
                                 f"Failed: {response.status_code if response else 'No response'} - {error_msg}")
        else:
            results.add_result("Deactivate User", False, "Cannot test - agent and admin are same user")
            results.add_result("Reactivate User", False, "Cannot test - agent and admin are same user")
    
    # 6. PERMISSION ENFORCEMENT
    print("\n6️⃣ PERMISSION ENFORCEMENT")
    
    if agent_token:
        # As Agent: Try POST /api/invitations - should fail with 403
        invite_data = {"email": "test@test.com", "role": "agent"}
        response = make_request("POST", "/invitations", headers=get_auth_headers(agent_token), json_data=invite_data)
        if response and response.status_code == 403:
            results.add_result("Agent Cannot Invite (403)", True, "Agent correctly denied invitation permission")
        else:
            results.add_result("Agent Cannot Invite (403)", False, 
                             f"Expected 403, got: {response.status_code if response else 'No response'}")
    
    # Test manager login for permission tests
    manager_token, manager_user = login_user(TEST_CREDENTIALS["manager"]["email"], TEST_CREDENTIALS["manager"]["password"])
    if manager_token:
        # As Manager: Try POST /api/invitations with role "manager" - should fail with 403
        invite_data = {"email": "test2@test.com", "role": "manager"}
        response = make_request("POST", "/invitations", headers=get_auth_headers(manager_token), json_data=invite_data)
        if response and response.status_code == 403:
            results.add_result("Manager Cannot Invite Manager (403)", True, "Manager correctly denied manager invitation")
        else:
            results.add_result("Manager Cannot Invite Manager (403)", False, 
                             f"Expected 403, got: {response.status_code if response else 'No response'}")
        
        # As Manager: Try POST /api/invitations with role "agent" - should succeed
        invite_data = {"email": "testagent@test.com", "role": "agent"}
        response = make_request("POST", "/invitations", headers=get_auth_headers(manager_token), json_data=invite_data)
        if response and response.status_code == 200:
            results.add_result("Manager Can Invite Agent (200)", True, "Manager successfully invited agent")
        else:
            results.add_result("Manager Can Invite Agent (200)", False, 
                             f"Expected 200, got: {response.status_code if response else 'No response'}")
    
    # 7. HIERARCHY MIGRATION
    print("\n7️⃣ HIERARCHY MIGRATION")
    
    # POST /api/admin/migrate-hierarchy as admin
    response = make_request("POST", "/admin/migrate-hierarchy", headers=get_auth_headers(admin_token))
    if response and response.status_code == 200:
        migration_data = response.json()
        results.add_result("Hierarchy Migration", True, 
                         f"Migration completed: {migration_data.get('users_migrated', 0)} users migrated")
    else:
        results.add_result("Hierarchy Migration", False, 
                         f"Failed: {response.status_code if response else 'No response'}")
    
    # 8. INVITATION CANCEL/RESEND
    print("\n8️⃣ INVITATION CANCEL/RESEND")
    
    if invitation_id:
        # POST /api/invitations/{invite_id}/resend
        response = make_request("POST", f"/invitations/{invitation_id}/resend", 
                              headers=get_auth_headers(admin_token))
        if response and response.status_code == 200:
            results.add_result("Resend Invitation", True, "Successfully resent invitation")
        else:
            results.add_result("Resend Invitation", False, 
                             f"Failed: {response.status_code if response else 'No response'}")
        
        # DELETE /api/invitations/{invite_id}
        response = make_request("DELETE", f"/invitations/{invitation_id}", 
                              headers=get_auth_headers(admin_token))
        if response and response.status_code == 200:
            results.add_result("Cancel Invitation", True, "Successfully cancelled invitation")
        else:
            results.add_result("Cancel Invitation", False, 
                             f"Failed: {response.status_code if response else 'No response'}")
    
    # 9. VERIFY EXISTING FEATURES STILL WORK
    print("\n9️⃣ VERIFY EXISTING FEATURES STILL WORK")
    
    # POST /api/leads - Create a new lead
    lead_data = {
        "name": "Test Lead for Hierarchy",
        "phone": "555-123-4567",
        "email": "testlead@test.com",
        "address": "123 Test St, Test City, TS 12345",
        "notes": "Test lead for hierarchy system verification"
    }
    response = make_request("POST", "/leads", headers=get_auth_headers(admin_token), json_data=lead_data)
    if response and response.status_code == 200:
        lead = response.json()
        results.add_result("Create Lead Still Works", True, f"Created lead: {lead.get('name')}")
        
        # GET /api/leads - Verify leads retrieval
        response = make_request("GET", "/leads", headers=get_auth_headers(admin_token))
        if response and response.status_code == 200:
            leads = response.json()
            results.add_result("Get Leads Still Works", True, f"Retrieved {len(leads)} leads")
        else:
            results.add_result("Get Leads Still Works", False, 
                             f"Failed: {response.status_code if response else 'No response'}")
    else:
        results.add_result("Create Lead Still Works", False, 
                         f"Failed: {response.status_code if response else 'No response'}")
    
    return results

def main():
    """Main test execution"""
    print("🚀 AGENTROUTE AI - ROLE-BASED USER HIERARCHY TESTING")
    print("=" * 70)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().isoformat()}")
    print()
    
    # Run comprehensive hierarchy system tests
    results = test_role_based_hierarchy_system()
    
    # Print summary
    results.summary()
    
    # Return exit code based on results
    return 0 if results.passed > 0 and results.failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())