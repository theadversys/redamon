"""
Strategic Planning Engine

Generates multi-step attack plans before execution, improving efficiency and success rate.
"""

import json
import logging
from typing import Optional, Dict, List, Any, Tuple
from pydantic import BaseModel, Field

# Note: state is imported from parent directory when running from agentic/
from state import LLMDecision
from .json_utils import extract_json, json_dumps_safe

logger = logging.getLogger(__name__)


class PlanStep(BaseModel):
    """Single step in an attack plan."""
    step_id: str = Field(description="Unique identifier for this step")
    step_number: int = Field(description="Sequential step number")
    description: str = Field(description="What this step does")
    tool_name: Optional[str] = Field(default=None, description="Tool to use (if applicable)")
    tool_args: Optional[dict] = Field(default=None, description="Tool arguments")
    prerequisites: List[str] = Field(default_factory=list, description="What must be true before this step")
    expected_output: Optional[str] = Field(default=None, description="What we expect to see")
    success_criteria: List[str] = Field(default_factory=list, description="How we know this step succeeded")
    risk_score: int = Field(ge=0, le=100, description="Risk score 0-100")
    phase: str = Field(description="Phase this step belongs to (informational/exploitation/post_exploitation)")
    status: str = Field(default="pending", description="pending/in_progress/completed/failed")


class AttackPlan(BaseModel):
    """Multi-step attack plan with alternatives and risk assessment."""
    plan_id: str = Field(description="Unique plan identifier")
    objective: str = Field(description="What we're trying to achieve")
    attack_path_type: str = Field(description="cve_exploit or brute_force_credential_guess")
    steps: List[PlanStep] = Field(default_factory=list, description="Sequential attack steps")
    alternative_paths: List[List[str]] = Field(default_factory=list, description="Alternative step sequences if primary fails")
    total_risk_score: int = Field(ge=0, le=100, description="Overall plan risk")
    estimated_time: Optional[int] = Field(default=None, description="Estimated execution time in seconds")
    prerequisites: List[str] = Field(default_factory=list, description="Global prerequisites for entire plan")
    created_at: str = Field(description="Plan creation timestamp")


def parse_plan_response(response_text: str) -> Optional[Dict[str, Any]]:
    """
    Parse LLM response containing attack plan JSON.
    
    Args:
        response_text: Raw LLM response text
        
    Returns:
        Parsed plan dictionary or None if parsing fails
    """
    try:
        # Extract JSON from response
        json_str = extract_json(response_text)
        if not json_str:
            logger.warning("No JSON found in plan response")
            return None
            
        plan_data = json.loads(json_str)
        
        # Validate structure
        if "objective" not in plan_data or "steps" not in plan_data:
            logger.warning("Plan missing required fields: objective or steps")
            return None
            
        # Validate steps
        if not isinstance(plan_data["steps"], list):
            logger.warning("Plan steps must be a list")
            return None
            
        # Ensure each step has required fields
        for i, step in enumerate(plan_data["steps"]):
            if "step_number" not in step:
                step["step_number"] = i + 1
            if "step_id" not in step:
                step["step_id"] = f"step-{i+1}"
            if "status" not in step:
                step["status"] = "pending"
            if "risk_score" not in step:
                step["risk_score"] = 50  # Default medium risk
            if "phase" not in step:
                step["phase"] = "informational"  # Default phase
                
        # Calculate total risk (average of step risks)
        if plan_data["steps"]:
            total_risk = sum(step.get("risk_score", 50) for step in plan_data["steps"]) // len(plan_data["steps"])
            plan_data["total_risk_score"] = total_risk
        else:
            plan_data["total_risk_score"] = 0
            
        return plan_data
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse plan JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error parsing plan: {e}")
        return None


