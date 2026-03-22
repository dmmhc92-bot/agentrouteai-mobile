#!/usr/bin/env python3
"""
AgentRoute AI Backend API Security Hardening Verification Test
Purpose: Verify security changes haven't broken any existing backend functionality
Test Credentials: admin@agentroute.com/Admin123!, manager@agentroute.com/Manager123!, agent@agentroute.com/Agent123!
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import sys
import time

# Backend URL from frontend .env
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"

# Test Credentials (from review request)
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tokens = {}
        self.test_results = []
        
    def log_test(self, test_name, status, response_code=None, details=""):
        """Log test results"""
        status_icon = "✅" if status else "❌"
        result = {
            "test_name": test_name,
            "status": status,
            "response_code": response_code,
            "details": details
        }
        self.test_results.append(result)
        print(f"{status_icon} {test_name}: {details}")
        if response_code:
            print(f"   Response Code: {response_code}")
        
    def test_health_endpoint(self):
        """Test GET /api/health - Verify backend healthy"""
        try:
            response = self.session.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy":
                    self.log_test("Health Check", True, 200, "Backend is healthy")
                    return True
                else:
                    self.log_test("Health Check", False, 200, f"Backend unhealthy: {data}")
                    return False
            else:
                self.log_test("Health Check", False, response.status_code, "Health endpoint failed")
                return False
        except Exception as e:
            self.log_test("Health Check", False, None, f"Health check failed: {str(e)}")
            return False
    
    def test_login_all_users(self):
        """Test POST /api/auth/login - Verify all 3 accounts can still login"""
        all_success = True
        
        for role, creds in TEST_CREDENTIALS.items():
            try:
                login_data = {
                    "email": creds["email"],
                    "password": creds["password"]
                }
                response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
                
                if response.status_code == 200:
                    data = response.json()
                    if "access_token" in data and data.get("user", {}).get("email") == creds["email"]:
                        self.tokens[role] = data["access_token"]
                        user_role = data.get("user", {}).get("role", "unknown")
                        self.log_test(f"Login - {role.title()}", True, 200, 
                                    f"Successfully authenticated {creds['email']} as {user_role}")
                    else:
                        self.log_test(f"Login - {role.title()}", False, 200, 
                                    "Missing access_token or user data in response")
                        all_success = False
                else:
                    self.log_test(f"Login - {role.title()}", False, response.status_code, 
                                f"Login failed for {creds['email']}")
                    all_success = False
                    
            except Exception as e:
                self.log_test(f"Login - {role.title()}", False, None, 
                            f"Login exception for {role}: {str(e)}")
                all_success = False
                
        return all_success
    
    def test_auth_me_endpoint(self):
        """Test GET /api/auth/me - Verify user data returned correctly"""
        all_success = True
        
        for role, token in self.tokens.items():
            try:
                headers = {"Authorization": f"Bearer {token}"}
                response = self.session.get(f"{BASE_URL}/auth/me", headers=headers)
                
                if response.status_code == 200:
                    user_data = response.json()
                    if "email" in user_data:
                        expected_email = TEST_CREDENTIALS[role]["email"]
                        actual_email = user_data["email"]
                        user_role = user_data.get("role", "unknown")
                        
                        if actual_email == expected_email:
                            self.log_test(f"/auth/me - {role.title()}", True, 200, 
                                        f"User data correct: {actual_email} ({user_role})")
                        else:
                            self.log_test(f"/auth/me - {role.title()}", False, 200, 
                                        f"Email mismatch: expected {expected_email}, got {actual_email}")
                            all_success = False
                    else:
                        self.log_test(f"/auth/me - {role.title()}", False, 200, 
                                    "Missing user data in /auth/me response")
                        all_success = False
                else:
                    self.log_test(f"/auth/me - {role.title()}", False, response.status_code, 
                                f"/auth/me failed for {role}")
                    all_success = False
                    
            except Exception as e:
                self.log_test(f"/auth/me - {role.title()}", False, None, 
                            f"/auth/me exception for {role}: {str(e)}")
                all_success = False
                
        return all_success
    
    def test_leads_access(self):
        """Test GET /api/leads - Verify leads are accessible"""
        all_success = True
        
        for role, token in self.tokens.items():
            try:
                headers = {"Authorization": f"Bearer {token}"}
                response = self.session.get(f"{BASE_URL}/leads", headers=headers)
                
                if response.status_code == 200:
                    leads = response.json()
                    if isinstance(leads, list):
                        self.log_test(f"GET /leads - {role.title()}", True, 200, 
                                    f"Retrieved {len(leads)} leads")
                    else:
                        self.log_test(f"GET /leads - {role.title()}", False, 200, 
                                    "Response is not a list")
                        all_success = False
                else:
                    self.log_test(f"GET /leads - {role.title()}", False, response.status_code, 
                                f"Failed to retrieve leads for {role}")
                    all_success = False
                    
            except Exception as e:
                self.log_test(f"GET /leads - {role.title()}", False, None, 
                            f"Leads access exception for {role}: {str(e)}")
                all_success = False
                
        return all_success
    
    def test_lead_creation(self):
        """Test POST /api/leads - Verify lead creation works"""
        # Test with admin credentials
        if "admin" not in self.tokens:
            self.log_test("POST /leads", False, None, "Admin token not available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.tokens['admin']}"}
            test_lead = {
                "name": f"Security Test Lead {uuid.uuid4().hex[:8]}",
                "email": f"security-test-{uuid.uuid4().hex[:8]}@example.com",
                "phone": "555-999-1234",
                "address": "123 Security Test Ave, Test City, TC 12345",
                "insurance_types": ["Medicare Advantage", "Medicare Supplement"],
                "notes": "Created during security hardening verification test",
                "stage": "new_lead"
            }
            
            response = self.session.post(f"{BASE_URL}/leads", json=test_lead, headers=headers)
            
            if response.status_code == 200:
                lead_data = response.json()
                if "name" in lead_data and lead_data.get("name") == test_lead["name"]:
                    self.log_test("POST /leads", True, 200, 
                                f"Successfully created lead: {test_lead['name']}")
                    return True
                else:
                    self.log_test("POST /leads", False, 200, 
                                "Created lead but response format unexpected")
                    return False
            else:
                self.log_test("POST /leads", False, response.status_code, 
                            "Lead creation failed")
                return False
                
        except Exception as e:
            self.log_test("POST /leads", False, None, 
                        f"Lead creation exception: {str(e)}")
            return False
    
    def test_manager_daily_command_center(self):
        """Test GET /api/manager/daily-command-center - Verify role-based access"""
        # Test Admin/Manager: should return 200
        # Test Agent: should return 403
        
        for role, token in self.tokens.items():
            try:
                headers = {"Authorization": f"Bearer {token}"}
                response = self.session.get(f"{BASE_URL}/manager/daily-command-center", headers=headers)
                
                if role in ["admin", "manager"]:
                    # Should have access
                    if response.status_code == 200:
                        data = response.json()
                        self.log_test(f"Daily Command Center - {role.title()}", True, 200, 
                                    f"Access granted, data size: {len(str(data))} chars")
                    else:
                        self.log_test(f"Daily Command Center - {role.title()}", False, response.status_code, 
                                    f"Expected 200 for {role}, got {response.status_code}")
                        return False
                        
                elif role == "agent":
                    # Should be denied
                    if response.status_code == 403:
                        self.log_test(f"Daily Command Center - {role.title()}", True, 403, 
                                    "Access correctly denied for agent")
                    else:
                        self.log_test(f"Daily Command Center - {role.title()}", False, response.status_code, 
                                    f"Expected 403 for agent, got {response.status_code}")
                        return False
                        
            except Exception as e:
                self.log_test(f"Daily Command Center - {role.title()}", False, None, 
                            f"Exception for {role}: {str(e)}")
                return False
                
        return True
    
    def test_no_500_errors(self):
        """Verify no 500 errors on critical endpoints"""
        critical_endpoints = [
            "/health",
            "/auth/me", 
            "/leads",
            "/manager/daily-command-center"
        ]
        
        has_500_errors = False
        
        for endpoint in critical_endpoints:
            for role, token in self.tokens.items():
                try:
                    headers = {"Authorization": f"Bearer {token}"}
                    response = self.session.get(f"{BASE_URL}{endpoint}", headers=headers)
                    
                    if response.status_code == 500:
                        self.log_test(f"No 500 Errors - {endpoint} ({role})", False, 500, 
                                    "Internal server error detected")
                        has_500_errors = True
                        
                except Exception as e:
                    # Network exceptions are not 500 errors
                    continue
                    
        if not has_500_errors:
            self.log_test("No 500 Errors", True, None, 
                        "No internal server errors detected on critical endpoints")
            
        return not has_500_errors
    
    def run_security_verification_tests(self):
        """Run the full security hardening verification test suite"""
        print("🔒 AGENTROUTE AI BACKEND SECURITY HARDENING VERIFICATION")
        print("=" * 60)
        print(f"Backend URL: {BASE_URL}")
        print(f"Test Time: {datetime.now().isoformat()}")
        print()
        
        # 1. Health Check
        print("🏥 Testing Backend Health...")
        health_ok = self.test_health_endpoint()
        print()
        
        # 2. Authentication
        print("🔐 Testing Authentication (All 3 Accounts)...")
        auth_ok = self.test_login_all_users()
        print()
        
        if not auth_ok:
            print("❌ Authentication failed - cannot proceed with other tests")
            return False
            
        # 3. User Data Retrieval
        print("👤 Testing User Data Retrieval...")
        user_data_ok = self.test_auth_me_endpoint()
        print()
        
        # 4. Leads Access
        print("📋 Testing Leads Access...")
        leads_access_ok = self.test_leads_access()
        print()
        
        # 5. Lead Creation
        print("➕ Testing Lead Creation...")
        lead_creation_ok = self.test_lead_creation()
        print()
        
        # 6. Role-based Access Control
        print("🛡️ Testing Role-based Access Control...")
        rbac_ok = self.test_manager_daily_command_center()
        print()
        
        # 7. No 500 Errors
        print("🚫 Verifying No 500 Errors...")
        no_500_ok = self.test_no_500_errors()
        print()
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["status"]])
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print("📊 SECURITY VERIFICATION RESULTS")
        print("=" * 40)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        print()
        
        if success_rate >= 95:
            print("🎉 SECURITY VERIFICATION PASSED")
            print("✅ Backend API security hardening verification successful")
            print("✅ All critical functionality remains intact")
            print("✅ Authentication and authorization working correctly")
            print("✅ No 500 errors detected")
            return True
        else:
            print("⚠️ SECURITY VERIFICATION ISSUES DETECTED")
            failed_tests = [r for r in self.test_results if not r["status"]]
            for test in failed_tests:
                print(f"❌ {test['test_name']}: {test['details']}")
            return False

def main():
    tester = APITester()
    success = tester.run_security_verification_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()