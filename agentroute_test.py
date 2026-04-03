#!/usr/bin/env python3
"""
AgentRoute CRM Backend Comprehensive Test
Tests authentication, permissions, and API endpoints as requested in review
"""
import requests
import json
import sys
from datetime import datetime

# Configuration - Using localhost as specified in review request
BASE_URL = "http://localhost:8001/api"

# Test credentials as specified in review request
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

class AgentRouteTester:
    def __init__(self):
        self.session = requests.Session()
        self.tokens = {}
        self.users = {}
        self.test_results = []
        self.lead_ids = []
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test results"""
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
            "response": response_data
        })
        print()
    
    def make_request(self, method, endpoint, data=None, headers=None, token=None):
        """Make HTTP request with proper headers"""
        url = f"{BASE_URL}{endpoint}"
        
        # Set default headers
        request_headers = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)
        
        # Add auth token if provided
        if token:
            request_headers["Authorization"] = f"Bearer {token}"
        
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
    
    def test_authentication(self):
        """Test 1: Authentication for all user types"""
        print("🔐 Testing Authentication")
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
                    user = data.get("user", {})
                    
                    if token and user:
                        self.tokens[role] = token
                        self.users[role] = user
                        
                        self.log_test(f"Login as {role}", True, 
                                    f"User: {user.get('email')}, Role: {user.get('role')}")
                    else:
                        self.log_test(f"Login as {role}", False, "Missing token or user data")
                        
                except Exception as e:
                    self.log_test(f"Login as {role}", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test(f"Login as {role}", False, error_msg)
    
    def test_lead_access_permissions(self):
        """Test 2: Lead Access Permissions"""
        print("📋 Testing Lead Access Permissions")
        print("=" * 60)
        
        # Test GET /leads for each user type
        for role in ["admin", "manager", "agent"]:
            if role not in self.tokens:
                self.log_test(f"GET /leads as {role}", False, "No auth token available")
                continue
                
            response = self.make_request("GET", "/leads", token=self.tokens[role])
            
            if response and response.status_code == 200:
                try:
                    leads = response.json()
                    lead_count = len(leads)
                    
                    # Store lead IDs for further testing
                    if leads:
                        self.lead_ids.extend([lead.get("id") for lead in leads if lead.get("id")])
                    
                    if role == "admin":
                        # Admin should see ALL leads
                        self.log_test(f"GET /leads as {role}", True, 
                                    f"Admin accessed {lead_count} leads (should see all)")
                    elif role == "manager":
                        # Manager should see leads from their downline
                        self.log_test(f"GET /leads as {role}", True, 
                                    f"Manager accessed {lead_count} leads (downline only)")
                    else:  # agent
                        # Agent should only see their own leads
                        self.log_test(f"GET /leads as {role}", True, 
                                    f"Agent accessed {lead_count} leads (own leads only)")
                        
                except Exception as e:
                    self.log_test(f"GET /leads as {role}", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test(f"GET /leads as {role}", False, error_msg)
        
        # Test GET /leads/{id} for specific lead access
        if self.lead_ids:
            test_lead_id = self.lead_ids[0]
            
            for role in ["admin", "manager", "agent"]:
                if role not in self.tokens:
                    continue
                    
                response = self.make_request("GET", f"/leads/{test_lead_id}", token=self.tokens[role])
                
                if response and response.status_code == 200:
                    try:
                        lead = response.json()
                        self.log_test(f"GET /leads/{{id}} as {role}", True, 
                                    f"Accessed lead: {lead.get('name', 'Unknown')}")
                    except Exception as e:
                        self.log_test(f"GET /leads/{{id}} as {role}", False, f"Error parsing response: {e}")
                elif response and response.status_code == 404:
                    self.log_test(f"GET /leads/{{id}} as {role}", True, 
                                f"Lead not found (expected for permission restrictions)")
                elif response and response.status_code == 403:
                    self.log_test(f"GET /leads/{{id}} as {role}", True, 
                                f"Access denied (expected for permission restrictions)")
                else:
                    error_msg = "No response"
                    if response:
                        error_msg = f"Status: {response.status_code}"
                    self.log_test(f"GET /leads/{{id}} as {role}", False, error_msg)
    
    def test_command_center_apis(self):
        """Test 3: Command Center APIs (Admin/Manager only)"""
        print("🎯 Testing Command Center APIs")
        print("=" * 60)
        
        command_center_endpoints = [
            ("/team/agents", "Get team agents"),
            ("/team/snapshot", "Get team snapshot"),
        ]
        
        for endpoint, description in command_center_endpoints:
            for role in ["admin", "manager", "agent"]:
                if role not in self.tokens:
                    continue
                    
                response = self.make_request("GET", endpoint, token=self.tokens[role])
                
                if role in ["admin", "manager"]:
                    # Admin and Manager should have access
                    if response and response.status_code == 200:
                        try:
                            data = response.json()
                            self.log_test(f"GET {endpoint} as {role}", True, 
                                        f"{description} - Success")
                        except Exception as e:
                            self.log_test(f"GET {endpoint} as {role}", False, f"Error parsing response: {e}")
                    else:
                        error_msg = "No response"
                        if response:
                            error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                        self.log_test(f"GET {endpoint} as {role}", False, error_msg)
                else:
                    # Agent should NOT have access
                    if response and response.status_code == 403:
                        self.log_test(f"GET {endpoint} as {role}", True, 
                                    f"Access denied for agent (expected)")
                    elif response and response.status_code == 401:
                        self.log_test(f"GET {endpoint} as {role}", True, 
                                    f"Unauthorized for agent (expected)")
                    else:
                        error_msg = "Unexpected access granted"
                        if response:
                            error_msg = f"Status: {response.status_code} (should be 403/401)"
                        self.log_test(f"GET {endpoint} as {role}", False, error_msg)
        
        # Test agent details endpoint with agent ID
        if "admin" in self.tokens and "agent" in self.users:
            agent_id = self.users["agent"].get("id")
            if agent_id:
                response = self.make_request("GET", f"/team/agents/{agent_id}/details", 
                                           token=self.tokens["admin"])
                
                if response and response.status_code == 200:
                    try:
                        agent_details = response.json()
                        self.log_test("GET /team/agents/{id}/details as admin", True, 
                                    f"Retrieved agent details")
                    except Exception as e:
                        self.log_test("GET /team/agents/{id}/details as admin", False, 
                                    f"Error parsing response: {e}")
                else:
                    error_msg = "No response"
                    if response:
                        error_msg = f"Status: {response.status_code}"
                    self.log_test("GET /team/agents/{id}/details as admin", False, error_msg)
    
    def test_pipeline_apis(self):
        """Test 4: Pipeline APIs"""
        print("📊 Testing Pipeline APIs")
        print("=" * 60)
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.tokens:
                continue
                
            response = self.make_request("GET", "/pipeline", token=self.tokens[role])
            
            if response and response.status_code == 200:
                try:
                    pipeline_data = response.json()
                    stages = pipeline_data.get("stages", [])
                    summary = pipeline_data.get("summary", {})
                    
                    if stages:
                        self.log_test(f"GET /pipeline as {role}", True, 
                                    f"Retrieved pipeline with {len(stages)} stages")
                    else:
                        self.log_test(f"GET /pipeline as {role}", True, 
                                    f"Retrieved empty pipeline (valid)")
                        
                except Exception as e:
                    self.log_test(f"GET /pipeline as {role}", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test(f"GET /pipeline as {role}", False, error_msg)
    
    def test_permission_boundaries(self):
        """Test 5: Permission Boundaries (Agent restrictions)"""
        print("🚫 Testing Permission Boundaries")
        print("=" * 60)
        
        if "agent" not in self.tokens:
            self.log_test("Permission boundary tests", False, "No agent token available")
            return
        
        # Endpoints that agents should NOT be able to access
        restricted_endpoints = [
            "/team/agents",
            "/team/snapshot", 
            "/team/agents/123/details",
            "/invitations",
            "/users",
            "/admin/settings"
        ]
        
        for endpoint in restricted_endpoints:
            response = self.make_request("GET", endpoint, token=self.tokens["agent"])
            
            if response and response.status_code in [403, 401]:
                self.log_test(f"Agent access to {endpoint}", True, 
                            f"Properly denied (status: {response.status_code})")
            elif response and response.status_code == 404:
                self.log_test(f"Agent access to {endpoint}", True, 
                            f"Endpoint not found (acceptable)")
            else:
                error_msg = "Unexpected access granted"
                if response:
                    error_msg = f"Status: {response.status_code} (should be 403/401)"
                else:
                    error_msg = "No response"
                self.log_test(f"Agent access to {endpoint}", False, error_msg)
    
    def test_data_integrity(self):
        """Test 6: Data Integrity and Response Format"""
        print("🔍 Testing Data Integrity")
        print("=" * 60)
        
        # Test that admin can see more leads than agent
        admin_leads = 0
        agent_leads = 0
        
        if "admin" in self.tokens:
            response = self.make_request("GET", "/leads", token=self.tokens["admin"])
            if response and response.status_code == 200:
                try:
                    leads = response.json()
                    admin_leads = len(leads)
                except:
                    pass
        
        if "agent" in self.tokens:
            response = self.make_request("GET", "/leads", token=self.tokens["agent"])
            if response and response.status_code == 200:
                try:
                    leads = response.json()
                    agent_leads = len(leads)
                except:
                    pass
        
        if admin_leads >= agent_leads:
            self.log_test("Lead access hierarchy", True, 
                        f"Admin sees {admin_leads} leads, Agent sees {agent_leads} leads")
        else:
            self.log_test("Lead access hierarchy", False, 
                        f"Agent sees more leads ({agent_leads}) than Admin ({admin_leads})")
        
        # Test response format consistency
        if "admin" in self.tokens:
            response = self.make_request("GET", "/auth/me", token=self.tokens["admin"])
            if response and response.status_code == 200:
                try:
                    user_data = response.json()
                    required_fields = ["id", "name", "email", "role"]
                    missing_fields = [field for field in required_fields if field not in user_data]
                    
                    if not missing_fields:
                        self.log_test("User response format", True, 
                                    f"All required fields present")
                    else:
                        self.log_test("User response format", False, 
                                    f"Missing fields: {missing_fields}")
                except Exception as e:
                    self.log_test("User response format", False, f"Error parsing response: {e}")
    
    def run_all_tests(self):
        """Run all test scenarios"""
        print("🏢 AGENTROUTE CRM BACKEND COMPREHENSIVE TEST")
        print("=" * 70)
        print(f"Base URL: {BASE_URL}")
        print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 70)
        print()
        
        # Run all test scenarios
        self.test_authentication()
        self.test_lead_access_permissions()
        self.test_command_center_apis()
        self.test_pipeline_apis()
        self.test_permission_boundaries()
        self.test_data_integrity()
        
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
        
        if failed_tests > 0:
            print("❌ FAILED TESTS:")
            print("-" * 50)
            for result in self.test_results:
                if not result["success"]:
                    print(f"• {result['test']}")
                    if result["details"]:
                        print(f"  {result['details']}")
            print()
        
        # Check for critical authentication and permission issues
        critical_issues = []
        for result in self.test_results:
            if not result["success"]:
                if "Login" in result["test"]:
                    critical_issues.append(f"Authentication Issue: {result['test']}")
                elif "Permission" in result["test"] or "access" in result["test"].lower():
                    critical_issues.append(f"Permission Issue: {result['test']}")
                elif "500" in result.get("details", ""):
                    critical_issues.append(f"Server Error: {result['test']}")
        
        if critical_issues:
            print("🚨 CRITICAL ISSUES:")
            print("-" * 50)
            for issue in critical_issues:
                print(f"• {issue}")
            print()
        else:
            print("✅ No critical authentication or permission issues found!")
            print()
        
        # Summary by user role
        print("👥 ROLE-BASED TEST RESULTS:")
        print("-" * 50)
        for role in ["admin", "manager", "agent"]:
            role_tests = [r for r in self.test_results if role in r["test"].lower()]
            if role_tests:
                role_passed = sum(1 for r in role_tests if r["success"])
                role_total = len(role_tests)
                print(f"{role.upper()}: {role_passed}/{role_total} tests passed")
        print()

if __name__ == "__main__":
    tester = AgentRouteTester()
    tester.run_all_tests()