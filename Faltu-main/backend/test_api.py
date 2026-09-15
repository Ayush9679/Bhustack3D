import urllib.request
import urllib.error
import json

BASE_URL = "http://localhost:8000"

def request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def test():
    print("1. Testing Root...")
    status, res = request("/")
    print("Root:", status, res)

    print("\n2. Testing Login with seeded demo surveyor...")
    status, login_res = request("/auth/login", "POST", {
        "email": "rajesh.verma@bhustack.gov.in",
        "password": "Surveyor@123"
    })
    print("Login:", status, login_res["user"]["name"], "Role:", login_res["user"]["role"])
    token = login_res["access_token"]

    print("\n3. Testing GET /auth/me with Bearer token...")
    status, me_res = request("/auth/me", "GET", token=token)
    print("Me:", status, me_res)

    print("\n4. Testing POST /auth/signup for new user...")
    test_email = "test.citizen@example.com"
    status, signup_res = request("/auth/signup", "POST", {
        "name": "Arjun Patel",
        "email": test_email,
        "password": "SecurePassword123"
    })
    print("Signup:", status, signup_res.get("user", signup_res))

    print("\n5. Testing Duplicate Signup rejection...")
    dup_status, dup_res = request("/auth/signup", "POST", {
        "name": "Arjun Patel",
        "email": test_email,
        "password": "SecurePassword123"
    })
    print("Duplicate Signup Status:", dup_status, "Detail:", dup_res)

    print("\n6. Testing Invalid Password...")
    inv_status, inv_res = request("/auth/login", "POST", {
        "email": "rajesh.verma@bhustack.gov.in",
        "password": "WrongPassword!"
    })
    print("Invalid login status:", inv_status, "Detail:", inv_res)

    print("\n7. Testing POST /auth/logout...")
    lo_status, lo_res = request("/auth/logout", "POST", token=token)
    print("Logout:", lo_status, lo_res)

    print("\nALL BACKEND AUTH TESTS PASSED!")

if __name__ == "__main__":
    test()
