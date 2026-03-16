#!/usr/bin/env python3
"""
AgentRoute AI Backend API Comprehensive Test Suite
Tests all core flows for Admin, Manager, and Agent roles
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import base64
import time

# Configuration
BASE_URL = "https://sales-team-hub-2.preview.emergentagent.com/api"
TIMEOUT = 30

# Test credentials from review request
TEST_CREDENTIALS = {
    "admin": {
        "email": "admin@agentroute.com",
        "password": "Admin123!"
    },
    "agent": {
        "email": "commission.test@example.com", 
        "password": "Test123!"
    }
}

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = TIMEOUT
        self.tokens = {}
        self.test_data = {}
        self.results = []
        
    def log_result(self, test_name, status, details="", response_code=None):
        """Log test result"""
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "response_code": response_code,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        status_symbol = "✅" if status == "PASS" else "❌"
        print(f"{status_symbol} {test_name}: {details}")
        
    def make_request(self, method, endpoint, data=None, headers=None, role=None):
        """Make API request with proper headers"""
        url = f"{BASE_URL}{endpoint}"
        req_headers = {"Content-Type": "application/json"}
        
        if role and role in self.tokens:
            req_headers["Authorization"] = f"Bearer {self.tokens[role]}"
            
        if headers:
            req_headers.update(headers)
            
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=req_headers)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=req_headers)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=req_headers)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=req_headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None
            
    def test_authentication_flow(self):
        """Test authentication endpoints for all roles"""
        print("\n=== TESTING AUTHENTICATION FLOW ===")
        
        # Test 1: Admin Login
        try:
            response = self.make_request("POST", "/auth/login", TEST_CREDENTIALS["admin"])
            if response and response.status_code == 200:
                data = response.json()
                self.tokens["admin"] = data.get("access_token")
                self.test_data["admin_user"] = data.get("user", {})
                self.log_result("Admin Login", "PASS", f"Admin logged in successfully, role: {data.get('user', {}).get('role')}", 200)
            else:
                self.log_result("Admin Login", "FAIL", f"Login failed: {response.status_code if response else 'No response'}", response.status_code if response else None)
        except Exception as e:
            self.log_result("Admin Login", "FAIL", f"Exception: {str(e)}")
            
        # Test 2: Agent Login
        try:
            response = self.make_request("POST", "/auth/login", TEST_CREDENTIALS["agent"])
            if response and response.status_code == 200:
                data = response.json()
                self.tokens["agent"] = data.get("access_token")
                self.test_data["agent_user"] = data.get("user", {})
                self.log_result("Agent Login", "PASS", f"Agent logged in successfully, role: {data.get('user', {}).get('role')}", 200)
            else:
                self.log_result("Agent Login", "FAIL", f"Login failed: {response.status_code if response else 'No response'}", response.status_code if response else None)
        except Exception as e:
            self.log_result("Agent Login", "FAIL", f"Exception: {str(e)}")
            
        # Test 3: Get current user info (Admin)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/auth/me", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Admin /auth/me", "PASS", f"Retrieved admin user data: {data.get('name')}", 200)
                else:
                    self.log_result("Admin /auth/me", "FAIL", f"Failed to get user data: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Admin /auth/me", "FAIL", f"Exception: {str(e)}")
                
        # Test 4: Get current user info (Agent)
        if "agent" in self.tokens:
            try:
                response = self.make_request("GET", "/auth/me", role="agent")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Agent /auth/me", "PASS", f"Retrieved agent user data: {data.get('name')}", 200)
                else:
                    self.log_result("Agent /auth/me", "FAIL", f"Failed to get user data: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Agent /auth/me", "FAIL", f"Exception: {str(e)}")
                
        # Test 5: Test registration
        try:
            test_user = {
                "name": "Test User Registration",
                "email": f"test.{uuid.uuid4().hex[:8]}@agentroute.com",
                "password": "TestPass123!",
                "role": "agent"
            }
            response = self.make_request("POST", "/auth/register", test_user)
            if response and response.status_code == 200:
                data = response.json()
                self.log_result("User Registration", "PASS", f"User registered successfully: {data.get('user', {}).get('email')}", 200)
            else:
                self.log_result("User Registration", "FAIL", f"Registration failed: {response.status_code if response else 'No response'}", response.status_code if response else None)
        except Exception as e:
            self.log_result("User Registration", "FAIL", f"Exception: {str(e)}")
            
    def test_leads_flow(self):
        """Test leads CRUD operations"""
        print("\n=== TESTING LEADS FLOW ===")
        
        # Test 1: Create lead (Admin)
        if "admin" in self.tokens:
            try:
                lead_data = {
                    "name": "John Test Lead",
                    "phone": "555-123-4567",
                    "email": "john.testlead@example.com",
                    "address": "123 Test Street, Test City, TS 12345",
                    "notes": "Test lead for API testing",
                    "source": "manual"
                }
                response = self.make_request("POST", "/leads", lead_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["admin_lead_id"] = data.get("id")
                    self.log_result("Create Lead (Admin)", "PASS", f"Lead created: {data.get('name')}, ID: {data.get('id')}", 200)
                else:
                    self.log_result("Create Lead (Admin)", "FAIL", f"Failed to create lead: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Create Lead (Admin)", "FAIL", f"Exception: {str(e)}")
                
        # Test 2: Create lead (Agent)
        if "agent" in self.tokens:
            try:
                lead_data = {
                    "name": "Jane Agent Lead",
                    "phone": "555-987-6543",
                    "email": "jane.agentlead@example.com",
                    "address": "456 Agent Avenue, Agent City, AG 67890",
                    "notes": "Agent test lead for API testing",
                    "source": "referral"
                }
                response = self.make_request("POST", "/leads", lead_data, role="agent")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["agent_lead_id"] = data.get("id")
                    self.log_result("Create Lead (Agent)", "PASS", f"Lead created: {data.get('name')}, ID: {data.get('id')}", 200)
                else:
                    self.log_result("Create Lead (Agent)", "FAIL", f"Failed to create lead: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Create Lead (Agent)", "FAIL", f"Exception: {str(e)}")
                
        # Test 3: Get all leads (Admin - should see all)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/leads", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get All Leads (Admin)", "PASS", f"Retrieved {len(data)} leads", 200)
                else:
                    self.log_result("Get All Leads (Admin)", "FAIL", f"Failed to get leads: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get All Leads (Admin)", "FAIL", f"Exception: {str(e)}")
                
        # Test 4: Get all leads (Agent - should see only own)
        if "agent" in self.tokens:
            try:
                response = self.make_request("GET", "/leads", role="agent")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get All Leads (Agent)", "PASS", f"Retrieved {len(data)} leads (agent view)", 200)
                else:
                    self.log_result("Get All Leads (Agent)", "FAIL", f"Failed to get leads: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get All Leads (Agent)", "FAIL", f"Exception: {str(e)}")
                
        # Test 5: Get specific lead
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                lead_id = self.test_data["admin_lead_id"]
                response = self.make_request("GET", f"/leads/{lead_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get Specific Lead", "PASS", f"Retrieved lead: {data.get('name')}", 200)
                else:
                    self.log_result("Get Specific Lead", "FAIL", f"Failed to get lead: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get Specific Lead", "FAIL", f"Exception: {str(e)}")
                
        # Test 6: Update lead
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                lead_id = self.test_data["admin_lead_id"]
                update_data = {
                    "notes": "Updated notes via API test",
                    "stage": "appointment_scheduled"
                }
                response = self.make_request("PUT", f"/leads/{lead_id}", update_data, role="admin")
                if response and response.status_code == 200:
                    self.log_result("Update Lead", "PASS", "Lead updated successfully", 200)
                else:
                    self.log_result("Update Lead", "FAIL", f"Failed to update lead: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Update Lead", "FAIL", f"Exception: {str(e)}")
                
        # Test 7: OCR Scan endpoint (may not exist)
        if "admin" in self.tokens:
            try:
                # This endpoint might not be implemented
                response = self.make_request("POST", "/ocr/scan", {"image": "test_image_data"}, role="admin")
                if response and response.status_code == 200:
                    self.log_result("OCR Scan", "PASS", "OCR scan endpoint working", 200)
                elif response and response.status_code == 404:
                    self.log_result("OCR Scan", "FAIL", "OCR scan endpoint not implemented", 404)
                else:
                    self.log_result("OCR Scan", "FAIL", f"OCR scan failed: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("OCR Scan", "FAIL", f"Exception: {str(e)}")
                
    def test_appointments_flow(self):
        """Test appointments CRUD operations"""
        print("\n=== TESTING APPOINTMENTS FLOW ===")
        
        # Test 1: Create appointment
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                apt_data = {
                    "lead_id": self.test_data["admin_lead_id"],
                    "appointment_date": "2025-01-20",
                    "appointment_time": "14:00",
                    "notes": "Initial consultation appointment",
                    "status": "scheduled",
                    "appointment_type": "in_person"
                }
                response = self.make_request("POST", "/appointments", apt_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["appointment_id"] = data.get("id")
                    self.log_result("Create Appointment", "PASS", f"Appointment created: {data.get('id')}", 200)
                else:
                    self.log_result("Create Appointment", "FAIL", f"Failed to create appointment: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Create Appointment", "FAIL", f"Exception: {str(e)}")
                
        # Test 2: Get all appointments
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/appointments", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get All Appointments", "PASS", f"Retrieved {len(data)} appointments", 200)
                else:
                    self.log_result("Get All Appointments", "FAIL", f"Failed to get appointments: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get All Appointments", "FAIL", f"Exception: {str(e)}")
                
        # Test 3: Get specific appointment
        if "appointment_id" in self.test_data and "admin" in self.tokens:
            try:
                apt_id = self.test_data["appointment_id"]
                response = self.make_request("GET", f"/appointments/{apt_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get Specific Appointment", "PASS", f"Retrieved appointment: {data.get('id')}", 200)
                else:
                    self.log_result("Get Specific Appointment", "FAIL", f"Failed to get appointment: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get Specific Appointment", "FAIL", f"Exception: {str(e)}")
                
        # Test 4: Get appointments for lead
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                lead_id = self.test_data["admin_lead_id"]
                response = self.make_request("GET", f"/appointments/lead/{lead_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get Lead Appointments", "PASS", f"Retrieved {len(data)} appointments for lead", 200)
                else:
                    self.log_result("Get Lead Appointments", "FAIL", f"Failed to get lead appointments: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get Lead Appointments", "FAIL", f"Exception: {str(e)}")
                
    def test_scope_flow(self):
        """Test Scope of Appointment operations"""
        print("\n=== TESTING SCOPE OF APPOINTMENT FLOW ===")
        
        # Test 1: Create SOA
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                scope_data = {
                    "lead_id": self.test_data["admin_lead_id"],
                    "form_fields": {
                        "beneficiary_name": "John Test Lead",
                        "beneficiary_phone": "555-123-4567",
                        "beneficiary_address": "123 Test Street, Test City, TS 12345",
                        "medicare_advantage": True,
                        "medicare_supplement": False,
                        "prescription_drug": True,
                        "dental_vision": False,
                        "agent_name": "Test Agent",
                        "agent_license": "12345",
                        "agent_phone": "555-999-8888",
                        "initial_contact_method": "phone"
                    },
                    "typed_name": "John Test Lead",
                    "signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
                    "agent_typed_name": "Test Agent",
                    "agent_signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
                }
                response = self.make_request("POST", "/scope", scope_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["scope_id"] = data.get("id")
                    self.log_result("Create SOA", "PASS", f"SOA created: {data.get('id')}", 200)
                else:
                    self.log_result("Create SOA", "FAIL", f"Failed to create SOA: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Create SOA", "FAIL", f"Exception: {str(e)}")
                
        # Test 2: Get SOAs for lead
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                lead_id = self.test_data["admin_lead_id"]
                response = self.make_request("GET", f"/scope/lead/{lead_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get Lead SOAs", "PASS", f"Retrieved {len(data)} SOAs for lead", 200)
                else:
                    self.log_result("Get Lead SOAs", "FAIL", f"Failed to get lead SOAs: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get Lead SOAs", "FAIL", f"Exception: {str(e)}")
                
        # Test 3: Get specific SOA
        if "scope_id" in self.test_data and "admin" in self.tokens:
            try:
                scope_id = self.test_data["scope_id"]
                response = self.make_request("GET", f"/scope/{scope_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get Specific SOA", "PASS", f"Retrieved SOA: {data.get('id')}", 200)
                else:
                    self.log_result("Get Specific SOA", "FAIL", f"Failed to get SOA: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get Specific SOA", "FAIL", f"Exception: {str(e)}")
                
        # Test 4: Get SOA PDF
        if "scope_id" in self.test_data and "admin" in self.tokens:
            try:
                scope_id = self.test_data["scope_id"]
                response = self.make_request("GET", f"/scope/{scope_id}/pdf", role="admin")
                if response and response.status_code == 200:
                    self.log_result("Get SOA PDF", "PASS", "PDF generated successfully", 200)
                else:
                    self.log_result("Get SOA PDF", "FAIL", f"Failed to get PDF: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get SOA PDF", "FAIL", f"Exception: {str(e)}")
                
    def test_admin_dashboards(self):
        """Test admin/manager dashboard endpoints"""
        print("\n=== TESTING ADMIN/MANAGER DASHBOARDS ===")
        
        # Test 1: Team snapshot (may not exist)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/team/snapshot", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Team Snapshot", "PASS", f"Retrieved team snapshot", 200)
                elif response and response.status_code == 404:
                    self.log_result("Team Snapshot", "FAIL", "Team snapshot endpoint not implemented", 404)
                else:
                    self.log_result("Team Snapshot", "FAIL", f"Failed to get team snapshot: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Team Snapshot", "FAIL", f"Exception: {str(e)}")
                
        # Test 2: Team agents (may not exist)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/team/agents", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Team Agents", "PASS", f"Retrieved team agents", 200)
                elif response and response.status_code == 404:
                    self.log_result("Team Agents", "FAIL", "Team agents endpoint not implemented", 404)
                else:
                    self.log_result("Team Agents", "FAIL", f"Failed to get team agents: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Team Agents", "FAIL", f"Exception: {str(e)}")
                
        # Test 3: Team hierarchy (may not exist)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/team/hierarchy", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Team Hierarchy", "PASS", f"Retrieved team hierarchy", 200)
                elif response and response.status_code == 404:
                    self.log_result("Team Hierarchy", "FAIL", "Team hierarchy endpoint not implemented", 404)
                else:
                    self.log_result("Team Hierarchy", "FAIL", f"Failed to get team hierarchy: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Team Hierarchy", "FAIL", f"Exception: {str(e)}")
                
        # Test 4: Agency command center summary (may not exist)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/agency-command-center/summary", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Agency Command Center Summary", "PASS", f"Retrieved command center summary", 200)
                elif response and response.status_code == 404:
                    self.log_result("Agency Command Center Summary", "FAIL", "Command center summary endpoint not implemented", 404)
                else:
                    self.log_result("Agency Command Center Summary", "FAIL", f"Failed to get command center summary: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Agency Command Center Summary", "FAIL", f"Exception: {str(e)}")
                
        # Test 5: Agency command center team (may not exist)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/agency-command-center/team", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Agency Command Center Team", "PASS", f"Retrieved command center team", 200)
                elif response and response.status_code == 404:
                    self.log_result("Agency Command Center Team", "FAIL", "Command center team endpoint not implemented", 404)
                else:
                    self.log_result("Agency Command Center Team", "FAIL", f"Failed to get command center team: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Agency Command Center Team", "FAIL", f"Exception: {str(e)}")
                
        # Test 6: Needs attention (may not exist)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/needs-attention", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Needs Attention", "PASS", f"Retrieved needs attention", 200)
                elif response and response.status_code == 404:
                    self.log_result("Needs Attention", "FAIL", "Needs attention endpoint not implemented", 404)
                else:
                    self.log_result("Needs Attention", "FAIL", f"Failed to get needs attention: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Needs Attention", "FAIL", f"Exception: {str(e)}")
                
    def test_commission_tracking(self):
        """Test commission tracking endpoints"""
        print("\n=== TESTING COMMISSION TRACKING ===")
        
        # Test 1: Create commission record
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                commission_data = {
                    "lead_id": self.test_data["admin_lead_id"],
                    "policy_type": "Medicare Advantage",
                    "carrier": "Test Insurance Co",
                    "premium": 1200.00,
                    "estimated_commission": 600.00,
                    "commission_status": "estimated",
                    "notes": "Test commission record"
                }
                response = self.make_request("POST", "/commissions", commission_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["commission_id"] = data.get("id")
                    self.log_result("Create Commission", "PASS", f"Commission created: {data.get('id')}", 200)
                else:
                    self.log_result("Create Commission", "FAIL", f"Failed to create commission: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Create Commission", "FAIL", f"Exception: {str(e)}")
                
        # Test 2: Get all commissions
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/commissions", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Get All Commissions", "PASS", f"Retrieved {len(data)} commissions", 200)
                else:
                    self.log_result("Get All Commissions", "FAIL", f"Failed to get commissions: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Get All Commissions", "FAIL", f"Exception: {str(e)}")
                
    def test_role_based_access(self):
        """Test role-based access control"""
        print("\n=== TESTING ROLE-BASED ACCESS CONTROL ===")
        
        # Test 1: Agent accessing admin-only endpoints should fail
        if "agent" in self.tokens:
            try:
                response = self.make_request("GET", "/scope/admin/all", role="agent")
                if response and response.status_code == 403:
                    self.log_result("Agent Access Control", "PASS", "Agent correctly denied admin access", 403)
                elif response and response.status_code == 404:
                    self.log_result("Agent Access Control", "PASS", "Endpoint not found (expected)", 404)
                else:
                    self.log_result("Agent Access Control", "FAIL", f"Agent should be denied access: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Agent Access Control", "FAIL", f"Exception: {str(e)}")
                
        # Test 2: Unauthorized access should fail
        try:
            response = self.make_request("GET", "/leads")  # No role/token
            if response and response.status_code in [401, 403]:
                self.log_result("Unauthorized Access", "PASS", "Unauthorized access correctly denied", response.status_code)
            else:
                self.log_result("Unauthorized Access", "FAIL", f"Should deny unauthorized access: {response.status_code if response else 'No response'}", response.status_code if response else None)
        except Exception as e:
            self.log_result("Unauthorized Access", "FAIL", f"Exception: {str(e)}")
            
    def test_data_persistence(self):
        """Test that created data persists correctly"""
        print("\n=== TESTING DATA PERSISTENCE ===")
        
        # Test 1: Verify lead still exists
        if "admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                lead_id = self.test_data["admin_lead_id"]
                response = self.make_request("GET", f"/leads/{lead_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    if data.get("notes") and "Updated notes via API test" in data.get("notes"):
                        self.log_result("Lead Data Persistence", "PASS", "Lead data persisted with updates", 200)
                    else:
                        self.log_result("Lead Data Persistence", "FAIL", "Lead updates not persisted", 200)
                else:
                    self.log_result("Lead Data Persistence", "FAIL", f"Lead not found: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("Lead Data Persistence", "FAIL", f"Exception: {str(e)}")
                
        # Test 2: Verify SOA still exists
        if "scope_id" in self.test_data and "admin" in self.tokens:
            try:
                scope_id = self.test_data["scope_id"]
                response = self.make_request("GET", f"/scope/{scope_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("SOA Data Persistence", "PASS", "SOA data persisted correctly", 200)
                else:
                    self.log_result("SOA Data Persistence", "FAIL", f"SOA not found: {response.status_code if response else 'No response'}", response.status_code if response else None)
            except Exception as e:
                self.log_result("SOA Data Persistence", "FAIL", f"Exception: {str(e)}")
                
    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting AgentRoute AI Backend API Comprehensive Test Suite")
        print(f"📍 Testing against: {BASE_URL}")
        print(f"⏰ Started at: {datetime.now().isoformat()}")
        
        # Run all test suites
        self.test_authentication_flow()
        self.test_leads_flow()
        self.test_appointments_flow()
        self.test_scope_flow()
        self.test_admin_dashboards()
        self.test_commission_tracking()
        self.test_role_based_access()
        self.test_data_persistence()
        
        # Generate summary
        self.generate_summary()
        
    def generate_summary(self):
        """Generate test summary report"""
        print("\n" + "="*80)
        print("📊 TEST SUMMARY REPORT")
        print("="*80)
        
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r["status"] == "PASS"])
        failed_tests = len([r for r in self.results if r["status"] == "FAIL"])
        
        print(f"📈 Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"📊 Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS ({failed_tests}):")
            for result in self.results:
                if result["status"] == "FAIL":
                    print(f"   • {result['test']}: {result['details']}")
                    
        print(f"\n✅ PASSED TESTS ({passed_tests}):")
        for result in self.results:
            if result["status"] == "PASS":
                print(f"   • {result['test']}: {result['details']}")
                
        # Test data summary
        print(f"\n📋 TEST DATA CREATED:")
        for key, value in self.test_data.items():
            if isinstance(value, dict):
                print(f"   • {key}: {value.get('name', value.get('email', str(value)[:50]))}")
            else:
                print(f"   • {key}: {str(value)[:50]}")
                
        print(f"\n⏰ Completed at: {datetime.now().isoformat()}")
        print("="*80)

if __name__ == "__main__":
    tester = APITester()
    tester.run_all_tests()