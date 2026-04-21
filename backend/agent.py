"""
DataSheriff Agent
Orchestrates the Claude AI agent that uses MCP tools to investigate data incidents.
Streams intermediate steps via an async generator.
"""

import json
import os
from typing import AsyncGenerator
import anthropic
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-6"

# ─── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are DataSheriff, an elite AI data incident investigator.

=== HONESTY RULES — HIGHEST PRIORITY ===
- NEVER invent, infer, or assume ANY data not explicitly returned by a tool call
- NEVER guess table names, FQNs, lineage paths, or owners
- If get_lineage() returns 0 nodes: report "No lineage configured" — do not guess upstream tables
- If get_quality_tests() returns no results: report "Tests exist but have never been run"
- If get_pipeline_runs() returns an error: skip it, do not invent pipeline status
- "aim for 3+ hops" does NOT mean invent hops that don't exist — stop when the API stops returning nodes
- Every single field in the final report must be traceable to a specific tool call result

=== INVESTIGATION STEPS ===
Follow these steps in order. Use tools — never answer from memory.

1. SEARCH
   Call search_assets(query) with the asset name from the user's message.
   If nothing is found, report that clearly and stop.

2. LINEAGE
   Call get_lineage(entity_id, entity_type) on the found asset.
   Traverse upstream as far as the API returns — do not go beyond what it returns.
   Note every node the API returns. If it returns 0 nodes, state that explicitly.

3. QUALITY TESTS
   Call get_quality_tests(table_fqn) on EVERY table node from lineage.
   Record exact status values: "Success", "Failed", "Aborted", or "no result".
   Do not interpret or assume — only report what the API returns.

4. PIPELINE RUNS
   Call get_pipeline_runs(pipeline_fqn) for any pipeline nodes found in lineage.
   If a pipeline FQN is unavailable or returns an error, skip and note it was skipped.

5. ROOT CAUSE
   Identify the earliest node in the lineage chain where tests show status="Failed".
   If no tests are failing, say so honestly. Do not fabricate a root cause.

6. OWNERSHIP
   Call get_asset_owner(entity_fqn) on the root cause asset only.
   If the API returns no owner, report "No owner assigned".

7. REPORT
   Output the JSON report below. Leave fields null if the data was not returned by tools.

=== OUTPUT FORMAT ===
Output ONLY this JSON object, no other text before or after it:
{
  "root_cause": "<one sentence — only if supported by tool output, else null>",
  "affected_asset": "<FQN from search_assets result>",
  "root_cause_asset": "<FQN of first failing node from get_lineage + get_quality_tests, else null>",
  "owner": "<name from get_asset_owner result, else null>",
  "owner_email": "<email from get_asset_owner result, else null>",
  "failure_time": "<timestamp from test result or pipeline run, else null>",
  "evidence": "<direct quote from tool output — e.g. exact test failure message returned by API>",
  "lineage_path": ["<only nodes actually returned by get_lineage — no invented nodes>"],
  "failing_tests": [{"test": "<name>", "table": "<fqn>", "status": "<exact status from API>"}],
  "recommended_action": "<concrete step based on findings, or null if insufficient data>",
  "severity": "<Critical|High|Medium|Low — based on number of failing tests and lineage depth>",
  "investigation_complete": true
}

If the investigation could not find sufficient data to identify a root cause, still output the
JSON with null for unknown fields and set investigation_complete to true. Never leave the
JSON out of your response.
"""

# ─── SSE event builder ─────────────────────────────────────────────────────────

def _sse(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event string."""
    payload = json.dumps({"type": event_type, **data})
    return f"data: {payload}\n\n"


# ─── Agent runner ──────────────────────────────────────────────────────────────

