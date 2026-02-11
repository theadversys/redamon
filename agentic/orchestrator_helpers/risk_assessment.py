"""
Risk Assessment Engine

Evaluates risk of actions to enable autonomous decision-making.
"""

import logging
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class RiskFactors(BaseModel):
    """Risk factors for an action."""
    target_type: str = Field(description="production, test, staging, etc.")
    exploit_type: str = Field(description="rce, info_disclosure, dos, etc.")
    potential_impact: str = Field(description="data_loss, service_disruption, none, etc.")
    reversibility: bool = Field(description="Can this action be undone?")
    severity: str = Field(description="critical, high, medium, low")
    requires_authentication: bool = Field(default=False, description="Does this require auth?")


class RiskAssessment(BaseModel):
    """Risk assessment result."""
    risk_score: int = Field(ge=0, le=100, description="Risk score 0-100")
    risk_level: str = Field(description="low, medium, high")
    requires_approval: bool = Field(description="Whether user approval is required")
    risk_factors: RiskFactors
    reasoning: str = Field(description="Explanation of risk assessment")
    safety_gates_passed: bool = Field(description="Whether safety gates passed")


def assess_risk(
    action_type: str,
    tool_name: str,
    tool_args: Dict[str, Any],
    target_info: Dict[str, Any],
    phase: str,
    autonomous_mode: bool = False,
    risk_threshold: int = 30
) -> RiskAssessment:
    """
    Assess risk of an action.
    
    Args:
        action_type: Type of action (use_tool, transition_phase, etc.)
        tool_name: Tool being used (if applicable)
        tool_args: Tool arguments
        target_info: Target information
        phase: Current phase
        autonomous_mode: Whether autonomous mode is enabled
        risk_threshold: Risk threshold for auto-approval (default 30)
        
    Returns:
        RiskAssessment instance
    """
    # Initialize risk factors
    risk_score = 0
    # Handle target_type: get value, but use "unknown" if None or missing
    # Note: target_info.target_type can be "ip"/"hostname"/"domain"/"url" (from TargetInfo)
    # but RiskFactors.target_type expects "production"/"test"/"staging" (environment type)
    # For now, we use "unknown" as default since we don't have environment info
    target_type_value = target_info.get("target_type")
    if target_type_value is None or not isinstance(target_type_value, str):
        target_type_value = "unknown"
    
    risk_factors = RiskFactors(
        target_type=target_type_value,
        exploit_type=_classify_exploit_type(tool_name, tool_args),
        potential_impact=_assess_potential_impact(tool_name, tool_args, phase),
        reversibility=_assess_reversibility(tool_name, tool_args),
        severity=_assess_severity(tool_name, tool_args),
        requires_authentication=_requires_authentication(tool_name, tool_args)
    )
    
    # Base risk by phase
    if phase == "informational":
        risk_score += 10
    elif phase == "exploitation":
        risk_score += 50
    elif phase == "post_exploitation":
        risk_score += 70
    
    # Risk by tool type
    if tool_name == "metasploit_console":
        risk_score += 40
        
        # Check for destructive commands
        command = tool_args.get("command", "").lower()
        if any(destructive in command for destructive in ["rm -rf", "format", "delete", "drop", "truncate"]):
            risk_score += 50  # Very high risk
    
    # Risk by exploit type
    if risk_factors.exploit_type == "rce":
        risk_score += 30
    elif risk_factors.exploit_type == "dos":
        risk_score += 40  # DoS is high risk
    
    # Risk by target type
    if risk_factors.target_type == "production":
        risk_score += 30  # Production targets are higher risk
    
    # Risk by potential impact
    if risk_factors.potential_impact == "data_loss":
        risk_score += 40
    elif risk_factors.potential_impact == "service_disruption":
        risk_score += 30
    
    # Reduce risk if reversible
    if risk_factors.reversibility:
        risk_score -= 10
    
    # Cap risk score
    risk_score = max(0, min(100, risk_score))
    
    # Determine risk level
    if risk_score < 30:
        risk_level = "low"
    elif risk_score < 70:
        risk_level = "medium"
    else:
        risk_level = "high"
    
    # Check safety gates
    safety_gates_passed = _check_safety_gates(tool_name, tool_args, risk_factors)
    
    # Determine if approval required
    requires_approval = True
    if autonomous_mode and safety_gates_passed:
        # In autonomous mode, auto-approve low/medium risk actions
        if risk_score < risk_threshold:
            requires_approval = False
        elif risk_score >= 70:  # High risk always requires approval
            requires_approval = True
        else:
            # Medium risk: require approval unless explicitly configured
            requires_approval = True
    else:
        # Not in autonomous mode: always require approval for exploitation+
        if phase in ["exploitation", "post_exploitation"]:
            requires_approval = True
    
    # Generate reasoning
    reasoning = _generate_reasoning(risk_score, risk_level, risk_factors, safety_gates_passed, requires_approval)
    
    return RiskAssessment(
        risk_score=risk_score,
        risk_level=risk_level,
        requires_approval=requires_approval,
        risk_factors=risk_factors,
        reasoning=reasoning,
        safety_gates_passed=safety_gates_passed
    )


