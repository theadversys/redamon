"""
SpiderFoot OSINT Integration for PandaExploit Recon Pipeline

Runs a SpiderFoot scan against the target and ingests structured results
(IPs, subdomains, emails, open ports, leaked creds) into the recon data dict.

Controlled by ENABLE_SPIDERFOOT env var (default: False) to keep pipeline fast
when SpiderFoot is not needed.

Usage:
    from recon.spiderfoot_recon import run_spiderfoot_recon
    recon_data = run_spiderfoot_recon(recon_data, target, output_file, settings)
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Add project root for SpiderfootClient import
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def run_spiderfoot_recon(
    recon_data: dict,
    target: str,
    output_file: Optional[Path] = None,
    settings: Optional[dict] = None,
) -> dict:
    """
    Run a SpiderFoot scan and merge results into recon_data.

    Gated by ENABLE_SPIDERFOOT env var — set to 'true' to enable.
    SpiderFoot service must be running (docker compose --profile spiderfoot up).

    Args:
        recon_data: Existing recon data dict (modified in-place and returned)
        target: Domain/IP/org to scan (e.g. example.com)
        output_file: Optional path to write updated recon_data as JSON
        settings: Project settings dict (for PROJECT_ID, USER_ID)

    Returns:
        recon_data with 'spiderfoot' key added containing structured findings.
    """
    enable = os.getenv("ENABLE_SPIDERFOOT", "false").lower() in ("1", "true", "yes")
    if not enable:
        print("\n[*] SpiderFoot Scan: SKIPPED (set ENABLE_SPIDERFOOT=true to enable)")
        return recon_data

    print("\n" + "=" * 60)
    print("    PandaExploit - SpiderFoot OSINT Scan")
    print("=" * 60)
    print(f"  Target: {target}")

    spiderfoot_url = os.getenv("SPIDERFOOT_URL", "http://spiderfoot:5001")

    try:
        from recon_orchestrator.spiderfoot_client import SpiderFootClient
    except ImportError:
        # Try relative path when running inside the container
        try:
            sys.path.insert(0, str(Path(__file__).parent.parent / "recon_orchestrator"))
            from spiderfoot_client import SpiderFootClient
        except ImportError:
            print("[!] SpiderfootClient not available — skipping SpiderFoot scan")
            recon_data["spiderfoot"] = {"error": "SpiderfootClient import failed", "skipped": True}
            return recon_data

    client = SpiderFootClient(base_url=spiderfoot_url)

    # Ping to ensure service is up
    if not client.ping():
        print(f"[!] SpiderFoot not reachable at {spiderfoot_url} — skipping")
        recon_data["spiderfoot"] = {
            "error": f"SpiderFoot unreachable at {spiderfoot_url}",
            "skipped": True,
        }
        return recon_data

    print(f"[+] SpiderFoot reachable at {spiderfoot_url}")

    # Start scan — use Footprint usecase (passive + active fingerprinting)
    project_id = (settings or {}).get("PROJECT_ID", "") or os.getenv("PROJECT_ID", "panda")
    scan_name = f"PandaExploit-{project_id}-{int(time.time())}"

    scan_id = client.start_scan(
        scanname=scan_name,
        scantarget=target,
        usecase="Footprint",
    )

    if not scan_id:
        print("[!] Failed to start SpiderFoot scan")
        recon_data["spiderfoot"] = {"error": "Failed to start scan", "skipped": False}
        return recon_data

    print(f"[+] SpiderFoot scan started — ID: {scan_id}")

    # Poll until finished (up to 15 minutes)
    max_wait = int(os.getenv("SPIDERFOOT_TIMEOUT", "900"))
    poll_interval = 15
    elapsed = 0
    status = "RUNNING"

    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval
        status_info = client.get_scan_status(scan_id)
        if not status_info:
            print(f"  [{elapsed}s] Status check failed — retrying…")
            continue

        # status_info: [name, target, created, started, ended, status, riskmatrix]
        if isinstance(status_info, (list, tuple)) and len(status_info) >= 6:
            status = status_info[5]
        elif isinstance(status_info, dict):
            status = status_info.get("status", "RUNNING")

        print(f"  [{elapsed}s] Status: {status}")

        if status in ("FINISHED", "ERROR-FAILED", "ABORTED"):
            break

    if status not in ("FINISHED",):
        print(f"[!] SpiderFoot scan ended with status: {status}")

    # Retrieve events
    events = client.get_scan_events(scan_id) or []
    print(f"[+] SpiderFoot returned {len(events)} events")

    # Parse events into structured categories
    parsed = _parse_spiderfoot_events(events)
    parsed["scan_id"] = scan_id
    parsed["scan_name"] = scan_name
    parsed["target"] = target
    parsed["status"] = status
    parsed["event_count"] = len(events)

    recon_data["spiderfoot"] = parsed

    # Merge findings back into main recon_data structures
    _merge_spiderfoot_into_recon(recon_data, parsed)

    if output_file:
        with open(output_file, "w") as f:
            json.dump(recon_data, f, indent=2)
        print(f"[+] Recon data saved to {output_file}")

    _print_spiderfoot_summary(parsed)
    return recon_data


# ── Event type → category mappings ────────────────────────────────────────────
# SpiderFoot event types reference: https://github.com/smicallef/spiderfoot/wiki/Event-Types

_EVENT_CATEGORIES = {
    # Subdomains / DNS
    "INTERNET_NAME": "subdomains",
    "INTERNET_NAME_UNRESOLVED": "subdomains",
    "DNS_TEXT": "dns_records",
    "DNS_MX": "dns_records",
    "DNS_NS": "dns_records",
    "DNS_A_RECORD": "ip_addresses",
    # IP addresses / netblocks
    "IP_ADDRESS": "ip_addresses",
    "IPV6_ADDRESS": "ip_addresses",
    "NETBLOCK_OWNER": "netblocks",
    "BGP_AS_OWNER": "asn",
    # Emails / people
    "EMAILADDR": "emails",
    "EMAILADDR_COMPROMISED": "leaked_creds",
    "HUMAN_NAME": "people",
    "USERNAME": "usernames",
    # Credentials / leaks
    "PASSWORD_COMPROMISED": "leaked_creds",
    "ACCOUNT_EXTERNAL_OWNED_COMPROMISED": "leaked_creds",
    "HASH_COMPROMISED": "leaked_creds",
    # Ports / services
    "TCP_PORT_OPEN": "open_ports",
    "TCP_PORT_OPEN_BANNER": "banners",
    "UDP_PORT_OPEN": "open_ports",
    "OPERATING_SYSTEM": "os_info",
    "WEBSERVER_BANNER": "banners",
    # Vulnerabilities
    "VULNERABILITY_CVE_CRITICAL": "vulnerabilities",
    "VULNERABILITY_CVE_HIGH": "vulnerabilities",
    "VULNERABILITY_CVE_MEDIUM": "vulnerabilities",
    "VULNERABILITY_CVE_LOW": "vulnerabilities",
    "VULNERABILITY_GENERAL": "vulnerabilities",
    # Web
    "LINKED_URL_INTERNAL": "urls",
    "LINKED_URL_EXTERNAL": "external_urls",
    "SOCIAL_MEDIA": "social_media",
    "URL_FORM": "web_forms",
    "URL_FILE_LOCATION": "file_urls",
    # Certificates
    "SSL_CERTIFICATE_RAW": "certificates",
    "SSL_CERTIFICATE_ISSUED": "certificates",
    "SSL_CERTIFICATE_MISMATCH": "findings",
    "SSL_CERTIFICATE_EXPIRED": "findings",
    # Geo / org
    "GEOINFO": "geo_info",
    "COMPANY_NAME": "companies",
    "PHONE_NUMBER": "phone_numbers",
    # Cloud
    "CLOUD_STORAGE_OBJECT": "cloud_assets",
    "CLOUD_STORAGE_OBJECT_ACCESSED": "cloud_assets",
    # Misc
    "RAW_FILE": "raw_files",
    "DOMAIN_REGISTRAR": "whois_extras",
    "DOMAIN_REGISTERED": "whois_extras",
    "PROVIDER_MAIL": "providers",
    "PROVIDER_DNS": "providers",
    "PROVIDER_HOSTING": "providers",
}


def _parse_spiderfoot_events(events: list) -> dict:
    """
    Parse SpiderFoot event list into a structured dict by category.

    SpiderFoot /scaneventresults returns each event as a list where:
      index 0  = last updated timestamp
      index 1  = data value
      index 2  = source data
      index 3  = module name
      index 10 = event type string (e.g. "INTERNET_NAME")
    """
    categorized: dict[str, list] = {}
    unknown: list = []

    for evt in events:
        if not isinstance(evt, (list, tuple)) or len(evt) < 11:
            continue
        evt_type = evt[10]
        evt_data = evt[1]

        category = _EVENT_CATEGORIES.get(evt_type)
        if category:
            if category not in categorized:
                categorized[category] = []
            if evt_data not in categorized[category]:
                categorized[category].append(evt_data)
        else:
            unknown.append({"type": evt_type, "data": evt_data})

    return categorized


def _merge_spiderfoot_into_recon(recon_data: dict, spiderfoot: dict) -> None:
    """
    Merge SpiderFoot findings into existing recon_data structures.

    - New subdomains → added to recon_data['subdomains']
    - New IPs → added to existing host records
    - Leaked creds → attached to recon_data['spiderfoot_alerts']
    - Open ports → noted in recon_data for port_scan enrichment
    """
    # Merge subdomains
    if "subdomains" in spiderfoot:
        existing_subs = set()
        for sub in recon_data.get("subdomains", []):
            if isinstance(sub, dict):
                existing_subs.add(sub.get("subdomain", ""))
            elif isinstance(sub, str):
                existing_subs.add(sub)

        added = 0
        for sub in spiderfoot["subdomains"]:
            if sub and sub not in existing_subs:
                recon_data.setdefault("subdomains", []).append({
                    "subdomain": sub,
                    "source": "spiderfoot",
                })
                existing_subs.add(sub)
                added += 1
        if added:
            print(f"[+] SpiderFoot: merged {added} new subdomain(s) into recon data")

    # Add high-value alert for leaked credentials
    leaked = spiderfoot.get("leaked_creds", [])
    if leaked:
        recon_data.setdefault("spiderfoot_alerts", []).extend([
            {"type": "leaked_credential", "data": c} for c in leaked
        ])
        print(f"[!] SpiderFoot: {len(leaked)} LEAKED CREDENTIALS found!")

    # Note new open ports
    if "open_ports" in spiderfoot:
        recon_data.setdefault("spiderfoot_ports", spiderfoot["open_ports"])


def _print_spiderfoot_summary(parsed: dict) -> None:
    print("\n" + "─" * 50)
    print("  SpiderFoot Summary")
    print("─" * 50)

    key_categories = [
        ("subdomains", "Subdomains"),
        ("ip_addresses", "IP Addresses"),
        ("emails", "Email Addresses"),
        ("leaked_creds", "Leaked Credentials ⚠"),
        ("open_ports", "Open Ports"),
        ("vulnerabilities", "Vulnerabilities"),
        ("cloud_assets", "Cloud Assets"),
        ("certificates", "TLS Certificates"),
    ]

    for key, label in key_categories:
        items = parsed.get(key, [])
        if items:
            print(f"  {label}: {len(items)}")

    status = parsed.get("status", "UNKNOWN")
    total = parsed.get("event_count", 0)
    print(f"  Total events: {total}  |  Status: {status}")
    print("─" * 50)
