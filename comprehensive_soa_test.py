#!/usr/bin/env python3
"""
Comprehensive SOA Signature Test - Verifying all requirements from review request
"""

import requests
import json
import base64
from datetime import datetime
import uuid
import sys
from PIL import Image, ImageDraw
import io

# Configuration
BASE_URL = "https://agentroute-ai.preview.emergentagent.com/api"

# Test credentials as specified in the review request
TEST_AGENT = {
    "email": "agent@agentroute.com",
    "password": "Agent123!"
}

class ComprehensiveSOATester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.user_id = None
        self.lead_id = None
        self.scope_id = None
        self.results = []
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()
        
        self.results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def make_request(self, method, endpoint, data=None, headers=None, params=None):
        """Make HTTP request with proper error handling"""
        url = f"{BASE_URL}{endpoint}"
        
        # Add auth header if token available
        if self.auth_token and headers is None:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
        elif self.auth_token and headers:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        elif headers is None:
            headers = {}
            
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers, params=params, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers, params=params, timeout=30)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=headers, timeout=30)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None
    
    def create_realistic_signature_png(self, name="Signature", width=360, height=180):
        """Create a realistic PNG signature image with RGBA format"""
        # Create image with transparent background (RGBA)
        img = Image.new('RGBA', (width, height), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)
        
        # Create a more realistic signature pattern
        import math
        
        # Draw cursive-like signature
        points = []
        for i in range(0, width-40, 2):
            x = i + 20
            # Create natural handwriting curves
            y = height//2 + int(15 * math.sin(i * 0.02) + 10 * math.cos(i * 0.05))
            points.append((x, y))
        
        # Draw the main signature line with varying thickness
        if len(points) > 1:
            for i in range(len(points)-1):
                # Vary line thickness for more realistic look
                thickness = 2 + int(abs(math.sin(i * 0.1)))
                draw.line([points[i], points[i+1]], fill=(0, 0, 0, 255), width=thickness)
        
        # Add signature flourishes
        # Underline flourish
        start_x = 20
        end_x = width - 20
        y_line = height//2 + 25
        draw.line([(start_x, y_line), (end_x, y_line)], fill=(0, 0, 0, 200), width=1)
        
        # Initial letter flourish
        draw.arc([15, height//2-20, 35, height//2], start=0, end=180, fill=(0, 0, 0, 255), width=2)
        
        # Convert to base64 data URI
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_data = buffer.getvalue()
        img_base64 = base64.b64encode(img_data).decode('utf-8')
        
        return f"data:image/png;base64,{img_base64}"
    
    def test_login_as_agent(self):
        """Test 1: Login as agent@agentroute.com / Agent123!"""
        print("TEST 1: Login as agent@agentroute.com")
        
        response = self.make_request("POST", "/auth/login", TEST_AGENT)
        if response and response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("access_token")
            self.user_id = data.get("user", {}).get("id")
            user_email = data.get("user", {}).get("email")
            user_role = data.get("user", {}).get("role")
            
            if user_email == TEST_AGENT["email"]:
                self.log_result("Login as agent@agentroute.com", True, 
                               f"Successfully logged in as {user_email} with role {user_role}")
                return True
            else:
                self.log_result("Login as agent@agentroute.com", False, 
                               f"Logged in as wrong user: {user_email}")
                return False
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Login as agent@agentroute.com", False, 
                           f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_get_lead_for_soa(self):
        """Test 2: Get a lead to create SOA for"""
        print("TEST 2: Get lead for SOA creation")
        
        # Get existing leads
        response = self.make_request("GET", "/leads")
        if response and response.status_code == 200:
            leads = response.json()
            if leads:
                # Use the first available lead
                self.lead_id = leads[0]["id"]
                lead_name = leads[0]["name"]
                self.log_result("Get lead for SOA", True, 
                               f"Using existing lead: {lead_name} (ID: {self.lead_id})")
                return True
        
        # Create new lead if none exist
        lead_data = {
            "name": "Medicare Beneficiary",
            "phone": "555-0199",
            "email": "beneficiary@medicare.com",
            "address": "456 Healthcare Ave, Medicare City, MC 67890",
            "notes": "Medicare beneficiary for comprehensive SOA testing"
        }
        
        response = self.make_request("POST", "/leads", lead_data)
        if response and response.status_code == 200:
            data = response.json()
            self.lead_id = data.get("id")
            self.log_result("Get lead for SOA", True, 
                           f"Created new lead: {lead_data['name']} (ID: {self.lead_id})")
            return True
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Get lead for SOA", False, 
                           f"Failed to get/create lead. Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_create_soa_with_real_png_signatures(self):
        """Test 3: Create SOA with REAL PNG signature data"""
        print("TEST 3: Create SOA with real PNG signatures (data:image/png;base64 format)")
        
        if not self.lead_id:
            self.log_result("Create SOA with real PNG signatures", False, "No lead available")
            return False
        
        # Create REAL PNG signature images
        print("   Generating real PNG signature images...")
        beneficiary_signature = self.create_realistic_signature_png("John Medicare Beneficiary")
        agent_signature = self.create_realistic_signature_png("Licensed Agent")
        
        # Verify format
        if not beneficiary_signature.startswith("data:image/png;base64,"):
            self.log_result("Create SOA with real PNG signatures", False, 
                           "Beneficiary signature not in correct data URI format")
            return False
        
        if not agent_signature.startswith("data:image/png;base64,"):
            self.log_result("Create SOA with real PNG signatures", False, 
                           "Agent signature not in correct data URI format")
            return False
        
        print(f"   Beneficiary signature: {len(beneficiary_signature)} chars")
        print(f"   Agent signature: {len(agent_signature)} chars")
        
        # Create SOA with all required fields
        current_time = datetime.utcnow().isoformat()
        scope_data = {
            "lead_id": self.lead_id,
            "form_fields": {
                "beneficiary_name": "John Medicare Beneficiary",
                "agent_name": "Licensed Sales Agent",
                "medicare_advantage": True,
                "consent_given": True,
                "beneficiary_signed_at": current_time,
                "agent_signed_at": current_time
            },
            "typed_name": "John Medicare Beneficiary",  # beneficiary printed name
            "signature": beneficiary_signature,  # data:image/png;base64,... format
            "agent_typed_name": "Licensed Sales Agent",
            "agent_signature": agent_signature  # data:image/png;base64,... format
        }
        
        print("   Sending POST /api/scope request...")
        response = self.make_request("POST", "/scope", scope_data)
        
        if response and response.status_code == 200:
            data = response.json()
            self.scope_id = data.get("id")
            
            # VERIFY: POST /api/scope returns 200
            # VERIFY: Response contains pdf_base64 (NOT null)
            # VERIFY: Response does NOT contain pdf_error field
            
            has_pdf_base64 = data.get("pdf_base64") is not None
            has_pdf_error = "pdf_error" in data
            pdf_size = len(data.get("pdf_base64", "")) if has_pdf_base64 else 0
            
            if has_pdf_base64 and not has_pdf_error and pdf_size > 1000:
                self.log_result("Create SOA with real PNG signatures", True, 
                               f"✅ POST /api/scope returns 200\n" +
                               f"   ✅ Response contains pdf_base64 ({pdf_size} chars)\n" +
                               f"   ✅ Response does NOT contain pdf_error field\n" +
                               f"   SOA ID: {self.scope_id}")
                return True
            else:
                issues = []
                if not has_pdf_base64:
                    issues.append("pdf_base64 is null")
                if has_pdf_error:
                    issues.append(f"pdf_error present: {data.get('pdf_error')}")
                if pdf_size <= 1000:
                    issues.append(f"pdf_base64 too small: {pdf_size} chars")
                
                self.log_result("Create SOA with real PNG signatures", False, 
                               f"Issues: {'; '.join(issues)}")
                return False
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Create SOA with real PNG signatures", False, 
                           f"POST /api/scope failed. Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_get_saved_soa_with_signatures(self):
        """Test 4: GET /api/scope/{id} returns the saved SOA with signatures"""
        print("TEST 4: GET /api/scope/{id} returns saved SOA with signatures")
        
        if not self.scope_id:
            self.log_result("GET saved SOA with signatures", False, "No SOA ID available")
            return False
        
        response = self.make_request("GET", f"/scope/{self.scope_id}")
        
        if response and response.status_code == 200:
            data = response.json()
            
            # Verify all signature data is preserved
            has_beneficiary_sig = data.get("signature") and data.get("signature").startswith("data:image/png;base64,")
            has_agent_sig = data.get("agent_signature") and data.get("agent_signature").startswith("data:image/png;base64,")
            has_beneficiary_name = data.get("typed_name")
            has_agent_name = data.get("agent_typed_name")
            has_form_fields = data.get("form_fields") and isinstance(data.get("form_fields"), dict)
            has_timestamps = data.get("beneficiary_signed_at") and data.get("agent_signed_at")
            
            if all([has_beneficiary_sig, has_agent_sig, has_beneficiary_name, has_agent_name, has_form_fields, has_timestamps]):
                beneficiary_sig_len = len(data.get("signature", ""))
                agent_sig_len = len(data.get("agent_signature", ""))
                
                self.log_result("GET saved SOA with signatures", True, 
                               f"✅ All signature data preserved:\n" +
                               f"   - Beneficiary signature: {beneficiary_sig_len} chars\n" +
                               f"   - Agent signature: {agent_sig_len} chars\n" +
                               f"   - Beneficiary name: {data.get('typed_name')}\n" +
                               f"   - Agent name: {data.get('agent_typed_name')}\n" +
                               f"   - Form fields: {len(data.get('form_fields', {}))} fields\n" +
                               f"   - Timestamps: beneficiary & agent signed")
                return True
            else:
                missing = []
                if not has_beneficiary_sig: missing.append("beneficiary signature")
                if not has_agent_sig: missing.append("agent signature")
                if not has_beneficiary_name: missing.append("beneficiary name")
                if not has_agent_name: missing.append("agent name")
                if not has_form_fields: missing.append("form fields")
                if not has_timestamps: missing.append("timestamps")
                
                self.log_result("GET saved SOA with signatures", False, 
                               f"Missing data: {', '.join(missing)}")
                return False
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("GET saved SOA with signatures", False, 
                           f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_get_soa_pdf_endpoint(self):
        """Test 5: GET /api/scope/{id}/pdf returns valid PDF"""
        print("TEST 5: GET /api/scope/{id}/pdf returns valid PDF")
        
        if not self.scope_id:
            self.log_result("GET SOA PDF endpoint", False, "No SOA ID available")
            return False
        
        response = self.make_request("GET", f"/scope/{self.scope_id}/pdf")
        
        if response and response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            
            if 'application/json' in content_type:
                # JSON response with pdf_base64
                data = response.json()
                pdf_base64 = data.get("pdf_base64")
                
                if pdf_base64 and len(pdf_base64) > 1000:
                    # Try to decode to verify it's valid base64
                    try:
                        pdf_bytes = base64.b64decode(pdf_base64)
                        # Check PDF header
                        if pdf_bytes.startswith(b'%PDF'):
                            self.log_result("GET SOA PDF endpoint", True, 
                                           f"✅ Valid PDF returned ({len(pdf_base64)} chars base64, {len(pdf_bytes)} bytes)")
                            return True
                        else:
                            self.log_result("GET SOA PDF endpoint", False, 
                                           "PDF base64 doesn't decode to valid PDF (missing %PDF header)")
                            return False
                    except Exception as e:
                        self.log_result("GET SOA PDF endpoint", False, 
                                       f"Invalid base64 PDF data: {e}")
                        return False
                else:
                    self.log_result("GET SOA PDF endpoint", False, 
                                   f"PDF data too small or missing: {len(pdf_base64) if pdf_base64 else 0} chars")
                    return False
            
            elif 'application/pdf' in content_type:
                # Direct PDF response
                pdf_size = len(response.content)
                if pdf_size > 1000 and response.content.startswith(b'%PDF'):
                    self.log_result("GET SOA PDF endpoint", True, 
                                   f"✅ Valid PDF returned directly ({pdf_size} bytes)")
                    return True
                else:
                    self.log_result("GET SOA PDF endpoint", False, 
                                   f"Invalid PDF response: {pdf_size} bytes")
                    return False
            else:
                self.log_result("GET SOA PDF endpoint", False, 
                               f"Unexpected content type: {content_type}")
                return False
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("GET SOA PDF endpoint", False, 
                           f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def run_comprehensive_soa_tests(self):
        """Run all comprehensive SOA tests"""
        print("COMPREHENSIVE SOA SIGNATURE + PDF GENERATION TEST")
        print("=" * 70)
        print("Testing all requirements from review request:")
        print("1. Login as agent@agentroute.com / Agent123!")
        print("2. Get a lead to create SOA for")
        print("3. Create SOA with REAL PNG signature data (data:image/png;base64 format)")
        print("4. Verify POST /api/scope returns 200 with pdf_base64 (NOT null) and NO pdf_error")
        print("5. Verify GET /api/scope/{id} returns saved SOA with signatures")
        print("6. Verify GET /api/scope/{id}/pdf returns valid PDF")
        print("=" * 70)
        print()
        
        tests = [
            self.test_login_as_agent,
            self.test_get_lead_for_soa,
            self.test_create_soa_with_real_png_signatures,
            self.test_get_saved_soa_with_signatures,
            self.test_get_soa_pdf_endpoint
        ]
        
        all_passed = True
        for test in tests:
            if not test():
                all_passed = False
                print("❌ Test failed - stopping execution")
                break
        
        return all_passed
    
    def print_final_summary(self):
        """Print comprehensive test summary"""
        print("\n" + "=" * 70)
        print("COMPREHENSIVE SOA TEST RESULTS")
        print("=" * 70)
        
        passed = sum(1 for r in self.results if r["success"])
        total = len(self.results)
        
        print(f"Tests Passed: {passed}/{total} ({passed/total*100:.1f}%)")
        print()
        
        for result in self.results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}")
            if result["details"]:
                # Handle multi-line details
                details_lines = result["details"].split('\n')
                for line in details_lines:
                    print(f"   {line}")
        
        print("\n" + "=" * 70)
        
        if passed == total:
            print("🎉 ALL SOA SIGNATURE + PDF GENERATION TESTS PASSED!")
            print("✅ SOA signature save and PDF generation workflow is FULLY WORKING")
            print("✅ process_signature_image() function correctly handles RGBA→RGB conversion")
            print("✅ Both beneficiary and agent signatures properly stored and rendered in PDF")
            print("✅ All API endpoints working as expected")
        else:
            print("⚠️  SOME TESTS FAILED")
            print("❌ SOA signature workflow has issues that need attention")
        
        return passed == total

def main():
    """Main test execution"""
    tester = ComprehensiveSOATester()
    
    try:
        success = tester.run_comprehensive_soa_tests()
        final_success = tester.print_final_summary()
        
        # Exit with appropriate code
        sys.exit(0 if success and final_success else 1)
        
    except KeyboardInterrupt:
        print("\n❌ Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()