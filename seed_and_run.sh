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

TOTAL_STEPS=5

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

echo ""
echo -e "${YELLOW}${BOLD}IMPORTANT:${NC} Complete the following manual steps before continuing:"
echo ""
echo -e "${BOLD}Step A: Load Sample Data via Airflow${NC}"
echo "  1. Open http://localhost:8080 in your browser"
echo "  2. Log in with username: ${BOLD}admin${NC} / password: ${BOLD}admin${NC}"
echo "  3. Trigger these 4 DAGs in order (click ▷ on each):"
echo "     • sample_data"
echo "     • sample_lineage"
echo "     • sample_usage"
echo "     • airflow_metadata_extraction"
echo "  4. Wait for each DAG to show a green ✅ before triggering the next"
echo ""
echo -e "${BOLD}Step B: Get Your OpenMetadata JWT Token${NC}"
echo "  1. Open http://localhost:8585 in your browser"
echo "  2. Log in with username: ${BOLD}admin@open-metadata.org${NC} / password: ${BOLD}admin${NC}"
echo "  3. Go to Settings (⚙️ gear icon) → Bots"
echo "  4. Click on ${BOLD}ingestion-bot${NC}"
echo "  5. Copy the Token displayed"
echo ""
echo -e "${BOLD}Step C: Configure Backend${NC}"
echo "  1. Create backend/.env from the example:"
echo "     cp backend/.env.example backend/.env"
echo "  2. Edit backend/.env and set:"
echo "     • OPENMETADATA_HOST=http://localhost:8585"
echo "     • OPENMETADATA_TOKEN=<paste your token from Step B>"
echo ""
echo -e "${YELLOW}Press Enter when you've completed Steps A, B, and C...${NC}"
read -r

# ── Step 4: Create .env file if it doesn't exist ──────────────────────────────
step 4 "Verifying backend configuration..."

ENV_FILE="$BACKEND_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  err "backend/.env not found. Please create it from .env.example and configure the token."
  echo ""
  echo "  Run: cp backend/.env.example backend/.env"
  echo "  Then edit backend/.env to add your OPENMETADATA_TOKEN"
  exit 1
fi

# Check if token is set
if ! grep -q "^OPENMETADATA_TOKEN=..*" "$ENV_FILE" 2>/dev/null; then
  err "OPENMETADATA_TOKEN not set in backend/.env"
  echo ""
  echo "  Please edit backend/.env and add your token from Step B above."
  exit 1
fi

ok "backend/.env exists and OPENMETADATA_TOKEN is configured"

# ── Step 5: Python venv + seed demo data ─────────────────────────────────────
step 5 "Setting up Python environment and seeding demo data..."

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

# ── Final: Start backend ──────────────────────────────────────────────────────
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