async def run_investigation(query: str) -> AsyncGenerator[str, None]:
    """
    Run the DataSheriff investigation agent for the given user query.
    Yields SSE-formatted strings for streaming to the frontend.

    Event types emitted:
      - "step"   : {"step": int, "title": str, "detail": str}
      - "tool_call": {"tool": str, "input": dict}
      - "tool_result": {"tool": str, "result": str}
      - "thinking": {"text": str}
      - "report"  : {"report": dict}
      - "error"   : {"message": str}
      - "done"    : {}
    """
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    # Import tools from MCP server module (run as in-process for simplicity)
    from mcp_server import (
        search_assets,
        get_lineage,
        get_quality_tests,
        get_pipeline_runs,
        get_asset_owner,
    )

    # Tool registry
    tool_registry = {
        "search_assets": search_assets,
        "get_lineage": get_lineage,
        "get_quality_tests": get_quality_tests,
        "get_pipeline_runs": get_pipeline_runs,
        "get_asset_owner": get_asset_owner,
    }

    # Claude tool definitions (matching mcp_server signatures)
    tools = [
        {
            "name": "search_assets",
            "description": "Search OpenMetadata for data assets matching a query. Returns id, fqn, type.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search term, e.g. 'revenue dashboard'"}
                },
                "required": ["query"],
            },
        },
        {
            "name": "get_lineage",
            "description": "Fetch upstream lineage for a data asset (3 hops). Returns nodes and edges.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "entity_id": {"type": "string", "description": "GUID of the entity"},
                    "entity_type": {
                        "type": "string",
                        "enum": ["table", "dashboard", "pipeline", "topic"],
                        "description": "Type of the entity",
                    },
                },
                "required": ["entity_id"],
            },
        },
        {
            "name": "get_quality_tests",
            "description": "Get latest DQ test results for a table. Returns passing/failing counts and details.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "table_fqn": {"type": "string", "description": "Fully qualified table name"}
                },
                "required": ["table_fqn"],
            },
        },
        {
            "name": "get_pipeline_runs",
            "description": "Get recent pipeline execution history. Returns run states and timestamps.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pipeline_fqn": {"type": "string", "description": "Fully qualified pipeline name"}
                },
                "required": ["pipeline_fqn"],
            },
        },
        {
            "name": "get_asset_owner",
            "description": "Get the owner (user or team) of a data asset.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "entity_fqn": {"type": "string", "description": "Fully qualified entity name"},
                    "entity_type": {
                        "type": "string",
                        "enum": ["table", "dashboard", "pipeline", "topic"],
                    },
                },
                "required": ["entity_fqn"],
            },
        },
    ]

    messages: list[dict] = [{"role": "user", "content": query}]
    step = 0
    step_titles = {
        "search_assets": "🔍 Searching for affected asset",
        "get_lineage": "🕸️ Traversing lineage graph",
        "get_quality_tests": "🧪 Checking data quality tests",
        "get_pipeline_runs": "⚙️ Checking pipeline run history",
        "get_asset_owner": "👤 Looking up asset owner",
    }

    yield _sse("step", {"step": 0, "title": "🚨 Investigation started", "detail": f'Query: "{query}"'})

    try:
        while True:
            # Call Claude
            response = await client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=tools,
                messages=messages,
            )

            # Add assistant response to message history
            messages.append({"role": "assistant", "content": response.content})

            # Process response blocks
            tool_calls_made = []
            final_text = None

            for block in response.content:
                if block.type == "text":
                    final_text = block.text
                elif block.type == "tool_use":
                    tool_calls_made.append(block)

            # Execute tool calls
            if tool_calls_made:
                tool_results = []
                for tool_call in tool_calls_made:
                    step += 1
                    tool_name = tool_call.name
                    tool_input = tool_call.input

                    title = step_titles.get(tool_name, f"🔧 Calling {tool_name}")
                    detail = json.dumps(tool_input, indent=2)

                    yield _sse("step", {"step": step, "title": title, "detail": detail})
                    yield _sse("tool_call", {"tool": tool_name, "input": tool_input})

                    # Execute the actual tool
                    try:
                        fn = tool_registry[tool_name]
                        result = await fn(**tool_input)
                    except KeyError:
                        result = json.dumps({"error": f"Unknown tool: {tool_name}"})
                    except Exception as e:
                        result = json.dumps({"error": str(e)})

                    yield _sse("tool_result", {"tool": tool_name, "result": result[:500]})  # truncate for SSE

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_call.id,
                            "content": result,
                        }
                    )

                # Feed tool results back to Claude
                messages.append({"role": "user", "content": tool_results})

            # Check stop condition
            if response.stop_reason == "end_turn":
                # Extract JSON report from final text
                if final_text:
                    report = _extract_report(final_text)
                    if report:
                        step += 1
                        yield _sse("step", {"step": step, "title": "📋 Generating incident report", "detail": ""})
                        yield _sse("report", {"report": report})
                    else:
                        yield _sse("thinking", {"text": final_text})
                break

            # Safety: break if no tool calls and not end_turn
            if not tool_calls_made and response.stop_reason != "tool_use":
                if final_text:
                    yield _sse("thinking", {"text": final_text})
                break

    except anthropic.AuthenticationError:
        yield _sse("error", {"message": "Invalid Anthropic API key. Check your .env file."})
    except anthropic.RateLimitError:
        yield _sse("error", {"message": "Anthropic rate limit hit. Please wait a moment and retry."})
    except Exception as e:
        yield _sse("error", {"message": f"Investigation failed: {str(e)}"})

    yield _sse("done", {})


def _extract_report(text: str) -> dict | None:
    """Extract the JSON report from Claude's response text."""
    try:
        # Look for JSON code block
        start = text.find("```json")
        if start != -1:
            end = text.find("```", start + 7)
            if end != -1:
                json_str = text[start + 7:end].strip()
                return json.loads(json_str)

        # Try raw JSON
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return json.loads(text[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        pass
    return None
