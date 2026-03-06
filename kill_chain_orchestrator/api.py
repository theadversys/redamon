"""
Kill Chain Orchestrator API - FastAPI service for full cyber kill chain automation
"""
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
from fastapi import Body, FastAPI, HTTPException, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from models import (
    HealthResponse,
    KillChainLogEvent,
    KillChainStartRequest,
    KillChainState,
    KillChainStatus,
    STAGE_NAMES,
)
from state_machine import KillChainStateMachine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VERSION = "1.0.0"

# Configuration
RECON_ORCHESTRATOR_URL = os.getenv("RECON_ORCHESTRATOR_URL", "http://localhost:8010")
WEBAPP_API_URL = os.getenv("WEBAPP_API_URL", "http://localhost:3000")
# Recon container uses network_mode: host and cannot resolve Docker hostnames.
# Use RECON_WEBAPP_API_URL (e.g. http://localhost:3000) when passing to recon start.
RECON_WEBAPP_API_URL = os.getenv("RECON_WEBAPP_API_URL", "") or WEBAPP_API_URL
AGENT_API_URL = os.getenv("AGENT_API_URL", "http://localhost:8080")
KILL_CHAIN_ORCHESTRATOR_URL = os.getenv("KILL_CHAIN_ORCHESTRATOR_URL", "http://localhost:8015")
# Optional shared secret for the webhook endpoint. When set, callers must
# supply "Authorization: Bearer <secret>" or the request is rejected.
KILL_CHAIN_WEBHOOK_SECRET = os.getenv("KILL_CHAIN_WEBHOOK_SECRET", "").strip()

# Active kill chain runs: project_id -> KillChainStateMachine
active_runs: dict[str, KillChainStateMachine] = {}
# Event queues for SSE: project_id -> asyncio.Queue
event_queues: dict[str, asyncio.Queue] = {}


