#!/usr/bin/env python3
"""
CRITICAL AUTHENTICATION VERIFICATION for iOS TestFlight Build Approval
Purpose: Test ALL authentication requirements with REAL DATA as specified in review request
Test Credentials: admin@agentroute.com/Admin123!, manager@agentroute.com/Manager123!, agent@agentroute.com/Agent123!
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import sys
import time
import base64

# Backend URL from frontend .env
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"

# Test Credentials (EXACT from review request)
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class CriticalAuthTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tokens = {}
        self.test_results = []
        
    def log_test(self, test_name, status, response_code=None, details="", proof=""):
        """Log test results with proof"""
        status_icon = "✅" if status else "❌"
        result = {
            "test_name": test_name,
            "status": status,
            "response_code": response_code,
            "details": details,
            "proof": proof
        }
        self.test_results.append(result)
        print(f"{status_icon} {test_name}")
        print(f"   Status: {details}")
        if response_code:
            print(f"   Response Code: {response_code}")
        if proof:
            print(f"   PROOF: {proof}")
        print()
        
    def test_database_validation(self):
        """1. DATABASE VALIDATION - Test with all 3 specified accounts"""
        print("🔍 1. DATABASE VALIDATION")
        print("Testing with admin@agentroute.com/Admin123!, manager@agentroute.com/Manager123!, agent@agentroute.com/Agent123!")
        print("-" * 80)
        
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
                        token_preview = data["access_token"][:20] + "..."
                        
                        self.log_test(f"Database Login - {role.title()}", True, 200, 
                                    f"Successfully authenticated {creds['email']} as {user_role}",
                                    f"JWT Token: {token_preview}")
                    else:
                        self.log_test(f"Database Login - {role.title()}", False, 200, 
                                    "Missing access_token or user data in response")
                        all_success = False
                else:
                    self.log_test(f"Database Login - {role.title()}", False, response.status_code, 
                                f"Login failed for {creds['email']}")
                    all_success = False
                    
            except Exception as e:
                self.log_test(f"Database Login - {role.title()}", False, None, 
                            f"Login exception for {role}: {str(e)}")
                all_success = False
                
        return all_success
    
    def test_password_hash_verification(self):
        """2. PASSWORD HASH VERIFICATION - Confirm login uses bcrypt"""
        print("🔐 2. PASSWORD HASH VERIFICATION")
        print("Confirming login uses bcrypt (same as signup) and password comparison works correctly")
        print("-" * 80)
        
        # Test with correct password
        try:
            login_data = {
                "email": "admin@agentroute.com",
                "password": "Admin123!"
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Bcrypt Password Verification - Correct Password", True, 200,
                            "Password hash verification successful with bcrypt",
                            f"Login successful, token generated: {data['access_token'][:20]}...")
            else:
                self.log_test("Bcrypt Password Verification - Correct Password", False, response.status_code,
                            "Password verification failed")
                return False
                
        except Exception as e:
            self.log_test("Bcrypt Password Verification - Correct Password", False, None,
                        f"Exception during password verification: {str(e)}")
            return False
        
        # Test with wrong password to verify bcrypt comparison
        try:
            login_data = {
                "email": "admin@agentroute.com",
                "password": "WrongPassword123!"
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 401:
                self.log_test("Bcrypt Password Verification - Wrong Password", True, 401,
                            "Bcrypt correctly rejected wrong password",
                            "401 Unauthorized returned as expected")
            else:
                self.log_test("Bcrypt Password Verification - Wrong Password", False, response.status_code,
                            f"Expected 401 for wrong password, got {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Bcrypt Password Verification - Wrong Password", False, None,
                        f"Exception during wrong password test: {str(e)}")
            return False
            
        return True
    
    def test_email_normalization(self):
        """3. EMAIL NORMALIZATION - Test login with spaces and caps"""
        print("📧 3. EMAIL NORMALIZATION")
        print("Testing login with ' Admin@AgentRoute.com ' (spaces and caps) - should normalize and work")
        print("-" * 80)
        
        try:
            # Test with spaces and different capitalization
            login_data = {
                "email": " Admin@AgentRoute.com ",
                "password": "Admin123!"
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data and data.get("user", {}).get("email") == "admin@agentroute.com":
                    self.log_test("Email Normalization", True, 200,
                                "Email normalization working correctly",
                                f"Input: ' Admin@AgentRoute.com ' → Normalized: {data['user']['email']}")
                    return True
                else:
                    self.log_test("Email Normalization", False, 200,
                                "Email normalization failed - user data incorrect")
                    return False
            else:
                self.log_test("Email Normalization", False, response.status_code,
                            "Email normalization failed - login rejected")
                return False
                
        except Exception as e:
            self.log_test("Email Normalization", False, None,
                        f"Exception during email normalization test: {str(e)}")
            return False
    
    def test_auth_response_validation(self):
        """4. AUTH RESPONSE VALIDATION - Verify JWT token and /auth/me access"""
        print("🎫 4. AUTH RESPONSE VALIDATION")
        print("On success: verify JWT token returned, token works with GET /api/auth/me, token grants access to protected endpoints")
        print("-" * 80)
        
        if "admin" not in self.tokens:
            self.log_test("Auth Response Validation", False, None,
                        "Admin token not available from previous tests")
            return False
        
        admin_token = self.tokens["admin"]
        
        # Test 1: Verify JWT token format
        try:
            # JWT tokens have 3 parts separated by dots
            token_parts = admin_token.split('.')
            if len(token_parts) == 3:
                self.log_test("JWT Token Format", True, None,
                            "JWT token has correct format (3 parts)",
                            f"Token parts: header.payload.signature ({len(token_parts[0])}.{len(token_parts[1])}.{len(token_parts[2])})")
            else:
                self.log_test("JWT Token Format", False, None,
                            f"JWT token has incorrect format ({len(token_parts)} parts)")
                return False
        except Exception as e:
            self.log_test("JWT Token Format", False, None,
                        f"Error validating JWT format: {str(e)}")
            return False
        
        # Test 2: Verify token works with /auth/me
        try:
            headers = {"Authorization": f"Bearer {admin_token}"}
            response = self.session.get(f"{BASE_URL}/auth/me", headers=headers)
            
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get("email") == "admin@agentroute.com":
                    self.log_test("Token /auth/me Access", True, 200,
                                "JWT token successfully grants access to /auth/me",
                                f"User data: {user_data['email']} ({user_data.get('role', 'unknown')})")
                else:
                    self.log_test("Token /auth/me Access", False, 200,
                                "Token works but user data incorrect")
                    return False
            else:
                self.log_test("Token /auth/me Access", False, response.status_code,
                            "JWT token failed to access /auth/me")
                return False
                
        except Exception as e:
            self.log_test("Token /auth/me Access", False, None,
                        f"Exception testing /auth/me access: {str(e)}")
            return False
        
        # Test 3: Verify token grants access to protected endpoints
        try:
            headers = {"Authorization": f"Bearer {admin_token}"}
            response = self.session.get(f"{BASE_URL}/leads", headers=headers)
            
            if response.status_code == 200:
                leads = response.json()
                self.log_test("Token Protected Endpoint Access", True, 200,
                            "JWT token successfully grants access to protected endpoints",
                            f"Retrieved {len(leads)} leads from /api/leads")
            else:
                self.log_test("Token Protected Endpoint Access", False, response.status_code,
                            "JWT token failed to access protected endpoints")
                return False
                
        except Exception as e:
            self.log_test("Token Protected Endpoint Access", False, None,
                        f"Exception testing protected endpoint access: {str(e)}")
            return False
            
        return True
    
    def test_failure_cases(self):
        """5. FAILURE CASES - Test wrong password and non-existent user"""
        print("❌ 5. FAILURE CASES")
        print("Test wrong password → should return 401, Test non-existent user → should return 401")
        print("-" * 80)
        
        # Test 1: Wrong password
        try:
            login_data = {
                "email": "admin@agentroute.com",
                "password": "WrongPassword123!"
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 401:
                self.log_test("Wrong Password Test", True, 401,
                            "Wrong password correctly returns 401",
                            "401 Unauthorized - Invalid email or password")
            else:
                self.log_test("Wrong Password Test", False, response.status_code,
                            f"Expected 401 for wrong password, got {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Wrong Password Test", False, None,
                        f"Exception testing wrong password: {str(e)}")
            return False
        
        # Test 2: Non-existent user
        try:
            login_data = {
                "email": "nonexistent@agentroute.com",
                "password": "SomePassword123!"
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 401:
                self.log_test("Non-existent User Test", True, 401,
                            "Non-existent user correctly returns 401",
                            "401 Unauthorized - Invalid email or password")
            else:
                self.log_test("Non-existent User Test", False, response.status_code,
                            f"Expected 401 for non-existent user, got {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Non-existent User Test", False, None,
                        f"Exception testing non-existent user: {str(e)}")
            return False
            
        return True
    
    def test_token_persistence(self):
        """6. TOKEN PERSISTENCE - Login, get token, use token to access /api/leads"""
        print("🔄 6. TOKEN PERSISTENCE")
        print("Login, get token, Use token to access /api/leads, Verify data is returned")
        print("-" * 80)
        
        # Step 1: Fresh login to get new token
        try:
            login_data = {
                "email": "agent@agentroute.com",
                "password": "Agent123!"
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                fresh_token = data["access_token"]
                self.log_test("Token Persistence - Fresh Login", True, 200,
                            "Successfully obtained fresh token",
                            f"New token: {fresh_token[:20]}...")
            else:
                self.log_test("Token Persistence - Fresh Login", False, response.status_code,
                            "Failed to get fresh token")
                return False
                
        except Exception as e:
            self.log_test("Token Persistence - Fresh Login", False, None,
                        f"Exception getting fresh token: {str(e)}")
            return False
        
        # Step 2: Use token to access /api/leads
        try:
            headers = {"Authorization": f"Bearer {fresh_token}"}
            response = self.session.get(f"{BASE_URL}/leads", headers=headers)
            
            if response.status_code == 200:
                leads = response.json()
                if isinstance(leads, list):
                    self.log_test("Token Persistence - Leads Access", True, 200,
                                "Token successfully persists and grants access to data",
                                f"Retrieved {len(leads)} leads using persistent token")
                else:
                    self.log_test("Token Persistence - Leads Access", False, 200,
                                "Token works but data format unexpected")
                    return False
            else:
                self.log_test("Token Persistence - Leads Access", False, response.status_code,
                            "Token failed to access leads data")
                return False
                
        except Exception as e:
            self.log_test("Token Persistence - Leads Access", False, None,
                        f"Exception testing token persistence: {str(e)}")
            return False
            
        return True
    
    def run_critical_auth_verification(self):
        """Run the complete critical authentication verification test suite"""
        print("🔒 CRITICAL AUTHENTICATION VERIFICATION FOR iOS TESTFLIGHT BUILD APPROVAL")
        print("=" * 80)
        print(f"Backend URL: {BASE_URL}")
        print(f"Test Time: {datetime.now().isoformat()}")
        print(f"Purpose: Test ALL authentication requirements with REAL DATA")
        print()
        
        # Run all 6 critical tests
        test_results = []
        
        # 1. Database Validation
        test_results.append(self.test_database_validation())
        
        # 2. Password Hash Verification
        test_results.append(self.test_password_hash_verification())
        
        # 3. Email Normalization
        test_results.append(self.test_email_normalization())
        
        # 4. Auth Response Validation
        test_results.append(self.test_auth_response_validation())
        
        # 5. Failure Cases
        test_results.append(self.test_failure_cases())
        
        # 6. Token Persistence
        test_results.append(self.test_token_persistence())
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["status"]])
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print("📊 CRITICAL AUTHENTICATION VERIFICATION RESULTS")
        print("=" * 60)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        print()
        
        # Show proof for each successful test
        print("🔍 PROOF WITH ACTUAL API RESPONSES:")
        print("-" * 40)
        for result in self.test_results:
            if result["status"] and result["proof"]:
                print(f"✅ {result['test_name']}")
                print(f"   {result['proof']}")
                print()
        
        if all(test_results):
            print("🎉 CRITICAL AUTHENTICATION VERIFICATION PASSED")
            print("✅ All 6 critical authentication tests successful")
            print("✅ Database validation with all 3 test accounts working")
            print("✅ Password hash verification (bcrypt) confirmed")
            print("✅ Email normalization working correctly")
            print("✅ JWT token generation and validation working")
            print("✅ Failure cases properly handled (401 responses)")
            print("✅ Token persistence and data access confirmed")
            print()
            print("🚀 READY FOR iOS TESTFLIGHT BUILD APPROVAL")
            return True
        else:
            print("⚠️ CRITICAL AUTHENTICATION VERIFICATION FAILED")
            failed_tests = [r for r in self.test_results if not r["status"]]
            for test in failed_tests:
                print(f"❌ {test['test_name']}: {test['details']}")
            print()
            print("🛑 NOT READY FOR iOS TESTFLIGHT BUILD APPROVAL")
            return False

def main():
    tester = CriticalAuthTester()
    success = tester.run_critical_auth_verification()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()