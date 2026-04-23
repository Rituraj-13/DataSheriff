"""
DataSheriff FastAPI Server
Exposes the AI investigation agent via a streaming SSE endpoint.

The Anthropic API key is NOT stored on this server.
It is passed by the user's browser in the X-Anthropic-Key header.
"""

import asyncio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent import run_investigation

app = FastAPI(
    title="DataSheriff API",
    description="AI-powered data pipeline incident investigator",
    version="1.0.0",
)

# ─── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # tighten to your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],           # allows X-Anthropic-Key through
)

# ─── Models ────────────────────────────────────────────────────────────────────

class InvestigateRequest(BaseModel):
    query: str


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "DataSheriff"}


@app.post("/investigate")
async def investigate(request: Request, body: InvestigateRequest):
    """
    Stream an AI-powered data incident investigation.

    Expects:
      - Body:   {"query": "..."}
      - Header: X-Anthropic-Key: sk-ant-...

    Returns a Server-Sent Events stream with investigation steps and final report.
    """
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Read the API key the user sent from their browser
    api_key = request.headers.get("X-Anthropic-Key", "").strip()

    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Anthropic API key is required. Add it in the Settings tab.",
        )

    if not api_key.startswith("sk-ant-"):
        raise HTTPException(
            status_code=401,
            detail="Invalid Anthropic API key format. It should start with sk-ant-",
        )

    async def event_stream():
        async for chunk in run_investigation(body.query, api_key):
            yield chunk
            await asyncio.sleep(0)  # allow event loop to breathe

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )