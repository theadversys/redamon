"""
Passive Recon Module — Shodan & Censys API Integration

Enriches recon data with internet-wide scan data from Shodan and Censys
without touching the target (true passive recon).

Controlled by presence of SHODAN_API_KEY / CENSYS_API_ID+CENSYS_API_SECRET env vars.
Neither key is required — the module gracefully skips unavailable sources.

Usage:
    from recon.passive_recon import run_passive_recon
    recon_data = run_passive_recon(recon_data, target, ip_addresses, output_file)
"""

import os
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def run_passive_recon(
    recon_data: dict,
    target: str,
    ip_addresses: Optional[list] = None,
    output_file: Optional[Path] = None,
    settings: Optional[dict] = None,
) -> dict:
    """
    Enrich recon_data with Shodan and Censys findings (no active scanning).

    Queries Shodan and/or Censys for:
    - Open ports and services on discovered IPs
    - Banner information and product versions
    - Known vulnerabilities (Shodan)
    - TLS certificate SANs (Censys — excellent subdomain discovery)
    - ASN / hosting provider info

    Args:
        recon_data: Existing recon dict (modified in-place)
        target: Root domain (used for Censys cert search)
        ip_addresses: List of IPs to query (extracted from recon_data if omitted)
        output_file: Optional path to persist updated recon_data
        settings: Project settings dict

    Returns:
        recon_data enriched with 'passive_recon' key.
    """
    shodan_key = os.getenv("SHODAN_API_KEY", "")
    censys_id = os.getenv("CENSYS_API_ID", "")
    censys_secret = os.getenv("CENSYS_API_SECRET", "")

    if not shodan_key and not (censys_id and censys_secret):
        print("\n[*] Passive Recon (Shodan/Censys): SKIPPED (no API keys configured)")
        return recon_data

    print("\n" + "=" * 60)
    print("    PandaExploit - Passive Recon (Shodan/Censys)")
    print("=" * 60)
    print(f"  Target: {target}")
    if shodan_key:
        print("  Sources: Shodan ✓", end="")
    if censys_id and censys_secret:
        print("  Censys ✓", end="")
    print()

    passive: dict = {"target": target, "shodan": {}, "censys": {}}

    # Extract IPs from recon_data if not provided
    if not ip_addresses:
        ip_addresses = _extract_ips(recon_data)
    print(f"  IPs to query: {len(ip_addresses)}")

    # ── Shodan ────────────────────────────────────────────────────────────────
    if shodan_key:
        passive["shodan"] = _run_shodan(shodan_key, target, ip_addresses)

    # ── Censys ────────────────────────────────────────────────────────────────
    if censys_id and censys_secret:
        passive["censys"] = _run_censys(censys_id, censys_secret, target, ip_addresses)

    recon_data["passive_recon"] = passive
    _merge_passive_into_recon(recon_data, passive)

    if output_file:
        with open(output_file, "w") as f:
            json.dump(recon_data, f, indent=2)
        print(f"[+] Passive recon results saved to {output_file}")

    _print_passive_summary(passive)
    return recon_data


# ── Shodan integration ─────────────────────────────────────────────────────────

