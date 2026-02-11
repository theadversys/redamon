#!/usr/bin/env python3
"""
Check vulnerabilities found for a specific domain/target.

Usage:
    python scripts/check_vulnerabilities.py <domain>
    python scripts/check_vulnerabilities.py testphp.vulnweb.com
"""

import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from graph_db import Neo4jClient
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False
    print("Warning: Neo4j client not available. Will only check JSON files.")

def check_neo4j_vulnerabilities(domain: str):
    """Check vulnerabilities in Neo4j database"""
    if not NEO4J_AVAILABLE:
        return None
    
    try:
        with Neo4jClient() as client:
            if not client.verify_connection():
                print("❌ Could not connect to Neo4j")
                return None
            
            # Query vulnerabilities linked to the domain or subdomain
            query = """
            MATCH (d:Domain {name: $domain})
            OPTIONAL MATCH (d)-[:HAS_SUBDOMAIN]->(s:Subdomain)
            OPTIONAL MATCH (s)-[:HAS_VULNERABILITY]->(v:Vulnerability)
            OPTIONAL MATCH (d)-[:HAS_VULNERABILITY]->(vd:Vulnerability)
            OPTIONAL MATCH (s)-[:RESOLVES_TO]->(i:IP)-[:HAS_VULNERABILITY]->(vi:Vulnerability)
            OPTIONAL MATCH (s)<-[:BELONGS_TO]-(b:BaseURL)-[:HAS_VULNERABILITY]->(vb:Vulnerability)
            OPTIONAL MATCH (b)-[:HAS_ENDPOINT]->(e:Endpoint)<-[:FOUND_AT]-(ve:Vulnerability)
            
            WITH collect(DISTINCT v) + collect(DISTINCT vd) + collect(DISTINCT vi) + 
                 collect(DISTINCT vb) + collect(DISTINCT ve) as all_vulns
            
            UNWIND all_vulns as vuln
            WHERE vuln IS NOT NULL
            
            RETURN DISTINCT vuln
            ORDER BY 
              CASE vuln.severity
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                WHEN 'low' THEN 4
                ELSE 5
              END,
              vuln.cvss_score DESC
            LIMIT 100
            """
            
            result = client.driver.session().run(query, {"domain": domain})
            vulnerabilities = []
            
            for record in result:
                vuln = record.get('vuln')
                if vuln:
                    props = vuln.properties
                    vulnerabilities.append({
                        'id': props.get('id'),
                        'name': props.get('name') or props.get('template_id', 'Unknown'),
                        'severity': props.get('severity', 'info'),
                        'source': props.get('source', 'unknown'),
                        'category': props.get('category'),
                        'cvss_score': props.get('cvss_score'),
                        'url': props.get('url'),
                        'description': props.get('description'),
                    })
            
            return vulnerabilities
    except Exception as e:
        print(f"❌ Error querying Neo4j: {e}")
        return None

