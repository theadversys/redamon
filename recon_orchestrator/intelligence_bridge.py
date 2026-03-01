import asyncio
import logging
import json
from datetime import datetime
from typing import Dict, List, Any
from spiderfoot_client import SpiderFootClient
from ingest import _extract_root_domain

logger = logging.getLogger(__name__)

# Mapping SpiderFoot events to our Neo4j ingestion formats
# This is a simplified mapping for the initial bridge
EVENT_MAPPING = {
    "INTERNET_NAME": "subdomain",
    "IP_ADDRESS": "ip",
    "EMAILADDR": "email",
    "VULNERABILITY": "vuln",
    "LEAKED_EMAIL": "leak",
    # Add more as needed
}

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
        last_seen_event_id = None
        
        try:
            while True:
                # Poll scan status — returns [name, target, created, started, ended, status, riskmatrix]
                status_res = self.sf.get_scan_status(scan_id)
                if not status_res or not isinstance(status_res, list) or len(status_res) < 6:
                    break
                
                status = status_res[5]
                if status in ["FINISHED", "ABORTED", "FAILED", "ERROR-FAILED"]:
                    logger.info(f"SpiderFoot scan {scan_id} finished with status: {status}")
                    # Final ingest then stop
                    await self._ingest_new_events(project_id, user_id, scan_id, target_domain)
                    break
                
                # Ingest new events
                await self._ingest_new_events(project_id, user_id, scan_id, target_domain)
                
                # Wait before next poll (OSINT is slower than local recon)
                await asyncio.sleep(30)
                
        except asyncio.CancelledError:
            logger.info(f"Polling cancelled for project {project_id}")
        except Exception as e:
            logger.error(f"Error in IntelligenceBridge loop for {project_id}: {e}")
        finally:
            if project_id in self.active_polls:
                del self.active_polls[project_id]

    async def _ingest_new_events(self, project_id: str, user_id: str, scan_id: str, target_domain: str):
        """Fetch news events from SpiderFoot and process them for Neo4j"""
        events = self.sf.get_scan_events(scan_id)
        if not events:
            return

        # Prepare data for Neo4j ingestion
        # We'll use the existing ingest logic by simulating structured tool output
        # For subdomains/IPs, we can use the naabu/nmap ingestion logic
        # For vulnerabilities, we can use the nuclei ingestion logic
        
        subdomains_found = []
        vulns_found = []
        
        for event in events:
            # event format: [timestamp, data, source, module, type_descr, type, ...]
            # Based on sfcli.py: data is at index 1, type is at index 10
            evt_data = event[1]
            evt_type = event[10]
            
            if evt_type == "INTERNET_NAME":
                subdomains_found.append(evt_data)
            elif evt_type in ["VULNERABILITY", "LEAKED_EMAIL"]:
                vulns_found.append({
                    "template-id": f"spiderfoot-{evt_type}",
                    "info": {
                        "name": f"OSINT: {evt_type}",
                        "severity": "medium",
                        "description": evt_data,
                        "tags": ["osint", "spiderfoot"]
                    },
                    "matched-at": evt_data,
                    "timestamp": datetime.utcnow().isoformat()
                })

        # Implementation Note: To avoid duplication, we'd need to track event UUIDs from SpiderFoot.
        # For this MVP integration, we rely on Neo4j's MERGE capabilities in our client.
        
        if subdomains_found:
            # Use a mock Naabu output to trigger subdomain ingestion
            mock_naabu = "\n".join([json.dumps({"host": h, "ip": "", "port": 0}) for h in subdomains_found])
            from ingest import ingest_naabu
            ingest_naabu(project_id, user_id, mock_naabu, target_domain)
            
        if vulns_found:
            # Use a mock Nuclei output to trigger vuln ingestion
            mock_nuclei = "\n".join([json.dumps(v) for v in vulns_found])
            from ingest import ingest_nuclei
            ingest_nuclei(project_id, user_id, mock_nuclei, target_domain)
