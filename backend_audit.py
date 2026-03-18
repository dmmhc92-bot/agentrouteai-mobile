#!/usr/bin/env python3
"""
Simple Backend API Audit for AgentRoute AI CRM
Focus on critical endpoints from review request
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BACKEND_URL = "https://agentroute-app-store.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class SimpleAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = 15  # Increased timeout
        self.tokens = {}
        self.test_results = []
        
    def log_result(self, test_name: str, success: bool, message: str):
        self.test_results.append({"test": test_name, "success": success, "message": message})
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")

    def login_user(self, role: str) -> Optional[str]:
        """Login and return token"""
        try:
            response = self.session.post(
                f"{BACKEND_URL}/auth/login",
                json=CREDENTIALS[role],
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                self.tokens[role] = token
                self.log_result(f"Login {role}", True, f"Token obtained")
                return token
            else:
                self.log_result(f"Login {role}", False, f"Status: {response.status_code}")
                return None
        except Exception as e:
            self.log_result(f"Login {role}", False, f"Error: {str(e)}")
            return None

    def make_request(self, method: str, endpoint: str, token: Optional[str] = None, **kwargs) -> Optional[requests.Response]:
        """Make API request"""
        try:
            headers = kwargs.pop('headers', {})
            if token:
                headers["Authorization"] = f"Bearer {token}"
            
            url = f"{BACKEND_URL}{endpoint}"
            return self.session.request(method, url, headers=headers, **kwargs)
        except Exception as e:
            print(f"Request error {method} {endpoint}: {e}")
            return None

    def test_authentication(self):
        """Test authentication endpoints"""
        print("\n🔐 AUTHENTICATION TESTS")
        
        # Test valid logins
        for role in ["admin", "manager", "agent"]:
            self.login_user(role)
        
        # Test invalid login
        try:
            response = self.session.post(
                f"{BACKEND_URL}/auth/login",
                json={"email": "invalid@test.com", "password": "wrong"},
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 401:
                self.log_result("Invalid Login", True, "Correctly rejected with 401")
            else:
                self.log_result("Invalid Login", False, f"Expected 401, got {response.status_code}")
        except Exception as e:
            self.log_result("Invalid Login", False, f"Error: {e}")

        # Test /auth/me with valid token
        admin_token = self.tokens.get("admin")
        if admin_token:
            response = self.make_request("GET", "/auth/me", admin_token)
            if response and response.status_code == 200:
                data = response.json()
                if "profile_image" in data:
                    self.log_result("Auth Me Valid Token", True, f"Returns user data with profile_image for {data.get('email')}")
                else:
                    self.log_result("Auth Me Valid Token", False, "Missing profile_image field")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Auth Me Valid Token", False, f"Status: {status}")

        # Test /auth/me without token
        response = self.make_request("GET", "/auth/me")
        if response and response.status_code == 403:
            self.log_result("Auth Me No Token", True, "Correctly rejected with 403")
        else:
            status = response.status_code if response else "No response"
            self.log_result("Auth Me No Token", False, f"Expected 403, got {status}")

    def test_role_access(self):
        """Test role-based access"""
        print("\n👥 ROLE-BASED ACCESS TESTS")
        
        admin_token = self.tokens.get("admin")
        agent_token = self.tokens.get("agent")
        
        # Admin users access
        if admin_token:
            response = self.make_request("GET", "/users", admin_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Admin Users Access", True, f"Access granted: {len(data)} users")
                else:
                    self.log_result("Admin Users Access", False, "Invalid data format")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Admin Users Access", False, f"Status: {status}")

        # Agent users access (should be restricted)
        if agent_token:
            response = self.make_request("GET", "/users", agent_token)
            if response and response.status_code == 403:
                self.log_result("Agent Users Restricted", True, "Correctly restricted with 403")
            elif response and response.status_code == 200:
                data = response.json()
                self.log_result("Agent Users Restricted", True, f"Limited access: {len(data) if isinstance(data, list) else 'invalid'} users")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Agent Users Restricted", False, f"Status: {status}")

        # Daily command center tests
        for role, token in [("admin", admin_token), ("manager", self.tokens.get("manager"))]:
            if token:
                response = self.make_request("GET", "/manager/daily-command-center", token)
                if response and response.status_code == 200:
                    data = response.json()
                    self.log_result(f"{role.title()} Command Center", True, f"Access granted: {len(str(data))} chars")
                else:
                    status = response.status_code if response else "No response"
                    self.log_result(f"{role.title()} Command Center", False, f"Status: {status}")

        # Agent command center (should be restricted)
        if agent_token:
            response = self.make_request("GET", "/manager/daily-command-center", agent_token)
            if response and response.status_code == 403:
                self.log_result("Agent Command Center Restricted", True, "Correctly restricted with 403")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Agent Command Center Restricted", False, f"Expected 403, got {status}")

    def test_leads_system(self):
        """Test leads CRUD operations"""
        print("\n📋 LEAD SYSTEM TESTS")
        
        admin_token = self.tokens.get("admin")
        agent_token = self.tokens.get("agent")
        
        # Get leads - Admin
        if admin_token:
            response = self.make_request("GET", "/leads", admin_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Leads Admin", True, f"{len(data)} leads found")
                    
                    # Test lead detail if leads exist
                    if len(data) > 0:
                        lead_id = data[0].get("id")
                        if lead_id:
                            detail_response = self.make_request("GET", f"/leads/{lead_id}", admin_token)
                            if detail_response and detail_response.status_code == 200:
                                self.log_result("Get Lead Detail", True, f"Lead detail retrieved for {lead_id}")
                            else:
                                status = detail_response.status_code if detail_response else "No response"
                                self.log_result("Get Lead Detail", False, f"Status: {status}")
                else:
                    self.log_result("Get Leads Admin", False, "Invalid data format")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Get Leads Admin", False, f"Status: {status}")

        # Get leads - Agent
        if agent_token:
            response = self.make_request("GET", "/leads", agent_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Leads Agent", True, f"{len(data)} leads found (agent view)")
                else:
                    self.log_result("Get Leads Agent", False, "Invalid data format")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Get Leads Agent", False, f"Status: {status}")

    def test_profile_image(self):
        """Test profile image functionality"""
        print("\n🖼️ PROFILE IMAGE TESTS")
        
        admin_token = self.tokens.get("admin")
        if not admin_token:
            self.log_result("Profile Image Tests", False, "No admin token")
            return

        # Sample base64 image
        sample_image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAKAAoDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+gD/9k="

        # Upload profile image
        upload_data = {"image_data": sample_image}
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
                self.log_result("Profile Image Upload", True, "Image uploaded successfully")
                
                # Check if image appears in /auth/me
                me_response = self.make_request("GET", "/auth/me", admin_token)
                if me_response and me_response.status_code == 200:
                    me_data = me_response.json()
                    if me_data.get("profile_image"):
                        self.log_result("Profile Image Persistence", True, f"Image persisted: {len(me_data['profile_image'])} chars")
                    else:
                        self.log_result("Profile Image Persistence", False, "Image not found in user data")
                
                # Delete profile image
                delete_response = self.make_request("DELETE", "/auth/profile-image", admin_token)
                if delete_response and delete_response.status_code == 200:
                    self.log_result("Profile Image Delete", True, "Image deleted successfully")
                    
                    # Verify deletion
                    verify_response = self.make_request("GET", "/auth/me", admin_token)
                    if verify_response and verify_response.status_code == 200:
                        verify_data = verify_response.json()
                        if verify_data.get("profile_image") is None:
                            self.log_result("Profile Image Deletion Verified", True, "Image successfully removed")
                        else:
                            self.log_result("Profile Image Deletion Verified", False, "Image still present")
                else:
                    status = delete_response.status_code if delete_response else "No response"
                    self.log_result("Profile Image Delete", False, f"Delete failed: {status}")
            else:
                self.log_result("Profile Image Upload", False, f"Unexpected response: {data}")
        else:
            status = response.status_code if response else "No response"
            self.log_result("Profile Image Upload", False, f"Upload failed: {status}")

    def test_appointments(self):
        """Test appointments endpoints"""
        print("\n📅 APPOINTMENTS TESTS")
        
        admin_token = self.tokens.get("admin")
        if admin_token:
            response = self.make_request("GET", "/appointments", admin_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Appointments", True, f"{len(data)} appointments found")
                else:
                    self.log_result("Get Appointments", False, "Invalid data format")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Get Appointments", False, f"Status: {status}")

    def test_team_management(self):
        """Test team management endpoints"""
        print("\n👨‍💼 TEAM MANAGEMENT TESTS")
        
        admin_token = self.tokens.get("admin")
        if admin_token:
            # Test users with profile_image field
            response = self.make_request("GET", "/users", admin_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    users_with_profile = [u for u in data if "profile_image" in u]
                    self.log_result("Users With Profile Image", True, f"{len(users_with_profile)}/{len(data)} users have profile_image field")
                else:
                    self.log_result("Users With Profile Image", False, "Invalid data format")
            
            # Test invitations
            response = self.make_request("GET", "/invitations", admin_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Invitations", True, f"{len(data)} invitations found")
                else:
                    self.log_result("Get Invitations", False, "Invalid data format")
            else:
                status = response.status_code if response else "No response"
                self.log_result("Get Invitations", False, f"Status: {status}")

    def test_health_check(self):
        """Test health check"""
        print("\n❤️ HEALTH CHECK")
        
        response = self.make_request("GET", "/health")
        if response and response.status_code == 200:
            data = response.json()
            if data.get("status") == "healthy":
                self.log_result("Health Check", True, "System healthy")
            else:
                self.log_result("Health Check", False, f"Status: {data.get('status')}")
        else:
            status = response.status_code if response else "No response"
            self.log_result("Health Check", False, f"Status: {status}")

    def run_all_tests(self):
        """Run all critical tests"""
        print("🚀 Backend API Audit - AgentRoute AI CRM")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 60)
        
        self.test_authentication()
        self.test_role_access()
        self.test_leads_system()
        self.test_profile_image()
        self.test_appointments()
        self.test_team_management()
        self.test_health_check()
        
        # Generate summary
        total = len(self.test_results)
        passed = len([r for r in self.test_results if r["success"]])
        failed = total - passed
        success_rate = (passed / total * 100) if total > 0 else 0
        
        print(f"\n📊 SUMMARY")
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if failed > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return {"total": total, "passed": passed, "failed": failed, "success_rate": success_rate}

if __name__ == "__main__":
    tester = SimpleAPITester()
    summary = tester.run_all_tests()
    
    exit_code = 0 if summary["failed"] == 0 else 1
    exit(exit_code)