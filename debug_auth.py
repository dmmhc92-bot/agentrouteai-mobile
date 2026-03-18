#!/usr/bin/env python3
import requests

BASE_URL = "https://secure-app-lock.preview.emergentagent.com/api"

# Test without auth
response = requests.get(f"{BASE_URL}/auth/me", headers={})
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")

# Test with invalid auth
response2 = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": "Bearer invalid"})
print(f"Status 2: {response2.status_code}")
print(f"Response 2: {response2.text}")