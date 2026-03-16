#!/usr/bin/env python3
"""
AgentRoute AI Backend API Testing Suite
Testing NEW onboarding and notification endpoints as specified in review request
"""

import requests
import json
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://sales-team-hub-2.preview.emergentagent.com/api"
TIMEOUT = 30

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = TIMEOUT
        self.test_results = []
        self.tokens = {}  # Store tokens for different users
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()

    def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None, token: str = None) -> tuple:
        """Make HTTP request with error handling"""
        url = f"{BASE_URL}{endpoint}"
        
        # Set up headers
        req_headers = {"Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)
        if token:
            req_headers["Authorization"] = f"Bearer {token}"
        
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
                return False, f"Unsupported method: {method}", None
            
            return True, response.status_code, response.json() if response.content else {}
        except requests.exceptions.Timeout:
            return False, "Request timeout", None
        except requests.exceptions.ConnectionError:
            return False, "Connection error", None
        except json.JSONDecodeError:
            return False, f"Invalid JSON response (status: {response.status_code})", response.text if 'response' in locals() else None
        except Exception as e:
            return False, f"Request error: {str(e)}", None

    def test_create_organization(self):
        """Test PRIORITY 1: Create Organization Endpoint (NEW)"""
        print("🎯 TESTING PRIORITY 1: Core Onboarding Endpoints")
        print("=" * 60)
        
        # Generate unique email to avoid conflicts
        unique_id = str(uuid.uuid4())[:8]
        test_data = {
            "organization_name": "Test Insurance Agency",
            "name": "John Admin",
            "email": f"newadmin{unique_id}@testorg.com",
            "password": "TestPass123!",
            "phone": "555-123-4567"
        }
        
        success, status_code, response = self.make_request("POST", "/auth/create-organization", test_data)
        
        if success and status_code == 200:
            # Verify response structure
            required_fields = ["access_token", "token_type", "user"]
            if all(field in response for field in required_fields):
                user = response["user"]
                
                # Verify user properties (organization_owner field may not be in response model)
                checks = [
                    user.get("role") == "admin",
                    user.get("organization_id") is not None,
                    user.get("account_mode") == "connected"
                ]
                
                if all(checks):
                    # Store token for later tests
                    self.tokens["org_admin"] = response["access_token"]
                    self.tokens["org_admin_user_id"] = user["id"]
                    
                    self.log_test(
                        "Create Organization Endpoint", 
                        True, 
                        f"Organization created successfully. Admin user: {user['email']}, Role: {user['role']}, Org ID: {user['organization_id']}"
                    )
                else:
                    self.log_test(
                        "Create Organization Endpoint", 
                        False, 
                        f"User properties validation failed. Role: {user.get('role')}, Org ID: {user.get('organization_id')}, Account mode: {user.get('account_mode')}"
                    )
            else:
                self.log_test(
                    "Create Organization Endpoint", 
                    False, 
                    f"Missing required fields in response. Got: {list(response.keys())}"
                )
        else:
            self.log_test(
                "Create Organization Endpoint", 
                False, 
                f"Request failed with status {status_code}",
                response
            )

    def test_register_solo_agent(self):
        """Test PRIORITY 1: Register Solo Agent Endpoint (NEW)"""
        # Generate unique email to avoid conflicts
        unique_id = str(uuid.uuid4())[:8]
        test_data = {
            "name": "Solo Smith",
            "email": f"solo{unique_id}@testagent.com",
            "password": "SoloPass123!",
            "phone": "555-987-6543"
        }
        
        success, status_code, response = self.make_request("POST", "/auth/register-solo", test_data)
        
        if success and status_code == 200:
            # Verify response structure
            required_fields = ["access_token", "token_type", "user"]
            if all(field in response for field in required_fields):
                user = response["user"]
                
                # Verify user properties for solo agent
                checks = [
                    user.get("role") == "agent",
                    user.get("organization_id") is None,
                    user.get("account_mode") == "solo"
                ]
                
                if all(checks):
                    # Store token for later tests
                    self.tokens["solo_agent"] = response["access_token"]
                    
                    self.log_test(
                        "Register Solo Agent Endpoint", 
                        True, 
                        f"Solo agent registered successfully. User: {user['email']}, Role: {user['role']}, Account mode: {user['account_mode']}"
                    )
                else:
                    self.log_test(
                        "Register Solo Agent Endpoint", 
                        False, 
                        f"User properties validation failed. Role: {user.get('role')}, Org ID: {user.get('organization_id')}, Account mode: {user.get('account_mode')}"
                    )
            else:
                self.log_test(
                    "Register Solo Agent Endpoint", 
                    False, 
                    f"Missing required fields in response. Got: {list(response.keys())}"
                )
        else:
            self.log_test(
                "Register Solo Agent Endpoint", 
                False, 
                f"Request failed with status {status_code}",
                response
            )

    def test_notification_system(self):
        """Test PRIORITY 2: Notification System Endpoints (ALL NEW)"""
        print("🔔 TESTING PRIORITY 2: Notification System Endpoints")
        print("=" * 60)
        
        # Use org admin token from previous test
        admin_token = self.tokens.get("org_admin")
        if not admin_token:
            self.log_test("Notification System Setup", False, "No admin token available from create-organization test")
            return
        
        # Test 3: Register Push Token
        push_data = {
            "push_token": "ExponentPushToken[test123abc456]",
            "device_type": "ios"
        }
        
        success, status_code, response = self.make_request("POST", "/notifications/register-push-token", push_data, token=admin_token)
        
        if success and status_code == 200:
            expected_response = {"status": "success", "message": "Push token registered"}
            if response.get("status") == "success":
                self.log_test("Register Push Token", True, "Push token registered successfully")
            else:
                self.log_test("Register Push Token", False, f"Unexpected response: {response}")
        else:
            self.log_test("Register Push Token", False, f"Request failed with status {status_code}", response)
        
        # Test 4: Get Notification Preferences
        success, status_code, response = self.make_request("GET", "/notifications/preferences", token=admin_token)
        
        if success and status_code == 200:
            expected_fields = ["appointments", "reminders", "follow_ups", "team_alerts", "lead_alerts", "push_enabled"]
            if all(field in response for field in expected_fields):
                self.log_test("Get Notification Preferences", True, f"Preferences retrieved: {response}")
            else:
                self.log_test("Get Notification Preferences", False, f"Missing preference fields. Got: {list(response.keys())}")
        else:
            self.log_test("Get Notification Preferences", False, f"Request failed with status {status_code}", response)
        
        # Test 5: Update Notification Preferences
        update_prefs = {
            "appointments": True,
            "reminders": False,
            "follow_ups": True,
            "team_alerts": False,
            "lead_alerts": True,
            "push_enabled": True
        }
        
        success, status_code, response = self.make_request("PUT", "/notifications/preferences", update_prefs, token=admin_token)
        
        if success and status_code == 200:
            if response.get("status") == "success" and "preferences" in response:
                self.log_test("Update Notification Preferences", True, "Preferences updated successfully")
            else:
                self.log_test("Update Notification Preferences", False, f"Unexpected response: {response}")
        else:
            self.log_test("Update Notification Preferences", False, f"Request failed with status {status_code}", response)
        
        # Test 6: Send Test Notification
        success, status_code, response = self.make_request("POST", "/notifications/test", token=admin_token)
        
        notification_id = None
        if success and status_code == 200:
            if response.get("status") == "success" and "notification" in response:
                notification = response["notification"]
                required_fields = ["id", "title", "body", "type", "read", "created_at"]
                if all(field in notification for field in required_fields):
                    notification_id = notification["id"]
                    self.log_test("Send Test Notification", True, f"Test notification sent: {notification['title']}")
                else:
                    self.log_test("Send Test Notification", False, f"Missing notification fields. Got: {list(notification.keys())}")
            else:
                self.log_test("Send Test Notification", False, f"Unexpected response: {response}")
        else:
            self.log_test("Send Test Notification", False, f"Request failed with status {status_code}", response)
        
        # Test 7: Get Notifications
        success, status_code, response = self.make_request("GET", "/notifications?limit=10&unread_only=false", token=admin_token)
        
        if success and status_code == 200:
            if "notifications" in response and "unread_count" in response:
                self.log_test("Get Notifications", True, f"Retrieved {len(response['notifications'])} notifications, {response['unread_count']} unread")
            else:
                self.log_test("Get Notifications", False, f"Missing required fields. Got: {list(response.keys())}")
        else:
            self.log_test("Get Notifications", False, f"Request failed with status {status_code}", response)
        
        # Test 8: Get Unread Count
        success, status_code, response = self.make_request("GET", "/notifications/unread-count", token=admin_token)
        
        if success and status_code == 200:
            if "unread_count" in response:
                original_unread = response["unread_count"]
                self.log_test("Get Unread Count", True, f"Unread count: {original_unread}")
            else:
                self.log_test("Get Unread Count", False, f"Missing unread_count field. Got: {response}")
        else:
            self.log_test("Get Unread Count", False, f"Request failed with status {status_code}", response)
        
        # Test 9: Mark Notification Read (if we have a notification ID)
        if notification_id:
            success, status_code, response = self.make_request("PUT", f"/notifications/{notification_id}/read", token=admin_token)
            
            if success and status_code == 200:
                if response.get("status") == "success":
                    self.log_test("Mark Notification Read", True, f"Notification marked as read")
                else:
                    self.log_test("Mark Notification Read", False, f"Unexpected response: {response}")
            else:
                self.log_test("Mark Notification Read", False, f"Request failed with status {status_code}", response)
        else:
            self.log_test("Mark Notification Read", False, "No notification ID available from test notification")
        
        # Test 10: Mark All Read
        success, status_code, response = self.make_request("PUT", "/notifications/mark-all-read", token=admin_token)
        
        if success and status_code == 200:
            if response.get("status") == "success" and "unread_count" in response:
                self.log_test("Mark All Read", True, f"All notifications marked as read. Unread count: {response['unread_count']}")
            else:
                self.log_test("Mark All Read", False, f"Unexpected response: {response}")
        else:
            self.log_test("Mark All Read", False, f"Request failed with status {status_code}", response)

    def test_legal_pages(self):
        """Test PRIORITY 3: Legal Pages (verify still working)"""
        print("📄 TESTING PRIORITY 3: Legal Pages")
        print("=" * 60)
        
        # Test 11: Privacy Policy Page
        success, status_code, response = self.make_request("GET", "/privacy")
        
        if success and status_code == 200:
            # Check if response contains HTML with Privacy Policy content
            if isinstance(response, str) and "Privacy Policy" in response:
                self.log_test("Privacy Policy Page", True, "Privacy Policy page loaded with HTML content")
            elif isinstance(response, dict) and any("privacy" in str(v).lower() for v in response.values()):
                self.log_test("Privacy Policy Page", True, "Privacy Policy page loaded with content")
            else:
                self.log_test("Privacy Policy Page", False, f"Privacy Policy content not found in response")
        else:
            self.log_test("Privacy Policy Page", False, f"Request failed with status {status_code}", response)
        
        # Test 12: Terms of Service Page
        success, status_code, response = self.make_request("GET", "/terms")
        
        if success and status_code == 200:
            # Check if response contains HTML with Terms of Service content
            if isinstance(response, str) and "Terms of Service" in response:
                self.log_test("Terms of Service Page", True, "Terms of Service page loaded with HTML content")
            elif isinstance(response, dict) and any("terms" in str(v).lower() for v in response.values()):
                self.log_test("Terms of Service Page", True, "Terms of Service page loaded with content")
            else:
                self.log_test("Terms of Service Page", False, f"Terms of Service content not found in response")
        else:
            self.log_test("Terms of Service Page", False, f"Request failed with status {status_code}", response)

    def test_existing_auth_regression(self):
        """Test REGRESSION: Existing Auth (verify still working)"""
        print("🔐 TESTING REGRESSION: Existing Auth")
        print("=" * 60)
        
        # Test 13: Existing Admin Login
        admin_credentials = {
            "email": "admin@agentroute.com",
            "password": "Admin123!"
        }
        
        success, status_code, response = self.make_request("POST", "/auth/login", admin_credentials)
        
        if success and status_code == 200:
            if "access_token" in response:
                self.tokens["existing_admin"] = response["access_token"]
                self.log_test("Existing Admin Login", True, f"Admin login successful")
            else:
                self.log_test("Existing Admin Login", False, f"No access token in response: {response}")
        else:
            self.log_test("Existing Admin Login", False, f"Request failed with status {status_code}", response)
        
        # Test 14: Existing Agent Login
        agent_credentials = {
            "email": "agent@agentroute.com",
            "password": "Agent123!"
        }
        
        success, status_code, response = self.make_request("POST", "/auth/login", agent_credentials)
        
        if success and status_code == 200:
            if "access_token" in response:
                self.tokens["existing_agent"] = response["access_token"]
                self.log_test("Existing Agent Login", True, f"Agent login successful")
            else:
                self.log_test("Existing Agent Login", False, f"No access token in response: {response}")
        else:
            self.log_test("Existing Agent Login", False, f"Request failed with status {status_code}", response)

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 STARTING AGENTROUTE AI BACKEND API TESTING")
        print("=" * 80)
        print(f"Base URL: {BASE_URL}")
        print(f"Test started at: {datetime.now().isoformat()}")
        print("=" * 80)
        print()
        
        # Run test suites in order
        self.test_create_organization()
        self.test_register_solo_agent()
        self.test_notification_system()
        self.test_legal_pages()
        self.test_existing_auth_regression()
        
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("=" * 80)
        print("🎯 TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        print()
        
        if failed_tests > 0:
            print("❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   • {result['test']}: {result['details']}")
            print()
        
        print("✅ PASSED TESTS:")
        for result in self.test_results:
            if result["success"]:
                print(f"   • {result['test']}")
        
        print()
        print("=" * 80)
        print(f"Test completed at: {datetime.now().isoformat()}")
        print("=" * 80)

if __name__ == "__main__":
    tester = BackendTester()
    tester.run_all_tests()