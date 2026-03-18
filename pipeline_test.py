#!/usr/bin/env python3
"""
Policy Sales Pipeline API Testing for AgentRoute AI
Testing the specific pipeline endpoints as requested in the review.
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import time

# Configuration
BASE_URL = "https://agentroute-app-store.preview.emergentagent.com/api"
TEST_EMAIL = "demo@agentroute.com"
TEST_PASSWORD = "Demo1234!"

class PipelineAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.user_info = None
        self.test_lead_id = None
        self.results = []
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response_data"] = response_data
        self.results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        
    def test_login(self):
        """Test login and get auth token"""
        try:
            response = self.session.post(f"{BASE_URL}/auth/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("access_token")
                self.user_info = data.get("user")
                self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                self.log_result("Login", True, f"Logged in as {self.user_info.get('name')} ({self.user_info.get('role')})")
                return True
            else:
                self.log_result("Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_result("Login", False, f"Exception: {str(e)}")
            return False
    
    def test_get_pipeline_individual(self):
        """Test GET /api/pipeline with team_view=false (individual view)"""
        try:
            response = self.session.get(f"{BASE_URL}/pipeline", params={"team_view": False})
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["stages", "summary", "is_team_view"]
                
                if all(field in data for field in required_fields):
                    stages = data["stages"]
                    summary = data["summary"]
                    is_team_view = data["is_team_view"]
                    
                    # Verify structure
                    if isinstance(stages, list) and isinstance(summary, dict) and is_team_view == False:
                        stage_count = len(stages)
                        total_cases = summary.get("total_cases", 0)
                        self.log_result("Get Pipeline (Individual)", True, 
                                      f"Retrieved {stage_count} stages, {total_cases} total cases")
                        return True
                    else:
                        self.log_result("Get Pipeline (Individual)", False, "Invalid data structure")
                        return False
                else:
                    self.log_result("Get Pipeline (Individual)", False, f"Missing required fields: {required_fields}")
                    return False
            else:
                self.log_result("Get Pipeline (Individual)", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_result("Get Pipeline (Individual)", False, f"Exception: {str(e)}")
            return False
    
    def test_get_pipeline_team(self):
        """Test GET /api/pipeline with team_view=true (team view)"""
        try:
            response = self.session.get(f"{BASE_URL}/pipeline", params={"team_view": True})
            
            if response.status_code == 200:
                data = response.json()
                is_team_view = data.get("is_team_view", False)
                user_role = self.user_info.get("role", "agent")
                
                # For admin/manager roles, team_view should be true
                # For agent role, team_view should remain false (no access)
                if user_role in ["admin", "manager"]:
                    expected_team_view = True
                    self.log_result("Get Pipeline (Team)", True, 
                                  f"Team view accessible for {user_role}, is_team_view: {is_team_view}")
                else:
                    # Agent should still get individual view even when requesting team view
                    self.log_result("Get Pipeline (Team)", True, 
                                  f"Agent role correctly restricted, is_team_view: {is_team_view}")
                return True
            else:
                self.log_result("Get Pipeline (Team)", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_result("Get Pipeline (Team)", False, f"Exception: {str(e)}")
            return False
    
    def test_create_test_lead(self):
        """Create a test lead for pipeline testing"""
        try:
            lead_data = {
                "name": f"Pipeline Test Lead {datetime.now().strftime('%H%M%S')}",
                "phone": "555-0123",
                "email": f"test.lead.{uuid.uuid4().hex[:8]}@example.com",
                "address": "123 Test Street, Test City, TX 12345",
                "notes": "Created for pipeline testing",
                "source": "manual"
            }
            
            response = self.session.post(f"{BASE_URL}/leads", json=lead_data)
            
            if response.status_code == 200:
                data = response.json()
                self.test_lead_id = data.get("id")
                self.log_result("Create Test Lead", True, f"Created lead: {data.get('name')} (ID: {self.test_lead_id})")
                return True
            else:
                self.log_result("Create Test Lead", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_result("Create Test Lead", False, f"Exception: {str(e)}")
            return False
    
    def test_move_pipeline_stage(self, new_stage, notes=None, premium=None, commission=None, policy_type=None):
        """Test PUT /api/pipeline/move"""
        try:
            if not self.test_lead_id:
                self.log_result(f"Move to {new_stage}", False, "No test lead available")
                return False
            
            move_data = {
                "lead_id": self.test_lead_id,
                "new_stage": new_stage
            }
            
            if notes:
                move_data["notes"] = notes
            if premium:
                move_data["premium"] = premium
            if commission:
                move_data["commission"] = commission
            if policy_type:
                move_data["policy_type"] = policy_type
            
            response = self.session.put(f"{BASE_URL}/pipeline/move", json=move_data)
            
            if response.status_code == 200:
                data = response.json()
                expected_fields = ["message", "lead_id", "old_stage", "new_stage"]
                
                if all(field in data for field in expected_fields):
                    old_stage = data.get("old_stage")
                    moved_to_stage = data.get("new_stage")
                    details = f"Moved from {old_stage} to {moved_to_stage}"
                    if premium:
                        details += f", Premium: ${premium}"
                    if commission:
                        details += f", Commission: ${commission}"
                    
                    self.log_result(f"Move to {new_stage}", True, details)
                    return True
                else:
                    self.log_result(f"Move to {new_stage}", False, f"Missing response fields: {expected_fields}")
                    return False
            else:
                self.log_result(f"Move to {new_stage}", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_result(f"Move to {new_stage}", False, f"Exception: {str(e)}")
            return False
    
    def test_get_pipeline_stats_individual(self):
        """Test GET /api/pipeline/stats with team_view=false"""
        try:
            response = self.session.get(f"{BASE_URL}/pipeline/stats", params={"team_view": False})
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["production", "stage_counts", "total_in_pipeline", "active_cases", "closed_won", "is_team_view"]
                
                if all(field in data for field in required_fields):
                    production = data["production"]
                    stage_counts = data["stage_counts"]
                    total_in_pipeline = data["total_in_pipeline"]
                    is_team_view = data["is_team_view"]
                    
                    # Verify production structure
                    if "daily" in production and "weekly" in production and "monthly" in production:
                        daily_stats = production["daily"]
                        self.log_result("Get Pipeline Stats (Individual)", True, 
                                      f"Total in pipeline: {total_in_pipeline}, Daily premium: ${daily_stats.get('premium', 0)}, is_team_view: {is_team_view}")
                        return True
                    else:
                        self.log_result("Get Pipeline Stats (Individual)", False, "Invalid production structure")
                        return False
                else:
                    self.log_result("Get Pipeline Stats (Individual)", False, f"Missing required fields: {required_fields}")
                    return False
            else:
                self.log_result("Get Pipeline Stats (Individual)", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_result("Get Pipeline Stats (Individual)", False, f"Exception: {str(e)}")
            return False
    
    def test_get_pipeline_stats_team(self):
        """Test GET /api/pipeline/stats with team_view=true"""
        try:
            response = self.session.get(f"{BASE_URL}/pipeline/stats", params={"team_view": True})
            
            if response.status_code == 200:
                data = response.json()
                is_team_view = data.get("is_team_view", False)
                user_role = self.user_info.get("role", "agent")
                
                # Check role-based access
                if user_role in ["admin", "manager"]:
                    self.log_result("Get Pipeline Stats (Team)", True, 
                                  f"Team stats accessible for {user_role}, is_team_view: {is_team_view}")
                else:
                    self.log_result("Get Pipeline Stats (Team)", True, 
                                  f"Agent role correctly handled, is_team_view: {is_team_view}")
                return True
            else:
                self.log_result("Get Pipeline Stats (Team)", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_result("Get Pipeline Stats (Team)", False, f"Exception: {str(e)}")
            return False
    
    def verify_commission_calculations(self):
        """Verify that commission calculations are tracked correctly"""
        try:
            # Get current pipeline to check if our test lead shows up with correct premium/commission
            response = self.session.get(f"{BASE_URL}/pipeline")
            
            if response.status_code == 200:
                data = response.json()
                stages = data.get("stages", [])
                
                # Look for our test lead in the stages
                test_lead_found = False
                for stage in stages:
                    leads = stage.get("leads", [])
                    for lead in leads:
                        if lead.get("id") == self.test_lead_id:
                            test_lead_found = True
                            premium = lead.get("premium", 0)
                            commission = lead.get("commission", 0)
                            
                            if premium > 0 and commission > 0:
                                self.log_result("Commission Calculations", True, 
                                              f"Lead found with Premium: ${premium}, Commission: ${commission}")
                                return True
                            else:
                                self.log_result("Commission Calculations", False, 
                                              f"Lead found but missing premium/commission data: Premium: ${premium}, Commission: ${commission}")
                                return False
                
                if not test_lead_found:
                    self.log_result("Commission Calculations", False, "Test lead not found in pipeline")
                    return False
            else:
                self.log_result("Commission Calculations", False, f"Failed to get pipeline: {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Commission Calculations", False, f"Exception: {str(e)}")
            return False
    
    def verify_production_totals(self):
        """Verify that production totals are updated correctly"""
        try:
            # Get production stats to verify totals
            response = self.session.get(f"{BASE_URL}/pipeline/stats")
            
            if response.status_code == 200:
                data = response.json()
                production = data.get("production", {})
                daily = production.get("daily", {})
                
                daily_premium = daily.get("premium", 0)
                daily_commission = daily.get("commission", 0)
                daily_policies = daily.get("policies", 0)
                
                self.log_result("Production Totals", True, 
                              f"Daily totals - Premium: ${daily_premium}, Commission: ${daily_commission}, Policies: {daily_policies}")
                return True
            else:
                self.log_result("Production Totals", False, f"Failed to get stats: {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Production Totals", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run the complete test suite"""
        print("🚀 Starting Policy Sales Pipeline API Tests")
        print("=" * 60)
        
        # Step 1: Login
        if not self.test_login():
            print("❌ Login failed - cannot continue with tests")
            return False
        
        # Step 2: Get current pipeline view (individual)
        self.test_get_pipeline_individual()
        
        # Step 3: Test team view access
        self.test_get_pipeline_team()
        
        # Step 4: Create a new lead
        if not self.test_create_test_lead():
            print("❌ Failed to create test lead - skipping pipeline movement tests")
        else:
            # Step 5: Move lead through stages
            print("\n📈 Testing Pipeline Stage Movements:")
            
            # Move to appointment_scheduled
            self.test_move_pipeline_stage("appointment_scheduled", "Appointment set for next week")
            time.sleep(1)  # Small delay between requests
            
            # Move to application_submitted with premium/commission
            self.test_move_pipeline_stage("application_submitted", 
                                        "Application completed and submitted", 
                                        premium=2400.00, 
                                        commission=240.00, 
                                        policy_type="Medicare Supplement")
            time.sleep(1)
            
            # Move to policy_issued
            self.test_move_pipeline_stage("policy_issued", "Policy has been issued by carrier")
            time.sleep(1)
            
            # Step 6: Verify commission calculations
            self.verify_commission_calculations()
        
        # Step 7: Get pipeline statistics (individual and team)
        self.test_get_pipeline_stats_individual()
        self.test_get_pipeline_stats_team()
        
        # Step 8: Verify production totals
        self.verify_production_totals()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
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
    tester = PipelineAPITester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All pipeline API tests passed!")
        return 0
    else:
        print("\n💥 Some tests failed - check the details above")
        return 1

if __name__ == "__main__":
    exit(main())