def check_recon_files(domain: str):
    """Check recon output JSON files for vulnerabilities"""
    recon_output = PROJECT_ROOT / "recon" / "output"
    
    if not recon_output.exists():
        return []
    
    vulnerabilities = []
    
    # Search for recon files
    for recon_file in recon_output.glob("recon_*.json"):
        try:
            import json
            with open(recon_file, 'r') as f:
                data = json.load(f)
            
            # Check if this file is for our domain
            metadata = data.get('metadata', {})
            target_domain = metadata.get('target_domain', '')
            
            if domain.lower() not in target_domain.lower() and target_domain.lower() not in domain.lower():
                continue
            
            # Extract vulnerabilities from vuln_scan results
            vuln_scan = data.get('vuln_scan', {})
            if vuln_scan:
                findings = vuln_scan.get('findings', [])
                for finding in findings:
                    vulnerabilities.append({
                        'name': finding.get('name', 'Unknown'),
                        'severity': finding.get('severity', 'info'),
                        'source': 'nuclei',
                        'category': finding.get('category'),
                        'cvss_score': finding.get('cvss_score'),
                        'url': finding.get('matched_at'),
                        'template_id': finding.get('template_id'),
                    })
            
            # Also check technology_cves
            tech_cves = data.get('technology_cves', {})
            if tech_cves:
                by_tech = tech_cves.get('by_technology', {})
                for tech_name, tech_data in by_tech.items():
                    cves = tech_data.get('cves', [])
                    for cve in cves:
                        vulnerabilities.append({
                            'name': cve.get('id', 'Unknown CVE'),
                            'severity': cve.get('severity', 'info'),
                            'source': 'nvd',
                            'cvss_score': cve.get('cvss'),
                            'technology': tech_name,
                        })
        
        except Exception as e:
            print(f"⚠️  Error reading {recon_file}: {e}")
            continue
    
    return vulnerabilities

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/check_vulnerabilities.py <domain>")
        print("Example: python scripts/check_vulnerabilities.py testphp.vulnweb.com")
        sys.exit(1)
    
    domain = sys.argv[1]
    print(f"\n🔍 Checking vulnerabilities for: {domain}\n")
    print("=" * 80)
    
    # Check Neo4j
    print("\n📊 Checking Neo4j Database...")
    neo4j_vulns = check_neo4j_vulnerabilities(domain)
    
    if neo4j_vulns is not None:
        if neo4j_vulns:
            print(f"✅ Found {len(neo4j_vulns)} vulnerabilities in Neo4j\n")
            for i, vuln in enumerate(neo4j_vulns[:20], 1):  # Show first 20
                severity = vuln.get('severity', 'info').upper()
                source = vuln.get('source', 'unknown')
                name = vuln.get('name', 'Unknown')
                cvss = vuln.get('cvss_score', 0)
                url = vuln.get('url', '')
                
                print(f"{i}. [{severity}] {name}")
                print(f"   Source: {source} | CVSS: {cvss} | URL: {url}")
                if vuln.get('description'):
                    desc = vuln['description'][:100] + '...' if len(vuln['description']) > 100 else vuln['description']
                    print(f"   {desc}")
                print()
            
            if len(neo4j_vulns) > 20:
                print(f"   ... and {len(neo4j_vulns) - 20} more vulnerabilities\n")
        else:
            print("❌ No vulnerabilities found in Neo4j for this domain\n")
    
    # Check JSON files
    print("\n📁 Checking Recon Output Files...")
    json_vulns = check_recon_files(domain)
    
    if json_vulns:
        print(f"✅ Found {len(json_vulns)} vulnerabilities in JSON files\n")
        for i, vuln in enumerate(json_vulns[:20], 1):  # Show first 20
            severity = vuln.get('severity', 'info').upper()
            source = vuln.get('source', 'unknown')
            name = vuln.get('name', 'Unknown')
            cvss = vuln.get('cvss_score', 0)
            
            print(f"{i}. [{severity}] {name}")
            print(f"   Source: {source} | CVSS: {cvss}")
            if vuln.get('url'):
                print(f"   URL: {vuln['url']}")
            if vuln.get('technology'):
                print(f"   Technology: {vuln['technology']}")
            print()
        
        if len(json_vulns) > 20:
            print(f"   ... and {len(json_vulns) - 20} more vulnerabilities\n")
    else:
        print("❌ No vulnerabilities found in JSON files\n")
    
    # Summary
    print("=" * 80)
    total = len(neo4j_vulns or []) + len(json_vulns)
    if total > 0:
        print(f"\n✅ Total vulnerabilities found: {total}")
        print("\n💡 View in UI:")
        print(f"   - Go to Vulnerabilities page in the webapp")
        print(f"   - Or visit: http://localhost:3000/vulnerabilities")
    else:
        print("\n❌ No vulnerabilities found for this domain")
        print("\n💡 Possible reasons:")
        print("   - Vulnerability scan hasn't completed yet")
        print("   - Scan was skipped (no live HTTP targets found)")
        print("   - No vulnerabilities were discovered")
        print("   - Project ID doesn't match this domain")

if __name__ == '__main__':
    main()
