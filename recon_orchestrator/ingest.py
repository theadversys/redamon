"""
Graph Ingest - Parse Agent Zero tool output and write to Neo4j

Enables graph generation independent of the recon pipeline when Agent Zero
runs naabu, nuclei, curl via kali-sandbox MCP tools.
"""

import json
import logging
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

# Add app root for graph_db and recon imports (Docker: /app has graph_db, recon)
_app_root = Path(__file__).parent
if str(_app_root) not in sys.path:
    sys.path.insert(0, str(_app_root))

logger = logging.getLogger(__name__)

# Minimal port-to-service mapping for naabu ingest (avoids heavy recon imports)
_COMMON_PORTS = {
    20: "ftp-data", 21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp",
    53: "dns", 80: "http", 110: "pop3", 143: "imap", 443: "https",
    445: "microsoft-ds", 993: "imaps", 995: "pop3s", 3306: "mysql",
    3389: "ms-wbt-server", 5432: "postgresql", 5900: "vnc", 8080: "http-proxy",
}


def _parse_naabu_from_string(raw_output: str) -> dict:
    """Parse naabu -json output from string. Self-contained to avoid recon imports."""
    by_host = {}
    by_ip = {}
    all_ports = set()

    for line in raw_output.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        host = entry.get("host", "")
        ip = entry.get("ip", "")
        port = entry.get("port")
        cdn = entry.get("cdn", "")
        cdn_name = entry.get("cdn-name", "")
        if port:
            all_ports.add(port)
        service = _COMMON_PORTS.get(port, "unknown") if port else "unknown"

        if host:
            if host not in by_host:
                by_host[host] = {
                    "host": host, "ip": ip, "ports": [], "port_details": [],
                    "cdn": cdn_name if cdn_name else None, "is_cdn": bool(cdn or cdn_name),
                }
            if port and port not in by_host[host]["ports"]:
                by_host[host]["ports"].append(port)
                by_host[host]["port_details"].append({"port": port, "protocol": "tcp", "service": service})

        if ip:
            if ip not in by_ip:
                by_ip[ip] = {
                    "ip": ip, "hostnames": [], "ports": [],
                    "cdn": cdn_name if cdn_name else None, "is_cdn": bool(cdn or cdn_name),
                }
            if host and host not in by_ip[ip]["hostnames"]:
                by_ip[ip]["hostnames"].append(host)
            if port and port not in by_ip[ip]["ports"]:
                by_ip[ip]["ports"].append(port)

    for h in by_host:
        by_host[h]["ports"].sort()
        by_host[h]["port_details"].sort(key=lambda x: x["port"])
    for i in by_ip:
        by_ip[i]["ports"].sort()

    all_ports_sorted = sorted(list(all_ports))
    return {
        "by_host": by_host,
        "by_ip": by_ip,
        "all_ports": all_ports_sorted,
        "summary": {
            "hosts_scanned": len(by_host),
            "ips_scanned": len(by_ip),
            "hosts_with_open_ports": len([h for h in by_host.values() if h["ports"]]),
            "total_open_ports": sum(len(h["ports"]) for h in by_host.values()),
            "unique_ports": all_ports_sorted,
            "unique_port_count": len(all_ports_sorted),
            "cdn_hosts": len([h for h in by_host.values() if h.get("is_cdn")]),
        },
    }


def _parse_nmap_xml_from_string(raw_output: str) -> dict:
    """Parse nmap -oX - XML output into port_scan format (by_host, by_ip)."""
    by_host = {}
    by_ip = {}
    all_ports = set()

    # Extract XML (nmap may print extra lines before/after)
    xml_start = raw_output.find("<?xml")
    xml_end = raw_output.rfind("</nmaprun>")
    if xml_start < 0 or xml_end < 0:
        raise ValueError("No valid nmap XML found in output. Use: nmap -sV -oX - target")
    xml_str = raw_output[xml_start : xml_end + len("</nmaprun>")]

    root = ET.fromstring(xml_str)
    for host_elem in root.findall(".//host"):
        status = host_elem.find("status")
        if status is not None and status.get("state") != "up":
            continue

        # Get IP
        ip = None
        for addr in host_elem.findall("address"):
            if addr.get("addrtype") == "ipv4":
                ip = addr.get("addr")
                break
        if not ip:
            continue

        # Get hostnames
        hostnames = []
        hostnames_elem = host_elem.find("hostnames")
        if hostnames_elem is not None:
            for hn in hostnames_elem.findall("hostname"):
                name = hn.get("name")
                if name:
                    hostnames.append(name)

        # Get open ports
        port_details = []
        ports_elem = host_elem.find("ports")
        if ports_elem is not None:
            for port_elem in ports_elem.findall("port"):
                state = port_elem.find("state")
                if state is None or state.get("state") != "open":
                    continue
                port_id = port_elem.get("portid")
                protocol = port_elem.get("protocol", "tcp")
                if not port_id:
                    continue
                try:
                    port_num = int(port_id)
                except ValueError:
                    continue
                all_ports.add(port_num)

                service_name = _COMMON_PORTS.get(port_num, "unknown")
                svc = port_elem.find("service")
                if svc is not None:
                    name = svc.get("name") or svc.get("product")
                    if name:
                        service_name = name

                port_details.append({
                    "port": port_num,
                    "protocol": protocol,
                    "service": service_name,
                })

        if not port_details:
            continue

        ports = sorted([p["port"] for p in port_details])
        port_details.sort(key=lambda x: x["port"])

        # by_ip
        if ip not in by_ip:
            by_ip[ip] = {
                "ip": ip,
                "hostnames": list(hostnames),
                "ports": [],
                "cdn": None,
                "is_cdn": False,
            }
        for p in ports:
            if p not in by_ip[ip]["ports"]:
                by_ip[ip]["ports"].append(p)
        by_ip[ip]["ports"].sort()

        # by_host (use hostname or IP)
        for host in hostnames or [ip]:
            if host not in by_host:
                by_host[host] = {
                    "host": host,
                    "ip": ip,
                    "ports": [],
                    "port_details": [],
                    "cdn": None,
                    "is_cdn": False,
                }
            for pd in port_details:
                if pd["port"] not in by_host[host]["ports"]:
                    by_host[host]["ports"].append(pd["port"])
                    by_host[host]["port_details"].append(pd)
            by_host[host]["ports"].sort()
            by_host[host]["port_details"].sort(key=lambda x: x["port"])

    all_ports_sorted = sorted(list(all_ports))
    return {
        "by_host": by_host,
        "by_ip": by_ip,
        "all_ports": all_ports_sorted,
        "summary": {
            "hosts_scanned": len(by_host),
            "ips_scanned": len(by_ip),
            "hosts_with_open_ports": len([h for h in by_host.values() if h["ports"]]),
            "total_open_ports": sum(len(h["ports"]) for h in by_host.values()),
            "unique_ports": all_ports_sorted,
            "unique_port_count": len(all_ports_sorted),
            "cdn_hosts": 0,
        },
    }


