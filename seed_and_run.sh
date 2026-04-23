#!/usr/bin/env bash
# ============================================================
#  DataSheriff — One Command Setup
#  Usage: chmod +x seed_and_run.sh && ./seed_and_run.sh
# ============================================================
set -euo pipefail

# ── ANSI colours ──────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "  ${RED}✗${NC}  $*"; }
step() { echo -e "\n${BLUE}${BOLD}[$1/$TOTAL_STEPS]${NC} $2"; }

TOTAL_STEPS=7

# ── Paths (resolve relative to this script, works from any cwd) ───────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Detect which docker-compose file to use
if [ -f "$SCRIPT_DIR/openmetadata-docker/docker-compose-postgres.yml" ]; then
  COMPOSE_FILE="$SCRIPT_DIR/openmetadata-docker/docker-compose-postgres.yml"
elif [ -f "$SCRIPT_DIR/docker-compose-postgres.yml" ]; then
  COMPOSE_FILE="$SCRIPT_DIR/docker-compose-postgres.yml"
else
  err "Cannot find docker-compose-postgres.yml. Check your folder structure."
  exit 1
fi

OM_HOST="http://localhost:8585"
OM_EMAIL="admin@open-metadata.org"
OM_PASSWORD="admin"
MAX_WAIT=360   # seconds to wait for OM to boot
INTERVAL=10

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       DataSheriff — One Command Setup  🔍         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Docker ────────────────────────────────────────────────────────────
step 1 "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
  err "Docker is not running. Please start Docker Desktop first, then re-run this script."
  exit 1
fi
ok "Docker is running"

# ── Step 2: Start OpenMetadata containers ─────────────────────────────────────
step 2 "Starting OpenMetadata containers..."
docker compose -f "$COMPOSE_FILE" up --detach
ok "Containers started  (compose file: $(basename "$COMPOSE_FILE"))"
echo "     $(docker ps --filter name=openmetadata --format '{{.Names}}: {{.Status}}' | head -5 | tr '\n' ' ')"

# ── Step 3: Wait for OpenMetadata health ─────────────────────────────────────
step 3 "Waiting for OpenMetadata to be ready (takes 2–5 min on first run)..."
WAITED=0
until curl -sf "$OM_HOST/api/v1/system/version" > /dev/null 2>&1; do
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    err "OpenMetadata did not respond within ${MAX_WAIT}s."
    echo ""
    echo "  Check logs with:"
    echo "    docker compose -f $COMPOSE_FILE logs openmetadata_server --tail=50"
    exit 1
  fi
  printf "     ... still waiting (${WAITED}s / ${MAX_WAIT}s)\r"
  sleep "$INTERVAL"
  WAITED=$((WAITED + INTERVAL))
done

