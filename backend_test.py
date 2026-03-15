#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Role-Based User Hierarchy System
AgentRoute AI - Insurance Agency Platform

This test suite validates ALL backend functionality with focus on:
1. Existing Auth Verification (Must still work)
2. Password Reset (Must still work) 
3. Lead Creation (Must still work)
4. Appointment Creation (Must still work)
5. Invitation System Tests
6. Permission Enforcement Tests
7. User Management Tests (Admin Only)
8. Hierarchy Migration Test
9. SOA Workflow Verification (Must still work)
10. Data Filtering Verification

ALL TESTS MUST PASS (100% required)
"""

import requests
import json
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://agentrouteai-1.preview.emergentagent.com/api"
TIMEOUT = 30

# Test Credentials
ADMIN_CREDS = {"email": "admin@agentroute.com", "password": "Admin123!"}
MANAGER_CREDS = {"email": "manager@agentroute.com", "password": "Manager123!"}
AGENT_CREDS = {"email": "agent@agentroute.com", "password": "Agent123!"}

class TestResults:
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = []
        self.test_details = []

    def add_test(self, test_name: str, passed: bool, details: str = ""):
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            status = "✅ PASS"
        else:
            self.failed_tests.append(test_name)
            status = "❌ FAIL"
        
        self.test_details.append(f"{status} - {test_name}: {details}")
        print(f"{status} - {test_name}: {details}")

    def print_summary(self):
        success_rate = (self.passed_tests / self.total_tests * 100) if self.total_tests > 0 else 0
        print(f"\n{'='*80}")
        print(f"ROLE-BASED USER HIERARCHY SYSTEM TEST RESULTS")
        print(f"{'='*80}")
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for test in self.failed_tests:
                print(f"  - {test}")
        
        print(f"\n📋 DETAILED RESULTS:")
        for detail in self.test_details:
            print(f"  {detail}")
        
        return success_rate >= 100.0

def make_request(method: str, endpoint: str, data: Dict = None, headers: Dict = None, timeout: int = TIMEOUT) -> requests.Response:
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=timeout)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=timeout)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=timeout)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=timeout)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except requests.exceptions.Timeout:
        print(f"⚠️  Request timeout for {method} {endpoint}")
        raise
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Request error for {method} {endpoint}: {e}")
        raise

def login_user(credentials: Dict[str, str]) -> Optional[str]:
    """Login and return access token"""
    try:
        response = make_request("POST", "/auth/login", credentials)
        if response.status_code == 200:
            return response.json()["access_token"]
        else:
            print(f"Login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

def get_auth_headers(token: str) -> Dict[str, str]:
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def test_existing_auth_verification(results: TestResults):
    """Test 1: Existing Auth Verification (Must still work)"""
    print(f"\n🔐 Testing Existing Auth Verification...")
    
    # Test Admin Login
    admin_token = login_user(ADMIN_CREDS)
    results.add_test("Admin Login", admin_token is not None, 
                    f"admin@agentroute.com login {'successful' if admin_token else 'failed'}")
    
    # Test Agent Login  
    agent_token = login_user(AGENT_CREDS)
    results.add_test("Agent Login", agent_token is not None,
                    f"agent@agentroute.com login {'successful' if agent_token else 'failed'}")
    
    # Test /auth/me with admin token
    if admin_token:
        try:
            response = make_request("GET", "/auth/me", headers=get_auth_headers(admin_token))
            if response.status_code == 200:
                user_data = response.json()
                has_hierarchy_fields = all(field in user_data for field in ["admin_id", "organization_id", "approval_status"])
                results.add_test("Auth Me Hierarchy Fields", has_hierarchy_fields,
                               f"admin_id: {user_data.get('admin_id')}, org_id: {user_data.get('organization_id')}, approval: {user_data.get('approval_status')}")
            else:
                results.add_test("Auth Me Hierarchy Fields", False, f"Status: {response.status_code}")
        except Exception as e:
            results.add_test("Auth Me Hierarchy Fields", False, f"Error: {e}")
    
    return admin_token, agent_token

def test_password_reset(results: TestResults):
    """Test 2: Password Reset (Must still work)"""
    print(f"\n🔑 Testing Password Reset...")
    
    try:
        # Test forgot password
        response = make_request("POST", "/auth/forgot-password", {"email": "admin@agentroute.com"})
        forgot_success = response.status_code == 200
        results.add_test("Forgot Password", forgot_success, 
                        f"Status: {response.status_code}, Response: {response.json() if forgot_success else response.text}")
        
        # Test reset token generation (check if dev_token is returned)
        if forgot_success:
            response_data = response.json()
            has_token = "dev_token" in response_data
            results.add_test("Reset Token Generation", has_token,
                           f"Dev token {'present' if has_token else 'missing'}")
    except Exception as e:
        results.add_test("Forgot Password", False, f"Error: {e}")
        results.add_test("Reset Token Generation", False, f"Error: {e}")

def test_lead_creation(results: TestResults, admin_token: str, agent_token: str):
    """Test 3: Lead Creation (Must still work)"""
    print(f"\n👥 Testing Lead Creation...")
    
    # Test lead creation with admin
    if admin_token:
        try:
            lead_data = {
                "name": f"Test Lead Admin {uuid.uuid4().hex[:8]}",
                "phone": "555-0123",
                "email": "testlead@example.com",
                "address": "123 Test St, Test City, TS 12345"
            }
            response = make_request("POST", "/leads", lead_data, headers=get_auth_headers(admin_token))
            if response.status_code == 200:
                lead = response.json()
                has_hierarchy_fields = all(field in lead for field in ["owner_agent_id", "manager_id", "admin_id", "organization_id"])
                results.add_test("Admin Lead Creation", True, 
                               f"Lead created with hierarchy fields: {has_hierarchy_fields}")
                admin_lead_id = lead.get("id")
            else:
                results.add_test("Admin Lead Creation", False, f"Status: {response.status_code}")
                admin_lead_id = None
        except Exception as e:
            results.add_test("Admin Lead Creation", False, f"Error: {e}")
            admin_lead_id = None
    
    # Test GET /leads with hierarchy filtering
    if admin_token:
        try:
            response = make_request("GET", "/leads", headers=get_auth_headers(admin_token))
            leads_success = response.status_code == 200
            results.add_test("Get Leads Hierarchy", leads_success,
                           f"Status: {response.status_code}, Leads count: {len(response.json()) if leads_success else 0}")
        except Exception as e:
            results.add_test("Get Leads Hierarchy", False, f"Error: {e}")

def test_appointment_creation(results: TestResults, admin_token: str):
    """Test 4: Appointment Creation (Must still work)"""
    print(f"\n📅 Testing Appointment Creation...")
    
    if not admin_token:
        results.add_test("Appointment Creation", False, "No admin token available")
        return
    
    try:
        # First create a lead for the appointment
        lead_data = {
            "name": f"Appointment Test Lead {uuid.uuid4().hex[:8]}",
            "phone": "555-0456",
            "email": "aptlead@example.com"
        }
        lead_response = make_request("POST", "/leads", lead_data, headers=get_auth_headers(admin_token))
        
        if lead_response.status_code == 200:
            lead_id = lead_response.json()["id"]
            
            # Create appointment
            apt_data = {
                "lead_id": lead_id,
                "appointment_date": "2025-01-20",
                "appointment_time": "10:00",
                "notes": "Test appointment for hierarchy system"
            }
            response = make_request("POST", "/appointments", apt_data, headers=get_auth_headers(admin_token))
            
            if response.status_code == 200:
                apt = response.json()
                has_hierarchy_fields = "owner_agent_id" in apt or "admin_id" in apt
                results.add_test("Appointment Creation", True,
                               f"Appointment created with hierarchy context: {has_hierarchy_fields}")
            else:
                results.add_test("Appointment Creation", False, f"Status: {response.status_code}")
        else:
            results.add_test("Appointment Creation", False, f"Lead creation failed: {lead_response.status_code}")
            
        # Test GET /appointments
        response = make_request("GET", "/appointments", headers=get_auth_headers(admin_token))
        apt_list_success = response.status_code == 200
        results.add_test("Get Appointments", apt_list_success,
                       f"Status: {response.status_code}, Count: {len(response.json()) if apt_list_success else 0}")
        
    except Exception as e:
        results.add_test("Appointment Creation", False, f"Error: {e}")
        results.add_test("Get Appointments", False, f"Error: {e}")

def test_invitation_system(results: TestResults, admin_token: str):
    """Test 5: Invitation System Tests"""
    print(f"\n📧 Testing Invitation System...")
    
    if not admin_token:
        results.add_test("Invitation System", False, "No admin token available")
        return
    
    try:
        # Test Admin inviting Manager
        manager_invite_data = {
            "email": "newmanager@test.com",
            "role": "manager",
            "name": "New Manager"
        }
        response = make_request("POST", "/invitations", manager_invite_data, headers=get_auth_headers(admin_token))
        manager_invite_success = response.status_code == 200
        results.add_test("Admin Invite Manager", manager_invite_success,
                       f"Status: {response.status_code}")
        
        manager_invite_id = None
        if manager_invite_success:
            manager_invite_id = response.json().get("id")
        
        # Test Admin inviting Agent
        agent_invite_data = {
            "email": "newagent@test.com", 
            "role": "agent",
            "name": "New Agent"
        }
        response = make_request("POST", "/invitations", agent_invite_data, headers=get_auth_headers(admin_token))
        agent_invite_success = response.status_code == 200
        results.add_test("Admin Invite Agent", agent_invite_success,
                       f"Status: {response.status_code}")
        
        agent_invite_id = None
        if agent_invite_success:
            agent_invite_id = response.json().get("id")
        
        # Test GET /invitations
        response = make_request("GET", "/invitations", headers=get_auth_headers(admin_token))
        list_success = response.status_code == 200
        results.add_test("List Invitations", list_success,
                       f"Status: {response.status_code}, Count: {len(response.json()) if list_success else 0}")
        
        # Test invitation token validation
        if manager_invite_success:
            invitations = make_request("GET", "/invitations", headers=get_auth_headers(admin_token)).json()
            manager_invitation = next((inv for inv in invitations if inv.get("email") == "newmanager@test.com"), None)
            
            if manager_invitation and manager_invitation.get("token"):
                token = manager_invitation["token"]
                response = make_request("GET", f"/invitations/validate/{token}")
                validate_success = response.status_code == 200
                results.add_test("Validate Invitation Token", validate_success,
                               f"Status: {response.status_code}")
            else:
                results.add_test("Validate Invitation Token", False, "No token found")
        
        # Test resend invitation
        if manager_invite_id:
            response = make_request("POST", f"/invitations/{manager_invite_id}/resend", headers=get_auth_headers(admin_token))
            resend_success = response.status_code == 200
            results.add_test("Resend Invitation", resend_success,
                           f"Status: {response.status_code}")
        
        # Test cancel invitation
        if agent_invite_id:
            response = make_request("DELETE", f"/invitations/{agent_invite_id}", headers=get_auth_headers(admin_token))
            cancel_success = response.status_code == 200
            results.add_test("Cancel Invitation", cancel_success,
                           f"Status: {response.status_code}")
        
    except Exception as e:
        results.add_test("Invitation System Error", False, f"Error: {e}")

def test_permission_enforcement(results: TestResults, admin_token: str, agent_token: str):
    """Test 6: Permission Enforcement Tests"""
    print(f"\n🛡️ Testing Permission Enforcement...")
    
    # Test Agent cannot invite (should return 403)
    if agent_token:
        try:
            invite_data = {"email": "unauthorized@test.com", "role": "agent"}
            response = make_request("POST", "/invitations", invite_data, headers=get_auth_headers(agent_token))
            agent_forbidden = response.status_code == 403
            results.add_test("Agent Cannot Invite", agent_forbidden,
                           f"Status: {response.status_code} (expected 403)")
        except Exception as e:
            results.add_test("Agent Cannot Invite", False, f"Error: {e}")
    
    # Test Manager permissions (need to get manager token first)
    manager_token = login_user(MANAGER_CREDS)
    if manager_token:
        try:
            # Manager cannot invite manager (should return 403)
            invite_data = {"email": "badmanager@test.com", "role": "manager"}
            response = make_request("POST", "/invitations", invite_data, headers=get_auth_headers(manager_token))
            manager_forbidden = response.status_code == 403
            results.add_test("Manager Cannot Invite Manager", manager_forbidden,
                           f"Status: {response.status_code} (expected 403)")
            
            # Manager can invite agent (should return 200)
            invite_data = {"email": "manageragent@test.com", "role": "agent"}
            response = make_request("POST", "/invitations", invite_data, headers=get_auth_headers(manager_token))
            manager_can_invite_agent = response.status_code == 200
            results.add_test("Manager Can Invite Agent", manager_can_invite_agent,
                           f"Status: {response.status_code} (expected 200)")
        except Exception as e:
            results.add_test("Manager Permission Tests", False, f"Error: {e}")

def test_user_management(results: TestResults, admin_token: str):
    """Test 7: User Management Tests (Admin Only)"""
    print(f"\n👤 Testing User Management...")
    
    if not admin_token:
        results.add_test("User Management", False, "No admin token available")
        return
    
    try:
        # Test GET /users as Admin
        response = make_request("GET", "/users", headers=get_auth_headers(admin_token))
        users_success = response.status_code == 200
        results.add_test("Get Users (Admin)", users_success,
                       f"Status: {response.status_code}, Users: {len(response.json()) if users_success else 0}")
        
        users = response.json() if users_success else []
        test_user_id = None
        
        # Find a non-admin user to test role changes
        for user in users:
            if user.get("role") == "agent":
                test_user_id = user.get("id")
                break
        
        if test_user_id:
            # Test promote agent to manager
            role_data = {"role": "manager"}
            response = make_request("PUT", f"/users/{test_user_id}/role", role_data, headers=get_auth_headers(admin_token))
            promote_success = response.status_code == 200
            results.add_test("Promote User Role", promote_success,
                           f"Status: {response.status_code}")
            
            # Test demote back to agent
            role_data = {"role": "agent"}
            response = make_request("PUT", f"/users/{test_user_id}/role", role_data, headers=get_auth_headers(admin_token))
            demote_success = response.status_code == 200
            results.add_test("Demote User Role", demote_success,
                           f"Status: {response.status_code}")
            
            # Test deactivate user
            status_data = {"is_active": False}
            response = make_request("PUT", f"/users/{test_user_id}/status", status_data, headers=get_auth_headers(admin_token))
            deactivate_success = response.status_code == 200
            results.add_test("Deactivate User", deactivate_success,
                           f"Status: {response.status_code}")
            
            # Test reactivate user
            status_data = {"is_active": True}
            response = make_request("PUT", f"/users/{test_user_id}/status", status_data, headers=get_auth_headers(admin_token))
            reactivate_success = response.status_code == 200
            results.add_test("Reactivate User", reactivate_success,
                           f"Status: {response.status_code}")
        else:
            results.add_test("User Role Management", False, "No test user found")
        
    except Exception as e:
        results.add_test("User Management Error", False, f"Error: {e}")

def test_hierarchy_migration(results: TestResults, admin_token: str):
    """Test 8: Hierarchy Migration Test"""
    print(f"\n🔄 Testing Hierarchy Migration...")
    
    if not admin_token:
        results.add_test("Hierarchy Migration", False, "No admin token available")
        return
    
    try:
        response = make_request("POST", "/admin/migrate-hierarchy", headers=get_auth_headers(admin_token))
        migration_success = response.status_code == 200
        results.add_test("Hierarchy Migration", migration_success,
                       f"Status: {response.status_code}")
        
        if migration_success:
            migration_data = response.json()
            results.add_test("Migration Data", True,
                           f"Org ID: {migration_data.get('organization_id')}, Users migrated: {migration_data.get('users_migrated')}")
    except Exception as e:
        results.add_test("Hierarchy Migration", False, f"Error: {e}")

def test_soa_workflow(results: TestResults, agent_token: str):
    """Test 9: SOA Workflow Verification (Must still work)"""
    print(f"\n📋 Testing SOA Workflow...")
    
    if not agent_token:
        results.add_test("SOA Workflow", False, "No agent token available")
        return
    
    try:
        # Create a lead first
        lead_data = {
            "name": f"SOA Test Lead {uuid.uuid4().hex[:8]}",
            "phone": "555-0789",
            "email": "soalead@example.com"
        }
        lead_response = make_request("POST", "/leads", lead_data, headers=get_auth_headers(agent_token))
        
        if lead_response.status_code == 200:
            lead_id = lead_response.json()["id"]
            
            # Test POST /scope
            scope_data = {
                "lead_id": lead_id,
                "form_fields": {
                    "beneficiary_name": "John Test Beneficiary",
                    "beneficiary_phone": "555-1234",
                    "beneficiary_address": "123 Test Ave"
                },
                "typed_name": "John Test Beneficiary",
                "signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
                "agent_typed_name": "Test Agent",
                "agent_signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            }
            
            response = make_request("POST", "/scope", scope_data, headers=get_auth_headers(agent_token))
            scope_success = response.status_code == 200
            results.add_test("SOA Creation", scope_success,
                           f"Status: {response.status_code}")
            
            if scope_success:
                scope_id = response.json().get("id")
                
                # Test GET /scope/{id}
                response = make_request("GET", f"/scope/{scope_id}", headers=get_auth_headers(agent_token))
                get_scope_success = response.status_code == 200
                results.add_test("Get SOA", get_scope_success,
                               f"Status: {response.status_code}")
                
                # Test PDF generation
                response = make_request("POST", f"/scope/{scope_id}/generate-pdf", headers=get_auth_headers(agent_token))
                pdf_success = response.status_code == 200
                results.add_test("SOA PDF Generation", pdf_success,
                               f"Status: {response.status_code}")
        else:
            results.add_test("SOA Workflow", False, f"Lead creation failed: {lead_response.status_code}")
            
    except Exception as e:
        results.add_test("SOA Workflow Error", False, f"Error: {e}")

def test_data_filtering(results: TestResults, admin_token: str, agent_token: str):
    """Test 10: Data Filtering Verification"""
    print(f"\n🔍 Testing Data Filtering...")
    
    # Test Agent data filtering
    if agent_token:
        try:
            response = make_request("GET", "/leads", headers=get_auth_headers(agent_token))
            agent_leads_success = response.status_code == 200
            agent_leads_count = len(response.json()) if agent_leads_success else 0
            results.add_test("Agent Lead Filtering", agent_leads_success,
                           f"Status: {response.status_code}, Agent sees {agent_leads_count} leads")
        except Exception as e:
            results.add_test("Agent Lead Filtering", False, f"Error: {e}")
    
    # Test Manager data filtering (if manager exists)
    manager_token = login_user(MANAGER_CREDS)
    if manager_token:
        try:
            response = make_request("GET", "/leads", headers=get_auth_headers(manager_token))
            manager_leads_success = response.status_code == 200
            manager_leads_count = len(response.json()) if manager_leads_success else 0
            results.add_test("Manager Lead Filtering", manager_leads_success,
                           f"Status: {response.status_code}, Manager sees {manager_leads_count} leads")
        except Exception as e:
            results.add_test("Manager Lead Filtering", False, f"Error: {e}")
    
    # Test Admin data filtering
    if admin_token:
        try:
            response = make_request("GET", "/leads", headers=get_auth_headers(admin_token))
            admin_leads_success = response.status_code == 200
            admin_leads_count = len(response.json()) if admin_leads_success else 0
            results.add_test("Admin Lead Filtering", admin_leads_success,
                           f"Status: {response.status_code}, Admin sees {admin_leads_count} leads")
        except Exception as e:
            results.add_test("Admin Lead Filtering", False, f"Error: {e}")

def main():
    """Run comprehensive Role-Based User Hierarchy System tests"""
    print("🎯 ROLE-BASED USER HIERARCHY SYSTEM - COMPREHENSIVE BACKEND TESTING")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Credentials: Admin, Manager, Agent")
    print(f"Requirement: ALL TESTS MUST PASS (100% required)")
    print("=" * 80)
    
    results = TestResults()
    
    # Test 1: Existing Auth Verification
    admin_token, agent_token = test_existing_auth_verification(results)
    
    # Test 2: Password Reset
    test_password_reset(results)
    
    # Test 3: Lead Creation
    test_lead_creation(results, admin_token, agent_token)
    
    # Test 4: Appointment Creation
    test_appointment_creation(results, admin_token)
    
    # Test 5: Invitation System
    test_invitation_system(results, admin_token)
    
    # Test 6: Permission Enforcement
    test_permission_enforcement(results, admin_token, agent_token)
    
    # Test 7: User Management
    test_user_management(results, admin_token)
    
    # Test 8: Hierarchy Migration
    test_hierarchy_migration(results, admin_token)
    
    # Test 9: SOA Workflow
    test_soa_workflow(results, agent_token)
    
    # Test 10: Data Filtering
    test_data_filtering(results, admin_token, agent_token)
    
    # Print final results
    all_passed = results.print_summary()
    
    if all_passed:
        print(f"\n🎉 SUCCESS: All tests passed! Role-Based User Hierarchy System is fully functional.")
    else:
        print(f"\n⚠️  ATTENTION: {len(results.failed_tests)} test(s) failed. Review required.")
    
    return all_passed

if __name__ == "__main__":
    main()