def _extract_root_domain(host_or_url: str) -> str:
    """Extract root domain from hostname or URL."""
    if not host_or_url:
        return ""
    if "://" in host_or_url:
        try:
            parsed = urlparse(host_or_url)
            host = parsed.netloc or parsed.path
        except Exception:
            host = host_or_url
    else:
        host = host_or_url
    if ":" in host:
        host = host.split(":")[0]
    # Simple root extraction: take last two parts for common TLDs
    parts = host.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host


def _build_bootstrap_recon_data(
    target_domain: str,
    hosts_from_scan: list,
    host_to_ips: dict,
) -> dict:
    """Build minimal recon_data for domain_discovery bootstrap."""
    root_domain = _extract_root_domain(target_domain) or target_domain
    subdomains = list(set(hosts_from_scan)) if hosts_from_scan else [root_domain]
    if root_domain not in subdomains:
        subdomains.insert(0, root_domain)

    dns_subdomains = {}
    for host in subdomains:
        ips = host_to_ips.get(host, [])
        ipv4 = [ip for ip in ips if ip and ":" not in ip]
        ipv6 = [ip for ip in ips if ip and ":" in ip]
        dns_subdomains[host] = {
            "has_records": True,
            "ips": {"ipv4": ipv4, "ipv6": ipv6},
            "records": {},
        }

    return {
        "metadata": {
            "root_domain": root_domain,
            "target": target_domain,
            "filtered_mode": False,
            "subdomain_filter": [],
            "scan_timestamp": datetime.utcnow().isoformat(),
            "scan_type": "domain_discovery",
            "modules_executed": ["bootstrap_ingest"],
        },
        "whois": {},
        "subdomains": subdomains,
        "domain": root_domain,
        "dns": {
            "domain": dns_subdomains.get(root_domain, {"has_records": True, "ips": {}, "records": {}}),
            "subdomains": dns_subdomains,
        },
    }


