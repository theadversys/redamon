#!/usr/bin/env python3
"""
Test script for offensive mode chat.
Sends WebSocket messages to the agent and captures responses.
Usage: python test_offensive_chat.py
"""
import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    sys.exit(1)


# Use AGENT_WS_URL env or default
# Inside agent container: agent listens on 8080; from host: use 8090
import os
WS_URL = os.environ.get("AGENT_WS_URL")
if not WS_URL:
    WS_URL = "ws://localhost:8080/ws/agent" if os.path.exists("/app/api.py") else "ws://localhost:8090/ws/agent"
USER_ID = "test_user"
PROJECT_ID = "cmlkiitks0001mv01blqib28w"  # From screenshot
SESSION_ID = "test_session_offensive"


async def test_offensive_chat(question: str = "who are you?"):
    print(f"\n=== Testing Offensive Mode Chat ===")
    print(f"Question: {question}")
    print(f"Connecting to {WS_URL}...\n")

    responses = []
    final_answer = None

    async with websockets.connect(WS_URL) as ws:
        # 1. INIT with offensive mode
        init_msg = {
            "type": "init",
            "payload": {
                "user_id": USER_ID,
                "project_id": PROJECT_ID,
                "session_id": SESSION_ID,
                "operating_mode": "offensive"
            }
        }
        await ws.send(json.dumps(init_msg))
        print("Sent: INIT (operating_mode=offensive)")

        # 2. Wait for CONNECTED
        while True:
            msg = json.loads(await ws.recv())
            msg_type = msg.get("type", "")
            payload = msg.get("payload", {})

            if msg_type == "connected":
                print("Received: CONNECTED\n")
                break
            elif msg_type == "error":
                print(f"Error: {payload.get('message', msg)}")
                return None

        # 3. Send QUERY
        query_msg = {"type": "query", "payload": {"question": question}}
        await ws.send(json.dumps(query_msg))
        print(f"Sent: QUERY '{question}'\n")

        # 4. Collect responses (with timeout)
        try:
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=120.0))
                msg_type = msg.get("type", "")
                payload = msg.get("payload", {})

                if msg_type == "thinking":
                    thought = payload.get("thought", "")[:200]
                    print(f"[THINKING] {thought}...")
                elif msg_type == "tool_start":
                    print(f"[TOOL] {payload.get('tool_name', '?')} started")
                elif msg_type == "tool_complete":
                    print(f"[TOOL] {payload.get('tool_name', '?')} complete")
                elif msg_type == "response":
                    final_answer = payload.get("answer", "")
                    print(f"\n[RESPONSE]\n{final_answer}")
                    break
                elif msg_type == "task_complete":
                    final_answer = payload.get("message", "")
                    print(f"\n[TASK_COMPLETE]\n{final_answer}")
                    break
                elif msg_type == "error":
                    print(f"[ERROR] {payload.get('message', msg)}")
                    break
                elif msg_type == "approval_request":
                    print("[APPROVAL_REQUEST] (would block in guided mode)")
                    # In offensive we shouldn't get this for phase transitions
                elif msg_type == "phase_update":
                    print(f"[PHASE] {payload.get('current_phase', '?')}")

        except asyncio.TimeoutError:
            print("\nTimeout waiting for response")

    return final_answer


if __name__ == "__main__":
    question = sys.argv[1] if len(sys.argv) > 1 else "who are you?"
    result = asyncio.run(test_offensive_chat(question))
    print("\n=== Test complete ===")
    sys.exit(0 if result else 1)
