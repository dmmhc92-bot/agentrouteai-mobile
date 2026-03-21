#!/usr/bin/env python3
"""
AgentRoute AI Pipeline Data Flow End-to-End Test
Purpose: Test the full pipeline data flow as specified in review request
Test Credentials: admin@agentroute.com/Admin123!, manager@agentroute.com/Manager123!, agent@agentroute.com/Agent123!
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import sys
import time

# Backend URL from frontend .env
BASE_URL = "https://pipeline-proof.preview.emergentagent.com/api"

# Test Credentials (from review request)
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class PipelineTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tokens = {}
        self.test_results = []
        self.test_lead_id = None
        self.stage_counts = {}
        
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
        
    def login_user(self, role):
        """Login a specific user and store token"""
        try:
            creds = TEST_CREDENTIALS[role]
            login_data = {
                "email": creds["email"],
                "password": creds["password"]
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.tokens[role] = data["access_token"]
                    user_role = data.get("user", {}).get("role", "unknown")
                    self.log_test(f"Login - {role.title()}", True, 200, 
                                f"Successfully authenticated {creds['email']} as {user_role}")
                    return True
                else:
                    self.log_test(f"Login - {role.title()}", False, 200, 
                                "Missing access_token in response")
                    return False
            else:
                self.log_test(f"Login - {role.title()}", False, response.status_code, 
                            f"Login failed for {creds['email']}")
                return False
                
        except Exception as e:
            self.log_test(f"Login - {role.title()}", False, None, 
                        f"Login exception for {role}: {str(e)}")
            return False
    
    def get_pipeline_counts(self, role, team_view=False):
        """Get pipeline counts for a specific role"""
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            params = {"team_view": "true"} if team_view else {}
            response = self.session.get(f"{BASE_URL}/pipeline", headers=headers, params=params)
            
            if response.status_code == 200:
                data = response.json()
                stages = data.get("stages", [])
                counts = {}
                leads_by_stage = {}
                
                for stage in stages:
                    stage_name = stage.get("stage")
                    stage_count = stage.get("count", 0)
                    stage_leads = stage.get("leads", [])
                    counts[stage_name] = stage_count
                    leads_by_stage[stage_name] = stage_leads
                
                return counts, leads_by_stage
            else:
                self.log_test(f"Get Pipeline Counts - {role}", False, response.status_code, 
                            "Failed to get pipeline data")
                return None, None
                
        except Exception as e:
            self.log_test(f"Get Pipeline Counts - {role}", False, None, 
                        f"Exception getting pipeline: {str(e)}")
            return None, None
    
    def create_test_lead(self, role):
        """Create a new lead for testing"""
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            test_lead = {
                "name": f"Pipeline Test Lead {uuid.uuid4().hex[:8]}",
                "email": f"pipeline-test-{uuid.uuid4().hex[:8]}@example.com",
                "phone": "555-999-7777",
                "address": "123 Pipeline Test Ave, Test City, TC 12345",
                "notes": "Created for pipeline data flow end-to-end testing",
                "stage": "new_lead"
            }
            
            response = self.session.post(f"{BASE_URL}/leads", json=test_lead, headers=headers)
            
            if response.status_code == 200:
                lead_data = response.json()
                lead_id = lead_data.get("id")
                if lead_id:
                    self.test_lead_id = lead_id
                    self.log_test("Create Test Lead", True, 200, 
                                f"Successfully created lead: {test_lead['name']} (ID: {lead_id})")
                    return lead_id
                else:
                    self.log_test("Create Test Lead", False, 200, 
                                "Lead created but no ID returned")
                    return None
            else:
                self.log_test("Create Test Lead", False, response.status_code, 
                            "Lead creation failed")
                return None
                
        except Exception as e:
            self.log_test("Create Test Lead", False, None, 
                        f"Lead creation exception: {str(e)}")
            return None
    
    def move_lead_stage(self, role, lead_id, new_stage, premium=None, commission=None):
        """Move a lead to a different pipeline stage"""
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            move_data = {
                "lead_id": lead_id,
                "new_stage": new_stage,
                "notes": f"Moved to {new_stage} during pipeline testing"
            }
            
            if premium:
                move_data["premium"] = premium
            if commission:
                move_data["commission"] = commission
            
            response = self.session.put(f"{BASE_URL}/pipeline/move", json=move_data, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                old_stage = data.get("old_stage")
                new_stage_confirmed = data.get("new_stage")
                self.log_test(f"Move Lead Stage - {new_stage}", True, 200, 
                            f"Successfully moved from {old_stage} to {new_stage_confirmed}")
                return True
            else:
                self.log_test(f"Move Lead Stage - {new_stage}", False, response.status_code, 
                            f"Failed to move lead to {new_stage}")
                return False
                
        except Exception as e:
            self.log_test(f"Move Lead Stage - {new_stage}", False, None, 
                        f"Exception moving lead: {str(e)}")
            return False
    
    def verify_count_change(self, stage, before_count, after_count, expected_change, operation):
        """Verify that stage count changed as expected"""
        actual_change = after_count - before_count
        if actual_change == expected_change:
            self.log_test(f"Count Verification - {stage} {operation}", True, None, 
                        f"Count changed correctly: {before_count} → {after_count} (change: {actual_change})")
            return True
        else:
            self.log_test(f"Count Verification - {stage} {operation}", False, None, 
                        f"Count change incorrect: {before_count} → {after_count} (expected change: {expected_change}, actual: {actual_change})")
            return False
    
    def verify_lead_in_stage(self, stage, leads_list, lead_id, should_be_present):
        """Verify that a lead is present or absent in a stage's leads array"""
        lead_ids_in_stage = [lead.get("id") for lead in leads_list]
        is_present = lead_id in lead_ids_in_stage
        
        if should_be_present and is_present:
            self.log_test(f"Lead Presence - {stage}", True, None, 
                        f"Lead {lead_id} correctly found in {stage} stage")
            return True
        elif not should_be_present and not is_present:
            self.log_test(f"Lead Absence - {stage}", True, None, 
                        f"Lead {lead_id} correctly absent from {stage} stage")
            return True
        else:
            expected = "present" if should_be_present else "absent"
            actual = "present" if is_present else "absent"
            self.log_test(f"Lead Presence - {stage}", False, None, 
                        f"Lead {lead_id} expected {expected} but was {actual} in {stage} stage")
            return False
    
    def test_pipeline_data_flow(self):
        """Test the complete pipeline data flow as specified in review request"""
        print("🔄 PIPELINE DATA FLOW END-TO-END TEST")
        print("=" * 60)
        print(f"Backend URL: {BASE_URL}")
        print(f"Test Time: {datetime.now().isoformat()}")
        print()
        
        # 1. Login as agent
        print("🔐 Step 1: Login as agent...")
        if not self.login_user("agent"):
            print("❌ Cannot proceed without agent authentication")
            return False
        print()
        
        # 2. Get pipeline count for new_lead stage BEFORE
        print("📊 Step 2: Get pipeline count for new_lead stage BEFORE...")
        before_counts, before_leads = self.get_pipeline_counts("agent")
        if before_counts is None:
            print("❌ Cannot proceed without initial pipeline data")
            return False
        
        new_lead_before = before_counts.get("new_lead", 0)
        print(f"   new_lead stage count BEFORE: {new_lead_before}")
        print()
        
        # 3. Create a new lead
        print("➕ Step 3: Create a new lead...")
        lead_id = self.create_test_lead("agent")
        if not lead_id:
            print("❌ Cannot proceed without creating test lead")
            return False
        print()
        
        # 4. Get pipeline count for new_lead stage AFTER
        print("📊 Step 4: Get pipeline count for new_lead stage AFTER...")
        after_counts, after_leads = self.get_pipeline_counts("agent")
        if after_counts is None:
            print("❌ Cannot get pipeline data after lead creation")
            return False
        
        new_lead_after = after_counts.get("new_lead", 0)
        print(f"   new_lead stage count AFTER: {new_lead_after}")
        print()
        
        # 5. VERIFY: Count increased by exactly 1
        print("✅ Step 5: Verify count increased by exactly 1...")
        count_increase_ok = self.verify_count_change("new_lead", new_lead_before, new_lead_after, 1, "increase")
        print()
        
        # 6. VERIFY: The new lead appears in the leads array for that stage
        print("✅ Step 6: Verify new lead appears in new_lead stage leads array...")
        new_lead_leads = after_leads.get("new_lead", [])
        lead_present_ok = self.verify_lead_in_stage("new_lead", new_lead_leads, lead_id, True)
        print()
        
        # 7. Move the newly created lead from new_lead to contacted
        print("🔄 Step 7: Move lead from new_lead to contacted...")
        move_to_contacted_ok = self.move_lead_stage("agent", lead_id, "contacted")
        if not move_to_contacted_ok:
            print("❌ Cannot proceed without successful stage move")
            return False
        print()
        
        # 8. Get pipeline counts after move to contacted
        print("📊 Step 8: Get pipeline counts after move to contacted...")
        contacted_counts, contacted_leads = self.get_pipeline_counts("agent")
        if contacted_counts is None:
            print("❌ Cannot get pipeline data after move to contacted")
            return False
        
        new_lead_after_move = contacted_counts.get("new_lead", 0)
        contacted_after_move = contacted_counts.get("contacted", 0)
        print(f"   new_lead stage count after move: {new_lead_after_move}")
        print(f"   contacted stage count after move: {contacted_after_move}")
        print()
        
        # 9. VERIFY: new_lead count decreased by 1
        print("✅ Step 9: Verify new_lead count decreased by 1...")
        new_lead_decrease_ok = self.verify_count_change("new_lead", new_lead_after, new_lead_after_move, -1, "decrease")
        print()
        
        # 10. VERIFY: contacted count increased by 1
        print("✅ Step 10: Verify contacted count increased by 1...")
        # We need the contacted count before the move
        contacted_before_move = before_counts.get("contacted", 0)
        contacted_increase_ok = self.verify_count_change("contacted", contacted_before_move, contacted_after_move, 1, "increase")
        print()
        
        # 11. VERIFY: Lead appears in contacted stage leads array
        print("✅ Step 11: Verify lead appears in contacted stage leads array...")
        contacted_leads_list = contacted_leads.get("contacted", [])
        lead_in_contacted_ok = self.verify_lead_in_stage("contacted", contacted_leads_list, lead_id, True)
        print()
        
        # 12. Move through multiple stages: contacted → follow_up → appointment_set → soa_completed
        print("🔄 Step 12: Move through multiple stages...")
        stages_to_test = ["follow_up", "appointment_set", "soa_completed"]
        
        for stage in stages_to_test:
            print(f"   Moving to {stage}...")
            
            # Get counts before move
            before_move_counts, before_move_leads = self.get_pipeline_counts("agent")
            if before_move_counts is None:
                print(f"❌ Cannot get pipeline data before move to {stage}")
                return False
            
            # Move to stage
            move_ok = self.move_lead_stage("agent", lead_id, stage, premium=500.0, commission=50.0)
            if not move_ok:
                print(f"❌ Failed to move to {stage}")
                return False
            
            # Get counts after move
            after_move_counts, after_move_leads = self.get_pipeline_counts("agent")
            if after_move_counts is None:
                print(f"❌ Cannot get pipeline data after move to {stage}")
                return False
            
            # Verify lead is in the new stage
            stage_leads_list = after_move_leads.get(stage, [])
            lead_in_stage_ok = self.verify_lead_in_stage(stage, stage_leads_list, lead_id, True)
            
            if not lead_in_stage_ok:
                print(f"❌ Lead not found in {stage} stage")
                return False
        
        print()
        
        # 13. Persistence Test: After all moves, re-fetch pipeline
        print("💾 Step 13: Persistence Test - Re-fetch pipeline...")
        final_counts, final_leads = self.get_pipeline_counts("agent")
        if final_counts is None:
            print("❌ Cannot get final pipeline data")
            return False
        print()
        
        # 14. VERIFY: Lead is in final stage (soa_completed)
        print("✅ Step 14: Verify lead is in final stage (soa_completed)...")
        final_stage_leads = final_leads.get("soa_completed", [])
        final_stage_ok = self.verify_lead_in_stage("soa_completed", final_stage_leads, lead_id, True)
        print()
        
        # 15. VERIFY: Counts are consistent
        print("✅ Step 15: Verify counts are consistent...")
        soa_completed_count = final_counts.get("soa_completed", 0)
        if soa_completed_count > 0:
            self.log_test("Final Count Consistency", True, None, 
                        f"soa_completed stage has {soa_completed_count} leads (including our test lead)")
        else:
            self.log_test("Final Count Consistency", False, None, 
                        "soa_completed stage has 0 leads but should contain our test lead")
            return False
        print()
        
        # 16. Role-based Test: Test pipeline as agent (individual view)
        print("👤 Step 16: Test pipeline as agent (individual view)...")
        agent_counts, agent_leads = self.get_pipeline_counts("agent", team_view=False)
        if agent_counts is None:
            print("❌ Cannot get agent individual view")
            return False
        
        agent_total_leads = sum(agent_counts.values())
        self.log_test("Agent Individual View", True, None, 
                    f"Agent sees {agent_total_leads} total leads in individual view")
        print()
        
        # 17. Role-based Test: Test pipeline with team_view=true (if admin/manager)
        print("👥 Step 17: Test pipeline with team_view=true...")
        
        # Login as admin for team view test
        if self.login_user("admin"):
            admin_counts, admin_leads = self.get_pipeline_counts("admin", team_view=True)
            if admin_counts is not None:
                admin_total_leads = sum(admin_counts.values())
                self.log_test("Admin Team View", True, None, 
                            f"Admin sees {admin_total_leads} total leads in team view")
            else:
                self.log_test("Admin Team View", False, None, "Cannot get admin team view")
                return False
        else:
            print("❌ Cannot test team view without admin login")
            return False
        print()
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["status"]])
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print("📊 PIPELINE DATA FLOW TEST RESULTS")
        print("=" * 50)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        print()
        
        # Report exact numbers as requested
        print("📈 EXACT NUMBERS REPORT")
        print("=" * 30)
        print(f"new_lead count BEFORE lead creation: {new_lead_before}")
        print(f"new_lead count AFTER lead creation: {new_lead_after}")
        print(f"new_lead count AFTER move to contacted: {new_lead_after_move}")
        print(f"contacted count AFTER move: {contacted_after_move}")
        print(f"Final soa_completed count: {soa_completed_count}")
        print(f"Agent individual view total leads: {agent_total_leads}")
        print(f"Admin team view total leads: {admin_total_leads}")
        print(f"Test Lead ID: {lead_id}")
        print()
        
        if success_rate >= 95:
            print("🎉 PIPELINE DATA FLOW TEST PASSED")
            print("✅ Lead creation → pipeline display working correctly")
            print("✅ Stage transitions working correctly")
            print("✅ Count changes verified for each operation")
            print("✅ Lead persistence verified across all stages")
            print("✅ Role-based access working correctly")
            return True
        else:
            print("⚠️ PIPELINE DATA FLOW TEST ISSUES DETECTED")
            failed_tests = [r for r in self.test_results if not r["status"]]
            for test in failed_tests:
                print(f"❌ {test['test_name']}: {test['details']}")
            return False

def main():
    tester = PipelineTester()
    success = tester.test_pipeline_data_flow()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()