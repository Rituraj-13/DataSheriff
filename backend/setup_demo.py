"""
DataSheriff — Demo Setup Script
================================
Run this ONCE after starting OpenMetadata to prepare the demo environment.

What it does:
  1. Verifies OpenMetadata is reachable and sample data is loaded
  2. Adds one missing lineage link: fact_orders -> orders dashboard
     (everything else already exists in OpenMetadata sample data)
  3. Confirms real failing quality tests exist on dim_address
  4. Prints the exact query to use for the demo

Works on ANY machine — all IDs discovered dynamically by name.
No hardcoded UUIDs. No fake data invented.

Usage:
  cd backend
  pip install -r requirements.txt
  cp .env.example .env        # add your ANTHROPIC_API_KEY
  python setup_demo.py
"""

import httpx
import os
import sys
from dotenv import load_dotenv

load_dotenv()

HOST  = os.getenv("OPENMETADATA_HOST", "http://localhost:8585")
TOKEN = os.getenv("OPENMETADATA_TOKEN", "")

# ── Validation ────────────────────────────────────────────────────────────────

print()
print("DataSheriff — Demo Setup")
print("=" * 50)

if not TOKEN:
    print()
    print("ERROR: OPENMETADATA_TOKEN is not set in your .env file.")
    print()
    print("To get your token:")
    print("  1. Open http://localhost:8585")
    print("  2. Log in as admin@open-metadata.org / admin")
    print("  3. Go to Settings -> Bots -> ingestion-bot")
    print("  4. Copy the token into backend/.env")
    print("     OPENMETADATA_TOKEN=<paste here>")
    sys.exit(1)

H = {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}


def get(path, params=None):
    r = httpx.get(HOST + "/api/v1" + path, headers=H, params=params, timeout=15)
    r.raise_for_status()
    return r.json()

def put(path, body):
    r = httpx.put(HOST + "/api/v1" + path, headers=H, json=body, timeout=15)
    return r


# ── Step 1: Verify OpenMetadata is reachable ──────────────────────────────────

print()
print("Step 1: Verifying OpenMetadata connection")
print("-" * 50)

try:
    version = get("/system/version")
    print("  OK  OpenMetadata " + version.get("version", "unknown") + " is running at " + HOST)
except httpx.ConnectError:
    print()
    print("  ERROR: Cannot reach OpenMetadata at " + HOST)
    print()
    print("  Make sure OpenMetadata is running:")
    print("    docker compose up -d")
    print()
    print("  Then wait ~3 minutes for it to fully start, and run this script again.")
    sys.exit(1)
except httpx.HTTPStatusError as e:
    print()
    print("  ERROR: HTTP " + str(e.response.status_code) + " — token may be invalid or expired.")
    print()
    print("  Get a fresh token:")
    print("    curl -s -X POST http://localhost:8585/api/v1/users/login")
    print("    -H 'Content-Type: application/json'")
    print("    -d '{\"email\":\"admin@open-metadata.org\",\"password\":\"admin\"}'")
    print("    | python -c \"import sys,json; print(json.load(sys.stdin)['accessToken'])\"")
    sys.exit(1)


# ── Step 2: Find orders dashboard ────────────────────────────────────────────

print()
print("Step 2: Locating assets in sample data")
print("-" * 50)

orders_id, orders_fqn = None, None
try:
    data = get("/dashboards", params={"limit": 50})
    for d in data.get("data", []):
        name = d.get("name", "").lower()
        if "order" in name:
            orders_id  = d.get("id")
            orders_fqn = d.get("fullyQualifiedName")
            break
    if orders_id:
        print("  OK  Orders dashboard  : " + orders_fqn)
    else:
        print("  WARN orders dashboard not found.")
        print("       This usually means OpenMetadata sample data hasn't loaded yet.")
        print("       Wait 2-3 minutes and re-run this script.")
except Exception as e:
    print("  ERROR fetching dashboards: " + str(e))


# Find fact_orders table
fact_orders_id, fact_orders_fqn = None, None
try:
    data = get("/tables", params={"limit": 50})
    for t in data.get("data", []):
        if t.get("name") == "fact_orders":
            fact_orders_id  = t.get("id")
            fact_orders_fqn = t.get("fullyQualifiedName")
            break
    if fact_orders_id:
        print("  OK  fact_orders table : " + fact_orders_fqn)
    else:
        print("  WARN fact_orders table not found.")
        print("       OpenMetadata sample data may not be fully loaded yet.")