def ingest_naabu(
    project_id: str,
    user_id: str,
    raw_output: str,
    target_domain: str,
) -> dict:
    """
    Parse naabu -json output and write Port/IP/Service nodes to Neo4j.

    Bootstraps Domain/Subdomain/IP if no prior recon exists.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not raw_output or not raw_output.strip():
        result["errors"].append("Empty raw_output")
        return result

    try:
        port_scan_data = _parse_naabu_from_string(raw_output)
    except Exception as e:
        result["errors"].append(f"Parse failed: {e}")
        logger.exception("Naabu parse failed")
        return result

    if not port_scan_data.get("by_host") and not port_scan_data.get("by_ip"):
        result["errors"].append("No hosts or IPs in naabu output")
        return result

    if not target_domain:
        result["errors"].append("target_domain required for naabu ingest")
        return result

    # Build host->ips for bootstrap
    host_to_ips = {}
    for host, info in port_scan_data.get("by_host", {}).items():
        ip = info.get("ip")
        if ip:
            host_to_ips.setdefault(host, []).append(ip)
    for ip, info in port_scan_data.get("by_ip", {}).items():
        for host in info.get("hostnames", []):
            host_to_ips.setdefault(host, []).append(ip)

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        # Bootstrap domain/subdomain/IP
        hosts = list(port_scan_data.get("by_host", {}).keys()) or list(
            {h for info in port_scan_data.get("by_ip", {}).values() for h in info.get("hostnames", [])}
        )
        bootstrap_data = _build_bootstrap_recon_data(target_domain, hosts, host_to_ips)
        try:
            domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
            result["stats"]["domain_bootstrap"] = domain_stats
        except Exception as e:
            result["errors"].append(f"Domain bootstrap failed: {e}")
            logger.exception("Domain bootstrap failed")

        # Port scan update
        recon_data = {
            "metadata": {"root_domain": _extract_root_domain(target_domain) or target_domain},
            "port_scan": {
                **port_scan_data,
                "scan_metadata": {
                    "scan_timestamp": datetime.utcnow().isoformat(),
                    "scan_type": "naabu_ingest",
                },
            },
        }
        try:
            port_stats = client.update_graph_from_port_scan(recon_data, user_id, project_id)
            result["stats"]["port_scan"] = port_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Port scan update failed: {e}")
            logger.exception("Port scan update failed")

    return result


def ingest_nmap(
    project_id: str,
    user_id: str,
    raw_output: str,
    target_domain: str,
) -> dict:
    """
    Parse nmap -oX - XML output and write Port/IP/Service nodes to Neo4j.

    Bootstraps Domain/Subdomain/IP if no prior recon exists.
    Use: nmap -sV -oX - target.com
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not raw_output or not raw_output.strip():
        result["errors"].append("Empty raw_output")
        return result

    try:
        port_scan_data = _parse_nmap_xml_from_string(raw_output)
    except Exception as e:
        result["errors"].append(f"Parse failed: {e}")
        logger.exception("Nmap parse failed")
        return result

    if not port_scan_data.get("by_host") and not port_scan_data.get("by_ip"):
        result["errors"].append("No hosts or IPs in nmap output")
        return result

    if not target_domain:
        result["errors"].append("target_domain required for nmap ingest")
        return result

    # Build host->ips for bootstrap
    host_to_ips = {}
    for host, info in port_scan_data.get("by_host", {}).items():
        ip = info.get("ip")
        if ip:
            host_to_ips.setdefault(host, []).append(ip)
    for ip, info in port_scan_data.get("by_ip", {}).items():
        for host in info.get("hostnames", []):
            host_to_ips.setdefault(host, []).append(ip)

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        hosts = list(port_scan_data.get("by_host", {}).keys()) or list(
            {h for info in port_scan_data.get("by_ip", {}).values() for h in info.get("hostnames", [])}
        )
        bootstrap_data = _build_bootstrap_recon_data(target_domain, hosts, host_to_ips)
        try:
            domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
            result["stats"]["domain_bootstrap"] = domain_stats
        except Exception as e:
            result["errors"].append(f"Domain bootstrap failed: {e}")
            logger.exception("Domain bootstrap failed")

        recon_data = {
            "metadata": {"root_domain": _extract_root_domain(target_domain) or target_domain},
            "port_scan": {
                **port_scan_data,
                "scan_metadata": {
                    "scan_timestamp": datetime.utcnow().isoformat(),
                    "scan_type": "nmap_ingest",
                },
            },
        }
        try:
            port_stats = client.update_graph_from_port_scan(recon_data, user_id, project_id)
            result["stats"]["port_scan"] = port_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Port scan update failed: {e}")
            logger.exception("Port scan update failed")

    return result


def _parse_nuclei_finding(finding: dict) -> dict:
    """Parse a single nuclei JSON line into standardized format. Inlined to avoid recon imports."""
    info = finding.get("info", {})
    classification = info.get("classification", {})
    cves = []
    if classification.get("cve-id"):
        cve_ids = classification["cve-id"]
        if isinstance(cve_ids, str):
            cve_ids = [cve_ids]
        for cve_id in cve_ids:
            if cve_id and str(cve_id).startswith("CVE-"):
                cves.append({"id": cve_id, "cvss": classification.get("cvss-score"), "url": f"https://nvd.nist.gov/vuln/detail/{cve_id}"})
    if classification.get("cve"):
        for cve_id in (classification["cve"] if isinstance(classification["cve"], list) else [classification["cve"]]):
            if cve_id and not any(c["id"] == cve_id for c in cves):
                cves.append({"id": cve_id, "cvss": None, "url": f"https://nvd.nist.gov/vuln/detail/{cve_id}"})

    tags = info.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]
    category = "general"
    for tag in tags:
        tag_lower = str(tag).lower()
        for key, cat in [("xss", "xss"), ("sqli", "sqli"), ("rce", "rce"), ("cve", "cve"), ("exposure", "exposure"), ("panel", "exposed_panel")]:
            if key in tag_lower:
                category = cat
                break
        if category != "general":
            break

    return {
        "template_id": finding.get("template-id", "unknown"),
        "template_path": finding.get("template", ""),
        "name": info.get("name", "Unknown"),
        "description": info.get("description", ""),
        "severity": str(info.get("severity", "unknown")).lower(),
        "category": category,
        "tags": tags,
        "reference": info.get("reference", []),
        "cves": cves,
        "cvss_score": classification.get("cvss-score"),
        "cvss_metrics": classification.get("cvss-metrics", ""),
        "cwe_id": classification.get("cwe-id", []),
        "target": finding.get("host", ""),
        "matched_at": finding.get("matched-at", ""),
        "matcher_name": finding.get("matcher-name", ""),
        "extracted_results": finding.get("extracted-results", []),
        "curl_command": finding.get("curl-command", ""),
        "request": finding.get("request", ""),
        "response": (finding.get("response") or "")[:500],
        "timestamp": finding.get("timestamp", datetime.utcnow().isoformat()),
        "raw": finding,
    }