OM_VERSION=$(curl -sf "$OM_HOST/api/v1/system/version" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")
ok "OpenMetadata $OM_VERSION is ready at $OM_HOST"


# ── Step 4: Trigger Airflow DAGs to ingest sample data ───────────────────────
step 4 "Triggering Airflow sample data DAGs (this takes 3-8 minutes)..."

AIRFLOW_HOST="http://localhost:8080"
AIRFLOW_USER="admin"
AIRFLOW_PASS="admin"
AIRFLOW_MAX_WAIT=300
AIRFLOW_WAITED=0
AIRFLOW_AVAILABLE=true

# Wait for Airflow webserver
until curl -sf -u "$AIRFLOW_USER:$AIRFLOW_PASS" \
    "$AIRFLOW_HOST/api/v1/health" > /dev/null 2>&1; do
  if [ "$AIRFLOW_WAITED" -ge "$AIRFLOW_MAX_WAIT" ]; then
    warn "Airflow did not respond within ${AIRFLOW_MAX_WAIT}s — skipping DAG trigger."
    warn "Trigger these DAGs manually at $AIRFLOW_HOST before running DataSheriff:"
    warn "  sample_data → sample_lineage → sample_usage → airflow_metadata_extraction"
    AIRFLOW_AVAILABLE=false
    break
  fi
  printf "     ... waiting for Airflow (%ds / %ds)\r" "$AIRFLOW_WAITED" "$AIRFLOW_MAX_WAIT"
  sleep 10
  AIRFLOW_WAITED=$((AIRFLOW_WAITED + 10))
done

if [ "$AIRFLOW_AVAILABLE" = "true" ]; then
  ok "Airflow is ready at $AIRFLOW_HOST"

  trigger_dag() {
    local dag_id="$1"
    local run_id="datasheriff_seed_$(date +%s)_${dag_id}"
    curl -sf -X POST \
      -u "$AIRFLOW_USER:$AIRFLOW_PASS" \
      -H "Content-Type: application/json" \
      -d "{\"dag_run_id\": \"$run_id\"}" \
      "$AIRFLOW_HOST/api/v1/dags/$dag_id/dagRuns" 2>/dev/null || true
  }

  wait_dag() {
    local dag_id="$1" run_id="$2" label="$3"
    local waited=0 max_wait=360 state
    printf "     %-46s" "$label"
    while true; do
      state=$(curl -sf \
        -u "$AIRFLOW_USER:$AIRFLOW_PASS" \
        "$AIRFLOW_HOST/api/v1/dags/$dag_id/dagRuns/$run_id" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','unknown'))" 2>/dev/null \
        || echo "unknown")
      case "$state" in
        success) echo -e " ${GREEN}✓${NC}"; return 0 ;;
        failed)  echo -e " ${RED}✗ failed${NC}"; return 1 ;;
        *)
          printf "."
          sleep 15; waited=$((waited + 15))
          if [ "$waited" -ge "$max_wait" ]; then
            echo -e " ${YELLOW}⚠ timed out${NC}"; return 1
          fi ;;
      esac
    done
  }

  DAGS=("sample_data" "sample_lineage" "sample_usage" "airflow_metadata_extraction")
  LABELS=(
    "sample_data    (loads fact_orders, dim_address…)"
    "sample_lineage (creates lineage connections)"
    "sample_usage   (loads usage statistics)"
    "airflow_metadata_extraction (syncs pipelines)"
  )
  ALL_OK=true
  echo ""

  for i in "${!DAGS[@]}"; do
    dag="${DAGS[$i]}"
    # Unpause DAG first
    curl -sf -X PATCH \
      -u "$AIRFLOW_USER:$AIRFLOW_PASS" \
      -H "Content-Type: application/json" \
      -d '{"is_paused": false}' \
      "$AIRFLOW_HOST/api/v1/dags/$dag" > /dev/null 2>&1 || true

    result=$(trigger_dag "$dag")
    run_id=$(echo "$result" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('dag_run_id',''))" 2>/dev/null \
      || true)

    if [ -z "$run_id" ]; then
      warn "Could not trigger $dag — may not exist yet. Skipping."
      ALL_OK=false
      continue
    fi

    wait_dag "$dag" "$run_id" "${LABELS[$i]}" || ALL_OK=false
  done

  echo ""
  if [ "$ALL_OK" = "true" ]; then
    ok "All 4 DAGs completed — sample data loaded into OpenMetadata"
  else
    warn "Some DAGs did not finish cleanly — setup_demo.py will report any gaps."
  fi
fi

# ── Step 5: Fetch JWT token and write backend/.env ────────────────────────────
step 5 "Fetching auth token and writing backend/.env..."

# Give OM one extra moment for the login endpoint to warm up
sleep 3

