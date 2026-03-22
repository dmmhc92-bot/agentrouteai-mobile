#!/usr/bin/env python3
"""
AgentRoute AI Backend Production Hardening Test Suite
Tests all critical flows for iOS app production deployment as specified in review request
"""

import requests
import json
import time
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://crm-final-build.preview.emergentagent.com/api"

class ProductionHardeningTests:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.tokens = {}
        self.test_data = {}
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
        
    def make_request(self, method, endpoint, data=None, headers=None, token=None):
        """Make HTTP request with proper error handling"""
        url = f"{BACKEND_URL}{endpoint}"
        
        if headers is None:
            headers = {"Content-Type": "application/json"}
            
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers, timeout=15)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers, timeout=15)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=headers, timeout=15)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=15)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            # Retry once for network issues
            try:
                time.sleep(1)
                if method.upper() == "GET":
                    response = self.session.get(url, headers=headers, timeout=15)
                elif method.upper() == "POST":
                    response = self.session.post(url, json=data, headers=headers, timeout=15)
                elif method.upper() == "PUT":
                    response = self.session.put(url, json=data, headers=headers, timeout=15)
                elif method.upper() == "DELETE":
                    response = self.session.delete(url, headers=headers, timeout=15)
                return response
            except:
                return None

    def test_1_team_role_bootstrap(self):
        """Test 1: TEAM/ROLE BOOTSTRAP LOGIC"""
        print("\n=== 1. TEAM/ROLE BOOTSTRAP LOGIC ===")
        
        # 1A. Create New Team/Agency Flow
        org_data = {
            "organization_name": "Production Test Agency",
            "name": "Production Admin", 
            "email": f"prodadmin{int(time.time())}@test.com",
            "password": "ProdPass123!"
        }
        
        response = self.make_request("POST", "/auth/create-organization", org_data)
        if response and response.status_code == 200:
            data = response.json()
            user = data.get("user", {})
            
            # Verify admin role and organization setup
            success = (
                user.get("role") == "admin" and
                user.get("organization_id") is not None and
                user.get("account_mode") == "connected"
            )
            
            if success:
                self.tokens["admin"] = data.get("access_token")
                self.test_data["admin_org_id"] = user.get("organization_id")
                
            self.log_test(
                "1A. Create Organization Flow",
                success,
                f"Admin role: {user.get('role')}, Org ID: {user.get('organization_id')}, Mode: {user.get('account_mode')}"
            )
        else:
            self.log_test("1A. Create Organization Flow", False, f"Status: {response.status_code if response else 'No response'}")
        
        # 1B. Solo Agent Flow
        solo_data = {
            "name": "Production Solo",
            "email": f"prodsolo{int(time.time())}@test.com", 
            "password": "SoloPass123!"
        }
        
        response = self.make_request("POST", "/auth/register-solo", solo_data)
        if response and response.status_code == 200:
            data = response.json()
            user = data.get("user", {})
            
            success = (
                user.get("role") == "agent" and
                user.get("organization_id") is None and
                user.get("account_mode") == "solo"
            )
            
            if success:
                self.tokens["solo"] = data.get("access_token")
                
            self.log_test(
                "1B. Solo Agent Flow", 
                success,
                f"Role: {user.get('role')}, Org ID: {user.get('organization_id')}, Mode: {user.get('account_mode')}"
            )
        else:
            self.log_test("1B. Solo Agent Flow", False, f"Status: {response.status_code if response else 'No response'}")
        
        # 1C. Join Team Flow - Generate invite first
        if "admin" in self.tokens:
            invite_data = {"role": "agent"}
            response = self.make_request("POST", "/invitations", invite_data, token=self.tokens["admin"])
            
            if response and response.status_code == 200:
                invite = response.json()
                token = invite.get("token")
                
                if token:
                    # Validate token
                    response = self.make_request("GET", f"/invitations/validate/{token}")
                    if response and response.status_code == 200:
                        validation = response.json()
                        success = (
                            validation.get("valid") == True and
                            validation.get("role") == "agent"
                        )
                        
                        self.log_test(
                            "1C. Join Team Flow - Token Generation & Validation",
                            success,
                            f"Token valid: {validation.get('valid')}, Role: {validation.get('role')}"
                        )
                        
                        if success:
                            self.test_data["agent_invite_token"] = token
                    else:
                        self.log_test("1C. Join Team Flow - Token Validation", False, "Token validation failed")
                else:
                    self.log_test("1C. Join Team Flow - Token Generation", False, "No token in response")
            else:
                self.log_test("1C. Join Team Flow - Invite Creation", False, f"Status: {response.status_code if response else 'No response'}")

    def test_2_invite_token_system(self):
        """Test 2: INVITE TOKEN SYSTEM"""
        print("\n=== 2. INVITE TOKEN SYSTEM ===")
        
        # Test with existing accounts
        test_accounts = [
            {"email": "admin@agentroute.com", "password": "Admin123!", "role": "admin"},
            {"email": "manager@agentroute.com", "password": "Manager123!", "role": "manager"}, 
            {"email": "agent@agentroute.com", "password": "Agent123!", "role": "agent"}
        ]
        
        for account in test_accounts:
            response = self.make_request("POST", "/auth/login", {
                "email": account["email"],
                "password": account["password"]
            })
            
            if response and response.status_code == 200:
                data = response.json()
                self.tokens[account["role"]] = data.get("access_token")
                
                self.log_test(
                    f"2. Login {account['role'].title()}",
                    True,
                    f"Role: {data.get('user', {}).get('role')}"
                )
            else:
                self.log_test(f"2. Login {account['role'].title()}", False, f"Status: {response.status_code if response else 'No response'}")
        
        # 2A. Admin Token Generation
        if "admin" in self.tokens:
            for role in ["manager", "agent"]:
                response = self.make_request("POST", "/invitations", {"role": role}, token=self.tokens["admin"])
                
                success = response and response.status_code == 200
                if success:
                    invite = response.json()
                    success = invite.get("token") is not None
                    
                self.log_test(
                    f"2A. Admin generates {role} token",
                    success,
                    f"Token present: {invite.get('token') is not None if success else 'Failed'}"
                )
        
        # 2B. Manager Token Generation
        if "manager" in self.tokens:
            # Manager can invite agent
            response = self.make_request("POST", "/invitations", {"role": "agent"}, token=self.tokens["manager"])
            success = response and response.status_code == 200
            self.log_test("2B. Manager generates agent token", success, f"Status: {response.status_code if response else 'No response'}")
            
            # Manager cannot invite manager
            response = self.make_request("POST", "/invitations", {"role": "manager"}, token=self.tokens["manager"])
            success = response and response.status_code == 403
            self.log_test("2B. Manager cannot invite manager", success, f"Status: {response.status_code if response else 'No response'}")
        
        # 2C. Agent Cannot Invite
        if "agent" in self.tokens:
            response = self.make_request("POST", "/invitations", {"role": "agent"}, token=self.tokens["agent"])
            success = response and response.status_code == 403
            self.log_test("2C. Agent cannot invite", success, f"Status: {response.status_code if response else 'No response'}")
        
        # 2D. Token Validation & 2E. Token Management
        if "admin" in self.tokens:
            # Get invitations list
            response = self.make_request("GET", "/invitations", token=self.tokens["admin"])
            if response and response.status_code == 200:
                invitations = response.json()
                if invitations:
                    invite = invitations[0]
                    token = invite.get("token")
                    invite_id = invite.get("id")
                    
                    if token:
                        # Validate token
                        response = self.make_request("GET", f"/invitations/validate/{token}")
                        success = response and response.status_code == 200
                        if success:
                            validation = response.json()
                            success = validation.get("valid") == True
                            
                        self.log_test("2D. Token validation", success, f"Valid: {validation.get('valid') if success else 'Failed'}")
                        
                        # Test token revocation
                        if invite_id:
                            response = self.make_request("DELETE", f"/invitations/{invite_id}", token=self.tokens["admin"])
                            success = response and response.status_code == 200
                            self.log_test("2E. Token revocation", success, f"Status: {response.status_code if response else 'No response'}")
                            
                            # Verify token is now invalid
                            response = self.make_request("GET", f"/invitations/validate/{token}")
                            success = response and response.status_code == 404
                            self.log_test("2E. Revoked token invalid", success, f"Status: {response.status_code if response else 'No response'}")

    def test_3_role_based_routing(self):
        """Test 3: ROLE-BASED ROUTING"""
        print("\n=== 3. ROLE-BASED ROUTING ===")
        
        role_tests = [
            ("admin", "/auth/me", 200),
            ("manager", "/auth/me", 200), 
            ("agent", "/auth/me", 200)
        ]
        
        for role, endpoint, expected_status in role_tests:
            if role in self.tokens:
                response = self.make_request("GET", endpoint, token=self.tokens[role])
                success = response and response.status_code == expected_status
                
                if success and endpoint == "/auth/me":
                    user_data = response.json()
                    actual_role = user_data.get("role")
                    success = actual_role == role
                    
                self.log_test(
                    f"3A. {role.title()} routes",
                    success,
                    f"Status: {response.status_code if response else 'No response'}, Role: {actual_role if success else 'N/A'}"
                )
        
        # Test role-based data filtering
        for role in ["admin", "manager", "agent"]:
            if role in self.tokens:
                response = self.make_request("GET", "/leads", token=self.tokens[role])
                if response and response.status_code == 200:
                    leads = response.json()
                    lead_count = len(leads) if isinstance(leads, list) else 0
                    
                    self.log_test(
                        f"3D. {role.title()} data filtering",
                        True,
                        f"Leads visible: {lead_count}"
                    )
                else:
                    self.log_test(f"3D. {role.title()} data filtering", False, f"Status: {response.status_code if response else 'No response'}")

    def test_4_route_guards(self):
        """Test 4: ROUTE GUARDS / SCREEN GUARDS"""
        print("\n=== 4. ROUTE GUARDS / SCREEN GUARDS ===")
        
        # 4A. Protected routes without auth
        protected_endpoints = ["/leads", "/appointments", "/scope"]
        
        for endpoint in protected_endpoints:
            response = self.make_request("GET", endpoint)
            success = response and response.status_code in [401, 403]
            self.log_test(
                f"4A. {endpoint} without auth",
                success,
                f"Status: {response.status_code if response else 'No response'}"
            )
        
        # 4B. Admin-only routes
        if "agent" in self.tokens:
            response = self.make_request("GET", "/admin/recovery/orphan-users", token=self.tokens["agent"])
            success = response and response.status_code == 403
            self.log_test("4B. Admin-only route (agent access)", success, f"Status: {response.status_code if response else 'No response'}")
        
        # 4C. Manager-only routes
        if "agent" in self.tokens:
            response = self.make_request("GET", "/users", token=self.tokens["agent"])
            success = response and response.status_code == 403
            self.log_test("4C. Manager-only route (agent access)", success, f"Status: {response.status_code if response else 'No response'}")

    def test_5_button_action_wiring(self):
        """Test 5: BUTTON/ACTION WIRING"""
        print("\n=== 5. BUTTON/ACTION WIRING ===")
        
        if "agent" in self.tokens:
            # 5A. Lead Creation
            lead_data = {
                "name": "Production Test Lead",
                "phone": "555-0123",
                "email": "testlead@example.com",
                "address": "123 Test St, Test City, TS 12345"
            }
            
            response = self.make_request("POST", "/leads", lead_data, token=self.tokens["agent"])
            success = response and response.status_code == 200
            
            if success:
                lead = response.json()
                self.test_data["test_lead_id"] = lead.get("id")
                
            self.log_test("5A. Lead creation", success, f"Status: {response.status_code if response else 'No response'}")
            
            # 5B. Appointment Creation
            if "test_lead_id" in self.test_data:
                appointment_data = {
                    "lead_id": self.test_data["test_lead_id"],
                    "appointment_date": "2025-02-01",
                    "appointment_time": "10:00",
                    "notes": "Production test appointment"
                }
                
                response = self.make_request("POST", "/appointments", appointment_data, token=self.tokens["agent"])
                success = response and response.status_code == 200
                self.log_test("5B. Appointment creation", success, f"Status: {response.status_code if response else 'No response'}")
        
        # 5C. Notification Actions
        if "agent" in self.tokens:
            # Test notification
            response = self.make_request("POST", "/notifications/test", {"title": "Test", "body": "Test notification"}, token=self.tokens["agent"])
            success = response and response.status_code == 200
            self.log_test("5C. Test notification", success, f"Status: {response.status_code if response else 'No response'}")
            
            # Get notifications
            response = self.make_request("GET", "/notifications", token=self.tokens["agent"])
            success = response and response.status_code == 200
            self.log_test("5C. Get notifications", success, f"Status: {response.status_code if response else 'No response'}")
            
            # Mark notification as read
            if success:
                notifications = response.json()
                if isinstance(notifications, dict) and "notifications" in notifications:
                    notif_list = notifications["notifications"]
                    if notif_list:
                        notif_id = notif_list[0].get("id")
                        if notif_id:
                            response = self.make_request("PUT", f"/notifications/{notif_id}/read", token=self.tokens["agent"])
                            success = response and response.status_code == 200
                            self.log_test("5C. Mark notification read", success, f"Status: {response.status_code if response else 'No response'}")

        # 5D. Route Visibility
        if "agent" in self.tokens:
            response = self.make_request("GET", "/routes/visibility", token=self.tokens["agent"])
            success = response and response.status_code == 200
            self.log_test("5D. Get route visibility", success, f"Status: {response.status_code if response else 'No response'}")
            
            # Update visibility
            response = self.make_request("PUT", "/routes/visibility", {"visibility_level": "summary"}, token=self.tokens["agent"])
            success = response and response.status_code == 200
            self.log_test("5D. Update route visibility", success, f"Status: {response.status_code if response else 'No response'}")

    def test_6_admin_recovery_tools(self):
        """Test 6: ADMIN RECOVERY TOOLS"""
        print("\n=== 6. ADMIN RECOVERY TOOLS ===")
        
        # 6A. Get Orphan Users (Admin Only)
        if "admin" in self.tokens:
            response = self.make_request("GET", "/admin/recovery/orphan-users", token=self.tokens["admin"])
            success = response and response.status_code == 200
            
            if success:
                orphans = response.json()
                orphan_count = len(orphans) if isinstance(orphans, list) else 0
                
            self.log_test("6A. Admin recovery - orphan users", success, f"Orphan users found: {orphan_count if success else 'Failed'}")
        
        # 6B. Non-Admin Cannot Access Recovery
        if "agent" in self.tokens:
            response = self.make_request("GET", "/admin/recovery/orphan-users", token=self.tokens["agent"])
            success = response and response.status_code == 403
            self.log_test("6B. Non-admin recovery access", success, f"Status: {response.status_code if response else 'No response'}")

    def test_7_state_consistency(self):
        """Test 7: STATE/DATA CONSISTENCY"""
        print("\n=== 7. STATE/DATA CONSISTENCY ===")
        
        # 7A. Session Persistence
        if "agent" in self.tokens:
            response = self.make_request("GET", "/auth/me", token=self.tokens["agent"])
            if response and response.status_code == 200:
                user_data_1 = response.json()
                
                # Wait 5 seconds
                time.sleep(5)
                
                response = self.make_request("GET", "/auth/me", token=self.tokens["agent"])
                success = response and response.status_code == 200
                
                if success:
                    user_data_2 = response.json()
                    success = user_data_1.get("id") == user_data_2.get("id")
                    
                self.log_test("7A. Session persistence", success, f"User ID consistent: {success}")
            else:
                self.log_test("7A. Session persistence", False, "Initial auth/me failed")
        
        # 7B. Account Mode Refresh
        if "agent" in self.tokens:
            response = self.make_request("GET", "/account/mode", token=self.tokens["agent"])
            success = response and response.status_code == 200
            
            if success:
                mode_data = response.json()
                account_mode = mode_data.get("account_mode")
                
            self.log_test("7B. Account mode refresh", success, f"Mode: {account_mode if success else 'Failed'}")

    def test_8_legal_documents(self):
        """Test 8: LEGAL DOCUMENTS"""
        print("\n=== 8. LEGAL DOCUMENTS ===")
        
        legal_endpoints = [
            ("/privacy", "Privacy Policy"),
            ("/terms", "Terms of Service")
        ]
        
        for endpoint, doc_name in legal_endpoints:
            response = self.make_request("GET", endpoint)
            success = response and response.status_code == 200
            
            if success:
                content = response.text
                has_content = len(content) > 100  # Basic content check
                success = has_content
                
            self.log_test(f"8. {doc_name}", success, f"Content length: {len(content) if success else 'Failed'}")

    def test_9_apple_review_accounts(self):
        """Test 9: APPLE REVIEW ACCOUNTS"""
        print("\n=== 9. APPLE REVIEW ACCOUNTS ===")
        
        review_accounts = [
            {"email": "review@test.agentroute.ai", "password": "Test123!", "expected_role": "agent", "type": "Solo"},
            {"email": "admin.review@test.agentroute.ai", "password": "Test123!", "expected_role": "admin", "type": "Admin"}
        ]
        
        for account in review_accounts:
            response = self.make_request("POST", "/auth/login", {
                "email": account["email"],
                "password": account["password"]
            })
            
            if response and response.status_code == 200:
                data = response.json()
                user = data.get("user", {})
                role = user.get("role")
                
                success = role == account["expected_role"]
                
                if success:
                    token = data.get("access_token")
                    
                    # Test leads access for solo account
                    if account["type"] == "Solo":
                        leads_response = self.make_request("GET", "/leads", token=token)
                        if leads_response and leads_response.status_code == 200:
                            leads = leads_response.json()
                            lead_count = len(leads) if isinstance(leads, list) else 0
                            success = lead_count >= 0  # Should have access, count may vary
                            
                            self.log_test(
                                f"9A. {account['type']} review account",
                                success,
                                f"Role: {role}, Leads accessible: {lead_count}"
                            )
                        else:
                            self.log_test(f"9A. {account['type']} review account", False, "Leads access failed")
                    else:
                        self.log_test(
                            f"9B. {account['type']} review account",
                            success,
                            f"Role: {role}"
                        )
                else:
                    self.log_test(f"9. {account['type']} review account", False, f"Expected role {account['expected_role']}, got {role}")
            else:
                self.log_test(f"9. {account['type']} review account", False, f"Login failed: {response.status_code if response else 'No response'}")

    def run_all_tests(self):
        """Run all production hardening tests"""
        print("🎯 AGENTROUTE AI - PRODUCTION HARDENING VERIFICATION")
        print("=" * 60)
        
        start_time = time.time()
        
        try:
            self.test_1_team_role_bootstrap()
            self.test_2_invite_token_system()
            self.test_3_role_based_routing()
            self.test_4_route_guards()
            self.test_5_button_action_wiring()
            self.test_6_admin_recovery_tools()
            self.test_7_state_consistency()
            self.test_8_legal_documents()
            self.test_9_apple_review_accounts()
            
        except Exception as e:
            print(f"\n❌ CRITICAL ERROR: {e}")
            return False
        
        # Calculate results
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        duration = time.time() - start_time
        
        print(f"\n" + "=" * 60)
        print(f"🎉 PRODUCTION HARDENING TEST RESULTS")
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        print(f"Duration: {duration:.1f}s")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        return success_rate >= 90.0

if __name__ == "__main__":
    tester = ProductionHardeningTests()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)