def ingest_nuclei(
    project_id: str,
    user_id: str,
    raw_output: str,
    target_domain: str,
) -> dict:
    """
    Parse nuclei -jsonl output and write Vulnerability nodes to Neo4j.

    Bootstraps Domain/Subdomain from matched URLs if no prior recon exists.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not raw_output or not raw_output.strip():
        result["errors"].append("Empty raw_output")
        return result

    findings = []
    hosts_seen = set()

    for line in raw_output.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            raw_finding = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            parsed = _parse_nuclei_finding(raw_finding)
            findings.append(parsed)
            host = parsed.get("target") or ""
            if not host and parsed.get("matched_at"):
                try:
                    host = urlparse(parsed["matched_at"]).netloc or ""
                except Exception:
                    pass
            if host:
                hosts_seen.add(host)
        except Exception:
            continue

    if not findings:
        result["errors"].append("No valid nuclei findings in output")
        return result

    # Build vuln_scan structure
    by_target = {}
    for f in findings:
        target = f.get("target") or ""
        if not target and f.get("matched_at"):
            try:
                target = urlparse(f["matched_at"]).netloc or "unknown"
            except Exception:
                target = "unknown"
        if target not in by_target:
            by_target[target] = {"findings": [], "severity_counts": {}}
        by_target[target]["findings"].append(f)
        sev = f.get("severity", "unknown").lower()
        by_target[target]["severity_counts"][sev] = by_target[target]["severity_counts"].get(sev, 0) + 1

    root_domain = _extract_root_domain(target_domain) if target_domain else ""
    if not root_domain and hosts_seen:
        root_domain = _extract_root_domain(next(iter(hosts_seen)))

    vuln_scan_data = {
        "by_target": by_target,
        "scan_metadata": {"scan_timestamp": datetime.utcnow().isoformat()},
        "discovered_urls": {"base_urls": [], "dast_urls_with_params": []},
    }

    recon_data = {
        "metadata": {"root_domain": root_domain},
        "subdomains": list(hosts_seen),
        "domain": root_domain,
        "vuln_scan": vuln_scan_data,
    }

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        # Bootstrap if we have target_domain
        if target_domain and hosts_seen:
            host_to_ips = {h: [] for h in hosts_seen}
            bootstrap_data = _build_bootstrap_recon_data(target_domain, list(hosts_seen), host_to_ips)
            try:
                domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
                result["stats"]["domain_bootstrap"] = domain_stats
            except Exception as e:
                result["errors"].append(f"Domain bootstrap failed: {e}")

        try:
            vuln_stats = client.update_graph_from_vuln_scan(recon_data, user_id, project_id)
            result["stats"]["vuln_scan"] = vuln_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Vuln scan update failed: {e}")
            logger.exception("Vuln scan update failed")

    return result


def _parse_nikto_json(raw_output: str) -> list:
    """
    Parse nikto -Format json output into list of findings.
    Handles: single JSON object with scanitems/host, or JSON lines.
    """
    findings = []
    raw = raw_output.strip()
    if not raw:
        return findings

    # Try single JSON object first
    try:
        data = json.loads(raw)
        items = []
        if isinstance(data, dict):
            # scanitems at top level
            items = data.get("scanitems", data.get("items", []))
            if not items and "host" in data:
                # host array with scanitems per host
                for host_entry in data.get("host", []):
                    items.extend(host_entry.get("scanitems", host_entry.get("items", [])))
        elif isinstance(data, list):
            items = data
        for item in items:
            if isinstance(item, dict) and item.get("message"):
                findings.append(item)
    except json.JSONDecodeError:
        pass

    # Try JSON lines
    if not findings:
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                if isinstance(item, dict) and item.get("message"):
                    findings.append(item)
            except json.JSONDecodeError:
                continue

    return findings


def _nikto_item_to_finding(item: dict) -> dict:
    """Map nikto scan item to vuln_scan finding format."""
    hostname = item.get("hostname", item.get("ip", "unknown"))
    port = item.get("port", 80)
    tls = item.get("tls", False)
    scheme = "https" if tls else "http"
    uri = item.get("uri", "/")
    if not uri.startswith("/"):
        uri = "/" + uri
    testid = item.get("testid", "0")
    message = item.get("message", "Nikto finding")
    refs = item.get("refs", "")
    if isinstance(refs, str):
        refs = [r.strip() for r in refs.split(",") if r.strip()] if refs else []
    elif not isinstance(refs, list):
        refs = []

    # Infer category from message
    msg_lower = message.lower()
    category = "general"
    for key, cat in [
        ("xss", "xss"), ("cross-site", "xss"),
        ("sql", "sqli"), ("injection", "sqli"),
        ("rce", "rce"), ("remote code", "rce"),
        ("exposed", "exposure"), ("panel", "exposed_panel"),
        ("directory", "exposure"), ("backup", "exposure"),
    ]:
        if key in msg_lower:
            category = cat
            break

    port_suffix = f":{port}" if port and port not in (80, 443) else ""
    matched_at = f"{scheme}://{hostname}{port_suffix}{uri}"
    target = hostname

    return {
        "template_id": f"nikto-{testid}",
        "name": (message[:100] + "..." if len(message) > 100 else message),
        "description": message,
        "severity": "info",
        "category": category,
        "tags": ["nikto"],
        "reference": refs,
        "target": target,
        "matched_at": matched_at,
        "timestamp": datetime.utcnow().isoformat(),
        "raw": item,
        "source": "nikto",
    }


def ingest_nikto(
    project_id: str,
    user_id: str,
    raw_output: str,
    target_domain: str,
) -> dict:
    """
    Parse nikto -Format json output and write Vulnerability nodes to Neo4j.

    Bootstraps Domain/Subdomain from matched hosts if no prior recon exists.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not raw_output or not raw_output.strip():
        result["errors"].append("Empty raw_output")
        return result

    try:
        items = _parse_nikto_json(raw_output)
    except Exception as e:
        result["errors"].append(f"Parse failed: {e}")
        logger.exception("Nikto parse failed")
        return result

    findings = []
    hosts_seen = set()
    for item in items:
        try:
            f = _nikto_item_to_finding(item)
            findings.append(f)
            hosts_seen.add(f.get("target", ""))
        except Exception:
            continue

    if not findings:
        result["errors"].append("No valid nikto findings in output")
        return result

    by_target = {}
    for f in findings:
        target = f.get("target") or "unknown"
        if target not in by_target:
            by_target[target] = {"findings": [], "severity_counts": {}}
        by_target[target]["findings"].append(f)
        sev = f.get("severity", "info").lower()
        by_target[target]["severity_counts"][sev] = by_target[target]["severity_counts"].get(sev, 0) + 1

    root_domain = _extract_root_domain(target_domain) if target_domain else ""
    if not root_domain and hosts_seen:
        root_domain = _extract_root_domain(next(iter(hosts_seen)))

    vuln_scan_data = {
        "by_target": by_target,
        "scan_metadata": {"scan_timestamp": datetime.utcnow().isoformat()},
        "discovered_urls": {"base_urls": [], "dast_urls_with_params": []},
    }

    recon_data = {
        "metadata": {"root_domain": root_domain},
        "subdomains": list(hosts_seen),
        "domain": root_domain,
        "vuln_scan": vuln_scan_data,
    }

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        if target_domain and hosts_seen:
            host_to_ips = {h: [] for h in hosts_seen}
            bootstrap_data = _build_bootstrap_recon_data(target_domain, list(hosts_seen), host_to_ips)
            try:
                domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
                result["stats"]["domain_bootstrap"] = domain_stats
            except Exception as e:
                result["errors"].append(f"Domain bootstrap failed: {e}")

        try:
            vuln_stats = client.update_graph_from_vuln_scan(recon_data, user_id, project_id)
            result["stats"]["vuln_scan"] = vuln_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Vuln scan update failed: {e}")
            logger.exception("Nikto vuln scan update failed")

    return result


