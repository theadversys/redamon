"""
Threat Intelligence Feeds

Fetches threat intelligence from various sources.
"""

import logging
import httpx
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class ThreatIntelFeeds:
    """Fetches threat intelligence from various sources."""
    
    def __init__(self):
        """Initialize threat intel feeds."""
        self.nvd_api_key = os.getenv("NVD_API_KEY")
        self.shodan_api_key = os.getenv("SHODAN_API_KEY")
        self.exploit_db_api_key = os.getenv("EXPLOIT_DB_API_KEY")
    
    async def fetch_nvd_cves(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Fetch recent CVEs from NVD API.
        
        Args:
            hours: Number of hours to look back
            
        Returns:
            List of CVE dictionaries
        """
        if not self.nvd_api_key:
            logger.warning("NVD_API_KEY not set, skipping NVD feed")
            return []
        
        try:
            # Calculate start time
            start_time = datetime.now() - timedelta(hours=hours)
            start_date = start_time.strftime("%Y-%m-%dT%H:%M:%S.000")
            
            url = "https://services.nvd.nist.gov/rest/json/cves/2.0"
            params = {
                "pubStartDate": start_date,
                "resultsPerPage": 100
            }
            headers = {"apiKey": self.nvd_api_key} if self.nvd_api_key else {}
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, headers=headers, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                
                cves = []
                for item in data.get("vulnerabilities", []):
                    cve_data = item.get("cve", {})
                    cves.append({
                        "cve_id": cve_data.get("id"),
                        "description": cve_data.get("descriptions", [{}])[0].get("value", ""),
                        "published_date": cve_data.get("published"),
                        "severity": self._extract_severity(cve_data),
                        "source": "NVD"
                    })
                
                logger.info(f"Fetched {len(cves)} CVEs from NVD")
                return cves
                
        except Exception as e:
            logger.error(f"Failed to fetch NVD CVEs: {e}")
            return []
    
    async def fetch_exploit_db(self, cve_id: str = None) -> List[Dict[str, Any]]:
        """
        Fetch exploit information from Exploit-DB.
        
        Args:
            cve_id: Optional CVE ID to search for
            
        Returns:
            List of exploit dictionaries
        """
        # Note: Exploit-DB doesn't have a public API, so this is a placeholder
        # Real implementation would use web scraping or a paid API
        logger.info(f"Exploit-DB feed not implemented (requires API key or web scraping)")
        return []
    
    async def fetch_ghsa(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Fetch GitHub Security Advisories.
        
        Args:
            hours: Number of hours to look back
            
        Returns:
            List of GHSA dictionaries
        """
        try:
            url = "https://api.github.com/advisories"
            params = {
                "per_page": 100,
                "sort": "updated",
                "direction": "desc"
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                
                # Filter by time
                cutoff_time = datetime.now() - timedelta(hours=hours)
                advisories = []
                
                for item in data:
                    updated_at = datetime.fromisoformat(item.get("updated_at", "").replace("Z", "+00:00"))
                    if updated_at >= cutoff_time:
                        advisories.append({
                            "ghsa_id": item.get("ghsa_id"),
                            "cve_id": item.get("cve_id"),
                            "summary": item.get("summary", ""),
                            "severity": item.get("severity", "unknown"),
                            "updated_at": item.get("updated_at"),
                            "source": "GHSA"
                        })
                
                logger.info(f"Fetched {len(advisories)} GHSA advisories")
                return advisories
                
        except Exception as e:
            logger.error(f"Failed to fetch GHSA: {e}")
            return []
    
    async def fetch_shodan(self, query: str = None) -> List[Dict[str, Any]]:
        """
        Fetch information from Shodan.
        
        Args:
            query: Search query
            
        Returns:
            List of Shodan result dictionaries
        """
        if not self.shodan_api_key:
            logger.warning("SHODAN_API_KEY not set, skipping Shodan feed")
            return []
        
        if not query:
            return []
        
        try:
            url = "https://api.shodan.io/shodan/host/search"
            params = {
                "key": self.shodan_api_key,
                "query": query,
                "minify": True
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                
                results = []
                for item in data.get("matches", []):
                    results.append({
                        "ip": item.get("ip_str"),
                        "port": item.get("port"),
                        "service": item.get("product", ""),
                        "banner": item.get("data", "")[:500],
                        "source": "Shodan"
                    })
                
                logger.info(f"Fetched {len(results)} Shodan results")
                return results
                
        except Exception as e:
            logger.error(f"Failed to fetch Shodan data: {e}")
            return []
    
    def _extract_severity(self, cve_data: Dict[str, Any]) -> str:
        """Extract severity from CVE data."""
        metrics = cve_data.get("metrics", {})
        
        # Check CVSS v3.1
        if "cvssMetricV31" in metrics:
            for metric in metrics["cvssMetricV31"]:
                base_score = metric.get("cvssData", {}).get("baseScore", 0)
                if base_score >= 9.0:
                    return "critical"
                elif base_score >= 7.0:
                    return "high"
                elif base_score >= 4.0:
                    return "medium"
                else:
                    return "low"
        
        # Check CVSS v3.0
        if "cvssMetricV30" in metrics:
            for metric in metrics["cvssMetricV30"]:
                base_score = metric.get("cvssData", {}).get("baseScore", 0)
                if base_score >= 9.0:
                    return "critical"
                elif base_score >= 7.0:
                    return "high"
                elif base_score >= 4.0:
                    return "medium"
                else:
                    return "low"
        
        return "unknown"
