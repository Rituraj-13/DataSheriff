# 🔍 DataSheriff — AI Data Incident Investigator

> Describe a broken dashboard in plain English. DataSheriff traces your full data lineage, checks quality tests at every upstream node, identifies the root cause, and auto-tags the failing asset — all in under 30 seconds.

Built for the **WeMakeDevs × OpenMetadata Hackathon 2026**

---

## The Problem

When a data pipeline breaks and a dashboard shows wrong numbers, engineers spend **3–6 hours** manually hunting through Airflow, SQL queries, and Slack threads to find the root cause.

DataSheriff reduces that to **30 seconds** — powered by Claude AI + OpenMetadata's lineage, quality, and governance APIs.

---

## Demo

**Input:**
> "The orders dashboard is showing wrong data"

**Output:** A full incident report with root cause, evidence quoted directly from real quality tests, lineage path, asset owner, recommended action — and the root cause asset automatically tagged as `DataQuality.Failing` in OpenMetadata.

---

## Architecture

```
User (plain English query + their Anthropic API key)
        ↓
React Frontend (port 5173)
        ↓ POST /investigate  +  X-Anthropic-Key header
FastAPI Backend (port 8000)
        ↓
Claude Sonnet 4.6 Agent  ←  user's own API key (never stored on server)
        ↓ 6 MCP Tools
OpenMetadata REST APIs (port 8585)
  ├── search_assets()       → find the broken asset
  ├── get_lineage()         → trace upstream dependency graph
  ├── get_quality_tests()   → check test results at every node
  ├── get_pipeline_runs()   → check pipeline execution history
  ├── get_asset_owner()     → find who to contact
  └── tag_asset_failing()   → auto-tag root cause as DataQuality.Failing
```

---

## Key Features

