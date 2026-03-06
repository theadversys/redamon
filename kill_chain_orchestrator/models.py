"""
Pydantic models for Kill Chain Orchestrator API
"""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class KillChainStatus(str, Enum):
    """Status of a kill chain run"""
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    WAITING_FOR_OPERATOR = "waiting_for_operator"
    COMPLETED = "completed"
    ERROR = "error"
    STOPPING = "stopping"


class KillChainStage(int, Enum):
    """Cyber kill chain stages 1-7"""
    RECONNAISSANCE = 1
    WEAPONIZATION = 2
    DELIVERY = 3
    EXPLOITATION = 4
    INSTALLATION = 5
    C2 = 6
    ACTIONS_ON_OBJECTIVES = 7


STAGE_NAMES = {
    1: "Reconnaissance",
    2: "Weaponization",
    3: "Delivery",
    4: "Exploitation",
    5: "Installation",
    6: "C2",
    7: "Actions on Objectives",
}


class KillChainLogEvent(BaseModel):
    """A single log event from any kill chain stage"""
    log: str
    timestamp: datetime
    stage: int
    stageName: str
    subStep: str
    subStepNumber: Optional[int] = None
    toolName: Optional[str] = None
    level: str = "info"  # info, warning, error, success, action
    durationMs: Optional[int] = None
    metadata: Optional[dict] = None
    # Recon-specific (stage 1) - maps from ReconLogEvent
    phase: Optional[str] = None
    phaseNumber: Optional[int] = None
    isPhaseStart: Optional[bool] = None


class KillChainState(BaseModel):
    """Current state of a kill chain run"""
    project_id: str
    status: KillChainStatus
    current_stage: int = 1
    current_stage_name: str = "Reconnaissance"
    current_sub_step: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


class KillChainStartRequest(BaseModel):
    """Request to start a kill chain run (project_id from path)"""
    user_id: str = ""
    start_stage: int = 1  # 1=Reconnaissance (full recon, clears data), 2=Weaponization (use existing data)


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    running_kill_chains: int = 0
