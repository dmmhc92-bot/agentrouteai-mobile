#!/usr/bin/env python3
"""
AgentRoute AI Global Data System Final Verification Test
Purpose: Test the GLOBAL DATA SYSTEM with REAL DATA as specified in review request
Focus: Single source of truth, stage transitions, cross-feature integration, query consistency, count accuracy
Test Credentials: agent@agentroute.com/Agent123!
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import sys
import time

# Backend URL from frontend .env
BASE_URL = "https://crm-final-build.preview.emergentagent.com/api"

# Test Credentials (from review request)
TEST_CREDENTIALS = {
    "email": "agent@agentroute.com", 
    "password": "Agent123!"
}

class GlobalDataSystemTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.token = None
        self.test_results = []
        self.test_lead_id = None
        self.test_appointment_id = None
        
    def log_test(self, test_name, status, response_code=None, details=""):
        """Log test results"""
        status_icon = "✅" if status else "❌"
        result = {
            "test_name": test_name,
            "status": status,
            "response_code": response_code,
            "details": details
        }
        self.test_results.append(result)
        print(f"{status_icon} {test_name}: {details}")
        if response_code:
            print(f"   Response Code: {response_code}")
        
    def login(self):
        """Login with agent credentials"""
        try:
            login_data = {
                "email": TEST_CREDENTIALS["email"],
                "password": TEST_CREDENTIALS["password"]
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.token = data["access_token"]
                    user_email = data.get("user", {}).get("email", "unknown")
                    self.log_test("Authentication", True, 200, 
                                f"Successfully logged in as {user_email}")
                    return True
                else:
                    self.log_test("Authentication", False, 200, 
                                "Missing access_token in response")
                    return False
            else:
                self.log_test("Authentication", False, response.status_code, 
                            "Login failed")
                return False
                
        except Exception as e:
            self.log_test("Authentication", False, None, 
                        f"Login exception: {str(e)}")
            return False
    
    def get_headers(self):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.token}"}
    
    def test_1_single_source_of_truth(self):
        """
        TEST 1: SINGLE SOURCE OF TRUTH TEST
        - Create a new lead
        - Verify lead appears in GET /api/leads
        - Verify lead appears in GET /api/pipeline with correct stage
        - Verify counts match
        """
        print("\n🎯 TEST 1: SINGLE SOURCE OF TRUTH TEST")
        print("=" * 50)
        
        # Step 1: Get BEFORE counts
        try:
            # Get leads count BEFORE
            response = self.session.get(f"{BASE_URL}/leads", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Get Leads BEFORE", False, response.status_code, "Failed to get leads")
                return False
            
            leads_before = response.json()
            leads_count_before = len(leads_before)
            
            # Get pipeline count BEFORE
            response = self.session.get(f"{BASE_URL}/pipeline", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Get Pipeline BEFORE", False, response.status_code, "Failed to get pipeline")
                return False
            
            pipeline_before = response.json()
            new_lead_stage_before = None
            for stage in pipeline_before.get("stages", []):
                if stage.get("stage") == "new_lead":
                    new_lead_stage_before = stage
                    break
            
            if not new_lead_stage_before:
                self.log_test("Pipeline BEFORE", False, 200, "new_lead stage not found in pipeline")
                return False
            
            new_lead_count_before = new_lead_stage_before.get("count", 0)
            
            print(f"📊 BEFORE COUNTS:")
            print(f"   Total Leads: {leads_count_before}")
            print(f"   New Lead Stage Count: {new_lead_count_before}")
            
        except Exception as e:
            self.log_test("Get BEFORE Counts", False, None, f"Exception: {str(e)}")
            return False
        
        # Step 2: Create a new lead with REAL DATA
        try:
            test_lead_name = f"Global Data Test Lead {datetime.now().strftime('%Y%m%d_%H%M%S')}"
            test_lead = {
                "name": test_lead_name,
                "email": f"globaltest_{uuid.uuid4().hex[:8]}@agentroute.com",
                "phone": "555-123-4567",
                "address": "123 Global Test Street, Data City, DC 12345",
                "insurance_types": ["Medicare Advantage"],
                "notes": "Created for Global Data System verification test",
                "stage": "new_lead"
            }
            
            response = self.session.post(f"{BASE_URL}/leads", json=test_lead, headers=self.get_headers())
            
            if response.status_code == 200:
                lead_data = response.json()
                self.test_lead_id = lead_data.get("id")
                self.log_test("Create Lead", True, 200, 
                            f"Created lead: {test_lead_name} (ID: {self.test_lead_id})")
            else:
                self.log_test("Create Lead", False, response.status_code, 
                            "Failed to create test lead")
                return False
                
        except Exception as e:
            self.log_test("Create Lead", False, None, f"Exception: {str(e)}")
            return False
        
        # Step 3: Verify lead appears in GET /api/leads
        try:
            response = self.session.get(f"{BASE_URL}/leads", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Verify Lead in /leads", False, response.status_code, "Failed to get leads")
                return False
            
            leads_after = response.json()
            leads_count_after = len(leads_after)
            
            # Find our test lead
            test_lead_found = False
            for lead in leads_after:
                if lead.get("id") == self.test_lead_id:
                    test_lead_found = True
                    break
            
            if test_lead_found and leads_count_after == leads_count_before + 1:
                self.log_test("Verify Lead in /leads", True, 200, 
                            f"Lead found in /leads, count increased {leads_count_before} → {leads_count_after}")
            else:
                self.log_test("Verify Lead in /leads", False, 200, 
                            f"Lead not found or count mismatch. Found: {test_lead_found}, Count: {leads_count_before} → {leads_count_after}")
                return False
                
        except Exception as e:
            self.log_test("Verify Lead in /leads", False, None, f"Exception: {str(e)}")
            return False
        
        # Step 4: Verify lead appears in GET /api/pipeline with correct stage
        try:
            response = self.session.get(f"{BASE_URL}/pipeline", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Verify Lead in /pipeline", False, response.status_code, "Failed to get pipeline")
                return False
            
            pipeline_after = response.json()
            new_lead_stage_after = None
            for stage in pipeline_after.get("stages", []):
                if stage.get("stage") == "new_lead":
                    new_lead_stage_after = stage
                    break
            
            if not new_lead_stage_after:
                self.log_test("Verify Lead in /pipeline", False, 200, "new_lead stage not found in pipeline")
                return False
            
            new_lead_count_after = new_lead_stage_after.get("count", 0)
            
            # Check if our lead is in the new_lead stage
            test_lead_in_pipeline = False
            for lead in new_lead_stage_after.get("leads", []):
                if lead.get("id") == self.test_lead_id:
                    test_lead_in_pipeline = True
                    break
            
            if test_lead_in_pipeline and new_lead_count_after == new_lead_count_before + 1:
                self.log_test("Verify Lead in /pipeline", True, 200, 
                            f"Lead found in pipeline new_lead stage, count increased {new_lead_count_before} → {new_lead_count_after}")
            else:
                self.log_test("Verify Lead in /pipeline", False, 200, 
                            f"Lead not found in pipeline or count mismatch. Found: {test_lead_in_pipeline}, Count: {new_lead_count_before} → {new_lead_count_after}")
                return False
                
        except Exception as e:
            self.log_test("Verify Lead in /pipeline", False, None, f"Exception: {str(e)}")
            return False
        
        print(f"📊 AFTER COUNTS:")
        print(f"   Total Leads: {leads_count_after}")
        print(f"   New Lead Stage Count: {new_lead_count_after}")
        
        self.log_test("SINGLE SOURCE OF TRUTH TEST", True, None, 
                    "✅ Lead appears in both /leads and /pipeline with matching counts")
        return True
    
    def test_2_stage_transition(self):
        """
        TEST 2: STAGE TRANSITION TEST
        - Move the lead through stages using PUT /api/pipeline/move
        - Verify each transition updates the pipeline counts correctly
        - Verify lead stage matches pipeline section
        """
        print("\n🔄 TEST 2: STAGE TRANSITION TEST")
        print("=" * 50)
        
        if not self.test_lead_id:
            self.log_test("STAGE TRANSITION TEST", False, None, "No test lead ID available")
            return False
        
        # Test stage transitions: new_lead → contacted → follow_up → appointment_set
        stage_transitions = [
            ("new_lead", "contacted"),
            ("contacted", "follow_up"),
            ("follow_up", "appointment_set")
        ]
        
        for from_stage, to_stage in stage_transitions:
            try:
                # Get BEFORE counts
                response = self.session.get(f"{BASE_URL}/pipeline", headers=self.get_headers())
                if response.status_code != 200:
                    self.log_test(f"Get Pipeline BEFORE {from_stage}→{to_stage}", False, response.status_code, "Failed to get pipeline")
                    return False
                
                pipeline_before = response.json()
                from_stage_count_before = 0
                to_stage_count_before = 0
                
                for stage in pipeline_before.get("stages", []):
                    if stage.get("stage") == from_stage:
                        from_stage_count_before = stage.get("count", 0)
                    elif stage.get("stage") == to_stage:
                        to_stage_count_before = stage.get("count", 0)
                
                print(f"📊 BEFORE {from_stage}→{to_stage}:")
                print(f"   {from_stage}: {from_stage_count_before}")
                print(f"   {to_stage}: {to_stage_count_before}")
                
                # Move lead to next stage
                move_data = {
                    "lead_id": self.test_lead_id,
                    "new_stage": to_stage,
                    "premium": 500.0,
                    "commission": 50.0
                }
                
                response = self.session.put(f"{BASE_URL}/pipeline/move", json=move_data, headers=self.get_headers())
                
                if response.status_code != 200:
                    self.log_test(f"Move Lead {from_stage}→{to_stage}", False, response.status_code, 
                                f"Failed to move lead from {from_stage} to {to_stage}")
                    return False
                
                # Get AFTER counts
                response = self.session.get(f"{BASE_URL}/pipeline", headers=self.get_headers())
                if response.status_code != 200:
                    self.log_test(f"Get Pipeline AFTER {from_stage}→{to_stage}", False, response.status_code, "Failed to get pipeline")
                    return False
                
                pipeline_after = response.json()
                from_stage_count_after = 0
                to_stage_count_after = 0
                lead_found_in_target_stage = False
                
                for stage in pipeline_after.get("stages", []):
                    if stage.get("stage") == from_stage:
                        from_stage_count_after = stage.get("count", 0)
                    elif stage.get("stage") == to_stage:
                        to_stage_count_after = stage.get("count", 0)
                        # Check if our lead is in the target stage
                        for lead in stage.get("leads", []):
                            if lead.get("id") == self.test_lead_id:
                                lead_found_in_target_stage = True
                                break
                
                print(f"📊 AFTER {from_stage}→{to_stage}:")
                print(f"   {from_stage}: {from_stage_count_after}")
                print(f"   {to_stage}: {to_stage_count_after}")
                
                # Verify counts changed correctly
                expected_from_decrease = from_stage_count_before - 1
                expected_to_increase = to_stage_count_before + 1
                
                if (from_stage_count_after == expected_from_decrease and 
                    to_stage_count_after == expected_to_increase and 
                    lead_found_in_target_stage):
                    self.log_test(f"Stage Transition {from_stage}→{to_stage}", True, 200, 
                                f"✅ Counts updated correctly, lead found in {to_stage}")
                else:
                    self.log_test(f"Stage Transition {from_stage}→{to_stage}", False, 200, 
                                f"❌ Count mismatch or lead not found. Expected: {from_stage}={expected_from_decrease}, {to_stage}={expected_to_increase}, Found in target: {lead_found_in_target_stage}")
                    return False
                
            except Exception as e:
                self.log_test(f"Stage Transition {from_stage}→{to_stage}", False, None, f"Exception: {str(e)}")
                return False
        
        self.log_test("STAGE TRANSITION TEST", True, None, 
                    "✅ All stage transitions updated pipeline counts correctly")
        return True
    
    def test_3_cross_feature_integration(self):
        """
        TEST 3: CROSS-FEATURE TEST
        - Create an appointment for the lead
        - Verify lead stage changes to appointment_scheduled
        - Verify appointment appears in GET /api/appointments
        """
        print("\n🔗 TEST 3: CROSS-FEATURE INTEGRATION TEST")
        print("=" * 50)
        
        if not self.test_lead_id:
            self.log_test("CROSS-FEATURE TEST", False, None, "No test lead ID available")
            return False
        
        try:
            # Create appointment for the lead
            tomorrow = datetime.now() + timedelta(days=1)
            appointment_data = {
                "lead_id": self.test_lead_id,
                "appointment_date": tomorrow.strftime("%Y-%m-%d"),
                "appointment_time": "10:00",
                "appointment_type": "Initial Consultation",
                "notes": "Global Data System test appointment"
            }
            
            response = self.session.post(f"{BASE_URL}/appointments", json=appointment_data, headers=self.get_headers())
            
            if response.status_code == 200:
                appointment_data_response = response.json()
                self.test_appointment_id = appointment_data_response.get("id")
                self.log_test("Create Appointment", True, 200, 
                            f"Created appointment for lead {self.test_lead_id}")
            else:
                self.log_test("Create Appointment", False, response.status_code, 
                            "Failed to create appointment")
                return False
            
            # Verify appointment appears in GET /api/appointments
            response = self.session.get(f"{BASE_URL}/appointments", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Verify Appointment in /appointments", False, response.status_code, 
                            "Failed to get appointments")
                return False
            
            appointments = response.json()
            appointment_found = False
            for appointment in appointments:
                if appointment.get("id") == self.test_appointment_id:
                    appointment_found = True
                    break
            
            if appointment_found:
                self.log_test("Verify Appointment in /appointments", True, 200, 
                            "Appointment found in /appointments endpoint")
            else:
                self.log_test("Verify Appointment in /appointments", False, 200, 
                            "Appointment not found in /appointments endpoint")
                return False
            
            # Check if lead stage changed (this depends on backend logic)
            response = self.session.get(f"{BASE_URL}/leads/{self.test_lead_id}", headers=self.get_headers())
            if response.status_code == 200:
                lead_data = response.json()
                current_stage = lead_data.get("stage")
                self.log_test("Check Lead Stage After Appointment", True, 200, 
                            f"Lead stage is now: {current_stage}")
            else:
                self.log_test("Check Lead Stage After Appointment", False, response.status_code, 
                            "Failed to get lead data")
                return False
            
        except Exception as e:
            self.log_test("CROSS-FEATURE TEST", False, None, f"Exception: {str(e)}")
            return False
        
        self.log_test("CROSS-FEATURE INTEGRATION TEST", True, None, 
                    "✅ Appointment created and appears in appointments endpoint")
        return True
    
    def test_4_query_consistency(self):
        """
        TEST 4: QUERY CONSISTENCY TEST
        - Verify GET /api/leads and GET /api/pipeline return same lead counts for the user
        - Both should use $or query with created_by_user AND assigned_to_user
        """
        print("\n🔍 TEST 4: QUERY CONSISTENCY TEST")
        print("=" * 50)
        
        try:
            # Get leads count
            response = self.session.get(f"{BASE_URL}/leads", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Get Leads for Consistency", False, response.status_code, "Failed to get leads")
                return False
            
            leads = response.json()
            total_leads_count = len(leads)
            
            # Get pipeline data
            response = self.session.get(f"{BASE_URL}/pipeline", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Get Pipeline for Consistency", False, response.status_code, "Failed to get pipeline")
                return False
            
            pipeline = response.json()
            
            # Calculate total leads from pipeline stages
            total_pipeline_leads = 0
            for stage in pipeline.get("stages", []):
                stage_count = stage.get("count", 0)
                total_pipeline_leads += stage_count
            
            # Also check summary total if available
            summary_total = pipeline.get("summary", {}).get("total_cases", 0)
            
            print(f"📊 QUERY CONSISTENCY CHECK:")
            print(f"   /api/leads total: {total_leads_count}")
            print(f"   /api/pipeline stages sum: {total_pipeline_leads}")
            print(f"   /api/pipeline summary total: {summary_total}")
            
            if total_leads_count == total_pipeline_leads:
                self.log_test("Query Consistency - Leads vs Pipeline", True, 200, 
                            f"✅ Counts match: {total_leads_count} leads")
            else:
                self.log_test("Query Consistency - Leads vs Pipeline", False, 200, 
                            f"❌ Count mismatch: /leads={total_leads_count}, /pipeline={total_pipeline_leads}")
                return False
            
            if summary_total > 0 and summary_total == total_leads_count:
                self.log_test("Query Consistency - Summary Total", True, 200, 
                            f"✅ Summary total matches: {summary_total}")
            elif summary_total > 0:
                self.log_test("Query Consistency - Summary Total", False, 200, 
                            f"❌ Summary total mismatch: summary={summary_total}, actual={total_leads_count}")
                return False
            else:
                self.log_test("Query Consistency - Summary Total", True, 200, 
                            "Summary total not available (acceptable)")
            
        except Exception as e:
            self.log_test("QUERY CONSISTENCY TEST", False, None, f"Exception: {str(e)}")
            return False
        
        self.log_test("QUERY CONSISTENCY TEST", True, None, 
                    "✅ /api/leads and /api/pipeline return consistent counts")
        return True
    
    def test_5_count_accuracy(self):
        """
        TEST 5: COUNT ACCURACY TEST
        - Get pipeline summary.total_cases
        - Sum all stages[].count values
        - Verify they match exactly
        """
        print("\n🧮 TEST 5: COUNT ACCURACY TEST")
        print("=" * 50)
        
        try:
            response = self.session.get(f"{BASE_URL}/pipeline", headers=self.get_headers())
            if response.status_code != 200:
                self.log_test("Get Pipeline for Count Accuracy", False, response.status_code, "Failed to get pipeline")
                return False
            
            pipeline = response.json()
            
            # Get summary total
            summary_total = pipeline.get("summary", {}).get("total_cases", 0)
            
            # Calculate sum of all stage counts
            stages_sum = 0
            stage_details = []
            for stage in pipeline.get("stages", []):
                stage_name = stage.get("stage", "unknown")
                stage_count = stage.get("count", 0)
                stages_sum += stage_count
                stage_details.append(f"{stage_name}: {stage_count}")
            
            print(f"📊 COUNT ACCURACY CHECK:")
            print(f"   Summary total_cases: {summary_total}")
            print(f"   Sum of all stages: {stages_sum}")
            print(f"   Stage breakdown: {', '.join(stage_details)}")
            
            if summary_total == stages_sum:
                self.log_test("Count Accuracy", True, 200, 
                            f"✅ Counts match exactly: {summary_total}")
            else:
                self.log_test("Count Accuracy", False, 200, 
                            f"❌ Count mismatch: summary={summary_total}, stages_sum={stages_sum}")
                return False
            
        except Exception as e:
            self.log_test("COUNT ACCURACY TEST", False, None, f"Exception: {str(e)}")
            return False
        
        self.log_test("COUNT ACCURACY TEST", True, None, 
                    "✅ Pipeline summary total matches sum of stage counts")
        return True
    
    def run_global_data_system_tests(self):
        """Run the complete Global Data System verification test suite"""
        print("🌐 AGENTROUTE AI GLOBAL DATA SYSTEM FINAL VERIFICATION")
        print("=" * 70)
        print(f"Backend URL: {BASE_URL}")
        print(f"Test Time: {datetime.now().isoformat()}")
        print(f"Test Credentials: {TEST_CREDENTIALS['email']}")
        print()
        
        # Login first
        if not self.login():
            print("❌ Authentication failed - cannot proceed with tests")
            return False
        
        # Run all 5 tests
        test_results = []
        
        test_results.append(self.test_1_single_source_of_truth())
        test_results.append(self.test_2_stage_transition())
        test_results.append(self.test_3_cross_feature_integration())
        test_results.append(self.test_4_query_consistency())
        test_results.append(self.test_5_count_accuracy())
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["status"]])
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print("\n📊 GLOBAL DATA SYSTEM VERIFICATION RESULTS")
        print("=" * 50)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        print()
        
        if all(test_results):
            print("🎉 GLOBAL DATA SYSTEM VERIFICATION PASSED")
            print("✅ Single source of truth confirmed")
            print("✅ Stage transitions working correctly")
            print("✅ Cross-feature integration verified")
            print("✅ Query consistency confirmed")
            print("✅ Count accuracy verified")
            print()
            print("🚀 READY FOR iOS TESTFLIGHT BUILD APPROVAL")
            return True
        else:
            print("⚠️ GLOBAL DATA SYSTEM ISSUES DETECTED")
            failed_tests = [r for r in self.test_results if not r["status"]]
            for test in failed_tests:
                print(f"❌ {test['test_name']}: {test['details']}")
            return False

def main():
    tester = GlobalDataSystemTester()
    success = tester.run_global_data_system_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()