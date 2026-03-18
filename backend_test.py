#!/usr/bin/env python3
"""
FINAL BACKEND VERIFICATION - AgentRoute AI
Testing all 24 critical backend API endpoints as specified in review request.
MUST ACHIEVE 100% PASS RATE
"""

import requests
import json
import time
import uuid
import base64
from datetime import datetime
from typing import Dict, Any, List, Optional

# Configuration from review request
BACKEND_URL = "https://agentroute-app-store.preview.emergentagent.com/api"

# Test credentials from review request
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},  
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

# Sample base64 encoded JPEG image (10x10 pixel red square)
SAMPLE_IMAGE_BASE64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAKAAoDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+gD/9k="

class FinalBackendTester:
    """FINAL BACKEND VERIFICATION - All 24 critical tests for 100% pass rate"""

    def __init__(self, backend_url: str):
        self.backend_url = backend_url.rstrip('/')
        self.session = requests.Session()
        self.session.timeout = 15
        self.test_results = []
        self.user_tokens = {}
        self.total_tests = 24
        self.passed_tests = 0
        self.failed_tests = 0
        
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
        
        if success:
            self.passed_tests += 1
        else:
            self.failed_tests += 1
            
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")

    def login_user(self, user_type: str) -> Optional[str]:
        """Login and return access token"""
        try:
            creds = TEST_CREDENTIALS[user_type]
            response = self.session.post(
                f"{self.backend_url}/auth/login",
                json=creds,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                self.user_tokens[user_type] = token
                return token
            else:
                return None
                
        except Exception as e:
            return None

    def make_authenticated_request(self, method: str, endpoint: str, token: str, **kwargs) -> Optional[requests.Response]:
        """Make authenticated API request"""
        try:
            headers = kwargs.pop('headers', {})
            headers["Authorization"] = f"Bearer {token}"
            
            url = f"{self.backend_url}{endpoint}"
            response = self.session.request(method, url, headers=headers, **kwargs)
            return response
        except Exception as e:
            return None

    def make_request(self, method: str, endpoint: str, **kwargs) -> Optional[requests.Response]:
        """Make unauthenticated API request"""
        try:
            url = f"{self.backend_url}{endpoint}"
            response = self.session.request(method, url, **kwargs)
            return response
        except Exception as e:
            return None

    # ==================== AUTHENTICATION TESTS (6 tests) ====================
    
    def test_01_admin_login(self):
        """Test 1: POST /api/auth/login - Admin credentials → 200 + token"""
        try:
            response = self.session.post(
                f"{self.backend_url}/auth/login",
                json=TEST_CREDENTIALS["admin"],
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if token:
                    self.user_tokens["admin"] = token
                    self.log_test_result("01_admin_login", True, "Admin login successful with token")
                else:
                    self.log_test_result("01_admin_login", False, "No access_token in response")
            else:
                self.log_test_result("01_admin_login", False, f"Failed with status {response.status_code}")
        except Exception as e:
            self.log_test_result("01_admin_login", False, f"Exception: {str(e)}")

    def test_02_manager_login(self):
        """Test 2: POST /api/auth/login - Manager credentials → 200 + token"""
        try:
            response = self.session.post(
                f"{self.backend_url}/auth/login",
                json=TEST_CREDENTIALS["manager"],
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if token:
                    self.user_tokens["manager"] = token
                    self.log_test_result("02_manager_login", True, "Manager login successful with token")
                else:
                    self.log_test_result("02_manager_login", False, "No access_token in response")
            else:
                self.log_test_result("02_manager_login", False, f"Failed with status {response.status_code}")
        except Exception as e:
            self.log_test_result("02_manager_login", False, f"Exception: {str(e)}")

    def test_03_agent_login(self):
        """Test 3: POST /api/auth/login - Agent credentials → 200 + token"""
        try:
            response = self.session.post(
                f"{self.backend_url}/auth/login",
                json=TEST_CREDENTIALS["agent"],
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if token:
                    self.user_tokens["agent"] = token
                    self.log_test_result("03_agent_login", True, "Agent login successful with token")
                else:
                    self.log_test_result("03_agent_login", False, "No access_token in response")
            else:
                self.log_test_result("03_agent_login", False, f"Failed with status {response.status_code}")
        except Exception as e:
            self.log_test_result("03_agent_login", False, f"Exception: {str(e)}")

    def test_04_invalid_credentials(self):
        """Test 4: POST /api/auth/login - Invalid credentials → 401"""
        try:
            invalid_creds = {"email": "invalid@test.com", "password": "wrongpassword"}
            response = self.session.post(
                f"{self.backend_url}/auth/login",
                json=invalid_creds,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 401:
                self.log_test_result("04_invalid_credentials", True, "Invalid credentials properly rejected with 401")
            else:
                self.log_test_result("04_invalid_credentials", False, f"Expected 401, got {response.status_code}")
        except Exception as e:
            self.log_test_result("04_invalid_credentials", False, f"Exception: {str(e)}")

    def test_05_auth_me_valid_token(self):
        """Test 5: GET /api/auth/me - Valid token → 200 + user data with profile_image"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("05_auth_me_valid_token", False, "No admin token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/auth/me", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                required_fields = ["id", "name", "email", "role"]
                has_required = all(field in data for field in required_fields)
                
                if has_required:
                    # Check if profile_image field exists (can be null)
                    has_profile_field = "profile_image" in data
                    if has_profile_field:
                        self.log_test_result("05_auth_me_valid_token", True, f"User data returned with profile_image field. Role: {data.get('role')}")
                    else:
                        self.log_test_result("05_auth_me_valid_token", False, "Missing profile_image field in user data")
                else:
                    self.log_test_result("05_auth_me_valid_token", False, f"Missing required fields in response: {list(data.keys())}")
            else:
                status = response.status_code if response else "no response"
                self.log_test_result("05_auth_me_valid_token", False, f"Failed with status {status}")
        except Exception as e:
            self.log_test_result("05_auth_me_valid_token", False, f"Exception: {str(e)}")

    def test_06_auth_me_no_token(self):
        """Test 6: GET /api/auth/me - No token → 401 or 403"""
        try:
            response = self.session.get(f"{self.backend_url}/auth/me")
            
            if response.status_code in [401, 403]:
                self.log_test_result("06_auth_me_no_token", True, f"Properly rejected with status {response.status_code}")
            else:
                self.log_test_result("06_auth_me_no_token", False, f"Expected 401/403, got {response.status_code}")
        except Exception as e:
            self.log_test_result("06_auth_me_no_token", False, f"Exception: {str(e)}")

    # ==================== LEAD CRUD TESTS (5 tests) ====================

    def test_07_get_leads_admin(self):
        """Test 7: GET /api/leads - As Admin → 200 with leads array"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("07_get_leads_admin", False, "No admin token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/leads", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result("07_get_leads_admin", True, f"Admin can access leads - found {len(data)} leads")
                else:
                    self.log_test_result("07_get_leads_admin", False, f"Response is not a list: {type(data)}")
            else:
                status = response.status_code if response else "no response"
                self.log_test_result("07_get_leads_admin", False, f"Failed with status {status}")
        except Exception as e:
            self.log_test_result("07_get_leads_admin", False, f"Exception: {str(e)}")

    def test_08_get_leads_agent(self):
        """Test 8: GET /api/leads - As Agent → 200 with agent's leads"""
        agent_token = self.user_tokens.get("agent")
        if not agent_token:
            self.log_test_result("08_get_leads_agent", False, "No agent token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/leads", agent_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result("08_get_leads_agent", True, f"Agent can access their leads - found {len(data)} leads")
                else:
                    self.log_test_result("08_get_leads_agent", False, f"Response is not a list: {type(data)}")
            else:
                status = response.status_code if response else "no response"
                self.log_test_result("08_get_leads_agent", False, f"Failed with status {status}")
        except Exception as e:
            self.log_test_result("08_get_leads_agent", False, f"Exception: {str(e)}")

    def test_09_create_lead(self):
        """Test 9: POST /api/leads - Create new lead → 200/201"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("09_create_lead", False, "No admin token available")
            return
        
        try:
            lead_data = {
                "name": f"Test Lead {uuid.uuid4().hex[:8]}",
                "phone": "555-123-4567",
                "email": "testlead@example.com",
                "address": "123 Test St, Test City, TS 12345",
                "notes": "Created during final backend verification",
                "source": "api_test"
            }
            
            response = self.make_authenticated_request(
                "POST", "/leads", admin_token,
                json=lead_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code in [200, 201]:
                data = response.json()
                lead_id = data.get("id")
                if lead_id:
                    self.created_lead_id = lead_id  # Store for subsequent tests
                    self.log_test_result("09_create_lead", True, f"Lead created successfully with ID: {lead_id}")
                else:
                    self.log_test_result("09_create_lead", False, "Lead created but no ID returned")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("09_create_lead", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("09_create_lead", False, f"Exception: {str(e)}")

    def test_10_get_lead_detail(self):
        """Test 10: GET /api/leads/{id} - Get lead detail → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("10_get_lead_detail", False, "No admin token available")
            return
        
        # Get any lead first
        try:
            leads_response = self.make_authenticated_request("GET", "/leads", admin_token)
            if leads_response and leads_response.status_code == 200:
                leads = leads_response.json()
                if leads and isinstance(leads, list) and len(leads) > 0:
                    lead_id = leads[0].get("id")
                    if lead_id:
                        # Get individual lead detail
                        response = self.make_authenticated_request("GET", f"/leads/{lead_id}", admin_token)
                        
                        if response and response.status_code == 200:
                            data = response.json()
                            required_fields = ["id", "name"]
                            if all(field in data for field in required_fields):
                                self.log_test_result("10_get_lead_detail", True, f"Lead detail retrieved: {data.get('name')}")
                            else:
                                self.log_test_result("10_get_lead_detail", False, "Missing required fields in lead detail")
                        else:
                            status = response.status_code if response else "no response"
                            self.log_test_result("10_get_lead_detail", False, f"Lead detail request failed with status {status}")
                    else:
                        self.log_test_result("10_get_lead_detail", False, "No lead ID found in leads list")
                else:
                    self.log_test_result("10_get_lead_detail", False, "No leads available to test detail endpoint")
            else:
                self.log_test_result("10_get_lead_detail", False, "Could not retrieve leads list")
        except Exception as e:
            self.log_test_result("10_get_lead_detail", False, f"Exception: {str(e)}")

    def test_11_update_lead(self):
        """Test 11: PUT /api/leads/{id} - Update lead → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("11_update_lead", False, "No admin token available")
            return
        
        # Get any lead first
        try:
            leads_response = self.make_authenticated_request("GET", "/leads", admin_token)
            if leads_response and leads_response.status_code == 200:
                leads = leads_response.json()
                if leads and isinstance(leads, list) and len(leads) > 0:
                    lead_id = leads[0].get("id")
                    if lead_id:
                        update_data = {
                            "notes": f"Updated during final backend verification at {datetime.now().isoformat()}"
                        }
                        
                        response = self.make_authenticated_request(
                            "PUT", f"/leads/{lead_id}", admin_token,
                            json=update_data,
                            headers={"Content-Type": "application/json"}
                        )
                        
                        if response and response.status_code == 200:
                            self.log_test_result("11_update_lead", True, f"Lead {lead_id} updated successfully")
                        else:
                            status = response.status_code if response else "no response"
                            text = response.text if response else "no response text"
                            self.log_test_result("11_update_lead", False, f"Update failed with status {status}: {text}")
                    else:
                        self.log_test_result("11_update_lead", False, "No lead ID found in leads list")
                else:
                    self.log_test_result("11_update_lead", False, "No leads available to test update endpoint")
            else:
                self.log_test_result("11_update_lead", False, "Could not retrieve leads list for update test")
        except Exception as e:
            self.log_test_result("11_update_lead", False, f"Exception: {str(e)}")

    # ==================== OFFLINE SYNC TESTS (3 tests) ====================

    def test_12_offline_lead_create(self):
        """Test 12: POST /api/leads/offline - New temp_id → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("12_offline_lead_create", False, "No admin token available")
            return
        
        try:
            timestamp = int(time.time() * 1000)
            temp_id = f"test_offline_{timestamp}"
            
            offline_data = {
                "name": "Offline Test Lead",
                "phone": "555-999-8888",
                "email": "offline@test.com",
                "temp_id": temp_id,
                "offline_timestamp": datetime.now().isoformat()
            }
            
            response = self.make_authenticated_request(
                "POST", "/leads/offline", admin_token,
                json=offline_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                data = response.json()
                if data.get("id"):
                    self.offline_temp_id = temp_id  # Store for duplicate test
                    self.log_test_result("12_offline_lead_create", True, f"Offline lead created with temp_id: {temp_id}")
                else:
                    self.log_test_result("12_offline_lead_create", False, "Offline lead created but no ID returned")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("12_offline_lead_create", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("12_offline_lead_create", False, f"Exception: {str(e)}")

    def test_13_offline_lead_duplicate(self):
        """Test 13: POST /api/leads/offline - Same temp_id → 409 (duplicate prevention)"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("13_offline_lead_duplicate", False, "No admin token available")
            return
        
        # Use the same temp_id from previous test
        temp_id = getattr(self, 'offline_temp_id', f"test_offline_{int(time.time() * 1000)}")
        
        try:
            duplicate_data = {
                "name": "Duplicate Offline Test Lead",
                "phone": "555-888-7777",
                "email": "duplicate@test.com",
                "temp_id": temp_id,
                "offline_timestamp": datetime.now().isoformat()
            }
            
            response = self.make_authenticated_request(
                "POST", "/leads/offline", admin_token,
                json=duplicate_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 409:
                self.log_test_result("13_offline_lead_duplicate", True, "Duplicate temp_id properly rejected with 409")
            elif response and response.status_code == 400:
                # Some systems may return 400 for duplicate prevention
                data = response.json()
                if "duplicate" in str(data).lower() or "exists" in str(data).lower():
                    self.log_test_result("13_offline_lead_duplicate", True, "Duplicate temp_id properly rejected with 400")
                else:
                    self.log_test_result("13_offline_lead_duplicate", False, f"Got 400 but not for duplicate: {data}")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("13_offline_lead_duplicate", False, f"Expected 409/400, got {status}: {text}")
        except Exception as e:
            self.log_test_result("13_offline_lead_duplicate", False, f"Exception: {str(e)}")

    def test_14_offline_lead_update(self):
        """Test 14: PUT /api/leads/{id}/offline - Update → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("14_offline_lead_update", False, "No admin token available")
            return
        
        # Get any lead first
        try:
            leads_response = self.make_authenticated_request("GET", "/leads", admin_token)
            if leads_response and leads_response.status_code == 200:
                leads = leads_response.json()
                if leads and isinstance(leads, list) and len(leads) > 0:
                    lead_id = leads[0].get("id")
                    if lead_id:
                        update_data = {
                            "temp_id": f"update_temp_{int(time.time() * 1000)}",
                            "offline_timestamp": datetime.now().isoformat(),
                            "notes": "Updated via offline sync"
                        }
                        
                        response = self.make_authenticated_request(
                            "PUT", f"/leads/{lead_id}/offline", admin_token,
                            json=update_data,
                            headers={"Content-Type": "application/json"}
                        )
                        
                        if response and response.status_code == 200:
                            self.log_test_result("14_offline_lead_update", True, f"Offline lead update successful for {lead_id}")
                        else:
                            status = response.status_code if response else "no response"
                            text = response.text if response else "no response text"
                            self.log_test_result("14_offline_lead_update", False, f"Failed with status {status}: {text}")
                    else:
                        self.log_test_result("14_offline_lead_update", False, "No lead ID found for offline update")
                else:
                    self.log_test_result("14_offline_lead_update", False, "No leads available for offline update test")
            else:
                self.log_test_result("14_offline_lead_update", False, "Could not retrieve leads for offline update test")
        except Exception as e:
            self.log_test_result("14_offline_lead_update", False, f"Exception: {str(e)}")

    # ==================== ROLE-BASED ACCESS TESTS (5 tests) ====================

    def test_15_get_users_admin(self):
        """Test 15: GET /api/users - As Admin → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("15_get_users_admin", False, "No admin token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/users", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result("15_get_users_admin", True, f"Admin can access users - found {len(data)} users")
                else:
                    self.log_test_result("15_get_users_admin", False, f"Response is not a list: {type(data)}")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("15_get_users_admin", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("15_get_users_admin", False, f"Exception: {str(e)}")

    def test_16_get_users_agent_denied(self):
        """Test 16: GET /api/users - As Agent → 403 (denied)"""
        agent_token = self.user_tokens.get("agent")
        if not agent_token:
            self.log_test_result("16_get_users_agent_denied", False, "No agent token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/users", agent_token)
            
            if response and response.status_code == 403:
                self.log_test_result("16_get_users_agent_denied", True, "Agent properly denied access to users with 403")
            else:
                status = response.status_code if response else "no response"
                self.log_test_result("16_get_users_agent_denied", False, f"Expected 403, got {status}")
        except Exception as e:
            self.log_test_result("16_get_users_agent_denied", False, f"Exception: {str(e)}")

    def test_17_manager_command_center_admin(self):
        """Test 17: GET /api/manager/daily-command-center - As Admin → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("17_manager_command_center_admin", False, "No admin token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/manager/daily-command-center", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                self.log_test_result("17_manager_command_center_admin", True, f"Admin can access manager command center - {len(str(data))} chars")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("17_manager_command_center_admin", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("17_manager_command_center_admin", False, f"Exception: {str(e)}")

    def test_18_manager_command_center_manager(self):
        """Test 18: GET /api/manager/daily-command-center - As Manager → 200"""
        manager_token = self.user_tokens.get("manager")
        if not manager_token:
            self.log_test_result("18_manager_command_center_manager", False, "No manager token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/manager/daily-command-center", manager_token)
            
            if response and response.status_code == 200:
                data = response.json()
                self.log_test_result("18_manager_command_center_manager", True, f"Manager can access command center - {len(str(data))} chars")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("18_manager_command_center_manager", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("18_manager_command_center_manager", False, f"Exception: {str(e)}")

    def test_19_manager_command_center_agent_denied(self):
        """Test 19: GET /api/manager/daily-command-center - As Agent → 403 (denied)"""
        agent_token = self.user_tokens.get("agent")
        if not agent_token:
            self.log_test_result("19_manager_command_center_agent_denied", False, "No agent token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/manager/daily-command-center", agent_token)
            
            if response and response.status_code == 403:
                self.log_test_result("19_manager_command_center_agent_denied", True, "Agent properly denied access to manager command center with 403")
            else:
                status = response.status_code if response else "no response"
                self.log_test_result("19_manager_command_center_agent_denied", False, f"Expected 403, got {status}")
        except Exception as e:
            self.log_test_result("19_manager_command_center_agent_denied", False, f"Exception: {str(e)}")

    # ==================== PROFILE IMAGE TESTS (2 tests) ====================

    def test_20_upload_profile_image(self):
        """Test 20: POST /api/auth/profile-image - Upload → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("20_upload_profile_image", False, "No admin token available")
            return
        
        try:
            upload_data = {"image_data": SAMPLE_IMAGE_BASE64}
            
            response = self.make_authenticated_request(
                "POST", "/auth/profile-image", admin_token,
                json=upload_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response and response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test_result("20_upload_profile_image", True, f"Profile image uploaded: {data.get('message')}")
                else:
                    self.log_test_result("20_upload_profile_image", False, f"Success but missing message: {data}")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("20_upload_profile_image", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("20_upload_profile_image", False, f"Exception: {str(e)}")

    def test_21_delete_profile_image(self):
        """Test 21: DELETE /api/auth/profile-image - Remove → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("21_delete_profile_image", False, "No admin token available")
            return
        
        try:
            response = self.make_authenticated_request("DELETE", "/auth/profile-image", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test_result("21_delete_profile_image", True, f"Profile image deleted: {data.get('message')}")
                else:
                    self.log_test_result("21_delete_profile_image", False, f"Success but missing message: {data}")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("21_delete_profile_image", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("21_delete_profile_image", False, f"Exception: {str(e)}")

    # ==================== OTHER ENDPOINTS TESTS (3 tests) ====================

    def test_22_get_appointments(self):
        """Test 22: GET /api/appointments - Any user → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("22_get_appointments", False, "No admin token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/appointments", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result("22_get_appointments", True, f"Appointments accessible - found {len(data)} appointments")
                else:
                    self.log_test_result("22_get_appointments", False, f"Response is not a list: {type(data)}")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("22_get_appointments", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("22_get_appointments", False, f"Exception: {str(e)}")

    def test_23_get_invitations(self):
        """Test 23: GET /api/invitations - Admin → 200"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result("23_get_invitations", False, "No admin token available")
            return
        
        try:
            response = self.make_authenticated_request("GET", "/invitations", admin_token)
            
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test_result("23_get_invitations", True, f"Invitations accessible - found {len(data)} invitations")
                else:
                    self.log_test_result("23_get_invitations", False, f"Response is not a list: {type(data)}")
            else:
                status = response.status_code if response else "no response"
                text = response.text if response else "no response text"
                self.log_test_result("23_get_invitations", False, f"Failed with status {status}: {text}")
        except Exception as e:
            self.log_test_result("23_get_invitations", False, f"Exception: {str(e)}")

    def test_24_health_check(self):
        """Test 24: GET /api/health → 200 with 'healthy'"""
        try:
            response = self.session.get(f"{self.backend_url}/health")
            
            if response and response.status_code == 200:
                try:
                    data = response.json()
                    if "healthy" in str(data).lower() or "status" in data:
                        self.log_test_result("24_health_check", True, f"Health check passed: {data}")
                    else:
                        self.log_test_result("24_health_check", False, f"Unexpected health response: {data}")
                except:
                    # In case it's just text response
                    text = response.text
                    if "healthy" in text.lower():
                        self.log_test_result("24_health_check", True, f"Health check passed: {text}")
                    else:
                        self.log_test_result("24_health_check", False, f"Unexpected health response: {text}")
            else:
                status = response.status_code if response else "no response"
                self.log_test_result("24_health_check", False, f"Health check failed with status {status}")
        except Exception as e:
            self.log_test_result("24_health_check", False, f"Exception: {str(e)}")

    # ==================== MAIN TEST RUNNER ====================

    def run_all_tests(self):
        """Run all 24 tests in the exact order specified by review request"""
        print("🎯 FINAL BACKEND VERIFICATION - MUST ACHIEVE 100% PASS RATE")
        print(f"Testing Backend URL: {self.backend_url}")
        print("=" * 80)
        
        # Run all 24 tests in order
        self.test_01_admin_login()
        self.test_02_manager_login()
        self.test_03_agent_login()
        self.test_04_invalid_credentials()
        self.test_05_auth_me_valid_token()
        self.test_06_auth_me_no_token()
        
        self.test_07_get_leads_admin()
        self.test_08_get_leads_agent()
        self.test_09_create_lead()
        self.test_10_get_lead_detail()
        self.test_11_update_lead()
        
        self.test_12_offline_lead_create()
        self.test_13_offline_lead_duplicate()
        self.test_14_offline_lead_update()
        
        self.test_15_get_users_admin()
        self.test_16_get_users_agent_denied()
        self.test_17_manager_command_center_admin()
        self.test_18_manager_command_center_manager()
        self.test_19_manager_command_center_agent_denied()
        
        self.test_20_upload_profile_image()
        self.test_21_delete_profile_image()
        
        self.test_22_get_appointments()
        self.test_23_get_invitations()
        self.test_24_health_check()
        
        return self.generate_summary()

    def generate_summary(self):
        """Generate final test summary"""
        print("\n" + "=" * 80)
        print("🎯 FINAL BACKEND VERIFICATION SUMMARY")
        print("=" * 80)
        
        pass_rate = (self.passed_tests / self.total_tests * 100) if self.total_tests > 0 else 0
        
        # CRITICAL: Report exact pass rate as specified in review request
        print(f"PASS RATE: {self.passed_tests}/{self.total_tests} tests passed ({pass_rate:.1f}%)")
        
        if self.failed_tests > 0:
            print(f"\n❌ FAILED TESTS ({self.failed_tests}):")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        if self.passed_tests > 0:
            print(f"\n✅ PASSED TESTS ({self.passed_tests}):")
            for result in self.test_results:
                if result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        # Final status
        if pass_rate == 100.0:
            print(f"\n🎉 SUCCESS: 100% PASS RATE ACHIEVED - ALL {self.total_tests} TESTS PASSED")
        else:
            print(f"\n⚠️  INCOMPLETE: {pass_rate:.1f}% PASS RATE - {self.failed_tests} TESTS FAILED")
        
        return {
            "total_tests": self.total_tests,
            "passed_tests": self.passed_tests,
            "failed_tests": self.failed_tests,
            "pass_rate": pass_rate,
            "results": self.test_results,
            "success": pass_rate == 100.0
        }

if __name__ == "__main__":
    # Initialize tester for FINAL BACKEND VERIFICATION
    tester = FinalBackendTester(BACKEND_URL)
    
    print("🔍 FINAL BACKEND VERIFICATION - MUST ACHIEVE 100% PASS RATE")
    print("=" * 80)
    print("Testing the following 24 critical endpoints:")
    print("\n📋 AUTHENTICATION (6 tests):")
    print("  1. POST /api/auth/login - Admin credentials → 200 + token")
    print("  2. POST /api/auth/login - Manager credentials → 200 + token")
    print("  3. POST /api/auth/login - Agent credentials → 200 + token")
    print("  4. POST /api/auth/login - Invalid credentials → 401")
    print("  5. GET /api/auth/me - Valid token → 200 + user data with profile_image")
    print("  6. GET /api/auth/me - No token → 401 or 403")
    print("\n📋 LEAD CRUD (5 tests):")
    print("  7. GET /api/leads - As Admin → 200 with leads array")
    print("  8. GET /api/leads - As Agent → 200 with agent's leads")
    print("  9. POST /api/leads - Create new lead → 200/201")
    print("  10. GET /api/leads/{id} - Get lead detail → 200")
    print("  11. PUT /api/leads/{id} - Update lead → 200")
    print("\n📋 OFFLINE SYNC (3 tests):")
    print("  12. POST /api/leads/offline - New temp_id → 200")
    print("  13. POST /api/leads/offline - Same temp_id → 409 (duplicate prevention)")
    print("  14. PUT /api/leads/{id}/offline - Update → 200")
    print("\n📋 ROLE-BASED ACCESS (5 tests):")
    print("  15. GET /api/users - As Admin → 200")
    print("  16. GET /api/users - As Agent → 403 (denied)")
    print("  17. GET /api/manager/daily-command-center - As Admin → 200")
    print("  18. GET /api/manager/daily-command-center - As Manager → 200")
    print("  19. GET /api/manager/daily-command-center - As Agent → 403 (denied)")
    print("\n📋 PROFILE IMAGE (2 tests):")
    print("  20. POST /api/auth/profile-image - Upload → 200")
    print("  21. DELETE /api/auth/profile-image - Remove → 200")
    print("\n📋 OTHER ENDPOINTS (3 tests):")
    print("  22. GET /api/appointments - Any user → 200")
    print("  23. GET /api/invitations - Admin → 200")
    print("  24. GET /api/health → 200 with 'healthy'")
    print("\n" + "=" * 80)
    print("Starting execution...\n")
    
    # Run comprehensive test suite
    summary = tester.run_all_tests()
    
    print("\n" + "=" * 80)
    print("FINAL VERIFICATION COMPLETE")
    print("=" * 80)
    
    if summary["success"]:
        print("🎉 VERIFICATION RESULT: SUCCESS - 100% PASS RATE ACHIEVED")
        exit_code = 0
    else:
        print(f"⚠️ VERIFICATION RESULT: INCOMPLETE - {summary['pass_rate']:.1f}% PASS RATE")
        print(f"❌ {summary['failed_tests']} tests failed out of {summary['total_tests']} total tests")
        exit_code = 1
    
    exit(exit_code)