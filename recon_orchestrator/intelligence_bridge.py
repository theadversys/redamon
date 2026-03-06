import asyncio
import logging
from typing import Dict
from spiderfoot_client import SpiderFootClient

logger = logging.getLogger(__name__)

class IntelligenceBridge:
    """
    Bridge between SpiderFoot OSINT and the Neo4j Graph Map.
    Polls SpiderFoot scans and triggers ingestion into the graph.
    """
    def __init__(self, spiderfoot_client: SpiderFootClient):
        self.sf = spiderfoot_client
        self.active_polls: Dict[str, asyncio.Task] = {}

    async def start_monitoring(self, project_id: str, user_id: str, scan_id: str, target_domain: str):
        """Start a background task to monitor a SpiderFoot scan"""
        if project_id in self.active_polls:
            logger.warning(f"Already monitoring project {project_id}")
            return

        task = asyncio.create_task(self._poll_loop(project_id, user_id, scan_id, target_domain))
        self.active_polls[project_id] = task
        logger.info(f"Started OSINT monitoring for project {project_id} (Scan: {scan_id})")

    async def stop_monitoring(self, project_id: str):
        """Stop the background monitoring task"""
        if project_id in self.active_polls:
            self.active_polls[project_id].cancel()
            del self.active_polls[project_id]
            logger.info(f"Stopped OSINT monitoring for project {project_id}")

    async def _poll_loop(self, project_id: str, user_id: str, scan_id: str, target_domain: str):
        """Background loop to poll SpiderFoot events and ingest into graph"""
        # Track how many events we've already ingested to avoid redundant writes
        last_ingested_count = 0

        try:
            while True:
                # Poll scan status — returns [name, target, created, started, ended, status, riskmatrix]
                status_res = self.sf.get_scan_status(scan_id)
                if not status_res or not isinstance(status_res, list) or len(status_res) < 6:
                    break

                status = status_res[5]
                is_done = status in ["FINISHED", "ABORTED", "FAILED", "ERROR-FAILED"]
                if is_done:
                    logger.info(f"SpiderFoot scan {scan_id} finished with status: {status}")

                # Only ingest if there are new events (avoids Neo4j constraint races)
                new_count = await self._ingest_new_events(
                    project_id, user_id, scan_id, target_domain, last_ingested_count
                )
                last_ingested_count = new_count

                if is_done:
                    break

                # Wait before next poll (OSINT is slower than local recon)
                await asyncio.sleep(30)
                
        except asyncio.CancelledError:
            logger.info(f"Polling cancelled for project {project_id}")
        except Exception as e:
            logger.error(f"Error in IntelligenceBridge loop for {project_id}: {e}")
        finally:
            if project_id in self.active_polls:
                del self.active_polls[project_id]

    async def _ingest_new_events(self, project_id: str, user_id: str, scan_id: str, target_domain: str, last_count: int = 0) -> int:
        """Fetch events from SpiderFoot and ingest only NEW events into Neo4j.

        Returns the total event count seen so far (caller stores this as last_count).
        """
        events = self.sf.get_scan_events(scan_id)
        if not events:
            return last_count

        total = len(events)
        if total <= last_count:
            return last_count  # No new events since last poll — skip ingest

        from ingest import ingest_spiderfoot
        result = ingest_spiderfoot(project_id, user_id, events, target_domain)
        if result.get("stats"):
            logger.info(f"SpiderFoot ingest complete for {project_id}: {result['stats']}")
        if result.get("errors"):
            # Filter out constraint violations — they are benign (MERGE idempotency race)
            real_errors = [
                e for e in result["errors"]
                if "ConstraintValidationFailed" not in str(e) and "already exists" not in str(e)
            ]
            if real_errors:
                logger.warning(f"SpiderFoot ingest errors [{project_id}]: {real_errors}")
        return total
