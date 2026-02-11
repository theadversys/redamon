# PandaExploit Implementation Details: LangChain, Neo4j, and Metasploit

This document provides exact implementation details for the three core technologies used in PandaExploit:
1. **LangChain & LangGraph** - AI agent orchestration
2. **Neo4j Bolt & Browser** - Graph database integration
3. **Metasploit** - Exploitation framework integration

---

## Table of Contents

1. [LangChain & LangGraph Implementation](#1-langchain--langgraph-implementation)
2. [Neo4j Bolt Protocol Implementation](#2-neo4j-bolt-protocol-implementation)
3. [Neo4j Browser Integration](#3-neo4j-browser-integration)
4. [Metasploit Integration](#4-metasploit-integration)

---

## 1. LangChain & LangGraph Implementation

### 1.1 Architecture Overview

PandaExploit uses **LangGraph** to implement a ReAct (Reasoning + Acting) pattern agent orchestrator. The system is built on top of LangChain's core abstractions.

**Key Components:**
- `AgentOrchestrator` - Main orchestrator class
- `StateGraph` - LangGraph state machine
- `MemorySaver` - Checkpoint-based state persistence
- `ChatOpenAI` / `ChatAnthropic` - LLM providers
- `Neo4jGraph` - LangChain Neo4j integration
- `MultiServerMCPClient` - MCP tool integration

### 1.2 Core Dependencies

```python
# From agentic/requirements.txt
langchain>=0.3.0
langchain-openai>=0.3.0
langchain-anthropic>=0.3.0
langgraph>=0.2.0
langchain-core>=0.3.0
langchain-mcp-adapters>=0.1.0
langchain-neo4j>=0.1.0
langchain-tavily>=0.1.0
```

### 1.3 State Definition

The agent state is defined using LangGraph's `TypedDict` pattern:

```python
# From agentic/state.py
from typing import TypedDict, Annotated, Literal
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    """LangGraph state definition for ReAct agent."""
    
    # Messages (conversation history)
    messages: Annotated[list[BaseMessage], add_messages]
    
    # Iteration tracking
    current_iteration: int
    max_iterations: int
    
    # Phase management
    current_phase: Literal["informational", "exploitation", "post_exploitation"]
    attack_path_type: Literal["cve_exploit", "brute_force_credential_guess"]
    
    # Execution trace
    execution_trace: list[dict]  # List of ExecutionStep dicts
    
    # Todo list (LLM-managed)
    todo_list: list[dict]  # List of TodoItem dicts
    
    # Target information (accumulated intelligence)
    target_info: dict  # TargetInfo dict
    
    # Multi-objective support
    conversation_objectives: list[dict]
    current_objective_index: int
    objective_history: list[dict]
    
    # Phase transition approval
    phase_transition_pending: Optional[dict]
    awaiting_user_approval: bool
    user_approval_response: Optional[str]
    
    # Q&A support
    pending_question: Optional[dict]
    awaiting_user_question: bool
    user_question_answer: Optional[str]
    qa_history: list[dict]
    
    # Task completion
    task_complete: bool
    completion_reason: Optional[str]
    
    # Tenant context
    user_id: str
    project_id: str
    session_id: str
    
    # Internal state markers
    _current_step: Optional[dict]
    _decision: Optional[dict]
    _just_transitioned_to: Optional[str]
    _completed_step: Optional[dict]
    _emitted_approval_key: Optional[str]
    _emitted_question_key: Optional[str]
```

### 1.4 LangGraph State Machine Construction

```python
# From agentic/orchestrator.py

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

class AgentOrchestrator:
    def __init__(self):
        self.llm: Optional[BaseChatModel] = None
        self.graph = None
        self.checkpointer = MemorySaver()
    
    def _build_graph(self) -> None:
        """Build the ReAct LangGraph with phase tracking."""
        builder = StateGraph(AgentState)
        
        # Add nodes
        builder.add_node("initialize", self._initialize_node)
        builder.add_node("think", self._think_node)
        builder.add_node("execute_tool", self._execute_tool_node)
        builder.add_node("await_approval", self._await_approval_node)
        builder.add_node("process_approval", self._process_approval_node)
        builder.add_node("await_question", self._await_question_node)
        builder.add_node("process_answer", self._process_answer_node)
        builder.add_node("generate_response", self._generate_response_node)
        
        # Entry point
        builder.add_edge(START, "initialize")
        
        # Conditional routing after initialize
        builder.add_conditional_edges(
            "initialize",
            self._route_after_initialize,
            {
                "process_approval": "process_approval",
                "process_answer": "process_answer",
                "think": "think",
            }
        )
        
        # Main routing from think node
        builder.add_conditional_edges(
            "think",
            self._route_after_think,
            {
                "execute_tool": "execute_tool",
                "await_approval": "await_approval",
                "await_question": "await_question",
                "generate_response": "generate_response",
            }
        )
        
        # Tool execution flows back to think
        builder.add_edge("execute_tool", "think")
        
        # Approval/question flows pause at END
        builder.add_edge("await_approval", END)
        builder.add_edge("await_question", END)
        
        # Process approval/answer routes back to think
        builder.add_conditional_edges(
            "process_approval",
            self._route_after_approval,
            {
                "think": "think",
                "generate_response": "generate_response",
            }
        )
        
        builder.add_conditional_edges(
            "process_answer",
            self._route_after_answer,
            {
                "think": "think",
                "generate_response": "generate_response",
            }
        )
        
        # Final response always ends
        builder.add_edge("generate_response", END)
        
        # Compile with checkpointer
        self.graph = builder.compile(checkpointer=self.checkpointer)
```

### 1.5 LLM Initialization

```python
# From agentic/orchestrator.py

from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

def _setup_llm(self) -> None:
    """Initialize the LLM based on model name (OpenAI or Anthropic)."""
    if self.model_name.startswith("claude-"):
        if not self.anthropic_api_key:
            raise ValueError(f"ANTHROPIC_API_KEY required for {self.model_name}")
        self.llm = ChatAnthropic(
            model=self.model_name,
            api_key=self.anthropic_api_key,
            temperature=0,
            max_tokens=4096,
        )
    else:
        if not self.openai_api_key:
            raise ValueError(f"OPENAI_API_KEY required for {self.model_name}")
        self.llm = ChatOpenAI(
            model=self.model_name,
            api_key=self.openai_api_key,
            temperature=0,
        )
```

### 1.6 Think Node Implementation (Core ReAct Loop)

```python
# From agentic/orchestrator.py

async def _think_node(self, state: AgentState, config = None) -> dict:
    """
    Core ReAct reasoning node.
    
    Analyzes previous steps, updates todo list, and decides next action.
    """
    user_id, project_id, session_id = get_identifiers(state, config)
    iteration = state.get("current_iteration", 0) + 1
    phase = state.get("current_phase", "informational")
    
    # Set context for tools
    set_tenant_context(user_id, project_id)
    set_phase_context(phase)
    
    # Build system prompt with current state
    system_prompt = REACT_SYSTEM_PROMPT.format(
        current_phase=phase,
        attack_path_type=state.get("attack_path_type", "cve_exploit"),
        available_tools=get_phase_tools(phase, ...),
        iteration=iteration,
        max_iterations=state.get("max_iterations", 100),
        objective=current_objective,
        execution_trace=format_execution_trace(state.get("execution_trace", [])),
        todo_list=format_todo_list(state.get("todo_list", [])),
        target_info=json_dumps_safe(state.get("target_info", {})),
        qa_history=format_qa_history(state.get("qa_history", [])),
    )
    
    # Check for pending tool output to analyze
    pending_step = state.get("_current_step")
    has_pending_output = (
        pending_step and
        pending_step.get("tool_output") is not None and
        not pending_step.get("output_analysis")
    )
    
    if has_pending_output:
        # Inject output analysis section into prompt
        output_section = PENDING_OUTPUT_ANALYSIS_SECTION.format(
            tool_name=pending_step.get("tool_name", "unknown"),
            tool_args=json_dumps_safe(pending_step.get("tool_args") or {}),
            success=pending_step.get("success", False),
            tool_output=pending_step.get("tool_output", "")[:8000],
        )
        system_prompt = system_prompt + "\n" + output_section
    
    # Drain pending guidance messages
    guidance_messages = []
    if self._guidance_queue:
        while not self._guidance_queue.empty():
            try:
                guidance_messages.append(self._guidance_queue.get_nowait())
            except asyncio.QueueEmpty:
                break
    
    if guidance_messages:
        guidance_section = "\n\n## USER GUIDANCE (IMPORTANT)\n\n"
        for i, msg in enumerate(guidance_messages, 1):
            guidance_section += f"{i}. {msg}\n"
        system_prompt += guidance_section
    
    # Get LLM decision
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content="Based on the current state, what is your next action? Output EXACTLY ONE valid JSON object.")
    ]
    
    response = await self.llm.ainvoke(messages)
    decision = parse_llm_decision(response.content)
    
    # Process decision and update state
    updates = {
        "current_iteration": iteration,
        "todo_list": [item.model_dump() for item in decision.updated_todo_list],
        "_current_step": step.model_dump(),
        "_decision": decision.model_dump(),
    }
    
    # Process output analysis if pending
    if has_pending_output and decision.output_analysis:
        # Merge target info, update execution trace
        # ... (detailed implementation)
    
    return updates
```

### 1.7 Graph Execution with Streaming

```python
# From agentic/orchestrator.py

async def invoke_with_streaming(
    self,
    question: str,
    user_id: str,
    project_id: str,
    session_id: str,
    streaming_callback,
    guidance_queue=None
) -> InvokeResponse:
    """Invoke agent with streaming callbacks for real-time updates."""
    
    self._apply_project_settings(project_id)
    self._streaming_callback = streaming_callback
    self._guidance_queue = guidance_queue
    
    config = create_config(user_id, project_id, session_id)
    input_data = {
        "messages": [HumanMessage(content=question)]
    }
    
    # Stream graph execution
    final_state = None
    async for event in self.graph.astream(input_data, config, stream_mode="values"):
        final_state = event
        await self._emit_streaming_events(event, streaming_callback)
    
    return self._build_response(final_state)
```

### 1.8 Checkpointing & State Persistence

```python
# From agentic/orchestrator_helpers/config.py

from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

def create_config(user_id: str, project_id: str, session_id: str) -> dict:
    """Create LangGraph config with thread_id for checkpointing."""
    return {
        "configurable": {
            "thread_id": f"{user_id}:{project_id}:{session_id}",
            "user_id": user_id,
            "project_id": project_id,
            "session_id": session_id,
        }
    }

# Resume from checkpoint
async def resume_execution_with_streaming(...):
    config = create_config(user_id, project_id, session_id)
    
    # Re-invoke graph from last checkpoint with empty input
    async for event in self.graph.astream({}, config, stream_mode="values"):
        final_state = event
        await self._emit_streaming_events(event, streaming_callback)
```

### 1.9 Tool Integration via LangChain

```python
# From agentic/tools.py

from langchain_core.tools import tool
from langchain_neo4j import Neo4jGraph
from langchain_mcp_adapters.client import MultiServerMCPClient

# Neo4j tool wrapped in LangChain @tool decorator
@tool
async def query_graph(question: str) -> str:
    """Query Neo4j graph using natural language."""
    # Implementation uses LangChain Neo4jGraph
    manager = self  # Neo4jToolManager instance
    cypher = await manager._generate_cypher(question)
    filtered_cypher = manager._inject_tenant_filter(cypher, user_id, project_id)
    result = manager.graph.query(filtered_cypher, params={...})
    return str(result)

# MCP tools loaded via LangChain adapter
mcp_servers = {
    "metasploit": {
        "url": "http://kali-sandbox:8003/sse",
        "transport": "sse",
        "timeout": 60,
        "sse_read_timeout": 1800,
    }
}
client = MultiServerMCPClient(mcp_servers)
mcp_tools = await client.get_tools()
```

---

## 2. Neo4j Bolt Protocol Implementation

### 2.1 Connection Setup

**Python Driver (Backend):**

```python
# From graph_db/neo4j_client.py

from neo4j import GraphDatabase

class Neo4jClient:
    def __init__(self, uri=None, user=None, password=None):
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USER")
        self.password = password or os.getenv("NEO4J_PASSWORD")
        self.driver = GraphDatabase.driver(
            self.uri,
            auth=(self.user, self.password)
        )
    
    def verify_connection(self):
        """Verify the connection to Neo4j is working."""
        try:
            with self.driver.session() as session:
                result = session.run("RETURN 1 AS test")
                return result.single()["test"] == 1
        except Exception as e:
            print(f"[!] Neo4j connection failed: {e}")
            return False
```

**LangChain Integration:**

```python
# From agentic/tools.py

from langchain_neo4j import Neo4jGraph

class Neo4jToolManager:
    def __init__(self, uri: str, user: str, password: str, llm: BaseChatModel):
        self.uri = uri
        self.user = user
        self.password = password
        self.llm = llm
        self.graph: Optional[Neo4jGraph] = None
    
    def get_tool(self) -> Optional[callable]:
        """Set up and return the Neo4j text-to-cypher tool."""
        try:
            self.graph = Neo4jGraph(
                url=self.uri,
                username=self.user,
                password=self.password
            )
            # ... returns query_graph tool
        except Exception as e:
            logger.error(f"Failed to set up Neo4j: {e}")
            return None
```

**Node.js Driver (Frontend):**

```typescript
// From webapp/src/app/api/graph/neo4j.ts

import neo4j, { Driver } from 'neo4j-driver'

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687'
const user = process.env.NEO4J_USER || 'neo4j'
const password = process.env.NEO4J_PASSWORD || 'password'

function createDriver(): Driver {
  return neo4j.driver(
    uri,
    neo4j.auth.basic(user, password),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 30000,
      connectionTimeout: 30000,
    }
  )
}

export function getDriver(): Driver {
  if (process.env.NODE_ENV === 'production') {
    return createDriver()
  }
  
  if (!global.neo4jDriver) {
    global.neo4jDriver = createDriver()
  }
  return global.neo4jDriver
}

export function getSession() {
  return getDriver().session()
}
```

### 2.2 Text-to-Cypher Query Generation

```python
# From agentic/tools.py

async def _generate_cypher(
    self,
    question: str,
    previous_error: str = None,
    previous_cypher: str = None
) -> str:
    """Use LLM to generate a Cypher query from natural language."""
    
    schema = self.graph.get_schema
    
    # Build prompt with optional error context for retries
    error_context = ""
    if previous_error and previous_cypher:
        error_context = f"""
## Previous Attempt Failed
Failed Query: {previous_cypher}
Error Message: {previous_error}
"""
    
    prompt = f"""{TEXT_TO_CYPHER_SYSTEM}

## Current Database Schema
{schema}
{error_context}

## Important Rules
- Generate ONLY the Cypher query, no explanations
- Do NOT include user_id or project_id filters - they will be added automatically
- Always use LIMIT to restrict results

User Question: {question}

Cypher Query:"""
    
    response = await self.llm.ainvoke(prompt)
    cypher = response.content.strip()
    
    # Clean up markdown code blocks if present
    if cypher.startswith("```"):
        lines = cypher.split("\n")
        cypher = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    
    return cypher.strip()
```

### 2.3 Tenant Filter Injection

```python
# From agentic/tools.py

def _inject_tenant_filter(self, cypher: str, user_id: str, project_id: str) -> str:
    """
    Inject mandatory user_id and project_id filters into a Cypher query.
    
    Strategy: Add tenant properties directly into each node pattern.
    """
    tenant_props = "user_id: $tenant_user_id, project_id: $tenant_project_id"
    
    def add_tenant_to_node(match: re.Match) -> str:
        """Add tenant properties to a node pattern."""
        var_name = match.group(1)
        label = match.group(2)
        existing_props_content = match.group(3)
        
        if existing_props_content is not None:
            existing_props_content = existing_props_content.strip()
            if existing_props_content:
                new_props = f"{{{existing_props_content}, {tenant_props}}}"
            else:
                new_props = f"{{{tenant_props}}}"
            return f"({var_name}:{label} {new_props})"
        else:
            return f"({var_name}:{label} {{{tenant_props}}})"
    
    # Pattern matches: (variable:Label) or (variable:Label {props})
    node_pattern = r'\((\w+):(\w+)(?:\s*\{([^}]*)\})?\)'
    result = re.sub(node_pattern, add_tenant_to_node, cypher)
    
    return result
```

### 2.4 Query Execution with Retry Logic

```python
# From agentic/tools.py

@tool
async def query_graph(question: str) -> str:
    """Query the Neo4j graph database using natural language."""
    user_id = current_user_id.get()
    project_id = current_project_id.get()
    
    last_error = None
    last_cypher = None
    
    for attempt in range(get_setting('CYPHER_MAX_RETRIES', 3)):
        try:
            # Step 1: Generate Cypher
            if attempt == 0:
                cypher = await manager._generate_cypher(question)
            else:
                cypher = await manager._generate_cypher(
                    question,
                    previous_error=last_error,
                    previous_cypher=last_cypher
                )
            
            # Step 2: Inject tenant filters
            filtered_cypher = manager._inject_tenant_filter(cypher, user_id, project_id)
            
            # Step 3: Execute query
            result = manager.graph.query(
                filtered_cypher,
                params={
                    "tenant_user_id": user_id,
                    "tenant_project_id": project_id
                }
            )
            
            if not result:
                return "No results found"
            
            return str(result)
            
        except Exception as e:
            error_msg = str(e)
            last_error = error_msg
            last_cypher = cypher if 'cypher' in locals() else None
            
            if attempt == get_setting('CYPHER_MAX_RETRIES', 3) - 1:
                return f"Error querying graph after {get_setting('CYPHER_MAX_RETRIES', 3)} attempts: {error_msg}"
    
    return "Error: Unexpected end of retry loop"
```

### 2.5 Schema Initialization

```python
# From graph_db/neo4j_client.py

def _init_schema(self, session):
    """Initialize constraints and indexes for the graph schema."""
    
    # Constraints (uniqueness)
    constraints = [
        "CREATE CONSTRAINT domain_unique IF NOT EXISTS FOR (d:Domain) REQUIRE (d.name, d.user_id, d.project_id) IS UNIQUE",
        "CREATE CONSTRAINT subdomain_unique IF NOT EXISTS FOR (s:Subdomain) REQUIRE s.name IS UNIQUE",
        "CREATE CONSTRAINT ip_unique IF NOT EXISTS FOR (i:IP) REQUIRE i.address IS UNIQUE",
        "CREATE CONSTRAINT baseurl_unique IF NOT EXISTS FOR (u:BaseURL) REQUIRE u.url IS UNIQUE",
        "CREATE CONSTRAINT cve_unique IF NOT EXISTS FOR (c:CVE) REQUIRE c.id IS UNIQUE",
        "CREATE CONSTRAINT vulnerability_unique IF NOT EXISTS FOR (v:Vulnerability) REQUIRE v.id IS UNIQUE",
        "CREATE CONSTRAINT exploit_unique IF NOT EXISTS FOR (e:Exploit) REQUIRE e.id IS UNIQUE",
    ]
    
    # Tenant composite indexes
    tenant_indexes = [
        "CREATE INDEX idx_domain_tenant IF NOT EXISTS FOR (d:Domain) ON (d.user_id, d.project_id)",
        "CREATE INDEX idx_subdomain_tenant IF NOT EXISTS FOR (s:Subdomain) ON (s.user_id, s.project_id)",
        "CREATE INDEX idx_ip_tenant IF NOT EXISTS FOR (i:IP) ON (i.user_id, i.project_id)",
        # ... more tenant indexes
    ]
    
    # Additional indexes
    additional_indexes = [
        "CREATE INDEX subdomain_name IF NOT EXISTS FOR (s:Subdomain) ON (s.name)",
        "CREATE INDEX ip_address IF NOT EXISTS FOR (i:IP) ON (i.address)",
        "CREATE INDEX vuln_severity IF NOT EXISTS FOR (v:Vulnerability) ON (v.severity)",
        "CREATE INDEX cve_severity IF NOT EXISTS FOR (c:CVE) ON (c.severity)",
        # ... more indexes
    ]
    
    for query in constraints + tenant_indexes + additional_indexes:
        try:
            session.run(query)
        except Exception as e:
            if "already exists" not in str(e).lower():
                print(f"[!] Schema warning: {e}")
```

### 2.6 Data Insertion Example

```python
# From graph_db/neo4j_client.py

def _create_domain_node(self, session, domain_data, user_id, project_id):
    """Create Domain node with WHOIS data."""
    session.run(
        """
        MERGE (d:Domain {
            name: $name,
            user_id: $user_id,
            project_id: $project_id
        })
        SET d.registrar = $registrar,
            d.creation_date = $creation_date,
            d.expiration_date = $expiration_date,
            d.name_servers = $name_servers,
            d.updated_at = datetime()
        RETURN d
        """,
        {
            "name": domain_data["name"],
            "user_id": user_id,
            "project_id": project_id,
            "registrar": domain_data.get("registrar"),
            "creation_date": domain_data.get("creation_date"),
            "expiration_date": domain_data.get("expiration_date"),
            "name_servers": domain_data.get("name_servers", []),
        }
    )
```

---

## 3. Neo4j Browser Integration

### 3.1 Browser Access Configuration

**Docker Compose Setup:**

```yaml
# From docker-compose.yml

neo4j:
  image: neo4j:5.26-community
  container_name: pandaexploit-neo4j
  environment:
    NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:-changeme123}
    NEO4J_PLUGINS: '["apoc"]'
    NEO4J_dbms_security_procedures_unrestricted: apoc.*
    NEO4J_dbms_security_procedures_allowlist: apoc.*
  ports:
    - "${NEO4J_HTTP_PORT:-7474}:7474"  # Browser UI
    - "${NEO4J_BOLT_PORT:-7687}:7687"  # Bolt protocol
  volumes:
    - neo4j_data:/data
    - neo4j_logs:/logs
    - neo4j_import:/var/lib/neo4j/import
    - neo4j_plugins:/plugins
```

**Access URLs:**
- **Browser UI**: http://localhost:7474
- **Bolt Protocol**: bolt://localhost:7687

### 3.2 Frontend Graph Query API

```typescript
// From webapp/src/app/api/graph/route.ts

import { getSession } from './neo4j'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  
  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }
  
  const session = getSession()
  
  try {
    // Query all nodes and relationships for the project
    const result = await session.run(
      `
      // Get direct relationships from project nodes
      MATCH (n)-[r]->(m)
      WHERE n.project_id = $projectId
      RETURN n, r, m
      
      UNION
      
      // Get CVE chain: Technology -> CVE -> MitreData -> Capec
      MATCH (t:Technology {project_id: $projectId})-[r1:HAS_KNOWN_CVE]->(c:CVE)
      RETURN t as n, r1 as r, c as m
      
      UNION
      
      // Get Vulnerability relationships
      MATCH (v:Vulnerability {project_id: $projectId})-[r5]->(target)
      RETURN v as n, r5 as r, target as m
      
      // ... more UNION queries for complete graph
      `,
      { projectId }
    )
    
    // Transform Neo4j records to frontend format
    const nodes: Map<string, any> = new Map()
    const links: any[] = []
    
    result.records.forEach(record => {
      const n = record.get('n')
      const m = record.get('m')
      const r = record.get('r')
      
      // Extract node data
      if (n) {
        const nodeId = `${n.labels[0]}_${n.identity.low}`
        nodes.set(nodeId, {
          id: nodeId,
          labels: n.labels,
          properties: n.properties,
          identity: n.identity,
        })
      }
      
      if (m) {
        const nodeId = `${m.labels[0]}_${m.identity.low}`
        nodes.set(nodeId, {
          id: nodeId,
          labels: m.labels,
          properties: m.properties,
          identity: m.identity,
        })
      }
      
      // Extract relationship data
      if (r && n && m) {
        links.push({
          id: `${r.type}_${r.identity.low}`,
          source: `${n.labels[0]}_${n.identity.low}`,
          target: `${m.labels[0]}_${m.identity.low}`,
          type: r.type,
          properties: r.properties,
        })
      }
    })
    
    return NextResponse.json({
      nodes: Array.from(nodes.values()),
      links,
    })
    
  } finally {
    await session.close()
  }
}
```

### 3.3 Browser Query Examples

**View All Project Data:**

```cypher
-- Show all nodes and relationships for a project
MATCH (n {project_id: "my_project"})
OPTIONAL MATCH (n)-[r]->(m)
RETURN n, r, m
```

**Query Vulnerabilities:**

```cypher
-- Find all critical vulnerabilities
MATCH (v:Vulnerability {project_id: "my_project", severity: "critical"})
OPTIONAL MATCH (v)-[:FOUND_AT]->(e:Endpoint)
OPTIONAL MATCH (v)-[:AFFECTS_PARAMETER]->(p:Parameter)
RETURN v, e, p
```

**Traverse Attack Surface:**

```cypher
-- Domain -> Subdomain -> IP -> Port -> Service -> Technology -> CVE
MATCH path = (d:Domain {project_id: "my_project"})
  -[:HAS_SUBDOMAIN]->(s:Subdomain)
  -[:RESOLVES_TO]->(i:IP)
  -[:HAS_PORT]->(p:Port)
  -[:RUNS_SERVICE]->(svc:Service)
  -[:USES_TECHNOLOGY]->(t:Technology)
  -[:HAS_KNOWN_CVE]->(c:CVE)
RETURN path
LIMIT 50
```

**Find Exploitable Targets:**

```cypher
-- Find IPs with open ports and known CVEs
MATCH (i:IP {project_id: "my_project"})
  -[:HAS_PORT]->(p:Port)
  -[:RUNS_SERVICE]->(svc:Service)
  -[:USES_TECHNOLOGY]->(t:Technology)
  -[:HAS_KNOWN_CVE]->(c:CVE {severity: "CRITICAL"})
RETURN i.address, p.number, svc.name, t.name, c.id
ORDER BY c.cvss DESC
```

---

## 4. Metasploit Integration

### 4.1 MCP Server Architecture

**Server Setup:**

```python
# From mcp/servers/metasploit_server.py

from fastmcp import FastMCP
import subprocess
import threading
import queue

SERVER_NAME = "metasploit"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("METASPLOIT_PORT", "8003"))

