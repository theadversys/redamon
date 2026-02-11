"""
Threat Intelligence Processor

Processes and normalizes threat intelligence data.
"""

import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class ThreatIntelProcessor:
    """Processes threat intelligence data."""
    
    def normalize_cve(self, cve_data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize CVE data from different sources."""
        return {
            "cve_id": cve_data.get("cve_id"),
            "description": cve_data.get("description", ""),
            "severity": cve_data.get("severity", "unknown"),
            "published_date": cve_data.get("published_date"),
            "source": cve_data.get("source", "unknown"),
            "affected_products": self._extract_affected_products(cve_data),
            "exploit_available": cve_data.get("exploit_available", False)
        }
    
    def normalize_exploit(self, exploit_data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize exploit data."""
        return {
            "exploit_id": exploit_data.get("exploit_id"),
            "cve_id": exploit_data.get("cve_id"),
            "title": exploit_data.get("title", ""),
            "description": exploit_data.get("description", ""),
            "platform": exploit_data.get("platform", "unknown"),
            "type": exploit_data.get("type", "unknown"),
            "source": exploit_data.get("source", "unknown")
        }
    
    def _extract_affected_products(self, cve_data: Dict[str, Any]) -> List[str]:
        """Extract affected products from CVE data."""
        # Simplified - real implementation would parse CVE JSON properly
        products = []
        description = cve_data.get("description", "").lower()
        
        # Simple keyword matching
        if "apache" in description:
            products.append("Apache")
        if "nginx" in description:
            products.append("Nginx")
        if "openssh" in description or "ssh" in description:
            products.append("OpenSSH")
        
        return products
    
    def process_feeds(self, feeds_data: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
        """
        Process data from multiple feeds.
        
        Args:
            feeds_data: Dictionary mapping feed names to data lists
            
        Returns:
            Processed and normalized data
        """
        processed = {
            "cves": [],
            "exploits": [],
            "advisories": [],
            "shodan_results": []
        }
        
        # Process CVEs
        for cve in feeds_data.get("nvd", []):
            processed["cves"].append(self.normalize_cve(cve))
        
        # Process exploits
        for exploit in feeds_data.get("exploit_db", []):
            processed["exploits"].append(self.normalize_exploit(exploit))
        
        # Process GHSA
        for advisory in feeds_data.get("ghsa", []):
            processed["advisories"].append(advisory)
        
        # Process Shodan
        for result in feeds_data.get("shodan", []):
            processed["shodan_results"].append(result)
        
        logger.info(f"Processed threat intel: {len(processed['cves'])} CVEs, {len(processed['exploits'])} exploits")
        return processed
