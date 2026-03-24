#!/usr/bin/env python3
"""
COMPREHENSIVE TEAM FEED API AUDIT
Testing all Team Feed API endpoints for AgentRoute CRM with role-based permission validation.
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, List, Optional

# Configuration
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"

# Test tokens provided in review request
TOKENS = {
    "ADMIN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3NDQzZGIwMC1jZjJmLTRhOGEtOWZjYS01YjkwZDEzYjllNGEiLCJlbWFpbCI6ImFkbWluQGFnZW50cm91dGUuY29tIiwiZXhwIjoxNzc0OTIzODE0fQ.J2yaGmmp8od_-kdcHnQbavazE2-rddpqcut-Sswaeck",
    "MANAGER": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NTRhMmE5YS1mNzE0LTRjYmItODRiOS0wNzRlNGJiNDI3OTciLCJlbWFpbCI6Im1hbmFnZXJAYWdlbnRyb3V0ZS5jb20iLCJleHAiOjE3NzQ5MjM4MTR9.8XbjgwhGlM0BhEgyPt-oValNfuUrmwdV1SJkPyapSvQ",
    "AGENT": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNGUzOGIyMy03MjEzLTQ3ODgtOTNhYS01OWZkYjgzZDIxM2MiLCJlbWFpbCI6ImFnZW50QGFnZW50cm91dGUuY29tIiwiZXhwIjoxNzc0OTIzODE0fQ.4v6jFX7pW3tqfbelsUo77hK0ytLvNrRZcTvrxauNXxE"
}

class TeamFeedTester:
    def __init__(self):
        self.results = []
        self.test_data = {}
        
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

    def test_authentication_requirements(self):
        """Test 1: AUTHENTICATION TESTS"""
        print("🔐 TESTING AUTHENTICATION REQUIREMENTS")
        
        # Test GET /api/feed without token
        status, response = self.make_request("GET", "/feed")
        if status == 401:
            self.log_result("GET /api/feed without token", "PASS", "Correctly returns 401 Unauthorized")
        else:
            self.log_result("GET /api/feed without token", "FAIL", f"Expected 401, got {status}", response)
            
        # Test POST /api/feed without token
        status, response = self.make_request("POST", "/feed", data={"content": "test", "post_type": "update"})
        if status == 401:
            self.log_result("POST /api/feed without token", "PASS", "Correctly returns 401 Unauthorized")
        else:
            self.log_result("POST /api/feed without token", "FAIL", f"Expected 401, got {status}", response)
            
        # Test with invalid token
        invalid_token = "invalid.token.here"
        status, response = self.make_request("GET", "/feed", token=invalid_token)
        if status == 401:
            self.log_result("GET /api/feed with invalid token", "PASS", "Correctly returns 401 Unauthorized")
        else:
            self.log_result("GET /api/feed with invalid token", "FAIL", f"Expected 401, got {status}", response)

    def test_role_access_permissions(self):
        """Test 2: ROLE ACCESS TESTS"""
        print("👥 TESTING ROLE ACCESS PERMISSIONS")
        
        for role, token in TOKENS.items():
            # Test GET /api/feed
            status, response = self.make_request("GET", "/feed", token=token)
            if status == 200:
                self.log_result(f"{role} - GET /api/feed", "PASS", f"Returns {len(response.get('posts', []))} posts")
                # Store first post ID for later tests
                if response.get('posts') and not self.test_data.get('post_id'):
                    self.test_data['post_id'] = response['posts'][0]['id']
            else:
                self.log_result(f"{role} - GET /api/feed", "FAIL", f"Expected 200, got {status}", response)
                
            # Test POST /api/feed
            post_data = {
                "content": f"Test post from {role} at {datetime.now().isoformat()}",
                "post_type": "update"
            }
            status, response = self.make_request("POST", "/feed", token=token, data=post_data)
            if status == 200:
                self.log_result(f"{role} - POST /api/feed", "PASS", f"Created post with ID: {response.get('id')}")
                # Store created post IDs for later tests
                if not self.test_data.get(f'{role.lower()}_post_id'):
                    self.test_data[f'{role.lower()}_post_id'] = response.get('id')
            else:
                self.log_result(f"{role} - POST /api/feed", "FAIL", f"Expected 200, got {status}", response)

    def test_comments_and_reactions(self):
        """Test comments and reactions for all roles"""
        print("💬 TESTING COMMENTS AND REACTIONS")
        
        # Get a post ID to test with
        post_id = self.test_data.get('post_id') or self.test_data.get('admin_post_id')
        if not post_id:
            self.log_result("Comments/Reactions Test Setup", "FAIL", "No post ID available for testing")
            return
            
        for role, token in TOKENS.items():
            # Test POST /api/feed/{post_id}/comments
            comment_data = {"content": f"Test comment from {role}"}
            status, response = self.make_request("POST", f"/feed/{post_id}/comments", token=token, data=comment_data)
            if status == 200:
                self.log_result(f"{role} - POST comment", "PASS", f"Created comment with ID: {response.get('id')}")
            else:
                self.log_result(f"{role} - POST comment", "FAIL", f"Expected 200, got {status}", response)
                
            # Test POST /api/feed/{post_id}/reactions
            reaction_data = {"reaction_type": "like"}
            status, response = self.make_request("POST", f"/feed/{post_id}/reactions", token=token, data=reaction_data)
            if status == 200:
                self.log_result(f"{role} - POST reaction", "PASS", f"Added reaction: {response.get('action')}")
            else:
                self.log_result(f"{role} - POST reaction", "FAIL", f"Expected 200, got {status}", response)

    def test_permission_restrictions(self):
        """Test 3: PERMISSION TESTS"""
        print("🔒 TESTING PERMISSION RESTRICTIONS")
        
        # Test Agent cannot pin posts
        agent_post_id = self.test_data.get('agent_post_id')
        if agent_post_id:
            pin_data = {"is_pinned": True}
            status, response = self.make_request("PUT", f"/feed/{agent_post_id}", token=TOKENS["AGENT"], data=pin_data)
            if status == 403:
                self.log_result("Agent cannot pin posts", "PASS", "Correctly returns 403 Forbidden")
            else:
                self.log_result("Agent cannot pin posts", "FAIL", f"Expected 403, got {status}", response)
        
        # Test Manager can pin posts
        manager_post_id = self.test_data.get('manager_post_id')
        if manager_post_id:
            pin_data = {"is_pinned": True}
            status, response = self.make_request("PUT", f"/feed/{manager_post_id}", token=TOKENS["MANAGER"], data=pin_data)
            if status == 200:
                self.log_result("Manager can pin posts", "PASS", "Successfully pinned post")
            else:
                self.log_result("Manager can pin posts", "FAIL", f"Expected 200, got {status}", response)
                
        # Test Admin can pin posts
        admin_post_id = self.test_data.get('admin_post_id')
        if admin_post_id:
            pin_data = {"is_pinned": True}
            status, response = self.make_request("PUT", f"/feed/{admin_post_id}", token=TOKENS["ADMIN"], data=pin_data)
            if status == 200:
                self.log_result("Admin can pin posts", "PASS", "Successfully pinned post")
            else:
                self.log_result("Admin can pin posts", "FAIL", f"Expected 200, got {status}", response)

    def test_deletion_permissions(self):
        """Test deletion permissions"""
        print("🗑️ TESTING DELETION PERMISSIONS")
        
        # Create a post as admin for deletion tests
        post_data = {"content": "Test post for deletion", "post_type": "update"}
        status, response = self.make_request("POST", "/feed", token=TOKENS["ADMIN"], data=post_data)
        if status == 200:
            test_post_id = response.get('id')
            
            # Test Agent cannot delete other users' posts
            status, response = self.make_request("DELETE", f"/feed/{test_post_id}", token=TOKENS["AGENT"])
            if status == 403:
                self.log_result("Agent cannot delete other users' posts", "PASS", "Correctly returns 403 Forbidden")
            else:
                self.log_result("Agent cannot delete other users' posts", "FAIL", f"Expected 403, got {status}", response)
                
            # Test Manager can delete posts in their org
            status, response = self.make_request("DELETE", f"/feed/{test_post_id}", token=TOKENS["MANAGER"])
            if status == 200:
                self.log_result("Manager can delete posts in org", "PASS", "Successfully deleted post")
            else:
                self.log_result("Manager can delete posts in org", "FAIL", f"Expected 200, got {status}", response)

    def test_validation_requirements(self):
        """Test 4: VALIDATION TESTS"""
        print("✅ TESTING VALIDATION REQUIREMENTS")
        
        # Test POST /api/feed with empty content
        empty_data = {"content": "", "post_type": "update"}
        status, response = self.make_request("POST", "/feed", token=TOKENS["ADMIN"], data=empty_data)
        if status == 422:  # FastAPI validation error
            self.log_result("POST /api/feed with empty content", "PASS", "Correctly returns validation error")
        else:
            self.log_result("POST /api/feed with empty content", "FAIL", f"Expected 422, got {status}", response)
            
        # Test POST /api/feed with invalid post_type
        invalid_type_data = {"content": "Test content", "post_type": "invalid_type"}
        status, response = self.make_request("POST", "/feed", token=TOKENS["ADMIN"], data=invalid_type_data)
        if status == 422:
            self.log_result("POST /api/feed with invalid post_type", "PASS", "Correctly returns validation error")
        else:
            self.log_result("POST /api/feed with invalid post_type", "FAIL", f"Expected 422, got {status}", response)
            
        # Test POST /api/feed/{post_id}/reactions with invalid reaction_type
        post_id = self.test_data.get('post_id') or self.test_data.get('admin_post_id')
        if post_id:
            invalid_reaction = {"reaction_type": "invalid_reaction"}
            status, response = self.make_request("POST", f"/feed/{post_id}/reactions", token=TOKENS["ADMIN"], data=invalid_reaction)
            if status == 422:
                self.log_result("POST reaction with invalid type", "PASS", "Correctly returns validation error")
            else:
                self.log_result("POST reaction with invalid type", "FAIL", f"Expected 422, got {status}", response)
                
        # Test POST /api/feed/{post_id}/comments with empty content
        if post_id:
            empty_comment = {"content": ""}
            status, response = self.make_request("POST", f"/feed/{post_id}/comments", token=TOKENS["ADMIN"], data=empty_comment)
            if status == 422:
                self.log_result("POST comment with empty content", "PASS", "Correctly returns validation error")
            else:
                self.log_result("POST comment with empty content", "FAIL", f"Expected 422, got {status}", response)

    def test_lead_linking(self):
        """Test 5: LEAD LINKING TESTS"""
        print("🔗 TESTING LEAD LINKING")
        
        # First, get a lead ID to link to
        status, response = self.make_request("GET", "/leads", token=TOKENS["ADMIN"])
        if status == 200 and response.get('leads'):
            lead_id = response['leads'][0]['id']
            lead_name = response['leads'][0]['name']
            
            # Test POST /api/feed with linked_lead_id
            linked_post_data = {
                "content": "Test post linked to lead",
                "post_type": "update",
                "linked_lead_id": lead_id
            }
            status, response = self.make_request("POST", "/feed", token=TOKENS["ADMIN"], data=linked_post_data)
            if status == 200 and response.get('linked_lead_id') == lead_id:
                self.log_result("POST /api/feed with linked_lead_id", "PASS", f"Created post linked to lead: {lead_name}")
                
                # Test GET /api/feed shows linked lead info
                status, feed_response = self.make_request("GET", "/feed", token=TOKENS["ADMIN"])
                if status == 200:
                    linked_posts = [p for p in feed_response.get('posts', []) if p.get('linked_lead_id') == lead_id]
                    if linked_posts and linked_posts[0].get('linked_lead_name'):
                        self.log_result("GET /api/feed shows linked lead info", "PASS", f"Shows lead name: {linked_posts[0]['linked_lead_name']}")
                    else:
                        self.log_result("GET /api/feed shows linked lead info", "FAIL", "Linked lead name not found in response")
            else:
                self.log_result("POST /api/feed with linked_lead_id", "FAIL", f"Expected 200 with linked_lead_id, got {status}", response)
        else:
            self.log_result("Lead Linking Test Setup", "FAIL", "No leads available for linking test")

    def test_filtering_options(self):
        """Test 6: FILTER TESTS"""
        print("🔍 TESTING FILTERING OPTIONS")
        
        # Create posts of different types for filtering
        post_types = ["update", "announcement"]
        for post_type in post_types:
            post_data = {"content": f"Test {post_type} post", "post_type": post_type}
            self.make_request("POST", "/feed", token=TOKENS["ADMIN"], data=post_data)
            
        time.sleep(1)  # Brief pause to ensure posts are created
        
        # Test GET /api/feed?filter_type=update
        status, response = self.make_request("GET", "/feed", token=TOKENS["ADMIN"], params={"filter_type": "update"})
        if status == 200:
            update_posts = [p for p in response.get('posts', []) if p.get('post_type') == 'update']
            if len(update_posts) == len(response.get('posts', [])):
                self.log_result("GET /api/feed?filter_type=update", "PASS", f"Returns only update posts: {len(update_posts)}")
            else:
                self.log_result("GET /api/feed?filter_type=update", "FAIL", "Contains non-update posts")
        else:
            self.log_result("GET /api/feed?filter_type=update", "FAIL", f"Expected 200, got {status}", response)
            
        # Test GET /api/feed?filter_type=announcement
        status, response = self.make_request("GET", "/feed", token=TOKENS["ADMIN"], params={"filter_type": "announcement"})
        if status == 200:
            announcement_posts = [p for p in response.get('posts', []) if p.get('post_type') == 'announcement']
            if len(announcement_posts) == len(response.get('posts', [])):
                self.log_result("GET /api/feed?filter_type=announcement", "PASS", f"Returns only announcement posts: {len(announcement_posts)}")
            else:
                self.log_result("GET /api/feed?filter_type=announcement", "FAIL", "Contains non-announcement posts")
        else:
            self.log_result("GET /api/feed?filter_type=announcement", "FAIL", f"Expected 200, got {status}", response)
            
        # Test GET /api/feed/team-members
        status, response = self.make_request("GET", "/feed/team-members", token=TOKENS["ADMIN"])
        if status == 200 and 'members' in response:
            self.log_result("GET /api/feed/team-members", "PASS", f"Returns {len(response['members'])} team members")
        else:
            self.log_result("GET /api/feed/team-members", "FAIL", f"Expected 200 with members, got {status}", response)

    def test_pagination(self):
        """Test 7: PAGINATION TESTS"""
        print("📄 TESTING PAGINATION")
        
        # Test GET /api/feed?limit=5&offset=0
        status, response = self.make_request("GET", "/feed", token=TOKENS["ADMIN"], params={"limit": 5, "offset": 0})
        if status == 200:
            posts_count = len(response.get('posts', []))
            if posts_count <= 5:
                self.log_result("GET /api/feed?limit=5&offset=0", "PASS", f"Returns {posts_count} posts (≤5)")
            else:
                self.log_result("GET /api/feed?limit=5&offset=0", "FAIL", f"Returns {posts_count} posts (>5)")
        else:
            self.log_result("GET /api/feed?limit=5&offset=0", "FAIL", f"Expected 200, got {status}", response)
            
        # Test GET /api/feed?limit=5&offset=5
        status, response = self.make_request("GET", "/feed", token=TOKENS["ADMIN"], params={"limit": 5, "offset": 5})
        if status == 200:
            posts_count = len(response.get('posts', []))
            self.log_result("GET /api/feed?limit=5&offset=5", "PASS", f"Returns {posts_count} posts from offset 5")
        else:
            self.log_result("GET /api/feed?limit=5&offset=5", "FAIL", f"Expected 200, got {status}", response)

    def test_core_crm_health(self):
        """Test 8: CORE CRM API HEALTH CHECK"""
        print("🏥 TESTING CORE CRM API HEALTH")
        
        # Test GET /api/health
        status, response = self.make_request("GET", "/health")
        if status == 200:
            self.log_result("GET /api/health", "PASS", "Health check successful")
        else:
            self.log_result("GET /api/health", "FAIL", f"Expected 200, got {status}", response)
            
        # Test GET /api/leads with AGENT_TOKEN
        status, response = self.make_request("GET", "/leads", token=TOKENS["AGENT"])
        if status == 200:
            leads_count = len(response) if isinstance(response, list) else len(response.get('leads', []))
            self.log_result("GET /api/leads (AGENT)", "PASS", f"Returns {leads_count} leads")
        else:
            self.log_result("GET /api/leads (AGENT)", "FAIL", f"Expected 200, got {status}", response)
            
        # Test GET /api/pipeline with AGENT_TOKEN
        status, response = self.make_request("GET", "/pipeline", token=TOKENS["AGENT"])
        if status == 200:
            self.log_result("GET /api/pipeline (AGENT)", "PASS", "Pipeline data accessible")
        else:
            self.log_result("GET /api/pipeline (AGENT)", "FAIL", f"Expected 200, got {status}", response)
            
        # Test GET /api/me with all tokens
        for role, token in TOKENS.items():
            status, response = self.make_request("GET", "/auth/me", token=token)
            if status == 200:
                self.log_result(f"GET /api/me ({role})", "PASS", f"User: {response.get('email', 'Unknown')}")
            else:
                self.log_result(f"GET /api/me ({role})", "FAIL", f"Expected 200, got {status}", response)

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 STARTING COMPREHENSIVE TEAM FEED API AUDIT")
        print("=" * 60)
        
        start_time = time.time()
        
        # Run all test suites
        self.test_authentication_requirements()
        self.test_role_access_permissions()
        self.test_comments_and_reactions()
        self.test_permission_restrictions()
        self.test_deletion_permissions()
        self.test_validation_requirements()
        self.test_lead_linking()
        self.test_filtering_options()
        self.test_pagination()
        self.test_core_crm_health()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Generate summary
        self.generate_summary(duration)

    def generate_summary(self, duration: float):
        """Generate test summary"""
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
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
        
        print("\n🎯 TEAM FEED API AUDIT COMPLETE")

if __name__ == "__main__":
    tester = TeamFeedTester()
    tester.run_all_tests()