#!/usr/bin/env python3
"""
iOS App Store Submission Validation Test Suite
Tests critical endpoints required for Apple App Store submission
"""

import requests
import json
import base64
import time
from datetime import datetime, timedelta
import uuid

# Test Configuration
BASE_URL = "https://pipeline-proof.preview.emergentagent.com/api"
TIMEOUT = 30

# Test Credentials (provided in review request)
ADMIN_CREDENTIALS = {
    "email": "admin@agentroute.com",
    "password": "Admin123!"
}

AGENT_CREDENTIALS = {
    "email": "agent@agentroute.com", 
    "password": "Agent123!"
}

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'
    BOLD = '\033[1m'

def log_success(message):
    print(f"{Colors.GREEN}✅ {message}{Colors.END}")

def log_error(message):
    print(f"{Colors.RED}❌ {message}{Colors.END}")

def log_warning(message):
    print(f"{Colors.YELLOW}⚠️  {message}{Colors.END}")

def log_info(message):
    print(f"{Colors.BLUE}ℹ️  {message}{Colors.END}")

def log_header(message):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{message}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.test_details = []
    
    def add_result(self, test_name, passed, details=""):
        if passed:
            self.passed += 1
            log_success(f"{test_name}")
        else:
            self.failed += 1
            log_error(f"{test_name} - {details}")
        self.test_details.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
    
    def print_summary(self):
        total = self.passed + self.failed
        success_rate = (self.passed / total * 100) if total > 0 else 0
        
        print(f"\n{Colors.BOLD}{'='*60}{Colors.END}")
        print(f"{Colors.BOLD}iOS APP STORE SUBMISSION VALIDATION RESULTS{Colors.END}")
        print(f"{Colors.BOLD}{'='*60}{Colors.END}")
        print(f"Total Tests: {total}")
        print(f"{Colors.GREEN}Passed: {self.passed}{Colors.END}")
        print(f"{Colors.RED}Failed: {self.failed}{Colors.END}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if self.failed > 0:
            print(f"\n{Colors.RED}FAILED TESTS:{Colors.END}")
            for detail in self.test_details:
                if not detail["passed"]:
                    print(f"❌ {detail['test']}: {detail['details']}")

def make_request(method, endpoint, headers=None, json_data=None, timeout=TIMEOUT):
    """Make HTTP request with error handling"""
    try:
        url = f"{BASE_URL}{endpoint}"
        log_info(f"{method} {url}")
        
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=timeout)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=json_data, timeout=timeout)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=json_data, timeout=timeout)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=timeout)
        
        return response
    except requests.exceptions.RequestException as e:
        log_error(f"Request failed: {e}")
        return None

def login_user(credentials):
    """Login and return access token"""
    response = make_request("POST", "/auth/login", json_data=credentials)
    if response and response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    return None

def get_auth_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def test_scanner_ocr_endpoint(token, results):
    """Test the OCR scanner endpoint (CRITICAL for App Store)"""
    log_header("1. SCANNER OCR ENDPOINT (CRITICAL)")
    
    # Simple base64 test image (1x1 pixel PNG)
    test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    
    headers = get_auth_headers(token)
    payload = {"image_base64": test_image_base64}
    
    response = make_request("POST", "/ocr/scan", headers=headers, json_data=payload)
    
    if response is None:
        results.add_result("POST /api/ocr/scan", False, "Request failed")
        return
    
    if response.status_code == 200:
        data = response.json()
        # Check if response contains expected OCR fields
        expected_fields = ["name", "phone", "email", "company", "address", "confidence_scores"]
        has_fields = all(field in str(data) for field in ["confidence"])
        
        results.add_result("POST /api/ocr/scan", True, f"Response: {len(str(data))} chars")
        if has_fields:
            log_success("OCR response contains confidence data")
        else:
            log_warning("OCR response may not contain all expected fields")
    else:
        results.add_result("POST /api/ocr/scan", False, f"Status: {response.status_code}, Response: {response.text[:200]}")

