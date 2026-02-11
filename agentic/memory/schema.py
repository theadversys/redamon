"""
Memory Schema

Pydantic models for memory entries.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class MemoryEntry(BaseModel):
    """Base memory entry."""
    memory_id: str = Field(description="Unique memory identifier")
    memory_type: str = Field(description="Type: exploit_success, exploit_failure, pattern, etc.")
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    user_id: str = Field(description="User who created this memory")
    project_id: str = Field(description="Project this memory belongs to")
    
    # Embedding text (what gets embedded for semantic search)
    embedding_text: str = Field(description="Text to embed for semantic search")
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExploitMemory(MemoryEntry):
    """Memory of a successful exploit."""
    memory_type: str = Field(default="exploit_success")
    
    # Exploit details
    cve_id: Optional[str] = Field(default=None, description="CVE identifier")
    target_service: Optional[str] = Field(default=None, description="Target service/version")
    target_ip: Optional[str] = Field(default=None, description="Target IP address")
    target_port: Optional[int] = Field(default=None, description="Target port")
    
    # Exploit execution
    metasploit_module: Optional[str] = Field(default=None, description="Metasploit module used")
    payload: Optional[str] = Field(default=None, description="Payload used")
    exploit_args: Dict[str, Any] = Field(default_factory=dict, description="Exploit arguments")
    
    # Success details
    session_opened: bool = Field(default=False, description="Whether a session was opened")
    session_type: Optional[str] = Field(default=None, description="Session type (meterpreter, shell, etc.)")
    
    # Context
    prerequisites: List[str] = Field(default_factory=list, description="What was needed before exploit")
    execution_steps: List[str] = Field(default_factory=list, description="Steps taken to exploit")
    
    def to_embedding_text(self) -> str:
        """Generate text for embedding."""
        parts = []
        if self.cve_id:
            parts.append(f"CVE: {self.cve_id}")
        if self.target_service:
            parts.append(f"Target: {self.target_service}")
        if self.metasploit_module:
            parts.append(f"Module: {self.metasploit_module}")
        if self.prerequisites:
            parts.append(f"Prerequisites: {', '.join(self.prerequisites)}")
        if self.execution_steps:
            parts.append(f"Steps: {'; '.join(self.execution_steps)}")
        return " | ".join(parts)


class FailureMemory(MemoryEntry):
    """Memory of a failed exploit attempt."""
    memory_type: str = Field(default="exploit_failure")
    
    # Failure details
    cve_id: Optional[str] = Field(default=None)
    target_service: Optional[str] = Field(default=None)
    attempt_description: str = Field(description="What was attempted")
    failure_reason: str = Field(description="Why it failed")
    error_message: Optional[str] = Field(default=None)
    
    # What was tried
    tools_used: List[str] = Field(default_factory=list)
    exploit_args: Dict[str, Any] = Field(default_factory=dict)
    
    def to_embedding_text(self) -> str:
        """Generate text for embedding."""
        parts = []
        if self.cve_id:
            parts.append(f"CVE: {self.cve_id}")
        if self.target_service:
            parts.append(f"Target: {self.target_service}")
        parts.append(f"Attempted: {self.attempt_description}")
        parts.append(f"Failed: {self.failure_reason}")
        return " | ".join(parts)