TOKEN=$(curl -sf -X POST "$OM_HOST/api/v1/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$OM_EMAIL\",\"password\":\"$OM_PASSWORD\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['accessToken'])" 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
  err "Could not fetch a JWT token from OpenMetadata."
  echo ""
  warn "OpenMetadata may still be initialising its auth service."
  echo "     Wait 1–2 more minutes, then run the script again."
  echo ""
  echo "  Or get the token manually and set it in backend/.env:"
  echo "    curl -s -X POST $OM_HOST/api/v1/users/login \\"
  echo "      -H 'Content-Type: application/json' \\"
  echo "      -d '{\"email\":\"$OM_EMAIL\",\"password\":\"$OM_PASSWORD\"}' \\"
  echo "      | python3 -c \"import sys,json; print(json.load(sys.stdin)['accessToken'])\""
  exit 1
fi

# Create .env from example if it doesn't exist
ENV_FILE="$BACKEND_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$BACKEND_DIR/.env.example" ]; then
    cp "$BACKEND_DIR/.env.example" "$ENV_FILE"
    ok "Created backend/.env from .env.example"
  else
    # Scaffold a minimal .env
    cat > "$ENV_FILE" << ENVEOF
OPENMETADATA_HOST=
OPENMETADATA_TOKEN=
ENVEOF
    ok "Created blank backend/.env"
  fi
fi

# Helper: upsert a KEY=VALUE line in .env (macOS + Linux compatible)
upsert_env() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # Replace in-place (avoid sed -i incompatibility between macOS/Linux)
    local tmp
    tmp=$(mktemp)
    grep -v "^${key}=" "$file" > "$tmp"
    echo "${key}=${val}" >> "$tmp"
    mv "$tmp" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

upsert_env "OPENMETADATA_HOST"  "$OM_HOST" "$ENV_FILE"
upsert_env "OPENMETADATA_TOKEN" "$TOKEN"   "$ENV_FILE"
ok "OPENMETADATA_HOST and OPENMETADATA_TOKEN written to backend/.env"

ok "Anthropic API key is NOT stored on the server — users supply it via the Settings tab in the UI."
ok "Only OPENMETADATA_HOST and OPENMETADATA_TOKEN are needed in backend/.env"


# ── Step 6: Python venv + seed demo data ─────────────────────────────────────
step 6 "Setting up Python environment and seeding demo data..."

cd "$BACKEND_DIR"

# Create venv if missing
if [ ! -d "venv" ]; then
  echo "     Creating Python virtual environment..."
  python3 -m venv venv
  ok "venv created"
fi

# Activate venv
# shellcheck disable=SC1091
source venv/bin/activate

# Install deps only if fastapi is not yet importable
if ! python3 -c "import fastapi" 2>/dev/null; then
  echo "     Installing Python dependencies (first run only)..."
  pip install -r requirements.txt -q
  ok "Dependencies installed"
else
  ok "Dependencies already installed"
fi

echo ""
python3 setup_demo.py
echo ""
ok "Demo data seeded"

# ── Step 6: Start backend ─────────────────────────────────────────────────────
step 7 "Starting DataSheriff backend..."

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║             Setup Complete ✓                     ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║                                                   ║${NC}"
echo -e "${BOLD}║  Backend  →  http://localhost:8000                ║${NC}"
echo -e "${BOLD}║                                                   ║${NC}"
echo -e "${BOLD}║  Open a NEW terminal, then run:                   ║${NC}"
echo -e "${BOLD}║    cd frontend                                    ║${NC}"
echo -e "${BOLD}║    npm install                                    ║${NC}"
echo -e "${BOLD}║    npm run dev                                    ║${NC}"
echo -e "${BOLD}║                                                   ║${NC}"
echo -e "${BOLD}║  Then open:  http://localhost:5173                ║${NC}"
echo -e "${BOLD}║                                                   ║${NC}"
echo -e "${BOLD}║  Demo queries:                                    ║${NC}"
echo -e "${BOLD}║  • The orders dashboard is showing wrong data     ║${NC}"
echo -e "${BOLD}║  • dim_address table is failing quality checks    ║${NC}"
echo -e "${BOLD}║                                                   ║${NC}"
echo -e "${BOLD}║  First time? Go to ⚙️ Settings and add your       ║${NC}"
echo -e "${BOLD}║  Anthropic API key to start investigating.        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Run uvicorn (foreground — Ctrl+C to stop)
uvicorn main:app --reload --host 0.0.0.0 --port 8000