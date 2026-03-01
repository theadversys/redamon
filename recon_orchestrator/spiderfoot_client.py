import logging
import requests
import json
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

class SpiderFootClient:
    """
    Client for SpiderFoot REST API
    """
    def __init__(self, base_url: str = "http://spiderfoot:5001"):
        self.base_url = base_url.rstrip('/')
        self.headers = {
            "Accept": "application/json",
            "User-Agent": "PandaExploit-Orchestrator/1.0"
        }

    def _request(self, endpoint: str, method: str = "GET", data: Optional[Dict] = None, timeout: int = 15) -> Optional[Dict]:
        url = f"{self.base_url}{endpoint}"
        try:
            if method == "POST":
                response = requests.post(url, headers=self.headers, data=data, timeout=timeout)
            else:
                response = requests.get(url, headers=self.headers, params=data, timeout=timeout)
            
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"SpiderFoot API error at {endpoint}: {e}")
            return None

    def ping(self) -> bool:
        """Check if SpiderFoot is responding"""
        res = self._request("/ping")
        return res is not None and res[0] == "SUCCESS"

    def start_scan(self, scanname: str, scantarget: str, usecase: str = "Footprint") -> Optional[str]:
        """
        Initiate a SpiderFoot scan.
        usecase values are case-sensitive: 'all', 'Investigate', 'Passive', 'Footprint'
        """
        data = {
            "scanname": scanname,
            "scantarget": scantarget,
            "usecase": usecase,
            "modulelist": "",
            "typelist": ""
        }
        res = self._request("/startscan", method="POST", data=data, timeout=60)
        if res and res[0] == "SUCCESS":
            return res[1]  # Return Scan ID
        return None

    def get_scan_status(self, scan_id: str) -> Optional[list]:
        """Get status information for a scan.
        Returns: [name, target, created, started, ended, status, riskmatrix]
        """
        return self._request(f"/scanstatus?id={scan_id}")

    def get_scan_logs(self, scan_id: str) -> Optional[List]:
        """Get logs for a scan"""
        return self._request(f"/scanlogs?id={scan_id}")

    def get_scan_events(self, scan_id: str, event_type: str = "ALL") -> Optional[List]:
        """Get data elements (events) discovered by a scan"""
        data = {"id": scan_id, "eventType": event_type}
        return self._request("/scaneventresults", method="POST", data=data)

    def stop_scan(self, scan_id: str) -> bool:
        """Stop a running scan. SpiderFoot returns empty string on success."""
        res = self._request(f"/stopscan?id={scan_id}")
        return res is not None
