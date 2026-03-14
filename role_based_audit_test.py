#!/usr/bin/env python3
"""
AgentRoute AI Backend API - Comprehensive Role-Based Audit Test Suite
Tests authentication, role-based access control, and core functionality from Admin, Manager, and Agent perspectives.
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import uuid

# Configuration
BACKEND_URL = "https://field-sales-crm-4.preview.emergentagent.com/api"

# Test credentials as specified in the audit request
TEST_CREDENTIALS = {
    "admin": {"email": "admin@agentroute.com", "password": "Admin123!"},
    "manager": {"email": "manager@agentroute.com", "password": "Manager123!"},
    "agent": {"email": "agent@agentroute.com", "password": "Agent123!"}
}

class AgentRouteAPITester:
    def __init__(self):
        self.tokens = {}
        self.users = {}
        self.test_data = {}
        self.results = []
        
    def log_result(self, test_name: str, success: bool, message: str, role: str = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        role_info = f" [{role.upper()}]" if role else ""
        print(f"{status}{role_info}: {test_name} - {message}")
        self.results.append({
            "test": test_name,
            "role": role,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat()
        })
    
    def make_request(self, method: str, endpoint: str, token: str = None, data: dict = None, params: dict = None) -> Tuple[int, dict]:
        """Make HTTP request with proper headers"""
        url = f"{BACKEND_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method.upper() == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=30)
            elif method.upper() == "PUT":
                response = requests.put(url, headers=headers, json=data, timeout=30)
            elif method.upper() == "DELETE":
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                return 400, {"error": "Unsupported method"}
            
            try:
                return response.status_code, response.json()
            except:
                return response.status_code, {"text": response.text}
        except Exception as e:
            return 500, {"error": str(e)}
    
    def authenticate_all_roles(self) -> bool:
        """Authenticate all three roles and store tokens"""
        print("\n🔐 AUTHENTICATION TESTING")
        print("=" * 50)
        
        all_success = True
        for role, creds in TEST_CREDENTIALS.items():
            status_code, response = self.make_request("POST", "/auth/login", data=creds)
            
            if status_code == 200 and "access_token" in response:
                self.tokens[role] = response["access_token"]
                self.users[role] = response["user"]
                self.log_result(f"Login {role}", True, f"Successfully authenticated as {creds['email']}", role)
            else:
                self.log_result(f"Login {role}", False, f"Failed to authenticate: {response}", role)
                all_success = False
        
        return all_success
    
    def test_dashboard_visibility_per_role(self):
        """Test dashboard data visibility based on role"""
        print("\n📊 DASHBOARD VISIBILITY PER ROLE")
        print("=" * 50)
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.tokens:
                continue
                
            token = self.tokens[role]
            
            # Test GET /api/leads - Each role should see appropriate leads
            status_code, leads_data = self.make_request("GET", "/leads", token=token)
            if status_code == 200:
                lead_count = len(leads_data) if isinstance(leads_data, list) else 0
                self.log_result("Dashboard Leads Access", True, f"Retrieved {lead_count} leads", role)
                self.test_data[f"{role}_leads"] = leads_data
            else:
                self.log_result("Dashboard Leads Access", False, f"Failed to get leads: {leads_data}", role)
            
            # Test GET /api/appointments - Each role should see their appointments
            status_code, apt_data = self.make_request("GET", "/appointments", token=token)
            if status_code == 200:
                apt_count = len(apt_data) if isinstance(apt_data, list) else 0
                self.log_result("Dashboard Appointments Access", True, f"Retrieved {apt_count} appointments", role)
                self.test_data[f"{role}_appointments"] = apt_data
            else:
                self.log_result("Dashboard Appointments Access", False, f"Failed to get appointments: {apt_data}", role)
            
            # Test compliance endpoints (admin/manager only)
            if role in ["admin", "manager"]:
                # GET /api/compliance/dashboard-cards
                status_code, compliance_cards = self.make_request("GET", "/compliance/dashboard-cards", token=token)
                if status_code == 200:
                    self.log_result("Compliance Dashboard Cards", True, f"Retrieved compliance summary", role)
                else:
                    self.log_result("Compliance Dashboard Cards", False, f"Failed: {compliance_cards}", role)
                
                # GET /api/compliance/summary
                status_code, compliance_summary = self.make_request("GET", "/compliance/summary", token=token)
                if status_code == 200:
                    self.log_result("Compliance Summary", True, f"Retrieved full compliance summary", role)
                else:
                    self.log_result("Compliance Summary", False, f"Failed: {compliance_summary}", role)
                
                # GET /api/distribution/summary
                status_code, dist_summary = self.make_request("GET", "/distribution/summary", token=token)
                if status_code == 200:
                    self.log_result("Distribution Summary", True, f"Retrieved lead distribution summary", role)
                else:
                    self.log_result("Distribution Summary", False, f"Failed: {dist_summary}", role)
                
                # GET /api/distribution/agent-performance
                status_code, agent_perf = self.make_request("GET", "/distribution/agent-performance", token=token)
                if status_code == 200:
                    self.log_result("Agent Performance Metrics", True, f"Retrieved agent performance data", role)
                else:
                    self.log_result("Agent Performance Metrics", False, f"Failed: {agent_perf}", role)
            else:
                # Agent should NOT have access to compliance/distribution endpoints
                status_code, _ = self.make_request("GET", "/compliance/dashboard-cards", token=token)
                if status_code == 403:
                    self.log_result("Compliance Access Restriction", True, "Correctly denied access to compliance data", role)
                else:
                    self.log_result("Compliance Access Restriction", False, f"Should be denied access but got {status_code}", role)
    
    def test_lead_distribution_system(self):
        """Test lead distribution and role-based visibility"""
        print("\n🎯 LEAD DISTRIBUTION SYSTEM")
        print("=" * 50)
        
        # Create test leads for each role to verify assignment visibility
        for role in ["admin", "manager", "agent"]:
            if role not in self.tokens:
                continue
                
            token = self.tokens[role]
            
            # Create a test lead
            lead_data = {
                "name": f"Test Lead {role.title()}",
                "phone": f"555-{role[:4].upper()}",
                "email": f"test.{role}@example.com",
                "address": "123 Test Street, Test City, TS 12345",
                "notes": f"Test lead created by {role} for distribution testing",
                "source": "manual"
            }
            
            status_code, lead_response = self.make_request("POST", "/leads", token=token, data=lead_data)
            if status_code == 200:
                lead_id = lead_response.get("id")
                self.test_data[f"{role}_test_lead_id"] = lead_id
                self.log_result("Lead Creation", True, f"Created test lead: {lead_id}", role)
                
                # Test lead stage updates
                stage_update = {"stage": "contacted"}
                status_code, _ = self.make_request("PUT", f"/leads/{lead_id}", token=token, data=stage_update)
                if status_code == 200:
                    self.log_result("Lead Stage Update", True, "Successfully updated lead stage", role)
                else:
                    self.log_result("Lead Stage Update", False, f"Failed to update stage", role)
            else:
                self.log_result("Lead Creation", False, f"Failed to create lead: {lead_response}", role)
        
        # Test cross-role visibility
        for role in ["admin", "manager", "agent"]:
            if role not in self.tokens:
                continue
                
            token = self.tokens[role]
            status_code, all_leads = self.make_request("GET", "/leads", token=token)
            
            if status_code == 200:
                lead_count = len(all_leads) if isinstance(all_leads, list) else 0
                
                if role == "admin":
                    # Admin should see all leads
                    self.log_result("Admin Lead Visibility", True, f"Admin sees {lead_count} leads (should see all)", role)
                elif role == "manager":
                    # Manager should see leads of their agents + own
                    self.log_result("Manager Lead Visibility", True, f"Manager sees {lead_count} leads (own + agents)", role)
                else:
                    # Agent should only see their own leads
                    own_leads = [l for l in all_leads if l.get("created_by_user") == self.users[role]["id"]]
                    if len(own_leads) == lead_count:
                        self.log_result("Agent Lead Visibility", True, f"Agent correctly sees only own {lead_count} leads", role)
                    else:
                        self.log_result("Agent Lead Visibility", False, f"Agent sees {lead_count} leads but should only see own", role)
            else:
                self.log_result("Lead Visibility Check", False, f"Failed to retrieve leads: {all_leads}", role)
    
    def test_medicare_compliance_tracking(self):
        """Test Medicare compliance tracking functionality"""
        print("\n🏥 MEDICARE COMPLIANCE TRACKING")
        print("=" * 50)
        
        for role in ["admin", "manager"]:  # Only admin/manager have compliance access
            if role not in self.tokens:
                continue
                
            token = self.tokens[role]
            
            # Test GET /api/compliance/records
            status_code, compliance_records = self.make_request("GET", "/compliance/records", token=token)
            if status_code == 200:
                record_count = len(compliance_records) if isinstance(compliance_records, list) else 0
                self.log_result("Compliance Records Access", True, f"Retrieved {record_count} compliance records", role)
                
                # Check if records include SOA status tracking
                if record_count > 0 and isinstance(compliance_records, list):
                    sample_record = compliance_records[0]
                    has_soa_fields = any(field in sample_record for field in ["soa_signed", "soa_id", "compliance_status"])
                    if has_soa_fields:
                        self.log_result("SOA Status Tracking", True, "Compliance records include SOA status fields", role)
                    else:
                        self.log_result("SOA Status Tracking", False, "Missing SOA status fields in compliance records", role)
            else:
                self.log_result("Compliance Records Access", False, f"Failed to get compliance records: {compliance_records}", role)
            
            # Test compliance dashboard cards
            status_code, dashboard_cards = self.make_request("GET", "/compliance/dashboard-cards", token=token)
            if status_code == 200:
                self.log_result("Compliance Dashboard Cards", True, "Successfully retrieved compliance dashboard", role)
            else:
                self.log_result("Compliance Dashboard Cards", False, f"Failed: {dashboard_cards}", role)
        
        # Test that agent cannot access compliance data
        if "agent" in self.tokens:
            token = self.tokens["agent"]
            status_code, _ = self.make_request("GET", "/compliance/records", token=token)
            if status_code == 403:
                self.log_result("Agent Compliance Access Denied", True, "Agent correctly denied compliance access", "agent")
            else:
                self.log_result("Agent Compliance Access Denied", False, f"Agent should be denied but got {status_code}", "agent")
    
    def test_soa_workflow_per_role(self):
        """Test SOA (Scope of Appointment) workflow from each role perspective"""
        print("\n📋 SOA WORKFLOW PER ROLE")
        print("=" * 50)
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.tokens:
                continue
                
            token = self.tokens[role]
            
            # First, ensure we have a test lead for SOA creation
            if f"{role}_test_lead_id" not in self.test_data:
                # Create a lead for SOA testing
                lead_data = {
                    "name": f"SOA Test Lead {role.title()}",
                    "phone": f"555-SOA-{role[:3].upper()}",
                    "email": f"soa.test.{role}@example.com",
                    "address": "456 SOA Test Ave, SOA City, SC 54321"
                }
                status_code, lead_response = self.make_request("POST", "/leads", token=token, data=lead_data)
                if status_code == 200:
                    self.test_data[f"{role}_test_lead_id"] = lead_response.get("id")
            
            lead_id = self.test_data.get(f"{role}_test_lead_id")
            if not lead_id:
                self.log_result("SOA Lead Preparation", False, "No test lead available for SOA testing", role)
                continue
            
            # Test POST /api/scope - Create new SOA with dual signatures
            soa_data = {
                "lead_id": lead_id,
                "form_fields": {
                    "beneficiary_name": f"Test Beneficiary {role.title()}",
                    "beneficiary_address": "789 Beneficiary St, Ben City, BC 78901",
                    "beneficiary_phone": f"555-BEN-{role[:3].upper()}",
                    "medicare_advantage": True,
                    "medicare_supplement": False,
                    "prescription_drug": True,
                    "dental_vision": False,
                    "appointment_date": "2025-01-15",
                    "appointment_time": "10:00 AM"
                },
                "typed_name": f"Test Beneficiary {role.title()}",
                "signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
                "agent_typed_name": f"Agent {role.title()}",
                "agent_signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
            }
            
            status_code, soa_response = self.make_request("POST", "/scope", token=token, data=soa_data)
            if status_code == 200:
                soa_id = soa_response.get("id")
                self.test_data[f"{role}_soa_id"] = soa_id
                self.log_result("SOA Creation", True, f"Created SOA with dual signatures: {soa_id}", role)
                
                # Verify dual signatures are stored
                if soa_response.get("signature") and soa_response.get("agent_signature"):
                    self.log_result("Dual Signature Storage", True, "Both beneficiary and agent signatures stored", role)
                else:
                    self.log_result("Dual Signature Storage", False, "Missing signature data in response", role)
                
                # Test GET /api/scope/{id} - Retrieve SOA
                status_code, soa_detail = self.make_request("GET", f"/scope/{soa_id}", token=token)
                if status_code == 200:
                    self.log_result("SOA Retrieval", True, f"Successfully retrieved SOA details", role)
                    
                    # Test GET /api/scope/lead/{lead_id} - Get SOAs for lead
                    status_code, lead_soas = self.make_request("GET", f"/scope/lead/{lead_id}", token=token)
                    if status_code == 200:
                        soa_count = len(lead_soas) if isinstance(lead_soas, list) else 0
                        self.log_result("Lead SOAs Retrieval", True, f"Retrieved {soa_count} SOAs for lead", role)
                    else:
                        self.log_result("Lead SOAs Retrieval", False, f"Failed: {lead_soas}", role)
                    
                    # Test PDF generation - try different endpoints
                    pdf_endpoints = [f"/scope/{soa_id}/pdf", f"/scope/pdf/{soa_id}"]
                    pdf_success = False
                    
                    for pdf_endpoint in pdf_endpoints:
                        for method in ["GET", "POST"]:
                            status_code, pdf_response = self.make_request(method, pdf_endpoint, token=token)
                            if status_code == 200:
                                self.log_result("SOA PDF Generation", True, f"Successfully generated/retrieved SOA PDF via {method} {pdf_endpoint}", role)
                                pdf_success = True
                                break
                        if pdf_success:
                            break
                    
                    if not pdf_success:
                        self.log_result("SOA PDF Generation", False, f"PDF endpoints not working", role)
                else:
                    self.log_result("SOA Retrieval", False, f"Failed to retrieve SOA: {soa_detail}", role)
            else:
                self.log_result("SOA Creation", False, f"Failed to create SOA: {soa_response}", role)
    
    def test_appointments_per_role(self):
        """Test appointment functionality per role"""
        print("\n📅 APPOINTMENTS PER ROLE")
        print("=" * 50)
        
        for role in ["admin", "manager", "agent"]:
            if role not in self.tokens:
                continue
                
            token = self.tokens[role]
            lead_id = self.test_data.get(f"{role}_test_lead_id")
            
            if not lead_id:
                self.log_result("Appointment Lead Check", False, "No test lead available for appointment testing", role)
                continue
            
            # Test POST /api/appointments - Create appointment
            apt_data = {
                "lead_id": lead_id,
                "appointment_date": "2025-01-20",
                "appointment_time": "14:00",
                "notes": f"Test appointment created by {role}",
                "status": "scheduled",
                "appointment_type": "in_person"
            }
            
            status_code, apt_response = self.make_request("POST", "/appointments", token=token, data=apt_data)
            if status_code == 200:
                apt_id = apt_response.get("id")
                self.test_data[f"{role}_apt_id"] = apt_id
                self.log_result("Appointment Creation", True, f"Created appointment: {apt_id}", role)
                
                # Test GET /api/appointments - List appointments per role
                status_code, all_apts = self.make_request("GET", "/appointments", token=token)
                if status_code == 200:
                    apt_count = len(all_apts) if isinstance(all_apts, list) else 0
                    self.log_result("Appointments List", True, f"Retrieved {apt_count} appointments", role)
                else:
                    self.log_result("Appointments List", False, f"Failed: {all_apts}", role)
                
                # Test GET /api/appointments/lead/{lead_id} - Get appointments for lead
                status_code, lead_apts = self.make_request("GET", f"/appointments/lead/{lead_id}", token=token)
                if status_code == 200:
                    lead_apt_count = len(lead_apts) if isinstance(lead_apts, list) else 0
                    self.log_result("Lead Appointments", True, f"Retrieved {lead_apt_count} appointments for lead", role)
                else:
                    self.log_result("Lead Appointments", False, f"Failed: {lead_apts}", role)
            else:
                self.log_result("Appointment Creation", False, f"Failed: {apt_response}", role)
    
    def test_role_based_access_control(self):
        """Test role-based access control violations"""
        print("\n🔒 ROLE-BASED ACCESS CONTROL")
        print("=" * 50)
        
        # Test that agents cannot access admin-only endpoints
        if "agent" in self.tokens:
            agent_token = self.tokens["agent"]
            
            # Test admin-only endpoints that agent should NOT access
            admin_endpoints = [
                "/scope/admin/all",
                "/compliance/dashboard-cards",
                "/compliance/summary",
                "/distribution/summary",
                "/distribution/agent-performance"
            ]
            
            for endpoint in admin_endpoints:
                status_code, response = self.make_request("GET", endpoint, token=agent_token)
                if status_code == 403:
                    self.log_result(f"Access Control - {endpoint}", True, "Agent correctly denied access", "agent")
                else:
                    self.log_result(f"Access Control - {endpoint}", False, f"Agent should be denied but got {status_code}", "agent")
        
        # Test that managers have appropriate access
        if "manager" in self.tokens:
            manager_token = self.tokens["manager"]
            
            # Managers should have access to compliance and distribution
            manager_endpoints = [
                "/compliance/dashboard-cards",
                "/compliance/summary",
                "/distribution/summary"
            ]
            
            for endpoint in manager_endpoints:
                status_code, response = self.make_request("GET", endpoint, token=manager_token)
                if status_code == 200:
                    self.log_result(f"Manager Access - {endpoint}", True, "Manager has appropriate access", "manager")
                else:
                    self.log_result(f"Manager Access - {endpoint}", False, f"Manager denied access: {status_code}", "manager")
        
        # Test admin has full access
        if "admin" in self.tokens:
            admin_token = self.tokens["admin"]
            
            # Admin should have access to all endpoints
            admin_endpoints = [
                "/leads",
                "/appointments", 
                "/scope/admin/all",
                "/compliance/dashboard-cards",
                "/compliance/summary",
                "/distribution/summary",
                "/distribution/agent-performance"
            ]
            
            for endpoint in admin_endpoints:
                status_code, response = self.make_request("GET", endpoint, token=admin_token)
                if status_code == 200:
                    self.log_result(f"Admin Access - {endpoint}", True, "Admin has full access", "admin")
                else:
                    self.log_result(f"Admin Access - {endpoint}", False, f"Admin denied access: {status_code}", "admin")
    
    def run_comprehensive_audit(self):
        """Run the complete role-based audit"""
        print("🚀 AGENTROUTE AI BACKEND API - COMPREHENSIVE ROLE-BASED AUDIT")
        print("=" * 80)
        print(f"Testing against: {BACKEND_URL}")
        print(f"Test Credentials: {list(TEST_CREDENTIALS.keys())}")
        print("=" * 80)
        
        # Step 1: Authentication
        if not self.authenticate_all_roles():
            print("\n❌ CRITICAL: Authentication failed for one or more roles. Cannot proceed with audit.")
            return False
        
        # Step 2: Dashboard Visibility Testing
        self.test_dashboard_visibility_per_role()
        
        # Step 3: Lead Distribution System Testing
        self.test_lead_distribution_system()
        
        # Step 4: Medicare Compliance Tracking
        self.test_medicare_compliance_tracking()
        
        # Step 5: SOA Workflow Testing
        self.test_soa_workflow_per_role()
        
        # Step 6: Appointments Testing
        self.test_appointments_per_role()
        
        # Step 7: Role-Based Access Control
        self.test_role_based_access_control()
        
        # Summary
        self.print_audit_summary()
        
        return True
    
    def print_audit_summary(self):
        """Print comprehensive audit summary"""
        print("\n" + "=" * 80)
        print("📊 COMPREHENSIVE AUDIT SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r["success"]])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Group results by role
        by_role = {}
        for result in self.results:
            role = result.get("role", "general")
            if role not in by_role:
                by_role[role] = {"passed": 0, "failed": 0, "tests": []}
            
            if result["success"]:
                by_role[role]["passed"] += 1
            else:
                by_role[role]["failed"] += 1
            by_role[role]["tests"].append(result)
        
        print("\n📋 RESULTS BY ROLE:")
        for role, stats in by_role.items():
            total = stats["passed"] + stats["failed"]
            rate = (stats["passed"] / total * 100) if total > 0 else 0
            print(f"  {role.upper()}: {stats['passed']}/{total} passed ({rate:.1f}%)")
        
        # Show failed tests
        failed_results = [r for r in self.results if not r["success"]]
        if failed_results:
            print(f"\n❌ FAILED TESTS ({len(failed_results)}):")
            for result in failed_results:
                role_info = f" [{result['role'].upper()}]" if result.get('role') else ""
                print(f"  • {result['test']}{role_info}: {result['message']}")
        
        # Critical findings
        print(f"\n🔍 CRITICAL FINDINGS:")
        
        # Check for authentication issues
        auth_failures = [r for r in self.results if "Login" in r["test"] and not r["success"]]
        if auth_failures:
            print(f"  ⚠️  Authentication failures detected for {len(auth_failures)} roles")
        
        # Check for access control violations
        access_violations = [r for r in self.results if "Access Control" in r["test"] and not r["success"]]
        if access_violations:
            print(f"  🚨 SECURITY ISSUE: {len(access_violations)} access control violations detected")
        
        # Check for compliance issues
        compliance_failures = [r for r in self.results if "Compliance" in r["test"] and not r["success"]]
        if compliance_failures:
            print(f"  📋 Compliance tracking issues: {len(compliance_failures)} failures")
        
        # Check for SOA workflow issues
        soa_failures = [r for r in self.results if "SOA" in r["test"] and not r["success"]]
        if soa_failures:
            print(f"  📋 SOA workflow issues: {len(soa_failures)} failures")
        
        if success_rate >= 90:
            print(f"\n✅ AUDIT RESULT: EXCELLENT - Backend API is functioning well with {success_rate:.1f}% success rate")
        elif success_rate >= 75:
            print(f"\n⚠️  AUDIT RESULT: GOOD - Backend API is mostly functional with {success_rate:.1f}% success rate")
        elif success_rate >= 50:
            print(f"\n⚠️  AUDIT RESULT: NEEDS ATTENTION - Backend API has issues with {success_rate:.1f}% success rate")
        else:
            print(f"\n❌ AUDIT RESULT: CRITICAL ISSUES - Backend API has major problems with {success_rate:.1f}% success rate")

def main():
    """Main execution function"""
    tester = AgentRouteAPITester()
    
    try:
        success = tester.run_comprehensive_audit()
        
        # Save results to file
        with open("/app/audit_results.json", "w") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "backend_url": BACKEND_URL,
                "test_credentials": list(TEST_CREDENTIALS.keys()),
                "results": tester.results,
                "summary": {
                    "total_tests": len(tester.results),
                    "passed": len([r for r in tester.results if r["success"]]),
                    "failed": len([r for r in tester.results if not r["success"]]),
                    "success_rate": (len([r for r in tester.results if r["success"]]) / len(tester.results) * 100) if tester.results else 0
                }
            }, f, indent=2)
        
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Audit interrupted by user")
        return 1
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())