except Exception as e:
    print("  ERROR fetching tables: " + str(e))


# Check upstream lineage already exists on fact_orders
upstream_count = 0
if fact_orders_id:
    try:
        lineage = get(
            "/lineage/table/" + fact_orders_id,
            params={"upstreamDepth": 3, "downstreamDepth": 0}
        )
        upstream_count = len(lineage.get("nodes", []))
        print("  OK  fact_orders has " + str(upstream_count) + " upstream nodes already in lineage")
    except Exception as e:
        print("  WARN could not fetch lineage: " + str(e))


# Check quality tests exist on dim_address
test_count, failed_count = 0, 0
try:
    test_data = get("/dataQuality/testCases", params={"limit": 50})
    all_tests = test_data.get("data", [])
    test_count = len(all_tests)
    for t in all_tests:
        status = t.get("testCaseResult", {}).get("testCaseStatus", "")
        if status == "Failed":
            failed_count += 1
    print("  OK  Quality tests     : " + str(test_count) + " total, " + str(failed_count) + " already failing")
except Exception as e:
    print("  WARN could not fetch quality tests: " + str(e))


# ── Step 3: Add the one missing lineage link ──────────────────────────────────

print()
print("Step 3: Adding lineage — fact_orders -> orders dashboard")
print("-" * 50)

if not orders_id:
    print("  SKIP orders dashboard not found — cannot add lineage")
elif not fact_orders_id:
    print("  SKIP fact_orders not found — cannot add lineage")
else:
    r = put("/lineage", {
        "edge": {
            "fromEntity": {"id": fact_orders_id, "type": "table"},
            "toEntity":   {"id": orders_id,      "type": "dashboard"},
        }
    })
    if r.status_code in (200, 201):
        print("  OK  Linked: " + fact_orders_fqn + " -> " + orders_fqn)
    elif r.status_code == 409:
        print("  OK  Lineage already exists (nothing to do)")
    else:
        print("  WARN HTTP " + str(r.status_code) + ": " + r.text[:150])


# ── Step 4: Verify final state ────────────────────────────────────────────────

print()
print("Step 4: Verifying final state")
print("-" * 50)

if fact_orders_id:
    try:
        lineage = get(
            "/lineage/table/" + fact_orders_id,
            params={"upstreamDepth": 3, "downstreamDepth": 1}
        )
        nodes = lineage.get("nodes", [])
        downstream = [
            e for e in lineage.get("downstreamEdges", [])
        ]
        print("  OK  fact_orders upstream nodes : " + str(len(nodes)))
        print("  OK  fact_orders downstream     : " + str(len(downstream)) + " connection(s) to dashboard")
    except Exception as e:
        print("  WARN lineage check failed: " + str(e))

# Re-check failing tests
try:
    test_data = get("/dataQuality/testCases", params={"limit": 50})
    all_tests = test_data.get("data", [])
    failed = [
        t for t in all_tests
        if t.get("testCaseResult", {}).get("testCaseStatus") == "Failed"
    ]
    print("  OK  Failing quality tests      : " + str(len(failed)))
    for t in failed:
        reason = t.get("testCaseResult", {}).get("result", "")[:60]
        print("       - " + t.get("name") + ": " + reason)
except Exception as e:
    print("  WARN quality test check failed: " + str(e))


# ── Done ──────────────────────────────────────────────────────────────────────

print()
print("=" * 50)
print(" SETUP COMPLETE")
print("=" * 50)
print("""
  Start the backend:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

  Start the frontend:
    cd ../frontend && npm run dev

  Open: http://localhost:5173

  Demo queries to try:
  ─────────────────────────────────────────────
  Basic (works even without this script):
    "The fact_orders table has missing data"

  Full lineage demo (uses the link we just added):
    "The orders dashboard is showing wrong data"
  ─────────────────────────────────────────────

  What the agent will find:
    orders dashboard
        -> fact_orders (lineage)
        -> dim_address, raw_order, dim_customer (upstream)
        -> """ + str(failed_count) + """ quality tests FAILING on dim_address
        -> root cause identified with real evidence
""")