def _run_shodan(api_key: str, target: str, ip_addresses: list) -> dict:
    """Query Shodan for domain and IP information."""
    try:
        import shodan
    except ImportError:
        print("[!] Shodan library not installed — run: pip install shodan")
        return {"error": "shodan library not installed"}

    api = shodan.Shodan(api_key)
    results: dict = {"hosts": {}, "domain": {}, "vulnerabilities": [], "open_ports": []}

    # Domain search (DNS/reverse records, subdomains from Shodan)
    try:
        domain_info = api.search_domain(target)
        if domain_info:
            subdomains = domain_info.get("subdomains", [])
            results["domain"]["subdomains"] = subdomains
            results["domain"]["tags"] = domain_info.get("tags", [])
            print(f"  [Shodan] Domain: {len(subdomains)} subdomains found")
    except shodan.exception.APIError as e:
        logger.warning(f"Shodan domain search failed: {e}")
        results["domain"]["error"] = str(e)

    # Per-IP host info (up to 10 IPs to stay within rate limits)
    for ip in ip_addresses[:10]:
        try:
            host = api.host(ip)
            host_summary = {
                "ip": ip,
                "hostnames": host.get("hostnames", []),
                "ports": host.get("ports", []),
                "os": host.get("os"),
                "country": host.get("country_name"),
                "org": host.get("org"),
                "isp": host.get("isp"),
                "asn": host.get("asn"),
                "vulns": list(host.get("vulns", {}).keys()),
                "last_update": host.get("last_update"),
                "services": [],
            }
            # Extract service banners
            for service in host.get("data", []):
                svc = {
                    "port": service.get("port"),
                    "transport": service.get("transport", "tcp"),
                    "product": service.get("product"),
                    "version": service.get("version"),
                    "banner": (service.get("data", "") or "")[:200],
                    "cpe": service.get("cpe", []),
                }
                host_summary["services"].append(svc)
                port_str = f"{ip}:{service.get('port')}/{service.get('transport', 'tcp')}"
                if port_str not in results["open_ports"]:
                    results["open_ports"].append(port_str)

            # Collect CVEs
            for cve in host_summary["vulns"]:
                if cve not in results["vulnerabilities"]:
                    results["vulnerabilities"].append(cve)

            results["hosts"][ip] = host_summary
            print(f"  [Shodan] {ip}: {len(host.get('ports', []))} ports, {len(host_summary['vulns'])} CVEs")

        except shodan.exception.APIError as e:
            results["hosts"][ip] = {"error": str(e)}
            logger.debug(f"Shodan host lookup failed for {ip}: {e}")

    return results


# ── Censys integration ─────────────────────────────────────────────────────────

def _run_censys(api_id: str, api_secret: str, target: str, ip_addresses: list) -> dict:
    """Query Censys for certificate SANs (subdomain discovery) and IP info."""
    try:
        from censys.search import CensysHosts, CensysCerts
        from censys.common.exceptions import CensysRateLimitExceededException, CensysNotFoundException
    except ImportError:
        print("[!] Censys library not installed — run: pip install censys")
        return {"error": "censys library not installed"}

    os.environ["CENSYS_API_ID"] = api_id
    os.environ["CENSYS_API_SECRET"] = api_secret

    results: dict = {"subdomains": [], "hosts": {}, "certificates": []}

    # Certificate search — excellent for subdomain discovery via SANs
    try:
        certs = CensysCerts()
        query = f"parsed.names: {target}"
        cert_results = list(certs.search(query, fields=["parsed.names", "parsed.subject_dn", "parsed.issuer.organization"], max_records=100))
        subdomains_from_certs = set()
        for cert in cert_results:
            names = cert.get("parsed.names", [])
            for name in names:
                name = name.lstrip("*.")
                if name.endswith(f".{target}") or name == target:
                    subdomains_from_certs.add(name)
            # Store cert info
            results["certificates"].append({
                "subject_dn": cert.get("parsed.subject_dn", ""),
                "issuer": cert.get("parsed.issuer.organization", []),
                "names": names[:20],
            })
        results["subdomains"] = sorted(subdomains_from_certs)
        print(f"  [Censys] Certs: {len(subdomains_from_certs)} subdomains from certificates")
    except Exception as e:
        logger.warning(f"Censys cert search failed: {e}")
        results["certificates_error"] = str(e)

    # Per-IP host info (up to 10)
    try:
        hosts = CensysHosts()
        for ip in ip_addresses[:10]:
            try:
                host = hosts.view(ip)
                host_summary = {
                    "ip": ip,
                    "last_seen": host.get("last_updated_at"),
                    "autonomous_system": host.get("autonomous_system", {}),
                    "services": [],
                }
                for service in host.get("services", []):
                    svc = {
                        "port": service.get("port"),
                        "transport": service.get("transport_protocol", "TCP"),
                        "service_name": service.get("service_name"),
                        "product": service.get("software", [{}])[0].get("product") if service.get("software") else None,
                        "cert_names": [],
                    }
                    # Extract TLS cert SANs
                    tls = service.get("tls", {})
                    if tls:
                        cert = tls.get("certificates", {}).get("leaf_data", {})
                        names = cert.get("names", [])
                        svc["cert_names"] = names[:10]
                    host_summary["services"].append(svc)
                results["hosts"][ip] = host_summary
                print(f"  [Censys] {ip}: {len(host.get('services', []))} services")
            except CensysNotFoundException:
                results["hosts"][ip] = {"error": "Not found in Censys"}
            except CensysRateLimitExceededException:
                print("  [Censys] Rate limit hit — stopping IP queries")
                break
            except Exception as e:
                results["hosts"][ip] = {"error": str(e)}
    except Exception as e:
        logger.warning(f"Censys hosts init failed: {e}")
        results["hosts_error"] = str(e)

    return results


# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_ips(recon_data: dict) -> list:
    """Extract all discovered IP addresses from recon_data."""
    ips = set()
    # From subdomains
    for sub in recon_data.get("subdomains", []):
        if isinstance(sub, dict):
            ip = sub.get("ip") or sub.get("resolved_ip") or sub.get("address")
            if ip and ip != "N/A":
                ips.add(ip)
    # From port_scan
    for host_key, host_data in recon_data.get("port_scan", {}).get("by_host", {}).items():
        if host_key and host_key != "summary":
            ips.add(host_key)
    # From http_probe
    for url_key, url_data in recon_data.get("http_probe", {}).get("by_url", {}).items():
        ip = (url_data or {}).get("ip")
        if ip:
            ips.add(ip)
    return list(ips)


def _merge_passive_into_recon(recon_data: dict, passive: dict) -> None:
    """Merge passive recon findings back into main recon_data structures."""
    existing_subs = set()
    for sub in recon_data.get("subdomains", []):
        if isinstance(sub, dict):
            existing_subs.add(sub.get("subdomain", ""))
        elif isinstance(sub, str):
            existing_subs.add(sub)

    added = 0
    # Shodan subdomains
    for sub in passive.get("shodan", {}).get("domain", {}).get("subdomains", []):
        full = f"{sub}.{passive['target']}" if not sub.endswith(passive["target"]) else sub
        if full not in existing_subs:
            recon_data.setdefault("subdomains", []).append({"subdomain": full, "source": "shodan"})
            existing_subs.add(full)
            added += 1

    # Censys subdomains
    for sub in passive.get("censys", {}).get("subdomains", []):
        if sub not in existing_subs:
            recon_data.setdefault("subdomains", []).append({"subdomain": sub, "source": "censys"})
            existing_subs.add(sub)
            added += 1

    if added:
        print(f"[+] Passive recon: merged {added} new subdomain(s) into recon data")

    # Merge Shodan CVEs into vuln_scan
    shodan_vulns = passive.get("shodan", {}).get("vulnerabilities", [])
    if shodan_vulns:
        vuln_section = recon_data.setdefault("vuln_scan", {})
        existing_vulns = set(v.get("cve_id", "") for v in vuln_section.get("vulnerabilities", []))
        for cve in shodan_vulns:
            if cve not in existing_vulns:
                vuln_section.setdefault("vulnerabilities", []).append({
                    "cve_id": cve,
                    "source": "shodan_passive",
                })
        print(f"[+] Passive recon: merged {len(shodan_vulns)} Shodan CVEs into vuln data")


def _print_passive_summary(passive: dict) -> None:
    print("\n" + "─" * 50)
    print("  Passive Recon Summary")
    print("─" * 50)

    shodan = passive.get("shodan", {})
    censys = passive.get("censys", {})

    if shodan and "error" not in shodan:
        hosts = len(shodan.get("hosts", {}))
        vulns = len(shodan.get("vulnerabilities", []))
        ports = len(shodan.get("open_ports", []))
        subs = len(shodan.get("domain", {}).get("subdomains", []))
        print(f"  Shodan — Hosts: {hosts}, Ports: {ports}, CVEs: {vulns}, Subdomains: {subs}")
    elif shodan.get("error"):
        print(f"  Shodan — Error: {shodan['error']}")

    if censys and "error" not in censys:
        subs = len(censys.get("subdomains", []))
        certs = len(censys.get("certificates", []))
        hosts = len(censys.get("hosts", {}))
        print(f"  Censys — Subdomains from certs: {subs}, Certs: {certs}, Hosts: {hosts}")
    elif censys.get("error"):
        print(f"  Censys — Error: {censys['error']}")

    print("─" * 50)
