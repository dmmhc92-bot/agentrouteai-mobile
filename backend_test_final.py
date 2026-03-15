#!/usr/bin/env python3
"""
AgentRoute AI Backend API Final Comprehensive Test Suite
Complete audit of all backend endpoints for iOS mobile app
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import base64
import time

# Configuration
BASE_URL = "https://agentrouteai-1.preview.emergentagent.com/api"
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

class ComprehensiveAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = TIMEOUT
        self.tokens = {}
        self.test_data = {}
        self.results = []
        
    def log_result(self, test_name, status, details="", response_code=None, root_cause="", fix_required=""):
        """Log test result with detailed information"""
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "response_code": response_code,
            "root_cause": root_cause,
            "fix_required": fix_required,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        status_symbol = "✅" if status == "PASS" else "❌"
        print(f"{status_symbol} {test_name}: {details}")
        if root_cause:
            print(f"   Root Cause: {root_cause}")
        if fix_required:
            print(f"   Fix Required: {fix_required}")
        
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
            
    def test_authentication_comprehensive(self):
        """Test all authentication flows for all user roles"""
        print("\n=== COMPREHENSIVE AUTHENTICATION TESTING ===")
        
        # Test 1: Admin Login
        try:
            response = self.make_request("POST", "/auth/login", TEST_CREDENTIALS["admin"])
            if response and response.status_code == 200:
                data = response.json()
                self.tokens["admin"] = data.get("access_token")
                self.test_data["admin_user"] = data.get("user", {})
                user_role = data.get("user", {}).get("role")
                if user_role == "admin":
                    self.log_result("Admin Login", "PASS", f"Admin authenticated successfully, role: {user_role}", 200)
                else:
                    self.log_result("Admin Login", "FAIL", f"Wrong role returned: {user_role}", 200, 
                                  "User role mismatch", "Verify admin user role in database")
            else:
                self.log_result("Admin Login", "FAIL", f"Login failed: {response.status_code if response else 'No response'}", 
                              response.status_code if response else None, "Authentication failure", 
                              "Check admin credentials and auth endpoint")
        except Exception as e:
            self.log_result("Admin Login", "FAIL", f"Exception: {str(e)}", None, "Network/API error", 
                          "Check API connectivity and error handling")
            
        # Test 2: Agent Login
        try:
            response = self.make_request("POST", "/auth/login", TEST_CREDENTIALS["agent"])
            if response and response.status_code == 200:
                data = response.json()
                self.tokens["agent"] = data.get("access_token")
                self.test_data["agent_user"] = data.get("user", {})
                user_role = data.get("user", {}).get("role")
                if user_role == "agent":
                    self.log_result("Agent Login", "PASS", f"Agent authenticated successfully, role: {user_role}", 200)
                else:
                    self.log_result("Agent Login", "FAIL", f"Wrong role returned: {user_role}", 200,
                                  "User role mismatch", "Verify agent user role in database")
            else:
                self.log_result("Agent Login", "FAIL", f"Login failed: {response.status_code if response else 'No response'}", 
                              response.status_code if response else None, "Authentication failure",
                              "Check agent credentials and auth endpoint")
        except Exception as e:
            self.log_result("Agent Login", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                          "Check API connectivity and error handling")
            
        # Test 3: Session validation (Admin)
        if "admin" in self.tokens:
            try:
                response = self.make_request("GET", "/auth/me", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Admin Session Validation", "PASS", f"Session valid for: {data.get('name')}", 200)
                else:
                    self.log_result("Admin Session Validation", "FAIL", f"Session validation failed: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "JWT token validation failure",
                                  "Check JWT token generation and validation logic")
            except Exception as e:
                self.log_result("Admin Session Validation", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
        # Test 4: Session validation (Agent)
        if "agent" in self.tokens:
            try:
                response = self.make_request("GET", "/auth/me", role="agent")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Agent Session Validation", "PASS", f"Session valid for: {data.get('name')}", 200)
                else:
                    self.log_result("Agent Session Validation", "FAIL", f"Session validation failed: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "JWT token validation failure",
                                  "Check JWT token generation and validation logic")
            except Exception as e:
                self.log_result("Agent Session Validation", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
    def test_dashboard_data_loading(self):
        """Test dashboard data loading for all user roles"""
        print("\n=== DASHBOARD DATA LOADING TESTING ===")
        
        # Test 1: Admin Dashboard Data
        if "admin" in self.tokens:
            dashboard_endpoints = [
                ("/team/snapshot", "Team Snapshot"),
                ("/team/agents", "Team Agents List"),
                ("/agency-command-center/summary", "Agency Command Center"),
                ("/needs-attention", "Needs Attention"),
                ("/pipeline?team_view=true", "Pipeline Team View"),
                ("/pipeline/stats?team_view=true", "Pipeline Stats")
            ]
            
            for endpoint, name in dashboard_endpoints:
                try:
                    response = self.make_request("GET", endpoint, role="admin")
                    if response and response.status_code == 200:
                        data = response.json()
                        self.log_result(f"Admin {name}", "PASS", f"Data loaded successfully", 200)
                    elif response and response.status_code == 404:
                        self.log_result(f"Admin {name}", "FAIL", f"Endpoint not found", 404,
                                      "Endpoint not implemented", f"Implement {endpoint} endpoint")
                    else:
                        self.log_result(f"Admin {name}", "FAIL", f"Failed to load: {response.status_code if response else 'No response'}", 
                                      response.status_code if response else None, "API endpoint error",
                                      f"Debug {endpoint} endpoint implementation")
                except Exception as e:
                    self.log_result(f"Admin {name}", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                                  "Check API connectivity and error handling")
                    
        # Test 2: Agent Dashboard Data
        if "agent" in self.tokens:
            agent_endpoints = [
                ("/leads", "Agent Leads"),
                ("/appointments", "Agent Appointments"),
                ("/pipeline", "Agent Pipeline"),
                ("/commissions", "Agent Commissions"),
                ("/tasks", "Agent Tasks")
            ]
            
            for endpoint, name in agent_endpoints:
                try:
                    response = self.make_request("GET", endpoint, role="agent")
                    if response and response.status_code == 200:
                        data = response.json()
                        self.log_result(f"Agent {name}", "PASS", f"Data loaded successfully", 200)
                    else:
                        self.log_result(f"Agent {name}", "FAIL", f"Failed to load: {response.status_code if response else 'No response'}", 
                                      response.status_code if response else None, "API endpoint error",
                                      f"Debug {endpoint} endpoint for agent role")
                except Exception as e:
                    self.log_result(f"Agent {name}", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                                  "Check API connectivity and error handling")
                    
    def test_lead_creation_flows(self):
        """Test manual and OCR lead creation"""
        print("\n=== LEAD CREATION FLOWS TESTING ===")
        
        # Test 1: Manual Lead Creation (Admin)
        if "admin" in self.tokens:
            try:
                lead_data = {
                    "name": "Manual Test Lead Admin",
                    "phone": "555-111-2222",
                    "email": "manual.admin@test.com",
                    "address": "123 Admin Street, Admin City, AC 12345",
                    "notes": "Manually created test lead by admin",
                    "source": "manual"
                }
                response = self.make_request("POST", "/leads", lead_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["manual_admin_lead_id"] = data.get("id")
                    self.log_result("Manual Lead Creation (Admin)", "PASS", f"Lead created: {data.get('name')}", 200)
                else:
                    self.log_result("Manual Lead Creation (Admin)", "FAIL", f"Failed to create lead: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "Lead creation API error",
                                  "Debug POST /leads endpoint validation and database insertion")
            except Exception as e:
                self.log_result("Manual Lead Creation (Admin)", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
        # Test 2: Manual Lead Creation (Agent)
        if "agent" in self.tokens:
            try:
                lead_data = {
                    "name": "Manual Test Lead Agent",
                    "phone": "555-333-4444",
                    "email": "manual.agent@test.com",
                    "address": "456 Agent Avenue, Agent City, AG 67890",
                    "notes": "Manually created test lead by agent",
                    "source": "manual"
                }
                response = self.make_request("POST", "/leads", lead_data, role="agent")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["manual_agent_lead_id"] = data.get("id")
                    self.log_result("Manual Lead Creation (Agent)", "PASS", f"Lead created: {data.get('name')}", 200)
                else:
                    self.log_result("Manual Lead Creation (Agent)", "FAIL", f"Failed to create lead: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "Lead creation API error",
                                  "Debug POST /leads endpoint for agent role")
            except Exception as e:
                self.log_result("Manual Lead Creation (Agent)", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
        # Test 3: OCR Lead Scanning
        if "admin" in self.tokens:
            try:
                # Test with mock image data
                ocr_data = {
                    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
                    "extract_fields": ["name", "phone", "email", "address"]
                }
                response = self.make_request("POST", "/ocr/scan", ocr_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("OCR Lead Scanning", "PASS", f"OCR processing successful", 200)
                elif response and response.status_code == 400:
                    self.log_result("OCR Lead Scanning", "FAIL", f"OCR validation error", 400,
                                  "Invalid image data or OCR processing error", 
                                  "Check OCR image validation and processing logic")
                elif response and response.status_code == 404:
                    self.log_result("OCR Lead Scanning", "FAIL", f"OCR endpoint not found", 404,
                                  "OCR endpoint not implemented", "Implement POST /ocr/scan endpoint")
                else:
                    self.log_result("OCR Lead Scanning", "FAIL", f"OCR failed: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "OCR API error",
                                  "Debug OCR processing implementation")
            except Exception as e:
                self.log_result("OCR Lead Scanning", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and OCR service integration")
                
    def test_appointment_flows(self):
        """Test appointment creation and management"""
        print("\n=== APPOINTMENT FLOWS TESTING ===")
        
        # Test 1: Appointment Creation
        if "manual_admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                apt_data = {
                    "lead_id": self.test_data["manual_admin_lead_id"],
                    "appointment_date": "2025-01-25",
                    "appointment_time": "10:00",
                    "notes": "Initial consultation meeting",
                    "status": "scheduled",
                    "appointment_type": "in_person"
                }
                response = self.make_request("POST", "/appointments", apt_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["test_appointment_id"] = data.get("id")
                    self.log_result("Appointment Creation", "PASS", f"Appointment created: {data.get('id')}", 200)
                else:
                    self.log_result("Appointment Creation", "FAIL", f"Failed to create appointment: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "Appointment creation API error",
                                  "Debug POST /appointments endpoint validation")
            except Exception as e:
                self.log_result("Appointment Creation", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
        # Test 2: Appointment Retrieval
        if "test_appointment_id" in self.test_data and "admin" in self.tokens:
            try:
                apt_id = self.test_data["test_appointment_id"]
                response = self.make_request("GET", f"/appointments/{apt_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Appointment Retrieval", "PASS", f"Appointment retrieved: {data.get('id')}", 200)
                else:
                    self.log_result("Appointment Retrieval", "FAIL", f"Failed to retrieve appointment: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "Appointment retrieval API error",
                                  "Debug GET /appointments/{id} endpoint")
            except Exception as e:
                self.log_result("Appointment Retrieval", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
        # Test 3: Lead Appointments List
        if "manual_admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                lead_id = self.test_data["manual_admin_lead_id"]
                response = self.make_request("GET", f"/appointments/lead/{lead_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result("Lead Appointments List", "PASS", f"Retrieved {len(data)} appointments for lead", 200)
                else:
                    self.log_result("Lead Appointments List", "FAIL", f"Failed to get lead appointments: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "Lead appointments API error",
                                  "Debug GET /appointments/lead/{id} endpoint")
            except Exception as e:
                self.log_result("Lead Appointments List", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
    def test_soa_comprehensive(self):
        """Test comprehensive SOA creation, signature handling, and PDF generation"""
        print("\n=== SCOPE OF APPOINTMENT COMPREHENSIVE TESTING ===")
        
        # Test 1: SOA Creation with Dual Signatures
        if "manual_admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                # Create realistic signature data (base64 encoded 1x1 pixel PNG)
                test_signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
                
                scope_data = {
                    "lead_id": self.test_data["manual_admin_lead_id"],
                    "form_fields": {
                        "beneficiary_name": "Manual Test Lead Admin",
                        "beneficiary_phone": "555-111-2222",
                        "beneficiary_address": "123 Admin Street, Admin City, AC 12345",
                        "medicare_advantage": True,
                        "medicare_supplement": False,
                        "prescription_drug": True,
                        "dental_vision": False,
                        "agent_name": "Test Admin Agent",
                        "agent_license": "LIC123456",
                        "agent_phone": "555-999-8888",
                        "agent_id_number": "NPN123456789",
                        "initial_contact_method": "phone"
                    },
                    "typed_name": "Manual Test Lead Admin",
                    "signature": test_signature,
                    "agent_typed_name": "Test Admin Agent",
                    "agent_signature": test_signature
                }
                response = self.make_request("POST", "/scope", scope_data, role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    self.test_data["test_scope_id"] = data.get("id")
                    
                    # Verify dual signatures are stored
                    has_beneficiary_sig = bool(data.get("signature"))
                    has_agent_sig = bool(data.get("agent_signature"))
                    
                    if has_beneficiary_sig and has_agent_sig:
                        self.log_result("SOA Creation with Dual Signatures", "PASS", 
                                      f"SOA created with both signatures: {data.get('id')}", 200)
                    else:
                        self.log_result("SOA Creation with Dual Signatures", "FAIL", 
                                      f"Missing signatures - Beneficiary: {has_beneficiary_sig}, Agent: {has_agent_sig}", 200,
                                      "Signature data not properly stored", 
                                      "Check signature field validation and storage in POST /scope endpoint")
                else:
                    self.log_result("SOA Creation with Dual Signatures", "FAIL", 
                                  f"Failed to create SOA: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "SOA creation API error",
                                  "Debug POST /scope endpoint validation and PDF generation")
            except Exception as e:
                self.log_result("SOA Creation with Dual Signatures", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
        # Test 2: SOA Retrieval and Signature Verification
        if "test_scope_id" in self.test_data and "admin" in self.tokens:
            try:
                scope_id = self.test_data["test_scope_id"]
                response = self.make_request("GET", f"/scope/{scope_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    
                    # Verify signature data integrity
                    beneficiary_sig = data.get("signature", "")
                    agent_sig = data.get("agent_signature", "")
                    
                    sig_issues = []
                    if not beneficiary_sig:
                        sig_issues.append("Missing beneficiary signature")
                    elif not beneficiary_sig.startswith("data:image/"):
                        sig_issues.append("Invalid beneficiary signature format")
                        
                    if not agent_sig:
                        sig_issues.append("Missing agent signature")
                    elif not agent_sig.startswith("data:image/"):
                        sig_issues.append("Invalid agent signature format")
                        
                    if not sig_issues:
                        self.log_result("SOA Signature Verification", "PASS", 
                                      "Both signatures retrieved with correct format", 200)
                    else:
                        self.log_result("SOA Signature Verification", "FAIL", 
                                      f"Signature issues: {', '.join(sig_issues)}", 200,
                                      "Signature data corruption or format issues",
                                      "Check signature encoding/decoding and storage format")
                else:
                    self.log_result("SOA Signature Verification", "FAIL", 
                                  f"Failed to retrieve SOA: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "SOA retrieval API error",
                                  "Debug GET /scope/{id} endpoint")
            except Exception as e:
                self.log_result("SOA Signature Verification", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
        # Test 3: SOA PDF Generation and Validation
        if "test_scope_id" in self.test_data and "admin" in self.tokens:
            try:
                scope_id = self.test_data["test_scope_id"]
                response = self.make_request("GET", f"/scope/{scope_id}/pdf", role="admin")
                if response and response.status_code == 200:
                    # Check if response contains PDF data
                    content_type = response.headers.get('content-type', '')
                    
                    if 'application/pdf' in content_type:
                        # Direct PDF response
                        pdf_size = len(response.content)
                        if pdf_size > 1000:  # Reasonable PDF size
                            self.log_result("SOA PDF Generation", "PASS", 
                                          f"PDF generated successfully ({pdf_size} bytes)", 200)
                        else:
                            self.log_result("SOA PDF Generation", "FAIL", 
                                          f"PDF too small ({pdf_size} bytes)", 200,
                                          "PDF generation incomplete or corrupted",
                                          "Check PDF generation logic and signature rendering")
                    else:
                        # JSON response with base64 PDF
                        try:
                            data = response.json()
                            pdf_base64 = data.get("pdf_base64", "")
                            if pdf_base64 and len(pdf_base64) > 1000:
                                self.log_result("SOA PDF Generation", "PASS", 
                                              f"PDF base64 generated successfully ({len(pdf_base64)} chars)", 200)
                            else:
                                self.log_result("SOA PDF Generation", "FAIL", 
                                              f"Invalid PDF base64 data", 200,
                                              "PDF base64 encoding issues",
                                              "Check PDF to base64 conversion in /scope/{id}/pdf endpoint")
                        except json.JSONDecodeError:
                            self.log_result("SOA PDF Generation", "FAIL", 
                                          f"Invalid JSON response", 200,
                                          "PDF endpoint response format error",
                                          "Fix PDF endpoint to return proper JSON or PDF content")
                else:
                    self.log_result("SOA PDF Generation", "FAIL", 
                                  f"PDF generation failed: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "PDF generation API error",
                                  "Debug GET /scope/{id}/pdf endpoint and PDF library integration")
            except Exception as e:
                self.log_result("SOA PDF Generation", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and PDF generation service")
                
        # Test 4: SOA List for Lead
        if "manual_admin_lead_id" in self.test_data and "admin" in self.tokens:
            try:
                lead_id = self.test_data["manual_admin_lead_id"]
                response = self.make_request("GET", f"/scope/lead/{lead_id}", role="admin")
                if response and response.status_code == 200:
                    data = response.json()
                    if len(data) > 0:
                        self.log_result("SOA List for Lead", "PASS", 
                                      f"Retrieved {len(data)} SOAs for lead", 200)
                    else:
                        self.log_result("SOA List for Lead", "FAIL", 
                                      "No SOAs found for lead", 200,
                                      "SOA not properly linked to lead",
                                      "Check lead_id association in SOA creation")
                else:
                    self.log_result("SOA List for Lead", "FAIL", 
                                  f"Failed to get lead SOAs: {response.status_code if response else 'No response'}", 
                                  response.status_code if response else None, "Lead SOA list API error",
                                  "Debug GET /scope/lead/{id} endpoint")
            except Exception as e:
                self.log_result("SOA List for Lead", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                              "Check API connectivity and error handling")
                
    def test_role_based_access_comprehensive(self):
        """Test comprehensive role-based access control"""
        print("\n=== ROLE-BASED ACCESS CONTROL TESTING ===")
        
        # Test 1: Agent accessing admin-only endpoints
        if "agent" in self.tokens:
            admin_only_endpoints = [
                ("/team/snapshot", "Team Snapshot"),
                ("/agency-command-center/summary", "Agency Command Center"),
                ("/scope/admin/all", "Admin SOA List")
            ]
            
            for endpoint, name in admin_only_endpoints:
                try:
                    response = self.make_request("GET", endpoint, role="agent")
                    if response and response.status_code == 403:
                        self.log_result(f"Agent Access Control - {name}", "PASS", 
                                      "Agent correctly denied admin access", 403)
                    elif response and response.status_code == 404:
                        self.log_result(f"Agent Access Control - {name}", "PASS", 
                                      "Endpoint not found (acceptable)", 404)
                    else:
                        self.log_result(f"Agent Access Control - {name}", "FAIL", 
                                      f"Agent should be denied access: {response.status_code if response else 'No response'}", 
                                      response.status_code if response else None, "Insufficient access control",
                                      f"Add role-based authorization to {endpoint}")
                except Exception as e:
                    self.log_result(f"Agent Access Control - {name}", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                                  "Check API connectivity and error handling")
                    
        # Test 2: Unauthorized access
        try:
            response = self.make_request("GET", "/leads")  # No token
            if response and response.status_code in [401, 403]:
                self.log_result("Unauthorized Access Control", "PASS", 
                              "Unauthorized access correctly denied", response.status_code)
            else:
                self.log_result("Unauthorized Access Control", "FAIL", 
                              f"Should deny unauthorized access: {response.status_code if response else 'No response'}", 
                              response.status_code if response else None, "Missing authentication middleware",
                              "Ensure all protected endpoints require valid JWT tokens")
        except Exception as e:
            self.log_result("Unauthorized Access Control", "FAIL", f"Exception: {str(e)}", None, "Network/API error",
                          "Check API connectivity and error handling")
            
    def run_comprehensive_audit(self):
        """Run complete comprehensive audit"""
        print("🚀 Starting AgentRoute AI Backend API Comprehensive Audit")
        print(f"📍 Testing against: {BASE_URL}")
        print(f"⏰ Started at: {datetime.now().isoformat()}")
        print("\n" + "="*80)
        
        # Run all test suites
        self.test_authentication_comprehensive()
        self.test_dashboard_data_loading()
        self.test_lead_creation_flows()
        self.test_appointment_flows()
        self.test_soa_comprehensive()
        self.test_role_based_access_comprehensive()
        
        # Generate final report
        self.generate_final_report()
        
    def generate_final_report(self):
        """Generate comprehensive final audit report"""
        print("\n" + "="*80)
        print("📊 AGENTROUTE AI BACKEND API COMPREHENSIVE AUDIT REPORT")
        print("="*80)
        
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r["status"] == "PASS"])
        failed_tests = len([r for r in self.results if r["status"] == "FAIL"])
        
        print(f"📈 SUMMARY:")
        print(f"   Total Tests: {total_tests}")
        print(f"   ✅ Passed: {passed_tests}")
        print(f"   ❌ Failed: {failed_tests}")
        print(f"   📊 Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        # Categorize results by flow
        flows = {
            "Authentication": [],
            "Dashboard": [],
            "Lead Creation": [],
            "Appointments": [],
            "SOA (Scope of Appointment)": [],
            "Access Control": []
        }
        
        for result in self.results:
            test_name = result["test"]
            if "Login" in test_name or "Session" in test_name or "Auth" in test_name:
                flows["Authentication"].append(result)
            elif "Dashboard" in test_name or "Team" in test_name or "Agency" in test_name or "Needs" in test_name or "Pipeline" in test_name:
                flows["Dashboard"].append(result)
            elif "Lead" in test_name or "OCR" in test_name:
                flows["Lead Creation"].append(result)
            elif "Appointment" in test_name:
                flows["Appointments"].append(result)
            elif "SOA" in test_name or "Scope" in test_name or "PDF" in test_name or "Signature" in test_name:
                flows["SOA (Scope of Appointment)"].append(result)
            elif "Access" in test_name or "Unauthorized" in test_name:
                flows["Access Control"].append(result)
        
        print(f"\n📋 DETAILED RESULTS BY FLOW:")
        
        for flow_name, flow_results in flows.items():
            if flow_results:
                print(f"\n🔸 {flow_name.upper()}:")
                for result in flow_results:
                    status_symbol = "✅" if result["status"] == "PASS" else "❌"
                    print(f"   {status_symbol} {result['test']}")
                    if result["status"] == "FAIL":
                        if result["root_cause"]:
                            print(f"      Root Cause: {result['root_cause']}")
                        if result["fix_required"]:
                            print(f"      Fix Required: {result['fix_required']}")
        
        # Critical Issues Summary
        critical_failures = [r for r in self.results if r["status"] == "FAIL" and 
                           ("SOA" in r["test"] or "PDF" in r["test"] or "Signature" in r["test"] or 
                            "Login" in r["test"] or "Auth" in r["test"])]
        
        if critical_failures:
            print(f"\n🚨 CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION:")
            for failure in critical_failures:
                print(f"   ❌ {failure['test']}")
                print(f"      Issue: {failure['root_cause']}")
                print(f"      Fix: {failure['fix_required']}")
        
        # Backend vs Frontend Issues Note
        print(f"\n📝 IMPORTANT NOTES:")
        print(f"   • This audit covers BACKEND API functionality only")
        print(f"   • Frontend/UI issues (signature rendering, PDF preview, mobile buttons) require separate frontend testing")
        print(f"   • React Native WebView issues are frontend implementation problems")
        print(f"   • Mobile-specific features (print, save to files, share) are iOS/React Native concerns")
        
        print(f"\n⏰ Audit completed at: {datetime.now().isoformat()}")
        print("="*80)

if __name__ == "__main__":
    tester = ComprehensiveAPITester()
    tester.run_comprehensive_audit()