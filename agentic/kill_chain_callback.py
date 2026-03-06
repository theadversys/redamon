"""
Kill Chain Streaming Callback - POSTs agent events to kill chain webhook.

Used for headless kill-chain execution (Stage 3-7) where the agent runs
without a WebSocket client. Events are forwarded to the kill chain orchestrator
for SSE streaming to the UI.
"""

import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class KillChainStreamingCallback:
    """Streaming callback that POSTs events to kill chain webhook."""

    def __init__(
        self,
        webhook_url: str,
        project_id: str,
        stage: int = 3,
        stage_name: str = "Delivery",
    ):
        self.webhook_url = webhook_url.rstrip("/")
        self.project_id = project_id
        self.stage = stage
        self.stage_name = stage_name
        self._tool_start_times: dict[str, float] = {}

    async def _post_webhook(self, payload: dict) -> bool:
        """POST event to webhook. Fire-and-forget, log errors."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(self.webhook_url, json=payload)
                if resp.status_code != 200:
                    logger.warning(f"Webhook POST failed: {resp.status_code} {resp.text}")
                    return False
                return True
        except Exception as e:
            logger.warning(f"Webhook POST error: {e}")
            return False

    async def on_thinking(self, iteration: int, phase: str, thought: str, reasoning: str):
        """Emit thinking event (optional - can be verbose)."""
        await self._post_webhook({
            "event_type": "thinking",
            "stage": self.stage,
            "stageName": self.stage_name,
            "subStep": f"Iteration {iteration}",
            "thought": (thought or "")[:300],
            "level": "info",
        })

    async def on_thinking_chunk(self, chunk: str):
        """Skip - too verbose for kill chain logs."""
        pass

    async def on_tool_start(self, tool_name: str, tool_args: dict):
        """Emit tool_start event."""
        self._tool_start_times[tool_name] = time.time()
        await self._post_webhook({
            "event_type": "tool_start",
            "stage": self.stage,
            "stageName": self.stage_name,
            "subStep": tool_name,
            "tool_name": tool_name,
            "tool_args": tool_args,
            "level": "action",
        })

    async def on_tool_output_chunk(self, tool_name: str, chunk: str, is_final: bool = False):
        """Skip chunks - tool_complete has summary."""
        pass

    async def on_tool_complete(
        self,
        tool_name: str,
        success: bool,
        output_summary: str,
        actionable_findings: list = None,
        recommended_next_steps: list = None,
    ):
        """Emit tool_complete event with duration."""
        duration_ms = None
        if tool_name in self._tool_start_times:
            duration_ms = int((time.time() - self._tool_start_times[tool_name]) * 1000)
            del self._tool_start_times[tool_name]
        summary = (output_summary or "").lower()
        session_obtained = success and (
            "session opened" in summary
            or "meterpreter session" in summary
            or "command shell session" in summary
        )
        await self._post_webhook({
            "event_type": "tool_complete",
            "stage": self.stage,
            "stageName": self.stage_name,
            "subStep": tool_name,
            "tool_name": tool_name,
            "success": success,
            "output_summary": (output_summary or "")[:1000],
            "level": "success" if success else "error",
            "durationMs": duration_ms,
            "session_obtained": session_obtained,
        })

    async def on_phase_update(self, current_phase: str, iteration_count: int, attack_path_type: str = "cve_exploit"):
        """Emit phase update as info log."""
        await self._post_webhook({
            "event_type": "phase_update",
            "stage": self.stage,
            "stageName": self.stage_name,
            "subStep": current_phase,
            "log": f"[*] Phase: {current_phase} (iteration {iteration_count})",
            "level": "info",
        })

    async def on_todo_update(self, todo_list: list):
        """Skip - too verbose."""
        pass

    async def on_approval_request(self, approval_request: dict):
        """In headless mode, auto-approve. Orchestrator should use operating_mode=offensive."""
        logger.info("Kill chain headless: approval request (auto-approved in offensive mode)")
        pass

    async def on_question_request(self, question_request: dict):
        """In headless mode, skip or use default. Log for now."""
        logger.info("Kill chain headless: question request received")
        pass

    async def on_response(self, answer: str, iteration_count: int, phase: str, task_complete: bool):
        """Emit stage complete when task is done."""
        if task_complete:
            await self._post_webhook({
                "event_type": "stage_complete",
                "stage": self.stage,
                "stageName": self.stage_name,
                "subStep": "Complete",
                "log": f"[+] Stage {self.stage} complete",
                "level": "success",
            })

    async def on_execution_step(self, step: dict):
        """Skip - tool_complete covers this."""
        pass

    async def on_error(self, error_message: str, recoverable: bool = True):
        """Emit error event."""
        await self._post_webhook({
            "event_type": "error",
            "stage": self.stage,
            "stageName": self.stage_name,
            "subStep": "Error",
            "log": f"[!] {error_message}",
            "level": "error",
        })

    async def on_task_complete(self, message: str, final_phase: str, total_iterations: int):
        """Emit stage complete."""
        await self._post_webhook({
            "event_type": "stage_complete",
            "stage": self.stage,
            "stageName": self.stage_name,
            "subStep": "Complete",
            "log": message or f"[+] Stage {self.stage} complete",
            "level": "success",
        })
