# Complete Testing Scenario: Acunetix Test Site

## Target Information
- **URL**: http://testasp.vulnweb.com/
- **Type**: Deliberately vulnerable ASP web application
- **Known Vulnerabilities**: SQL Injection, Directory Traversal, XSS
- **Purpose**: Testing and demonstration site for Acunetix Web Vulnerability Scanner

---

## Test Scenario Prompt

Copy and paste this prompt into the AI Assistant chat:

```
I need you to perform a comprehensive security assessment of http://testasp.vulnweb.com/. 

My objectives are:
1. Identify all exposed services, ports, and technologies
2. Discover and catalog all vulnerabilities (especially SQL injection, XSS, directory traversal)
3. Attempt to exploit SQL injection vulnerabilities to extract database information
4. Test for authentication bypass vulnerabilities
5. Document all findings in the graph database

Please start with reconnaissance to understand the attack surface, then proceed with exploitation if you find critical vulnerabilities. Use a systematic approach and document everything you discover.
```

---

## What This Tests

### 1. Strategic Planning Engine ✅
**Expected Behavior:**
- Agent should generate a multi-step attack plan before starting
- Plan should include: reconnaissance → vulnerability identification → exploitation → documentation
- Check logs for: `"Planning strategy..."` and `"Plan generated: X steps"`

**What to Look For:**
- Agent mentions having a plan
- References plan steps in reasoning
- Follows plan sequentially

### 2. Persistent Learning Memory System ✅
**How to Test:**
1. Run the scenario once (let it complete or run for a while)
2. Send the same prompt again: `"Perform the same security assessment on http://testasp.vulnweb.com/"`
3. **Expected:** Agent should reference past findings, be faster, use learned approaches

**What to Look For:**
- Logs show: `"Retrieved X similar memories"`
- Agent mentions past exploits or findings
- Faster execution on second run

### 3. Risk Assessment & Autonomous Decisions ✅
**Expected Behavior:**
- Agent assesses risk before each action
- Low-risk actions (info gathering) proceed automatically
- High-risk actions (SQL injection exploits) may require approval

**What to Look For:**
- Logs show: `"Risk assessment: score=X, requires_approval=Y"`
- Approval dialogs for exploitation phase
- Safety gates blocking destructive commands

### 4. Exploit Chain Optimization ✅
**Expected Behavior:**
- If multiple vulnerabilities found, agent builds optimal exploit chain
- Checks prerequisites before each exploit step

**What to Look For:**
- Logs show: `"Built exploit chain with X steps"`
- Agent mentions exploit prerequisites
- Sequential exploit execution

### 5. Adaptive Context Management ✅
**How to Test:**
- Let the agent run for 100+ steps (long conversation)
- **Expected:** Context compression kicks in, important events preserved

**What to Look For:**
- Logs show: `"Compressing execution trace"`
- Agent remembers critical findings even after many steps
- No context overflow errors

### 6. Pattern Recognition & Templates ✅
**How to Test:**
- After first successful SQL injection exploit
- Run similar query on another page: `"Test for SQL injection on the login page"`
- **Expected:** Agent uses template from previous exploit

**What to Look For:**
- Logs show: `"Found matching template"`
- Faster exploit execution using template
- Template extraction on success: `"Extracted template"`

### 7. Threat Intelligence Integration ✅
**Expected Behavior:**
- Agent queries threat intel for known ASP vulnerabilities
- Uses latest exploit techniques

**What to Look For:**
- Logs show: `"Fetched X CVEs from NVD"` (if API key configured)
- Agent references known vulnerabilities for ASP

### 8. Parallel Execution ✅
**How to Test:**
- Send query: `"Scan multiple pages on testasp.vulnweb.com for SQL injection: /Login.asp, /Search.asp, /showforum.asp"`
- **Expected:** Agent executes scans in parallel

**What to Look For:**
- Logs show: `"Executing parallel task"`
- Multiple tasks running simultaneously
- Faster completion

---

## Step-by-Step Testing Guide

### Phase 1: Initial Assessment

**Prompt 1:**
```
Perform reconnaissance on http://testasp.vulnweb.com/. Identify all services, technologies, and exposed endpoints. Look for common vulnerabilities like SQL injection, XSS, and directory traversal.
```

**What to Verify:**
- ✅ Planning phase generates attack plan
- ✅ Agent queries graph database first (Graph-First Approach)
- ✅ Uses web_search to research ASP vulnerabilities
- ✅ Performs port scanning if needed
- ✅ Documents findings in target_info

**Expected Findings:**
- ASP application
- Multiple endpoints: /Login.asp, /Search.asp, /showforum.asp, etc.
- Potential SQL injection points
- Directory traversal opportunities

---

### Phase 2: Vulnerability Exploitation

