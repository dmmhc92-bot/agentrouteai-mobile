#!/usr/bin/env python3
"""
AgentRoute AI Backend API Testing - INVITE-LINK SYSTEM
Comprehensive testing of the invitation system functionality
"""

import requests
import json
import sys
from datetime import datetime
import time

# Configuration
API_BASE_URL = "https://agentroute-sales.preview.emergentagent.com/api"

# Test credentials
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class InviteSystemTester:
    def __init__(self):
        self.session = requests.Session()
        self.tokens = {}
        self.test_results = []
        self.created_invitations = []
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")
        if response_data and not success:
            print(f"    Response: {response_data}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
        
    def login_user(self, role):
        """Login and get access token for a user role"""
        try:
            creds = TEST_CREDENTIALS[role]
            response = self.session.post(f"{API_BASE_URL}/auth/login", json=creds)
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                self.tokens[role] = token
                self.log_test(f"Login as {role}", True, f"Token obtained: {token[:20]}...")
                return token
            else:
                self.log_test(f"Login as {role}", False, f"Status: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test(f"Login as {role}", False, f"Exception: {str(e)}")
            return None
    
    def make_authenticated_request(self, method, endpoint, role, data=None, params=None):
        """Make an authenticated API request"""
        if role not in self.tokens:
            self.log_test(f"Auth check for {role}", False, "No token available")
            return None
            
        headers = {"Authorization": f"Bearer {self.tokens[role]}"}
        url = f"{API_BASE_URL}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers, params=params)
            elif method.upper() == "POST":
                response = self.session.post(url, headers=headers, json=data)
            elif method.upper() == "PUT":
                response = self.session.put(url, headers=headers, json=data)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except Exception as e:
            self.log_test(f"Request {method} {endpoint}", False, f"Exception: {str(e)}")
            return None
    
    def test_create_invitation_admin(self):
        """Test admin creating manager and agent invitations"""
        print("\n=== Testing Admin Create Invitations ===")
        
        # Test admin creates manager invite
        manager_invite_data = {
            "email": "newtestmanager@test.com",
            "role": "manager",
            "name": "New Test Manager"
        }
        
        response = self.make_authenticated_request("POST", "/invitations", "admin", manager_invite_data)
        if response and response.status_code == 200:
            data = response.json()
            required_fields = ["id", "token", "role", "status", "expires_at"]
            if all(field in data for field in required_fields):
                if data["role"] == "manager" and data["status"] == "pending":
                    self.created_invitations.append(data)
                    self.log_test("Admin creates MANAGER invite", True, 
                                f"ID: {data['id']}, Token: {data['token'][:20]}..., Role: {data['role']}")
                else:
                    self.log_test("Admin creates MANAGER invite", False, 
                                f"Invalid role/status: {data['role']}/{data['status']}")
            else:
                missing = [f for f in required_fields if f not in data]
                self.log_test("Admin creates MANAGER invite", False, f"Missing fields: {missing}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Admin creates MANAGER invite", False, f"Status: {status}")
        
        # Test admin creates agent invite
        agent_invite_data = {
            "email": "newtestagent@test.com", 
            "role": "agent",
            "name": "New Test Agent"
        }
        
        response = self.make_authenticated_request("POST", "/invitations", "admin", agent_invite_data)
        if response and response.status_code == 200:
            data = response.json()
            required_fields = ["id", "token", "role", "status", "expires_at"]
            if all(field in data for field in required_fields):
                if data["role"] == "agent" and data["status"] == "pending":
                    self.created_invitations.append(data)
                    self.log_test("Admin creates AGENT invite", True,
                                f"ID: {data['id']}, Token: {data['token'][:20]}..., Role: {data['role']}")
                else:
                    self.log_test("Admin creates AGENT invite", False,
                                f"Invalid role/status: {data['role']}/{data['status']}")
            else:
                missing = [f for f in required_fields if f not in data]
                self.log_test("Admin creates AGENT invite", False, f"Missing fields: {missing}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Admin creates AGENT invite", False, f"Status: {status}")
    
    def test_create_invitation_manager(self):
        """Test manager creating invitations with permission enforcement"""
        print("\n=== Testing Manager Create Invitations ===")
        
        # Test manager creates agent invite (should succeed)
        agent_invite_data = {
            "email": "managertestagent@test.com",
            "role": "agent", 
            "name": "Manager Test Agent"
        }
        
        response = self.make_authenticated_request("POST", "/invitations", "manager", agent_invite_data)
        if response and response.status_code == 200:
            data = response.json()
            if data.get("role") == "agent" and data.get("status") == "pending":
                self.created_invitations.append(data)
                self.log_test("Manager creates AGENT invite", True,
                            f"ID: {data['id']}, Role: {data['role']}")
            else:
                self.log_test("Manager creates AGENT invite", False,
                            f"Invalid response: {data}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Manager creates AGENT invite", False, f"Status: {status}")
        
        # Test manager tries to create manager invite (should FAIL with 403)
        manager_invite_data = {
            "email": "badmanager@test.com",
            "role": "manager",
            "name": "Bad Manager"
        }
        
        response = self.make_authenticated_request("POST", "/invitations", "manager", manager_invite_data)
        if response and response.status_code == 403:
            self.log_test("Manager tries to create MANAGER invite (should FAIL)", True,
                        "Correctly blocked with 403 Forbidden")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Manager tries to create MANAGER invite (should FAIL)", False,
                        f"Expected 403, got: {status}")
    
    def test_create_invitation_agent(self):
        """Test agent trying to create invitations (should fail)"""
        print("\n=== Testing Agent Create Invitations (Should Fail) ===")
        
        agent_invite_data = {
            "email": "agenttest@test.com",
            "role": "agent",
            "name": "Agent Test"
        }
        
        response = self.make_authenticated_request("POST", "/invitations", "agent", agent_invite_data)
        if response and response.status_code == 403:
            self.log_test("Agent tries to create invite (should FAIL)", True,
                        "Correctly blocked with 403 Forbidden")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Agent tries to create invite (should FAIL)", False,
                        f"Expected 403, got: {status}")
    
    def test_list_invitations(self):
        """Test listing invitations"""
        print("\n=== Testing List Invitations ===")
        
        # Test admin gets all invitations
        response = self.make_authenticated_request("GET", "/invitations", "admin")
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                self.log_test("Admin gets all invitations", True,
                            f"Retrieved {len(data)} invitations")
            else:
                self.log_test("Admin gets all invitations", False,
                            f"Expected list, got: {type(data)}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Admin gets all invitations", False, f"Status: {status}")
        
        # Test manager gets their invitations
        response = self.make_authenticated_request("GET", "/invitations", "manager")
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                self.log_test("Manager gets their invitations", True,
                            f"Retrieved {len(data)} invitations")
            else:
                self.log_test("Manager gets their invitations", False,
                            f"Expected list, got: {type(data)}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Manager gets their invitations", False, f"Status: {status}")
    
    def test_validate_invitation_token(self):
        """Test validating invitation tokens"""
        print("\n=== Testing Validate Invitation Token ===")
        
        if not self.created_invitations:
            self.log_test("Validate invitation token", False, "No invitations created to test")
            return
        
        # Test with valid token
        valid_token = self.created_invitations[0]["token"]
        response = self.session.get(f"{API_BASE_URL}/invitations/validate/{valid_token}")
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["valid", "status", "role", "organization_name"]
            if all(field in data for field in required_fields):
                if data["valid"] == True and data["status"] == "pending":
                    self.log_test("Validate invitation token", True,
                                f"Valid: {data['valid']}, Status: {data['status']}, Role: {data['role']}")
                else:
                    self.log_test("Validate invitation token", False,
                                f"Invalid response: valid={data['valid']}, status={data['status']}")
            else:
                missing = [f for f in required_fields if f not in data]
                self.log_test("Validate invitation token", False, f"Missing fields: {missing}")
        else:
            self.log_test("Validate invitation token", False, f"Status: {response.status_code}")
    
    def test_accept_invitation_new_user(self):
        """Test accepting invitation as new user"""
        print("\n=== Testing Accept Invitation - New User Flow ===")
        
        if not self.created_invitations:
            self.log_test("Accept invitation - new user", False, "No invitations created to test")
            return
        
        # Use the first created invitation
        invitation = self.created_invitations[0]
        token = invitation["token"]
        
        accept_data = {
            "token": token,
            "email": "newtestuser@test.com",
            "password": "Test123!",
            "name": "New Test User",
            "is_existing_user": False
        }
        
        response = self.session.post(f"{API_BASE_URL}/invitations/accept", json=accept_data)
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["access_token", "user"]
            if all(field in data for field in required_fields):
                user = data["user"]
                if user.get("role") == invitation["role"]:
                    self.log_test("Accept invitation - new user", True,
                                f"User created with role: {user['role']}, Token: {data['access_token'][:20]}...")
                    
                    # Mark this invitation as used
                    invitation["used"] = True
                else:
                    self.log_test("Accept invitation - new user", False,
                                f"Role mismatch: expected {invitation['role']}, got {user.get('role')}")
            else:
                missing = [f for f in required_fields if f not in data]
                self.log_test("Accept invitation - new user", False, f"Missing fields: {missing}")
        else:
            self.log_test("Accept invitation - new user", False, 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    def test_token_single_use(self):
        """Test that tokens are single-use (after accept, token becomes invalid)"""
        print("\n=== Testing Token Single-Use ===")
        
        # Find a used invitation
        used_invitation = None
        for inv in self.created_invitations:
            if inv.get("used"):
                used_invitation = inv
                break
        
        if not used_invitation:
            self.log_test("Token single-use validation", False, "No used invitations to test")
            return
        
        # Try to validate the same token again
        token = used_invitation["token"]
        response = self.session.get(f"{API_BASE_URL}/invitations/validate/{token}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("valid") == False and data.get("status") == "accepted":
                self.log_test("Token single-use validation", True,
                            f"Token correctly invalidated: valid={data['valid']}, status={data['status']}")
            else:
                self.log_test("Token single-use validation", False,
                            f"Token still valid: valid={data['valid']}, status={data['status']}")
        else:
            self.log_test("Token single-use validation", False, f"Status: {response.status_code}")
    
    def test_revoke_invitation(self):
        """Test revoking an invitation"""
        print("\n=== Testing Revoke Invitation ===")
        
        # Find an unused invitation to revoke
        unused_invitation = None
        for inv in self.created_invitations:
            if not inv.get("used"):
                unused_invitation = inv
                break
        
        if not unused_invitation:
            # Create a new invitation to revoke
            revoke_invite_data = {
                "email": "torevoke@test.com",
                "role": "agent",
                "name": "To Revoke"
            }
            
            response = self.make_authenticated_request("POST", "/invitations", "admin", revoke_invite_data)
            if response and response.status_code == 200:
                unused_invitation = response.json()
                self.created_invitations.append(unused_invitation)
            else:
                self.log_test("Revoke invitation", False, "Could not create invitation to revoke")
                return
        
        # Revoke the invitation
        invite_id = unused_invitation["id"]
        response = self.make_authenticated_request("POST", f"/invitations/{invite_id}/revoke", "admin")
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get("status") == "revoked":
                self.log_test("Revoke invitation", True, f"Invitation {invite_id} revoked successfully")
                
                # Verify the token is invalidated
                token = unused_invitation["token"]
                validate_response = self.session.get(f"{API_BASE_URL}/invitations/validate/{token}")
                if validate_response.status_code == 200:
                    validate_data = validate_response.json()
                    if validate_data.get("valid") == False and validate_data.get("status") == "revoked":
                        self.log_test("Verify revoked token invalid", True, "Token correctly invalidated")
                    else:
                        self.log_test("Verify revoked token invalid", False, 
                                    f"Token still valid: {validate_data}")
            else:
                self.log_test("Revoke invitation", False, f"Unexpected status: {data.get('status')}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Revoke invitation", False, f"Status: {status}")
    
    def test_resend_invitation(self):
        """Test resending an invitation"""
        print("\n=== Testing Resend Invitation ===")
        
        # Create a new invitation to resend
        resend_invite_data = {
            "email": "toresend@test.com",
            "role": "agent", 
            "name": "To Resend"
        }
        
        response = self.make_authenticated_request("POST", "/invitations", "admin", resend_invite_data)
        if not response or response.status_code != 200:
            self.log_test("Resend invitation", False, "Could not create invitation to resend")
            return
        
        invitation = response.json()
        original_token = invitation["token"]
        invite_id = invitation["id"]
        
        # Resend the invitation
        response = self.make_authenticated_request("POST", f"/invitations/{invite_id}/resend", "admin")
        
        if response and response.status_code == 200:
            data = response.json()
            if "token" in data and data["token"] != original_token:
                self.log_test("Resend invitation", True,
                            f"New token generated: {data['token'][:20]}... (different from original)")
            else:
                self.log_test("Resend invitation", False, "New token not generated or same as original")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Resend invitation", False, f"Status: {status}")
    
    def run_all_tests(self):
        """Run all invitation system tests"""
        print("🎯 STARTING COMPREHENSIVE INVITE-LINK SYSTEM TESTING")
        print("=" * 60)
        
        # Step 1: Login all users
        print("\n=== Step 1: Authentication Tests ===")
        for role in ["admin", "manager", "agent"]:
            self.login_user(role)
        
        # Step 2: Create invitation tests
        print("\n=== Step 2: Create Invitation Tests ===")
        self.test_create_invitation_admin()
        self.test_create_invitation_manager()
        self.test_create_invitation_agent()
        
        # Step 3: List invitations tests
        self.test_list_invitations()
        
        # Step 4: Validate invitation token
        self.test_validate_invitation_token()
        
        # Step 5: Accept invitation - new user flow
        self.test_accept_invitation_new_user()
        
        # Step 6: Verify token is single-use
        self.test_token_single_use()
        
        # Step 7: Revoke invitation
        self.test_revoke_invitation()
        
        # Step 8: Resend invitation
        self.test_resend_invitation()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("🎯 INVITE-LINK SYSTEM TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        print(f"\n🎉 INVITE-LINK SYSTEM TESTING COMPLETED")
        return passed_tests, failed_tests

if __name__ == "__main__":
    tester = InviteSystemTester()
    tester.run_all_tests()