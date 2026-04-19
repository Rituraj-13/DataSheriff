"""
DataSheriff FastAPI Server
Exposes the AI investigation agent via a streaming SSE endpoint.
"""

import asyncio
from fastapi import FastAPI, HTTPException
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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
async def investigate(request: InvestigateRequest):
    """
    Stream an AI-powered data incident investigation.

    Accepts a plain-English description of the data problem.
    Returns a Server-Sent Events stream with investigation steps and final report.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    async def event_stream():
        async for chunk in run_investigation(request.query):
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