**Prompt 2:**
```
Now that you've identified the attack surface, test for SQL injection vulnerabilities. Start with the login page and search functionality. If you find SQL injection, attempt to extract database schema information.
```

**What to Verify:**
- ✅ Risk assessment for exploitation actions
- ✅ Approval request for phase transition (if configured)
- ✅ Exploit chain building if multiple injection points found
- ✅ Memory storage of successful exploits
- ✅ Template extraction on success

**Expected Behavior:**
- Agent requests approval to enter exploitation phase
- Tests SQL injection on identified endpoints
- Documents successful exploits in graph

---

### Phase 3: Learning & Reuse

**Prompt 3:**
```
I want you to test the same target again, but this time focus on finding additional SQL injection points we might have missed. Use what you learned from the previous assessment.
```

**What to Verify:**
- ✅ Memory retrieval: `"Retrieved X similar memories"`
- ✅ Template matching: `"Found matching template"`
- ✅ Faster execution (uses past experience)
- ✅ References previous findings

**Expected Behavior:**
- Agent quickly identifies similar vulnerabilities
- Uses proven exploit techniques from memory
- Faster overall execution

---

### Phase 4: Comprehensive Assessment

**Prompt 4:**
```
Perform a complete penetration test of http://testasp.vulnweb.com/. Include:
1. Port scanning
2. Technology fingerprinting  
3. SQL injection testing on all forms
4. XSS testing
5. Directory traversal attempts
6. Authentication bypass testing
7. Session management testing

Document all findings and create a comprehensive report.
```

**What to Verify:**
- ✅ Parallel execution for independent tasks
- ✅ Context management (long conversation)
- ✅ Exploit chain optimization
- ✅ Risk-based decision making
- ✅ Strategic planning for complex multi-step assessment

---

## Monitoring Commands

While testing, run these in separate terminals:

### Terminal 1: Watch Agent Logs
```bash
docker compose logs -f agent | grep -E "(Planning|Memory|Template|Risk|Chain|Parallel|Compressing)"
```

### Terminal 2: Watch Feature Activity
```bash
docker compose logs -f agent | grep -E "(attack_plan|retrieved_memories|matched_template|exploit_chain|risk_score)"
```

### Terminal 3: Monitor WebSocket Messages
```bash
# In browser console, add:
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.payload?.attack_plan) console.log('📋 Plan:', msg.payload.attack_plan);
  if (msg.payload?.retrieved_memories?.length) console.log('🧠 Memories:', msg.payload.retrieved_memories.length);
  if (msg.payload?.matched_template) console.log('📝 Template:', msg.payload.matched_template.name);
  if (msg.payload?.exploit_chain) console.log('🔗 Chain:', msg.payload.exploit_chain.length, 'steps');
};
```

---

## Expected Results

### Successful Test Indicators:

1. **Planning:**
   - ✅ Plan generated with 5-10 steps
   - ✅ Plan includes prerequisites and risk scores
   - ✅ Agent references plan in reasoning

2. **Memory:**
   - ✅ First run: Stores exploit success
   - ✅ Second run: Retrieves memories, faster execution

3. **Risk Assessment:**
   - ✅ Low-risk actions auto-approved
   - ✅ High-risk actions require approval
   - ✅ Safety gates prevent destructive commands

4. **Exploit Chain:**
   - ✅ Multiple vulnerabilities → chain built
   - ✅ Prerequisites checked before each step

5. **Context Management:**
   - ✅ Long conversations compressed
   - ✅ Important events (SQL injection success) preserved

6. **Templates:**
   - ✅ Template extracted from successful SQL injection
   - ✅ Template matched on similar targets

7. **Parallelization:**
   - ✅ Multiple scans execute simultaneously
   - ✅ 3-5x faster than sequential

---

## Troubleshooting

### If Planning Doesn't Happen:
- Check logs: `docker compose logs agent | grep "Planning"`
- Verify it's a new objective (planning only for new objectives)

### If Memory Doesn't Store:
- Check: `docker compose logs agent | grep "Memory"`
- Verify OPENAI_API_KEY is set (needed for embeddings)
- Check ChromaDB directory: `ls -la chroma_db/`

### If Templates Don't Match:
- Check: `docker compose logs agent | grep "Template"`
- Verify templates directory: `ls -la templates/`
- Check template file: `cat templates/templates.json`

### If Risk Assessment Doesn't Show:
- Check logs: `docker compose logs agent | grep "Risk assessment"`
- Verify autonomous mode settings

---

## Success Criteria

✅ **All features working if you see:**
- Plan generated before execution
- Memories retrieved on second run
- Risk scores in logs
- Exploit chains built
- Context compression after 100+ steps
- Templates matched and extracted
- Parallel tasks executing

The agent should demonstrate significantly improved capabilities compared to the baseline system!
