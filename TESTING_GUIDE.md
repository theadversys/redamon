# Testing Guide for 10x Agent Enhancements

This guide explains how to test all 10 new features implemented in the AI agent.

## Prerequisites

1. **Start all services:**
   ```bash
   docker compose up -d
   ```

2. **Verify services are running:**
   ```bash
   docker compose ps
   # Check logs
   docker compose logs -f agent
   ```

3. **Access the webapp:**
   - Open http://localhost:3000
   - Navigate to the Graph view
   - Open the AI Assistant drawer

## Testing Each Feature

### 1. Strategic Planning Engine ✅

**What to test:** Agent generates multi-step attack plans before execution.

**How to test:**
1. Send a query like: `"Exploit CVE-2021-41773 on Apache 2.4.49"`
2. **Look for in logs:**
   ```
   Planning strategy...
   Plan generated: X steps, risk=Y
   ```
3. **Check WebSocket messages:** Look for `attack_plan` in state
4. **Verify:** Agent should reference the plan in its reasoning

**Expected behavior:**
- Agent generates a plan with multiple steps
- Plan includes prerequisites, risk scores, and success criteria
- Agent follows the plan step-by-step

**Configuration:**
- Planning happens automatically for new objectives
- Check logs for: `"Routing to plan_strategy"`

---

### 2. Persistent Learning Memory System ✅

**What to test:** Agent remembers past exploits and uses them for similar targets.

**How to test:**
1. **First exploit:** Send `"Exploit CVE-2021-41773 on target1"`
2. Wait for successful exploit
3. **Second exploit:** Send `"Exploit CVE-2021-41773 on target2"`
4. **Look for in logs:**
   ```
   Retrieved X similar memories for query: ...
   Stored exploit success in memory
   ```

**Expected behavior:**
- Second exploit should be faster (uses past experience)
- Agent references past exploits in planning
- Memory persists across sessions

**Configuration:**
- Memory uses ChromaDB (stored in `./chroma_db/`)
- Requires `OPENAI_API_KEY` for embeddings
- Check logs for: `"Memory store initialized"`

**Verify memory:**
```bash
# Check if ChromaDB directory exists
ls -la chroma_db/
```

---

### 3. Multi-Agent Coordination System ✅

**What to test:** Multiple specialized agents work in parallel.

**How to test:**
1. **Enable multi-agent mode** (in project settings or `.env`):
   ```env
   MULTI_AGENT_ENABLED=true
   ```
2. Send a complex query requiring multiple tasks
3. **Look for in logs:**
   ```
   Multi-agent coordination enabled
   Registered agent: recon
   Registered agent: exploit
   ```

**Expected behavior:**
- Multiple agents execute tasks in parallel
- Coordinator manages task distribution
- Faster execution for independent tasks

**Note:** Currently disabled by default. Enable via project settings.

---

### 4. Autonomous Decision-Making Engine ✅

**What to test:** Risk-based autonomous decisions with safety gates.

**How to test:**
1. **Enable autonomous mode** (in project settings):
   ```env
   AUTONOMOUS_MODE=true
   RISK_THRESHOLD=30
   ```
2. Send queries with varying risk levels:
   - Low risk: `"Query graph for Apache servers"`
   - Medium risk: `"Scan ports on 192.168.1.1"`
   - High risk: `"Exploit CVE-2021-41773"`
3. **Look for in logs:**
   ```
   Risk assessment for ...: score=X, requires_approval=Y
   Safety gate: Blocked destructive command
   ```

**Expected behavior:**
- Low-risk actions auto-approved (no approval dialog)
- Medium-risk actions may require approval
- High-risk actions always require approval
- Destructive commands blocked regardless

**Configuration:**
- `AUTONOMOUS_MODE`: Enable/disable autonomous mode
- `RISK_THRESHOLD`: Risk score threshold for auto-approval (0-100)

---

### 5. Exploit Chain Optimization ✅

**What to test:** Agent builds optimized exploit chains with prerequisites.

**How to test:**
1. Send query with multiple vulnerabilities: `"Exploit all CVEs on target X"`
2. **Look for in logs:**
   ```
   Built exploit chain with X steps
   Found exploit chain path: X steps
   ```
