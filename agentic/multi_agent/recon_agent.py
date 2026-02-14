"""
Recon Agent

Specialized agent for information gathering.
"""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class ReconAgent:
    """Specialized recon agent."""
    
    def __init__(self, tool_executor=None):
        """
        Initialize recon agent.
        
        Args:
            tool_executor: Tool executor instance
        """
        self.tool_executor = tool_executor
        self.role = "recon"
    
    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a recon task."""
        task_type = task.get("type", "unknown")
        
        if task_type == "port_scan":
            return await self._port_scan(task)
        elif task_type == "graph_query":
            return await self._graph_query(task)
        elif task_type == "web_search":
            return await self._web_search(task)
        else:
            return {"success": False, "error": f"Unknown task type: {task_type}"}
    
    async def _port_scan(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute port scan via execute_naabu."""
        if not self.tool_executor:
            return {"success": False, "error": "Tool executor not available"}
        target = task.get("target", "")
        args = task.get("args", f"-host {target}")
        result = await self.tool_executor.execute("execute_naabu", {"args": args}, "informational")
        return {"success": result.get("success", False), "result": result.get("output", result.get("error", ""))}

    async def _graph_query(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute graph query via query_graph."""
        if not self.tool_executor:
            return {"success": False, "error": "Tool executor not available"}
        query = task.get("query", "")
        result = await self.tool_executor.execute("query_graph", {"question": query}, "informational")
        return {"success": result.get("success", False), "result": result.get("output", result.get("error", ""))}

    async def _web_search(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute web search via web_search."""
        if not self.tool_executor:
            return {"success": False, "error": "Tool executor not available"}
        query = task.get("query", "")
        result = await self.tool_executor.execute("web_search", {"query": query}, "informational")
        return {"success": result.get("success", False), "result": result.get("output", result.get("error", ""))}
