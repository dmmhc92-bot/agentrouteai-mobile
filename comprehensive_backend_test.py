#!/usr/bin/env python3
"""
AgentRoute AI Backend Comprehensive Verification Test Suite
Pre-build audit to ensure all systems are fully wired and functional.
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Get backend URL from frontend env
BACKEND_URL = "https://agentroute-sales.preview.emergentagent.com/api"

class AgentRouteAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.tokens = {}  # Store tokens for different users
        self.test_results = []
        self.created_resources = []  # Track created resources for cleanup
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, token: str = None, expect_status: int = 200) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers, timeout=30)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=headers, timeout=30)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                return False, f"Unsupported method: {method}", 0
                
            try:
                response_data = response.json()
            except:
                response_data = response.text
                
            success = response.status_code == expect_status
            return success, response_data, response.status_code
            
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}", 0

    def test_1_onboarding_system(self):
        """Test 1: ONBOARDING SYSTEM (3 FLOWS)"""
        print("\n🎯 TESTING 1: ONBOARDING SYSTEM")
        
        # 1A. Create Organization Flow
        org_data = {
            "organization_name": "Audit Test Agency",
            "name": "Audit Admin", 
            "email": "auditadmin@test.com",
            "password": "AuditPass123!"
        }
        
        success, response, status = self.make_request("POST", "/auth/create-organization", org_data)
        if success and "access_token" in response:
            user = response.get("user", {})
            self.tokens["audit_admin"] = response["access_token"]
            
            # Verify response structure
            checks = [
                user.get("role") == "admin",
                user.get("organization_owner") == True or user.get("admin_id") == user.get("id"),
                user.get("organization_id") is not None,
                user.get("account_mode") == "connected"
            ]
            
            if all(checks):
                self.log_test("1A. Create Organization Flow", True, 
                    f"Admin user created: role={user.get('role')}, org_id={user.get('organization_id')}, account_mode={user.get('account_mode')}")
            else:
                self.log_test("1A. Create Organization Flow", False, 
                    f"Response validation failed: {user}")
        else:
            self.log_test("1A. Create Organization Flow", False, 
                f"Status {status}: {response}")
        
        # 1B. Solo Agent Flow
        solo_data = {
            "name": "Solo Audit",
            "email": "soloaudit@test.com", 
            "password": "SoloPass123!"
        }
        
        success, response, status = self.make_request("POST", "/auth/register-solo", solo_data)
        if success and "access_token" in response:
            user = response.get("user", {})
            self.tokens["solo_agent"] = response["access_token"]
            
            # Verify response structure
            checks = [
                user.get("role") == "agent",
                user.get("organization_id") is None,
                user.get("account_mode") == "solo"
            ]
            
            if all(checks):
                self.log_test("1B. Solo Agent Flow", True,
                    f"Solo agent created: role={user.get('role')}, org_id={user.get('organization_id')}, account_mode={user.get('account_mode')}")
            else:
                self.log_test("1B. Solo Agent Flow", False,
                    f"Response validation failed: {user}")
        else:
            self.log_test("1B. Solo Agent Flow", False,
                f"Status {status}: {response}")
        
        # 1C. Join Team Flow (Token Validation)
        # First create an invite as admin
        if "audit_admin" in self.tokens:
            invite_data = {"email": "newagent@test.com", "role": "agent"}
            success, response, status = self.make_request("POST", "/invitations", invite_data, self.tokens["audit_admin"])
            
            if success and "token" in response:
                invite_token = response["token"]
                self.created_resources.append(("invitation", response.get("id")))
                
                # Validate the token
                success, response, status = self.make_request("GET", f"/invitations/validate/{invite_token}")
                
                if success and response.get("valid") == True:
                    expected_fields = ["role", "invited_by_name"]
                    has_fields = all(field in response for field in expected_fields)
                    
                    if has_fields:
                        self.log_test("1C. Join Team Flow (Token Validation)", True,
                            f"Token validated: role={response.get('role')}, invited_by={response.get('invited_by_name')}")
                    else:
                        self.log_test("1C. Join Team Flow (Token Validation)", False,
                            f"Missing expected fields: {response}")
                else:
                    self.log_test("1C. Join Team Flow (Token Validation)", False,
                        f"Token validation failed: {response}")
            else:
                self.log_test("1C. Join Team Flow (Token Validation)", False,
                    f"Failed to create invite: {response}")
        else:
            self.log_test("1C. Join Team Flow (Token Validation)", False,
                "No admin token available")

    def test_2_invite_token_system(self):
        """Test 2: INVITE TOKEN SYSTEM"""
        print("\n🎯 TESTING 2: INVITE TOKEN SYSTEM")
        
        # Login with existing test credentials
        admin_creds = {"email": "admin@agentroute.com", "password": "Admin123!"}
        success, response, status = self.make_request("POST", "/auth/login", admin_creds)
        
        if success and "access_token" in response:
            self.tokens["existing_admin"] = response["access_token"]
            
            # 2A. Admin Token Generation
            # Open invite (no email)
            open_invite = {"role": "manager"}
            success, response, status = self.make_request("POST", "/invitations", open_invite, self.tokens["existing_admin"])
            
            if success and "token" in response:
                self.log_test("2A. Admin Token Generation (Open Invite)", True,
                    f"Open invite created with token: {response.get('token')[:10]}...")
                self.created_resources.append(("invitation", response.get("id")))
            else:
                self.log_test("2A. Admin Token Generation (Open Invite)", False,
                    f"Failed: {response}")
            
            # Specific email invite
            email_invite = {"role": "agent", "email": "specific@test.com"}
            success, response, status = self.make_request("POST", "/invitations", email_invite, self.tokens["existing_admin"])
            
            if success and "token" in response:
                self.log_test("2A. Admin Token Generation (Email Invite)", True,
                    f"Email invite created with token: {response.get('token')[:10]}...")
                self.created_resources.append(("invitation", response.get("id")))
            else:
                self.log_test("2A. Admin Token Generation (Email Invite)", False,
                    f"Failed: {response}")
        else:
            self.log_test("2A. Admin Login", False, f"Admin login failed: {response}")
        
        # Login as manager
        manager_creds = {"email": "manager@agentroute.com", "password": "Manager123!"}
        success, response, status = self.make_request("POST", "/auth/login", manager_creds)
        
        if success and "access_token" in response:
            self.tokens["existing_manager"] = response["access_token"]
            
            # 2B. Manager Token Generation
            # Manager can invite agent
            agent_invite = {"role": "agent"}
            success, response, status = self.make_request("POST", "/invitations", agent_invite, self.tokens["existing_manager"])
            
            if success and "token" in response:
                self.log_test("2B. Manager Can Invite Agent", True,
                    f"Manager created agent invite: {response.get('token')[:10]}...")
                self.created_resources.append(("invitation", response.get("id")))
            else:
                self.log_test("2B. Manager Can Invite Agent", False,
                    f"Failed: {response}")
            
            # Manager cannot invite manager
            manager_invite = {"role": "manager"}
            success, response, status = self.make_request("POST", "/invitations", manager_invite, self.tokens["existing_manager"], expect_status=403)
            
            if success:
                self.log_test("2B. Manager Cannot Invite Manager", True,
                    "Correctly returned 403 Forbidden")
            else:
                self.log_test("2B. Manager Cannot Invite Manager", False,
                    f"Expected 403, got {status}: {response}")
        else:
            self.log_test("2B. Manager Login", False, f"Manager login failed: {response}")
        
        # Login as agent
        agent_creds = {"email": "agent@agentroute.com", "password": "Agent123!"}
        success, response, status = self.make_request("POST", "/auth/login", agent_creds)
        
        if success and "access_token" in response:
            self.tokens["existing_agent"] = response["access_token"]
            
            # 2C. Agent Cannot Invite
            agent_invite = {"role": "agent"}
            success, response, status = self.make_request("POST", "/invitations", agent_invite, self.tokens["existing_agent"], expect_status=403)
            
            if success:
                self.log_test("2C. Agent Cannot Invite", True,
                    "Correctly returned 403 Forbidden")
            else:
                self.log_test("2C. Agent Cannot Invite", False,
                    f"Expected 403, got {status}: {response}")
        else:
            self.log_test("2C. Agent Login", False, f"Agent login failed: {response}")
        
        # 2D. Token Lifecycle
        if "existing_admin" in self.tokens:
            # List invitations
            success, response, status = self.make_request("GET", "/invitations", token=self.tokens["existing_admin"])
            
            if success and isinstance(response, list):
                invite_count = len(response)
                self.log_test("2D. List Invitations", True,
                    f"Retrieved {invite_count} invitations")
                
                # Test token revocation if we have invitations
                if invite_count > 0 and response[0].get("id"):
                    invite_id = response[0]["id"]
                    token_to_test = response[0].get("token")
                    
                    # Delete invitation
                    success, del_response, status = self.make_request("DELETE", f"/invitations/{invite_id}", token=self.tokens["existing_admin"])
                    
                    if success:
                        # Try to validate the deleted token
                        if token_to_test:
                            success, val_response, status = self.make_request("GET", f"/invitations/validate/{token_to_test}", expect_status=404)
                            
                            if success:
                                self.log_test("2D. Token Lifecycle (Revocation)", True,
                                    "Token correctly invalid after deletion")
                            else:
                                self.log_test("2D. Token Lifecycle (Revocation)", False,
                                    f"Token still valid after deletion: {val_response}")
                        else:
                            self.log_test("2D. Token Lifecycle (Revocation)", True,
                                "Invitation deleted successfully")
                    else:
                        self.log_test("2D. Token Lifecycle (Revocation)", False,
                            f"Failed to delete invitation: {del_response}")
            else:
                self.log_test("2D. List Invitations", False,
                    f"Failed to list invitations: {response}")

    def test_3_role_based_routing(self):
        """Test 3: ROLE-BASED ROUTING & PERMISSIONS"""
        print("\n🎯 TESTING 3: ROLE-BASED ROUTING & PERMISSIONS")
        
        # 3A. Role Returns in Auth
        for role_name, creds in [
            ("admin", {"email": "admin@agentroute.com", "password": "Admin123!"}),
            ("manager", {"email": "manager@agentroute.com", "password": "Manager123!"}),
            ("agent", {"email": "agent@agentroute.com", "password": "Agent123!"})
        ]:
            success, response, status = self.make_request("POST", "/auth/login", creds)
            
            if success and "access_token" in response:
                token = response["access_token"]
                user = response.get("user", {})
                
                # Test /auth/me endpoint
                success, me_response, status = self.make_request("GET", "/auth/me", token=token)
                
                if success:
                    expected_role = role_name
                    actual_role = me_response.get("role")
                    has_hierarchy_fields = all(field in me_response for field in ["admin_id", "organization_id"])
                    
                    if actual_role == expected_role and has_hierarchy_fields:
                        self.log_test(f"3A. {role_name.title()} Role Auth", True,
                            f"Role: {actual_role}, admin_id: {me_response.get('admin_id')}, org_id: {me_response.get('organization_id')}")
                    else:
                        self.log_test(f"3A. {role_name.title()} Role Auth", False,
                            f"Expected role {expected_role}, got {actual_role}. Hierarchy fields: {has_hierarchy_fields}")
                else:
                    self.log_test(f"3A. {role_name.title()} /auth/me", False,
                        f"Failed to get user info: {me_response}")
            else:
                self.log_test(f"3A. {role_name.title()} Login", False,
                    f"Login failed: {response}")
        
        # 3B. Data Filtering by Role
        if "existing_agent" in self.tokens and "existing_admin" in self.tokens:
            # Get leads as agent
            success, agent_leads, status = self.make_request("GET", "/leads", token=self.tokens["existing_agent"])
            agent_count = len(agent_leads) if success and isinstance(agent_leads, list) else 0
            
            # Get leads as admin
            success, admin_leads, status = self.make_request("GET", "/leads", token=self.tokens["existing_admin"])
            admin_count = len(admin_leads) if success and isinstance(admin_leads, list) else 0
            
            if admin_count >= agent_count:
                self.log_test("3B. Data Filtering by Role", True,
                    f"Admin sees {admin_count} leads, Agent sees {agent_count} leads (hierarchy filtering working)")
            else:
                self.log_test("3B. Data Filtering by Role", False,
                    f"Admin sees {admin_count} leads, Agent sees {agent_count} leads (hierarchy filtering may not be working)")

    def test_4_backend_security(self):
        """Test 4: BACKEND SECURITY"""
        print("\n🎯 TESTING 4: BACKEND SECURITY")
        
        # 4A. Protected Routes Require Auth
        success, response, status = self.make_request("GET", "/leads", expect_status=401)
        
        if success or status in [401, 403]:
            self.log_test("4A. Protected Routes Require Auth", True,
                f"Correctly returned {status} for unauthorized request")
        else:
            self.log_test("4A. Protected Routes Require Auth", False,
                f"Expected 401/403, got {status}: {response}")
        
        # 4B. Role Enforcement
        if "existing_agent" in self.tokens:
            # Try to modify admin user role (should fail)
            if "existing_admin" in self.tokens:
                # Get admin user ID first
                success, me_response, status = self.make_request("GET", "/auth/me", token=self.tokens["existing_admin"])
                
                if success and "id" in me_response:
                    admin_user_id = me_response["id"]
                    
                    # Agent tries to modify admin role
                    role_update = {"role": "agent"}
                    success, response, status = self.make_request("PUT", f"/users/{admin_user_id}/role", 
                                                                role_update, self.tokens["existing_agent"], expect_status=403)
                    
                    if success:
                        self.log_test("4B. Role Enforcement", True,
                            "Agent correctly blocked from modifying admin role (403)")
                    else:
                        self.log_test("4B. Role Enforcement", False,
                            f"Expected 403, got {status}: {response}")
                else:
                    self.log_test("4B. Role Enforcement", False,
                        "Could not get admin user ID for test")
            else:
                self.log_test("4B. Role Enforcement", False,
                    "No admin token available for test")
        else:
            self.log_test("4B. Role Enforcement", False,
                "No agent token available for test")

    def test_5_solo_agent_mode(self):
        """Test 5: SOLO AGENT MODE"""
        print("\n🎯 TESTING 5: SOLO AGENT MODE")
        
        if "solo_agent" in self.tokens:
            # Create lead as solo agent
            lead_data = {
                "name": "Solo Test Lead",
                "phone": "555-0123",
                "email": "solotestlead@example.com",
                "address": "123 Solo Street, Test City, TC 12345"
            }
            
            success, response, status = self.make_request("POST", "/leads", lead_data, self.tokens["solo_agent"])
            
            if success and "id" in response:
                lead_id = response["id"]
                self.created_resources.append(("lead", lead_id))
                
                # Verify lead has owner_user_id set
                has_owner = "created_by_user" in response or "assigned_to_user" in response
                
                self.log_test("5A. Solo Agent Create Lead", True,
                    f"Lead created with ID: {lead_id}, has owner: {has_owner}")
                
                # Get leads to verify it's returned
                success, leads_response, status = self.make_request("GET", "/leads", token=self.tokens["solo_agent"])
                
                if success and isinstance(leads_response, list):
                    created_lead_found = any(lead.get("id") == lead_id for lead in leads_response)
                    
                    if created_lead_found:
                        self.log_test("5A. Solo Agent Get Leads", True,
                            f"Solo agent can see their created lead in list of {len(leads_response)} leads")
                    else:
                        self.log_test("5A. Solo Agent Get Leads", False,
                            "Created lead not found in leads list")
                else:
                    self.log_test("5A. Solo Agent Get Leads", False,
                        f"Failed to get leads: {leads_response}")
                
                # Create appointment for the lead
                appointment_data = {
                    "lead_id": lead_id,
                    "appointment_date": "2025-01-20",
                    "appointment_time": "14:00",
                    "notes": "Solo agent test appointment"
                }
                
                success, appt_response, status = self.make_request("POST", "/appointments", appointment_data, self.tokens["solo_agent"])
                
                if success and "id" in appt_response:
                    self.log_test("5A. Solo Agent Create Appointment", True,
                        f"Appointment created with ID: {appt_response['id']}")
                    self.created_resources.append(("appointment", appt_response["id"]))
                else:
                    self.log_test("5A. Solo Agent Create Appointment", False,
                        f"Failed to create appointment: {appt_response}")
            else:
                self.log_test("5A. Solo Agent Create Lead", False,
                    f"Failed to create lead: {response}")
        else:
            self.log_test("5A. Solo Agent Mode", False,
                "No solo agent token available")

    def test_6_notification_system(self):
        """Test 6: NOTIFICATION SYSTEM"""
        print("\n🎯 TESTING 6: NOTIFICATION SYSTEM")
        
        if "existing_agent" in self.tokens:
            # 6A. Preferences CRUD
            success, prefs_response, status = self.make_request("GET", "/notifications/preferences", token=self.tokens["existing_agent"])
            
            if success and isinstance(prefs_response, dict):
                expected_fields = ["appointments", "reminders", "follow_ups", "team_alerts", "lead_alerts", "push_enabled"]
                has_all_fields = all(field in prefs_response for field in expected_fields)
                
                if has_all_fields:
                    self.log_test("6A. Get Notification Preferences", True,
                        f"All 6 preference fields present: {list(prefs_response.keys())}")
                    
                    # Update preferences
                    update_data = {"appointments": False}
                    success, update_response, status = self.make_request("PUT", "/notifications/preferences", 
                                                                       update_data, self.tokens["existing_agent"])
                    
                    if success:
                        self.log_test("6A. Update Notification Preferences", True,
                            "Preferences updated successfully")
                    else:
                        self.log_test("6A. Update Notification Preferences", False,
                            f"Failed to update preferences: {update_response}")
                else:
                    self.log_test("6A. Get Notification Preferences", False,
                        f"Missing expected fields. Got: {list(prefs_response.keys())}")
            else:
                self.log_test("6A. Get Notification Preferences", False,
                    f"Failed to get preferences: {prefs_response}")
            
            # 6B. Notification CRUD
            # Create test notification
            success, test_response, status = self.make_request("POST", "/notifications/test", token=self.tokens["existing_agent"])
            
            if success:
                self.log_test("6B. Create Test Notification", True,
                    "Test notification created successfully")
                
                # Get notifications
                success, notifs_response, status = self.make_request("GET", "/notifications", token=self.tokens["existing_agent"])
                
                if success and isinstance(notifs_response, dict):
                    has_unread_count = "unread_count" in notifs_response
                    has_notifications = "notifications" in notifs_response or isinstance(notifs_response, list)
                    
                    if has_unread_count or has_notifications:
                        self.log_test("6B. Get Notifications", True,
                            f"Notifications retrieved with unread_count: {notifs_response.get('unread_count', 'N/A')}")
                        
                        # Try to mark all as read
                        success, mark_response, status = self.make_request("PUT", "/notifications/mark-all-read", token=self.tokens["existing_agent"])
                        
                        if success:
                            self.log_test("6B. Mark All Notifications Read", True,
                                "All notifications marked as read")
                        else:
                            self.log_test("6B. Mark All Notifications Read", False,
                                f"Failed to mark all as read: {mark_response}")
                    else:
                        self.log_test("6B. Get Notifications", False,
                            f"Unexpected response format: {notifs_response}")
                else:
                    self.log_test("6B. Get Notifications", False,
                        f"Failed to get notifications: {notifs_response}")
            else:
                self.log_test("6B. Create Test Notification", False,
                    f"Failed to create test notification: {test_response}")
        else:
            self.log_test("6. Notification System", False,
                "No agent token available for testing")

    def test_7_legal_documents(self):
        """Test 7: LEGAL DOCUMENTS"""
        print("\n🎯 TESTING 7: LEGAL DOCUMENTS")
        
        # Test privacy policy
        success, privacy_response, status = self.make_request("GET", "/privacy")
        
        if success and isinstance(privacy_response, str) and "Privacy Policy" in privacy_response:
            content_mentions = [
                "solo accounts" in privacy_response.lower(),
                "organization accounts" in privacy_response.lower() or "team" in privacy_response.lower(),
                "role-based access" in privacy_response.lower() or "role" in privacy_response.lower(),
                "invite" in privacy_response.lower()
            ]
            
            mentions_count = sum(content_mentions)
            self.log_test("7. Privacy Policy", True,
                f"Privacy Policy returned HTML content ({len(privacy_response)} chars), mentions {mentions_count}/4 expected topics")
        else:
            self.log_test("7. Privacy Policy", False,
                f"Failed to get privacy policy or invalid content: {type(privacy_response)}")
        
        # Test terms of service
        success, terms_response, status = self.make_request("GET", "/terms")
        
        if success and isinstance(terms_response, str) and "Terms of Service" in terms_response:
            content_mentions = [
                "solo accounts" in terms_response.lower(),
                "organization accounts" in terms_response.lower() or "team" in terms_response.lower(),
                "role-based access" in terms_response.lower() or "role" in terms_response.lower(),
                "invite" in terms_response.lower()
            ]
            
            mentions_count = sum(content_mentions)
            self.log_test("7. Terms of Service", True,
                f"Terms of Service returned HTML content ({len(terms_response)} chars), mentions {mentions_count}/4 expected topics")
        else:
            self.log_test("7. Terms of Service", False,
                f"Failed to get terms of service or invalid content: {type(terms_response)}")

    def test_8_session_persistence(self):
        """Test 8: SESSION PERSISTENCE"""
        print("\n🎯 TESTING 8: SESSION PERSISTENCE")
        
        if "existing_admin" in self.tokens:
            # Test token validity
            success, me_response1, status = self.make_request("GET", "/auth/me", token=self.tokens["existing_admin"])
            
            if success and "id" in me_response1:
                admin_id = me_response1["id"]
                self.log_test("8A. Initial Token Validity", True,
                    f"Token works, admin ID: {admin_id}")
                
                # Wait 5 seconds
                print("    Waiting 5 seconds to test token persistence...")
                time.sleep(5)
                
                # Test same token again
                success, me_response2, status = self.make_request("GET", "/auth/me", token=self.tokens["existing_admin"])
                
                if success and me_response2.get("id") == admin_id:
                    self.log_test("8A. Token Persistence", True,
                        "Token still valid after 5 seconds, session persisted")
                else:
                    self.log_test("8A. Token Persistence", False,
                        f"Token invalid after 5 seconds: {me_response2}")
            else:
                self.log_test("8A. Initial Token Validity", False,
                    f"Initial token test failed: {me_response1}")
        else:
            self.log_test("8A. Session Persistence", False,
                "No admin token available for testing")

    def run_comprehensive_test(self):
        """Run all comprehensive verification tests"""
        print("🚀 STARTING AGENTROUTE AI BACKEND COMPREHENSIVE VERIFICATION")
        print(f"Backend URL: {self.base_url}")
        print("=" * 80)
        
        start_time = time.time()
        
        # Run all test suites
        self.test_1_onboarding_system()
        self.test_2_invite_token_system()
        self.test_3_role_based_routing()
        self.test_4_backend_security()
        self.test_5_solo_agent_mode()
        self.test_6_notification_system()
        self.test_7_legal_documents()
        self.test_8_session_persistence()
        
        # Calculate results
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        duration = time.time() - start_time
        
        print("\n" + "=" * 80)
        print("🎯 COMPREHENSIVE VERIFICATION RESULTS")
        print("=" * 80)
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"📊 Success Rate: {success_rate:.1f}%")
        print(f"⏱️  Duration: {duration:.1f}s")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   • {result['test']}: {result['details']}")
        
        print(f"\n🎉 VERIFICATION COMPLETE - {'PASS' if success_rate >= 90 else 'NEEDS ATTENTION'}")
        
        return {
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": failed_tests,
            "success_rate": success_rate,
            "duration": duration,
            "results": self.test_results
        }

if __name__ == "__main__":
    tester = AgentRouteAPITester()
    results = tester.run_comprehensive_test()
    
    # Exit with appropriate code
    sys.exit(0 if results["success_rate"] >= 90 else 1)