def _parse_sqlmap_stdout(raw_output: str, target_url: str) -> list:
    """
    Parse sqlmap stdout to extract SQL injection findings.
    Heuristic: look for Parameter:, Type:, Payload: patterns.
    """
    import re

    findings = []
    blocks = re.split(r'\n---+\n|\n\n+', raw_output)
    base_url = target_url
    if "?" in base_url:
        base_url = base_url.split("?")[0]

    for block in blocks:
        block = block.strip()
        if not block or len(block) < 20:
            continue

        param_match = re.search(r'Parameter:\s*(\w+)\s*\((\w+)\)', block, re.I)
        type_match = re.search(r'Type:\s*(.+?)(?:\n|$)', block, re.I)
        payload_match = re.search(r'Payload:\s*(.+?)(?:\n|$)', block, re.I)
        url_match = re.search(r'https?://[^\s]+', block)

        if not param_match:
            continue

        param_name = param_match.group(1)
        param_method = param_match.group(2).upper()
        inj_type = type_match.group(1).strip() if type_match else "unknown"
        payload = payload_match.group(1).strip()[:200] if payload_match else ""
        url = url_match.group(0) if url_match else target_url

        type_slug = re.sub(r'[^a-z0-9]', '_', inj_type.lower())[:30]
        template_id = f"sqlmap-sqli-{type_slug}"

        try:
            parsed = urlparse(url)
            host = parsed.netloc or ""
        except Exception:
            host = "unknown"

        findings.append({
            "template_id": template_id,
            "name": f"SQL injection ({inj_type}) in {param_name}",
            "description": f"Sqlmap detected {inj_type} SQL injection in parameter '{param_name}' ({param_method}). Payload: {payload[:100]}..." if payload else f"Sqlmap detected {inj_type} SQL injection in parameter '{param_name}' ({param_method}).",
            "severity": "high",
            "category": "sqli",
            "tags": ["sqli", "sqlmap"],
            "target": host,
            "matched_at": url,
            "timestamp": datetime.utcnow().isoformat(),
            "source": "sqlmap",
            "raw": {"parameter": param_name, "method": param_method, "type": inj_type, "payload": payload},
        })

    return findings


