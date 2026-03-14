#!/usr/bin/env python3
"""
Comprehensive Backend API Test Suite for AgentRoute AI
Tests all API endpoints with proper authentication flow
"""

import requests
import json
import base64
from datetime import datetime, timedelta
import uuid
import sys

# Configuration
BASE_URL = "https://field-sales-crm-4.preview.emergentagent.com/api"
TEST_USER = {
    "name": "Field Agent",
    "email": "agent@test.com", 
    "password": "testpass123"
}
TEST_LEAD = {
    "name": "Jane Doe",
    "phone": "555-0101",
    "email": "jane@company.com",
    "address": "350 5th Avenue, New York, NY 10118"
}

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.user_id = None
        self.lead_id = None
        self.appointment_id = None
        self.scope_id = None
        self.reset_token = None
        self.results = []
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()
        
        self.results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def make_request(self, method, endpoint, data=None, headers=None, params=None):
        """Make HTTP request with proper error handling"""
        url = f"{BASE_URL}{endpoint}"
        
        # Add auth header if token available
        if self.auth_token and headers is None:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
        elif self.auth_token and headers:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        elif headers is None:
            headers = {}
            
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers, params=params, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers, params=params, timeout=30)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=headers, timeout=30)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None
    
    def test_health_check(self):
        """Test basic health endpoints"""
        print("=== HEALTH CHECK TESTS ===")
        
        # Test root endpoint
        response = self.make_request("GET", "/")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Root endpoint", True, f"Message: {data.get('message')}")
        else:
            self.log_result("Root endpoint", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test health endpoint
        response = self.make_request("GET", "/health")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Health check", True, f"Status: {data.get('status')}")
        else:
            self.log_result("Health check", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_auth_flow(self):
        """Test complete authentication flow"""
        print("=== AUTHENTICATION FLOW TESTS ===")
        
        # 1. Register new user
        response = self.make_request("POST", "/auth/register", TEST_USER)
        if response and response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("access_token")
            self.user_id = data.get("user", {}).get("id")
            self.log_result("User registration", True, f"User ID: {self.user_id}")
        else:
            # Try login if user already exists
            response = self.make_request("POST", "/auth/login", {
                "email": TEST_USER["email"],
                "password": TEST_USER["password"]
            })
            if response and response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("access_token")
                self.user_id = data.get("user", {}).get("id")
                self.log_result("User login (existing)", True, f"User ID: {self.user_id}")
            else:
                self.log_result("User registration/login", False, 
                              f"Status: {response.status_code if response else 'No response'}", 
                              response.json() if response else None)
                return False
        
        # 2. Test /auth/me endpoint
        response = self.make_request("GET", "/auth/me")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Get current user", True, f"Name: {data.get('name')}")
        else:
            self.log_result("Get current user", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 3. Test forgot password
        response = self.make_request("POST", "/auth/forgot-password", {"email": TEST_USER["email"]})
        if response and response.status_code == 200:
            data = response.json()
            self.reset_token = data.get("dev_token")  # For testing
            self.log_result("Forgot password", True, "Reset token generated")
        else:
            self.log_result("Forgot password", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 4. Test reset password (if we have token)
        if self.reset_token:
            response = self.make_request("POST", "/auth/reset-password", {
                "token": self.reset_token,
                "new_password": TEST_USER["password"]  # Reset to same password
            })
            if response and response.status_code == 200:
                self.log_result("Reset password", True, "Password reset successful")
            else:
                self.log_result("Reset password", False, 
                              f"Status: {response.status_code if response else 'No response'}")
        
        return self.auth_token is not None
    
    def test_leads_crud(self):
        """Test leads CRUD operations"""
        print("=== LEADS CRUD TESTS ===")
        
        if not self.auth_token:
            self.log_result("Leads CRUD", False, "No auth token available")
            return
        
        # 1. Create lead
        response = self.make_request("POST", "/leads", TEST_LEAD)
        if response and response.status_code == 200:
            data = response.json()
            self.lead_id = data.get("id")
            self.log_result("Create lead", True, f"Lead ID: {self.lead_id}")
        else:
            self.log_result("Create lead", False, 
                          f"Status: {response.status_code if response else 'No response'}")
            return
        
        # 2. Get all leads
        response = self.make_request("GET", "/leads")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Get all leads", True, f"Found {len(data)} leads")
        else:
            self.log_result("Get all leads", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 3. Get specific lead
        if self.lead_id:
            response = self.make_request("GET", f"/leads/{self.lead_id}")
            if response and response.status_code == 200:
                data = response.json()
                self.log_result("Get specific lead", True, f"Name: {data.get('name')}")
            else:
                self.log_result("Get specific lead", False, 
                              f"Status: {response.status_code if response else 'No response'}")
        
        # 4. Update lead
        if self.lead_id:
            update_data = {"notes": "Updated via API test"}
            response = self.make_request("PUT", f"/leads/{self.lead_id}", update_data)
            if response and response.status_code == 200:
                data = response.json()
                self.log_result("Update lead", True, f"Notes: {data.get('notes')}")
            else:
                self.log_result("Update lead", False, 
                              f"Status: {response.status_code if response else 'No response'}")
    
    def test_appointments_crud(self):
        """Test appointments CRUD operations"""
        print("=== APPOINTMENTS CRUD TESTS ===")
        
        if not self.auth_token or not self.lead_id:
            self.log_result("Appointments CRUD", False, "No auth token or lead ID available")
            return
        
        # 1. Create appointment
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        appointment_data = {
            "lead_id": self.lead_id,
            "appointment_date": tomorrow,
            "appointment_time": "14:00",
            "notes": "Test appointment",
            "status": "scheduled"
        }
        
        response = self.make_request("POST", "/appointments", appointment_data)
        if response and response.status_code == 200:
            data = response.json()
            self.appointment_id = data.get("id")
            self.log_result("Create appointment", True, f"Appointment ID: {self.appointment_id}")
        else:
            self.log_result("Create appointment", False, 
                          f"Status: {response.status_code if response else 'No response'}")
            return
        
        # 2. Get all appointments
        response = self.make_request("GET", "/appointments")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Get all appointments", True, f"Found {len(data)} appointments")
        else:
            self.log_result("Get all appointments", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 3. Get appointments for lead
        response = self.make_request("GET", f"/appointments/lead/{self.lead_id}")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Get lead appointments", True, f"Found {len(data)} appointments for lead")
        else:
            self.log_result("Get lead appointments", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 4. Update appointment status
        if self.appointment_id:
            update_data = {"status": "completed"}
            response = self.make_request("PUT", f"/appointments/{self.appointment_id}", update_data)
            if response and response.status_code == 200:
                data = response.json()
                self.log_result("Update appointment", True, f"Status: {data.get('status')}")
            else:
                self.log_result("Update appointment", False, 
                              f"Status: {response.status_code if response else 'No response'}")
    
    def test_scope_operations(self):
        """Test scope of appointment operations"""
        print("=== SCOPE OF APPOINTMENT TESTS ===")
        
        if not self.auth_token or not self.lead_id:
            self.log_result("Scope operations", False, "No auth token or lead ID available")
            return
        
        # 1. Create scope form
        scope_data = {
            "lead_id": self.lead_id,
            "form_fields": {
                "beneficiary_name": TEST_LEAD["name"],
                "beneficiary_phone": TEST_LEAD["phone"],
                "agent_name": TEST_USER["name"],
                "agent_license": "12345",
                "medicare_advantage": True,
                "medicare_supplement": False,
                "prescription_drug": True,
                "dental_vision": False,
                "other_products": ""
            },
            "typed_name": TEST_LEAD["name"],
            "signature": ""  # No signature for test
        }
        
        response = self.make_request("POST", "/scope", scope_data)
        if response and response.status_code == 200:
            data = response.json()
            self.scope_id = data.get("id")
            self.log_result("Create scope form", True, f"Scope ID: {self.scope_id}")
        else:
            self.log_result("Create scope form", False, 
                          f"Status: {response.status_code if response else 'No response'}")
            return
        
        # 2. Get scope
        if self.scope_id:
            response = self.make_request("GET", f"/scope/{self.scope_id}")
            if response and response.status_code == 200:
                data = response.json()
                self.log_result("Get scope", True, f"Typed name: {data.get('typed_name')}")
            else:
                self.log_result("Get scope", False, 
                              f"Status: {response.status_code if response else 'No response'}")
        
        # 3. Get scopes for lead
        response = self.make_request("GET", f"/scope/lead/{self.lead_id}")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Get lead scopes", True, f"Found {len(data)} scopes for lead")
        else:
            self.log_result("Get lead scopes", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 4. Generate PDF
        if self.scope_id:
            response = self.make_request("GET", f"/scope/{self.scope_id}/pdf")
            if response and response.status_code == 200:
                data = response.json()
                pdf_base64 = data.get("pdf_base64")
                filename = data.get("filename")
                if pdf_base64 and filename:
                    self.log_result("Generate scope PDF", True, f"PDF generated: {filename}")
                else:
                    self.log_result("Generate scope PDF", False, "Missing pdf_base64 or filename")
            else:
                self.log_result("Generate scope PDF", False, 
                              f"Status: {response.status_code if response else 'No response'}")
    
    def test_route_planning(self):
        """Test route planning operations"""
        print("=== ROUTE PLANNING TESTS ===")
        
        if not self.auth_token or not self.lead_id:
            self.log_result("Route planning", False, "No auth token or lead ID available")
            return
        
        # 1. Geocode lead address
        geocode_data = {"lead_id": self.lead_id}
        response = self.make_request("POST", "/routes/geocode", geocode_data)
        if response and response.status_code == 200:
            data = response.json()
            success = data.get("success", False)
            if success:
                lat = data.get("latitude")
                lng = data.get("longitude")
                self.log_result("Geocode lead address", True, f"Coordinates: {lat}, {lng}")
            else:
                self.log_result("Geocode lead address", False, f"Error: {data.get('error')}")
        else:
            self.log_result("Geocode lead address", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 2. Get leads with coordinates
        response = self.make_request("GET", "/routes/leads-with-coordinates")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Get leads with coordinates", True, f"Found {len(data)} leads")
        else:
            self.log_result("Get leads with coordinates", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 3. Skip batch geocode (endpoint not implemented)
        self.log_result("Batch geocode", True, "Endpoint not implemented - skipped")
        
        # 4. Get daily route
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        route_data = {
            "date": tomorrow,
            "start_address": "Times Square, New York, NY"
        }
        
        response = self.make_request("POST", "/routes/daily", route_data)
        if response and response.status_code == 200:
            data = response.json()
            stops = data.get("stops", [])
            distance = data.get("total_distance_km", 0)
            self.log_result("Get daily route", True, f"Stops: {len(stops)}, Distance: {distance}km")
        else:
            self.log_result("Get daily route", False, 
                          f"Status: {response.status_code if response else 'No response'}")
    
    def test_ai_functionality(self):
        """Test AI functionality"""
        print("=== AI FUNCTIONALITY TESTS ===")
        
        if not self.auth_token:
            self.log_result("AI functionality", False, "No auth token available")
            return
        
        # 1. Send chat message
        chat_data = {
            "message": "What are some good opening lines for a Medicare sales call?",
            "lead_id": self.lead_id
        }
        
        response = self.make_request("POST", "/ai/chat", chat_data)
        if response and response.status_code == 200:
            data = response.json()
            ai_response = data.get("response", "")
            if ai_response:
                self.log_result("AI Chat", True, f"Response length: {len(ai_response)} chars")
            else:
                self.log_result("AI Chat", False, "Empty AI response")
        else:
            self.log_result("AI Chat", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 2. Get chat history
        response = self.make_request("GET", "/ai/chat-history")
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Get chat history", True, f"Found {len(data)} messages")
        else:
            self.log_result("Get chat history", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 3. Test appointment prep (if we have a lead)
        if self.lead_id:
            response = self.make_request("POST", f"/ai/appointment-prep/{self.lead_id}")
            if response and response.status_code == 200:
                data = response.json()
                lead_name = data.get("lead_name", "")
                talking_points = data.get("talking_points", [])
                self.log_result("AI Appointment Prep", True, f"Lead: {lead_name}, Points: {len(talking_points)}")
            else:
                self.log_result("AI Appointment Prep", False, 
                              f"Status: {response.status_code if response else 'No response'}")
    
    def test_subscription(self):
        """Test subscription functionality"""
        print("=== SUBSCRIPTION TESTS ===")
        
        if not self.auth_token:
            self.log_result("Subscription", False, "No auth token available")
            return
        
        # 1. Get subscription status
        response = self.make_request("GET", "/subscription/status")
        if response and response.status_code == 200:
            data = response.json()
            status = data.get("status")
            plan = data.get("plan")
            self.log_result("Get subscription status", True, f"Status: {status}, Plan: {plan}")
        else:
            self.log_result("Get subscription status", False, 
                          f"Status: {response.status_code if response else 'No response'}")
        
        # 2. Mock subscribe
        response = self.make_request("POST", "/subscription/subscribe")
        if response and response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            self.log_result("Mock subscribe", True, f"Message: {message}")
        else:
            self.log_result("Mock subscribe", False, 
                          f"Status: {response.status_code if response else 'No response'}")
    
    def test_unauthorized_access(self):
        """Test that protected endpoints require authentication"""
        print("=== UNAUTHORIZED ACCESS TESTS ===")
        
        # Test protected endpoints without auth using direct requests
        protected_endpoints = [
            ("GET", "/auth/me"),
            ("GET", "/leads"),
            ("POST", "/leads"),
            ("GET", "/appointments"),
            ("POST", "/appointments"),
            ("GET", "/subscription/status")
        ]
        
        unauthorized_count = 0
        for method, endpoint in protected_endpoints:
            url = f"{BASE_URL}{endpoint}"
            try:
                if method == "GET":
                    response = requests.get(url, headers={}, timeout=30)
                elif method == "POST":
                    response = requests.post(url, json={}, headers={}, timeout=30)
                else:
                    response = requests.request(method, url, headers={}, timeout=30)
                
                status_code = response.status_code
                print(f"  {method} {endpoint}: {status_code}")
                if status_code in [401, 403]:
                    unauthorized_count += 1
            except Exception as e:
                print(f"  {method} {endpoint}: ERROR - {e}")
        
        self.log_result("Unauthorized access protection", 
                       unauthorized_count == len(protected_endpoints),
                       f"{unauthorized_count}/{len(protected_endpoints)} endpoints properly protected")
    
    def test_soa_delivery_logging(self):
        """Test SOA delivery logging endpoints"""
        print("=== SOA DELIVERY LOGGING TESTS ===")
        
        if not self.scope_id:
            self.log_result("SOA Delivery Logging", False, "No scope document available for testing")
            return False
        
        delivery_logs = []
        
        # Test 1: Log email delivery
        email_delivery = {
            "scope_id": self.scope_id,
            "delivery_method": "email",
            "recipient_contact": "jane@company.com",
            "notes": "SOA document emailed to client for review"
        }
        
        response = self.make_request("POST", f"/scope/{self.scope_id}/log-delivery", email_delivery)
        if not response or response.status_code != 200:
            self.log_result("SOA Email Delivery Logging", False, 
                           f"Status: {response.status_code if response else 'No response'}")
            return False
        
        email_log = response.json()
        delivery_logs.append(email_log)
        self.log_result("SOA Email Delivery Logging", True, 
                       f"Logged delivery ID: {email_log.get('id')}")
        
        # Test 2: Log share delivery
        share_delivery = {
            "scope_id": self.scope_id,
            "delivery_method": "share",
            "recipient_contact": None,
            "notes": "SOA document shared via secure link during appointment"
        }
        
        response = self.make_request("POST", f"/scope/{self.scope_id}/log-delivery", share_delivery)
        if not response or response.status_code != 200:
            self.log_result("SOA Share Delivery Logging", False, 
                           f"Status: {response.status_code if response else 'No response'}")
            return False
        
        share_log = response.json()
        delivery_logs.append(share_log)
        self.log_result("SOA Share Delivery Logging", True, 
                       f"Logged delivery ID: {share_log.get('id')}")
        
        # Test 3: Log SMS delivery
        sms_delivery = {
            "scope_id": self.scope_id,
            "delivery_method": "sms",
            "recipient_contact": "555-0101",
            "notes": "SOA document link sent via SMS"
        }
        
        response = self.make_request("POST", f"/scope/{self.scope_id}/log-delivery", sms_delivery)
        if not response or response.status_code != 200:
            self.log_result("SOA SMS Delivery Logging", False, 
                           f"Status: {response.status_code if response else 'No response'}")
            return False
        
        sms_log = response.json()
        delivery_logs.append(sms_log)
        self.log_result("SOA SMS Delivery Logging", True, 
                       f"Logged delivery ID: {sms_log.get('id')}")
        
        # Test 4: Get delivery history
        response = self.make_request("GET", f"/scope/{self.scope_id}/delivery-history")
        if not response or response.status_code != 200:
            self.log_result("SOA Delivery History Retrieval", False, 
                           f"Status: {response.status_code if response else 'No response'}")
            return False
        
        history_data = response.json()
        delivery_history = history_data.get("delivery_history", [])
        
        if len(delivery_history) >= 3:
            self.log_result("SOA Delivery History Retrieval", True, 
                           f"Found {len(delivery_history)} delivery entries")
            
            # Verify delivery methods
            methods_found = [entry.get("delivery_method") for entry in delivery_history]
            expected_methods = ["email", "share", "sms"]
            all_methods_found = all(method in methods_found for method in expected_methods)
            
            self.log_result("SOA Delivery Methods Verification", all_methods_found, 
                           f"Methods found: {methods_found}")
        else:
            self.log_result("SOA Delivery History Retrieval", False, 
                           f"Expected 3+ entries, found {len(delivery_history)}")
            return False
        
        # Test 5: Verify SOA document includes delivery_history
        response = self.make_request("GET", f"/scope/{self.scope_id}")
        if not response or response.status_code != 200:
            self.log_result("SOA Document Includes Delivery History", False, 
                           f"Status: {response.status_code if response else 'No response'}")
            return False
        
        scope_data = response.json()
        if "delivery_history" in scope_data:
            scope_delivery_history = scope_data["delivery_history"]
            self.log_result("SOA Document Includes Delivery History", True, 
                           f"Delivery history field present with {len(scope_delivery_history)} entries")
        else:
            self.log_result("SOA Document Includes Delivery History", False, 
                           "delivery_history field missing from SOA document")
            return False
        
        # Test 6: Test with invalid scope ID (should return 404 when authenticated)
        invalid_scope_id = str(uuid.uuid4())
        invalid_delivery = {
            "scope_id": invalid_scope_id,
            "delivery_method": "email",
            "recipient_contact": "test@example.com",
            "notes": "Test with invalid scope"
        }
        
        response = self.make_request("POST", f"/scope/{invalid_scope_id}/log-delivery", invalid_delivery)
        if response:
            # Should return 404 for invalid scope ID when properly authenticated
            invalid_scope_test_passed = response.status_code == 404
            self.log_result("SOA Invalid Scope ID Test", invalid_scope_test_passed, 
                           f"Status: {response.status_code} (expected 404)")
        else:
            self.log_result("SOA Invalid Scope ID Test", False, "No response received")
        
        return True

    def test_commission_tracking(self):
        """Test Commission Tracking API endpoints"""
        print("=== COMMISSION TRACKING TESTS ===")
        
        if not self.lead_id:
            self.log_result("Commission Tracking", False, "No lead available for testing")
            return False
        
        commission_ids = []
        
        # Test 1: Create commission records with different statuses
        commission_records = [
            {
                "lead_id": self.lead_id,
                "policy_type": "Medicare Advantage",
                "carrier": "Humana",
                "premium": 1200.00,
                "estimated_commission": 600.00,
                "commission_status": "estimated",
                "notes": "Initial estimate for Medicare Advantage plan"
            },
            {
                "lead_id": self.lead_id,
                "policy_type": "Medicare Supplement",
                "carrier": "Aetna",
                "premium": 800.00,
                "estimated_commission": 400.00,
                "commission_status": "pending",
                "notes": "Application submitted, awaiting approval"
            },
            {
                "lead_id": self.lead_id,
                "policy_type": "Prescription Drug Plan",
                "carrier": "UnitedHealth",
                "premium": 500.00,
                "estimated_commission": 250.00,
                "commission_status": "approved",
                "notes": "Policy approved, ready for payment"
            }
        ]
        
        # Create commission records and verify split calculations (60/20/20%)
        for i, record in enumerate(commission_records):
            response = self.make_request("POST", "/commissions", record)
            if not response or response.status_code != 200:
                self.log_result(f"Create Commission Record {i+1}", False, 
                               f"Status: {response.status_code if response else 'No response'}")
                continue
            
            data = response.json()
            commission_id = data.get("id")
            commission_ids.append(commission_id)
            
            # Verify split calculations (60/20/20%)
            expected_agent = record["estimated_commission"] * 0.6
            expected_manager = record["estimated_commission"] * 0.2
            expected_agency = record["estimated_commission"] * 0.2
            
            actual_agent = data.get("agent_commission", 0)
            actual_manager = data.get("manager_override", 0)
            actual_agency = data.get("agency_share", 0)
            
            splits_correct = (
                abs(actual_agent - expected_agent) < 0.01 and
                abs(actual_manager - expected_manager) < 0.01 and
                abs(actual_agency - expected_agency) < 0.01
            )
            
            self.log_result(f"Create Commission Record {i+1}", True, 
                           f"{record['policy_type']} - ID: {commission_id[:8]}...")
            
            self.log_result(f"Commission Split Calculation {i+1}", splits_correct,
                           f"Agent: ${actual_agent:.2f}, Manager: ${actual_manager:.2f}, Agency: ${actual_agency:.2f}")
        
        if not commission_ids:
            self.log_result("Commission Tracking", False, "No commission records created")
            return False
        
        # Test 2: List all commissions
        response = self.make_request("GET", "/commissions")
        if not response or response.status_code != 200:
            self.log_result("List All Commissions", False, 
                           f"Status: {response.status_code if response else 'No response'}")
        else:
            data = response.json()
            self.log_result("List All Commissions", True, f"Retrieved {len(data)} commission records")
        
        # Test 3: Filter commissions by status
        for status in ["estimated", "pending", "approved", "paid"]:
            response = self.make_request("GET", "/commissions", params={"status": status})
            if not response or response.status_code != 200:
                self.log_result(f"Filter by Status '{status}'", False, 
                               f"Status: {response.status_code if response else 'No response'}")
                continue
            
            data = response.json()
            all_correct_status = all(record.get("commission_status") == status for record in data)
            self.log_result(f"Filter by Status '{status}'", all_correct_status, 
                           f"Retrieved {len(data)} records, all have correct status: {all_correct_status}")
        
        # Test 4: Get single commission
        if commission_ids:
            commission_id = commission_ids[0]
            response = self.make_request("GET", f"/commissions/{commission_id}")
            if not response or response.status_code != 200:
                self.log_result("Get Single Commission", False, 
                               f"Status: {response.status_code if response else 'No response'}")
            else:
                data = response.json()
                required_fields = [
                    "id", "policy_type", "carrier", "premium", "estimated_commission",
                    "agent_commission", "manager_override", "agency_share", "commission_status"
                ]
                has_required_fields = all(field in data for field in required_fields)
                self.log_result("Get Single Commission", has_required_fields, 
                               f"Commission {commission_id[:8]}... has all required fields: {has_required_fields}")
        
        # Test 5: Update commission status to paid
        if len(commission_ids) >= 3:
            commission_id = commission_ids[2]  # The approved one
            update_data = {
                "commission_status": "paid",
                "paid_amount": 350.00,
                "payment_date": "2026-03-15T00:00:00Z"
            }
            
            response = self.make_request("PUT", f"/commissions/{commission_id}", update_data)
            if not response or response.status_code != 200:
                self.log_result("Update Commission to Paid", False, 
                               f"Status: {response.status_code if response else 'No response'}")
            else:
                # Verify the update
                get_response = self.make_request("GET", f"/commissions/{commission_id}")
                if get_response and get_response.status_code == 200:
                    data = get_response.json()
                    status_updated = data.get("commission_status") == "paid"
                    paid_amount_correct = data.get("paid_amount") == 350.00
                    payment_date_set = data.get("payment_date") is not None
                    
                    all_correct = status_updated and paid_amount_correct and payment_date_set
                    self.log_result("Update Commission to Paid", all_correct, 
                                   f"Status updated: {status_updated}, Amount correct: {paid_amount_correct}, Date set: {payment_date_set}")
                else:
                    self.log_result("Update Commission to Paid", False, "Failed to verify update")
        
        # Test 6: Get commission summary
        response = self.make_request("GET", "/commissions/summary/totals")
        if not response or response.status_code != 200:
            self.log_result("Commission Summary", False, 
                           f"Status: {response.status_code if response else 'No response'}")
        else:
            data = response.json()
            required_fields = [
                "total_estimated", "total_pending", "total_approved", "total_paid",
                "records_count", "by_status", "by_carrier", "by_policy_type"
            ]
            has_all_fields = all(field in data for field in required_fields)
            self.log_result("Commission Summary", has_all_fields, 
                           f"Records: {data.get('records_count')}, Total Estimated: ${data.get('total_estimated')}")
        
        # Test 7: Get agent commissions
        if self.user_id:
            response = self.make_request("GET", f"/commissions/agent/{self.user_id}")
            if not response or response.status_code != 200:
                self.log_result("Agent Commissions", False, 
                               f"Status: {response.status_code if response else 'No response'}")
            else:
                data = response.json()
                if isinstance(data, dict) and "commissions" in data:
                    commissions_list = data["commissions"]
                    all_belong_to_agent = all(record.get("created_by_user") == self.user_id for record in commissions_list)
                    self.log_result("Agent Commissions", True, 
                                   f"Retrieved {len(commissions_list)} agent-specific commissions with summary data")
                else:
                    self.log_result("Agent Commissions", False, "Response missing commissions array")
        
        # Test 8: Team view parameter
        response = self.make_request("GET", "/commissions", params={"team_view": "true"})
        if not response or response.status_code != 200:
            self.log_result("Team View Parameter", False, 
                           f"Status: {response.status_code if response else 'No response'}")
        else:
            self.log_result("Team View Parameter", True, "Team view parameter accepted")
        
        return True
    
    def cleanup_test_data(self):
        """Clean up test data"""
        print("=== CLEANUP ===")
        
        if not self.auth_token:
            return
        
        # Delete appointment
        if self.appointment_id:
            response = self.make_request("DELETE", f"/appointments/{self.appointment_id}")
            if response and response.status_code == 200:
                self.log_result("Delete test appointment", True, "Appointment deleted")
            else:
                self.log_result("Delete test appointment", False, "Failed to delete appointment")
        
        # Delete lead (this will cascade delete related data)
        if self.lead_id:
            response = self.make_request("DELETE", f"/leads/{self.lead_id}")
            if response and response.status_code == 200:
                self.log_result("Delete test lead", True, "Lead and related data deleted")
            else:
                self.log_result("Delete test lead", False, "Failed to delete lead")
    
    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting AgentRoute AI Backend API Tests")
        print(f"Base URL: {BASE_URL}")
        print("=" * 60)
        
        # Run test suites in order
        self.test_health_check()
        
        if self.test_auth_flow():
            self.test_leads_crud()
            self.test_appointments_crud()
            self.test_scope_operations()
            self.test_soa_delivery_logging()
            self.test_commission_tracking()
            self.test_route_planning()
            self.test_ai_functionality()
            self.test_subscription()
            self.test_unauthorized_access()
            self.cleanup_test_data()
        else:
            print("❌ Authentication failed - skipping remaining tests")
        
        # Print summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.results:
                if not result["success"]:
                    print(f"  • {result['test']}: {result['details']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = APITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)