mcp = FastMCP(SERVER_NAME)
```

### 4.2 Persistent Metasploit Console

```python
# From mcp/servers/metasploit_server.py

class PersistentMsfConsole:
    """
    Manages a persistent msfconsole process with bidirectional I/O.
    
    Uses timing-based output detection - waits for output to settle
    rather than parsing specific prompts.
    """
    
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.output_queue: queue.Queue = queue.Queue()
        self.reader_thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        self.session_ids: Set[int] = set()
        self._initialized = False
        
        # Progress tracking for live updates
        self._current_output: List[str] = []
        self._execution_active: bool = False
        self._current_command: str = ""
        self._execution_start_time: float = 0
        self._progress_lock = threading.Lock()
    
    def start(self) -> bool:
        """Start the persistent msfconsole process."""
        if self.process and self.process.poll() is None:
            return True  # Already running
        
        try:
            print("[MSF] Starting msfconsole process...")
            self.process = subprocess.Popen(
                ["msfconsole", "-q", "-x", ""],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            
            # Start background thread to read output
            self.reader_thread = threading.Thread(
                target=self._read_output,
                daemon=True
            )
            self.reader_thread.start()
            
            # Wait for msfconsole to be ready (can take 60-120s on first start)
            self._wait_for_output(timeout=120, quiet_period=5.0)
            self._initialized = True
            return True
            
        except Exception as e:
            print(f"[MSF] Failed to start msfconsole: {e}")
            return False
    
    def _read_output(self):
        """Background thread to continuously read msfconsole output."""
        try:
            while self.process and self.process.poll() is None:
                line = self.process.stdout.readline()
                if line:
                    self.output_queue.put(line)
                    self._detect_session_events(line)
        except Exception as e:
            print(f"[MSF] Reader thread error: {e}")
```

### 4.3 Timing-Based Output Detection

```python
# From mcp/servers/metasploit_server.py

def _wait_for_output(self, timeout: float, quiet_period: float) -> str:
    """
    Wait for msfconsole output using timing-based detection.
    Waits until no new output arrives for 'quiet_period' seconds.
    """
    output_lines = []
    end_time = time.time() + timeout
    start_time = time.time()
    last_output_time = time.time()
    
    min_wait = min(3.0, timeout / 2)
    
    while time.time() < end_time:
        try:
            line = self.output_queue.get(timeout=0.1)
            stripped = line.rstrip()
            output_lines.append(stripped)
            
            # Only reset quiet period timer for meaningful output
            if self._is_meaningful_output(stripped):
                last_output_time = time.time()
            
            # Track progress for HTTP endpoint
            with self._progress_lock:
                self._current_output.append(stripped)
                
        except queue.Empty:
            elapsed = time.time() - start_time
            time_since_last = time.time() - last_output_time
            
            if output_lines and time_since_last >= quiet_period:
                break
            
            if not output_lines and elapsed < min_wait:
                continue
    
    # Mark execution complete
    with self._progress_lock:
        self._execution_active = False
    
    return '\n'.join(output_lines)

def _is_meaningful_output(self, line: str) -> bool:
    """Check if a line is meaningful output (not just prompt/cursor noise)."""
    # Strip ANSI escape codes
    clean = re.sub(r'\x1b\[[\?]?[0-9;]*[a-zA-Z]', '', line)
    clean = clean.strip()
    
    if not clean:
        return False
    
    # Just the msf prompt = noise
    if re.match(r'^msf\d?\s*([\w\(\)/]+\s*)?>?\s*$', clean, re.IGNORECASE):
        return False
    
    # Shell prompt noise
    if re.match(r'^[\$#>]\s*$', clean):
        return False
    
    return True
```

### 4.4 Command Execution

```python
# From mcp/servers/metasploit_server.py

def execute(self, command: str, timeout: float = 120, quiet_period: float = 2.0) -> str:
    """Execute a command in the persistent msfconsole."""
    with self.lock:
        if not self.process or self.process.poll() is not None:
            if not self.start():
                return "[ERROR] Failed to start msfconsole"
        
        # Track current command for progress endpoint
        with self._progress_lock:
            self._current_command = command
        
        # Clear any pending output
        while not self.output_queue.empty():
            try:
                self.output_queue.get_nowait()
            except queue.Empty:
                break
        
        # Send command(s) - support semicolon chaining
        try:
            if ';' in command:
                commands = [cmd.strip() for cmd in command.split(';') if cmd.strip()]
                for cmd in commands:
                    self.process.stdin.write(cmd + "\n")
                self.process.stdin.flush()
            else:
                self.process.stdin.write(command + "\n")
                self.process.stdin.flush()
        except Exception as e:
            return f"[ERROR] Failed to send command: {e}"
        
        # Collect output
        output = self._wait_for_output(timeout=timeout, quiet_period=quiet_period)
        return output if output else "(no output)"
```

### 4.5 MCP Tool Definition

```python
# From mcp/servers/metasploit_server.py

@mcp.tool()
def metasploit_console(command: str) -> str:
    """
    Execute Metasploit Framework console commands with PERSISTENT state.
    
    This is the ONLY tool you need for all Metasploit operations.
    The msfconsole process runs continuously - state persists between calls.
    
    Args:
        command: The msfconsole command to execute
    
    Returns:
        The output from msfconsole (check prompt to know your context)
    """
    msf = get_msf_console()
    timeout, quiet_period = _get_timing_for_command(command)
    
    result = msf.execute(command, timeout=timeout, quiet_period=quiet_period)
    result = _clean_ansi_output(result)
    
    return result

def _get_timing_for_command(command: str) -> tuple[float, float]:
    """Determine timeout and quiet_period based on command type."""
    cmd_lower = command.lower()
    
    if 'run' in cmd_lower:
        # Brute force modules (ssh_login, ftp_login, etc.)
        return (MSF_RUN_TIMEOUT, MSF_RUN_QUIET_PERIOD)  # 30 min, 2 min quiet
    elif 'exploit' in cmd_lower:
        # CVE exploits - may have staged payloads with delays
        return (MSF_EXPLOIT_TIMEOUT, MSF_EXPLOIT_QUIET_PERIOD)  # 10 min, 3 min quiet
    elif 'search' in cmd_lower:
        return (60, MSF_DEFAULT_QUIET_PERIOD)
    elif 'sessions' in cmd_lower:
        return (60, 5.0)
    else:
        return (MSF_DEFAULT_TIMEOUT, MSF_DEFAULT_QUIET_PERIOD)  # 2 min, 3s quiet
```

### 4.6 Session Detection

```python
# From mcp/servers/metasploit_server.py

def _detect_session_events(self, line: str):
    """Simple session event detection - tracks session IDs."""
    line_lower = line.lower()
    
    # Detect "session X opened"
    if 'session' in line_lower and 'opened' in line_lower:
        try:
            idx = line_lower.index('session')
            rest = line_lower[idx + 7:].strip()
            parts = rest.split()
            if parts and parts[0].isdigit():
                session_id = int(parts[0])
                self.session_ids.add(session_id)
                print(f"[MSF] Session {session_id} opened")
        except (ValueError, IndexError):
            pass
    
    # Detect "session X closed"
    elif 'session' in line_lower and 'closed' in line_lower:
        try:
            idx = line_lower.index('session')
            rest = line_lower[idx + 7:].strip()
            parts = rest.split()
            if parts and parts[0].isdigit():
                session_id = int(parts[0])
                self.session_ids.discard(session_id)
                print(f"[MSF] Session {session_id} closed")
        except (ValueError, IndexError):
            pass
```

### 4.7 Progress Streaming Endpoint

```python
# From mcp/servers/metasploit_server.py

from http.server import HTTPServer, BaseHTTPRequestHandler
import json

PROGRESS_PORT = int(os.getenv("MSF_PROGRESS_PORT", "8013"))

class ProgressHandler(BaseHTTPRequestHandler):
    """HTTP handler for progress endpoint."""
    
    def do_GET(self):
        if self.path == '/progress':
            try:
                msf = get_msf_console()
                progress = msf.get_progress()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(progress).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())

