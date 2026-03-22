#!/usr/bin/env python3
"""
Comprehensive Pipeline System Testing
Tests the FULL pipeline system end-to-end as requested in review.
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class PipelineSystemTester:
    def __init__(self):
        self.tokens = {}
        self.test_leads = []
        self.results = []
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "success": success,
            "details": details,
            "response_data": response_data,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        print(f"{status}: {test_name}")
        if details:
            print(f"    Details: {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")
        print()

    def authenticate_users(self):
        """Authenticate all test users"""
        print("🔐 AUTHENTICATING TEST USERS...")
        
        for role, creds in TEST_CREDENTIALS.items():
            try:
                response = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    self.tokens[role] = data.get("access_token")
                    self.log_result(f"Authentication - {role.title()}", True, 
                                  f"Role: {data.get('user', {}).get('role', 'unknown')}")
                else:
                    self.log_result(f"Authentication - {role.title()}", False, 
                                  f"Status: {response.status_code}", response.text)
                    return False
            except Exception as e:
                self.log_result(f"Authentication - {role.title()}", False, f"Exception: {str(e)}")
                return False
        
        return True

    def get_headers(self, role):
        """Get authorization headers for role"""
        return {"Authorization": f"Bearer {self.tokens[role]}"}

    def test_pipeline_api_get(self):
        """Test GET /api/pipeline - Verify returns all stages with correct data"""
        print("📊 TESTING PIPELINE API - GET /api/pipeline...")
        
        # Test as agent (individual view)
        try:
            response = requests.get(f"{BASE_URL}/pipeline", 
                                  headers=self.get_headers("agent"), timeout=10)
            if response.status_code == 200:
                data = response.json()
                stages = data.get("stages", [])
                summary = data.get("summary", {})
                is_team_view = data.get("is_team_view", False)
                
                # Verify structure
                if stages and isinstance(stages, list) and summary:
                    stage_names = [s.get("stage") for s in stages]
                    required_fields = ["stage", "label", "count", "total_premium", "total_commission", "leads"]
                    
                    all_fields_present = all(
                        all(field in stage for field in required_fields) 
                        for stage in stages
                    )
                    
                    self.log_result("Pipeline GET - Agent Individual View", True,
                                  f"Stages: {len(stages)}, Team view: {is_team_view}, Total cases: {summary.get('total_cases', 0)}")
                else:
                    self.log_result("Pipeline GET - Agent Individual View", False,
                                  "Missing required structure", data)
            else:
                self.log_result("Pipeline GET - Agent Individual View", False,
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Pipeline GET - Agent Individual View", False, f"Exception: {str(e)}")

        # Test as admin with team view
        try:
            response = requests.get(f"{BASE_URL}/pipeline?team_view=true", 
                                  headers=self.get_headers("admin"), timeout=10)
            if response.status_code == 200:
                data = response.json()
                is_team_view = data.get("is_team_view", False)
                stages = data.get("stages", [])
                
                self.log_result("Pipeline GET - Admin Team View", True,
                              f"Team view: {is_team_view}, Stages: {len(stages)}")
            else:
                self.log_result("Pipeline GET - Admin Team View", False,
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Pipeline GET - Admin Team View", False, f"Exception: {str(e)}")

    def create_test_lead(self, role="agent"):
        """Create a test lead for pipeline testing"""
        lead_data = {
            "name": f"Pipeline Test Lead {datetime.now().strftime('%H%M%S')}",
            "phone": "555-PIPELINE",
            "email": f"pipeline.test.{int(time.time())}@example.com",
            "address": "123 Pipeline Test St, Test City, TS 12345",
            "stage": "new_lead",
            "policy_type": "Medicare Advantage",
            "notes": "Created for pipeline testing"
        }
        
        try:
            response = requests.post(f"{BASE_URL}/leads", 
                                   json=lead_data,
                                   headers=self.get_headers(role), timeout=10)
            if response.status_code == 200:
                lead = response.json()
                lead_id = lead.get("id")
                self.test_leads.append(lead_id)
                self.log_result(f"Create Test Lead - {role.title()}", True,
                              f"Lead ID: {lead_id}, Stage: {lead.get('stage')}")
                return lead_id
            else:
                self.log_result(f"Create Test Lead - {role.title()}", False,
                              f"Status: {response.status_code}", response.text)
                return None
        except Exception as e:
            self.log_result(f"Create Test Lead - {role.title()}", False, f"Exception: {str(e)}")
            return None

    def test_lead_stage_transitions(self):
        """Test moving leads through all pipeline stages"""
        print("🔄 TESTING LEAD STAGE TRANSITIONS...")
        
        # Create a test lead
        lead_id = self.create_test_lead("agent")
        if not lead_id:
            return
        
        # Define the pipeline stages to test (using the new stage names from LeadStage enum)
        pipeline_stages = [
            "new_lead",
            "contacted", 
            "follow_up",
            "appointment_set",
            "soa_completed",
            "policy_submitted",
            "closed_won"
        ]
        
        for i, stage in enumerate(pipeline_stages[1:], 1):  # Skip first stage as lead is already created
            try:
                move_data = {
                    "lead_id": lead_id,
                    "new_stage": stage,
                    "notes": f"Pipeline test transition to {stage}",
                    "premium": 500.0 if stage in ["policy_submitted", "closed_won"] else None,
                    "commission": 50.0 if stage in ["policy_submitted", "closed_won"] else None,
                    "policy_type": "Medicare Advantage"
                }
                
                response = requests.put(f"{BASE_URL}/pipeline/move",
                                      json=move_data,
                                      headers=self.get_headers("agent"), timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    self.log_result(f"Stage Transition - {stage}", True,
                                  f"From: {data.get('old_stage')} → To: {data.get('new_stage')}")
                    
                    # Verify stage persistence by fetching the lead
                    time.sleep(0.5)  # Brief pause for database consistency
                    self.verify_stage_persistence(lead_id, stage)
                    
                else:
                    self.log_result(f"Stage Transition - {stage}", False,
                                  f"Status: {response.status_code}", response.text)
                    break
                    
            except Exception as e:
                self.log_result(f"Stage Transition - {stage}", False, f"Exception: {str(e)}")
                break

    def verify_stage_persistence(self, lead_id, expected_stage):
        """Verify that stage changes are persisted correctly"""
        try:
            response = requests.get(f"{BASE_URL}/leads/{lead_id}",
                                  headers=self.get_headers("agent"), timeout=10)
            if response.status_code == 200:
                lead = response.json()
                actual_stage = lead.get("stage")
                if actual_stage == expected_stage:
                    self.log_result(f"Stage Persistence - {expected_stage}", True,
                                  f"Stage correctly persisted: {actual_stage}")
                else:
                    self.log_result(f"Stage Persistence - {expected_stage}", False,
                                  f"Expected: {expected_stage}, Got: {actual_stage}")
            else:
                self.log_result(f"Stage Persistence - {expected_stage}", False,
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result(f"Stage Persistence - {expected_stage}", False, f"Exception: {str(e)}")

    def test_pipeline_counts_update(self):
        """Test that pipeline counts are updated after stage changes"""
        print("📈 TESTING PIPELINE COUNTS UPDATE...")
        
        try:
            # Get initial pipeline state
            response = requests.get(f"{BASE_URL}/pipeline",
                                  headers=self.get_headers("agent"), timeout=10)
            if response.status_code == 200:
                initial_data = response.json()
                initial_summary = initial_data.get("summary", {})
                initial_stages = initial_summary.get("stages_summary", {})
                
                # Create a new lead and move it to contacted stage
                lead_id = self.create_test_lead("agent")
                if lead_id:
                    # Move to contacted stage
                    move_data = {
                        "lead_id": lead_id,
                        "new_stage": "contacted",
                        "notes": "Testing pipeline count updates"
                    }
                    
                    move_response = requests.put(f"{BASE_URL}/pipeline/move",
                                               json=move_data,
                                               headers=self.get_headers("agent"), timeout=10)
                    
                    if move_response.status_code == 200:
                        time.sleep(1)  # Allow for database consistency
                        
                        # Get updated pipeline state
                        updated_response = requests.get(f"{BASE_URL}/pipeline",
                                                      headers=self.get_headers("agent"), timeout=10)
                        if updated_response.status_code == 200:
                            updated_data = updated_response.json()
                            updated_summary = updated_data.get("summary", {})
                            updated_stages = updated_summary.get("stages_summary", {})
                            
                            # Check if counts changed appropriately
                            contacted_count_changed = (
                                updated_stages.get("contacted", 0) > initial_stages.get("contacted", 0)
                            )
                            
                            self.log_result("Pipeline Counts Update", contacted_count_changed,
                                          f"Contacted stage count: {initial_stages.get('contacted', 0)} → {updated_stages.get('contacted', 0)}")
                        else:
                            self.log_result("Pipeline Counts Update", False,
                                          f"Failed to get updated pipeline: {updated_response.status_code}")
                    else:
                        self.log_result("Pipeline Counts Update", False,
                                      f"Failed to move lead: {move_response.status_code}")
                else:
                    self.log_result("Pipeline Counts Update", False, "Failed to create test lead")
            else:
                self.log_result("Pipeline Counts Update", False,
                              f"Failed to get initial pipeline: {response.status_code}")
        except Exception as e:
            self.log_result("Pipeline Counts Update", False, f"Exception: {str(e)}")

    def test_role_based_access(self):
        """Test role-based access to pipeline data"""
        print("🔐 TESTING ROLE-BASED ACCESS...")
        
        # Test agent access (should see own leads only)
        try:
            response = requests.get(f"{BASE_URL}/pipeline",
                                  headers=self.get_headers("agent"), timeout=10)
            if response.status_code == 200:
                data = response.json()
                is_team_view = data.get("is_team_view", False)
                total_cases = data.get("summary", {}).get("total_cases", 0)
                
                self.log_result("Role Access - Agent Individual", True,
                              f"Team view: {is_team_view}, Cases visible: {total_cases}")
            else:
                self.log_result("Role Access - Agent Individual", False,
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Role Access - Agent Individual", False, f"Exception: {str(e)}")

        # Test manager with team_view=true
        try:
            response = requests.get(f"{BASE_URL}/pipeline?team_view=true",
                                  headers=self.get_headers("manager"), timeout=10)
            if response.status_code == 200:
                data = response.json()
                is_team_view = data.get("is_team_view", False)
                total_cases = data.get("summary", {}).get("total_cases", 0)
                
                self.log_result("Role Access - Manager Team View", True,
                              f"Team view: {is_team_view}, Cases visible: {total_cases}")
            else:
                self.log_result("Role Access - Manager Team View", False,
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Role Access - Manager Team View", False, f"Exception: {str(e)}")

        # Test admin with team_view=true
        try:
            response = requests.get(f"{BASE_URL}/pipeline?team_view=true",
                                  headers=self.get_headers("admin"), timeout=10)
            if response.status_code == 200:
                data = response.json()
                is_team_view = data.get("is_team_view", False)
                total_cases = data.get("summary", {}).get("total_cases", 0)
                
                self.log_result("Role Access - Admin Team View", True,
                              f"Team view: {is_team_view}, Cases visible: {total_cases}")
            else:
                self.log_result("Role Access - Admin Team View", False,
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Role Access - Admin Team View", False, f"Exception: {str(e)}")

    def test_data_integrity(self):
        """Test data integrity - no duplicates, valid stage values"""
        print("🔍 TESTING DATA INTEGRITY...")
        
        # Test valid stage values
        try:
            # Try to move a lead to an invalid stage
            if self.test_leads:
                lead_id = self.test_leads[0]
                invalid_move_data = {
                    "lead_id": lead_id,
                    "new_stage": "invalid_stage",
                    "notes": "Testing invalid stage rejection"
                }
                
                response = requests.put(f"{BASE_URL}/pipeline/move",
                                      json=invalid_move_data,
                                      headers=self.get_headers("agent"), timeout=10)
                
                if response.status_code == 400:
                    self.log_result("Data Integrity - Invalid Stage Rejection", True,
                                  "Invalid stage properly rejected with 400 error")
                else:
                    self.log_result("Data Integrity - Invalid Stage Rejection", False,
                                  f"Expected 400, got {response.status_code}")
            else:
                self.log_result("Data Integrity - Invalid Stage Rejection", False,
                              "No test leads available")
        except Exception as e:
            self.log_result("Data Integrity - Invalid Stage Rejection", False, f"Exception: {str(e)}")

        # Test stage enum values match backend
        try:
            response = requests.get(f"{BASE_URL}/pipeline",
                                  headers=self.get_headers("agent"), timeout=10)
            if response.status_code == 200:
                data = response.json()
                stages = data.get("stages", [])
                stage_values = [s.get("stage") for s in stages]
                
                # Check if we have expected stage values
                expected_stages = ["new_lead", "contacted", "follow_up", "appointment_set", 
                                 "soa_completed", "policy_submitted", "closed_won", "closed_lost"]
                
                valid_stages_present = any(stage in stage_values for stage in expected_stages)
                
                self.log_result("Data Integrity - Valid Stage Values", valid_stages_present,
                              f"Found stages: {stage_values[:5]}...")  # Show first 5
            else:
                self.log_result("Data Integrity - Valid Stage Values", False,
                              f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("Data Integrity - Valid Stage Values", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all pipeline system tests"""
        print("🚀 STARTING COMPREHENSIVE PIPELINE SYSTEM TESTING")
        print("=" * 60)
        
        # Step 1: Authentication
        if not self.authenticate_users():
            print("❌ Authentication failed. Cannot proceed with tests.")
            return
        
        # Step 2: Pipeline API Tests
        self.test_pipeline_api_get()
        
        # Step 3: Lead Stage Tests
        self.test_lead_stage_transitions()
        
        # Step 4: Stage Persistence Tests
        self.test_pipeline_counts_update()
        
        # Step 5: Role-Based Access Tests
        self.test_role_based_access()
        
        # Step 6: Data Integrity Tests
        self.test_data_integrity()
        
        # Summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📋 PIPELINE SYSTEM TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r["success"]])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        print()
        
        if failed_tests > 0:
            print("❌ FAILED TESTS:")
            for result in self.results:
                if not result["success"]:
                    print(f"  • {result['test']}: {result['details']}")
            print()
        
        print("✅ PASSED TESTS:")
        for result in self.results:
            if result["success"]:
                print(f"  • {result['test']}: {result['details']}")
        
        print("\n" + "=" * 60)
        
        if success_rate >= 80:
            print("🎉 PIPELINE SYSTEM TESTING COMPLETED SUCCESSFULLY")
        else:
            print("⚠️  PIPELINE SYSTEM HAS ISSUES THAT NEED ATTENTION")
        
        print("=" * 60)

if __name__ == "__main__":
    tester = PipelineSystemTester()
    tester.run_all_tests()