def ingest_sqlmap(
    project_id: str,
    user_id: str,
    raw_output: str,
    target_url: str,
    target_domain: str = "",
) -> dict:
    """
    Parse sqlmap stdout and write SQL injection Vulnerability nodes to Neo4j.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not raw_output or not raw_output.strip():
        result["errors"].append("Empty raw_output")
        return result

    if not target_url or not target_url.strip():
        result["errors"].append("target_url required")
        return result

    try:
        findings = _parse_sqlmap_stdout(raw_output, target_url)
    except Exception as e:
        result["errors"].append(f"Parse failed: {e}")
        logger.exception("Sqlmap parse failed")
        return result

    if not findings:
        result["errors"].append("No valid sqlmap findings in output")
        return result

    by_target = {}
    for f in findings:
        target = f.get("target") or "unknown"
        if target not in by_target:
            by_target[target] = {"findings": [], "severity_counts": {}}
        by_target[target]["findings"].append(f)
        sev = f.get("severity", "high").lower()
        by_target[target]["severity_counts"][sev] = by_target[target]["severity_counts"].get(sev, 0) + 1

    root_domain = _extract_root_domain(target_domain) if target_domain else ""
    if not root_domain:
        try:
            root_domain = _extract_root_domain(urlparse(target_url).netloc or "")
        except Exception:
            root_domain = "unknown"

    vuln_scan_data = {
        "by_target": by_target,
        "scan_metadata": {"scan_timestamp": datetime.utcnow().isoformat()},
        "discovered_urls": {"base_urls": [], "dast_urls_with_params": []},
    }
    recon_data = {
        "metadata": {"root_domain": root_domain},
        "subdomains": list(by_target.keys()),
        "domain": root_domain,
        "vuln_scan": vuln_scan_data,
    }

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        hosts_seen = set(by_target.keys())
        if target_domain and hosts_seen:
            host_to_ips = {h: [] for h in hosts_seen}
            bootstrap_data = _build_bootstrap_recon_data(target_domain, list(hosts_seen), host_to_ips)
            try:
                domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
                result["stats"]["domain_bootstrap"] = domain_stats
            except Exception as e:
                result["errors"].append(f"Domain bootstrap failed: {e}")

        try:
            vuln_stats = client.update_graph_from_vuln_scan(recon_data, user_id, project_id)
            result["stats"]["vuln_scan"] = vuln_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Vuln scan update failed: {e}")
            logger.exception("Sqlmap vuln scan update failed")

    return result


def _parse_dirb_stdout(raw_output: str) -> list:
    """
    Parse dirb stdout to extract discovered directories/files.
    Formats: ==> DIRECTORY: http://url/path/  or  + http://url/path (CODE:200|SIZE:123)
    """
    import re

    findings = []
    seen_urls = set()

    for line in raw_output.strip().splitlines():
        line = line.strip()
        if not line:
            continue

        url = None
        name = ""
        severity = "info"
        category = "exposure"

        # ==> DIRECTORY: http://...
        dir_match = re.search(r'==>\s*DIRECTORY:\s*(https?://[^\s]+)', line, re.I)
        if dir_match:
            url = dir_match.group(1).rstrip("/")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            path = urlparse(url).path or "/"
            name = f"Directory discovered: {path}"
            severity = "low"

        # + http://... (CODE:200|SIZE:123)
        if not url:
            plus_match = re.search(r'\+\s*(https?://[^\s]+)\s*\(CODE:(\d+)', line, re.I)
            if plus_match:
                url = plus_match.group(1)
                code = int(plus_match.group(2))
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                path = urlparse(url).path or "/"
                if code in (200, 201, 301, 302):
                    severity = "low"
                elif code in (401, 403):
                    severity = "medium"
                name = f"Endpoint discovered: {path} (HTTP {code})"

        if not url:
            continue

        try:
            host = urlparse(url).netloc or "unknown"
        except Exception:
            host = "unknown"

        path_slug = re.sub(r'[^a-z0-9]', '-', urlparse(url).path or "root")[:40]
        findings.append({
            "template_id": f"dirb-{path_slug}",
            "name": name,
            "description": f"Dirb discovered {url}",
            "severity": severity,
            "category": category,
            "tags": ["dirb", "directory-enumeration"],
            "target": host,
            "matched_at": url,
            "timestamp": datetime.utcnow().isoformat(),
            "source": "custom",
            "tool_name": "dirb",
            "raw": {"url": url},
        })

    return findings


def _parse_hydra_stdout(raw_output: str) -> list:
    """
    Parse hydra stdout to extract cracked credentials.
    Format: [port][service] host: ip   login: user   password: pass
    """
    import re

    findings = []
    # [22][ssh] host: 192.168.1.1   login: root   password: admin123
    pattern = re.compile(
        r'\[\d+\]\[(\w+)\]\s+host:\s*([^\s]+)\s+login:\s*([^\s]+)\s+password:\s*(.+?)(?:\s|$)',
        re.I
    )

    for line in raw_output.strip().splitlines():
        line = line.strip()
        if not line or "login:" not in line.lower() or "password:" not in line.lower():
            continue

        m = pattern.search(line)
        if m:
            service = m.group(1)
            host = m.group(2).strip()
            login = m.group(3).strip()
            password = m.group(4).strip()

            matched_at = f"{service}://{host}"
            findings.append({
                "template_id": f"hydra-{service}-cracked",
                "name": f"Credentials cracked: {login}@{host} ({service})",
                "description": f"Hydra cracked {service} login. Login: {login}, Password: {password}",
                "severity": "critical",
                "category": "general",
                "tags": ["hydra", "credential-crack"],
                "target": host,
                "matched_at": matched_at,
                "timestamp": datetime.utcnow().isoformat(),
                "source": "custom",
                "tool_name": "hydra",
                "raw": {"service": service, "host": host, "login": login, "password": password},
            })

    return findings


def ingest_dirb(
    project_id: str,
    user_id: str,
    raw_output: str,
    target_domain: str,
) -> dict:
    """
    Parse dirb stdout and write discovered directories/files as Vulnerability nodes.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not raw_output or not raw_output.strip():
        result["errors"].append("Empty raw_output")
        return result

    if not target_domain or not target_domain.strip():
        result["errors"].append("target_domain required")
        return result

    try:
        findings = _parse_dirb_stdout(raw_output)
    except Exception as e:
        result["errors"].append(f"Parse failed: {e}")
        logger.exception("Dirb parse failed")
        return result

    if not findings:
        result["errors"].append("No valid dirb findings in output")
        return result

    by_target = {}
    for f in findings:
        target = f.get("target") or "unknown"
        if target not in by_target:
            by_target[target] = {"findings": [], "severity_counts": {}}
        by_target[target]["findings"].append(f)
        sev = f.get("severity", "info").lower()
        by_target[target]["severity_counts"][sev] = by_target[target]["severity_counts"].get(sev, 0) + 1

    root_domain = _extract_root_domain(target_domain) or target_domain
    vuln_scan_data = {
        "by_target": by_target,
        "scan_metadata": {"scan_timestamp": datetime.utcnow().isoformat()},
        "discovered_urls": {"base_urls": [], "dast_urls_with_params": []},
    }
    recon_data = {
        "metadata": {"root_domain": root_domain},
        "subdomains": list(by_target.keys()),
        "domain": root_domain,
        "vuln_scan": vuln_scan_data,
    }

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        hosts_seen = set(by_target.keys())
        if target_domain and hosts_seen:
            host_to_ips = {h: [] for h in hosts_seen}
            bootstrap_data = _build_bootstrap_recon_data(target_domain, list(hosts_seen), host_to_ips)
            try:
                domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
                result["stats"]["domain_bootstrap"] = domain_stats
            except Exception as e:
                result["errors"].append(f"Domain bootstrap failed: {e}")

        try:
            vuln_stats = client.update_graph_from_vuln_scan(recon_data, user_id, project_id)
            result["stats"]["vuln_scan"] = vuln_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Vuln scan update failed: {e}")
            logger.exception("Dirb vuln scan update failed")

    return result


