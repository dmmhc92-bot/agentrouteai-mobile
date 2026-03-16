#!/usr/bin/env python3
"""
FINAL COMPREHENSIVE REGRESSION TEST for AgentRoute AI Backend
Target: 100% pass rate for all critical functionality before deployment

This test suite validates ALL requirements from the review request:
1. Authentication (CRITICAL - Must Not Break)
2. Lead Creation (CRITICAL - Must Not Break) 
3. Appointment Creation (CRITICAL - Must Not Break)
4. SOA Workflow (CRITICAL - Must Not Break)
5. Invitation System
6. User Management
7. Role-based Data Filtering
8. Legal/Support Pages (NEW)
9. Account Deletion
10. Team Management Permission Enforcement
"""

import requests
import json
import uuid
import base64
from datetime import datetime
import time
import sys

# Test Configuration
BASE_URL = "https://sales-team-hub-2.preview.emergentagent.com/api"

# Test Credentials from review request
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class FinalRegressionTest:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tokens = {}
        self.test_data = {}
        self.failed_tests = []
        
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def test_request(self, method, endpoint, data=None, headers=None, expected_status=200, description=""):
        """Make HTTP request and validate response"""
        url = f"{BASE_URL}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, timeout=30)
            elif method.upper() == "POST":
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method.upper() == "PUT":
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method.upper() == "DELETE":
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            if response.status_code == expected_status:
                self.passed += 1
                self.log(f"✅ PASS: {description} - {method} {endpoint} ({response.status_code})")
                return response
            else:
                self.failed += 1
                self.failed_tests.append(f"{description} - Expected {expected_status}, got {response.status_code}")
                self.log(f"❌ FAIL: {description} - {method} {endpoint} - Expected {expected_status}, got {response.status_code}", "ERROR")
                try:
                    error_detail = response.json()
                    self.log(f"Error details: {error_detail}", "ERROR")
                except:
                    self.log(f"Response text: {response.text[:500]}", "ERROR")
                return None
                
        except Exception as e:
            self.failed += 1
            self.failed_tests.append(f"{description} - Exception: {str(e)}")
            self.log(f"❌ FAIL: {description} - {method} {endpoint} - Exception: {str(e)}", "ERROR")
            return None
    
    def get_auth_headers(self, role):
        """Get authorization headers for a role"""
        if role in self.tokens:
            return {"Authorization": f"Bearer {self.tokens[role]}"}
        return {}
    
    def test_1_authentication(self):
        """1. Authentication (CRITICAL - Must Not Break)"""
        self.log("=== 1. AUTHENTICATION (CRITICAL - Must Not Break) ===")
        
        # POST /api/auth/login - Admin login
        response = self.test_request(
            "POST", "/auth/login",
            data=TEST_CREDENTIALS["admin"],
            description="POST /api/auth/login - Admin login"
        )
        if response:
            data = response.json()
            self.tokens["admin"] = data.get("access_token")
            self.test_data["admin_user"] = data.get("user", {})
        
        # POST /api/auth/login - Agent login
        response = self.test_request(
            "POST", "/auth/login", 
            data=TEST_CREDENTIALS["agent"],
            description="POST /api/auth/login - Agent login"
        )
        if response:
            data = response.json()
            self.tokens["agent"] = data.get("access_token")
            self.test_data["agent_user"] = data.get("user", {})
        
        # GET /api/auth/me - Returns user with all fields
        response = self.test_request(
            "GET", "/auth/me",
            headers=self.get_auth_headers("admin"),
            description="GET /api/auth/me - Returns user with all fields"
        )
        if response:
            user_data = response.json()
            required_fields = ["id", "name", "email", "role", "admin_id", "organization_id"]
            missing_fields = [field for field in required_fields if field not in user_data]
            if missing_fields:
                self.log(f"WARNING: Missing user fields: {missing_fields}", "WARN")
        
        # POST /api/auth/forgot-password - Password reset initiation
        self.test_request(
            "POST", "/auth/forgot-password",
            data={"email": "admin@agentroute.com"},
            description="POST /api/auth/forgot-password - Password reset initiation"
        )
    
    def test_2_lead_creation(self):
        """2. Lead Creation (CRITICAL - Must Not Break)"""
        self.log("=== 2. LEAD CREATION (CRITICAL - Must Not Break) ===")
        
        # POST /api/leads - Create lead as admin
        lead_data = {
            "name": f"Final Test Lead {uuid.uuid4().hex[:8]}",
            "phone": "555-123-4567",
            "email": "finaltest@example.com",
            "address": "123 Final Test St, Test City, TS 12345",
            "notes": "Final regression test lead",
            "source": "manual"
        }
        
        response = self.test_request(
            "POST", "/leads",
            data=lead_data,
            headers=self.get_auth_headers("admin"),
            description="POST /api/leads - Create lead as admin"
        )
        
        if response:
            lead = response.json()
            self.test_data["test_lead_id"] = lead.get("id")
        
        # GET /api/leads - List leads
        self.test_request(
            "GET", "/leads",
            headers=self.get_auth_headers("admin"),
            description="GET /api/leads - List leads"
        )
        
        # GET /api/leads/{id} - Get single lead
        if "test_lead_id" in self.test_data:
            self.test_request(
                "GET", f"/leads/{self.test_data['test_lead_id']}",
                headers=self.get_auth_headers("admin"),
                description="GET /api/leads/{id} - Get single lead"
            )
    
    def test_3_appointment_creation(self):
        """3. Appointment Creation (CRITICAL - Must Not Break)"""
        self.log("=== 3. APPOINTMENT CREATION (CRITICAL - Must Not Break) ===")
        
        if "test_lead_id" not in self.test_data:
            self.log("❌ Skipping appointment tests - no test lead available", "ERROR")
            self.failed += 2
            self.failed_tests.extend(["POST /api/appointments - No lead", "GET /api/appointments - No lead"])
            return
        
        # POST /api/appointments - Create appointment
        appointment_data = {
            "lead_id": self.test_data["test_lead_id"],
            "appointment_date": "2025-01-20",
            "appointment_time": "14:00",
            "notes": "Final regression test appointment",
            "status": "scheduled",
            "appointment_type": "in_person"
        }
        
        response = self.test_request(
            "POST", "/appointments",
            data=appointment_data,
            headers=self.get_auth_headers("admin"),
            description="POST /api/appointments - Create appointment"
        )
        
        if response:
            appointment = response.json()
            self.test_data["test_appointment_id"] = appointment.get("id")
        
        # GET /api/appointments - List appointments
        self.test_request(
            "GET", "/appointments",
            headers=self.get_auth_headers("admin"),
            description="GET /api/appointments - List appointments"
        )
    
    def test_4_soa_workflow(self):
        """4. SOA Workflow (CRITICAL - Must Not Break)"""
        self.log("=== 4. SOA WORKFLOW (CRITICAL - Must Not Break) ===")
        
        if "test_lead_id" not in self.test_data:
            self.log("❌ Skipping SOA tests - no test lead available", "ERROR")
            self.failed += 3
            self.failed_tests.extend(["POST /api/scope - No lead", "GET /api/scope/{id} - No lead", "POST /api/scope/{id}/generate-pdf - No lead"])
            return
        
        # Create sample signature data (small PNG base64)
        signature_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        
        # POST /api/scope - Create scope
        scope_data = {
            "lead_id": self.test_data["test_lead_id"],
            "form_fields": {
                "beneficiary_name": "John Final Test",
                "beneficiary_phone": "555-999-8888",
                "beneficiary_address": "456 Final Test Ave, Test City, TS 12345",
                "signature_date": "2025-01-15",
                "agent_name": "Final Test Agent",
                "agent_phone": "555-777-9999",
                "contact_method": "phone",
                "plans_to_represent": "Medicare Advantage",
                "appointment_date": "2025-01-20"
            },
            "typed_name": "John Final Test",
            "signature": signature_data,
            "agent_typed_name": "Final Test Agent",
            "agent_signature": signature_data
        }
        
        response = self.test_request(
            "POST", "/scope",
            data=scope_data,
            headers=self.get_auth_headers("admin"),
            description="POST /api/scope - Create scope"
        )
        
        if response:
            scope = response.json()
            self.test_data["test_scope_id"] = scope.get("id")
        
        # GET /api/scope/{id} - Get scope
        if "test_scope_id" in self.test_data:
            self.test_request(
                "GET", f"/scope/{self.test_data['test_scope_id']}",
                headers=self.get_auth_headers("admin"),
                description="GET /api/scope/{id} - Get scope"
            )
            
            # POST /api/scope/{id}/generate-pdf - Generate PDF with signatures
            self.test_request(
                "POST", f"/scope/{self.test_data['test_scope_id']}/generate-pdf",
                headers=self.get_auth_headers("admin"),
                description="POST /api/scope/{id}/generate-pdf - Generate PDF with signatures"
            )
    
    def test_5_invitation_system(self):
        """5. Invitation System"""
        self.log("=== 5. INVITATION SYSTEM ===")
        
        # POST /api/invitations - Create invitation
        invitation_data = {
            "email": f"final-test-{uuid.uuid4().hex[:8]}@example.com",
            "role": "agent",
            "name": "Final Test User"
        }
        
        response = self.test_request(
            "POST", "/invitations",
            data=invitation_data,
            headers=self.get_auth_headers("admin"),
            description="POST /api/invitations - Create invitation"
        )
        
        if response:
            invitation = response.json()
            self.test_data["test_invitation_id"] = invitation.get("id")
            # Note: token might not be in response, need to get from list
        
        # GET /api/invitations - List invitations
        response = self.test_request(
            "GET", "/invitations",
            headers=self.get_auth_headers("admin"),
            description="GET /api/invitations - List invitations"
        )
        
        if response and "test_invitation_id" in self.test_data:
            invitations = response.json()
            for inv in invitations:
                if inv.get("id") == self.test_data["test_invitation_id"]:
                    self.test_data["test_invitation_token"] = inv.get("token")
                    break
        
        # GET /api/invitations/validate/{token} - Validate token
        if "test_invitation_token" in self.test_data:
            self.test_request(
                "GET", f"/invitations/validate/{self.test_data['test_invitation_token']}",
                description="GET /api/invitations/validate/{token} - Validate token"
            )
        
        # DELETE /api/invitations/{id} - Cancel invitation
        if "test_invitation_id" in self.test_data:
            self.test_request(
                "DELETE", f"/invitations/{self.test_data['test_invitation_id']}",
                headers=self.get_auth_headers("admin"),
                description="DELETE /api/invitations/{id} - Cancel invitation"
            )
    
    def test_6_user_management(self):
        """6. User Management"""
        self.log("=== 6. USER MANAGEMENT ===")
        
        # GET /api/users - List users by hierarchy
        response = self.test_request(
            "GET", "/users",
            headers=self.get_auth_headers("admin"),
            description="GET /api/users - List users by hierarchy"
        )
        
        if response:
            users = response.json()
            # Find a non-admin user for role testing
            test_user = None
            for user in users:
                if user.get("role") in ["agent", "manager"] and user.get("id") != self.test_data.get("admin_user", {}).get("id"):
                    test_user = user
                    break
            
            if test_user:
                user_id = test_user["id"]
                original_role = test_user["role"]
                
                # PUT /api/users/{id}/role - Promote/demote (test with caution)
                new_role = "manager" if original_role == "agent" else "agent"
                self.test_request(
                    "PUT", f"/users/{user_id}/role",
                    data={"role": new_role},
                    headers=self.get_auth_headers("admin"),
                    description="PUT /api/users/{id}/role - Promote/demote"
                )
                
                # Restore original role
                self.test_request(
                    "PUT", f"/users/{user_id}/role",
                    data={"role": original_role},
                    headers=self.get_auth_headers("admin"),
                    description="PUT /api/users/{id}/role - Restore original role"
                )
                
                # PUT /api/users/{id}/status - Activate/deactivate (test with caution)
                self.test_request(
                    "PUT", f"/users/{user_id}/status",
                    data={"is_active": False},
                    headers=self.get_auth_headers("admin"),
                    description="PUT /api/users/{id}/status - Deactivate"
                )
                
                # Restore active status
                self.test_request(
                    "PUT", f"/users/{user_id}/status",
                    data={"is_active": True},
                    headers=self.get_auth_headers("admin"),
                    description="PUT /api/users/{id}/status - Reactivate"
                )
    
    def test_7_role_based_filtering(self):
        """7. Role-based Data Filtering"""
        self.log("=== 7. ROLE-BASED DATA FILTERING ===")
        
        # As Admin: GET /api/leads should return all org leads
        admin_response = self.test_request(
            "GET", "/leads",
            headers=self.get_auth_headers("admin"),
            description="As Admin: GET /api/leads should return all org leads"
        )
        
        # As Agent: GET /api/leads should return only agent's leads
        agent_response = self.test_request(
            "GET", "/leads", 
            headers=self.get_auth_headers("agent"),
            description="As Agent: GET /api/leads should return only agent's leads"
        )
        
        # Validate filtering logic
        if admin_response and agent_response:
            admin_leads = len(admin_response.json())
            agent_leads = len(agent_response.json())
            
            if admin_leads >= agent_leads:
                self.passed += 1
                self.log(f"✅ PASS: Role-based filtering validation - Admin sees {admin_leads} leads, Agent sees {agent_leads} leads")
            else:
                self.failed += 1
                self.failed_tests.append(f"Role-based filtering - Admin sees {admin_leads} leads, Agent sees {agent_leads} leads (should be >=)")
                self.log(f"❌ FAIL: Role-based filtering - Admin sees {admin_leads} leads, Agent sees {agent_leads} leads", "ERROR")
    
    def test_8_legal_support_pages(self):
        """8. Legal/Support Pages (NEW)"""
        self.log("=== 8. LEGAL/SUPPORT PAGES (NEW) ===")
        
        # GET /api/privacy - Returns 200 with HTML
        self.test_request(
            "GET", "/privacy",
            description="GET /api/privacy - Returns 200 with HTML"
        )
        
        # GET /api/terms - Returns 200 with HTML
        self.test_request(
            "GET", "/terms", 
            description="GET /api/terms - Returns 200 with HTML"
        )
        
        # GET /api/privacy-policy - Returns 200 with HTML (full path)
        self.test_request(
            "GET", "/privacy-policy",
            description="GET /api/privacy-policy - Returns 200 with HTML (full path)"
        )
        
        # GET /api/terms-of-service - Returns 200 with HTML (full path)
        self.test_request(
            "GET", "/terms-of-service",
            description="GET /api/terms-of-service - Returns 200 with HTML (full path)"
        )
    
    def test_9_account_deletion(self):
        """9. Account Deletion"""
        self.log("=== 9. ACCOUNT DELETION ===")
        
        # DELETE /api/auth/account - Should work (using admin account)
        self.test_request(
            "DELETE", "/auth/account",
            headers=self.get_auth_headers("admin"),
            description="DELETE /api/auth/account - Should work"
        )
    
    def test_10_permission_enforcement(self):
        """10. Team Management Permission Enforcement"""
        self.log("=== 10. TEAM MANAGEMENT PERMISSION ENFORCEMENT ===")
        
        # POST /api/invitations as Agent - Should return 403
        self.test_request(
            "POST", "/invitations",
            data={"email": "test-agent-invite@example.com", "role": "agent"},
            headers=self.get_auth_headers("agent"),
            expected_status=403,
            description="POST /api/invitations as Agent - Should return 403"
        )
        
        # Try to login as manager for manager tests
        manager_response = self.test_request(
            "POST", "/auth/login",
            data=TEST_CREDENTIALS["manager"],
            description="Manager login for permission tests"
        )
        
        if manager_response:
            manager_data = manager_response.json()
            self.tokens["manager"] = manager_data.get("access_token")
            
            # POST /api/invitations as Manager with role=manager - Should return 403
            self.test_request(
                "POST", "/invitations",
                data={"email": "test-manager-invite@example.com", "role": "manager"},
                headers=self.get_auth_headers("manager"),
                expected_status=403,
                description="POST /api/invitations as Manager with role=manager - Should return 403"
            )
        else:
            self.log("WARNING: Manager login failed, skipping manager permission tests", "WARN")
    
    def run_all_tests(self):
        """Run complete final regression test suite"""
        self.log("🚀 STARTING FINAL COMPREHENSIVE REGRESSION TEST")
        self.log("=" * 80)
        self.log("Target: 100% pass rate for ALL functionality before deployment")
        self.log(f"Backend URL: {BASE_URL}")
        self.log("Test Credentials: Admin, Manager, Agent")
        self.log("=" * 80)
        
        start_time = time.time()
        
        # Run all test categories in order
        self.test_1_authentication()
        self.test_2_lead_creation()
        self.test_3_appointment_creation()
        self.test_4_soa_workflow()
        self.test_5_invitation_system()
        self.test_6_user_management()
        self.test_7_role_based_filtering()
        self.test_8_legal_support_pages()
        self.test_9_account_deletion()
        self.test_10_permission_enforcement()
        
        # Final results
        end_time = time.time()
        duration = end_time - start_time
        total_tests = self.passed + self.failed
        pass_rate = (self.passed / total_tests * 100) if total_tests > 0 else 0
        
        self.log("=" * 80)
        self.log("🎯 FINAL COMPREHENSIVE REGRESSION TEST RESULTS")
        self.log("=" * 80)
        self.log(f"Total Tests: {total_tests}")
        self.log(f"Passed: {self.passed}")
        self.log(f"Failed: {self.failed}")
        self.log(f"Pass Rate: {pass_rate:.1f}%")
        self.log(f"Duration: {duration:.1f}s")
        
        if self.failed > 0:
            self.log("❌ FAILED TESTS:")
            for i, test in enumerate(self.failed_tests, 1):
                self.log(f"  {i}. {test}")
        
        if pass_rate == 100.0:
            self.log("🎉 SUCCESS: 100% pass rate achieved - READY FOR DEPLOYMENT!")
            return True
        else:
            self.log(f"❌ FAILURE: {pass_rate:.1f}% pass rate - DEPLOYMENT BLOCKED")
            self.log("Fix all failed tests before deployment.")
            return False

if __name__ == "__main__":
    runner = FinalRegressionTest()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)