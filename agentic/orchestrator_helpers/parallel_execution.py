"""
Parallel Execution Engine

Enables parallel execution of independent tasks with dependency tracking.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import defaultdict, deque

logger = logging.getLogger(__name__)


class TaskNode:
    """Represents a single task in the dependency graph."""
    
    def __init__(self, task_id: str, tool_name: str, tool_args: dict, phase: str):
        self.task_id = task_id
        self.tool_name = tool_name
        self.tool_args = tool_args
        self.phase = phase
        self.dependencies: Set[str] = set()  # Task IDs this task depends on
        self.dependents: Set[str] = set()  # Task IDs that depend on this task
        self.status: str = "pending"  # pending, running, completed, failed
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None


class TaskDAG:
    """Directed Acyclic Graph for task dependencies."""
    
    def __init__(self):
        self.tasks: Dict[str, TaskNode] = {}
        self.ready_tasks: Set[str] = set()  # Tasks with no unmet dependencies
    
    def add_task(self, task_id: str, tool_name: str, tool_args: dict, phase: str, dependencies: List[str] = None):
        """Add a task to the DAG."""
        if task_id in self.tasks:
            raise ValueError(f"Task {task_id} already exists")
        
        task = TaskNode(task_id, tool_name, tool_args, phase)
        self.tasks[task_id] = task
        
        # Add dependencies
        if dependencies:
            for dep_id in dependencies:
                if dep_id not in self.tasks:
                    raise ValueError(f"Dependency {dep_id} does not exist")
                task.dependencies.add(dep_id)
                self.tasks[dep_id].dependents.add(task_id)
        
        # Check if task is ready (no dependencies)
        if not task.dependencies:
            self.ready_tasks.add(task_id)
    
    def mark_completed(self, task_id: str, result: Dict[str, Any] = None):
        """Mark a task as completed."""
        if task_id not in self.tasks:
            raise ValueError(f"Task {task_id} does not exist")
        
        task = self.tasks[task_id]
        task.status = "completed"
        task.result = result
        
        # Remove from ready tasks
        self.ready_tasks.discard(task_id)
        
        # Check dependents - are they now ready?
        for dependent_id in task.dependents:
            dependent = self.tasks[dependent_id]
            dependent.dependencies.discard(task_id)
            
            # If all dependencies are met, add to ready tasks
            if not dependent.dependencies and dependent.status == "pending":
                self.ready_tasks.add(dependent_id)
    
    def mark_failed(self, task_id: str, error: str):
        """Mark a task as failed."""
        if task_id not in self.tasks:
            raise ValueError(f"Task {task_id} does not exist")
        
        task = self.tasks[task_id]
        task.status = "failed"
        task.error = error
        
        # Remove from ready tasks
        self.ready_tasks.discard(task_id)
        
        # Mark dependents as failed (cascade failure)
        for dependent_id in task.dependents:
            dependent = self.tasks[dependent_id]
            if dependent.status == "pending":
                dependent.status = "failed"
                dependent.error = f"Dependency {task_id} failed: {error}"
    
    def get_ready_tasks(self) -> List[TaskNode]:
        """Get all tasks that are ready to execute (no unmet dependencies)."""
        return [self.tasks[tid] for tid in self.ready_tasks if self.tasks[tid].status == "pending"]
    
    def is_complete(self) -> bool:
        """Check if all tasks are completed or failed."""
        return all(
            task.status in ("completed", "failed")
            for task in self.tasks.values()
        )
    
    def get_failed_tasks(self) -> List[TaskNode]:
        """Get all failed tasks."""
        return [task for task in self.tasks.values() if task.status == "failed"]
    
    def get_completed_tasks(self) -> List[TaskNode]:
        """Get all completed tasks."""
        return [task for task in self.tasks.values() if task.status == "completed"]


class ParallelExecutor:
    """Executes tasks in parallel with dependency tracking."""
    
    def __init__(self, tool_executor, max_concurrency: int = 5):
        """
        Initialize parallel executor.
        
        Args:
            tool_executor: Tool executor instance
            max_concurrency: Maximum number of concurrent tasks
        """
        self.tool_executor = tool_executor
        self.max_concurrency = max_concurrency
    
    async def execute_dag(self, dag: TaskDAG) -> Dict[str, Any]:
        """
        Execute all tasks in the DAG in parallel, respecting dependencies.
        
        Args:
            dag: Task dependency graph
            
        Returns:
            Dictionary mapping task_id to result
        """
        results = {}
        semaphore = asyncio.Semaphore(self.max_concurrency)
        
        async def execute_task(task: TaskNode):
            """Execute a single task."""
            async with semaphore:
                task.status = "running"
                try:
                    logger.info(f"Executing parallel task {task.task_id}: {task.tool_name}")
                    result = await self.tool_executor.execute(
                        task.tool_name,
                        task.tool_args,
                        task.phase
                    )
                    
                    if result and result.get("success", False):
                        dag.mark_completed(task.task_id, result)
                        results[task.task_id] = result
                    else:
                        error = result.get("error") if result else "Task execution failed"
                        dag.mark_failed(task.task_id, error)
                        results[task.task_id] = {"success": False, "error": error}
                        
                except Exception as e:
                    error_msg = str(e)
                    logger.error(f"Task {task.task_id} failed with exception: {error_msg}")
                    dag.mark_failed(task.task_id, error_msg)
                    results[task.task_id] = {"success": False, "error": error_msg}
        
        # Execute tasks until DAG is complete
        while not dag.is_complete():
            ready_tasks = dag.get_ready_tasks()
            
            if not ready_tasks:
                # Check if we're stuck (all remaining tasks have failed dependencies)
                remaining = [t for t in dag.tasks.values() if t.status == "pending"]
                if remaining:
                    # Mark remaining as failed (unmet dependencies)
                    for task in remaining:
                        dag.mark_failed(task.task_id, "Dependencies failed or circular dependency detected")
                break
            
            # Execute ready tasks in parallel
            await asyncio.gather(*[execute_task(task) for task in ready_tasks])
        
        return results
    
    async def execute_independent_tasks(
        self,
        tasks: List[Dict[str, Any]],
        phase: str
    ) -> List[Dict[str, Any]]:
        """
        Execute multiple independent tasks in parallel.
        
        Args:
            tasks: List of task dictionaries with keys: tool_name, tool_args
            phase: Current phase
            
        Returns:
            List of results in same order as tasks
        """
        semaphore = asyncio.Semaphore(self.max_concurrency)
        
        async def execute_single(task_dict: Dict[str, Any]) -> Dict[str, Any]:
            async with semaphore:
                tool_name = task_dict["tool_name"]
                tool_args = task_dict.get("tool_args", {})
                
                try:
                    logger.info(f"Executing independent task: {tool_name}")
                    result = await self.tool_executor.execute(tool_name, tool_args, phase)
                    return result or {"success": False, "error": "No result returned"}
                except Exception as e:
                    logger.error(f"Task {tool_name} failed: {e}")
                    return {"success": False, "error": str(e)}
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*[execute_single(task) for task in tasks])
        return results


def build_dag_from_plan(plan: Dict[str, Any]) -> TaskDAG:
    """
    Build a task DAG from an attack plan.
    
    Args:
        plan: Attack plan dictionary
        
    Returns:
        TaskDAG instance
    """
    dag = TaskDAG()
    
    if not plan or "steps" not in plan:
        return dag
    
    # Add all plan steps as tasks
    for step in plan.get("steps", []):
        step_id = step.get("step_id", f"step-{step.get('step_number', 0)}")
        tool_name = step.get("tool_name")
        tool_args = step.get("tool_args", {})
        phase = step.get("phase", "informational")
        
        # Get dependencies (prerequisites)
        dependencies = []
        for prereq in step.get("prerequisites", []):
            # Try to match prerequisite to a previous step
            # This is simplified - in practice, you'd parse prerequisites more intelligently
            if "step" in prereq.lower():
                # Extract step number or ID from prerequisite text
                # This is a heuristic - real implementation would be more robust
                pass
        
        # For now, dependencies are based on step order
        prev_step_ids = [
            s.get("step_id", f"step-{s.get('step_number', 0)}")
            for s in plan.get("steps", [])
            if s.get("step_number", 0) < step.get("step_number", 0)
        ]
        
        # Only depend on immediate previous step (simplified)
        if prev_step_ids:
            dependencies = [prev_step_ids[-1]]
        
        dag.add_task(step_id, tool_name, tool_args, phase, dependencies)
    
    return dag


def identify_parallelizable_tasks(tasks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """
    Identify groups of tasks that can be executed in parallel.
    
    Args:
        tasks: List of task dictionaries
        
    Returns:
        List of task groups, where each group can be executed in parallel
    """
    # Simple implementation: group by tool type and phase
    # More sophisticated: analyze dependencies, resource requirements
    
    groups = []
    current_group = []
    
    for task in tasks:
        # If task has no dependencies on current group, add it
        # For now, we'll just group independent tasks
        current_group.append(task)
        
        # Limit group size
        if len(current_group) >= 5:
            groups.append(current_group)
            current_group = []
    
    if current_group:
        groups.append(current_group)
    
    return groups
