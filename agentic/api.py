"""
PandaExploit Agent WebSocket API

FastAPI application providing WebSocket endpoint for real-time agent communication.
Supports session-based conversation continuity and phase-based approval flow.

Endpoints:
    WS /ws/agent - WebSocket endpoint for real-time bidirectional streaming
    GET /health - Health check
    GET /defaults - Agent default settings (camelCase, for frontend)
    POST /agent/kill-chain-execute - Headless kill chain execution (Stage 3-7)
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Body, FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from logging_config import setup_logging
from orchestrator import AgentOrchestrator
from utils import get_session_count
from websocket_api import WebSocketManager, websocket_endpoint

# Initialize logging with file rotation
setup_logging(log_level=logging.INFO, log_to_console=True, log_to_file=True)
logger = logging.getLogger(__name__)

orchestrator: Optional[AgentOrchestrator] = None
ws_manager: Optional[WebSocketManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.

    Initializes the orchestrator and WebSocket manager on startup and cleans up on shutdown.
    """
    global orchestrator, ws_manager

    logger.info("Starting PandaExploit Agent API...")

    # Initialize orchestrator
    orchestrator = AgentOrchestrator()
    await orchestrator.initialize()

    # Initialize WebSocket manager
    ws_manager = WebSocketManager()

    logger.info("PandaExploit Agent API ready (WebSocket)")

    yield

    logger.info("Shutting down PandaExploit Agent API...")
    if orchestrator:
        await orchestrator.close()


app = FastAPI(
    title="PandaExploit Agent API",
    description="WebSocket API for real-time agent communication with phase tracking, MCP tools, and Neo4j integration",
    version="3.0.0",
    lifespan=lifespan
)

# Add CORS middleware for webapp (allow all origins for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Must be False when allow_origins is ["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# RESPONSE MODELS (for /health endpoint only)
# =============================================================================

class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    version: str
    tools_loaded: int
    active_sessions: int


# =============================================================================
# ENDPOINTS
# =============================================================================


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    """
    Health check endpoint.

    Returns the API status, version, number of loaded tools, and active sessions.
    """
    tools_count = 0
    if orchestrator and orchestrator.tool_executor:
        tools_count = len(orchestrator.tool_executor.get_all_tools())

    sessions_count = get_session_count()

    return HealthResponse(
        status="ok" if orchestrator and orchestrator._initialized else "initializing",
        version="3.0.0",
        tools_loaded=tools_count,
        active_sessions=sessions_count
    )


class KillChainExecuteRequest(BaseModel):
    """Request for headless kill chain execution"""
    project_id: str
    user_id: str = ""
    stage: int = 3
    objective: str
    context: dict = {}
    webhook_url: str = ""  # Full URL for kill chain webhook, e.g. http://kill-chain:8015/kill-chain/{id}/webhook


class KillChainExecuteResponse(BaseModel):
    """Response from kill chain execute"""
    success: bool
    message: str = ""
    error: str | None = None


@app.post("/agent/kill-chain-execute", response_model=KillChainExecuteResponse, tags=["Kill Chain"])
async def kill_chain_execute(request: KillChainExecuteRequest = Body(...)):
    """
    Execute a kill chain stage via the agent (headless, no WebSocket).

    Used by the kill chain orchestrator for stages 3-7 (Delivery, Exploitation, etc.).
    Events are POSTed to the webhook_url for SSE streaming to the UI.
    Runs with operating_mode=offensive (auto-approve phase transitions).
    """
    if not orchestrator or not orchestrator._initialized:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    if not request.webhook_url:
        raise HTTPException(status_code=400, detail="webhook_url is required")

    from kill_chain_callback import KillChainStreamingCallback

    stage_names = {
        3: "Delivery",
        4: "Exploitation",
        5: "Installation",
        6: "C2",
        7: "Actions on Objectives",
    }
    stage_name = stage_names.get(request.stage, "Delivery")

    callback = KillChainStreamingCallback(
        webhook_url=request.webhook_url,
        project_id=request.project_id,
        stage=request.stage,
        stage_name=stage_name,
    )

    session_id = f"kill-chain-{request.project_id}-{request.stage}"

    try:
        result = await orchestrator.invoke_with_streaming(
            question=request.objective,
            user_id=request.user_id or "kill-chain",
            project_id=request.project_id,
            session_id=session_id,
            streaming_callback=callback,
            guidance_queue=None,
            operating_mode_override="offensive",
        )
        if result.error:
            return KillChainExecuteResponse(success=False, error=result.error)
        return KillChainExecuteResponse(success=True, message="Stage completed")
    except Exception as e:
        logging.getLogger(__name__).exception("Kill chain execute error")
        return KillChainExecuteResponse(success=False, error=str(e))


@app.get("/defaults", tags=["System"])
async def get_defaults():
    """
    Get default agent settings for frontend project creation.

    Returns DEFAULT_AGENT_SETTINGS with camelCase keys prefixed with 'agent'
    for frontend compatibility (e.g., OPENAI_MODEL -> agentOpenaiModel).
    """
    from project_settings import DEFAULT_AGENT_SETTINGS

    def to_camel_case(snake_str: str) -> str:
        """Convert SCREAMING_SNAKE_CASE to agentCamelCase."""
        # Prefix with 'agent_' then convert to camelCase
        prefixed = f"agent_{snake_str}"
        components = prefixed.lower().split('_')
        return components[0] + ''.join(x.title() for x in components[1:])

    camel_case_defaults = {
        to_camel_case(k): v
        for k, v in DEFAULT_AGENT_SETTINGS.items()
    }

    return camel_case_defaults


@app.websocket("/ws/agent")
async def agent_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time agent communication.

    Provides bidirectional streaming of:
    - LLM thinking process
    - Tool executions and outputs
    - Phase transitions
    - Approval requests
    - Agent questions
    - Todo list updates

    The client must send an 'init' message first to authenticate the session.
    """
    if not orchestrator:
        await websocket.close(code=1011, reason="Orchestrator not initialized")
        return

    if not ws_manager:
        await websocket.close(code=1011, reason="WebSocket manager not initialized")
        return

    await websocket_endpoint(websocket, orchestrator, ws_manager)