def ingest_hydra(
    project_id: str,
    user_id: str,
    raw_output: str,
    target_domain: str,
) -> dict:
    """
    Parse hydra stdout and write cracked credentials as Vulnerability nodes.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not raw_output or not raw_output.strip():
        result["errors"].append("Empty raw_output")
        return result

    if not target_domain or not target_domain.strip():
        result["errors"].append("target_domain required")
        return result

    try:
        findings = _parse_hydra_stdout(raw_output)
    except Exception as e:
        result["errors"].append(f"Parse failed: {e}")
        logger.exception("Hydra parse failed")
        return result

    if not findings:
        result["errors"].append("No valid hydra findings in output (no cracked credentials)")
        return result

    by_target = {}
    for f in findings:
        target = f.get("target") or "unknown"
        if target not in by_target:
            by_target[target] = {"findings": [], "severity_counts": {}}
        by_target[target]["findings"].append(f)
        sev = f.get("severity", "critical").lower()
        by_target[target]["severity_counts"][sev] = by_target[target]["severity_counts"].get(sev, 0) + 1

    root_domain = _extract_root_domain(target_domain) or target_domain
    vuln_scan_data = {
        "by_target": by_target,
        "scan_metadata": {"scan_timestamp": datetime.utcnow().isoformat()},
        "discovered_urls": {"base_urls": [], "dast_urls_with_params": []},
    }
    recon_data = {
        "metadata": {"root_domain": root_domain},
        "subdomains": list(by_target.keys()),
        "domain": root_domain,
        "vuln_scan": vuln_scan_data,
    }

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        hosts_seen = set(by_target.keys())
        if target_domain and hosts_seen:
            host_to_ips = {h: [] for h in hosts_seen}
            bootstrap_data = _build_bootstrap_recon_data(target_domain, list(hosts_seen), host_to_ips)
            try:
                domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
                result["stats"]["domain_bootstrap"] = domain_stats
            except Exception as e:
                result["errors"].append(f"Domain bootstrap failed: {e}")

        try:
            vuln_stats = client.update_graph_from_vuln_scan(recon_data, user_id, project_id)
            result["stats"]["vuln_scan"] = vuln_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Vuln scan update failed: {e}")
            logger.exception("Hydra vuln scan update failed")

    return result


def ingest_custom(
    project_id: str,
    user_id: str,
    findings: list,
    target_domain: str,
) -> dict:
    """
    Ingest pre-structured custom tool findings into Neo4j.

    No parsing - validates schema and passes through to update_graph_from_vuln_scan.
    Each finding must have: name, severity, matched_at.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not findings or not isinstance(findings, list):
        result["errors"].append("findings must be a non-empty list")
        return result

    if not target_domain or not target_domain.strip():
        result["errors"].append("target_domain required")
        return result

    validated = []
    for i, f in enumerate(findings):
        if not isinstance(f, dict):
            result["errors"].append(f"Finding {i}: must be object")
            continue
        if not f.get("name"):
            result["errors"].append(f"Finding {i}: name required")
            continue
        if not f.get("severity"):
            result["errors"].append(f"Finding {i}: severity required")
            continue
        if not f.get("matched_at"):
            result["errors"].append(f"Finding {i}: matched_at required")
            continue
        # Normalize to vuln_scan format (canonical schema)
        tool_name = f.get("tool_name", "").strip() or None
        finding = {
            "template_id": f.get("template_id", "custom-unknown"),
            "name": f.get("name"),
            "description": f.get("description", ""),
            "severity": str(f.get("severity", "info")).lower(),
            "category": f.get("category", "general"),
            "tags": f.get("tags", ["custom"]),
            "reference": f.get("references", f.get("reference", [])),
            "target": f.get("target") or "",
            "matched_at": f.get("matched_at"),
            "timestamp": f.get("timestamp", datetime.utcnow().isoformat()),
            "source": "custom",
            "tool_name": tool_name,
            "raw": f,
        }
        if not finding["target"] and finding["matched_at"]:
            try:
                finding["target"] = urlparse(finding["matched_at"]).netloc or ""
            except Exception:
                pass
        validated.append(finding)

    if not validated:
        result["errors"].append("No valid findings after validation")
        return result

    by_target = {}
    for f in validated:
        target = f.get("target") or "unknown"
        if target not in by_target:
            by_target[target] = {"findings": [], "severity_counts": {}}
        by_target[target]["findings"].append(f)
        sev = f.get("severity", "info").lower()
        by_target[target]["severity_counts"][sev] = by_target[target]["severity_counts"].get(sev, 0) + 1

    root_domain = _extract_root_domain(target_domain) or target_domain
    vuln_scan_data = {
        "by_target": by_target,
        "scan_metadata": {"scan_timestamp": datetime.utcnow().isoformat()},
        "discovered_urls": {"base_urls": [], "dast_urls_with_params": []},
    }
    recon_data = {
        "metadata": {"root_domain": root_domain},
        "subdomains": list(by_target.keys()),
        "domain": root_domain,
        "vuln_scan": vuln_scan_data,
    }

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        hosts_seen = set(by_target.keys())
        if target_domain and hosts_seen:
            host_to_ips = {h: [] for h in hosts_seen}
            bootstrap_data = _build_bootstrap_recon_data(target_domain, list(hosts_seen), host_to_ips)
            try:
                domain_stats = client.update_graph_from_domain_discovery(bootstrap_data, user_id, project_id)
                result["stats"]["domain_bootstrap"] = domain_stats
            except Exception as e:
                result["errors"].append(f"Domain bootstrap failed: {e}")

        try:
            vuln_stats = client.update_graph_from_vuln_scan(recon_data, user_id, project_id)
            result["stats"]["vuln_scan"] = vuln_stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(f"Vuln scan update failed: {e}")
            logger.exception("Custom vuln scan update failed")

    return result


