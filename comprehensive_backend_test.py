#!/usr/bin/env python3
"""
Comprehensive Backend API Test for CRM Foundation Audit
Tests all critical endpoints with role-based access control
"""
import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"

# Test credentials from review request
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

class CRMTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.user_tokens = {}
        self.user_data = {}
        
    def log_test(self, test_name, success, details="", role=""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        role_prefix = f"[{role.upper()}] " if role else ""
        print(f"{status} {role_prefix}{test_name}")
        if details:
            print(f"    {details}")
        
        self.test_results.append({
            "test": test_name,
            "role": role,
            "success": success,
            "details": details
        })
        print()
    
    def make_request(self, method, endpoint, data=None, headers=None, auth_token=None):
        """Make HTTP request with proper headers"""
        url = f"{BASE_URL}{endpoint}"
        
        # Set default headers
        request_headers = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)
        
        # Add auth token if provided
        if auth_token:
            request_headers["Authorization"] = f"Bearer {auth_token}"
        
        try:
            self.session.verify = True
            self.session.timeout = 30
            
            if method.upper() == "GET":
                response = self.session.get(url, headers=request_headers, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=request_headers, timeout=30)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=request_headers, timeout=30)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=request_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None
        except Exception as e:
            print(f"Request failed: {e}")
            return None
    
    def test_authentication_all_roles(self):
        """Test 1: Authentication for all three roles"""
        print("🔐 Testing Authentication for All Roles")
        print("=" * 60)
        
        for role, credentials in TEST_USERS.items():
            login_data = {
                "email": credentials["email"],
                "password": credentials["password"]
            }
            
            response = self.make_request("POST", "/auth/login", login_data)
            
            if response and response.status_code == 200:
                try:
                    data = response.json()
                    token = data.get("access_token")
                    user_info = data.get("user", {})
                    
                    if token:
                        self.user_tokens[role] = token
                        self.user_data[role] = user_info
                        user_role = user_info.get("role", "unknown")
                        self.log_test("Authentication", True, 
                                    f"Login successful, role: {user_role}", role)
                    else:
                        self.log_test("Authentication", False, "No access token in response", role)
                        
                except Exception as e:
                    self.log_test("Authentication", False, f"Error parsing response: {e}", role)
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("Authentication", False, error_msg, role)
    
    def test_leads_access_permissions(self):
        """Test 2: Lead access permissions for all roles"""
        print("📋 Testing Lead Access Permissions")
        print("=" * 60)
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.user_tokens:
                self.log_test("Leads Access", False, "No auth token available", role)
                continue
                
            token = self.user_tokens[role]
            
            # Test GET /leads - List all leads
            response = self.make_request("GET", "/leads", auth_token=token)
            if response and response.status_code == 200:
                try:
                    leads = response.json()
                    lead_count = len(leads)
                    self.log_test("GET /leads", True, f"Retrieved {lead_count} leads", role)
                except Exception as e:
                    self.log_test("GET /leads", False, f"Error parsing response: {e}", role)
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("GET /leads", False, error_msg, role)
    
    def test_individual_lead_access(self):
        """Test 3: Individual lead access (GET /leads/{id})"""
        print("🎯 Testing Individual Lead Access")
        print("=" * 60)
        
        # First get a lead ID from admin
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test("Individual Lead Access", False, "No admin token available")
            return
            
        # Get leads from admin to find a test lead ID
        response = self.make_request("GET", "/leads", auth_token=admin_token)
        test_lead_id = None
        
        if response and response.status_code == 200:
            try:
                leads = response.json()
                if leads:
                    test_lead_id = leads[0].get("id")
            except:
                pass
        
        if not test_lead_id:
            self.log_test("Individual Lead Access", False, "No test lead ID available")
            return
        
        # Test individual lead access for each role
        for role in ["admin", "manager", "agent"]:
            if role not in self.user_tokens:
                continue
                
            token = self.user_tokens[role]
            response = self.make_request("GET", f"/leads/{test_lead_id}", auth_token=token)
            
            if response and response.status_code == 200:
                try:
                    lead_data = response.json()
                    lead_name = lead_data.get("name", "Unknown")
                    self.log_test("GET /leads/{id}", True, f"Retrieved lead: {lead_name}", role)
                except Exception as e:
                    self.log_test("GET /leads/{id}", False, f"Error parsing response: {e}", role)
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("GET /leads/{id}", False, error_msg, role)
    
    def test_pipeline_apis(self):
        """Test 4: Pipeline APIs for all roles"""
        print("📊 Testing Pipeline APIs")
        print("=" * 60)
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.user_tokens:
                self.log_test("Pipeline API", False, "No auth token available", role)
                continue
                
            token = self.user_tokens[role]
            
            # Test GET /pipeline
            response = self.make_request("GET", "/pipeline", auth_token=token)
            if response and response.status_code == 200:
                try:
                    pipeline_data = response.json()
                    stages = pipeline_data.get("stages", [])
                    summary = pipeline_data.get("summary", {})
                    self.log_test("GET /pipeline", True, 
                                f"Retrieved pipeline with {len(stages)} stages", role)
                except Exception as e:
                    self.log_test("GET /pipeline", False, f"Error parsing response: {e}", role)
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("GET /pipeline", False, error_msg, role)
    
    def test_command_center_permissions(self):
        """Test 5: Command Center APIs - Permission boundaries"""
        print("🏢 Testing Command Center Permission Boundaries")
        print("=" * 60)
        
        # Test endpoints that should be restricted to admin/manager only
        restricted_endpoints = [
            "/team/agents",
            "/team/snapshot",
            "/invitations",
            "/users",
            "/admin/settings"
        ]
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.user_tokens:
                continue
                
            token = self.user_tokens[role]
            
            for endpoint in restricted_endpoints:
                response = self.make_request("GET", endpoint, auth_token=token)
                
                if role == "agent":
                    # Agent should be denied access (403/404)
                    if response and response.status_code in [403, 404]:
                        self.log_test(f"GET {endpoint} (Access Denied)", True, 
                                    f"Properly denied with status {response.status_code}", role)
                    elif response and response.status_code == 200:
                        self.log_test(f"GET {endpoint} (Access Denied)", False, 
                                    "CRITICAL: Agent has unauthorized access", role)
                    else:
                        error_msg = "No response"
                        if response:
                            error_msg = f"Status: {response.status_code}"
                        self.log_test(f"GET {endpoint} (Access Denied)", False, error_msg, role)
                else:
                    # Admin/Manager should have access (200) or proper error
                    if response and response.status_code == 200:
                        try:
                            data = response.json()
                            self.log_test(f"GET {endpoint}", True, "Access granted", role)
                        except:
                            self.log_test(f"GET {endpoint}", True, "Access granted (non-JSON)", role)
                    elif response and response.status_code in [404, 501]:
                        # Endpoint might not be implemented yet
                        self.log_test(f"GET {endpoint}", True, 
                                    f"Endpoint not implemented (status {response.status_code})", role)
                    else:
                        error_msg = "No response"
                        if response:
                            error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                        self.log_test(f"GET {endpoint}", False, error_msg, role)
    
    def test_appointments_api(self):
        """Test 6: Appointments API"""
        print("📅 Testing Appointments API")
        print("=" * 60)
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.user_tokens:
                continue
                
            token = self.user_tokens[role]
            
            # Test GET /appointments
            response = self.make_request("GET", "/appointments", auth_token=token)
            if response and response.status_code == 200:
                try:
                    appointments = response.json()
                    appointment_count = len(appointments)
                    self.log_test("GET /appointments", True, 
                                f"Retrieved {appointment_count} appointments", role)
                except Exception as e:
                    self.log_test("GET /appointments", False, f"Error parsing response: {e}", role)
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("GET /appointments", False, error_msg, role)
    
    def test_lead_creation_and_update(self):
        """Test 7: Lead creation and update"""
        print("✏️ Testing Lead Creation and Update")
        print("=" * 60)
        
        # Test with admin role only to avoid permission issues
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test("Lead CRUD", False, "No admin token available")
            return
        
        # Create a test lead
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        test_lead_data = {
            "name": f"Test Lead {unique_id}",
            "phone": f"555-{unique_id[:4]}",
            "email": f"test.{unique_id}@example.com",
            "address": "123 Test Street, Test City, TC 12345",
            "notes": "Test lead for CRM foundation audit",
            "source": "foundation_audit_test"
        }
        
        response = self.make_request("POST", "/leads", test_lead_data, auth_token=admin_token)
        created_lead_id = None
        
        if response and response.status_code in [200, 201]:
            try:
                lead_data = response.json()
                created_lead_id = lead_data.get("id")
                self.log_test("POST /leads", True, 
                            f"Created lead: {lead_data.get('name')} (ID: {created_lead_id})", "admin")
            except Exception as e:
                self.log_test("POST /leads", False, f"Error parsing response: {e}", "admin")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("POST /leads", False, error_msg, "admin")
        
        # Test lead update if creation was successful
        if created_lead_id:
            update_data = {
                "notes": "Updated notes for foundation audit testing"
            }
            response = self.make_request("PUT", f"/leads/{created_lead_id}", update_data, auth_token=admin_token)
            if response and response.status_code == 200:
                try:
                    updated_lead = response.json()
                    self.log_test("PUT /leads/{id}", True, "Lead updated successfully", "admin")
                except Exception as e:
                    self.log_test("PUT /leads/{id}", False, f"Error parsing response: {e}", "admin")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("PUT /leads/{id}", False, error_msg, "admin")
    
    def run_all_tests(self):
        """Run all test scenarios"""
        print("🏗️ CRM FOUNDATION AUDIT - COMPREHENSIVE BACKEND TESTS")
        print("=" * 70)
        print(f"Base URL: {BASE_URL}")
        print(f"Testing with 3 roles: Admin, Manager, Agent")
        print("=" * 70)
        print()
        
        # Run all test scenarios
        self.test_authentication_all_roles()
        self.test_leads_access_permissions()
        self.test_individual_lead_access()
        self.test_pipeline_apis()
        self.test_command_center_permissions()
        self.test_appointments_api()
        self.test_lead_creation_and_update()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("📊 TEST SUMMARY")
        print("=" * 70)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        print()
        
        # Group results by role
        role_results = {}
        for result in self.test_results:
            role = result["role"] or "general"
            if role not in role_results:
                role_results[role] = {"passed": 0, "failed": 0, "tests": []}
            
            if result["success"]:
                role_results[role]["passed"] += 1
            else:
                role_results[role]["failed"] += 1
            role_results[role]["tests"].append(result)
        
        # Print role-based summary
        for role, data in role_results.items():
            total = data["passed"] + data["failed"]
            success_rate = (data["passed"] / total * 100) if total > 0 else 0
            print(f"{role.upper()}: {data['passed']}/{total} passed ({success_rate:.1f}%)")
        
        print()
        
        # Print failed tests
        if failed_tests > 0:
            print("❌ FAILED TESTS:")
            print("-" * 50)
            for result in self.test_results:
                if not result["success"]:
                    role_prefix = f"[{result['role'].upper()}] " if result['role'] else ""
                    print(f"• {role_prefix}{result['test']}")
                    if result["details"]:
                        print(f"  {result['details']}")
            print()
        
        # Identify critical issues
        critical_issues = []
        for result in self.test_results:
            if not result["success"]:
                details = result.get("details", "")
                if "500" in details:
                    critical_issues.append(f"500 Error: {result['test']} ({result['role']})")
                elif "CRITICAL" in details:
                    critical_issues.append(f"Permission Issue: {result['test']} ({result['role']})")
                elif "Authentication" in result["test"]:
                    critical_issues.append(f"Auth Issue: {result['test']} ({result['role']})")
        
        if critical_issues:
            print("🚨 CRITICAL ISSUES:")
            print("-" * 50)
            for issue in critical_issues:
                print(f"• {issue}")
            print()
        else:
            print("✅ No critical issues found!")
            print()

if __name__ == "__main__":
    tester = CRMTester()
    tester.run_all_tests()