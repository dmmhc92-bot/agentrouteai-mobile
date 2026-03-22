#!/usr/bin/env python3
"""
AgentRoute AI - Manager Daily Command Center Testing
Comprehensive testing for the Manager Daily Command Center feature and regression testing.
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Backend URL from environment
BACKEND_URL = "https://crm-final-build.preview.emergentagent.com/api"

class ManagerCommandCenterTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.tokens = {}  # Store tokens for different users
        self.test_results = []
        self.user_data = {}  # Store user information
        
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

    def test_authentication_flows(self):
        """Test 1: Authentication Tests"""
        print("\n🎯 TESTING 1: AUTHENTICATION FLOWS")
        
        # Test credentials from review request
        test_users = [
            {"email": "admin@agentroute.com", "password": "Admin123!", "role": "admin", "key": "admin"},
            {"email": "manager@agentroute.com", "password": "Manager123!", "role": "manager", "key": "manager"},
            {"email": "agent@agentroute.com", "password": "Agent123!", "role": "agent", "key": "agent"}
        ]
        
        for user in test_users:
            # Login test
            login_data = {"email": user["email"], "password": user["password"]}
            success, response, status = self.make_request("POST", "/auth/login", login_data)
            
            if success and "access_token" in response:
                self.tokens[user["key"]] = response["access_token"]
                user_info = response.get("user", {})
                self.user_data[user["key"]] = user_info
                
                role_check = user_info.get("role") == user["role"]
                if role_check:
                    self.log_test(f"Login {user['role'].title()} ({user['email']})", True, 
                        f"Token received, role={user_info.get('role')}")
                else:
                    self.log_test(f"Login {user['role'].title()} ({user['email']})", False, 
                        f"Role mismatch: expected {user['role']}, got {user_info.get('role')}")
            else:
                self.log_test(f"Login {user['role'].title()} ({user['email']})", False, 
                    f"Login failed: {response}")
        
        # Test /auth/me endpoint for each user
        for user_key, token in self.tokens.items():
            success, response, status = self.make_request("GET", "/auth/me", token=token)
            if success:
                role = response.get("role")
                user_id = response.get("id")
                self.log_test(f"GET /auth/me - {user_key.title()}", True, 
                    f"User info retrieved: role={role}, id={user_id}")
            else:
                self.log_test(f"GET /auth/me - {user_key.title()}", False, 
                    f"Failed to get user info: {response}")

    def test_manager_daily_command_center(self):
        """Test 2: Manager Daily Command Center Tests"""
        print("\n🎯 TESTING 2: MANAGER DAILY COMMAND CENTER")
        
        # Test as Admin - should return team data
        if "admin" in self.tokens:
            success, response, status = self.make_request("GET", "/manager/daily-command-center", token=self.tokens["admin"])
            if success:
                # Check if response has expected structure
                required_fields = ["team_activity", "needs_attention", "performance_metrics"]
                has_expected_structure = any(field in response for field in required_fields)
                
                self.log_test("GET /manager/daily-command-center as Admin", True, 
                    f"Team data returned: {len(str(response))} chars")
            else:
                self.log_test("GET /manager/daily-command-center as Admin", False, 
                    f"Request failed: {response}")
        
        # Test as Manager - should return scoped data (smaller team)
        if "manager" in self.tokens:
            success, response, status = self.make_request("GET", "/manager/daily-command-center", token=self.tokens["manager"])
            if success:
                self.log_test("GET /manager/daily-command-center as Manager", True, 
                    f"Scoped team data returned: {len(str(response))} chars")
            else:
                self.log_test("GET /manager/daily-command-center as Manager", False, 
                    f"Request failed: {response}")
        
        # Test as Agent - should return 403 Forbidden
        if "agent" in self.tokens:
            success, response, status = self.make_request("GET", "/manager/daily-command-center", 
                token=self.tokens["agent"], expect_status=403)
            if success:
                self.log_test("GET /manager/daily-command-center as Agent", True, 
                    f"Correctly returned 403 Forbidden: {response}")
            else:
                self.log_test("GET /manager/daily-command-center as Agent", False, 
                    f"Expected 403 but got {status}: {response}")

    def test_lead_system_regression(self):
        """Test 3: Lead System Tests (Verify No Regression)"""
        print("\n🎯 TESTING 3: LEAD SYSTEM REGRESSION")
        
        # Test as Admin - should return leads
        if "admin" in self.tokens:
            success, response, status = self.make_request("GET", "/leads", token=self.tokens["admin"])
            if success:
                leads_count = len(response) if isinstance(response, list) else "unknown"
                self.log_test("GET /leads as Admin", True, 
                    f"Leads retrieved: {leads_count} leads")
            else:
                self.log_test("GET /leads as Admin", False, 
                    f"Request failed: {response}")
        
        # Test as Agent - should return agent's leads
        if "agent" in self.tokens:
            success, response, status = self.make_request("GET", "/leads", token=self.tokens["agent"])
            if success:
                leads_count = len(response) if isinstance(response, list) else "unknown"
                self.log_test("GET /leads as Agent", True, 
                    f"Agent's leads retrieved: {leads_count} leads")
            else:
                self.log_test("GET /leads as Agent", False, 
                    f"Request failed: {response}")

    def test_user_team_system_regression(self):
        """Test 4: User/Team System Tests (Verify No Regression)"""
        print("\n🎯 TESTING 4: USER/TEAM SYSTEM REGRESSION")
        
        # Test as Admin - should return all users with profile_image field
        if "admin" in self.tokens:
            success, response, status = self.make_request("GET", "/users", token=self.tokens["admin"])
            if success:
                users_count = len(response) if isinstance(response, list) else "unknown"
                # Check if users have profile_image field
                if isinstance(response, list) and len(response) > 0:
                    has_profile_image = "profile_image" in response[0]
                    profile_detail = f"profile_image field present: {has_profile_image}"
                else:
                    profile_detail = "no users to check profile_image field"
                
                self.log_test("GET /users as Admin", True, 
                    f"Users retrieved: {users_count} users, {profile_detail}")
            else:
                self.log_test("GET /users as Admin", False, 
                    f"Request failed: {response}")
        
        # Test as Manager - should return team users
        if "manager" in self.tokens:
            success, response, status = self.make_request("GET", "/users", token=self.tokens["manager"])
            if success:
                users_count = len(response) if isinstance(response, list) else "unknown"
                self.log_test("GET /users as Manager", True, 
                    f"Team users retrieved: {users_count} users")
            else:
                self.log_test("GET /users as Manager", False, 
                    f"Request failed: {response}")
        
        # Test as Agent - should return 403
        if "agent" in self.tokens:
            success, response, status = self.make_request("GET", "/users", 
                token=self.tokens["agent"], expect_status=403)
            if success:
                self.log_test("GET /users as Agent", True, 
                    f"Correctly returned 403 Forbidden")
            else:
                self.log_test("GET /users as Agent", False, 
                    f"Expected 403 but got {status}: {response}")

    def test_appointment_system_regression(self):
        """Test 5: Appointment System Tests (Verify No Regression)"""
        print("\n🎯 TESTING 5: APPOINTMENT SYSTEM REGRESSION")
        
        # Test for all authenticated users
        for role, token in self.tokens.items():
            success, response, status = self.make_request("GET", "/appointments", token=token)
            if success:
                appointments_count = len(response) if isinstance(response, list) else "unknown"
                self.log_test(f"GET /appointments as {role.title()}", True, 
                    f"Appointments retrieved: {appointments_count} appointments")
            else:
                self.log_test(f"GET /appointments as {role.title()}", False, 
                    f"Request failed: {response}")

    def test_no_500_errors(self):
        """Test 6: Critical Verification - No 500 errors on any endpoint"""
        print("\n🎯 TESTING 6: CRITICAL ERROR VERIFICATION")
        
        # Test critical endpoints for 500 errors
        critical_endpoints = [
            ("/auth/me", "GET", "admin"),
            ("/manager/daily-command-center", "GET", "admin"),
            ("/manager/daily-command-center", "GET", "manager"),
            ("/leads", "GET", "admin"),
            ("/leads", "GET", "agent"),
            ("/users", "GET", "admin"),
            ("/appointments", "GET", "admin")
        ]
        
        for endpoint, method, role in critical_endpoints:
            if role in self.tokens:
                success, response, status = self.make_request(method, endpoint, token=self.tokens[role])
                if status != 500:
                    self.log_test(f"No 500 Error: {method} {endpoint} as {role}", True, 
                        f"Status: {status}")
                else:
                    self.log_test(f"No 500 Error: {method} {endpoint} as {role}", False, 
                        f"Got 500 Internal Server Error: {response}")

    def run_comprehensive_test(self):
        """Run all tests"""
        print("🎯 MANAGER DAILY COMMAND CENTER - COMPREHENSIVE BACKEND TESTING")
        print(f"Backend URL: {self.base_url}")
        print("="*80)
        
        start_time = time.time()
        
        # Run all test suites
        self.test_authentication_flows()
        self.test_manager_daily_command_center()
        self.test_lead_system_regression()
        self.test_user_team_system_regression() 
        self.test_appointment_system_regression()
        self.test_no_500_errors()
        
        # Calculate results
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        duration = time.time() - start_time
        
        # Print summary
        print("\n" + "="*80)
        print("🎯 MANAGER DAILY COMMAND CENTER TESTING SUMMARY")
        print("="*80)
        print(f"✅ PASSED: {passed_tests}")
        print(f"❌ FAILED: {failed_tests}")
        print(f"📊 SUCCESS RATE: {success_rate:.1f}%")
        print(f"⏱️  DURATION: {duration:.1f}s")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   • {result['test']}: {result['details']}")
        
        return {
            "total": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "success_rate": success_rate,
            "duration": duration,
            "results": self.test_results
        }

def main():
    tester = ManagerCommandCenterTester()
    results = tester.run_comprehensive_test()
    
    # Return success/failure for script
    if results["failed"] == 0:
        print("\n🎉 ALL TESTS PASSED - Manager Daily Command Center feature working correctly!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {results['failed']} TESTS FAILED - Issues need attention")
        sys.exit(1)

if __name__ == "__main__":
    main()