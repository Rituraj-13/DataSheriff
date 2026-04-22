"""
DataSheriff MCP Server
Wraps OpenMetadata REST APIs as async MCP tools for the Claude agent.
"""

import os
import json
from typing import Any
import httpx
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

load_dotenv()

OPENMETADATA_HOST = os.getenv("OPENMETADATA_HOST", "http://localhost:8585")
OPENMETADATA_TOKEN = os.getenv("OPENMETADATA_TOKEN", "")

mcp = FastMCP("DataSheriff")

# ─── Shared HTTP client factory ────────────────────────────────────────────────

def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {OPENMETADATA_TOKEN}",
        "Content-Type": "application/json",
    }


async def _get(path: str, params: dict | None = None) -> dict | list:
    """Generic async GET against OpenMetadata API."""
    url = f"{OPENMETADATA_HOST}/api/v1{path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=_headers(), params=params)
        response.raise_for_status()
        return response.json()


# ─── Tool 1: search_assets ─────────────────────────────────────────────────────

@mcp.tool()
async def search_assets(query: str) -> str:
    """
    Search OpenMetadata for data assets (tables, dashboards, pipelines, topics)
    matching the given plain-English query.

    Args:
        query: Search term, e.g. "revenue dashboard" or "raw_orders"

    Returns:
        JSON string with list of matching assets (fqn, type, description, owner).
    """
    try:
        data = await _get(
            "/search/query",
            params={
                "q": query,
                "index": "dataAsset",
                "from": 0,
                "size": 10,
                "deleted": False,
            },
        )
        hits = data.get("hits", {}).get("hits", [])
        results = []
        for hit in hits:
            src = hit.get("_source", {})
            results.append(
                {
                    "id": src.get("id"),
                    "fqn": src.get("fullyQualifiedName"),
                    "name": src.get("name"),
                    "entity_type": src.get("entityType"),
                    "description": src.get("description", ""),
                    "owner": src.get("owner", {}).get("name") if src.get("owner") else None,
                    "tags": [t.get("tagFQN") for t in src.get("tags", [])],
                }
            )
        return json.dumps({"assets": results, "total": len(results)})
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}", "assets": []})
    except Exception as e:
        return json.dumps({"error": str(e), "assets": []})


# ─── Tool 2: get_lineage ───────────────────────────────────────────────────────

@mcp.tool()
async def get_lineage(entity_id: str, entity_type: str = "table") -> str:
    """
    Fetch the upstream lineage graph for a data asset, traversing up to 3 hops.

    Args:
        entity_id: The GUID of the entity (from search_assets result).
        entity_type: One of 'table', 'dashboard', 'pipeline', 'topic'.

    Returns:
        JSON with nodes and edges of the lineage graph.
    """
    try:
        data = await _get(
            f"/lineage/{entity_type}/{entity_id}",
            params={"upstreamDepth": 3, "downstreamDepth": 1},
        )
        nodes = []
        edges = []

        seen_ids = set()
        root = data.get("entity", {})
        root_id = root.get("id")

        for node in data.get("nodes", []):
            node_id = node.get("id")
            if node_id not in seen_ids:
                seen_ids.add(node_id)
                nodes.append({
                    "id": node_id,
                    "fqn": node.get("fullyQualifiedName"),
                    "name": node.get("name"),
                    "type": node.get("type"),
                    "is_root": node_id == root_id,  # mark root correctly
                })

        for edge_group in data.get("upstreamEdges", []):
            edges.append(
                {
                    "from_id": edge_group.get("fromEntity"),
                    "to_id": edge_group.get("toEntity"),
                    "direction": "upstream",
                }
            )

        for edge_group in data.get("downstreamEdges", []):
            edges.append(
                {
                    "from_id": edge_group.get("fromEntity"),
                    "to_id": edge_group.get("toEntity"),
                    "direction": "downstream",
                }
            )

        return json.dumps({"nodes": nodes, "edges": edges})
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}", "nodes": [], "edges": []})
    except Exception as e:
        return json.dumps({"error": str(e), "nodes": [], "edges": []})


# ─── Tool 3: get_quality_tests ─────────────────────────────────────────────────

