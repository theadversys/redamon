"""
Adaptive Context Management

Intelligent context compression and retrieval to maintain context beyond the 100-step limit.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


# Critical event markers that should always be kept in context
CRITICAL_EVENT_MARKERS = [
    "session opened",
    "session established",
    "exploit succeeded",
    "exploit successful",
    "meterpreter session",
    "shell session",
    "credentials found",
    "password found",
    "vulnerability confirmed",
    "cve exploited",
    "phase transition",
    "task completed",
]


def score_step_importance(step: Dict[str, Any]) -> float:
    """
    Score the importance of an execution step (0.0 to 1.0).
    
    Higher scores indicate steps that should be kept in full detail.
    
    Args:
        step: Execution step dictionary
        
    Returns:
        Importance score (0.0 = low, 1.0 = critical)
    """
    score = 0.0
    
    # Check for critical event markers in thought/output
    thought = (step.get("thought", "") or "").lower()
    tool_output = (step.get("tool_output", "") or "").lower()
    output_analysis = (step.get("output_analysis", "") or "").lower()
    
    combined_text = f"{thought} {tool_output} {output_analysis}"
    
    # Critical events get high score
    for marker in CRITICAL_EVENT_MARKERS:
        if marker in combined_text:
            score += 0.3
    
    # Exploitation phase steps are more important
    if step.get("phase") == "exploitation":
        score += 0.2
    elif step.get("phase") == "post_exploitation":
        score += 0.3
    
    # Successful tool executions are more important
    if step.get("success", False):
        score += 0.1
    
    # Steps with actionable findings are important
    if step.get("actionable_findings"):
        score += 0.2
    
    # Steps that opened sessions are critical
    if step.get("tool_name") == "metasploit_console":
        if "session" in combined_text and ("opened" in combined_text or "established" in combined_text):
            score = 1.0  # Maximum importance
    
    # Cap at 1.0
    return min(score, 1.0)


def compress_execution_steps(
    steps: List[Dict[str, Any]],
    keep_last_n: int = 20,
    min_importance_threshold: float = 0.5
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Compress old execution steps, keeping recent ones and important ones.
    
    Args:
        steps: Full list of execution steps
        keep_last_n: Number of recent steps to keep in full detail
        min_importance_threshold: Minimum importance score to keep in full detail
        
    Returns:
        Tuple of (compressed_steps, summaries)
        - compressed_steps: Steps with old ones summarized
        - summaries: List of summary strings for compressed steps
    """
    if len(steps) <= keep_last_n:
        return steps, []
    
    summaries = []
    compressed = []
    
    # Keep last N steps in full detail
    recent_steps = steps[-keep_last_n:]
    
    # Process older steps
    older_steps = steps[:-keep_last_n]
    
    for step in older_steps:
        importance = score_step_importance(step)
        
        if importance >= min_importance_threshold:
            # Keep important steps in full detail
            compressed.append(step)
        else:
            # Create summary for less important steps
            summary = _create_step_summary(step)
            summaries.append(summary)
    
    # Combine: compressed older steps + recent steps
    result = compressed + recent_steps
    
    return result, summaries


def _create_step_summary(step: Dict[str, Any]) -> str:
    """
    Create a concise summary of an execution step.
    
    Args:
        step: Execution step dictionary
        
    Returns:
        Summary string
    """
    iteration = step.get("iteration", "?")
    phase = step.get("phase", "unknown")
    tool = step.get("tool_name", "none")
    success = "✓" if step.get("success", False) else "✗"
    
    # Extract key information
    thought = step.get("thought", "")[:200] if step.get("thought") else ""
    tool_output = step.get("tool_output", "")
    
    # Create summary
    summary_parts = [f"Step {iteration} [{phase}] {success}"]
    
    if tool and tool != "none":
        summary_parts.append(f"Tool: {tool}")
    
    if thought:
        summary_parts.append(f"Thought: {thought[:200]}...")
    
    # Include key findings if available
    if step.get("actionable_findings"):
        findings = step["actionable_findings"][:2]  # First 2 findings
        summary_parts.append(f"Findings: {', '.join(findings)}")
    
    # Include brief output if short
    if tool_output and len(tool_output) < 300:
        summary_parts.append(f"Output: {tool_output[:200]}...")
    
    return " | ".join(summary_parts)


