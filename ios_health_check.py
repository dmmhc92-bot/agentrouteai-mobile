#!/usr/bin/env python3
"""
iOS Build Health Check for AgentRoute AI
Testing critical endpoints before iOS deployment
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://pipeline-proof.preview.emergentagent.com/api"

class IOSHealthChecker:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        
    def log_test(self, test_name, success, status_code=None, error=None, response_data=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "status_code": status_code,
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response_preview"] = str(response_data)[:200] + "..." if len(str(response_data)) > 200 else str(response_data)
        
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if status_code:
            print(f"    Status: {status_code}")
        if error:
            print(f"    Error: {error}")
        if response_data and success:
            preview = str(response_data)[:100] + "..." if len(str(response_data)) > 100 else str(response_data)
            print(f"    Response: {preview}")
        print()

    def test_auth_login(self):
        """Test POST /api/auth/login with admin credentials"""
        try:
            url = f"{BACKEND_URL}/auth/login"
            payload = {
                "email": "admin@agentroute.com",
                "password": "Admin123!"
            }
            
            response = self.session.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data and "user" in data:
                    self.auth_token = data["access_token"]
                    self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                    user_info = f"User: {data['user'].get('name')} ({data['user'].get('email')}) - Role: {data['user'].get('role')}"
                    self.log_test("POST /api/auth/login", True, response.status_code, response_data=user_info)
                    return True
                else:
                    self.log_test("POST /api/auth/login", False, response.status_code, "Missing access_token or user in response")
                    return False
            else:
                self.log_test("POST /api/auth/login", False, response.status_code, response.text[:200])
                return False
                
        except Exception as e:
            self.log_test("POST /api/auth/login", False, error=str(e))
            return False

    def test_auth_me(self):
        """Test GET /api/auth/me (verify user data returned)"""
        if not self.auth_token:
            self.log_test("GET /api/auth/me", False, error="No auth token available")
            return False
            
        try:
            url = f"{BACKEND_URL}/auth/me"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "email" in data and "role" in data:
                    user_info = f"ID: {data.get('id')[:8]}..., Email: {data.get('email')}, Role: {data.get('role')}"
                    self.log_test("GET /api/auth/me", True, response.status_code, response_data=user_info)
                    return True
                else:
                    self.log_test("GET /api/auth/me", False, response.status_code, "Missing required user fields")
                    return False
            else:
                self.log_test("GET /api/auth/me", False, response.status_code, response.text[:200])
                return False
                
        except Exception as e:
            self.log_test("GET /api/auth/me", False, error=str(e))
            return False

    def test_leads_get(self):
        """Test GET /api/leads (verify list returns)"""
        if not self.auth_token:
            self.log_test("GET /api/leads", False, error="No auth token available")
            return False
            
        try:
            url = f"{BACKEND_URL}/leads"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    leads_info = f"Retrieved {len(data)} leads"
                    self.log_test("GET /api/leads", True, response.status_code, response_data=leads_info)
                    return True
                else:
                    self.log_test("GET /api/leads", False, response.status_code, "Response is not a list")
                    return False
            else:
                self.log_test("GET /api/leads", False, response.status_code, response.text[:200])
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads", False, error=str(e))
            return False

    def test_leads_create(self):
        """Test POST /api/leads (create test lead)"""
        if not self.auth_token:
            self.log_test("POST /api/leads", False, error="No auth token available")
            return False
            
        try:
            url = f"{BACKEND_URL}/leads"
            payload = {
                "name": "iOS Test Lead",
                "phone": "555-0123",
                "email": "iostest@example.com",
                "address": "123 Test St, Test City, TS 12345",
                "notes": "Test lead created during iOS build health check",
                "source": "api_test"
            }
            
            response = self.session.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "name" in data:
                    lead_info = f"Created lead: {data.get('name')} (ID: {data.get('id')[:8]}...)"
                    self.log_test("POST /api/leads", True, response.status_code, response_data=lead_info)
                    return True
                else:
                    self.log_test("POST /api/leads", False, response.status_code, "Missing required lead fields")
                    return False
            else:
                self.log_test("POST /api/leads", False, response.status_code, response.text[:200])
                return False
                
        except Exception as e:
            self.log_test("POST /api/leads", False, error=str(e))
            return False

    def test_privacy_policy(self):
        """Test GET /api/privacy-policy (verify 200 and HTML content)"""
        try:
            url = f"{BACKEND_URL}/privacy-policy"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                content = response.text
                if "privacy" in content.lower() and len(content) > 100:
                    content_info = f"HTML content length: {len(content)} chars"
                    self.log_test("GET /api/privacy-policy", True, response.status_code, response_data=content_info)
                    return True
                else:
                    self.log_test("GET /api/privacy-policy", False, response.status_code, "Content too short or missing 'privacy'")
                    return False
            else:
                self.log_test("GET /api/privacy-policy", False, response.status_code, response.text[:200])
                return False
                
        except Exception as e:
            self.log_test("GET /api/privacy-policy", False, error=str(e))
            return False

    def test_terms_of_service(self):
        """Test GET /api/terms-of-service (verify 200 and HTML content)"""
        try:
            url = f"{BACKEND_URL}/terms-of-service"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                content = response.text
                if "terms" in content.lower() and len(content) > 100:
                    content_info = f"HTML content length: {len(content)} chars"
                    self.log_test("GET /api/terms-of-service", True, response.status_code, response_data=content_info)
                    return True
                else:
                    self.log_test("GET /api/terms-of-service", False, response.status_code, "Content too short or missing 'terms'")
                    return False
            else:
                self.log_test("GET /api/terms-of-service", False, response.status_code, response.text[:200])
                return False
                
        except Exception as e:
            self.log_test("GET /api/terms-of-service", False, error=str(e))
            return False

    def test_delete_account_endpoint(self):
        """Test DELETE /api/auth/account endpoint exists (don't actually delete)"""
        if not self.auth_token:
            self.log_test("DELETE /api/auth/account (endpoint check)", False, error="No auth token available")
            return False
            
        try:
            # Use HEAD request to check if endpoint exists without actually deleting
            url = f"{BACKEND_URL}/auth/account"
            response = self.session.head(url, timeout=10)
            
            # HEAD might not be supported, so try OPTIONS
            if response.status_code == 405:  # Method Not Allowed
                response = self.session.options(url, timeout=10)
            
            # If still not supported, we know the endpoint exists if we get 405 or similar
            if response.status_code in [200, 405, 501]:  # OK, Method Not Allowed, or Not Implemented
                self.log_test("DELETE /api/auth/account (endpoint check)", True, response.status_code, response_data="Endpoint exists")
                return True
            else:
                self.log_test("DELETE /api/auth/account (endpoint check)", False, response.status_code, "Endpoint may not exist")
                return False
                
        except Exception as e:
            self.log_test("DELETE /api/auth/account (endpoint check)", False, error=str(e))
            return False

    def run_health_check(self):
        """Run all health check tests"""
        print("🚀 Starting iOS Build Health Check")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 60)
        
        # Test sequence
        tests = [
            ("Auth Login", self.test_auth_login),
            ("Auth Me", self.test_auth_me),
            ("Leads Get", self.test_leads_get),
            ("Leads Create", self.test_leads_create),
            ("Privacy Policy", self.test_privacy_policy),
            ("Terms of Service", self.test_terms_of_service),
            ("Delete Account Endpoint", self.test_delete_account_endpoint)
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            if test_func():
                passed += 1
        
        print("=" * 60)
        print(f"📊 HEALTH CHECK RESULTS: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - Ready for iOS build!")
            return True
        else:
            print("⚠️  SOME TESTS FAILED - Review issues before iOS build")
            failed_tests = [r for r in self.test_results if not r["success"]]
            print("\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"  - {test['test']}: {test.get('error', 'Unknown error')}")
            return False

if __name__ == "__main__":
    checker = IOSHealthChecker()
    success = checker.run_health_check()
    sys.exit(0 if success else 1)