@mcp.tool()
async def get_quality_tests(table_fqn: str) -> str:
    """
    Fetch the latest data quality test results for a specific table.

    Args:
        table_fqn: Fully qualified name of the table, e.g.
                   "sample_data.ecommerce_db.shopify.raw_orders"

    Returns:
        JSON with list of test cases and their latest results (pass/fail/aborted).
    """
    try:
        # List test cases for the table
        tests_data = await _get(
            "/dataQuality/testCases",
            params={
                "entityLink": f"<#E::table::{table_fqn}>",
                "limit": 50,
                "includeAllTests": True,
                "fields": "testCaseResult",
            },
        )
        test_cases = tests_data.get("data", [])
        results = []
        for tc in test_cases:
            latest = tc.get("testCaseResult", {})
            results.append(
                {
                    "test_name": tc.get("name"),
                    "test_type": tc.get("testDefinition", {}).get("name", ""),
                    "status": latest.get("testCaseStatus", "unknown"),
                    "result": latest.get("result", ""),
                    "timestamp": latest.get("timestamp"),
                    "failure_reason": latest.get("failureReason", ""),
                }
            )
        passing = sum(1 for r in results if r["status"] == "Success")
        failing = sum(1 for r in results if r["status"] == "Failed")
        return json.dumps(
            {
                "table_fqn": table_fqn,
                "total_tests": len(results),
                "passing": passing,
                "failing": failing,
                "tests": results,
            }
        )
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}", "tests": []})
    except Exception as e:
        return json.dumps({"error": str(e), "tests": []})


# ─── Tool 4: get_pipeline_runs ─────────────────────────────────────────────────

@mcp.tool()
async def get_pipeline_runs(pipeline_fqn: str) -> str:
    """
    Fetch recent execution history for a pipeline (Airflow DAG or similar).

    Args:
        pipeline_fqn: Fully qualified name of the pipeline, e.g.
                      "airflow.shopify_etl"

    Returns:
        JSON with last 10 pipeline run statuses, timestamps, and any logged errors.
    """
    try:
        # First resolve pipeline ID
        pipeline_data = await _get(
            f"/pipelines/name/{pipeline_fqn}",
            params={"fields": "pipelineStatus"},
        )
        pipeline_id = pipeline_data.get("id")
        name = pipeline_data.get("name", pipeline_fqn)

        # Fetch execution history
        runs_data = await _get(
            f"/pipelines/{pipeline_id}/status",
            params={"startTs": 0, "endTs": 9999999999999, "limit": 10},
        )
        runs = runs_data.get("data", [])
        results = []
        for run in runs:
            results.append(
                {
                    "run_id": run.get("runId"),
                    "state": run.get("executionStatus"),
                    "start_time": run.get("startDate"),
                    "end_time": run.get("endDate"),
                    "task_runs": [
                        {
                            "task": t.get("name"),
                            "status": t.get("executionStatus"),
                        }
                        for t in run.get("taskStatus", [])
                    ],
                }
            )
        failed_runs = [r for r in results if r["state"] in ("Failed", "Failure")]
        return json.dumps(
            {
                "pipeline_name": name,
                "total_runs": len(results),
                "failed_runs": len(failed_runs),
                "runs": results,
            }
        )
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}", "runs": []})
    except Exception as e:
        return json.dumps({"error": str(e), "runs": []})


# ─── Tool 5: get_asset_owner ───────────────────────────────────────────────────

@mcp.tool()
async def get_asset_owner(entity_fqn: str, entity_type: str = "table") -> str:
    """
    Get the owner (person or team) responsible for a data asset.

    Args:
        entity_fqn: Fully qualified name of the asset.
        entity_type: One of 'table', 'dashboard', 'pipeline'.

    Returns:
        JSON with owner name, type (user/team), and email if available.
    """
    try:
        entity_type_plural = {
            "table": "tables",
            "dashboard": "dashboards",
            "pipeline": "pipelines",
            "topic": "topics",
        }.get(entity_type, f"{entity_type}s")

        data = await _get(
            f"/{entity_type_plural}/name/{entity_fqn}",
            params={"fields": "owner,followers"},
        )
        owner = data.get("owner")
        if not owner:
            return json.dumps({"entity_fqn": entity_fqn, "owner": None, "message": "No owner assigned"})

        return json.dumps(
            {
                "entity_fqn": entity_fqn,
                "owner": {
                    "name": owner.get("name"),
                    "display_name": owner.get("displayName"),
                    "type": owner.get("type"),  # "user" or "team"
                    "email": owner.get("email"),
                },
            }
        )
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    mcp.run()