def ingest_curl(
    project_id: str,
    user_id: str,
    url: str,
    status_code: int,
    raw_response: str = None,
) -> dict:
    """
    Create minimal BaseURL/Subdomain from curl probe.
    """
    from graph_db import Neo4jClient

    result = {"success": False, "stats": {}, "errors": []}

    if not url:
        result["errors"].append("url required")
        return result

    headers = {}
    server = None
    if raw_response:
        lines = raw_response.strip().split("\n")
        for i, line in enumerate(lines):
            if ":" in line and not line.startswith("HTTP"):
                idx = line.find(":")
                k = line[:idx].strip()
                v = line[idx + 1 :].strip()
                headers[k] = v
                if k.lower() == "server":
                    server = v

    neo4j_uri = os.environ.get("NEO4J_URI_INGEST") or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

    with Neo4jClient(uri=neo4j_uri, user=neo4j_user, password=neo4j_password) as client:
        if not client.verify_connection():
            result["errors"].append("Neo4j connection failed")
            return result

        try:
            stats = client.update_graph_from_curl_probe(
                url=url,
                status_code=status_code,
                user_id=user_id,
                project_id=project_id,
                headers=headers if headers else None,
                server=server,
            )
            result["stats"] = stats
            result["success"] = True
        except Exception as e:
            result["errors"].append(str(e))
            logger.exception("Curl probe update failed")

    return result
