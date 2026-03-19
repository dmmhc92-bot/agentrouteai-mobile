#!/usr/bin/env python3
"""
Comprehensive test suite for AgentRoute AI Offline Lead Capture and Auto Sync system.

Tests the following endpoints:
1. POST /api/leads/offline - Offline Lead Creation
2. POST /api/leads/offline (duplicate temp_id) - Duplicate Prevention 
3. PUT /api/leads/{id}/offline - Offline Lead Update
4. POST /api/leads - Normal Lead Creation (regression)
5. GET /api/leads - Lead Retrieval (regression)
6. POST /api/auth/login - Auth Test (regression)

Backend URL: https://app-store-ready-26.preview.emergentagent.com/api
Test Credentials:
- Admin: admin@agentroute.com / Admin123!
- Agent: agent@agentroute.com / Agent123!
"""

import asyncio
import aiohttp
import json
import time
import uuid
from datetime import datetime, timezone
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

BASE_URL = "https://app-store-ready-26.preview.emergentagent.com/api"

class OfflineLeadTester:
    def __init__(self):
        self.session = None
        self.admin_token = None
        self.agent_token = None
        self.test_results = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30))
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def make_request(self, method, endpoint, data=None, headers=None, expected_status=200):
        """Make HTTP request with error handling"""
        url = f"{BASE_URL}{endpoint}"
        
        try:
            async with self.session.request(method, url, json=data, headers=headers) as response:
                response_text = await response.text()
                
                try:
                    response_data = json.loads(response_text) if response_text else {}
                except json.JSONDecodeError:
                    response_data = {"raw_response": response_text}
                
                logger.info(f"{method} {endpoint} -> {response.status}")
                
                if response.status == expected_status:
                    return True, response_data, response.status
                else:
                    logger.error(f"Expected {expected_status}, got {response.status}: {response_data}")
                    return False, response_data, response.status
                    
        except asyncio.TimeoutError:
            logger.error(f"Request timeout for {method} {endpoint}")
            return False, {"error": "timeout"}, 0
        except Exception as e:
            logger.error(f"Request failed for {method} {endpoint}: {str(e)}")
            return False, {"error": str(e)}, 0
    
    def log_test_result(self, test_name, success, details=""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        logger.info(f"{status}: {test_name}")
        if details:
            logger.info(f"  Details: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
    
    async def test_auth_login(self, email, password, role="admin"):
        """Test authentication endpoint"""
        test_name = f"Auth Login - {role} ({email})"
        
        success, response_data, status_code = await self.make_request(
            "POST", "/auth/login",
            data={"email": email, "password": password},
            expected_status=200
        )
        
        if success and "access_token" in response_data:
            token = response_data["access_token"]
            user_role = response_data.get("user", {}).get("role", "unknown")
            
            if role == "admin":
                self.admin_token = token
            elif role == "agent":
                self.agent_token = token
            
            self.log_test_result(test_name, True, f"Token received, role: {user_role}")
            return token
        else:
            self.log_test_result(test_name, False, f"Status: {status_code}, Response: {response_data}")
            return None
    
    async def test_offline_lead_creation(self, token, temp_id=None):
        """Test offline lead creation with temp_id for duplicate prevention"""
        test_name = "Offline Lead Creation"
        
        if temp_id is None:
            temp_id = f"test_temp_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        
        lead_data = {
            "name": "Backend Test Lead",
            "phone": "123-456-7890", 
            "email": "test@example.com",
            "address": "123 Test St, Test City, TS 12345",
            "notes": "Created via offline lead test",
            "source": "test",
            "temp_id": temp_id
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        
        success, response_data, status_code = await self.make_request(
            "POST", "/leads/offline",
            data=lead_data,
            headers=headers,
            expected_status=200
        )
        
        if success and "id" in response_data:
            lead_id = response_data["id"]
            lead_name = response_data.get("name", "Unknown")
            self.log_test_result(test_name, True, f"Lead created: ID={lead_id}, Name={lead_name}, temp_id={temp_id}")
            return lead_id, temp_id
        else:
            self.log_test_result(test_name, False, f"Status: {status_code}, Response: {response_data}")
            return None, temp_id
    
    async def test_duplicate_prevention(self, token, temp_id):
        """Test duplicate prevention when using same temp_id"""
        test_name = "Duplicate Prevention - Same temp_id"
        
        # Try to create another lead with the same temp_id
        lead_data = {
            "name": "Duplicate Test Lead",
            "phone": "999-888-7777",
            "temp_id": temp_id  # Same temp_id as previous test
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        
        success, response_data, status_code = await self.make_request(
            "POST", "/leads/offline",
            data=lead_data,
            headers=headers,
            expected_status=409  # Expecting conflict
        )
        
        if status_code == 409:
            error_message = response_data.get("detail", "")
            self.log_test_result(test_name, True, f"Correctly returned 409 Conflict: {error_message}")
            return True
        elif status_code == 200:
            # Check if it returned existing lead
            existing_name = response_data.get("name", "")
            if existing_name == "Backend Test Lead":  # Original lead name
                self.log_test_result(test_name, True, f"Returned existing lead (200): {existing_name}")
                return True
            else:
                self.log_test_result(test_name, False, f"Created new lead instead of duplicate prevention: {response_data}")
                return False
        else:
            self.log_test_result(test_name, False, f"Unexpected status: {status_code}, Response: {response_data}")
            return False
    
    async def test_offline_lead_update(self, token, lead_id):
        """Test offline lead update with conflict detection"""
        test_name = "Offline Lead Update"
        
        # Create update with temp_id and offline timestamp
        update_temp_id = f"update_temp_{int(time.time())}"
        offline_timestamp = datetime.now(timezone.utc).isoformat()
        
        update_data = {
            "name": "Updated Backend Test Lead",
            "phone": "555-123-4567",
            "notes": "Updated via offline sync",
            "temp_id": update_temp_id,
            "offline_timestamp": offline_timestamp
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        
        success, response_data, status_code = await self.make_request(
            "PUT", f"/leads/{lead_id}/offline",
            data=update_data,
            headers=headers,
            expected_status=200
        )
        
        if success and response_data.get("message"):
            conflict_status = response_data.get("conflict", False)
            message = response_data.get("message", "")
            self.log_test_result(test_name, True, f"Update successful: {message}, conflict: {conflict_status}")
            return True
        else:
            self.log_test_result(test_name, False, f"Status: {status_code}, Response: {response_data}")
            return False
    
    async def test_normal_lead_creation(self, token):
        """Test normal lead creation (regression test)"""
        test_name = "Normal Lead Creation (Regression)"
        
        lead_data = {
            "name": "Normal Lead Test",
            "phone": "777-888-9999",
            "email": "normal@test.com",
            "address": "456 Normal St",
            "notes": "Created via normal endpoint",
            "source": "manual"
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        
        success, response_data, status_code = await self.make_request(
            "POST", "/leads",
            data=lead_data,
            headers=headers,
            expected_status=200
        )
        
        if success and "id" in response_data:
            lead_id = response_data["id"]
            lead_name = response_data.get("name", "Unknown")
            self.log_test_result(test_name, True, f"Normal lead created: ID={lead_id}, Name={lead_name}")
            return lead_id
        else:
            self.log_test_result(test_name, False, f"Status: {status_code}, Response: {response_data}")
            return None
    
    async def test_lead_retrieval(self, token):
        """Test lead retrieval (regression test)"""
        test_name = "Lead Retrieval (Regression)"
        
        headers = {"Authorization": f"Bearer {token}"}
        
        success, response_data, status_code = await self.make_request(
            "GET", "/leads",
            headers=headers,
            expected_status=200
        )
        
        if success and isinstance(response_data, list):
            lead_count = len(response_data)
            self.log_test_result(test_name, True, f"Retrieved {lead_count} leads")
            return True
        else:
            self.log_test_result(test_name, False, f"Status: {status_code}, Response: {response_data}")
            return False
    
    async def test_unauthorized_access(self):
        """Test that offline endpoints require authentication"""
        test_name = "Unauthorized Access Protection"
        
        # Test without token
        success, response_data, status_code = await self.make_request(
            "POST", "/leads/offline",
            data={"name": "Unauthorized Test", "temp_id": "unauth_123"},
            expected_status=401  # Expecting unauthorized
        )
        
        if status_code == 401:
            self.log_test_result(test_name, True, f"Correctly blocked unauthorized access: {response_data}")
            return True
        elif status_code == 403:
            self.log_test_result(test_name, True, f"Correctly blocked access (403): {response_data}")
            return True
        else:
            self.log_test_result(test_name, False, f"Did not block unauthorized access: Status {status_code}")
            return False
    
    async def test_agent_permissions(self):
        """Test that agent can also use offline endpoints"""
        test_name = "Agent Offline Permissions"
        
        if not self.agent_token:
            self.log_test_result(test_name, False, "Agent token not available")
            return False
        
        # Test agent can create offline lead
        temp_id = f"agent_temp_{int(time.time())}"
        lead_data = {
            "name": "Agent Offline Lead",
            "temp_id": temp_id
        }
        
        headers = {"Authorization": f"Bearer {self.agent_token}"}
        
        success, response_data, status_code = await self.make_request(
            "POST", "/leads/offline",
            data=lead_data,
            headers=headers,
            expected_status=200
        )
        
        if success and "id" in response_data:
            lead_id = response_data["id"]
            self.log_test_result(test_name, True, f"Agent successfully created offline lead: {lead_id}")
            return True
        else:
            self.log_test_result(test_name, False, f"Agent failed to create offline lead: Status {status_code}")
            return False
    
    async def run_comprehensive_test_suite(self):
        """Run all offline lead capture tests"""
        logger.info("🎯 STARTING COMPREHENSIVE OFFLINE LEAD CAPTURE TESTING")
        logger.info("=" * 80)
        
        # Test authentication for both admin and agent
        admin_token = await self.test_auth_login("admin@agentroute.com", "Admin123!", "admin")
        agent_token = await self.test_auth_login("agent@agentroute.com", "Agent123!", "agent")
        
        if not admin_token:
            logger.error("❌ CRITICAL: Admin authentication failed. Cannot continue testing.")
            return
        
        # Use admin token for main tests
        logger.info("\n📋 TESTING OFFLINE LEAD CAPTURE FUNCTIONALITY")
        logger.info("-" * 60)
        
        # Test 1: Offline Lead Creation
        lead_id, temp_id = await self.test_offline_lead_creation(admin_token)
        
        # Test 2: Duplicate Prevention (same temp_id)
        if temp_id:
            await self.test_duplicate_prevention(admin_token, temp_id)
        
        # Test 3: Offline Lead Update
        if lead_id:
            await self.test_offline_lead_update(admin_token, lead_id)
        
        # Test 4: Normal Lead Creation (Regression)
        await self.test_normal_lead_creation(admin_token)
        
        # Test 5: Lead Retrieval (Regression)
        await self.test_lead_retrieval(admin_token)
        
        # Test 6: Unauthorized Access Protection
        await self.test_unauthorized_access()
        
        # Test 7: Agent Permissions
        if agent_token:
            await self.test_agent_permissions()
        
        # Print summary
        logger.info("\n📊 TEST RESULTS SUMMARY")
        logger.info("=" * 80)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        success_rate = (passed / total * 100) if total > 0 else 0
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            logger.info(f"{status} {result['test']}")
            if result["details"] and not result["success"]:
                logger.info(f"   └─ {result['details']}")
        
        logger.info("-" * 80)
        logger.info(f"📈 FINAL RESULTS: {passed}/{total} tests passed ({success_rate:.1f}%)")
        
        if success_rate == 100:
            logger.info("🎉 ALL TESTS PASSED - Offline Lead Capture system fully functional!")
        elif success_rate >= 80:
            logger.info("⚠️  MOSTLY FUNCTIONAL - Minor issues detected")
        else:
            logger.info("❌ CRITICAL ISSUES - Offline Lead Capture system needs attention")
        
        return success_rate, self.test_results

async def main():
    """Main entry point"""
    logger.info("🚀 AgentRoute AI - Offline Lead Capture & Auto Sync Test Suite")
    logger.info(f"Backend URL: {BASE_URL}")
    logger.info(f"Test Started: {datetime.now().isoformat()}")
    
    try:
        async with OfflineLeadTester() as tester:
            success_rate, results = await tester.run_comprehensive_test_suite()
            
            # Return results for integration with test_result.md
            return {
                "success_rate": success_rate,
                "tests_passed": sum(1 for r in results if r["success"]),
                "tests_total": len(results),
                "results": results,
                "all_passed": success_rate == 100
            }
            
    except Exception as e:
        logger.error(f"💥 CRITICAL ERROR during testing: {str(e)}")
        raise

if __name__ == "__main__":
    asyncio.run(main())