# Quick Test Script

Run these commands to quickly verify all features are working.

## 1. Check Service Status

```bash
# Verify all services are running
docker compose ps

# Check agent logs for initialization
docker compose logs agent | grep -E "(initialized|Memory|Template|Exploit|Threat|Parallel)"
```

## 2. Test via WebSocket (using curl/wscat)

### Install wscat (if needed):
```bash
npm install -g wscat
```

### Connect and test:
```bash
wscat -c ws://localhost:8080/ws/agent

# After connecting, send:
{"type":"init","payload":{"user_id":"test","project_id":"test","session_id":"test1"}}

# Then send a test query:
{"type":"query","payload":{"question":"Find Apache servers with CVE-2021-41773"}}
```

## 3. Test via Python Script

Create `test_agent.py`:

```python
import asyncio
import websockets
import json

async def test_agent():
    uri = "ws://localhost:8080/ws/agent"
    
    async with websockets.connect(uri) as websocket:
        # Initialize
        await websocket.send(json.dumps({
            "type": "init",
            "payload": {
                "user_id": "test_user",
                "project_id": "test_project",
                "session_id": "test_session"
            }
        }))
        
        # Wait for connected message
        response = await websocket.recv()
        print("Init response:", response)
        
        # Send query
        await websocket.send(json.dumps({
            "type": "query",
            "payload": {
                "question": "Find and exploit CVE-2021-41773 on Apache 2.4.49"
            }
        }))
        
        # Receive messages
        print("\n=== Agent Responses ===\n")
        try:
            while True:
                message = await websocket.recv()
                data = json.loads(message)
                print(f"Type: {data.get('type')}")
                
                # Check for feature indicators
                payload = data.get('payload', {})
                if payload.get('attack_plan'):
                    print("✅ Strategic Planning: Plan generated!")
                if payload.get('retrieved_memories'):
                    print(f"✅ Memory System: {len(payload['retrieved_memories'])} memories retrieved")
                if payload.get('matched_template'):
                    print("✅ Template Library: Template matched!")
                if payload.get('exploit_chain'):
                    print(f"✅ Exploit Chain: {len(payload['exploit_chain'])} steps")
                
                if data.get('type') == 'task_complete':
                    break
                    
        except websockets.exceptions.ConnectionClosed:
            print("Connection closed")

if __name__ == "__main__":
    asyncio.run(test_agent())
```

Run:
```bash
python3 test_agent.py
```

## 4. Verify Feature Files Exist

```bash
# Check all new modules exist
ls -la agentic/orchestrator_helpers/planning.py
ls -la agentic/orchestrator_helpers/context_management.py
ls -la agentic/orchestrator_helpers/parallel_execution.py
ls -la agentic/orchestrator_helpers/risk_assessment.py
ls -la agentic/orchestrator_helpers/templates.py
ls -la agentic/memory/
ls -la agentic/exploit_chain/
ls -la agentic/threat_intel/
ls -la agentic/exploit_gen/
ls -la agentic/multi_agent/
```

## 5. Check State Updates

Verify state.py has new fields:
```bash
grep -E "(attack_plan|matched_template|exploit_chain|retrieved_memories|execution_trace_summaries|important_events|parallel_tasks)" agentic/state.py
```

## 6. Monitor Real-Time Logs

```bash
# Watch for feature activity
docker compose logs -f agent | grep -E "(Planning|Memory|Template|Risk|Parallel|Chain|Threat|Exploit gen)"
```
