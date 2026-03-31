#!/usr/bin/env python3
"""
Comprehensive Backend API Test for Apple App Store Submission
Tests all critical endpoints with Apple tester account credentials
"""
import requests
import requests.exceptions
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"
APPLE_TESTER_EMAIL = "admin_tester@apple.com"
APPLE_TESTER_PASSWORD = "AppleTest123!"

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.user_data = None
        self.test_results = []
        
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
    
    def make_request(self, method, endpoint, data=None, headers=None, auth_required=True):
        """Make HTTP request with proper headers"""
        url = f"{BASE_URL}{endpoint}"
        
        # Set default headers
        request_headers = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)
        
        # Add auth token if required and available
        if auth_required and self.auth_token:
            request_headers["Authorization"] = f"Bearer {self.auth_token}"
        
        try:
            # Configure session with SSL verification and timeout
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
    
    def test_authentication_flow(self):
        """Test 1: Authentication Flow"""
        print("🔐 Testing Authentication Flow")
        print("=" * 50)
        
        # Test login with Apple tester credentials
        login_data = {
            "email": APPLE_TESTER_EMAIL,
            "password": APPLE_TESTER_PASSWORD
        }
        
        response = self.make_request("POST", "/auth/login", login_data, auth_required=False)
        
        if response and response.status_code == 200:
            try:
                data = response.json()
                self.auth_token = data.get("access_token")
                self.user_data = data.get("user", {})
                
                # Verify user has required properties
                subscription_status = self.user_data.get("subscription_status")
                apple_reviewer_bypass = self.user_data.get("apple_reviewer_bypass", False)
                
                if subscription_status == "premium":
                    self.log_test("Login with Apple tester credentials", True, 
                                f"User: {self.user_data.get('email')}, Role: {self.user_data.get('role')}")
                else:
                    self.log_test("Login with Apple tester credentials", False, 
                                f"Expected premium subscription, got: {subscription_status}")
                
                if apple_reviewer_bypass:
                    self.log_test("Apple reviewer bypass flag", True, "apple_reviewer_bypass = true")
                else:
                    self.log_test("Apple reviewer bypass flag", False, 
                                f"Expected apple_reviewer_bypass=true, got: {apple_reviewer_bypass}")
                
            except Exception as e:
                self.log_test("Login response parsing", False, f"Error parsing response: {e}")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("Login with Apple tester credentials", False, error_msg)
        
        # Test get current user profile
        if self.auth_token:
            response = self.make_request("GET", "/auth/me")
            if response and response.status_code == 200:
                try:
                    user_data = response.json()
                    self.log_test("Get current user profile", True, 
                                f"Retrieved profile for: {user_data.get('email')}")
                except Exception as e:
                    self.log_test("Get current user profile", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}"
                self.log_test("Get current user profile", False, error_msg)
    
    def test_lead_management(self):
        """Test 2: Lead Management CRUD"""
        print("📋 Testing Lead Management")
        print("=" * 50)
        
        if not self.auth_token:
            self.log_test("Lead Management", False, "No auth token available")
            return
        
        # Test GET /leads - List all leads
        response = self.make_request("GET", "/leads")
        if response and response.status_code == 200:
            try:
                leads = response.json()
                self.log_test("GET /leads - List all leads", True, 
                            f"Retrieved {len(leads)} leads")
            except Exception as e:
                self.log_test("GET /leads - List all leads", False, f"Error parsing response: {e}")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("GET /leads - List all leads", False, error_msg)
        
        # Test POST /leads - Create a new test lead
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        test_lead_data = {
            "name": f"Apple Test Lead {unique_id}",
            "phone": f"555-{unique_id[:4]}",
            "email": f"apple.test.{unique_id}@example.com",
            "address": "123 Apple Test Street, Cupertino, CA 95014",
            "notes": "Test lead created for Apple App Store review",
            "source": "apple_review_test"
        }
        
        response = self.make_request("POST", "/leads", test_lead_data)
        created_lead_id = None
        
        if response and response.status_code in [200, 201]:
            try:
                lead_data = response.json()
                created_lead_id = lead_data.get("id")
                self.log_test("POST /leads - Create new lead", True, 
                            f"Created lead: {lead_data.get('name')} (ID: {created_lead_id})")
            except Exception as e:
                self.log_test("POST /leads - Create new lead", False, f"Error parsing response: {e}")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("POST /leads - Create new lead", False, error_msg)
        
        # Test GET /leads/{id} - Get lead details
        if created_lead_id:
            response = self.make_request("GET", f"/leads/{created_lead_id}")
            if response and response.status_code == 200:
                try:
                    lead_data = response.json()
                    self.log_test("GET /leads/{id} - Get lead details", True, 
                                f"Retrieved lead: {lead_data.get('name')}")
                except Exception as e:
                    self.log_test("GET /leads/{id} - Get lead details", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}"
                self.log_test("GET /leads/{id} - Get lead details", False, error_msg)
            
            # Test PUT /leads/{id} - Update lead
            update_data = {
                "notes": "Updated notes for Apple App Store review testing"
            }
            response = self.make_request("PUT", f"/leads/{created_lead_id}", update_data)
            if response and response.status_code == 200:
                try:
                    updated_lead = response.json()
                    self.log_test("PUT /leads/{id} - Update lead", True, 
                                f"Updated lead notes")
                except Exception as e:
                    self.log_test("PUT /leads/{id} - Update lead", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("PUT /leads/{id} - Update lead", False, error_msg)
    
    def test_pipeline(self):
        """Test 3: Pipeline Data"""
        print("📊 Testing Pipeline")
        print("=" * 50)
        
        if not self.auth_token:
            self.log_test("Pipeline", False, "No auth token available")
            return
        
        response = self.make_request("GET", "/pipeline")
        if response and response.status_code == 200:
            try:
                pipeline_data = response.json()
                stages = pipeline_data.get("stages", [])
                summary = pipeline_data.get("summary", {})
                self.log_test("GET /pipeline - Get pipeline data", True, 
                            f"Retrieved pipeline with {len(stages)} stages")
            except Exception as e:
                self.log_test("GET /pipeline - Get pipeline data", False, f"Error parsing response: {e}")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("GET /pipeline - Get pipeline data", False, error_msg)
    
    def test_feed(self):
        """Test 4: Feed (Team Activity)"""
        print("📢 Testing Feed (Team Activity)")
        print("=" * 50)
        
        if not self.auth_token:
            self.log_test("Feed", False, "No auth token available")
            return
        
        # Test GET /feed - Get feed posts
        response = self.make_request("GET", "/feed")
        if response and response.status_code == 200:
            try:
                feed_data = response.json()
                self.log_test("GET /feed - Get feed posts", True, 
                            f"Retrieved {len(feed_data)} feed posts")
            except Exception as e:
                self.log_test("GET /feed - Get feed posts", False, f"Error parsing response: {e}")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("GET /feed - Get feed posts", False, error_msg)
        
        # Test POST /feed - Create a feed post
        test_post_data = {
            "content": "Apple App Store review test post - testing feed functionality",
            "post_type": "update"
        }
        
        response = self.make_request("POST", "/feed", test_post_data)
        if response and response.status_code in [200, 201]:
            try:
                post_data = response.json()
                self.log_test("POST /feed - Create feed post", True, 
                            f"Created feed post: {post_data.get('id', 'unknown')}")
            except Exception as e:
                self.log_test("POST /feed - Create feed post", False, f"Error parsing response: {e}")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("POST /feed - Create feed post", False, error_msg)
    
    def test_appointments(self):
        """Test 5: Appointments CRUD"""
        print("📅 Testing Appointments")
        print("=" * 50)
        
        if not self.auth_token:
            self.log_test("Appointments", False, "No auth token available")
            return
        
        # Test GET /appointments - List appointments
        response = self.make_request("GET", "/appointments")
        if response and response.status_code == 200:
            try:
                appointments = response.json()
                self.log_test("GET /appointments - List appointments", True, 
                            f"Retrieved {len(appointments)} appointments")
            except Exception as e:
                self.log_test("GET /appointments - List appointments", False, f"Error parsing response: {e}")
        else:
            error_msg = "No response"
            if response:
                error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("GET /appointments - List appointments", False, error_msg)
        
        # First, get a lead ID for creating an appointment
        leads_response = self.make_request("GET", "/leads")
        lead_id = None
        if leads_response and leads_response.status_code == 200:
            try:
                leads = leads_response.json()
                if leads:
                    lead_id = leads[0].get("id")
            except:
                pass
        
        # Test POST /appointments - Create appointment
        if lead_id:
            tomorrow = datetime.now() + timedelta(days=1)
            test_appointment_data = {
                "lead_id": lead_id,
                "appointment_date": tomorrow.strftime("%Y-%m-%d"),
                "appointment_time": "14:00",
                "notes": "Apple App Store review test appointment",
                "status": "scheduled",
                "appointment_type": "in_person"
            }
            
            response = self.make_request("POST", "/appointments", test_appointment_data)
            if response and response.status_code in [200, 201]:
                try:
                    appointment_data = response.json()
                    self.log_test("POST /appointments - Create appointment", True, 
                                f"Created appointment: {appointment_data.get('id', 'unknown')}")
                except Exception as e:
                    self.log_test("POST /appointments - Create appointment", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("POST /appointments - Create appointment", False, error_msg)
        else:
            self.log_test("POST /appointments - Create appointment", False, "No lead ID available")
    
    def test_scope_of_appointment(self):
        """Test 6: Scope of Appointment (SOA)"""
        print("📝 Testing Scope of Appointment (SOA)")
        print("=" * 50)
        
        if not self.auth_token:
            self.log_test("SOA", False, "No auth token available")
            return
        
        # First, get a lead ID for creating SOA
        leads_response = self.make_request("GET", "/leads")
        lead_id = None
        if leads_response and leads_response.status_code == 200:
            try:
                leads = leads_response.json()
                if leads:
                    lead_id = leads[0].get("id")
            except:
                pass
        
        # Test POST /scope - Create SOA form
        if lead_id:
            test_soa_data = {
                "lead_id": lead_id,
                "form_fields": {
                    "beneficiary_name": "Apple Test Beneficiary",
                    "beneficiary_address": "123 Apple Test Street, Cupertino, CA 95014",
                    "appointment_date": datetime.now().strftime("%Y-%m-%d"),
                    "products_discussed": ["Medicare Advantage", "Part D"]
                },
                "typed_name": "Apple Test Beneficiary",
                "signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "agent_typed_name": "Apple Test Agent",
                "agent_signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
            
            response = self.make_request("POST", "/scope", test_soa_data)
            created_soa_id = None
            
            if response and response.status_code in [200, 201]:
                try:
                    soa_data = response.json()
                    created_soa_id = soa_data.get("id")
                    self.log_test("POST /scope - Create SOA form", True, 
                                f"Created SOA: {created_soa_id}")
                except Exception as e:
                    self.log_test("POST /scope - Create SOA form", False, f"Error parsing response: {e}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("POST /scope - Create SOA form", False, error_msg)
            
            # Test GET /scope/{id} - Get SOA details
            if created_soa_id:
                response = self.make_request("GET", f"/scope/{created_soa_id}")
                if response and response.status_code == 200:
                    try:
                        soa_data = response.json()
                        has_dual_signature = bool(soa_data.get("signature") and soa_data.get("agent_signature"))
                        self.log_test("GET /scope/{id} - Get SOA details", True, 
                                    f"Retrieved SOA with dual signatures: {has_dual_signature}")
                    except Exception as e:
                        self.log_test("GET /scope/{id} - Get SOA details", False, f"Error parsing response: {e}")
                else:
                    error_msg = "No response"
                    if response:
                        error_msg = f"Status: {response.status_code}"
                    self.log_test("GET /scope/{id} - Get SOA details", False, error_msg)
        else:
            self.log_test("SOA tests", False, "No lead ID available")
    
    def test_legal_pages(self):
        """Test 7: Legal Pages (Public - No Auth)"""
        print("⚖️ Testing Legal Pages (Public)")
        print("=" * 50)
        
        legal_endpoints = [
            ("/privacy", "Privacy policy page"),
            ("/support", "Support page"),
            ("/terms", "Terms of service")
        ]
        
        for endpoint, description in legal_endpoints:
            response = self.make_request("GET", endpoint, auth_required=False)
            if response and response.status_code == 200:
                content_type = response.headers.get("content-type", "")
                has_html = "html" in content_type.lower() or "<html" in response.text.lower()
                content_length = len(response.text)
                
                if has_html and content_length > 100:
                    self.log_test(f"GET {endpoint} - {description}", True, 
                                f"Returned HTML content ({content_length} chars)")
                else:
                    self.log_test(f"GET {endpoint} - {description}", False, 
                                f"Invalid content: type={content_type}, length={content_length}")
            else:
                error_msg = "No response"
                if response:
                    error_msg = f"Status: {response.status_code}"
                self.log_test(f"GET {endpoint} - {description}", False, error_msg)
    
    def test_error_handling(self):
        """Test 8: Verify No 500 Errors"""
        print("🚨 Testing Error Handling (No 500 Errors)")
        print("=" * 50)
        
        # Test various endpoints that might cause 500 errors
        test_cases = [
            ("GET", "/nonexistent", "Non-existent endpoint"),
            ("GET", "/leads/invalid-id", "Invalid lead ID"),
            ("POST", "/leads", {"invalid": "data"}, "Invalid lead data"),
            ("GET", "/appointments/invalid-id", "Invalid appointment ID"),
        ]
        
        for method, endpoint, description, *data in test_cases:
            request_data = data[0] if data else None
            response = self.make_request(method, endpoint, request_data)
            
            if response:
                if response.status_code == 500:
                    self.log_test(f"{method} {endpoint} - {description}", False, 
                                f"Returned 500 error: {response.text[:200]}")
                else:
                    expected_codes = [400, 401, 404, 422]  # Valid error codes
                    if response.status_code in expected_codes:
                        self.log_test(f"{method} {endpoint} - {description}", True, 
                                    f"Returned proper error code: {response.status_code}")
                    else:
                        self.log_test(f"{method} {endpoint} - {description}", True, 
                                    f"No 500 error (got {response.status_code})")
            else:
                self.log_test(f"{method} {endpoint} - {description}", False, "No response")
    
    def run_all_tests(self):
        """Run all test scenarios"""
        print("🍎 APPLE APP STORE SUBMISSION - BACKEND API TESTS")
        print("=" * 60)
        print(f"Base URL: {BASE_URL}")
        print(f"Test Account: {APPLE_TESTER_EMAIL}")
        print("=" * 60)
        print()
        
        # Run all test scenarios
        self.test_authentication_flow()
        self.test_lead_management()
        self.test_pipeline()
        self.test_feed()
        self.test_appointments()
        self.test_scope_of_appointment()
        self.test_legal_pages()
        self.test_error_handling()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
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
            print("-" * 40)
            for result in self.test_results:
                if not result["success"]:
                    print(f"• {result['test']}")
                    if result["details"]:
                        print(f"  {result['details']}")
            print()
        
        # Check for critical issues that would cause Apple rejection
        critical_issues = []
        for result in self.test_results:
            if not result["success"]:
                if "500" in result.get("details", ""):
                    critical_issues.append(f"500 Error: {result['test']}")
                elif "Login" in result["test"]:
                    critical_issues.append(f"Authentication Issue: {result['test']}")
                elif "Legal" in result["test"]:
                    critical_issues.append(f"Legal Page Issue: {result['test']}")
        
        if critical_issues:
            print("🚨 CRITICAL ISSUES (May cause Apple rejection):")
            print("-" * 50)
            for issue in critical_issues:
                print(f"• {issue}")
            print()
        else:
            print("✅ No critical issues found that would cause Apple rejection!")
            print()

if __name__ == "__main__":
    tester = APITester()
    tester.run_all_tests()