def start_progress_server(port: int = PROGRESS_PORT):
    """Start HTTP server for progress endpoint in a background thread."""
    server = HTTPServer(('0.0.0.0', port), ProgressHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[MSF] Progress server started on port {port}")
    return server

def get_progress(self) -> dict:
    """Get current execution progress (thread-safe) for HTTP endpoint."""
    with self._progress_lock:
        raw_output = '\n'.join(self._current_output[-100:])
        clean_output = _clean_ansi_for_progress(raw_output)
        return {
            "active": self._execution_active,
            "command": self._current_command[:100] if self._current_command else "",
            "elapsed_seconds": round(time.time() - self._execution_start_time, 1) if self._execution_active else 0,
            "line_count": len(self._current_output),
            "output": clean_output
        }
```

### 4.8 ANSI Output Cleaning

```python
# From mcp/servers/metasploit_server.py

def _clean_ansi_output(text: str) -> str:
    """Remove ANSI escape codes and control characters from msfconsole output."""
    # Remove ANSI escape sequences
    text = re.sub(r'\x1b\[[\?]?[0-9;]*[a-zA-Z]', '', text)
    text = re.sub(r'\x1b\][^\x07]*\x07', '', text)
    text = re.sub(r'\x1b[()][AB012]', '', text)
    
    cleaned_lines = []
    for line in text.split('\n'):
        # Handle carriage returns
        if '\r' in line:
            parts = line.split('\r')
            non_empty_parts = [p for p in parts if p.strip()]
            if non_empty_parts:
                line = non_empty_parts[-1]
            else:
                line = ''
        
        # Handle backspaces
        while '\x08' in line:
            pos = line.find('\x08')
            if pos > 0:
                line = line[:pos-1] + line[pos+1:]
            else:
                line = line[1:]
        
        # Remove control characters
        line = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', line)
        line = line.rstrip()
        
        if line or (cleaned_lines and cleaned_lines[-1]):
            cleaned_lines.append(line)
    
    # Remove trailing empty lines
    while cleaned_lines and not cleaned_lines[-1]:
        cleaned_lines.pop()
    
    # Remove garbled echo lines
    final_lines = []
    for line in cleaned_lines:
        if line.startswith('<'):
            continue
        if re.match(r'^msf\s+\S+>\S', line):
            continue
        if len(line) < 5 and not line.startswith('[') and '=>' not in line:
            continue
        final_lines.append(line)
    
    return '\n'.join(final_lines)
```

### 4.9 Agent Integration

```python
# From agentic/tools.py

class MCPToolsManager:
    """Manages MCP (Model Context Protocol) tool connections."""
    
    def __init__(self, ...):
        self.metasploit_url = metasploit_url or os.environ.get(
            'MCP_METASPLOIT_URL',
            'http://host.docker.internal:8003/sse'
        )
        self.client: Optional[MultiServerMCPClient] = None
    
    async def get_tools(self) -> List:
        """Connect to MCP servers and load tools."""
        mcp_servers = {
            "metasploit": {
                "url": self.metasploit_url,
                "transport": "sse",
                "timeout": 60,
                "sse_read_timeout": 1800,  # 30 min for brute force
            }
        }
        
        self.client = MultiServerMCPClient(mcp_servers)
        mcp_tools = await self.client.get_tools()
        
        # Cache tools by name
        for tool in mcp_tools:
            tool_name = getattr(tool, 'name', str(tool))
            self._tools_cache[tool_name] = tool
        
        return mcp_tools

# From agentic/orchestrator.py

async def _execute_tool_node(self, state: AgentState, config = None) -> dict:
    """Execute the selected tool."""
    tool_name = step_data.get("tool_name")
    tool_args = step_data.get("tool_args") or {}
    phase = state.get("current_phase", "informational")
    
    # Auto-reset Metasploit on first use in session
    msf_reset_done = state.get("msf_session_reset_done", False)
    if tool_name == "metasploit_console" and not msf_reset_done:
        await self.tool_executor.execute("msf_restart", {}, phase)
        extra_updates["msf_session_reset_done"] = True
    
    # Check if long-running metasploit command
    is_long_running_msf = (
        tool_name == "metasploit_console" and
        any(cmd in (tool_args.get("command", "") or "").lower() 
            for cmd in ["run", "exploit"])
    )
    
    # Execute with progress streaming for long-running commands
    if is_long_running_msf and self._streaming_callback:
        result = await self.tool_executor.execute_with_progress(
            tool_name,
            tool_args,
            phase,
            progress_callback=self._streaming_callback.on_tool_output_chunk
        )
    else:
        result = await self.tool_executor.execute(tool_name, tool_args, phase)
    
    return {"_current_step": step_data, "_tool_result": result}
```

### 4.10 Progress Polling Implementation

```python
# From agentic/tools.py

async def execute_with_progress(
    self,
    tool_name: str,
    tool_args: dict,
    phase: str,
    progress_callback: Callable[[str, str, bool], Awaitable[None]],
    poll_interval: float = 5.0
) -> dict:
    """Execute metasploit_console with integrated progress streaming."""
    
    # Start the main tool execution as a background task
    execution_task = asyncio.create_task(
        self.execute(tool_name, tool_args, phase)
    )
    
    last_line_count = 0
    last_output = ""
    
    async with httpx.AsyncClient(timeout=2.0) as client:
        while not execution_task.done():
            await asyncio.sleep(poll_interval)
            
            if execution_task.done():
                break
            
            try:
                resp = await client.get(
                    os.environ.get(
                        'MCP_METASPLOIT_PROGRESS_URL',
                        'http://host.docker.internal:8013/progress'
                    )
                )
                if resp.status_code == 200:
                    progress = resp.json()
                    
                    if progress.get("active"):
                        current_output = progress.get("output", "")
                        line_count = progress.get("line_count", 0)
                        elapsed = progress.get("elapsed_seconds", 0)
                        
                        # Only send if new content
                        if line_count > last_line_count and current_output != last_output:
                            # Calculate the new portion
                            if last_output and current_output.startswith(last_output):
                                new_content = current_output[len(last_output):]
                            else:
                                new_content = current_output
                            
                            if new_content.strip():
                                progress_msg = f"[Progress: {line_count} lines, {elapsed}s]\n{new_content[-1000:]}"
                                await progress_callback(
                                    tool_name,
                                    progress_msg,
                                    False  # not final
                                )
                            
                            last_output = current_output
                            last_line_count = line_count
            
            except httpx.TimeoutException:
                pass  # Progress polling timeout is fine
            except Exception as e:
                logger.debug(f"Progress polling error (non-fatal): {e}")
    
    # Wait for execution to complete
    return await execution_task
```

---

## Summary

### LangChain & LangGraph
- **State Machine**: TypedDict-based state with LangGraph StateGraph
- **Checkpointing**: MemorySaver for state persistence
- **LLM Integration**: ChatOpenAI/ChatAnthropic with dynamic model selection
- **Tool Integration**: LangChain @tool decorator + MCP adapters
- **Streaming**: Real-time updates via WebSocket callbacks

### Neo4j Bolt Protocol
- **Connection**: GraphDatabase.driver() for Python, neo4j.driver() for Node.js
- **Text-to-Cypher**: LLM-generated queries with automatic tenant filtering
- **Retry Logic**: Up to 3 attempts with error context
- **Schema Management**: Constraints and indexes for performance
- **Multi-Tenancy**: Automatic injection of user_id/project_id filters

### Neo4j Browser
- **Access**: HTTP on port 7474, Bolt on port 7687
- **Frontend Integration**: Next.js API routes query graph via Bolt
- **Visualization**: React Force Graph components render nodes/relationships
- **Query Examples**: Cypher queries for attack surface traversal

### Metasploit
- **Architecture**: Persistent msfconsole process via subprocess.Popen
- **State Management**: Singleton pattern with thread-safe locks
- **Output Detection**: Timing-based (quiet period) rather than regex parsing
- **Progress Streaming**: HTTP endpoint (port 8013) for live updates
- **ANSI Cleaning**: Comprehensive removal of escape codes and control characters
- **Session Tracking**: Automatic detection of session open/close events

---

## Key Files Reference

| Component | File Path |
|-----------|-----------|
| LangGraph Orchestrator | `agentic/orchestrator.py` |
| State Definition | `agentic/state.py` |
| Tool Managers | `agentic/tools.py` |
| Neo4j Client | `graph_db/neo4j_client.py` |
| Neo4j Browser API | `webapp/src/app/api/graph/route.ts` |
| Neo4j Driver Setup | `webapp/src/app/api/graph/neo4j.ts` |
| Metasploit Server | `mcp/servers/metasploit_server.py` |
| MCP Server Runner | `mcp/servers/run_servers.py` |

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-08  
**PandaExploit Version**: 1.1.0