3. **Check state:** Look for `exploit_chain` in WebSocket messages

**Expected behavior:**
- Agent identifies optimal exploit sequence
- Checks prerequisites before each step
- Adapts chain if step fails

**Verify:**
- Check logs for exploit chain building
- Verify prerequisites are checked

---

### 6. Adaptive Context Management ✅

**What to test:** Context compression and semantic retrieval.

**How to test:**
1. Send a long conversation (100+ steps)
2. **Look for in logs:**
   ```
   Compressing execution trace (X steps)
   Trace compressed: X steps, Y summaries, Z important events
   ```
3. Continue conversation - agent should remember important events

**Expected behavior:**
- Old steps compressed into summaries
- Important events (sessions, exploits) always kept
- Context size reduced without losing critical info

**Configuration:**
- `EXECUTION_TRACE_MEMORY_STEPS`: Default 100
- Compression happens automatically when limit exceeded

**Verify:**
- Check logs for compression messages
- Verify important events are preserved

---

### 7. Pattern Recognition & Template Library ✅

**What to test:** Agent matches targets to exploit templates.

**How to test:**
1. **First exploit:** Successfully exploit a target
2. **Second similar target:** Send same exploit query
3. **Look for in logs:**
   ```
   Found matching template: template-X - Exploit Name
   Extracted template: template-Y
   ```

**Expected behavior:**
- Templates extracted from successful exploits
- Templates matched to similar targets
- Faster execution using templates

**Verify templates:**
```bash
# Check template storage
ls -la templates/
cat templates/templates.json
```

---

### 8. Real-Time Threat Intelligence Integration ✅

**What to test:** Agent fetches latest threat intelligence.

**How to test:**
1. **Configure API keys** (in `.env`):
   ```env
   NVD_API_KEY=your_key
   SHODAN_API_KEY=your_key
   ```
2. Send query: `"Check for new CVEs affecting Apache"`
3. **Look for in logs:**
   ```
   Fetched X CVEs from NVD
   Fetched X GHSA advisories
   Updated Neo4j with threat intelligence
   ```

**Expected behavior:**
- Agent queries threat intel feeds
- Updates Neo4j with new data
- Uses latest exploits in planning

**Configuration:**
- `NVD_API_KEY`: NVD API key (optional)
- `SHODAN_API_KEY`: Shodan API key (optional)
- Feeds polled every 15 minutes (if implemented)

---

### 9. Autonomous Exploit Development ✅

**What to test:** Agent generates custom exploits when Metasploit modules don't exist.

**How to test:**
1. Send query for CVE without Metasploit module: `"Exploit CVE-XXXX-XXXXX"`
2. **Look for in logs:**
   ```
   Generating exploit code for CVE-XXXX-XXXXX
   Exploit code generated
   Code validation passed
   ```

**Expected behavior:**
- Agent generates exploit code using LLM
- Code validated for safety
- Exploit tested in sandbox (if implemented)

**Note:** Sandbox testing requires container isolation (placeholder implemented).

---

### 10. Performance Optimization & Parallelization ✅

**What to test:** Parallel execution of independent tasks.

**How to test:**
1. Send query with multiple independent tasks: `"Scan ports on 192.168.1.1, 192.168.1.2, 192.168.1.3"`
2. **Look for in logs:**
   ```
   Executing parallel task: task-1
   Executing parallel task: task-2
   Parallel executor initialized with max_concurrency=5
   ```

**Expected behavior:**
- Independent tasks execute simultaneously
- Faster execution (3-5x speedup)
- Dependency tracking ensures correct order

**Configuration:**
- `MAX_PARALLEL_TASKS`: Default 5

---

## Comprehensive Test Scenario

**End-to-end test:**

1. **Start fresh session:**
   ```javascript
   // WebSocket init
   {
     "type": "init",
     "payload": {
       "user_id": "test_user",
       "project_id": "test_project",
       "session_id": "test_session_1"
     }
   }
   ```

2. **Send complex query:**
   ```javascript
   {
     "type": "query",
     "payload": {
       "question": "Find and exploit CVE-2021-41773 on Apache 2.4.49 servers in the project"
     }
   }
   ```

