# DataSheriff — AI Data Incident Investigator

> Describe a broken dashboard in plain English. DataSheriff traces your full data lineage, checks quality tests at every upstream node, identifies the root cause, and auto-tags the failing asset in OpenMetadata — **all in under 30 seconds**.

Built for the **WeMakeDevs × OpenMetadata Hackathon 2026**

---

## 🚀 Try It Live — No Setup Required

| | |
|---|---|
| **Demo Video** | [https://youtu.be/FJjLcWuaQ0M](https://youtu.be/FJjLcWuaQ0M) |
| **GitHub** | [https://github.com/Rituraj-13/DataSheriff](https://github.com/Rituraj-13/DataSheriff) |

> Bring your own Anthropic API key — go to **⚙️ Settings**, paste your `sk-ant-...` key, type any query, and watch the investigation unfold in real time.

---

## 🎯 The Problem — $2.5B Lost to Broken Data Pipelines Every Year

Every data team has the same nightmare: a dashboard goes red at 2 AM, and no one knows why.

The typical debugging workflow looks like this:

1. **Slack fire** — stakeholders ping the data team
2. **Manual triage** — engineers check Airflow DAGs, query upstream tables, search OpenMetadata for owners
3. **3–6 hours later** — root cause found, fix deployed, damage done

**DataSheriff compresses that entire workflow to 30 seconds.**

It does exactly what a senior data engineer would do — but automatically, in parallel, with every finding traceable back to a real API call.

---

## ✨ What Makes It Stand Out

| Capability | How DataSheriff does it |
|---|---|
| **Natural Language Input** | Plain English query, no JSON, no SQL |
| **Live Streaming Investigation** | Every tool call streamed via SSE — watch the agent think |
| **Real Lineage Traversal** | Walks the actual OpenMetadata lineage graph, not hardcoded paths |
| **Evidence-Backed Reports** | Every claim in the report is quoted directly from API output |
| **Auto-Governance Tagging** | Writes `DataQuality.Failing` back to OpenMetadata on root cause |
| **Bring Your Own Key** | Server never touches API keys — zero credit risk for operators |
| **MTTR Tracking** | History dashboard measures your team's mean time to resolution |
| **Honesty Rules** | Agent refuses to invent data — returns null if nothing is found |

---

## 🧠 How It Works

DataSheriff uses a Claude Sonnet 4.6 AI agent equipped with 6 custom MCP tools, each wrapping a real OpenMetadata REST API. Here's a real investigation trace:

```
User: "The orders dashboard is showing wrong data"
        ↓
[Tool 1] search_assets("orders dashboard")
         → Found: sample_looker.orders (Dashboard)

[Tool 2] get_lineage("sample_looker.orders", "dashboard", depth=3)
         → 10-node upstream graph: fact_orders ← dim_address, dim_customer, raw_order, ...

[Tool 3] get_quality_tests("sample_data.ecommerce_db.shopify.fact_orders")
         → 9 tests: 6 passed, 3 FAILED

[Tool 4] get_quality_tests("sample_data.ecommerce_db.shopify.dim_address")
         → FAILED: diff_columns (4 different columns vs production)
         → FAILED: diff_with_production (3 differing rows found)
         → FAILED: column_values_to_be_between (min=1001, expected ≥1000)

[Tool 5] get_asset_owner("sample_data.ecommerce_db.shopify.dim_address")
         → Owner: data-platform-team

[Tool 6] tag_asset_failing("sample_data.ecommerce_db.shopify.dim_address")
         → ✅ Tagged DataQuality.Failing in OpenMetadata

Output: Incident report — root cause: dim_address, 3 failing tests, owner notified
```

**Total time: 12 seconds.**

---

## 🗺️ Architecture

```
User (plain English query + Anthropic API key)
        │
        ▼
React Frontend (Cloudflare Workers)
        │  POST /investigate
        │  Header: X-Anthropic-Key: sk-ant-xxxx
        ▼
FastAPI Backend (DigitalOcean, port 8000)
        │
        ▼
Claude Sonnet 4.6 Agent
        │  @mcp.tool() functions called directly (async Python)
        ▼
OpenMetadata REST APIs (v1.12.5)
   ├── GET  /search/query                     ← find assets by name
   ├── GET  /lineage/{type}/{id}              ← traverse lineage (upstreamDepth=3)
   ├── GET  /dataQuality/testCases            ← check test results per table
   ├── GET  /pipelines/name/{fqn}            ← resolve pipeline ID
   │    └── GET /pipelines/{id}/status       ← fetch run history
   ├── GET  /{entity_type}s/name/{fqn}       ← find asset owner (tables/dashboards/pipelines)
   │    GET  /{entity_type}s/name/{fqn}?fields=tags
   └── PATCH /{entity_type}s/{id}            ← write DataQuality.Failing tag
        │
        ▼
Server-Sent Events stream → React UI updates in real time
```

---

## 🔗 OpenMetadata Integration — In Depth

DataSheriff is built on **6 OpenMetadata API surfaces** used in a coordinated investigation flow:

| MCP Tool | OpenMetadata API | What it unlocks |
|---|---|---|
| `search_assets(query)` | `GET /api/v1/search/query` | Full-text asset search across all entity types |
| `get_lineage(entity_id, type)` | `GET /api/v1/lineage/{entityType}/{id}?upstreamDepth=3` | Multi-hop upstream lineage graph traversal |
| `get_quality_tests(table_fqn)` | `GET /api/v1/dataQuality/testCases` | Per-table test results with failure evidence |
| `get_pipeline_runs(pipeline_fqn)` | `GET /api/v1/pipelines/name/{fqn}` → `GET /api/v1/pipelines/{id}/status` | 2-step: resolve ID then fetch Airflow run history |
| `get_asset_owner(entity_fqn, entity_type)` | `GET /api/v1/{entity_type}s/name/{fqn}` | Ownership resolution for tables, dashboards, pipelines |
| `tag_asset_failing(entity_fqn, entity_type)` | `GET` + `PATCH /api/v1/{entity_type}s/{id}` | Idempotent governance tagging — checks before writing |

The agent dynamically determines which tools to call and in what order based on what it finds. It doesn't follow a script — it reasons from evidence.

---

## 🔑 Key Features

- **Live Investigation Timeline** — every tool call streamed in real time with a confidence score bar climbing 0 → 100%
- **Interactive Lineage Graph** — React Flow visualization; failing nodes highlighted in red with directional arrows
- **Structured Incident Report** — root cause, severity badge, evidence quoted directly from API output, recommended action
- **Auto-Governance Tagging** — writes `DataQuality.Failing` tag back to OpenMetadata at investigation close
- **MTTR History Dashboard** — tracks past investigations, computes mean time to resolution vs 4.2h industry average
- **Severity Trend Chart** — Recharts visualization of incident severity distribution over time
- **Bring Your Own Key** — Anthropic key stored in browser localStorage only, sent as `X-Anthropic-Key` header, never persisted server-side
- **Honesty Rules** — agent refuses to invent lineage or test results; every claim cites a specific tool call

---

## 📋 Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — at least 6 GB RAM allocated
- [Python 3.11+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)
- An [Anthropic API key](https://console.anthropic.com/) — ~$5 credits covers hundreds of investigations

> **⏱️ Total Setup Time:** ~20 minutes (mostly waiting for containers to start)

---

## ⚡ Quick Start (Recommended)

```bash
git clone https://github.com/Rituraj-13/DataSheriff.git
cd DataSheriff
chmod +x seed_and_run.sh
./seed_and_run.sh
```

The script will:
1. Verify Docker is running
2. Start OpenMetadata + Airflow containers
3. Wait for OpenMetadata to be ready (2–5 min)
4. **Pause** and guide you through the manual Airflow + token steps
5. Create the Python venv and install dependencies
6. Run `setup_demo.py` to wire up demo lineage
7. Start the FastAPI backend

Before starting the frontend, open `frontend/src/App.jsx` and update line 18 to point at your local backend:

```js
// Change this (production URL):
const API_BASE = 'https://backend.riturajdey.dev'

// To this (your local backend):
const API_BASE = 'http://localhost:8000'
```

Then in a second terminal:
```bash
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) → **⚙️ Settings** → enter your Anthropic API key → investigate.

---

<details>
<summary><strong>📋 Manual Setup (Step by Step) — click to expand</strong></summary>

<br>

> **💡 Why some steps are manual:** Airflow startup time varies greatly across machines. Manual triggering lets you verify each component is ready before proceeding.

### Step 1 — Clone the repository

```bash
git clone https://github.com/Rituraj-13/DataSheriff.git
cd DataSheriff
```

### Step 2 — Start OpenMetadata + Airflow

```bash
docker compose -f openmetadata-docker/docker-compose-postgres.yml up --detach
```

This starts 5 containers:

| Container | Purpose | Port |
|---|---|---|
| `openmetadata_server` | Main OpenMetadata app | 8585 |
| `openmetadata_ingestion` | Airflow for sample data | 8080 |
| `openmetadata_postgresql` | Metadata database | — |
| `openmetadata_elasticsearch` | Search index | — |
| `execute_migrate_all` | DB migrations (exits after) | — |

**Wait 3–5 minutes**, then verify:

```bash
curl http://localhost:8585/api/v1/system/version
# {"version":"1.12.5", ...}
```

### Step 3 — Load sample data via Airflow

1. Open [http://localhost:8080](http://localhost:8080)
2. Log in: `admin` / `admin`
3. Trigger these 4 DAGs **in order**, waiting for each green ✅ before the next:

   | # | DAG Name | What it loads | Time |
   |---|---|---|---|
   | 1 | `sample_data` | Tables: fact_orders, dim_address, raw_order, dim_customer... | ~2–3 min |
   | 2 | `sample_lineage` | Lineage connections between tables | ~1–2 min |
   | 3 | `sample_usage` | Usage statistics | ~1 min |
   | 4 | `airflow_metadata_extraction` | Syncs Airflow metadata into OpenMetadata | ~1–2 min |

> If a DAG fails (red ❌), click it to see logs and re-trigger.

### Step 4 — Get your OpenMetadata JWT token

1. Open [http://localhost:8585](http://localhost:8585)
2. Log in: `admin@open-metadata.org` / `admin`
3. **Settings** (gear icon) → **Bots** → click `ingestion-bot`
4. Copy the **Token** value

> If you get 401 errors later, the token expired — repeat this step and update `backend/.env`.

### Step 5 — Configure the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Mac/Linux
# .\venv\Scripts\activate     # Windows

pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env`:

```env
OPENMETADATA_HOST=http://localhost:8585
OPENMETADATA_TOKEN=paste-your-token-here
```

> **Note:** `ANTHROPIC_API_KEY` is **not** set here. Users bring their own key via the UI — your server never sees it.

> **Windows + Ollama users:** A conflicting `ANTHROPIC_BASE_URL` system variable will break the connection. Fix it:
> ```powershell
> Remove-Item Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue
> ```

### Step 6 — Seed demo lineage

```bash
cd backend
python3 setup_demo.py
```

This adds two missing lineage edges to make the full investigation chain work:
- `dim_address` → `fact_orders`
- `fact_orders` → `orders` dashboard

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

### Step 8 — Point the frontend at your local backend

Open `frontend/src/App.jsx` and update line 18:

```js
// Change this (production URL):
const API_BASE = 'https://backend.riturajdey.dev'

// To this (your local backend):
const API_BASE = 'http://localhost:8000'
```

### Step 9 — Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Step 10 — Add your Anthropic API key

Click **⚙️ Settings**, enter your `sk-ant-...` key, and click **Save Key**. It's stored in your browser's `localStorage` only — it never leaves your device except as a request header.

**You're ready to investigate.**

</details>

---

## ✅ Verification Checklist

| Component | How to check | Expected result |
|---|---|---|
| **OpenMetadata** | `curl http://localhost:8585/api/v1/system/version` | `{"version":"1.12.5",...}` |
| **Airflow** | Open http://localhost:8080 | 4 DAGs green ✅ |
| **Backend** | `curl http://localhost:8000/health` | `{"status":"ok","service":"DataSheriff"}` |
| **Frontend** | Open http://localhost:5173 | DataSheriff UI loads |
| **Sample Data** | Search `fact_orders` in OpenMetadata | Table with lineage visible |
| **Quality Tests** | View `dim_address` in OpenMetadata | 3 failing tests visible |

---

## 🎮 Using DataSheriff

### Recommended demo queries

| Query | What the agent finds |
|---|---|
| `The orders dashboard is showing wrong data` | Full 10-node lineage chain + dim_address root cause (3 failing tests) |
| `dim_address table is failing data quality checks` | 3 failing tests directly on dim_address |
| `raw_customer table has incorrect data` | Traces lineage upstream → finds dim_address failures |
| `The fact_orders table has missing data` | Traverses fact_orders lineage → dim_address |
| `The payments dashboard is showing wrong numbers` | Honest null report — asset not found in OpenMetadata |

### The 8-step investigation workflow

1. **Search** — finds the asset in OpenMetadata by name
2. **Traverse lineage** — walks the upstream graph, up to 10+ nodes
3. **Check quality tests** — runs `get_quality_tests` on every table in the chain
4. **Check pipeline runs** — inspects Airflow execution history for pipeline nodes
5. **Identify root cause** — first node where quality tests show `Failed`
6. **Find the owner** — resolves the data owner to contact
7. **Tag the asset** — writes `DataQuality.Failing` governance tag in OpenMetadata
8. **Generate report** — structured incident report, every claim traceable to a tool call

### What you'll see in the UI

- **Confidence bar** — climbs 0% → 100% as investigation progresses
- **Live timeline** — each tool call appears as it happens, with inputs shown
- **Lineage graph** — interactive React Flow diagram; failing node highlighted in red
- **Incident report** — severity badge, root cause, evidence, lineage path, recommended action
- **History dashboard** — MTTR chart, severity trend, replay any past investigation

---

## 📁 Project Structure

```
DataSheriff/
├── seed_and_run.sh                    ← one-command setup
├── openmetadata-docker/
│   └── docker-compose-postgres.yml   ← OpenMetadata + Airflow stack
├── backend/
│   ├── agent.py                       ← Claude AI investigation agent
│   ├── main.py                        ← FastAPI server + SSE streaming
│   ├── mcp_server.py                  ← 6 MCP tools → OpenMetadata APIs
│   ├── setup_demo.py                  ← one-time lineage seeding script
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                           ← OM token only
└── frontend/
    └── src/
        ├── App.jsx                    ← main app, SSE handler, tab routing
        ├── hooks/
        │   ├── useHistory.js          ← investigation history + MTTR stats
        │   └── useApiKey.js           ← localStorage API key management
        └── components/
            ├── InvestigationTimeline.jsx  ← live stream + confidence bar
            ├── LineageGraph.jsx           ← React Flow lineage visualization
            ├── ReportCard.jsx             ← incident report display
            ├── HistoryDashboard.jsx       ← MTTR history + severity charts
            └── SettingsPage.jsx           ← API key management UI
```

---

## 🔐 API Key Security Architecture

DataSheriff is zero-trust by design — the server operator never needs to manage Anthropic API keys:

```
User's browser
  └── localStorage: sk-ant-xxxx    ← only copy, never sent to server storage

  POST /investigate
  Header: X-Anthropic-Key: sk-ant-xxxx   ← sent per-request in header
        ↓
  FastAPI extracts header → passes to Claude agent
        ↓
  Anthropic API called with user's key
        ↓
  SSE stream → browser
```

The server only needs `OPENMETADATA_TOKEN` in `.env`. Each user pays for their own Claude usage. No shared keys, no credit risk, no liability.

---

## 🧩 MCP Tools Reference

All 6 tools are implemented as `@mcp.tool()` async Python functions in `backend/mcp_server.py`, invoked directly by the agent loop in `backend/agent.py`.

| Tool | HTTP calls made | Purpose |
|---|---|---|
| `search_assets(query)` | `GET /api/v1/search/query` | Full-text search across tables, dashboards, pipelines, topics |
| `get_lineage(entity_id, entity_type)` | `GET /api/v1/lineage/{type}/{id}?upstreamDepth=3&downstreamDepth=1` | Walk upstream lineage graph up to 3 hops |
| `get_quality_tests(table_fqn)` | `GET /api/v1/dataQuality/testCases?entityLink=<#E::table::fqn>` | Fetch latest test results (pass/fail/aborted) per table |
| `get_pipeline_runs(pipeline_fqn)` | `GET /api/v1/pipelines/name/{fqn}` → `GET /api/v1/pipelines/{id}/status` | Resolve pipeline by FQN, then fetch last 10 run statuses |
| `get_asset_owner(entity_fqn, entity_type)` | `GET /api/v1/{entity_type}s/name/{fqn}?fields=owner` | Resolve owner (user or team) for any entity type |
| `tag_asset_failing(entity_fqn, entity_type)` | `GET /api/v1/{entity_type}s/name/{fqn}?fields=tags` → `PATCH /api/v1/{entity_type}s/{id}` | Idempotent: reads existing tags, skips if already tagged, otherwise writes `DataQuality.Failing` via JSON-Patch |

All tools are async, fault-tolerant, and return structured JSON that the agent reasons over.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| AI Agent | Claude Sonnet 4.6 (Anthropic) |
| Agent Protocol | MCP (Model Context Protocol) via FastMCP |
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
| Frontend Hosting | Cloudflare Workers |
| Backend Hosting | DigitalOcean Droplet |

---


## 🔗 Built With

- [OpenMetadata](https://open-metadata.org/) — open source data catalog and governance platform
- [Anthropic Claude](https://anthropic.com/) — AI backbone for the investigation agent
- [WeMakeDevs × OpenMetadata Hackathon 2026](https://www.wemakedevs.org/hackathons/openmetadata)

---

## 📄 License

MIT