def _serialize_event(event: KillChainLogEvent) -> dict:
    """Serialize KillChainLogEvent for JSON SSE"""
    return {
        "log": event.log,
        "timestamp": event.timestamp.isoformat(),
        "stage": event.stage,
        "stageName": event.stageName,
        "subStep": event.subStep,
        "subStepNumber": event.subStepNumber,
        "toolName": event.toolName,
        "level": event.level,
        "durationMs": event.durationMs,
        "metadata": event.metadata,
        "phase": event.phase,
        "phaseNumber": event.phaseNumber,
        "isPhaseStart": event.isPhaseStart,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources"""
    logger.info("Starting Kill Chain Orchestrator...")

    # Mark any runs that were 'running' or 'starting' in DB as 'error' (interrupted by restart)
    # so the frontend doesn't keep trying to stream a dead process.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Fetch all projects with active runs by querying /api/kill-chain/{id}/runs
            # We mark them via a best-effort PATCH on any project whose run is in-flight
            resp = await client.get(f"{WEBAPP_API_URL}/api/projects")
            if resp.status_code == 200:
                projects = resp.json()
                for project in projects:
                    pid = project.get("id") or project.get("projectId")
                    if not pid:
                        continue
                    run_resp = await client.get(f"{WEBAPP_API_URL}/api/kill-chain/{pid}/runs")
                    if run_resp.status_code != 200:
                        continue
                    run = run_resp.json()
                    if run.get("status") in ("running", "starting", "waiting_for_operator"):
                        run_id = run.get("id")
                        if run_id:
                            await client.patch(
                                f"{WEBAPP_API_URL}/api/kill-chain/{pid}/runs/{run_id}",
                                json={"status": "error", "error": "Orchestrator restarted — run was interrupted"},
                                timeout=5.0,
                            )
                            logger.warning(f"[startup] Marked interrupted run {run_id} for project {pid} as error")
    except Exception as e:
        logger.warning(f"[startup] Could not mark interrupted runs: {e}")

    yield
    logger.info("Shutting down Kill Chain Orchestrator...")
    active_runs.clear()
    event_queues.clear()


app = FastAPI(
    title="PandaExploit Kill Chain Orchestrator",
    description="Orchestrates full cyber kill chain (stages 1-7) with SSE streaming",
    version=VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://webapp:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version=VERSION,
        running_kill_chains=len(active_runs),
    )


@app.post("/kill-chain/{project_id}/start", response_model=KillChainState)
async def start_kill_chain(
    project_id: str,
    request: KillChainStartRequest = Body(default=KillChainStartRequest()),
):
    """Start a full kill chain run for a project"""
    if project_id in active_runs:
        raise HTTPException(
            status_code=409,
            detail=f"Kill chain already running for project {project_id}",
        )

    machine = KillChainStateMachine(
        project_id=project_id,
        user_id=request.user_id or "",
        recon_orchestrator_url=RECON_ORCHESTRATOR_URL,
        webapp_api_url=WEBAPP_API_URL,
        recon_webapp_api_url=RECON_WEBAPP_API_URL,
        agent_api_url=AGENT_API_URL,
        kill_chain_orchestrator_url=KILL_CHAIN_ORCHESTRATOR_URL,
    )

    queue: asyncio.Queue = asyncio.Queue()
    event_queues[project_id] = queue
    active_runs[project_id] = machine

    machine._status = KillChainStatus.STARTING
    machine._started_at = datetime.utcnow()
    start_stage = request.start_stage if (request.start_stage and 1 <= request.start_stage <= 7) else 1
    logger.info(f"[kill-chain/start] project_id={project_id} request.start_stage={request.start_stage} resolved start_stage={start_stage}")

    # Persist immediately so Engagements tab shows this run from the moment it starts
    await machine._persist_state()

    async def run_and_emit():
        final_state = None
        log_buffer: list[dict] = []

        def capture(event: "KillChainLogEvent") -> "KillChainLogEvent":
            """Buffer a log event for DB persistence while passing it through."""
            log_buffer.append({
                "stage":     event.stage,
                "stageName": event.stageName,
                "subStep":   event.subStep,
                "level":     event.level,
                "log":       event.log,
                "toolName":  event.toolName,
                "metadata":  event.metadata,
                "timestamp": event.timestamp.isoformat(),
            })
            return event

        try:
            if start_stage >= 2:
                machine._current_stage = start_stage
                machine._status = KillChainStatus.RUNNING
                start_fn = getattr(machine, f"run_stage_{start_stage}", machine.run_stage_1)
            else:
                start_fn = machine.run_stage_1

            async for event in start_fn():
                if project_id in event_queues:
                    await event_queues[project_id].put(("event", capture(event)))

            # Handle force-advance: Stage 1 may have exited mid-stream leaving _force_advance_to set.
            # Dispatch to the target stage and let it chain through the rest.
            if machine._force_advance_to is not None and not machine._stop_requested:
                target = machine._force_advance_to
                machine._force_advance_to = None
                machine._current_stage = target
                machine._status = KillChainStatus.RUNNING
                stage_fn = getattr(machine, f"run_stage_{target}", None)
                if stage_fn:
                    async for event in stage_fn():
                        if project_id in event_queues:
                            await event_queues[project_id].put(("event", capture(event)))
            final_state = machine.get_state()
            if project_id in event_queues:
                await event_queues[project_id].put(("complete", final_state))
        except Exception as e:
            logger.exception("Kill chain run error")
            final_state = machine.get_state() if project_id in active_runs else None
            if project_id in event_queues:
                await event_queues[project_id].put(("error", str(e)))
        finally:
            event_queues.pop(project_id, None)
            active_runs.pop(project_id, None)
            # Persist logs + finalise run metadata (best-effort, non-blocking)
            if machine._run_id and log_buffer:
                try:
                    duration_secs: int | None = None
                    if machine._started_at and machine._completed_at:
                        duration_secs = int((machine._completed_at - machine._started_at).total_seconds())
                    stages_completed = sorted({e["stage"] for e in log_buffer if e["level"] == "success"})
                    async with httpx.AsyncClient(timeout=15) as client:
                        await client.post(
                            f"{WEBAPP_API_URL}/api/kill-chain/{project_id}/runs/{machine._run_id}/logs",
                            json={"logs": log_buffer},
                        )
                        patch_payload: dict = {"stagesCompleted": stages_completed}
                        if duration_secs is not None:
                            patch_payload["duration"] = duration_secs
                        await client.patch(
                            f"{WEBAPP_API_URL}/api/kill-chain/{project_id}/runs/{machine._run_id}",
                            json=patch_payload,
                        )
                except Exception as flush_exc:
                    logger.warning(f"[run_and_emit] Failed to flush logs: {flush_exc}")

    asyncio.create_task(run_and_emit())

    return machine.get_state()


@app.get("/kill-chain/{project_id}/status", response_model=KillChainState)
async def get_kill_chain_status(project_id: str):
    """Get current status of a kill chain run"""
    if project_id not in active_runs:
        return KillChainState(
            project_id=project_id,
            status=KillChainStatus.IDLE,
        )
    return active_runs[project_id].get_state()


class WebhookPayload(BaseModel):
    """Payload from agent for kill chain webhook"""
    event_type: str = ""
    stage: int = 3
    stageName: str = "Delivery"
    subStep: str = ""
    tool_name: str = ""
    tool_args: dict = {}
    log: str = ""
    level: str = "info"
    success: bool = True
    output_summary: str = ""
    durationMs: int | None = None
    thought: str = ""
    session_obtained: bool | None = None


@app.post("/kill-chain/{project_id}/webhook")
async def kill_chain_webhook(project_id: str, request: Request, payload: WebhookPayload = Body(...)):
    """
    Webhook for agent to POST events during headless kill-chain execution.
    Receives tool_start, tool_complete, etc. and forwards as KillChainLogEvent to SSE.
    When KILL_CHAIN_WEBHOOK_SECRET is set, callers must supply
    'Authorization: Bearer <secret>' or the request is rejected with 401.
    """
    # Enforce shared secret when configured
    if KILL_CHAIN_WEBHOOK_SECRET:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer ") or auth_header[7:] != KILL_CHAIN_WEBHOOK_SECRET:
            raise HTTPException(status_code=401, detail="Invalid or missing webhook secret")

    if project_id not in event_queues:
        return {"ok": False, "detail": "No active kill chain for project"}
    event_type = payload.event_type
    stage = payload.stage
    stage_name = payload.stageName
    sub_step = payload.subStep
    tool_name = payload.tool_name
    log = payload.log
    level = payload.level
    duration_ms = payload.durationMs

    if event_type == "tool_start":
        log = log or f"[*] Starting {tool_name}..."
    elif event_type == "tool_complete":
        success = payload.success
        log = log or (f"[+] {tool_name} complete" if success else f"[!] {tool_name} failed")
        level = "success" if success else "error"
    elif event_type == "thinking":
        log = log or (payload.thought or "")[:200]
    elif event_type == "stage_complete":
        log = log or f"[+] Stage {stage} complete"
        level = "success"

    from models import KillChainLogEvent
    from datetime import datetime
    kc_event = KillChainLogEvent(
        log=log,
        timestamp=datetime.utcnow(),
        stage=stage,
        stageName=stage_name,
        subStep=sub_step or tool_name or "Agent",
        toolName=tool_name or None,
        level=level,
        durationMs=duration_ms,
    )
    await event_queues[project_id].put(("event", kc_event))

    # Update session_obtained on state machine when agent reports it
    if payload.session_obtained is True and project_id in active_runs:
        active_runs[project_id]._session_obtained = True

    return {"ok": True}


@app.post("/kill-chain/{project_id}/stop", response_model=KillChainState)
async def stop_kill_chain(project_id: str):
    """Stop a running kill chain"""
    if project_id not in active_runs:
        return KillChainState(
            project_id=project_id,
            status=KillChainStatus.IDLE,
        )
    active_runs[project_id].request_stop()
    return active_runs[project_id].get_state()


@app.post("/kill-chain/{project_id}/pause", response_model=KillChainState)
async def pause_kill_chain(project_id: str):
    """Pause at current stage (waits at next stage boundary)"""
    if project_id not in active_runs:
        return KillChainState(
            project_id=project_id,
            status=KillChainStatus.IDLE,
        )
    active_runs[project_id].request_pause()
    return active_runs[project_id].get_state()


@app.post("/kill-chain/{project_id}/resume", response_model=KillChainState)
async def resume_kill_chain(project_id: str):
    """Resume a paused kill chain"""
    if project_id not in active_runs:
        return KillChainState(
            project_id=project_id,
            status=KillChainStatus.IDLE,
        )
    active_runs[project_id].request_resume()
    return active_runs[project_id].get_state()


class AdvanceRequest(BaseModel):
    target_stage: int


@app.post("/kill-chain/{project_id}/advance", response_model=KillChainState)
async def advance_kill_chain(project_id: str, body: AdvanceRequest):
    """Force advance the kill chain to a specific stage.

    Signals the running stage to exit and jump to target_stage.
    For Stage 1 (SSE streaming), the advance takes effect at the next chunk.
    For stages 2-7, the advance takes effect at the next stage boundary.
    """
    if project_id not in active_runs:
        raise HTTPException(status_code=404, detail="No active kill chain for this project")

    machine = active_runs[project_id]
    current = machine._current_stage

    if body.target_stage <= current or body.target_stage > 7:
        raise HTTPException(
            status_code=400,
            detail=f"target_stage must be > current stage ({current}) and ≤ 7",
        )

    success = machine.request_advance(body.target_stage)
    if not success:
        raise HTTPException(status_code=400, detail="Advance request rejected")

    # Emit an immediate pending-advance event to the SSE stream
    if project_id in event_queues:
        pending_event = KillChainLogEvent(
            log=f"[>>] Manual advance to Stage {body.target_stage}: {STAGE_NAMES.get(body.target_stage, '')} requested — will apply at next checkpoint",
            timestamp=datetime.utcnow(),
            stage=body.target_stage,
            stageName=STAGE_NAMES.get(body.target_stage, ""),
            subStep="Advance Requested",
            level="action",
        )
        await event_queues[project_id].put(("event", pending_event))

    return machine.get_state()


class OperatorInputRequest(BaseModel):
    stage: int
    instructions: str = ""
    action: str = "approve"  # "approve" | "skip" | "stop"


@app.post("/kill-chain/{project_id}/operator-input", response_model=KillChainState)
async def submit_operator_input(project_id: str, body: OperatorInputRequest):
    """Submit operator input during a HITL (Human-in-the-Loop) pause.

    Called when the kill chain is in 'waiting_for_operator' status.
    action: "approve" (execute with optional instructions), "skip" (skip stage), "stop" (end run).
    """
    if project_id not in active_runs:
        raise HTTPException(status_code=404, detail="No active kill chain for this project")

    machine = active_runs[project_id]
    if machine._status.value != "waiting_for_operator":
        raise HTTPException(status_code=400, detail=f"Kill chain is not waiting for operator input (status: {machine._status.value})")

    success = machine.submit_operator_input(body.stage, body.instructions, body.action)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to submit operator input")

    # Emit an SSE event to notify the stream of the operator decision
    if project_id in event_queues:
        action_label = {"approve": "approved ✓", "skip": "skipped >>", "stop": "stopped ■"}.get(body.action, body.action)
        operator_event = KillChainLogEvent(
            log=f"[operator] Stage {body.stage} {action_label}{': ' + body.instructions if body.instructions and body.action == 'approve' else ''}",
            timestamp=datetime.utcnow(),
            stage=body.stage,
            stageName=STAGE_NAMES.get(body.stage, ""),
            subStep="Operator Decision",
            level="action",
        )
        await event_queues[project_id].put(("event", operator_event))

    return machine.get_state()


@app.get("/kill-chain/{project_id}/logs")
async def stream_kill_chain_logs(project_id: str):
    """
    Stream kill chain logs using Server-Sent Events.

    Events include stage, subStep, toolName, and full log detail.
    Connect shortly after calling start to receive all events.
    """
    if project_id not in event_queues:
        raise HTTPException(
            status_code=404,
            detail="No kill chain process found for this project. Call start first.",
        )

    queue = event_queues[project_id]

    async def event_generator():
        try:
            while True:
                try:
                    msg_type, payload = await asyncio.wait_for(queue.get(), timeout=3600.0)
                    if msg_type == "event":
                        yield {
                            "event": "log",
                            "data": json.dumps(_serialize_event(payload)),
                        }
                    elif msg_type == "complete":
                        st = payload  # KillChainState from run_and_emit
                        if st:
                            yield {
                                "event": "complete",
                                "data": json.dumps({
                                    "status": st.status.value,
                                    "currentStage": st.current_stage,
                                    "completedAt": st.completed_at.isoformat() if st.completed_at else None,
                                    "error": st.error,
                                }),
                            }
                        break
                    elif msg_type == "error":
                        yield {
                            "event": "error",
                            "data": json.dumps({"error": payload}),
                        }
                        break
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
        except asyncio.CancelledError:
            pass

    return EventSourceResponse(event_generator())