def find_relevant_steps(
    steps: List[Dict[str, Any]],
    query: str,
    max_results: int = 5
) -> List[Dict[str, Any]]:
    """
    Find execution steps relevant to a query using simple keyword matching.
    
    For a full implementation, this would use vector embeddings and semantic search.
    This is a simplified version using keyword matching.
    
    Args:
        steps: List of execution steps
        query: Search query (e.g., "Apache 2.4.49")
        max_results: Maximum number of relevant steps to return
        
    Returns:
        List of relevant steps, sorted by relevance
    """
    query_lower = query.lower()
    query_terms = query_lower.split()
    
    scored_steps = []
    
    for step in steps:
        score = 0.0
        
        # Search in thought, tool_output, output_analysis
        thought = (step.get("thought", "") or "").lower()
        tool_output = (step.get("tool_output", "") or "").lower()
        output_analysis = (step.get("output_analysis", "") or "").lower()
        tool_name = (step.get("tool_name", "") or "").lower()
        
        combined_text = f"{thought} {tool_output} {output_analysis} {tool_name}"
        
        # Score based on term matches
        for term in query_terms:
            if term in combined_text:
                score += 1.0
        
        # Boost score for exact phrase match
        if query_lower in combined_text:
            score += 5.0
        
        if score > 0:
            scored_steps.append((score, step))
    
    # Sort by score (descending) and return top results
    scored_steps.sort(key=lambda x: x[0], reverse=True)
    
    return [step for _, step in scored_steps[:max_results]]


def mark_important_events(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Mark important events in execution steps.
    
    Args:
        steps: List of execution steps
        
    Returns:
        List of important event dictionaries
    """
    important_events = []
    
    for step in steps:
        importance = score_step_importance(step)
        
        if importance >= 0.7:  # High importance threshold
            event = {
                "step_id": step.get("step_id"),
                "iteration": step.get("iteration"),
                "phase": step.get("phase"),
                "timestamp": step.get("timestamp") or datetime.now().isoformat(),
                "importance_score": importance,
                "event_type": _classify_event_type(step),
                "summary": _create_step_summary(step),
            }
            important_events.append(event)
    
    return important_events


def _classify_event_type(step: Dict[str, Any]) -> str:
    """
    Classify the type of event from a step.
    
    Args:
        step: Execution step dictionary
        
    Returns:
        Event type string
    """
    combined_text = (
        f"{step.get('thought', '')} {step.get('tool_output', '')} {step.get('output_analysis', '')}"
    ).lower()
    
    if "session opened" in combined_text or "session established" in combined_text:
        return "session_opened"
    elif "exploit succeeded" in combined_text or "exploit successful" in combined_text:
        return "exploit_success"
    elif "credentials found" in combined_text or "password found" in combined_text:
        return "credentials_found"
    elif "vulnerability confirmed" in combined_text:
        return "vulnerability_confirmed"
    elif step.get("phase") == "post_exploitation":
        return "post_exploitation"
    else:
        return "important_step"


def format_compressed_trace(
    steps: List[Dict[str, Any]],
    summaries: List[str],
    important_events: List[Dict[str, Any]]
) -> str:
    """
    Format compressed execution trace for LLM prompt.
    
    Args:
        steps: Compressed execution steps (recent + important)
        summaries: Summaries of compressed steps
        important_events: Important events that should be highlighted
        
    Returns:
        Formatted trace string
    """
    lines = []
    
    # Show important events first
    if important_events:
        lines.append("## IMPORTANT EVENTS (Always in Context)")
        lines.append("")
        for event in important_events[-10:]:  # Last 10 important events
            lines.append(f"**{event['event_type']}** (Step {event['iteration']}, {event['phase']}): {event['summary']}")
        lines.append("")
    
    # Show summaries if any
    if summaries:
        lines.append(f"## COMPRESSED STEPS ({len(summaries)} steps summarized)")
        lines.append("")
        for summary in summaries[-20:]:  # Last 20 summaries
            lines.append(f"- {summary}")
        lines.append("")
    
    # Show recent steps in detail
    lines.append(f"## RECENT STEPS ({len(steps)} steps)")
    lines.append("")
    
    for step in steps:
        iteration = step.get("iteration", "?")
        phase = step.get("phase", "unknown")
        thought = step.get("thought", "No thought")[:500]
        tool = step.get("tool_name", "none")
        success = "OK" if step.get("success", False) else "FAILED"
        
        lines.append(f"--- Step {iteration} [{phase}] - {success} ---")
        lines.append(f"Thought: {thought}")
        
        if tool and tool != "none":
            lines.append(f"Tool: {tool}")
            tool_output = step.get("tool_output", "")
            if tool_output:
                lines.append(f"Output: {tool_output[:1000]}..." if len(tool_output) > 1000 else f"Output: {tool_output}")
        
        if step.get("output_analysis"):
            analysis = step["output_analysis"][:500]
            lines.append(f"Analysis: {analysis}")
        
        lines.append("")
    
    return "\n".join(lines)
