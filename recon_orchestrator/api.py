"""
Recon Orchestrator API - FastAPI service for managing recon containers
"""
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from container_manager import ContainerManager
from models import (
    HealthResponse,
    IngestCurlRequest,
    IngestCustomRequest,
    IngestDirbRequest,
    IngestHydraRequest,
    IngestNaabuRequest,
    IngestNiktoRequest,
    IngestNucleiRequest,
    IngestNmapRequest,
    IngestSqlmapRequest,
    ReconLogEvent,
    ReconStartRequest,
    ReconState,
    ReconStatus,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Configuration
# RECON_PATH can be either host path (for Docker SDK) or container path (for mounting)
# If it's a host path, we'll use it directly. If it's relative or container path, use /app/recon
RECON_PATH_ENV = os.getenv("RECON_PATH", "/app/recon")
# For Docker SDK build, use the path as-is if it's absolute and exists, otherwise use /app/recon
RECON_PATH = RECON_PATH_ENV if os.path.isabs(RECON_PATH_ENV) and os.path.exists(RECON_PATH_ENV) else "/app/recon"
RECON_IMAGE = os.getenv("RECON_IMAGE", "pandaexploit-recon:latest")
VERSION = "1.0.0"

# Global container manager
container_manager: ContainerManager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources"""
    global container_manager
    logger.info("Starting Recon Orchestrator...")
    container_manager = ContainerManager(recon_image=RECON_IMAGE)
    yield
    logger.info("Shutting down Recon Orchestrator...")
    await container_manager.cleanup()


app = FastAPI(
    title="PandaExploit Recon Orchestrator",
    description="Container orchestration service for recon processes",
    version=VERSION,
    lifespan=lifespan,
)

# CORS middleware for webapp access (include webapp hostname for Docker)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://webapp:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version=VERSION,
        running_recons=container_manager.get_running_count() if container_manager else 0,
    )


@app.get("/defaults")
async def get_defaults():
    """
    Get default project settings from recon module.

    Returns DEFAULT_SETTINGS dict with camelCase keys for frontend compatibility.
    """
    import sys
    from pathlib import Path

    # Add recon path to sys.path to import project_settings
    recon_path = Path("/app/recon")
    if str(recon_path) not in sys.path:
        sys.path.insert(0, str(recon_path))

    try:
        # Import DEFAULT_SETTINGS from project_settings.py
        from project_settings import DEFAULT_SETTINGS

        # Runtime-only settings that should NOT be sent to frontend/database
        # These are used by recon module at runtime, not stored in PostgreSQL
        RUNTIME_ONLY_KEYS = {
            'PROJECT_ID',
            'USER_ID',
            'TARGET_DOMAIN',  # Provided by user, not a default
        }

        # Convert snake_case keys to camelCase for frontend
        def to_camel_case(snake_str: str) -> str:
            components = snake_str.lower().split('_')
            return components[0] + ''.join(x.title() for x in components[1:])

        camel_case_defaults = {
            to_camel_case(k): v
            for k, v in DEFAULT_SETTINGS.items()
            if k not in RUNTIME_ONLY_KEYS
        }

        return camel_case_defaults
    except ImportError as e:
        logger.error(f"Failed to import project_settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load defaults: {e}")
    except Exception as e:
        logger.error(f"Error getting defaults: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recon/{project_id}/start", response_model=ReconState)
async def start_recon(project_id: str, request: ReconStartRequest):
    """
    Start a new recon process for a project.

    - Checks if recon is already running
    - Starts new container with project settings from webapp API
    - Returns current state
    """
    if not container_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        state = await container_manager.start_recon(
            project_id=project_id,
            user_id=request.user_id,
            webapp_api_url=request.webapp_api_url,
            recon_path=RECON_PATH,
        )
        return state
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Error starting recon: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recon/{project_id}/status", response_model=ReconState)
async def get_recon_status(project_id: str):
    """Get current status of a recon process"""
    if not container_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    return await container_manager.get_status(project_id)


@app.post("/recon/{project_id}/stop", response_model=ReconState)
async def stop_recon(project_id: str):
    """Stop a running recon process"""
    if not container_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    state = await container_manager.stop_recon(project_id)
    return state


@app.get("/recon/{project_id}/logs")
async def stream_logs(project_id: str):
    """
    Stream logs from a recon container using Server-Sent Events.

    Events are sent as JSON with format:
    {
        "log": "...",
        "timestamp": "...",
        "phase": "...",
        "phase_number": 1,
        "is_phase_start": false,
        "level": "info"
    }
    """
    if not container_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # Check if there's a running container
    state = await container_manager.get_status(project_id)
    if state.status == ReconStatus.IDLE:
        raise HTTPException(status_code=404, detail="No recon process found for this project")

    async def event_generator():
        """Generate SSE events from container logs"""
        try:
            async for event in container_manager.stream_logs(project_id):
                yield {
                    "event": "log",
                    "data": json.dumps({
                        "log": event.log,
                        "timestamp": event.timestamp.isoformat(),
                        "phase": event.phase,
                        "phaseNumber": event.phase_number,
                        "isPhaseStart": event.is_phase_start,
                        "level": event.level,
                    }),
                }
        except Exception as e:
            logger.error(f"Error streaming logs: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

        # Send completion event
        final_state = await container_manager.get_status(project_id)
        yield {
            "event": "complete",
            "data": json.dumps({
                "status": final_state.status.value,
                "completedAt": final_state.completed_at.isoformat() if final_state.completed_at else None,
                "error": final_state.error,
            }),
        }

    return EventSourceResponse(event_generator())


@app.get("/recon/running")
async def list_running():
    """List all running recon processes"""
    if not container_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    running = [
        state for state in container_manager.running_states.values()
        if state.status == ReconStatus.RUNNING
    ]
    return {"running": [s.dict() for s in running]}


@app.post("/ingest/naabu")
async def ingest_naabu_endpoint(request: IngestNaabuRequest):
    """
    Ingest naabu -json output into Neo4j graph.
    Used when Agent Zero runs execute_naabu and wants to populate the graph.
    """
    try:
        from ingest import ingest_naabu as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            raw_output=request.raw_output,
            target_domain=request.target_domain,
        )
        return result
    except Exception as e:
        logger.exception("Naabu ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/nmap")
async def ingest_nmap_endpoint(request: IngestNmapRequest):
    """
    Ingest nmap -oX - XML output into Neo4j graph.
    Used when Agent Zero runs execute_nmap and wants to populate the graph.
    """
    try:
        from ingest import ingest_nmap as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            raw_output=request.raw_output,
            target_domain=request.target_domain,
        )
        return result
    except Exception as e:
        logger.exception("Nmap ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/nuclei")
async def ingest_nuclei_endpoint(request: IngestNucleiRequest):
    """
    Ingest nuclei -jsonl output into Neo4j graph.
    Used when Agent Zero runs execute_nuclei and wants to populate the graph.
    """
    try:
        from ingest import ingest_nuclei as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            raw_output=request.raw_output,
            target_domain=request.target_domain or "",
        )
        return result
    except Exception as e:
        logger.exception("Nuclei ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/curl")
async def ingest_curl_endpoint(request: IngestCurlRequest):
    """
    Ingest curl probe result into Neo4j graph.
    Used when Agent Zero runs execute_curl and wants to add BaseURL to the graph.
    """
    try:
        from ingest import ingest_curl as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            url=request.url,
            status_code=request.status_code,
            raw_response=request.raw_response,
        )
        return result
    except Exception as e:
        logger.exception("Curl ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/nikto")
async def ingest_nikto_endpoint(request: IngestNiktoRequest):
    """
    Ingest nikto -Format json output into Neo4j graph.
    Used when Agent Zero runs execute_nikto and wants to populate the graph.
    """
    try:
        from ingest import ingest_nikto as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            raw_output=request.raw_output,
            target_domain=request.target_domain,
        )
        return result
    except Exception as e:
        logger.exception("Nikto ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/sqlmap")
async def ingest_sqlmap_endpoint(request: IngestSqlmapRequest):
    """
    Ingest sqlmap stdout output into Neo4j graph.
    Used when Agent Zero runs execute_sqlmap and wants to populate the graph.
    """
    try:
        from ingest import ingest_sqlmap as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            raw_output=request.raw_output,
            target_url=request.target_url,
            target_domain=request.target_domain or "",
        )
        return result
    except Exception as e:
        logger.exception("Sqlmap ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/dirb")
async def ingest_dirb_endpoint(request: IngestDirbRequest):
    """
    Ingest dirb stdout output into Neo4j graph.
    Used when Agent Zero runs dirb via code_execution and wants to populate the graph.
    """
    try:
        from ingest import ingest_dirb as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            raw_output=request.raw_output,
            target_domain=request.target_domain,
        )
        return result
    except Exception as e:
        logger.exception("Dirb ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/hydra")
async def ingest_hydra_endpoint(request: IngestHydraRequest):
    """
    Ingest hydra stdout output into Neo4j graph.
    Used when Agent Zero runs hydra via code_execution and wants to populate the graph.
    """
    try:
        from ingest import ingest_hydra as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            raw_output=request.raw_output,
            target_domain=request.target_domain,
        )
        return result
    except Exception as e:
        logger.exception("Hydra ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/custom")
async def ingest_custom_endpoint(request: IngestCustomRequest):
    """
    Ingest custom tool findings into Neo4j graph.
    Used when Agent Zero runs custom scripts and extracts structured findings.
    """
    try:
        from ingest import ingest_custom as do_ingest
        result = do_ingest(
            project_id=request.project_id,
            user_id=request.user_id,
            findings=request.findings,
            target_domain=request.target_domain,
        )
        return result
    except Exception as e:
        logger.exception("Custom ingest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/recon/{project_id}/data")
async def delete_recon_data(project_id: str):
    """
    Delete recon output data for a project.

    This endpoint is called when a project is deleted to clean up
    the associated JSON files.
    """
    import os
    from pathlib import Path

    # Build the path to the recon output file
    # Inside the orchestrator container, the output is at /app/recon/output
    output_dir = Path("/app/recon/output")
    recon_file = output_dir / f"recon_{project_id}.json"

    deleted_files = []
    errors = []

    # Delete recon JSON file
    if recon_file.exists():
        try:
            os.remove(recon_file)
            deleted_files.append(str(recon_file))
            logger.info(f"Deleted recon file: {recon_file}")
        except Exception as e:
            errors.append(f"Failed to delete {recon_file}: {e}")
            logger.error(f"Failed to delete recon file: {e}")

    # Also clean up any running state for this project
    if container_manager and project_id in container_manager.running_states:
        del container_manager.running_states[project_id]

    return {
        "success": len(errors) == 0,
        "deleted": deleted_files,
        "errors": errors,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8010,
        reload=True,
        log_level="info",
    )
