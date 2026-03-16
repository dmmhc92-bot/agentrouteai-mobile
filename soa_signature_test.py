#!/usr/bin/env python3
"""
SOA Signature Save and PDF Generation Test
Focused test for the SOA signature workflow with real PNG signature images
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
BASE_URL = "https://agentroute-sales.preview.emergentagent.com/api"

# Test credentials as specified in the review request
TEST_AGENT = {
    "email": "agent@agentroute.com",
    "password": "Agent123!"
}

class SOASignatureTester:
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
    
    def create_test_signature_png(self, text="Test Signature", width=360, height=180):
        """Create a real PNG signature image with RGBA format"""
        # Create image with transparent background (RGBA)
        img = Image.new('RGBA', (width, height), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)
        
        # Draw a signature-like curve
        # Simulate handwritten signature with curves
        points = []
        for i in range(0, width-20, 5):
            x = i + 10
            y = height//2 + 20 * (i % 30 - 15) // 15  # Create wave pattern
            points.append((x, y))
        
        # Draw the signature curve
        if len(points) > 1:
            for i in range(len(points)-1):
                draw.line([points[i], points[i+1]], fill=(0, 0, 0, 255), width=3)
        
        # Add some flourishes
        draw.ellipse([width-50, height//2-10, width-30, height//2+10], outline=(0, 0, 0, 255), width=2)
        
        # Convert to base64 data URI
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_data = buffer.getvalue()
        img_base64 = base64.b64encode(img_data).decode('utf-8')
        
        return f"data:image/png;base64,{img_base64}"
    
    def test_login(self):
        """Test login with agent credentials"""
        print("=== SOA SIGNATURE WORKFLOW TEST ===")
        print("Step 1: Login as agent")
        
        response = self.make_request("POST", "/auth/login", TEST_AGENT)
        if response and response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("access_token")
            self.user_id = data.get("user", {}).get("id")
            user_name = data.get("user", {}).get("name", "Unknown")
            user_role = data.get("user", {}).get("role", "Unknown")
            self.log_result("Agent Login", True, f"Logged in as {user_name} ({user_role})")
            return True
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Agent Login", False, f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_get_or_create_lead(self):
        """Get existing lead or create one for SOA testing"""
        print("Step 2: Get or create lead for SOA")
        
        # First try to get existing leads
        response = self.make_request("GET", "/leads")
        if response and response.status_code == 200:
            leads = response.json()
            if leads:
                # Use the first available lead
                self.lead_id = leads[0]["id"]
                lead_name = leads[0]["name"]
                self.log_result("Get Existing Lead", True, f"Using existing lead: {lead_name} (ID: {self.lead_id})")
                return True
        
        # Create new lead if none exist
        lead_data = {
            "name": "John Medicare Client",
            "phone": "555-0123",
            "email": "john.client@email.com",
            "address": "123 Main St, Anytown, ST 12345",
            "notes": "Medicare client for SOA signature testing"
        }
        
        response = self.make_request("POST", "/leads", lead_data)
        if response and response.status_code == 200:
            data = response.json()
            self.lead_id = data.get("id")
            self.log_result("Create New Lead", True, f"Created lead: {lead_data['name']} (ID: {self.lead_id})")
            return True
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Create New Lead", False, f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_create_soa_with_signatures(self):
        """Test creating SOA with real PNG signature images"""
        print("Step 3: Create SOA with real PNG signatures")
        
        if not self.lead_id:
            self.log_result("Create SOA with Signatures", False, "No lead available")
            return False
        
        # Create real PNG signature images
        print("   Creating real PNG signature images...")
        beneficiary_signature = self.create_test_signature_png("John Medicare Client")
        agent_signature = self.create_test_signature_png("Agent Signature")
        
        print(f"   Beneficiary signature length: {len(beneficiary_signature)}")
        print(f"   Agent signature length: {len(agent_signature)}")
        
        # Verify signatures are in correct format
        if not beneficiary_signature.startswith("data:image/png;base64,"):
            self.log_result("Create SOA with Signatures", False, "Invalid beneficiary signature format")
            return False
        
        if not agent_signature.startswith("data:image/png;base64,"):
            self.log_result("Create SOA with Signatures", False, "Invalid agent signature format")
            return False
        
        # Create SOA with full signature data
        current_time = datetime.utcnow().isoformat()
        scope_data = {
            "lead_id": self.lead_id,
            "form_fields": {
                "beneficiary_name": "John Medicare Client",
                "agent_name": "Test Agent",
                "medicare_advantage": True,
                "consent_given": True,
                "beneficiary_signed_at": current_time,
                "agent_signed_at": current_time
            },
            "typed_name": "John Medicare Client",
            "signature": beneficiary_signature,
            "agent_typed_name": "Test Agent",
            "agent_signature": agent_signature
        }
        
        print("   Sending SOA creation request...")
        response = self.make_request("POST", "/scope", scope_data)
        
        if response and response.status_code == 200:
            data = response.json()
            self.scope_id = data.get("id")
            
            # Verify response contains required fields
            has_pdf = data.get("pdf_base64") is not None
            has_pdf_error = "pdf_error" in data
            
            if has_pdf and not has_pdf_error:
                pdf_size = len(data.get("pdf_base64", ""))
                self.log_result("Create SOA with Signatures", True, 
                               f"SOA created successfully (ID: {self.scope_id}), PDF generated ({pdf_size} chars)")
                return True
            elif has_pdf_error:
                self.log_result("Create SOA with Signatures", False, 
                               f"SOA created but PDF generation failed: {data.get('pdf_error')}")
                return False
            else:
                self.log_result("Create SOA with Signatures", False, 
                               "SOA created but no PDF generated (pdf_base64 is null)")
                return False
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Create SOA with Signatures", False, 
                           f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_get_soa_with_signatures(self):
        """Test retrieving SOA with signatures"""
        print("Step 4: Retrieve SOA with signatures")
        
        if not self.scope_id:
            self.log_result("Get SOA with Signatures", False, "No SOA ID available")
            return False
        
        response = self.make_request("GET", f"/scope/{self.scope_id}")
        
        if response and response.status_code == 200:
            data = response.json()
            
            # Verify all signature fields are present
            has_beneficiary_sig = data.get("signature") and len(data.get("signature", "")) > 100
            has_agent_sig = data.get("agent_signature") and len(data.get("agent_signature", "")) > 100
            has_beneficiary_name = data.get("typed_name")
            has_agent_name = data.get("agent_typed_name")
            has_timestamps = data.get("beneficiary_signed_at") and data.get("agent_signed_at")
            
            if all([has_beneficiary_sig, has_agent_sig, has_beneficiary_name, has_agent_name, has_timestamps]):
                self.log_result("Get SOA with Signatures", True, 
                               f"SOA retrieved with all signature data intact")
                return True
            else:
                missing_fields = []
                if not has_beneficiary_sig: missing_fields.append("beneficiary_signature")
                if not has_agent_sig: missing_fields.append("agent_signature")
                if not has_beneficiary_name: missing_fields.append("typed_name")
                if not has_agent_name: missing_fields.append("agent_typed_name")
                if not has_timestamps: missing_fields.append("timestamps")
                
                self.log_result("Get SOA with Signatures", False, 
                               f"Missing signature fields: {', '.join(missing_fields)}")
                return False
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Get SOA with Signatures", False, 
                           f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def test_get_soa_pdf(self):
        """Test retrieving SOA PDF"""
        print("Step 5: Retrieve SOA PDF")
        
        if not self.scope_id:
            self.log_result("Get SOA PDF", False, "No SOA ID available")
            return False
        
        response = self.make_request("GET", f"/scope/{self.scope_id}/pdf")
        
        if response and response.status_code == 200:
            # Check if response is JSON (with pdf_base64) or direct PDF
            content_type = response.headers.get('content-type', '')
            
            if 'application/json' in content_type:
                data = response.json()
                pdf_data = data.get("pdf_base64")
                if pdf_data and len(pdf_data) > 1000:  # Valid PDF should be substantial
                    self.log_result("Get SOA PDF", True, 
                                   f"PDF retrieved successfully ({len(pdf_data)} chars)")
                    return True
                else:
                    self.log_result("Get SOA PDF", False, 
                                   f"PDF data too small or missing: {len(pdf_data) if pdf_data else 0} chars")
                    return False
            elif 'application/pdf' in content_type:
                pdf_size = len(response.content)
                if pdf_size > 1000:  # Valid PDF should be substantial
                    self.log_result("Get SOA PDF", True, 
                                   f"PDF retrieved successfully ({pdf_size} bytes)")
                    return True
                else:
                    self.log_result("Get SOA PDF", False, 
                                   f"PDF too small: {pdf_size} bytes")
                    return False
            else:
                self.log_result("Get SOA PDF", False, 
                               f"Unexpected content type: {content_type}")
                return False
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            self.log_result("Get SOA PDF", False, 
                           f"Status: {response.status_code if response else 'No response'}, Error: {error_msg}")
            return False
    
    def run_soa_signature_tests(self):
        """Run the complete SOA signature workflow test"""
        print("Starting SOA Signature Save and PDF Generation Test")
        print("=" * 60)
        
        # Step 1: Login
        if not self.test_login():
            print("❌ Cannot proceed without authentication")
            return False
        
        # Step 2: Get or create lead
        if not self.test_get_or_create_lead():
            print("❌ Cannot proceed without lead")
            return False
        
        # Step 3: Create SOA with signatures
        if not self.test_create_soa_with_signatures():
            print("❌ SOA creation failed")
            return False
        
        # Step 4: Retrieve SOA
        if not self.test_get_soa_with_signatures():
            print("❌ SOA retrieval failed")
            return False
        
        # Step 5: Get PDF
        if not self.test_get_soa_pdf():
            print("❌ PDF retrieval failed")
            return False
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("SOA SIGNATURE TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r["success"])
        total = len(self.results)
        
        print(f"Tests Passed: {passed}/{total} ({passed/total*100:.1f}%)")
        print()
        
        for result in self.results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}")
            if result["details"]:
                print(f"   {result['details']}")
        
        print("\n" + "=" * 60)
        
        if passed == total:
            print("🎉 ALL SOA SIGNATURE TESTS PASSED!")
            print("✅ SOA signature save and PDF generation workflow is working correctly")
        else:
            print("⚠️  SOME TESTS FAILED")
            print("❌ SOA signature workflow needs attention")
        
        return passed == total

def main():
    """Main test execution"""
    tester = SOASignatureTester()
    
    try:
        success = tester.run_soa_signature_tests()
        tester.print_summary()
        
        # Exit with appropriate code
        sys.exit(0 if success else 1)
        
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