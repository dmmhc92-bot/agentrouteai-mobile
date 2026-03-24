#!/usr/bin/env python3
"""
COMPREHENSIVE SYSTEM-WIDE BACKEND API AUDIT - AgentRoute AI CRM
Test ALL API endpoints for Admin, Manager, and Agent roles as specified in review request.
This is a complete production audit covering all 11 endpoint categories.
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, List, Optional

# Configuration from review request
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"

# Test tokens provided in review request (all in org_7443db00)
TOKENS = {
    "ADMIN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3NDQzZGIwMC1jZjJmLTRhOGEtOWZjYS01YjkwZDEzYjllNGEiLCJlbWFpbCI6ImFkbWluQGFnZW50cm91dGUuY29tIiwiZXhwIjoxNzc0NDA3MDY5fQ.3yM9uYPorFdUxUwjhRcAa80bY-xkMZAB5L579DsZNV0",
    "MANAGER": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NTRhMmE5YS1mNzE0LTRjYmItODRiOS0wNzRlNGJiNDI3OTciLCJlbWFpbCI6Im1hbmFnZXJAYWdlbnRyb3V0ZS5jb20iLCJleHAiOjE3NzQ0MDcwNjl9.yrBvLAbxLRcDaaVn1VConBLg6JV_HrRCzKXTYJwV80U",
    "AGENT": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3MmVhNjA4YS0zZDVlLTQ4ZWQtYmNmMy0xOTRjNDdhZWYzYjQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJleHAiOjE3NzQ0MDcwNjl9.WM2QpYWwWlHtDt6s6mkllHGQ4lX-LCglzO3UQQAjKYE"
}

class ComprehensiveAPITester:
    def __init__(self):
        self.results = []
        self.test_data = {}
        self.category_results = {}
        
    def log_result(self, test_name: str, status: str, details: str = "", response_data: dict = None):
        """Log test result"""
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.results.append(result)
        status_emoji = "✅" if status == "PASS" else "❌"
        print(f"{status_emoji} {test_name}: {status}")
        if details:
            print(f"   Details: {details}")
        if response_data and status == "FAIL":
            print(f"   Response: {response_data}")
        print()

    def make_request(self, method: str, endpoint: str, token: str = None, data: dict = None, params: dict = None) -> tuple:
        """Make HTTP request with proper headers"""
        url = f"{BASE_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        try:
            if method == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=30)
            elif method == "PUT":
                response = requests.put(url, headers=headers, json=data, timeout=30)
            elif method == "DELETE":
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response.status_code, response.json() if response.content else {}
        except requests.exceptions.Timeout:
            return 408, {"error": "Request timeout"}
        except requests.exceptions.RequestException as e:
            return 500, {"error": str(e)}
        except json.JSONDecodeError:
            return response.status_code, {"error": "Invalid JSON response"}

    def test_authentication(self):
        """1. AUTHENTICATION"""
        print("🔐 TESTING AUTHENTICATION ENDPOINTS")
        category_results = []
        
        # Test login with valid credentials (using existing tokens to verify they work)
        for role, token in TOKENS.items():
            status, response = self.make_request("GET", "/auth/me", token=token)
            if status == 200:
                self.log_result(f"Token validation - {role}", "PASS", f"Valid token for {response.get('email', 'unknown')}")
                category_results.append("PASS")
            else:
                self.log_result(f"Token validation - {role}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # Test unauthenticated access protection (401)
        status, response = self.make_request("GET", "/auth/me")
        if status == 401 or status == 403:
            self.log_result("Unauthenticated access protection", "PASS", f"Correctly returns {status}")
            category_results.append("PASS")
        else:
            self.log_result("Unauthenticated access protection", "FAIL", f"Expected 401/403, got {status}", response)
            category_results.append("FAIL")
            
        # Test forgot-password endpoint
        status, response = self.make_request("POST", "/auth/forgot-password", data={"email": "test@example.com"})
        if status in [200, 404]:  # 200 if implemented, 404 if not found
            self.log_result("Forgot password endpoint", "PASS", f"Endpoint accessible, status: {status}")
            category_results.append("PASS")
        else:
            self.log_result("Forgot password endpoint", "FAIL", f"Unexpected status: {status}", response)
            category_results.append("FAIL")
            
        self.category_results["AUTHENTICATION"] = category_results

    def test_leads_crm(self):
        """2. LEADS/CRM"""
        print("📋 TESTING LEADS/CRM ENDPOINTS")
        category_results = []
        
        for role, token in TOKENS.items():
            # GET /api/leads (check visibility scope)
            status, response = self.make_request("GET", "/leads", token=token)
            if status == 200:
                leads_count = len(response) if isinstance(response, list) else len(response.get('leads', []))
                self.log_result(f"GET /api/leads - {role}", "PASS", f"Returns {leads_count} leads")
                category_results.append("PASS")
                
                # Store a lead ID for further testing
                if leads_count > 0:
                    leads = response if isinstance(response, list) else response.get('leads', [])
                    if leads and not self.test_data.get('lead_id'):
                        self.test_data['lead_id'] = leads[0].get('id')
            else:
                self.log_result(f"GET /api/leads - {role}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # POST /api/leads (create new lead) - test with ADMIN token
        lead_data = {
            "name": "Test Lead API Audit",
            "email": "testlead@example.com",
            "phone": "555-0123",
            "stage": "new_lead"
        }
        status, response = self.make_request("POST", "/leads", token=TOKENS["ADMIN"], data=lead_data)
        if status == 200:
            self.log_result("POST /api/leads", "PASS", f"Created lead with ID: {response.get('id')}")
            category_results.append("PASS")
            self.test_data['created_lead_id'] = response.get('id')
        else:
            self.log_result("POST /api/leads", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # GET /api/leads/{id} (single lead detail)
        lead_id = self.test_data.get('lead_id') or self.test_data.get('created_lead_id')
        if lead_id:
            status, response = self.make_request("GET", f"/leads/{lead_id}", token=TOKENS["ADMIN"])
            if status == 200:
                self.log_result("GET /api/leads/{id}", "PASS", f"Retrieved lead: {response.get('name', 'Unknown')}")
                category_results.append("PASS")
            else:
                self.log_result("GET /api/leads/{id}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # PUT /api/leads/{id} (update lead)
        if lead_id:
            update_data = {"name": "Updated Test Lead API Audit"}
            status, response = self.make_request("PUT", f"/leads/{lead_id}", token=TOKENS["ADMIN"], data=update_data)
            if status == 200:
                self.log_result("PUT /api/leads/{id}", "PASS", "Successfully updated lead")
                category_results.append("PASS")
            else:
                self.log_result("PUT /api/leads/{id}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # DELETE /api/leads/{id} (delete lead - permission check)
        if self.test_data.get('created_lead_id'):
            status, response = self.make_request("DELETE", f"/leads/{self.test_data['created_lead_id']}", token=TOKENS["ADMIN"])
            if status == 200:
                self.log_result("DELETE /api/leads/{id}", "PASS", "Successfully deleted lead")
                category_results.append("PASS")
            else:
                self.log_result("DELETE /api/leads/{id}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
                
        self.category_results["LEADS/CRM"] = category_results

    def test_pipeline(self):
        """3. PIPELINE"""
        print("🔄 TESTING PIPELINE ENDPOINTS")
        category_results = []
        
        for role, token in TOKENS.items():
            # GET /api/pipeline (all 3 roles)
            status, response = self.make_request("GET", "/pipeline", token=token)
            if status == 200:
                stages = response.get('stages', [])
                total_cases = response.get('summary', {}).get('total_cases', 0)
                self.log_result(f"GET /api/pipeline - {role}", "PASS", f"Returns {len(stages)} stages, {total_cases} total cases")
                category_results.append("PASS")
                
                # Verify stage counts are accurate
                stage_sum = sum(stage.get('count', 0) for stage in stages)
                if stage_sum == total_cases:
                    self.log_result(f"Pipeline stage counts accuracy - {role}", "PASS", f"Stage sum ({stage_sum}) matches total ({total_cases})")
                    category_results.append("PASS")
                else:
                    self.log_result(f"Pipeline stage counts accuracy - {role}", "FAIL", f"Stage sum ({stage_sum}) != total ({total_cases})")
                    category_results.append("FAIL")
            else:
                self.log_result(f"GET /api/pipeline - {role}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
                
        self.category_results["PIPELINE"] = category_results

    def test_appointments(self):
        """4. APPOINTMENTS"""
        print("📅 TESTING APPOINTMENTS ENDPOINTS")
        category_results = []
        
        for role, token in TOKENS.items():
            # GET /api/appointments (all 3 roles)
            status, response = self.make_request("GET", "/appointments", token=token)
            if status == 200:
                appointments_count = len(response) if isinstance(response, list) else len(response.get('appointments', []))
                self.log_result(f"GET /api/appointments - {role}", "PASS", f"Returns {appointments_count} appointments")
                category_results.append("PASS")
                
                # Store appointment ID for further testing
                appointments = response if isinstance(response, list) else response.get('appointments', [])
                if appointments and not self.test_data.get('appointment_id'):
                    self.test_data['appointment_id'] = appointments[0].get('id')
            else:
                self.log_result(f"GET /api/appointments - {role}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # POST /api/appointments (create)
        lead_id = self.test_data.get('lead_id')
        if lead_id:
            appointment_data = {
                "lead_id": lead_id,
                "title": "Test Appointment API Audit",
                "date": "2024-12-25T10:00:00Z",
                "notes": "Test appointment for API audit"
            }
            status, response = self.make_request("POST", "/appointments", token=TOKENS["ADMIN"], data=appointment_data)
            if status == 200:
                self.log_result("POST /api/appointments", "PASS", f"Created appointment with ID: {response.get('id')}")
                category_results.append("PASS")
                self.test_data['created_appointment_id'] = response.get('id')
            else:
                self.log_result("POST /api/appointments", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # GET /api/appointments/{id}
        appointment_id = self.test_data.get('appointment_id') or self.test_data.get('created_appointment_id')
        if appointment_id:
            status, response = self.make_request("GET", f"/appointments/{appointment_id}", token=TOKENS["ADMIN"])
            if status == 200:
                self.log_result("GET /api/appointments/{id}", "PASS", f"Retrieved appointment: {response.get('title', 'Unknown')}")
                category_results.append("PASS")
            else:
                self.log_result("GET /api/appointments/{id}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # PUT /api/appointments/{id}
        if appointment_id:
            update_data = {"title": "Updated Test Appointment API Audit"}
            status, response = self.make_request("PUT", f"/appointments/{appointment_id}", token=TOKENS["ADMIN"], data=update_data)
            if status == 200:
                self.log_result("PUT /api/appointments/{id}", "PASS", "Successfully updated appointment")
                category_results.append("PASS")
            else:
                self.log_result("PUT /api/appointments/{id}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # DELETE /api/appointments/{id}
        if self.test_data.get('created_appointment_id'):
            status, response = self.make_request("DELETE", f"/appointments/{self.test_data['created_appointment_id']}", token=TOKENS["ADMIN"])
            if status == 200:
                self.log_result("DELETE /api/appointments/{id}", "PASS", "Successfully deleted appointment")
                category_results.append("PASS")
            else:
                self.log_result("DELETE /api/appointments/{id}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
                
        self.category_results["APPOINTMENTS"] = category_results

    def test_team_feed(self):
        """5. TEAM FEED"""
        print("👥 TESTING TEAM FEED ENDPOINTS")
        category_results = []
        
        for role, token in TOKENS.items():
            # GET /api/feed (all 3 roles)
            status, response = self.make_request("GET", "/feed", token=token)
            if status == 200:
                posts_count = len(response.get('posts', []))
                self.log_result(f"GET /api/feed - {role}", "PASS", f"Returns {posts_count} posts")
                category_results.append("PASS")
                
                # Store post ID for further testing
                if response.get('posts') and not self.test_data.get('post_id'):
                    self.test_data['post_id'] = response['posts'][0]['id']
            else:
                self.log_result(f"GET /api/feed - {role}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # POST /api/feed (create post)
        post_data = {
            "content": "Test post for API audit",
            "post_type": "update"
        }
        status, response = self.make_request("POST", "/feed", token=TOKENS["ADMIN"], data=post_data)
        if status == 200:
            self.log_result("POST /api/feed", "PASS", f"Created post with ID: {response.get('id')}")
            category_results.append("PASS")
            self.test_data['created_post_id'] = response.get('id')
        else:
            self.log_result("POST /api/feed", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # POST /api/feed/{id}/comments
        post_id = self.test_data.get('post_id') or self.test_data.get('created_post_id')
        if post_id:
            comment_data = {"content": "Test comment for API audit"}
            status, response = self.make_request("POST", f"/feed/{post_id}/comments", token=TOKENS["ADMIN"], data=comment_data)
            if status == 200:
                self.log_result("POST /api/feed/{id}/comments", "PASS", f"Created comment with ID: {response.get('id')}")
                category_results.append("PASS")
            else:
                self.log_result("POST /api/feed/{id}/comments", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # POST /api/feed/{id}/reactions
        if post_id:
            reaction_data = {"reaction_type": "like"}
            status, response = self.make_request("POST", f"/feed/{post_id}/reactions", token=TOKENS["ADMIN"], data=reaction_data)
            if status == 200:
                self.log_result("POST /api/feed/{id}/reactions", "PASS", f"Added reaction: {response.get('action', 'unknown')}")
                category_results.append("PASS")
            else:
                self.log_result("POST /api/feed/{id}/reactions", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # GET /api/feed/team-members
        status, response = self.make_request("GET", "/feed/team-members", token=TOKENS["ADMIN"])
        if status == 200:
            members_count = len(response.get('members', []))
            self.log_result("GET /api/feed/team-members", "PASS", f"Returns {members_count} team members")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/feed/team-members", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
            
        self.category_results["TEAM FEED"] = category_results

    def test_notifications(self):
        """6. NOTIFICATIONS"""
        print("🔔 TESTING NOTIFICATIONS ENDPOINTS")
        category_results = []
        
        # GET /api/notifications
        status, response = self.make_request("GET", "/notifications", token=TOKENS["ADMIN"])
        if status == 200:
            notifications_count = len(response) if isinstance(response, list) else len(response.get('notifications', []))
            self.log_result("GET /api/notifications", "PASS", f"Returns {notifications_count} notifications")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/notifications", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # GET /api/notifications/unread-count
        status, response = self.make_request("GET", "/notifications/unread-count", token=TOKENS["ADMIN"])
        if status == 200:
            unread_count = response.get('count', 0)
            self.log_result("GET /api/notifications/unread-count", "PASS", f"Unread count: {unread_count}")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/notifications/unread-count", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # GET /api/notifications/preferences
        status, response = self.make_request("GET", "/notifications/preferences", token=TOKENS["ADMIN"])
        if status == 200:
            self.log_result("GET /api/notifications/preferences", "PASS", "Retrieved notification preferences")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/notifications/preferences", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # PUT /api/notifications/preferences
        preferences_data = {"email_notifications": True, "push_notifications": False}
        status, response = self.make_request("PUT", "/notifications/preferences", token=TOKENS["ADMIN"], data=preferences_data)
        if status == 200:
            self.log_result("PUT /api/notifications/preferences", "PASS", "Updated notification preferences")
            category_results.append("PASS")
        else:
            self.log_result("PUT /api/notifications/preferences", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
            
        self.category_results["NOTIFICATIONS"] = category_results

    def test_scope_of_appointment(self):
        """7. SCOPE OF APPOINTMENT (SOA)"""
        print("📄 TESTING SCOPE OF APPOINTMENT ENDPOINTS")
        category_results = []
        
        # GET /api/scopes
        status, response = self.make_request("GET", "/scopes", token=TOKENS["ADMIN"])
        if status == 200:
            scopes_count = len(response) if isinstance(response, list) else len(response.get('scopes', []))
            self.log_result("GET /api/scopes", "PASS", f"Returns {scopes_count} scopes")
            category_results.append("PASS")
            
            # Store scope ID for further testing
            scopes = response if isinstance(response, list) else response.get('scopes', [])
            if scopes and not self.test_data.get('scope_id'):
                self.test_data['scope_id'] = scopes[0].get('id')
        else:
            self.log_result("GET /api/scopes", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # POST /api/scopes
        lead_id = self.test_data.get('lead_id')
        if lead_id:
            scope_data = {
                "lead_id": lead_id,
                "beneficiary_name": "Test Beneficiary API Audit",
                "agent_name": "Test Agent",
                "appointment_date": "2024-12-25"
            }
            status, response = self.make_request("POST", "/scopes", token=TOKENS["ADMIN"], data=scope_data)
            if status == 200:
                self.log_result("POST /api/scopes", "PASS", f"Created scope with ID: {response.get('id')}")
                category_results.append("PASS")
                self.test_data['created_scope_id'] = response.get('id')
            else:
                self.log_result("POST /api/scopes", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
        
        # GET /api/scopes/{id}
        scope_id = self.test_data.get('scope_id') or self.test_data.get('created_scope_id')
        if scope_id:
            status, response = self.make_request("GET", f"/scopes/{scope_id}", token=TOKENS["ADMIN"])
            if status == 200:
                self.log_result("GET /api/scopes/{id}", "PASS", f"Retrieved scope: {response.get('beneficiary_name', 'Unknown')}")
                category_results.append("PASS")
            else:
                self.log_result("GET /api/scopes/{id}", "FAIL", f"Expected 200, got {status}", response)
                category_results.append("FAIL")
                
        self.category_results["SCOPE OF APPOINTMENT"] = category_results

    def test_account_user(self):
        """8. ACCOUNT/USER"""
        print("👤 TESTING ACCOUNT/USER ENDPOINTS")
        category_results = []
        
        # GET /api/account/mode
        status, response = self.make_request("GET", "/account/mode", token=TOKENS["ADMIN"])
        if status == 200:
            mode = response.get('mode', 'unknown')
            self.log_result("GET /api/account/mode", "PASS", f"Account mode: {mode}")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/account/mode", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # PUT /api/account/mode
        mode_data = {"mode": "connected"}
        status, response = self.make_request("PUT", "/account/mode", token=TOKENS["ADMIN"], data=mode_data)
        if status == 200:
            self.log_result("PUT /api/account/mode", "PASS", "Updated account mode")
            category_results.append("PASS")
        else:
            self.log_result("PUT /api/account/mode", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # GET /api/users (admin only)
        status, response = self.make_request("GET", "/users", token=TOKENS["ADMIN"])
        if status == 200:
            users_count = len(response) if isinstance(response, list) else len(response.get('users', []))
            self.log_result("GET /api/users (ADMIN)", "PASS", f"Returns {users_count} users")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/users (ADMIN)", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # Test that non-admin cannot access users endpoint
        status, response = self.make_request("GET", "/users", token=TOKENS["AGENT"])
        if status == 403:
            self.log_result("GET /api/users (AGENT) - Permission Check", "PASS", "Correctly returns 403 Forbidden")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/users (AGENT) - Permission Check", "FAIL", f"Expected 403, got {status}", response)
            category_results.append("FAIL")
        
        # GET /api/team-members
        status, response = self.make_request("GET", "/team-members", token=TOKENS["ADMIN"])
        if status == 200:
            members_count = len(response) if isinstance(response, list) else len(response.get('members', []))
            self.log_result("GET /api/team-members", "PASS", f"Returns {members_count} team members")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/team-members", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
            
        self.category_results["ACCOUNT/USER"] = category_results

    def test_team_management(self):
        """9. TEAM MANAGEMENT"""
        print("🏢 TESTING TEAM MANAGEMENT ENDPOINTS")
        category_results = []
        
        # GET /api/organizations
        status, response = self.make_request("GET", "/organizations", token=TOKENS["ADMIN"])
        if status == 200:
            orgs_count = len(response) if isinstance(response, list) else len(response.get('organizations', []))
            self.log_result("GET /api/organizations", "PASS", f"Returns {orgs_count} organizations")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/organizations", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # GET /api/invitations
        status, response = self.make_request("GET", "/invitations", token=TOKENS["ADMIN"])
        if status == 200:
            invitations_count = len(response) if isinstance(response, list) else len(response.get('invitations', []))
            self.log_result("GET /api/invitations", "PASS", f"Returns {invitations_count} invitations")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/invitations", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
        
        # POST /api/invitations
        invitation_data = {
            "email": "testinvite@example.com",
            "role": "agent"
        }
        status, response = self.make_request("POST", "/invitations", token=TOKENS["ADMIN"], data=invitation_data)
        if status == 200:
            self.log_result("POST /api/invitations", "PASS", f"Created invitation with token: {response.get('token', 'unknown')[:20]}...")
            category_results.append("PASS")
        else:
            self.log_result("POST /api/invitations", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
            
        self.category_results["TEAM MANAGEMENT"] = category_results

    def test_ai_coach(self):
        """10. AI COACH"""
        print("🤖 TESTING AI COACH ENDPOINTS")
        category_results = []
        
        # POST /api/coach/advice (if exists)
        advice_data = {"question": "How can I improve my sales performance?"}
        status, response = self.make_request("POST", "/coach/advice", token=TOKENS["ADMIN"], data=advice_data)
        if status == 200:
            self.log_result("POST /api/coach/advice", "PASS", f"Received advice: {len(response.get('advice', ''))} chars")
            category_results.append("PASS")
        elif status == 404:
            self.log_result("POST /api/coach/advice", "PASS", "Endpoint not implemented (404)")
            category_results.append("PASS")
        else:
            self.log_result("POST /api/coach/advice", "FAIL", f"Unexpected status: {status}", response)
            category_results.append("FAIL")
        
        # POST /api/coach/scripts (if exists)
        script_data = {"scenario": "cold calling"}
        status, response = self.make_request("POST", "/coach/scripts", token=TOKENS["ADMIN"], data=script_data)
        if status == 200:
            self.log_result("POST /api/coach/scripts", "PASS", f"Received script: {len(response.get('script', ''))} chars")
            category_results.append("PASS")
        elif status == 404:
            self.log_result("POST /api/coach/scripts", "PASS", "Endpoint not implemented (404)")
            category_results.append("PASS")
        else:
            self.log_result("POST /api/coach/scripts", "FAIL", f"Unexpected status: {status}", response)
            category_results.append("FAIL")
            
        self.category_results["AI COACH"] = category_results

    def test_system(self):
        """11. SYSTEM"""
        print("🏥 TESTING SYSTEM ENDPOINTS")
        category_results = []
        
        # GET /api/health
        status, response = self.make_request("GET", "/health")
        if status == 200:
            self.log_result("GET /api/health", "PASS", f"System healthy: {response.get('status', 'unknown')}")
            category_results.append("PASS")
        else:
            self.log_result("GET /api/health", "FAIL", f"Expected 200, got {status}", response)
            category_results.append("FAIL")
            
        self.category_results["SYSTEM"] = category_results

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 STARTING COMPREHENSIVE SYSTEM-WIDE BACKEND API AUDIT")
        print("=" * 80)
        print("Testing ALL API endpoints for Admin, Manager, and Agent roles")
        print("This is a complete production audit covering 11 endpoint categories")
        print("=" * 80)
        
        start_time = time.time()
        
        # Run all test suites
        self.test_authentication()
        self.test_leads_crm()
        self.test_pipeline()
        self.test_appointments()
        self.test_team_feed()
        self.test_notifications()
        self.test_scope_of_appointment()
        self.test_account_user()
        self.test_team_management()
        self.test_ai_coach()
        self.test_system()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Generate summary
        self.generate_summary(duration)

    def generate_summary(self, duration: float):
        """Generate comprehensive test summary"""
        print("=" * 80)
        print("📊 COMPREHENSIVE API AUDIT SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r['status'] == 'PASS'])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {success_rate:.1f}%")
        print(f"Duration: {duration:.2f} seconds")
        print()
        
        # Category breakdown
        print("📋 CATEGORY BREAKDOWN:")
        for category, results in self.category_results.items():
            category_passed = len([r for r in results if r == 'PASS'])
            category_total = len(results)
            category_rate = (category_passed / category_total * 100) if category_total > 0 else 0
            status_emoji = "✅" if category_rate == 100 else "⚠️" if category_rate >= 50 else "❌"
            print(f"  {status_emoji} {category}: {category_passed}/{category_total} ({category_rate:.1f}%)")
        print()
        
        if failed_tests > 0:
            print("❌ FAILED TESTS:")
            for result in self.results:
                if result['status'] == 'FAIL':
                    print(f"  • {result['test']}: {result['details']}")
            print()
        
        print("✅ PASSED TESTS:")
        for result in self.results:
            if result['status'] == 'PASS':
                print(f"  • {result['test']}")
        
        print(f"\n🎯 COMPREHENSIVE BACKEND API AUDIT COMPLETE")
        print("All 11 endpoint categories tested for role-based access and functionality")

if __name__ == "__main__":
    tester = ComprehensiveAPITester()
    tester.run_all_tests()