#!/usr/bin/env python3
"""
Role-based access testing for Pipeline API
Testing admin/manager access to team_view functionality
"""

import requests
import json
import uuid
from datetime import datetime

# Configuration
BASE_URL = "https://app-store-ready-26.preview.emergentagent.com/api"

class RoleBasedTester:
    def __init__(self):
        self.session = requests.Session()
        self.results = []
        
    def log_result(self, test_name, success, details=""):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
    
    def test_role_access(self, email, password, role_name):
        """Test pipeline access for a specific role"""
        try:
            # Login
            response = self.session.post(f"{BASE_URL}/auth/login", json={
                "email": email,
                "password": password
            })
            
            if response.status_code != 200:
                self.log_result(f"{role_name} Login", False, f"Login failed: {response.status_code}")
                return False
            
            data = response.json()
            auth_token = data.get("access_token")
            user_info = data.get("user")
            user_role = user_info.get("role", "unknown")
            
            self.session.headers.update({"Authorization": f"Bearer {auth_token}"})
            self.log_result(f"{role_name} Login", True, f"Logged in as {user_info.get('name')} ({user_role})")
            
            # Test team_view=true access
            response = self.session.get(f"{BASE_URL}/pipeline", params={"team_view": True})
            
            if response.status_code == 200:
                data = response.json()
                is_team_view = data.get("is_team_view", False)
                
                if user_role in ["admin", "manager"]:
                    expected_access = True
                    if is_team_view:
                        self.log_result(f"{role_name} Team View Access", True, f"Team view granted for {user_role}")
                    else:
                        self.log_result(f"{role_name} Team View Access", False, f"Team view denied for {user_role} (should be granted)")
                else:
                    # Agent should not get team view
                    if not is_team_view:
                        self.log_result(f"{role_name} Team View Access", True, f"Team view correctly denied for {user_role}")
                    else:
                        self.log_result(f"{role_name} Team View Access", False, f"Team view incorrectly granted for {user_role}")
                
                return True
            else:
                self.log_result(f"{role_name} Team View Access", False, f"Pipeline request failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result(f"{role_name} Test", False, f"Exception: {str(e)}")
            return False
    
    def create_admin_user(self):
        """Create an admin user for testing"""
        try:
            admin_data = {
                "name": "Test Admin",
                "email": f"admin.test.{uuid.uuid4().hex[:8]}@example.com",
                "password": "AdminTest123!",
                "role": "admin"
            }
            
            response = requests.post(f"{BASE_URL}/auth/register", json=admin_data)
            
            if response.status_code == 200:
                data = response.json()
                user_info = data.get("user")
                self.log_result("Create Admin User", True, f"Created admin: {admin_data['email']}")
                return admin_data["email"], admin_data["password"]
            else:
                self.log_result("Create Admin User", False, f"Failed to create admin: {response.status_code}")
                return None, None
                
        except Exception as e:
            self.log_result("Create Admin User", False, f"Exception: {str(e)}")
            return None, None
    
    def run_role_tests(self):
        """Run role-based access tests"""
        print("🔐 Starting Role-Based Access Tests for Pipeline API")
        print("=" * 60)
        
        # Test with existing demo agent
        self.test_role_access("demo@agentroute.com", "Demo1234!", "Agent")
        
        # Create and test admin user
        admin_email, admin_password = self.create_admin_user()
        if admin_email and admin_password:
            self.test_role_access(admin_email, admin_password, "Admin")
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 ROLE ACCESS TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        return failed_tests == 0

def main():
    """Main test execution"""
    tester = RoleBasedTester()
    success = tester.run_role_tests()
    
    if success:
        print("\n🎉 All role-based access tests passed!")
        return 0
    else:
        print("\n💥 Some tests failed - check the details above")
        return 1

if __name__ == "__main__":
    exit(main())