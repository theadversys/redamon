"""
Agent Coordinator

Orchestrates multiple specialized agents.
"""

import logging
from typing import List, Dict, Any, Optional
from .shared_state import SharedStateManager

logger = logging.getLogger(__name__)


class AgentCoordinator:
    """Coordinates multiple specialized agents."""
    
    def __init__(self, shared_state: SharedStateManager = None):
        """
        Initialize coordinator.
        
        Args:
            shared_state: SharedStateManager instance
        """
        self.shared_state = shared_state or SharedStateManager()
        self.agents = {}  # agent_id -> agent instance
    
    def register_agent(self, agent_id: str, agent):
        """Register an agent."""
        self.agents[agent_id] = agent
        logger.info(f"Registered agent: {agent_id}")
    
    async def assign_task(self, agent_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Assign a task to an agent.
        
        Args:
            agent_id: Agent identifier
            task: Task dictionary
            
        Returns:
            Task assignment result
        """
        if agent_id not in self.agents:
            return {"success": False, "error": f"Agent {agent_id} not found"}
        
        agent = self.agents[agent_id]
        
        # Check for conflicts (multiple agents wanting same tool)
        conflict = await self._check_conflicts(agent_id, task)
        if conflict:
            return {"success": False, "error": f"Conflict detected: {conflict}"}
        
        # Assign task
        try:
            result = await agent.execute_task(task)
            return {"success": True, "result": result}
        except Exception as e:
            logger.error(f"Agent {agent_id} failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _check_conflicts(self, agent_id: str, task: Dict[str, Any]) -> Optional[str]:
        """Check for conflicts with other agents."""
        # Simplified conflict detection
        # Real implementation would check shared state for active tasks
        return None
    
    async def coordinate_parallel_tasks(self, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Coordinate parallel task execution.
        
        Args:
            tasks: List of tasks with agent_id specified
            
        Returns:
            List of results
        """
        results = []
        
        for task in tasks:
            agent_id = task.get("agent_id")
            if agent_id:
                result = await self.assign_task(agent_id, task)
                results.append(result)
        
        return results
