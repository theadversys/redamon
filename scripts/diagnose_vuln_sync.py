#!/usr/bin/env python3
"""
Diagnose why vulnerabilities aren't showing in the UI.

This script checks:
1. What project_id was used when syncing vulnerabilities to Neo4j
2. What project_id the UI is expecting
3. Whether there's a mismatch
"""

import sys
import os
import json
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def check_recon_file(project_id: str):
    """Check the recon file for project_id info"""
    recon_file = PROJECT_ROOT / "recon" / "output" / f"recon_{project_id}.json"
    
    if not recon_file.exists():
        print(f"❌ Recon file not found: {recon_file}")
        return None
    
    print(f"✅ Found recon file: {recon_file}")
    
    with open(recon_file, 'r') as f:
        data = json.load(f)
    
    metadata = data.get('metadata', {})
    
    print(f"\n📋 Recon File Metadata:")
    print(f"   project_id in metadata: {metadata.get('project_id')}")
    print(f"   user_id in metadata: {metadata.get('user_id')}")
    print(f"   target_domain: {metadata.get('target_domain')}")
    print(f"   root_domain: {metadata.get('root_domain')}")
    print(f"   graph_db_vuln_scan_updated: {metadata.get('graph_db_vuln_scan_updated')}")
    
    if metadata.get('graph_db_vuln_scan_stats'):
        stats = metadata['graph_db_vuln_scan_stats']
        print(f"\n📊 Graph Sync Stats:")
        print(f"   vulnerabilities_created: {stats.get('vulnerabilities_created', 0)}")
        print(f"   endpoints_created: {stats.get('endpoints_created', 0)}")
        print(f"   parameters_created: {stats.get('parameters_created', 0)}")
    
    vuln_scan = data.get('vuln_scan', {})
    summary = vuln_scan.get('summary', {})
    print(f"\n🔍 Vulnerability Scan Summary:")
    print(f"   total_findings: {summary.get('total_findings', 0)}")
    print(f"   critical: {summary.get('critical', 0)}")
    print(f"   medium: {summary.get('medium', 0)}")
    
    return {
        'project_id_in_file': metadata.get('project_id'),
        'user_id_in_file': metadata.get('user_id'),
        'vulns_in_file': summary.get('total_findings', 0),
        'vulns_synced': stats.get('vulnerabilities_created', 0) if metadata.get('graph_db_vuln_scan_stats') else 0
    }

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/diagnose_vuln_sync.py <project_id>")
        print("Example: python scripts/diagnose_vuln_sync.py cmleo8x3j0002lk01z9whiwvc")
        sys.exit(1)
    
    project_id = sys.argv[1]
    
    print("=" * 80)
    print(f"🔍 Diagnosing Vulnerability Sync Issue for Project: {project_id}")
    print("=" * 80)
    
    # Check recon file
    file_info = check_recon_file(project_id)
    
    if not file_info:
        print("\n❌ Cannot proceed without recon file")
        sys.exit(1)
    
    print("\n" + "=" * 80)
    print("💡 DIAGNOSIS:")
    print("=" * 80)
    
    if file_info['project_id_in_file'] is None:
        print("⚠️  ISSUE FOUND: project_id is NULL in recon file metadata")
        print("   This means the metadata wasn't updated with the project_id during sync.")
        print("   However, the vulnerabilities were synced using PROJECT_ID from settings.")
        print("\n   The PROJECT_ID used during sync likely came from:")
        print("   - Environment variable PROJECT_ID")
        print("   - Project settings API (if run via orchestrator)")
        print("   - params.py (if run directly)")
        print("\n   To fix: The vulnerabilities in Neo4j should have project_id set correctly,")
        print("   but we need to verify this matches the project_id the UI is using.")
    else:
        print(f"✅ project_id found in metadata: {file_info['project_id_in_file']}")
        if file_info['project_id_in_file'] != project_id:
            print(f"⚠️  MISMATCH: Metadata project_id ({file_info['project_id_in_file']}) != Expected ({project_id})")
    
    print(f"\n📊 Summary:")
    print(f"   Vulnerabilities in JSON file: {file_info['vulns_in_file']}")
    print(f"   Vulnerabilities synced to Neo4j: {file_info['vulns_synced']}")
    
    if file_info['vulns_in_file'] > 0 and file_info['vulns_synced'] == 0:
        print("\n❌ PROBLEM: Vulnerabilities exist in JSON but none were synced!")
    elif file_info['vulns_synced'] > 0:
        print(f"\n✅ Vulnerabilities were synced ({file_info['vulns_synced']} created)")
        print("   If they're not showing in UI, check:")
        print("   1. The project_id in Neo4j matches the project_id the UI is querying")
        print("   2. Neo4j is accessible from the webapp")
        print("   3. The UI projectId matches the PROJECT_ID used during sync")
    
    print("\n" + "=" * 80)
    print("🔧 RECOMMENDED FIX:")
    print("=" * 80)
    print("If vulnerabilities aren't showing, try:")
    print("1. Re-sync vulnerabilities with the correct project_id:")
    print(f"   python -m graph_db.update_graph_from_json")
    print("   (Make sure PROJECT_ID in params.py or env matches: {project_id})")
    print("\n2. Or manually update the recon file metadata:")
    print(f"   jq '.metadata.project_id = \"{project_id}\"' recon/output/recon_{project_id}.json > tmp.json")
    print(f"   mv tmp.json recon/output/recon_{project_id}.json")
    print("\n3. Then re-run the graph update script")

if __name__ == '__main__':
    main()