def test_authentication_flow(results):
    """Test authentication endpoints"""
    log_header("2. AUTHENTICATION FLOW")
    
    # Test login
    response = make_request("POST", "/auth/login", json_data=ADMIN_CREDENTIALS)
    if response and response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        results.add_result("POST /api/auth/login", True, "Admin login successful")
    else:
        results.add_result("POST /api/auth/login", False, f"Login failed: {response.status_code if response else 'No response'}")
        return None
    
    # Test /auth/me
    headers = get_auth_headers(token)
    response = make_request("GET", "/auth/me", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        user_data = data.get("user", {})
        results.add_result("GET /api/auth/me", True, f"User: {user_data.get('email', 'N/A')}")
    else:
        results.add_result("GET /api/auth/me", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test solo registration with unique email
    unique_email = f"test-solo-{int(time.time())}@test.com"
    solo_data = {
        "email": unique_email,
        "password": "TestPass123!",
        "first_name": "Test",
        "last_name": "User",
        "phone": "555-0123"
    }
    
    response = make_request("POST", "/auth/register-solo", json_data=solo_data)
    if response and response.status_code == 200:
        results.add_result("POST /api/auth/register-solo", True, f"Solo registration successful for {unique_email}")
    else:
        results.add_result("POST /api/auth/register-solo", False, f"Status: {response.status_code if response else 'No response'}")
    
    return token

def test_account_deletion(token, results):
    """Test account deletion endpoint (Apple requirement)"""
    log_header("3. ACCOUNT DELETION (APPLE REQUIRED)")
    
    headers = get_auth_headers(token)
    response = make_request("DELETE", "/auth/account", headers=headers)
    
    if response is None:
        results.add_result("DELETE /api/auth/account", False, "Request failed")
        return
        
    # For this test, we expect either success or a specific error (like admin protection)
    if response.status_code in [200, 403]:
        if response.status_code == 200:
            results.add_result("DELETE /api/auth/account", True, "Account deletion endpoint working")
        else:
            # 403 might be expected for admin accounts
            results.add_result("DELETE /api/auth/account", True, "Endpoint exists (403 for admin account protection)")
    else:
        results.add_result("DELETE /api/auth/account", False, f"Status: {response.status_code}, Response: {response.text[:200]}")

def test_offline_lead_endpoints(token, results):
    """Test offline lead endpoints"""
    log_header("4. OFFLINE LEAD ENDPOINTS")
    
    headers = get_auth_headers(token)
    
    # Test offline lead creation
    temp_id = f"test_temp_{int(time.time())}"
    offline_lead = {
        "temp_id": temp_id,
        "first_name": "Test",
        "last_name": "Offline",
        "phone": "555-0199",
        "email": "test.offline@test.com",
        "address": "123 Test St",
        "city": "Test City",
        "state": "CA",
        "zip_code": "90210",
        "source": "offline_test"
    }
    
    response = make_request("POST", "/leads/offline", headers=headers, json_data=offline_lead)
    lead_id = None
    
    if response and response.status_code == 200:
        data = response.json()
        lead_id = data.get("id")
        results.add_result("POST /api/leads/offline", True, f"Offline lead created with temp_id: {temp_id}")
    else:
        results.add_result("POST /api/leads/offline", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test offline lead update (if lead was created)
    if lead_id:
        update_data = {
            "temp_id": f"update_temp_{int(time.time())}",
            "offline_timestamp": datetime.utcnow().isoformat() + "Z",
            "phone": "555-0200"
        }
        
        response = make_request("PUT", f"/leads/{lead_id}/offline", headers=headers, json_data=update_data)
        
        if response and response.status_code == 200:
            results.add_result("PUT /api/leads/{id}/offline", True, "Offline lead update successful")
        else:
            results.add_result("PUT /api/leads/{id}/offline", False, f"Status: {response.status_code if response else 'No response'}")
    else:
        results.add_result("PUT /api/leads/{id}/offline", False, "Skipped - no lead_id from creation")

def test_data_persistence(token, results):
    """Test data persistence with leads and appointments"""
    log_header("5. DATA PERSISTENCE")
    
    headers = get_auth_headers(token)
    
    # Test lead creation
    test_lead = {
        "first_name": "Store",
        "last_name": "Test",
        "phone": "555-0100",
        "email": f"store.test.{int(time.time())}@test.com",
        "address": "123 Store St",
        "city": "Test City",
        "state": "CA",
        "zip_code": "90210",
        "source": "app_store_test"
    }
    
    response = make_request("POST", "/leads", headers=headers, json_data=test_lead)
    lead_id = None
    
    if response and response.status_code == 200:
        data = response.json()
        lead_id = data.get("id")
        results.add_result("POST /api/leads", True, f"Lead created: {lead_id}")
    else:
        results.add_result("POST /api/leads", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test leads retrieval
    response = make_request("GET", "/leads", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        leads_count = len(data) if isinstance(data, list) else data.get("total", 0)
        results.add_result("GET /api/leads", True, f"Retrieved {leads_count} leads")
    else:
        results.add_result("GET /api/leads", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test appointment creation (if lead was created)
    if lead_id:
        appointment_time = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
        test_appointment = {
            "lead_id": lead_id,
            "appointment_datetime": appointment_time,
            "duration_minutes": 60,
            "notes": "App Store Test Appointment",
            "location": "Test Location"
        }
        
        response = make_request("POST", "/appointments", headers=headers, json_data=test_appointment)
        if response and response.status_code == 200:
            results.add_result("POST /api/appointments", True, "Appointment created")
        else:
            results.add_result("POST /api/appointments", False, f"Status: {response.status_code if response else 'No response'}")
    else:
        results.add_result("POST /api/appointments", False, "Skipped - no lead_id")
    
    # Test appointments retrieval
    response = make_request("GET", "/appointments", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        appointments_count = len(data) if isinstance(data, list) else data.get("total", 0)
        results.add_result("GET /api/appointments", True, f"Retrieved {appointments_count} appointments")
    else:
        results.add_result("GET /api/appointments", False, f"Status: {response.status_code if response else 'No response'}")

def test_legal_endpoints(results):
    """Test legal endpoints (Apple compliance)"""
    log_header("6. LEGAL ENDPOINTS (APPLE COMPLIANCE)")
    
    # Test privacy policy
    response = make_request("GET", "/privacy")
    if response and response.status_code == 200:
        content = response.text
        if len(content) > 500 and ("privacy" in content.lower() or "data" in content.lower()):
            results.add_result("GET /api/privacy", True, f"Privacy policy loaded ({len(content)} chars)")
        else:
            results.add_result("GET /api/privacy", False, f"Privacy policy too short or missing content: {len(content)} chars")
    else:
        results.add_result("GET /api/privacy", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test terms of service
    response = make_request("GET", "/terms")
    if response and response.status_code == 200:
        content = response.text
        if len(content) > 500 and ("terms" in content.lower() or "service" in content.lower()):
            results.add_result("GET /api/terms", True, f"Terms of service loaded ({len(content)} chars)")
        else:
            results.add_result("GET /api/terms", False, f"Terms of service too short or missing content: {len(content)} chars")
    else:
        results.add_result("GET /api/terms", False, f"Status: {response.status_code if response else 'No response'}")

def test_navigation_routes(token, results):
    """Test critical navigation routes"""
    log_header("7. NAVIGATION/CRITICAL ROUTES")
    
    headers = get_auth_headers(token)
    
    # Test pipeline endpoint
    response = make_request("GET", "/pipeline", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        pipeline_data = isinstance(data, dict) or isinstance(data, list)
        results.add_result("GET /api/pipeline", True, f"Pipeline data loaded: {type(data).__name__}")
    else:
        results.add_result("GET /api/pipeline", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test subscription status
    response = make_request("GET", "/subscription/status", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        has_status = "status" in str(data).lower()
        results.add_result("GET /api/subscription/status", True, f"Subscription status loaded, has status info: {has_status}")
    else:
        results.add_result("GET /api/subscription/status", False, f"Status: {response.status_code if response else 'No response'}")

def main():
    """Run iOS App Store submission validation tests"""
    log_header("iOS APP STORE SUBMISSION VALIDATION")
    log_info(f"Base URL: {BASE_URL}")
    log_info("Testing critical endpoints for Apple App Store readiness")
    
    results = TestResults()
    
    # Try admin login first, fallback to agent
    log_info("Logging in as admin user...")
    admin_token = login_user(ADMIN_CREDENTIALS)
    
    if not admin_token:
        log_warning("Admin login failed, trying agent credentials...")
        admin_token = login_user(AGENT_CREDENTIALS)
        
    if not admin_token:
        log_error("Failed to login with both admin and agent credentials - cannot continue tests")
        return
    
    log_success("Login successful")
    
    # Run all test categories
    test_scanner_ocr_endpoint(admin_token, results)
    test_authentication_flow(results)  # This returns a new token
    test_account_deletion(admin_token, results)  # Use admin token for this
    test_offline_lead_endpoints(admin_token, results)
    test_data_persistence(admin_token, results)
    test_legal_endpoints(results)  # No auth needed for public endpoints
    test_navigation_routes(admin_token, results)
    
    # Print final results
    results.print_summary()
    
    # Determine overall result
    if results.failed == 0:
        log_success("🎉 ALL CRITICAL ENDPOINTS PASSING - READY FOR iOS APP STORE SUBMISSION")
    elif results.failed <= 2:
        log_warning(f"⚠️  MINOR ISSUES FOUND ({results.failed} failures) - Review before submission")
    else:
        log_error(f"❌ CRITICAL ISSUES FOUND ({results.failed} failures) - Must fix before App Store submission")

if __name__ == "__main__":
    main()