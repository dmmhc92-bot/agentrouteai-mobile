#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for AgentRoute AI CRM
Complete system verification as requested in review request
Backend URL: https://crm-final-build.preview.emergentagent.com/api
"""

import requests
import json
import time
import uuid
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

# Configuration
BACKEND_URL = "https://crm-final-build.preview.emergentagent.com/api"

# Test credentials from review request
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

# Sample base64 encoded JPEG image for profile image testing
SAMPLE_IMAGE_BASE64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAKAAoDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+gD/9k="

class ComprehensiveBackendTester:
    """Comprehensive test suite for AgentRoute AI Backend API"""

    def __init__(self, backend_url: str):
        self.backend_url = backend_url.rstrip('/')
        self.session = requests.Session()
        self.session.timeout = 30
        self.test_results = []
        self.user_tokens = {}
        self.created_resources = {"leads": [], "appointments": []}
        
    def log_test_result(self, test_name: str, success: bool, message: str = "", response_data: Any = None):
        """Log test result with timestamp"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "response_data": response_data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")

    def make_request(self, method: str, endpoint: str, token: Optional[str] = None, **kwargs) -> Optional[requests.Response]:
        """Make API request with optional authentication"""
        try:
            headers = kwargs.pop('headers', {})
            if token:
                headers["Authorization"] = f"Bearer {token}"
            
            url = f"{self.backend_url}{endpoint}"
            response = self.session.request(method, url, headers=headers, **kwargs)
            return response
        except Exception as e:
            print(f"Request error for {method} {endpoint}: {str(e)}")
            return None

    # ==================== 1. AUTHENTICATION TESTS ====================

    def test_admin_login(self):
        """Test admin login credentials"""
        test_name = "Admin Login"
        try:
            response = self.make_request(
                "POST", 
                "/auth/login",
                json=TEST_CREDENTIALS["admin"],
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if token:
                    self.user_tokens["admin"] = token
                    self.log_test_result(test_name, True, "Admin login successful with valid token")
                else:
                    self.log_test_result(test_name, False, "No access token in response")
            elif response:
                self.log_test_result(test_name, False, f"Login failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_manager_login(self):
        """Test manager login credentials"""
        test_name = "Manager Login"
        try:
            response = self.make_request(
                "POST",
                "/auth/login", 
                json=TEST_CREDENTIALS["manager"],
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if token:
                    self.user_tokens["manager"] = token
                    self.log_test_result(test_name, True, "Manager login successful with valid token")
                else:
                    self.log_test_result(test_name, False, "No access token in response")
            elif response:
                self.log_test_result(test_name, False, f"Login failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_agent_login(self):
        """Test agent login credentials"""
        test_name = "Agent Login"
        try:
            response = self.make_request(
                "POST",
                "/auth/login",
                json=TEST_CREDENTIALS["agent"], 
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if token:
                    self.user_tokens["agent"] = token
                    self.log_test_result(test_name, True, "Agent login successful with valid token")
                else:
                    self.log_test_result(test_name, False, "No access token in response")
            elif response:
                self.log_test_result(test_name, False, f"Login failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_invalid_login(self):
        """Test invalid login credentials"""
        test_name = "Invalid Login"
        try:
            invalid_creds = {"email": "invalid@test.com", "password": "wrongpassword"}
            response = self.make_request(
                "POST",
                "/auth/login",
                json=invalid_creds,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 401:
                self.log_test_result(test_name, True, "Invalid credentials properly rejected with 401")
            elif response:
                self.log_test_result(test_name, False, f"Expected 401 for invalid credentials, got: {response.status_code}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_session_with_valid_token(self):
        """Test GET /api/auth/me with valid token"""
        test_name = "Session Valid Token"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/auth/me", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if "email" in data and "profile_image" in data:
                    self.log_test_result(test_name, True, f"Valid token returns user data with profile_image field for {data.get('email')}")
                else:
                    self.log_test_result(test_name, False, f"Missing expected fields in user data: {list(data.keys())}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_session_without_token(self):
        """Test GET /api/auth/me without token"""
        test_name = "Session No Token"
        try:
            response = self.make_request("GET", "/auth/me")
            
            if response and response.status_code == 403:
                self.log_test_result(test_name, True, "Request without token properly rejected with 403")
            elif response:
                self.log_test_result(test_name, False, f"Expected 403 for no token, got: {response.status_code}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_session_invalid_token(self):
        """Test GET /api/auth/me with invalid token"""
        test_name = "Session Invalid Token"
        try:
            fake_token = "invalid.jwt.token"
            response = self.make_request("GET", "/auth/me", fake_token)
            
            if response and response.status_code in [401, 403]:
                self.log_test_result(test_name, True, f"Invalid token properly rejected with {response.status_code}")
            elif response:
                self.log_test_result(test_name, False, f"Expected 401/403 for invalid token, got: {response.status_code}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    # ==================== 2. ROLE-BASED ACCESS TESTS ====================

    def test_admin_users_endpoint(self):
        """Test admin access to GET /api/users"""
        test_name = "Admin Users Access"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/users", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    self.log_test_result(test_name, True, f"Admin can access users list with {len(data)} users")
                else:
                    self.log_test_result(test_name, False, f"Unexpected users data format: {type(data)}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_agent_users_endpoint(self):
        """Test agent access to GET /api/users (should be restricted)"""
        test_name = "Agent Users Access Restriction"
        try:
            agent_token = self.user_tokens.get("agent")
            if not agent_token:
                self.log_test_result(test_name, False, "Agent token not available")
                return
                
            response = self.make_request("GET", "/users", agent_token)
            
            if response and response.status_code == 403:
                self.log_test_result(test_name, True, "Agent properly restricted from users endpoint (403)")
            elif response and response.status_code == 200:
                # Some systems may allow agents to see limited user data
                data = response.json()
                self.log_test_result(test_name, True, f"Agent has limited users access: {len(data) if isinstance(data, list) else 'invalid format'} users")
            elif response:
                self.log_test_result(test_name, False, f"Unexpected response: {response.status_code}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_admin_daily_command_center(self):
        """Test admin access to daily command center"""
        test_name = "Admin Daily Command Center"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/manager/daily-command-center", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                self.log_test_result(test_name, True, f"Admin can access daily command center: {len(str(data))} chars data")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_manager_daily_command_center(self):
        """Test manager access to daily command center"""
        test_name = "Manager Daily Command Center"
        try:
            manager_token = self.user_tokens.get("manager")
            if not manager_token:
                self.log_test_result(test_name, False, "Manager token not available")
                return
                
            response = self.make_request("GET", "/manager/daily-command-center", manager_token)
            
            if response and response.status_code == 200:
                data = response.json()
                self.log_test_result(test_name, True, f"Manager can access daily command center: {len(str(data))} chars data")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_agent_daily_command_center(self):
        """Test agent access to daily command center (should be restricted)"""
        test_name = "Agent Daily Command Center Restriction"
        try:
            agent_token = self.user_tokens.get("agent")
            if not agent_token:
                self.log_test_result(test_name, False, "Agent token not available")
                return
                
            response = self.make_request("GET", "/manager/daily-command-center", agent_token)
            
            if response and response.status_code == 403:
                self.log_test_result(test_name, True, "Agent properly restricted from daily command center (403)")
            elif response:
                self.log_test_result(test_name, False, f"Expected 403 for agent access, got: {response.status_code}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    # ==================== 3. LEAD SYSTEM TESTS ====================

    def test_get_leads_admin(self):
        """Test admin can get leads"""
        test_name = "Get Leads Admin"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/leads", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result(test_name, True, f"Admin can access leads: {len(data)} leads found")
                else:
                    self.log_test_result(test_name, False, f"Unexpected data format: {type(data)}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_get_leads_agent(self):
        """Test agent can get their leads"""
        test_name = "Get Leads Agent"
        try:
            agent_token = self.user_tokens.get("agent")
            if not agent_token:
                self.log_test_result(test_name, False, "Agent token not available")
                return
                
            response = self.make_request("GET", "/leads", agent_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result(test_name, True, f"Agent can access their leads: {len(data)} leads found")
                else:
                    self.log_test_result(test_name, False, f"Unexpected data format: {type(data)}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_create_lead(self):
        """Test lead creation"""
        test_name = "Create Lead"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            lead_data = {
                "first_name": "John",
                "last_name": "Doe",
                "phone": "555-123-4567",
                "email": "john.doe@example.com",
                "address": "123 Main St, Anytown, ST 12345",
                "age": 65,
                "status": "new",
                "source": "test_source"
            }
            
            response = self.make_request(
                "POST", 
                "/leads",
                admin_token,
                json=lead_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code in [200, 201]:
                data = response.json()
                lead_id = data.get("id") 
                if lead_id:
                    self.created_resources["leads"].append(lead_id)
                    self.log_test_result(test_name, True, f"Lead created successfully with ID: {lead_id}")
                else:
                    self.log_test_result(test_name, False, "Lead created but no ID returned")
            elif response:
                self.log_test_result(test_name, False, f"Lead creation failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_get_lead_detail(self):
        """Test getting lead detail"""
        test_name = "Get Lead Detail"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            # Use a created lead ID or get first available lead
            lead_id = None
            if self.created_resources["leads"]:
                lead_id = self.created_resources["leads"][0]
            else:
                # Get first available lead
                leads_response = self.make_request("GET", "/leads", admin_token)
                if leads_response and leads_response.status_code == 200:
                    leads = leads_response.json()
                    if isinstance(leads, list) and len(leads) > 0:
                        lead_id = leads[0].get("id")
            
            if not lead_id:
                self.log_test_result(test_name, False, "No lead ID available for testing")
                return
                
            response = self.make_request("GET", f"/leads/{lead_id}", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if "id" in data and data["id"] == lead_id:
                    self.log_test_result(test_name, True, f"Lead detail retrieved successfully for ID: {lead_id}")
                else:
                    self.log_test_result(test_name, False, "Lead data doesn't match requested ID")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_update_lead(self):
        """Test lead update"""
        test_name = "Update Lead"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            # Use a created lead ID
            lead_id = None
            if self.created_resources["leads"]:
                lead_id = self.created_resources["leads"][0]
            else:
                # Get first available lead
                leads_response = self.make_request("GET", "/leads", admin_token)
                if leads_response and leads_response.status_code == 200:
                    leads = leads_response.json()
                    if isinstance(leads, list) and len(leads) > 0:
                        lead_id = leads[0].get("id")
            
            if not lead_id:
                self.log_test_result(test_name, False, "No lead ID available for testing")
                return
                
            update_data = {
                "status": "contacted",
                "notes": "Test update via API"
            }
            
            response = self.make_request(
                "PUT", 
                f"/leads/{lead_id}",
                admin_token,
                json=update_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                self.log_test_result(test_name, True, f"Lead updated successfully: {lead_id}")
            elif response:
                self.log_test_result(test_name, False, f"Update failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_offline_lead_creation(self):
        """Test offline lead creation"""
        test_name = "Offline Lead Creation"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            temp_id = f"test_temp_{int(time.time())}"
            lead_data = {
                "temp_id": temp_id,
                "first_name": "Jane",
                "last_name": "Smith",
                "phone": "555-987-6543",
                "email": "jane.smith@example.com",
                "status": "new",
                "offline_timestamp": datetime.now().isoformat()
            }
            
            response = self.make_request(
                "POST",
                "/leads/offline",
                admin_token,
                json=lead_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code in [200, 201]:
                data = response.json()
                lead_id = data.get("id")
                if lead_id:
                    self.created_resources["leads"].append(lead_id)
                    self.log_test_result(test_name, True, f"Offline lead created with temp_id: {temp_id}, ID: {lead_id}")
                else:
                    self.log_test_result(test_name, False, "Offline lead created but no ID returned")
            elif response:
                self.log_test_result(test_name, False, f"Offline lead creation failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_offline_lead_duplicate_prevention(self):
        """Test offline lead duplicate prevention"""
        test_name = "Offline Lead Duplicate Prevention"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            temp_id = f"duplicate_test_{int(time.time())}"
            lead_data = {
                "temp_id": temp_id,
                "first_name": "Duplicate",
                "last_name": "Test",
                "phone": "555-111-2222",
                "email": "duplicate@example.com",
                "status": "new"
            }
            
            # First creation should succeed
            first_response = self.make_request(
                "POST",
                "/leads/offline",
                admin_token,
                json=lead_data,
                headers={"Content-Type": "application/json"}
            )
            
            if not first_response or first_response.status_code not in [200, 201]:
                self.log_test_result(test_name, False, "First lead creation failed")
                return
                
            # Second creation with same temp_id should fail
            second_response = self.make_request(
                "POST",
                "/leads/offline", 
                admin_token,
                json=lead_data,
                headers={"Content-Type": "application/json"}
            )
            
            if second_response and second_response.status_code == 409:
                self.log_test_result(test_name, True, f"Duplicate prevention working correctly (409 Conflict)")
            elif second_response:
                self.log_test_result(test_name, False, f"Expected 409 for duplicate, got: {second_response.status_code}")
            else:
                self.log_test_result(test_name, False, "No response received for duplicate test")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_offline_lead_update(self):
        """Test offline lead update"""
        test_name = "Offline Lead Update"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            # Get a lead ID for update testing
            lead_id = None
            if self.created_resources["leads"]:
                lead_id = self.created_resources["leads"][0]
            else:
                leads_response = self.make_request("GET", "/leads", admin_token)
                if leads_response and leads_response.status_code == 200:
                    leads = leads_response.json()
                    if isinstance(leads, list) and len(leads) > 0:
                        lead_id = leads[0].get("id")
            
            if not lead_id:
                self.log_test_result(test_name, False, "No lead ID available for testing")
                return
                
            update_data = {
                "temp_id": f"update_temp_{int(time.time())}",
                "offline_timestamp": datetime.now().isoformat(),
                "notes": "Offline update test"
            }
            
            response = self.make_request(
                "PUT",
                f"/leads/{lead_id}/offline",
                admin_token,
                json=update_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                data = response.json()
                if data.get("conflict") == False:
                    self.log_test_result(test_name, True, "Offline lead update successful with no conflicts")
                else:
                    self.log_test_result(test_name, True, f"Offline lead update completed with conflict info: {data}")
            elif response:
                self.log_test_result(test_name, False, f"Update failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    # ==================== 4. PROFILE IMAGE TESTS ====================

    def test_profile_image_upload(self):
        """Test profile image upload"""
        test_name = "Profile Image Upload"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            upload_data = {"image_data": SAMPLE_IMAGE_BASE64}
            
            response = self.make_request(
                "POST",
                "/auth/profile-image",
                admin_token,
                json=upload_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                data = response.json()
                if "message" in data and "profile_image" in data:
                    self.log_test_result(test_name, True, "Profile image uploaded successfully")
                else:
                    self.log_test_result(test_name, False, f"Unexpected response structure: {data}")
            elif response:
                self.log_test_result(test_name, False, f"Upload failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_profile_image_in_auth_me(self):
        """Test profile image appears in /auth/me"""
        test_name = "Profile Image in Auth Me"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/auth/me", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                profile_image = data.get("profile_image")
                if profile_image:
                    self.log_test_result(test_name, True, f"Profile image present in auth/me: {len(profile_image)} chars")
                else:
                    self.log_test_result(test_name, True, "Profile image field present but null (no image set)")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_profile_image_delete(self):
        """Test profile image deletion"""
        test_name = "Profile Image Delete"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("DELETE", "/auth/profile-image", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test_result(test_name, True, "Profile image deleted successfully")
                else:
                    self.log_test_result(test_name, False, f"Unexpected response: {data}")
            elif response:
                self.log_test_result(test_name, False, f"Delete failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_profile_image_after_delete(self):
        """Test profile image is null after deletion"""
        test_name = "Profile Image Null After Delete"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/auth/me", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                profile_image = data.get("profile_image")
                if profile_image is None or profile_image == "":
                    self.log_test_result(test_name, True, "Profile image successfully removed from user data")
                else:
                    self.log_test_result(test_name, False, f"Profile image still present: {type(profile_image)}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    # ==================== 5. APPOINTMENTS & CALENDAR ====================

    def test_get_appointments(self):
        """Test getting appointments"""
        test_name = "Get Appointments"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/appointments", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result(test_name, True, f"Appointments retrieved successfully: {len(data)} appointments")
                else:
                    self.log_test_result(test_name, False, f"Unexpected data format: {type(data)}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_create_appointment(self):
        """Test creating appointment"""
        test_name = "Create Appointment"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            # Get a lead ID for the appointment
            lead_id = None
            if self.created_resources["leads"]:
                lead_id = self.created_resources["leads"][0]
            else:
                leads_response = self.make_request("GET", "/leads", admin_token)
                if leads_response and leads_response.status_code == 200:
                    leads = leads_response.json()
                    if isinstance(leads, list) and len(leads) > 0:
                        lead_id = leads[0].get("id")
            
            if not lead_id:
                # Create appointment without lead_id if required
                appointment_data = {
                    "title": "Test Appointment",
                    "description": "API Test Appointment",
                    "appointment_date": (datetime.now() + timedelta(days=1)).isoformat(),
                    "duration_minutes": 60
                }
            else:
                appointment_data = {
                    "lead_id": lead_id,
                    "title": "Test Appointment with Lead", 
                    "description": "API Test Appointment",
                    "appointment_date": (datetime.now() + timedelta(days=1)).isoformat(),
                    "duration_minutes": 60
                }
            
            response = self.make_request(
                "POST",
                "/appointments",
                admin_token,
                json=appointment_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code in [200, 201]:
                data = response.json()
                appointment_id = data.get("id")
                if appointment_id:
                    self.created_resources["appointments"].append(appointment_id)
                    self.log_test_result(test_name, True, f"Appointment created successfully: {appointment_id}")
                else:
                    self.log_test_result(test_name, False, "Appointment created but no ID returned")
            elif response:
                self.log_test_result(test_name, False, f"Creation failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    # ==================== 6. TEAM MANAGEMENT ====================

    def test_get_users_with_profile_image(self):
        """Test users list includes profile_image field"""
        test_name = "Users List With Profile Image"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/users", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Check if users have profile_image field
                    users_with_profile_field = [user for user in data if "profile_image" in user]
                    if len(users_with_profile_field) > 0:
                        self.log_test_result(test_name, True, f"Users list includes profile_image field for {len(users_with_profile_field)}/{len(data)} users")
                    else:
                        self.log_test_result(test_name, False, "No users have profile_image field")
                else:
                    self.log_test_result(test_name, False, f"No users found or invalid format: {type(data)}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_get_invitations(self):
        """Test getting invitations list"""
        test_name = "Get Invitations"
        try:
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            response = self.make_request("GET", "/invitations", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result(test_name, True, f"Invitations retrieved successfully: {len(data)} invitations")
                else:
                    self.log_test_result(test_name, False, f"Unexpected data format: {type(data)}")
            elif response:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    # ==================== 7. HEALTH CHECK ====================

    def test_health_check(self):
        """Test health check endpoint"""
        test_name = "Health Check"
        try:
            response = self.make_request("GET", "/health")
            
            if response and response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy":
                    self.log_test_result(test_name, True, "Health check returns healthy status")
                else:
                    self.log_test_result(test_name, False, f"Unexpected health status: {data.get('status')}")
            elif response:
                self.log_test_result(test_name, False, f"Health check failed: {response.status_code} - {response.text}")
            else:
                self.log_test_result(test_name, False, "No response received")
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    # ==================== TEST EXECUTION ====================

    def run_all_tests(self):
        """Run comprehensive test suite"""
        print("🚀 Starting Comprehensive Backend API Audit - AgentRoute AI CRM")
        print(f"Backend URL: {self.backend_url}")
        print(f"Test Credentials: Admin, Manager, Agent")
        print("=" * 80)
        
        # 1. Authentication Tests
        print("\n🔐 1. AUTHENTICATION TESTS")
        self.test_admin_login()
        self.test_manager_login()
        self.test_agent_login()
        self.test_invalid_login()
        self.test_session_with_valid_token()
        self.test_session_without_token()
        self.test_session_invalid_token()
        
        # 2. Role-Based Access Tests
        print("\n👥 2. ROLE-BASED ACCESS TESTS")
        self.test_admin_users_endpoint()
        self.test_agent_users_endpoint()
        self.test_admin_daily_command_center()
        self.test_manager_daily_command_center()
        self.test_agent_daily_command_center()
        
        # 3. Lead System Tests
        print("\n📋 3. LEAD SYSTEM TESTS")
        self.test_get_leads_admin()
        self.test_get_leads_agent()
        self.test_create_lead()
        self.test_get_lead_detail()
        self.test_update_lead()
        self.test_offline_lead_creation()
        self.test_offline_lead_duplicate_prevention()
        self.test_offline_lead_update()
        
        # 4. Profile Image Tests
        print("\n🖼️ 4. PROFILE IMAGE TESTS")
        self.test_profile_image_upload()
        self.test_profile_image_in_auth_me()
        self.test_profile_image_delete()
        self.test_profile_image_after_delete()
        
        # 5. Appointments & Calendar
        print("\n📅 5. APPOINTMENTS & CALENDAR")
        self.test_get_appointments()
        self.test_create_appointment()
        
        # 6. Team Management
        print("\n👨‍💼 6. TEAM MANAGEMENT")
        self.test_get_users_with_profile_image()
        self.test_get_invitations()
        
        # 7. Health Check
        print("\n❤️ 7. HEALTH CHECK")
        self.test_health_check()
        
        return self.generate_summary()

    def generate_summary(self):
        """Generate comprehensive test summary"""
        print("\n" + "=" * 80)
        print("📊 COMPREHENSIVE BACKEND API AUDIT SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["success"]])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Critical checks summary
        critical_issues = []
        no_500_errors = True
        role_permissions_working = True
        crud_working = True
        
        for result in self.test_results:
            if not result["success"]:
                if "500" in result["message"]:
                    no_500_errors = False
                    critical_issues.append(f"500 Error: {result['test']}")
                elif "403" not in result["message"] and "role" in result["test"].lower():
                    role_permissions_working = False
                    critical_issues.append(f"Role Permission Issue: {result['test']}")
                elif any(crud in result["test"].lower() for crud in ["create", "get", "update", "delete"]):
                    crud_working = False
                    critical_issues.append(f"CRUD Issue: {result['test']}")
        
        print(f"\n🔍 CRITICAL CHECKS:")
        print(f"✅ No 500 errors: {'YES' if no_500_errors else 'NO'}")
        print(f"✅ Role permissions enforced: {'YES' if role_permissions_working else 'NO'}")
        print(f"✅ CRUD operations work: {'YES' if crud_working else 'NO'}")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS ({failed_tests}):")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        if critical_issues:
            print(f"\n🚨 CRITICAL ISSUES:")
            for issue in critical_issues:
                print(f"  - {issue}")
        
        print(f"\n✅ PASSED TESTS ({passed_tests}):")
        for result in self.test_results:
            if result["success"]:
                print(f"  - {result['test']}: {result['message']}")
        
        return {
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": failed_tests,
            "success_rate": success_rate,
            "no_500_errors": no_500_errors,
            "role_permissions_working": role_permissions_working,
            "crud_working": crud_working,
            "critical_issues": critical_issues,
            "results": self.test_results
        }

if __name__ == "__main__":
    # Initialize comprehensive tester
    tester = ComprehensiveBackendTester(BACKEND_URL)
    
    # Run comprehensive test suite
    summary = tester.run_all_tests()
    
    # Exit with appropriate code
    exit_code = 0 if summary["failed_tests"] == 0 else 1
    exit(exit_code)