3. **Observe:**
   - ✅ Planning phase generates attack plan
   - ✅ Memory retrieval finds similar past exploits
   - ✅ Template matching (if available)
   - ✅ Exploit chain optimization
   - ✅ Risk assessment for each step
   - ✅ Parallel execution (if multiple targets)
   - ✅ Context compression (if long conversation)
   - ✅ Template extraction on success

4. **Send second query (same CVE, different target):**
   ```javascript
   {
     "type": "query",
     "payload": {
       "question": "Exploit CVE-2021-41773 on 192.168.1.100"
     }
   }
   ```

5. **Verify improvements:**
   - ✅ Faster execution (uses memory/templates)
   - ✅ References past experience
   - ✅ Better success rate

---

## Monitoring & Debugging

### Check Logs

```bash
# Agent logs
docker compose logs -f agent

# Filter for specific features
docker compose logs agent | grep "Planning"
docker compose logs agent | grep "Memory"
docker compose logs agent | grep "Risk assessment"
docker compose logs agent | grep "Template"
docker compose logs agent | grep "Parallel"
```

### WebSocket Messages

Monitor WebSocket messages in browser console or use WebSocket client:

```javascript
// In browser console (when connected)
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Message type:', msg.type);
  if (msg.payload?.attack_plan) {
    console.log('Attack plan:', msg.payload.attack_plan);
  }
  if (msg.payload?.retrieved_memories) {
    console.log('Memories:', msg.payload.retrieved_memories);
  }
  if (msg.payload?.matched_template) {
    console.log('Template:', msg.payload.matched_template);
  }
  if (msg.payload?.exploit_chain) {
    console.log('Exploit chain:', msg.payload.exploit_chain);
  }
};
```

### Verify Feature Status

Check orchestrator initialization logs:
```bash
docker compose logs agent | grep "initialized"
```

You should see:
- ✅ "Memory store initialized"
- ✅ "Template library initialized"
- ✅ "Exploit chain components initialized"
- ✅ "Threat intelligence components initialized"
- ✅ "Exploit generation components initialized"
- ✅ "Parallel executor initialized"

---

## Configuration Checklist

Before testing, ensure:

- [ ] `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` set in `.env`
- [ ] `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` configured
- [ ] ChromaDB directory writable (`./chroma_db/`)
- [ ] Template directory writable (`./templates/`)
- [ ] Project settings loaded (if using database)

**Optional (for full feature testing):**
- [ ] `NVD_API_KEY` for threat intel
- [ ] `SHODAN_API_KEY` for Shodan integration
- [ ] `AUTONOMOUS_MODE=true` for autonomous testing
- [ ] `MULTI_AGENT_ENABLED=true` for multi-agent testing

---

## Troubleshooting

### Feature Not Working?

1. **Check initialization:**
   ```bash
   docker compose logs agent | grep "Failed to initialize"
   ```

2. **Check dependencies:**
   ```bash
   docker compose exec agent pip list | grep chromadb
   ```

3. **Check permissions:**
   ```bash
   ls -la chroma_db/ templates/
   ```

### Memory Not Storing?

- Verify `OPENAI_API_KEY` is set (needed for embeddings)
- Check ChromaDB directory exists and is writable
- Look for errors in logs: `"Failed to store exploit success"`

### Planning Not Happening?

- Check logs for: `"Routing to plan_strategy"`
- Verify objective is new (planning only for new objectives)
- Check if plan already exists (won't regenerate)

### Templates Not Matching?

- Verify templates directory exists
- Check template file: `cat templates/templates.json`
- Ensure target matches template criteria (CVE, service)

---

## Performance Benchmarks

**Expected improvements:**

- **Planning:** 3-5x faster execution (fewer wrong turns)
- **Memory:** 5-10x faster exploit success (learns from past)
- **Templates:** 10x faster execution (reuses proven patterns)
- **Parallelization:** 3-5x faster (parallel execution)
- **Context Management:** 70% context size reduction

**Measure:**
- Time to first exploit
- Total execution time
- Number of steps before success
- Context size (before/after compression)

---

## Next Steps

After testing, refer to the plan document for:
- Unit test requirements
- Integration test requirements
- Performance benchmarks
- Security validation

See: `/Users/ow49488/.cursor/plans/10x_autonomous_offensive_security_agent_enhancement_200647dc.plan.md`
