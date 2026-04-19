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
MODEL = "claude-sonnet-4-5"

# ─── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are DataSheriff, an elite AI data incident investigator.

When a user reports a data issue (e.g., "dashboard shows wrong numbers", "pipeline failed"), you will:

1. **SEARCH** - Use search_assets() to find the affected asset by name.
2. **LINEAGE** - Use get_lineage() to traverse the upstream dependency graph (aim for 3+ hops).
3. **QUALITY TESTS** - Use get_quality_tests() on all tables in the lineage to find failing tests.
4. **PIPELINE RUNS** - Use get_pipeline_runs() to check if any upstream pipeline failed recently.
5. **ROOT CAUSE** - Identify the first failing node in the dependency chain.
6. **OWNERSHIP** - Use get_asset_owner() to find who owns the root-cause asset.
7. **REPORT** - Generate a structured JSON incident report.

Rules:
- Always use tools before answering — never guess.
- Check quality tests on EVERY upstream table you discover.
- If a pipeline FQN is not available, skip get_pipeline_runs gracefully.
- After investigation, output a final structured JSON report EXACTLY in this format:

```json
{
  "root_cause": "<short description of the root cause>",
  "affected_asset": "<FQN of the originally reported asset>",
  "root_cause_asset": "<FQN of the first failing node>",
  "owner": "<owner name or team>",
  "owner_email": "<email if available, else null>",
  "failure_time": "<timestamp of failure if found, else null>",
  "evidence": "<what data quality test or pipeline run proves this>",
  "lineage_path": ["<asset1_name>", "<asset2_name>", "...", "<root_cause_name>"],
  "failing_tests": [{"test": "<test_name>", "table": "<table_fqn>", "status": "Failed"}],
  "recommended_action": "<concrete next step for the team>",
  "severity": "<Critical|High|Medium|Low>",
  "investigation_complete": true
}
```

Be thorough, systematic, and precise. Every assertion must be backed by tool output.
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