- **Live Investigation Timeline** — every tool call streamed in real time with a confidence score bar (0 → 100%)
- **Interactive Lineage Graph** — React Flow visualization with failing nodes highlighted in red and directional arrows
- **Incident Report** — structured JSON with root cause, evidence quoted directly from API output, severity, and recommended action
- **Auto-Governance Tagging** — automatically tags the root cause asset as `DataQuality.Failing` in OpenMetadata
- **MTTR History Dashboard** — tracks every past investigation with timing, shows average MTTR vs 4.2h industry average
- **Severity Trend Chart** — visualizes incident severity distribution across investigations
- **Bring Your Own Key** — users supply their own Anthropic API key via the Settings tab; it's stored in their browser's localStorage and never touched by the server
- **Honesty Rules** — agent never invents lineage or test results; every claim in the report is traceable to a specific tool call

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — at least 6 GB RAM allocated
- [Python 3.11+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)
- An [Anthropic API key](https://console.anthropic.com/) — add ~$5 credits (covers hundreds of investigations)

---

## Quick Start (One Command)

The fastest way to get running:

```bash
git clone https://github.com/your-username/DataSheriff.git
cd DataSheriff
chmod +x seed_and_run.sh
./seed_and_run.sh
```

This single script:
1. Checks Docker is running
2. Starts OpenMetadata containers
3. Waits for OpenMetadata to be ready
4. Triggers all 4 Airflow sample data DAGs automatically
5. Fetches your OpenMetadata token and writes it to `backend/.env`
6. Sets up the Python venv and installs dependencies
7. Runs `setup_demo.py` to wire up the demo lineage
8. Starts the FastAPI backend

Then in a new terminal:
```bash
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173), go to **⚙️ Settings**, add your Anthropic API key, and start investigating.

---

## Manual Setup (Step by Step)

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-username/DataSheriff.git
cd DataSheriff
```

### Step 2 — Start OpenMetadata

```bash
docker compose -f openmetadata-docker/docker-compose-postgres.yml up --detach
```

This starts 5 containers:
- `openmetadata_server` — main app on port 8585
- `openmetadata_ingestion` — Airflow on port 8080
- `openmetadata_postgresql` — metadata database
- `openmetadata_elasticsearch` — search index
- `execute_migrate_all` — runs DB migrations once then exits

**Wait 3–5 minutes** for everything to start. Verify:

```bash
curl http://localhost:8585/api/v1/system/version
# {"version":"1.12.5", ...}
```

### Step 3 — Load sample data via Airflow

1. Open [http://localhost:8080](http://localhost:8080) — log in as `admin` / `admin`
2. Go to **DAGs** and trigger each in this order by clicking ▷:

   | DAG | What it does |
   |-----|-------------|
   | `sample_data` | Loads tables: fact_orders, dim_address, raw_order, dim_customer etc. |
   | `sample_lineage` | Creates lineage connections between tables |
   | `sample_usage` | Loads usage statistics |
   | `airflow_metadata_extraction` | Syncs Airflow pipeline metadata into OpenMetadata |

3. Wait for each DAG to show a **green ✅** before triggering the next

### Step 4 — Get your OpenMetadata token

```bash
curl -s -X POST "http://localhost:8585/api/v1/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@open-metadata.org","password":"admin"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])"
```

> **Alternative:** OpenMetadata UI → Settings → Bots → ingestion-bot → copy the token.

### Step 5 — Configure the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Mac/Linux
# .\venv\Scripts\activate     # Windows

pip install -r requirements.txt
cp .env.example .env
```

Open `backend/.env` and set:

```env
OPENMETADATA_HOST=http://localhost:8585
OPENMETADATA_TOKEN=paste-your-token-here
```

> **Note:** `ANTHROPIC_API_KEY` is **not needed** in `.env`. Users supply their own key via the Settings tab in the UI — it's stored in their browser only and sent as a request header. Your server credentials are never at risk.

> **Windows + Ollama users:** If you have `ANTHROPIC_BASE_URL` set as a system environment variable (common with Ollama), it will break the API connection. Fix it:
> ```powershell
> Remove-Item Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue
> ```

### Step 6 — Run the demo setup script

```bash
cd backend
python3 setup_demo.py
```

This script dynamically finds your OpenMetadata assets by name and adds two missing lineage links:
- `fact_orders` → `orders` dashboard
- `dim_address` → `fact_orders`

Expected output:
```
DataSheriff — Demo Setup
==================================================
Step 1: Verifying OpenMetadata connection
  OK  OpenMetadata 1.12.5 is running at http://localhost:8585

Step 2: Locating assets in sample data
  OK  Orders dashboard  : sample_looker.orders
  OK  fact_orders table : sample_data.ecommerce_db.shopify.fact_orders
  OK  fact_orders has 9 upstream nodes already in lineage
  OK  Quality tests     : 9 total, 3 already failing

Step 3: Adding lineage — fact_orders -> orders dashboard
  OK  Linked: sample_data.ecommerce_db.shopify.fact_orders -> sample_looker.orders
  OK  Linked: dim_address -> fact_orders

Step 4: Verifying final state
  OK  fact_orders upstream nodes : 10
  OK  fact_orders downstream     : 3 connection(s) to dashboard
  OK  Failing quality tests      : 3
       - diff_columns: Tables have 4 different columns...
       - diff_with_production: Found 3 different rows...
       - column_values_to_be_between_with_sample_rows: Found min=1001...
```

### Step 7 — Start the backend

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Verify:
```bash
curl http://localhost:8000/health
# {"status":"ok","service":"DataSheriff"}
```

### Step 8 — Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Step 9 — Add your Anthropic API key

Click **⚙️ Settings** in the top navigation. Enter your `sk-ant-...` key and click **Save Key**. Your key is stored in your browser's localStorage — it never leaves your device except as a request header.

You're ready to investigate.

---

## Using DataSheriff

### Demo queries

| Query | Works without setup_demo.py? | What the agent finds |
|-------|------------------------------|---------------------|
| `dim_address table is failing data quality checks` | ✅ Yes | 3 real failing tests directly on dim_address |
| `raw_customer table has incorrect data` | ✅ Yes | Traces lineage → finds dim_address failures |
| `The orders dashboard is showing wrong data` | After setup_demo.py | Full 10-node lineage chain + dim_address root cause |
| `The fact_orders table has missing data` | After setup_demo.py | Traces fact_orders → dim_address |
| `The payments dashboard is showing wrong numbers` | ✅ Yes | Honest null report — asset not found |

### What the agent does

1. **Searches** OpenMetadata for the asset mentioned in the query
2. **Traverses lineage** upstream — finds all tables feeding into the asset
3. **Checks quality tests** on every table in the chain
4. **Checks pipeline runs** for any pipelines in lineage
5. **Identifies root cause** — first node where tests show `Failed`
6. **Finds the owner** — who to contact
7. **Tags the asset** — applies `DataQuality.Failing` tag in OpenMetadata
8. **Generates report** — structured JSON, every claim backed by tool output

### What you'll see

- **Confidence bar** — climbs from 0% to 100% as the investigation progresses
- **Live timeline** — each tool call appears in real time with its inputs
- **Lineage graph** — interactive React Flow diagram, failing node highlighted in red with directional arrows
- **Incident report** — severity badge, root cause, evidence, lineage path, failing tests, recommended action
- **History tab** — MTTR stats, severity trend chart, replay any past investigation

---

## Project Structure

```
DataSheriff/
├── seed_and_run.sh                    ← one command to set up everything
├── openmetadata-docker/
│   └── docker-compose-postgres.yml   ← starts OpenMetadata + Airflow
├── backend/
│   ├── agent.py                       ← Claude AI investigation agent
│   ├── main.py                        ← FastAPI server with SSE streaming
│   ├── mcp_server.py                  ← 6 MCP tools wrapping OpenMetadata APIs
│   ├── setup_demo.py                  ← one-time demo data setup
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                           ← OM token only (not committed)
└── frontend/
    └── src/
        ├── App.jsx                    ← main app, SSE handler, tab navigation
        ├── hooks/
        │   ├── useHistory.js          ← investigation history + MTTR stats
        │   └── useApiKey.js           ← API key localStorage management
        └── components/
            ├── InvestigationTimeline.jsx  ← live stream + confidence bar
            ├── LineageGraph.jsx           ← React Flow lineage visualization
            ├── ReportCard.jsx             ← incident report display
            ├── HistoryDashboard.jsx       ← MTTR history + severity charts
            └── SettingsPage.jsx           ← API key management UI
```

---

## MCP Tools

DataSheriff uses 6 custom MCP tools wrapping OpenMetadata's REST APIs:

| Tool | OpenMetadata API | Purpose |
|------|-----------------|---------|
| `search_assets(query)` | `GET /search/query` | Find assets by name |
| `get_lineage(entity_id, entity_type)` | `GET /lineage/{type}/{id}` | Trace upstream graph |
| `get_quality_tests(table_fqn)` | `GET /dataQuality/testCases` | Check test results |
| `get_pipeline_runs(pipeline_fqn)` | `GET /pipelines/{id}/status` | Check run history |
| `get_asset_owner(entity_fqn)` | `GET /tables/name/{fqn}` | Find data owner |
| `tag_asset_failing(entity_fqn)` | `PATCH /tables/{id}` | Apply DataQuality.Failing tag |

---

## API Key Architecture

DataSheriff is designed so the server operator never needs to store or manage Anthropic API keys:

```
User's browser
  └── localStorage: sk-ant-xxxx  ← stored here only
        ↓
  POST /investigate
  Header: X-Anthropic-Key: sk-ant-xxxx   ← sent as header
        ↓
  FastAPI reads header → passes to Claude agent
        ↓
  Claude API called with user's key
```

The server only needs `OPENMETADATA_TOKEN` in its `.env`. Each user pays for their own Claude usage. No shared API key, no credit risk.

---

## Troubleshooting

**Investigation fails with "Invalid Anthropic API key"**

Go to ⚙️ Settings and verify your key starts with `sk-ant-` and has been saved correctly.

**`Connection error` from the backend**

Check for a conflicting `ANTHROPIC_BASE_URL` environment variable (common with Ollama):
```powershell
echo $env:ANTHROPIC_BASE_URL          # Windows
echo $ANTHROPIC_BASE_URL              # Mac/Linux
```
If set, clear it and restart uvicorn.

**OpenMetadata not reachable after `docker compose up`**

Takes 3–5 minutes on first run. Watch:
```bash
docker compose -f openmetadata-docker/docker-compose-postgres.yml logs -f openmetadata_server
```
Wait until you see `Started ServerConnector`.

**Sample data not appearing in OpenMetadata**

Trigger the 4 Airflow DAGs in order and wait for each green ✅. Re-trigger any that failed.

**Token expired (401 errors from backend)**

```bash
curl -s -X POST "http://localhost:8585/api/v1/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@open-metadata.org","password":"admin"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])"
```
Update `OPENMETADATA_TOKEN` in `backend/.env` and restart uvicorn.

**`setup_demo.py` says "orders dashboard not found"**

The `sample_data` DAG hasn't finished. Wait for green ✅ then re-run `python3 setup_demo.py`.

**DataQuality.Failing tag fails to apply**

The tag classification must exist in OpenMetadata first. Go to Govern → Classifications → create a classification called `DataQuality` with a tag called `Failing`. Then re-run an investigation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Agent | Claude Sonnet 4.6 (Anthropic) |
| Agent Protocol | MCP (Model Context Protocol) |
| Backend | Python 3.11, FastAPI, uvicorn |
| HTTP Client | httpx (async) |
| Streaming | Server-Sent Events (SSE) |
| Frontend | React 18, Vite, Tailwind CSS |
| Graph Visualization | React Flow |
| Charts | Recharts |
| Data Catalog | OpenMetadata 1.12.5 |
| Pipeline Orchestration | Apache Airflow 2.x |
| Database | PostgreSQL |
| Search | Elasticsearch |

---

## Built With

- [OpenMetadata](https://open-metadata.org/) — open source data catalog and governance platform
- [Anthropic Claude](https://anthropic.com/) — AI backbone for the investigation agent
- [WeMakeDevs × OpenMetadata Hackathon](https://www.wemakedevs.org/hackathons/openmetadata)

---

## License

MIT