def _classify_exploit_type(tool_name: str, tool_args: Dict[str, Any]) -> str:
    """Classify the type of exploit."""
    if tool_name != "metasploit_console":
        return "info_disclosure"
    
    command = tool_args.get("command", "").lower()
    
    if "exploit" in command:
        if "rce" in command or "remote" in command:
            return "rce"
        elif "dos" in command or "denial" in command:
            return "dos"
        elif "sqli" in command or "sql" in command:
            return "sqli"
        else:
            return "exploit"
    
    return "info_disclosure"


def _assess_potential_impact(tool_name: str, tool_args: Dict[str, Any], phase: str) -> str:
    """Assess potential impact of action."""
    if phase == "informational":
        return "none"
    
    if tool_name == "metasploit_console":
        command = tool_args.get("command", "").lower()
        
        # Check for data loss risks
        if any(cmd in command for cmd in ["rm", "delete", "drop", "truncate", "format"]):
            return "data_loss"
        
        # Check for service disruption
        if any(cmd in command for cmd in ["shutdown", "reboot", "kill", "stop"]):
            return "service_disruption"
        
        # Exploitation phase has medium impact
        if phase == "exploitation":
            return "service_disruption"
    
    return "none"


def _assess_reversibility(tool_name: str, tool_args: Dict[str, Any]) -> bool:
    """Assess if action is reversible."""
    if tool_name == "metasploit_console":
        command = tool_args.get("command", "").lower()
        
        # Destructive commands are not reversible
        if any(cmd in command for cmd in ["rm -rf", "format", "delete", "drop", "truncate"]):
            return False
        
        # Most other commands are reversible (read-only or temporary)
        return True
    
    # Information gathering is reversible
    return True


def _assess_severity(tool_name: str, tool_args: Dict[str, Any]) -> str:
    """Assess severity of action."""
    if tool_name == "metasploit_console":
        command = tool_args.get("command", "").lower()
        
        if any(cmd in command for cmd in ["rm -rf", "format", "delete"]):
            return "critical"
        elif "exploit" in command:
            return "high"
        else:
            return "medium"
    
    return "low"


def _requires_authentication(tool_name: str, tool_args: Dict[str, Any]) -> bool:
    """Check if action requires authentication."""
    if tool_name == "metasploit_console":
        command = tool_args.get("command", "").lower()
        # Most Metasploit exploits don't require authentication
        return False
    
    return False


def _check_safety_gates(tool_name: str, tool_args: Dict[str, Any], risk_factors: RiskFactors) -> bool:
    """
    Check if action passes safety gates.
    
    Safety gates block:
    - Destructive commands (rm -rf, format, etc.)
    - Production targets (if marked as such)
    - High-severity exploits without explicit approval
    """
    # Gate 1: Block destructive commands
    if tool_name == "metasploit_console":
        command = tool_args.get("command", "").lower()
        destructive_patterns = ["rm -rf", "format", "delete database", "drop table", "truncate"]
        if any(pattern in command for pattern in destructive_patterns):
            logger.warning(f"Safety gate: Blocked destructive command: {command[:100]}")
            return False
    
    # Gate 2: Block production targets (if marked)
    if risk_factors.target_type == "production" and risk_factors.severity in ["critical", "high"]:
        logger.warning(f"Safety gate: Blocked high-risk action on production target")
        return False
    
    # Gate 3: Block critical severity exploits
    if risk_factors.severity == "critical":
        logger.warning(f"Safety gate: Blocked critical severity action")
        return False
    
    return True


def _generate_reasoning(
    risk_score: int,
    risk_level: str,
    risk_factors: RiskFactors,
    safety_gates_passed: bool,
    requires_approval: bool
) -> str:
    """Generate human-readable reasoning for risk assessment."""
    parts = []
    
    parts.append(f"Risk Score: {risk_score}/100 ({risk_level.upper()})")
    parts.append(f"Target Type: {risk_factors.target_type}")
    parts.append(f"Exploit Type: {risk_factors.exploit_type}")
    parts.append(f"Potential Impact: {risk_factors.potential_impact}")
    parts.append(f"Severity: {risk_factors.severity}")
    
    if not safety_gates_passed:
        parts.append("⚠️ SAFETY GATES FAILED - Action blocked")
    else:
        parts.append("✅ Safety gates passed")
    
    if requires_approval:
        parts.append("🔒 User approval required")
    else:
        parts.append("✅ Auto-approved (autonomous mode)")
    
    return " | ".join(parts)
