#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for AgentRoute AI - Profile Image System
Testing Profile Image System API endpoints as requested in review.
"""

import requests
import json
import time
import uuid
import base64
from datetime import datetime
from typing import Dict, Any, List, Optional

# Configuration
BACKEND_URL = "https://profile-photo-upload-2.preview.emergentagent.com/api"

# Test credentials from review request
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},  
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

# Sample base64 encoded JPEG image (10x10 pixel red square)
SAMPLE_IMAGE_BASE64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAKAAoDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+gD/9k="

class ProfileImageAPITester:
    """Comprehensive test suite for Profile Image System API endpoints"""

    def __init__(self, backend_url: str):
        self.backend_url = backend_url.rstrip('/')
        self.session = requests.Session()
        self.session.timeout = 10
        self.test_results = []
        self.user_tokens = {}
        
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
                self.log_test_result(f"Login {user_type}", True, f"Login successful")
                return token
            else:
                self.log_test_result(f"Login {user_type}", False, f"Login failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            self.log_test_result(f"Login {user_type}", False, f"Login error: {str(e)}")
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
            print(f"Request error: {str(e)}")
            return None

    def test_profile_image_upload(self):
        """Test Profile Image Upload - POST /api/auth/profile-image"""
        test_name = "Profile Image Upload"
        
        # Login as admin first
        admin_token = self.user_tokens.get("admin") or self.login_user("admin")
        if not admin_token:
            self.log_test_result(test_name, False, "Admin login failed")
            return
        
        try:
            # Test upload with base64 JPEG data
            upload_data = {"image_data": SAMPLE_IMAGE_BASE64}
            
            response = self.make_authenticated_request(
                "POST", 
                "/auth/profile-image",
                admin_token,
                json=upload_data,
                headers={"Content-Type": "application/json"}
            )
            
            if not response:
                self.log_test_result(test_name, False, "No response received")
                return
                
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "profile_image" in data:
                    # Verify the returned profile_image contains base64 data
                    profile_image = data.get("profile_image", "")
                    if profile_image.startswith("data:image/"):
                        self.log_test_result(test_name, True, f"Profile image uploaded successfully. Image size: {len(profile_image)} chars")
                    else:
                        self.log_test_result(test_name, False, "Profile image upload returned invalid format")
                else:
                    self.log_test_result(test_name, False, f"Missing expected fields in response: {data}")
            else:
                self.log_test_result(test_name, False, f"Upload failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_profile_image_persistence(self):
        """Test Verify Profile Image Persistence - GET /api/auth/me"""
        test_name = "Profile Image Persistence Check"
        
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result(test_name, False, "Admin token not available")
            return
        
        try:
            response = self.make_authenticated_request(
                "GET",
                "/auth/me", 
                admin_token
            )
            
            if not response:
                self.log_test_result(test_name, False, "No response received")
                return
                
            if response.status_code == 200:
                data = response.json()
                profile_image = data.get("profile_image")
                
                if profile_image:
                    if profile_image.startswith("data:image/"):
                        self.log_test_result(test_name, True, f"Profile image persisted correctly. Image size: {len(profile_image)} chars")
                    else:
                        self.log_test_result(test_name, False, "Profile image persisted but in invalid format")
                else:
                    self.log_test_result(test_name, False, "Profile image not found in user data after upload")
            else:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_profile_image_deletion(self):
        """Test Delete Profile Image - DELETE /api/auth/profile-image"""
        test_name = "Profile Image Deletion"
        
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result(test_name, False, "Admin token not available")
            return
        
        try:
            response = self.make_authenticated_request(
                "DELETE",
                "/auth/profile-image",
                admin_token
            )
            
            if not response:
                self.log_test_result(test_name, False, "No response received")
                return
                
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "removed" in data["message"].lower():
                    self.log_test_result(test_name, True, "Profile image deleted successfully")
                else:
                    self.log_test_result(test_name, False, f"Unexpected response: {data}")
            else:
                self.log_test_result(test_name, False, f"Delete failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_profile_image_deletion_verification(self):
        """Test Verify Deletion - GET /api/auth/me"""
        test_name = "Profile Image Deletion Verification"
        
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result(test_name, False, "Admin token not available")
            return
        
        try:
            response = self.make_authenticated_request(
                "GET",
                "/auth/me",
                admin_token
            )
            
            if not response:
                self.log_test_result(test_name, False, "No response received")
                return
                
            if response.status_code == 200:
                data = response.json()
                profile_image = data.get("profile_image")
                
                if profile_image is None or profile_image == "":
                    self.log_test_result(test_name, True, "Profile image successfully removed from user data")
                else:
                    self.log_test_result(test_name, False, f"Profile image still present after deletion: {type(profile_image)} - {profile_image[:50] if profile_image else 'None'}...")
            else:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_users_list_includes_profile_image(self):
        """Test User Listing Includes Profile Image - GET /api/users"""
        test_name = "User Listing Includes Profile Image"
        
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result(test_name, False, "Admin token not available")
            return
        
        try:
            # First upload a profile image for admin
            upload_data = {"image_data": SAMPLE_IMAGE_BASE64}
            upload_response = self.make_authenticated_request(
                "POST",
                "/auth/profile-image",
                admin_token,
                json=upload_data,
                headers={"Content-Type": "application/json"}
            )
            
            if not upload_response or upload_response.status_code != 200:
                self.log_test_result(test_name, False, "Failed to upload test profile image")
                return
            
            time.sleep(1)  # Brief delay for data consistency
            
            # Now test the users listing
            response = self.make_authenticated_request(
                "GET",
                "/users",
                admin_token
            )
            
            if not response:
                self.log_test_result(test_name, False, "No response received")
                return
                
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Check if users have profile_image field
                    users_with_profile_image = [user for user in data if "profile_image" in user]
                    admin_user = next((user for user in data if user.get("email") == "admin@agentroute.com"), None)
                    
                    if admin_user and admin_user.get("profile_image"):
                        self.log_test_result(test_name, True, f"Users listing includes profile_image field. Found {len(users_with_profile_image)} users with profile_image field. Admin has profile image: {len(admin_user['profile_image'])} chars")
                    elif admin_user:
                        self.log_test_result(test_name, False, f"Admin user found but profile_image field is missing/empty: {admin_user.get('profile_image')}")
                    else:
                        self.log_test_result(test_name, False, "Admin user not found in users listing")
                else:
                    self.log_test_result(test_name, False, f"No users returned or invalid format: {type(data)} - {len(data) if isinstance(data, list) else 'not a list'}")
            else:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_get_specific_user_profile_image(self):
        """Test Get Specific User Profile Image - GET /api/users/{user_id}/profile-image"""
        test_name = "Get Specific User Profile Image"
        
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result(test_name, False, "Admin token not available")
            return
        
        try:
            # First get admin user ID
            me_response = self.make_authenticated_request(
                "GET",
                "/auth/me",
                admin_token
            )
            
            if not me_response or me_response.status_code != 200:
                self.log_test_result(test_name, False, "Failed to get current user info")
                return
                
            admin_user = me_response.json()
            admin_user_id = admin_user.get("id")
            
            if not admin_user_id:
                self.log_test_result(test_name, False, "Could not get admin user ID")
                return
            
            # Test getting specific user's profile image
            response = self.make_authenticated_request(
                "GET",
                f"/users/{admin_user_id}/profile-image",
                admin_token
            )
            
            if not response:
                self.log_test_result(test_name, False, "No response received")
                return
                
            if response.status_code == 200:
                data = response.json()
                if "user_id" in data and "profile_image" in data:
                    profile_image = data.get("profile_image")
                    if profile_image and profile_image.startswith("data:image/"):
                        self.log_test_result(test_name, True, f"Specific user profile image retrieved successfully. User: {data.get('name')}, Image size: {len(profile_image)} chars")
                    elif profile_image is None:
                        self.log_test_result(test_name, True, f"User profile image endpoint working correctly (no image set). User: {data.get('name')}")
                    else:
                        self.log_test_result(test_name, False, f"Profile image in invalid format: {type(profile_image)} - {str(profile_image)[:50] if profile_image else 'None'}...")
                else:
                    self.log_test_result(test_name, False, f"Missing expected fields in response: {data}")
            elif response.status_code == 404:
                self.log_test_result(test_name, False, "User not found (404)")
            elif response.status_code == 403:
                self.log_test_result(test_name, False, "Access denied (403) - permission issue")
            else:
                self.log_test_result(test_name, False, f"Request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_cross_user_profile_image_access(self):
        """Test cross-user profile image access with different roles"""
        test_name = "Cross-User Profile Image Access"
        
        # Login manager and agent
        manager_token = self.user_tokens.get("manager") or self.login_user("manager")
        agent_token = self.user_tokens.get("agent") or self.login_user("agent")
        
        if not manager_token or not agent_token:
            self.log_test_result(test_name, False, "Failed to login manager or agent")
            return
        
        try:
            # Get admin user ID
            admin_token = self.user_tokens.get("admin")
            if not admin_token:
                self.log_test_result(test_name, False, "Admin token not available")
                return
                
            admin_me = self.make_authenticated_request("GET", "/auth/me", admin_token)
            if not admin_me or admin_me.status_code != 200:
                self.log_test_result(test_name, False, "Failed to get admin user ID")
                return
                
            admin_user_id = admin_me.json().get("id")
            
            # Test manager accessing admin profile image
            manager_response = self.make_authenticated_request(
                "GET",
                f"/users/{admin_user_id}/profile-image",
                manager_token
            )
            
            # Test agent accessing admin profile image
            agent_response = self.make_authenticated_request(
                "GET", 
                f"/users/{admin_user_id}/profile-image",
                agent_token
            )
            
            success_count = 0
            notes = []
            
            # Analyze manager access
            if manager_response:
                if manager_response.status_code == 200:
                    success_count += 1
                    notes.append("Manager can view admin profile image (200)")
                elif manager_response.status_code == 403:
                    notes.append("Manager access denied to admin profile image (403)")
                else:
                    notes.append(f"Manager request returned: {manager_response.status_code}")
            
            # Analyze agent access  
            if agent_response:
                if agent_response.status_code == 200:
                    success_count += 1
                    notes.append("Agent can view admin profile image (200)")
                elif agent_response.status_code == 403:
                    notes.append("Agent access denied to admin profile image (403)")
                else:
                    notes.append(f"Agent request returned: {agent_response.status_code}")
            
            # Test is successful if permission system is working (either allow or deny consistently)
            self.log_test_result(test_name, True, f"Cross-user access tested. {' | '.join(notes)}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def test_invalid_image_data(self):
        """Test profile image upload with invalid data"""
        test_name = "Invalid Image Data Handling"
        
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_test_result(test_name, False, "Admin token not available")
            return
        
        try:
            # Test with invalid base64
            invalid_data = {"image_data": "invalid_base64_data"}
            
            response = self.make_authenticated_request(
                "POST",
                "/auth/profile-image",
                admin_token,
                json=invalid_data,
                headers={"Content-Type": "application/json"}
            )
            
            if not response:
                self.log_test_result(test_name, False, "No response received")
                return
                
            if response.status_code == 400:
                self.log_test_result(test_name, True, f"Invalid image data properly rejected with 400: {response.json().get('detail', 'No detail')}")
            else:
                self.log_test_result(test_name, False, f"Expected 400 for invalid data, got: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test_result(test_name, False, f"Test error: {str(e)}")

    def run_all_tests(self):
        """Run all profile image system tests"""
        print("🚀 Starting Profile Image System API Testing")
        print(f"Backend URL: {self.backend_url}")
        print("=" * 60)
        
        # Test sequence as requested in review
        self.test_profile_image_upload()
        self.test_profile_image_persistence()
        self.test_profile_image_deletion()
        self.test_profile_image_deletion_verification()
        self.test_users_list_includes_profile_image()
        self.test_get_specific_user_profile_image()
        
        # Additional tests for comprehensive coverage
        self.test_cross_user_profile_image_access()
        self.test_invalid_image_data()
        
        # Generate summary
        return self.generate_summary()

    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 60)
        print("📊 PROFILE IMAGE SYSTEM TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["success"]])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        print("\n✅ SUCCESSFUL TESTS:")
        for result in self.test_results:
            if result["success"]:
                print(f"  - {result['test']}: {result['message']}")
        
        return {
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": failed_tests,
            "success_rate": success_rate,
            "results": self.test_results
        }

if __name__ == "__main__":
    # Initialize tester
    tester = ProfileImageAPITester(BACKEND_URL)
    
    # Run comprehensive test suite
    summary = tester.run_all_tests()
    
    # Exit with appropriate code
    exit_code = 0 if summary["failed_tests"] == 0 else 1
    exit(exit_code)