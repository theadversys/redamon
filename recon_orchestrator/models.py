"""
Pydantic models for Recon Orchestrator API
"""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class ReconStatus(str, Enum):
    """Status of a recon process"""
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"
    STOPPING = "stopping"


class ReconStartRequest(BaseModel):
    """Request to start a recon process"""
    project_id: str
    user_id: str
    webapp_api_url: str
    target_domain: Optional[str] = None


class ReconState(BaseModel):
    """Current state of a recon process"""
    project_id: str
    status: ReconStatus
    current_phase: Optional[str] = None
    phase_number: Optional[int] = None
    total_phases: int = 7
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    container_id: Optional[str] = None
    sf_scan_id: Optional[str] = None  # SpiderFoot scan ID (set when OSINT scan is started)


class ReconLogEvent(BaseModel):
    """A single log event from recon container"""
    log: str
    timestamp: datetime
    phase: Optional[str] = None
    phase_number: Optional[int] = None
    is_phase_start: bool = False
    is_phase_end: bool = False
    level: str = "info"  # info, warning, error, success, action


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    running_recons: int


class IngestNaabuRequest(BaseModel):
    """Request to ingest naabu output into graph"""
    project_id: str
    user_id: str
    raw_output: str
    target_domain: str


class IngestNmapRequest(BaseModel):
    """Request to ingest nmap XML output into graph"""
    project_id: str
    user_id: str
    raw_output: str
    target_domain: str


class IngestNucleiRequest(BaseModel):
    """Request to ingest nuclei output into graph"""
    project_id: str
    user_id: str
    raw_output: str
    target_domain: Optional[str] = None


class IngestCurlRequest(BaseModel):
    """Request to ingest curl probe into graph"""
    project_id: str
    user_id: str
    url: str
    status_code: int
    raw_response: Optional[str] = None


class IngestNiktoRequest(BaseModel):
    """Request to ingest nikto output into graph"""
    project_id: str
    user_id: str
    raw_output: str
    target_domain: str


class IngestSqlmapRequest(BaseModel):
    """Request to ingest sqlmap output into graph"""
    project_id: str
    user_id: str
    raw_output: str
    target_url: str
    target_domain: Optional[str] = None


class IngestDirbRequest(BaseModel):
    """Request to ingest dirb output into graph"""
    project_id: str
    user_id: str
    raw_output: str
    target_domain: str


class IngestHydraRequest(BaseModel):
    """Request to ingest hydra output into graph"""
    project_id: str
    user_id: str
    raw_output: str
    target_domain: str


class IngestCustomRequest(BaseModel):
    """Request to ingest custom tool findings into graph"""
    project_id: str
    user_id: str
    findings: list
    target_domain: str


class IngestGitHubRequest(BaseModel):
    """Request to ingest GitHub secret scan findings from JSON file into graph"""
    project_id: str
    user_id: str
    github_json_path: Optional[str] = None