def validate_plan(plan_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate attack plan structure and logic.
    
    Args:
        plan_data: Plan dictionary to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not plan_data:
        return False, "Plan data is None or empty"
        
    if "objective" not in plan_data:
        return False, "Plan missing objective"
        
    if "steps" not in plan_data or not isinstance(plan_data["steps"], list):
        return False, "Plan missing steps list"
        
    if len(plan_data["steps"]) == 0:
        return False, "Plan has no steps"
        
    # Validate each step
    for i, step in enumerate(plan_data["steps"]):
        if not isinstance(step, dict):
            return False, f"Step {i+1} is not a dictionary"
            
        if "description" not in step:
            return False, f"Step {i+1} missing description"
            
        if "step_number" not in step:
            return False, f"Step {i+1} missing step_number"
            
        if step.get("step_number") != i + 1:
            return False, f"Step {i+1} has incorrect step_number"
            
        # Validate risk score
        risk = step.get("risk_score", 50)
        if not isinstance(risk, int) or risk < 0 or risk > 100:
            return False, f"Step {i+1} has invalid risk_score (must be 0-100)"
            
    return True, None


def mark_step_complete(plan_data: Dict[str, Any], step_id: str) -> Dict[str, Any]:
    """
    Mark a plan step as completed.
    
    Args:
        plan_data: Plan dictionary
        step_id: ID of step to mark complete
        
    Returns:
        Updated plan dictionary
    """
    if not plan_data or "steps" not in plan_data:
        return plan_data
        
    for step in plan_data["steps"]:
        if step.get("step_id") == step_id:
            step["status"] = "completed"
            break
            
    return plan_data


def mark_step_failed(plan_data: Dict[str, Any], step_id: str, reason: str = None) -> Dict[str, Any]:
    """
    Mark a plan step as failed.
    
    Args:
        plan_data: Plan dictionary
        step_id: ID of step that failed
        reason: Optional reason for failure
        
    Returns:
        Updated plan dictionary
    """
    if not plan_data or "steps" not in plan_data:
        return plan_data
        
    for step in plan_data["steps"]:
        if step.get("step_id") == step_id:
            step["status"] = "failed"
            if reason:
                step["failure_reason"] = reason
            break
            
    return plan_data


def get_next_pending_step(plan_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Get the next pending step in the plan.
    
    Args:
        plan_data: Plan dictionary
        
    Returns:
        Next pending step or None if all complete
    """
    if not plan_data or "steps" not in plan_data:
        return None
        
    for step in plan_data["steps"]:
        if step.get("status") == "pending":
            return step
            
    return None


def get_completed_steps(plan_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get all completed steps in the plan.
    
    Args:
        plan_data: Plan dictionary
        
    Returns:
        List of completed steps
    """
    if not plan_data or "steps" not in plan_data:
        return []
        
    return [step for step in plan_data["steps"] if step.get("status") == "completed"]


def should_adapt_plan(plan_data: Dict[str, Any]) -> bool:
    """
    Determine if plan should be adapted based on failures.
    
    Args:
        plan_data: Plan dictionary
        
    Returns:
        True if plan should be adapted
    """
    if not plan_data or "steps" not in plan_data:
        return False
        
    # Check if any step failed
    failed_steps = [step for step in plan_data["steps"] if step.get("status") == "failed"]
    
    # Adapt if we have failures and alternative paths
    if failed_steps and plan_data.get("alternative_paths"):
        return True
        
    return False


def format_plan_for_prompt(plan_data: Dict[str, Any]) -> str:
    """
    Format attack plan for inclusion in LLM prompt.
    
    Args:
        plan_data: Plan dictionary
        
    Returns:
        Formatted plan string
    """
    if not plan_data:
        return "No attack plan available."
        
    lines = []
    lines.append(f"## Attack Plan: {plan_data.get('objective', 'Unknown')}")
    lines.append(f"**Attack Path**: {plan_data.get('attack_path_type', 'unknown')}")
    lines.append(f"**Total Risk Score**: {plan_data.get('total_risk_score', 0)}/100")
    
    if plan_data.get("prerequisites"):
        lines.append(f"\n**Prerequisites**:")
        for prereq in plan_data["prerequisites"]:
            lines.append(f"  - {prereq}")
    
    lines.append(f"\n**Plan Steps**:")
    for step in plan_data.get("steps", []):
        status_icon = {
            "pending": "[ ]",
            "in_progress": "[~]",
            "completed": "[x]",
            "failed": "[!]"
        }.get(step.get("status", "pending"), "[ ]")
        
        step_num = step.get("step_number", "?")
        desc = step.get("description", "No description")
        risk = step.get("risk_score", 50)
        phase = step.get("phase", "unknown")
        
        lines.append(f"\n{status_icon} **Step {step_num}** [{phase}] (Risk: {risk}/100)")
        lines.append(f"   {desc}")
        
        if step.get("prerequisites"):
            lines.append(f"   Prerequisites: {', '.join(step['prerequisites'])}")
            
        if step.get("tool_name"):
            lines.append(f"   Tool: {step['tool_name']}")
            
        if step.get("success_criteria"):
            lines.append(f"   Success: {', '.join(step['success_criteria'])}")
            
        if step.get("status") == "failed" and step.get("failure_reason"):
            lines.append(f"   ❌ Failed: {step['failure_reason']}")
    
    if plan_data.get("alternative_paths"):
        lines.append(f"\n**Alternative Paths**:")
        for i, alt_path in enumerate(plan_data["alternative_paths"], 1):
            lines.append(f"  Path {i}: {' → '.join(alt_path)}")
    
    return "\n".join(lines)
