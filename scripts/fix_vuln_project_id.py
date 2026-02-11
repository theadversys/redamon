#!/usr/bin/env python3
"""
Fix project_id on vulnerabilities in Neo4j.

This script can:
1. Check what project_id vulnerabilities currently have
2. Update vulnerabilities to use the correct project_id
3. Help diagnose mismatches

Usage:
    python scripts/fix_vuln_project_id.py <correct_project_id> [--check-only]
    python scripts/fix_vuln_project_id.py cmleo8x3j0002lk01z9whiwvc --check-only
"""

import sys
import os
import argparse
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from neo4j import GraphDatabase
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False
    print("Warning: neo4j driver not available. Install with: pip install neo4j")

def check_neo4j_vulnerabilities(project_id: str, check_only: bool = False):
    """Check and optionally fix project_id on vulnerabilities"""
    if not NEO4J_AVAILABLE:
        print("❌ Neo4j driver not available")
        return False
    
    # Get Neo4j connection details
    uri = os.getenv('NEO4J_URI', 'bolt://localhost:7687')
    user = os.getenv('NEO4J_USER', 'neo4j')
    password = os.getenv('NEO4J_PASSWORD', 'password')
    
    try:
        driver = GraphDatabase.driver(uri, auth=(user, password))
        
        with driver.session() as session:
            # Check connection
            result = session.run("RETURN 1 as test")
            if not result.single():
                print("❌ Could not connect to Neo4j")
                return False
            
            print(f"✅ Connected to Neo4j at {uri}\n")
            
            # Check vulnerabilities with different project_ids
            query = """
            MATCH (v:Vulnerability)
            WHERE v.project_id IS NOT NULL AND v.project_id <> ''
            RETURN DISTINCT v.project_id as project_id, count(v) as count
            ORDER BY count DESC
            """
            
            result = session.run(query)
            projects = list(result)
            
            print("📊 Vulnerabilities by project_id in Neo4j:")
            if projects:
                for p in projects:
                    pid = p['project_id']
                    count = p['count']
                    match = "✅" if pid == project_id else "❌"
                    print(f"   {match} {pid}: {count} vulnerabilities")
            else:
                print("   ⚠️  No vulnerabilities found with project_id set")
            
            # Check vulnerabilities with NULL/empty project_id
            null_query = """
            MATCH (v:Vulnerability)
            WHERE v.project_id IS NULL OR v.project_id = ''
            RETURN count(v) as count
            """
            null_result = session.run(null_query)
            null_record = null_result.single()
            if null_record and null_record['count'] > 0:
                print(f"\n⚠️  Found {null_record['count']} vulnerabilities with NULL/empty project_id")
            
            # Check vulnerabilities for the target project_id
            target_query = """
            MATCH (v:Vulnerability {project_id: $projectId})
            RETURN count(v) as total,
                   collect(DISTINCT v.severity) as severities,
                   collect(DISTINCT v.source) as sources
            """
            
            target_result = session.run(target_query, projectId=project_id)
            target_record = target_result.single()
            
            if target_record:
                total = target_record['total']
                severities = target_record['severities']
                sources = target_record['sources']
                
                print(f"\n📋 Vulnerabilities for project_id '{project_id}':")
                print(f"   Total: {total}")
                print(f"   Severities: {', '.join(severities) if severities else 'None'}")
                print(f"   Sources: {', '.join(sources) if sources else 'None'}")
                
                if total == 0:
                    print(f"\n❌ PROBLEM: No vulnerabilities found with project_id '{project_id}'")
                    print("   This is why they're not showing in the UI!")
                    
                    if not check_only:
                        # Find vulnerabilities that might belong to this project
                        # Check by domain name or other criteria
                        print("\n🔍 Searching for vulnerabilities that might belong to this project...")
                        
                        # Try to find vulnerabilities linked to domains/subdomains with this project_id
                        domain_query = """
                        MATCH (d:Domain {project_id: $projectId})
                        OPTIONAL MATCH (d)-[:HAS_SUBDOMAIN]->(s:Subdomain)
                        OPTIONAL MATCH (s)-[:HAS_VULNERABILITY]->(v:Vulnerability)
                        OPTIONAL MATCH (d)-[:HAS_VULNERABILITY]->(vd:Vulnerability)
                        WITH collect(DISTINCT v) + collect(DISTINCT vd) as all_vulns
                        UNWIND all_vulns as vuln
                        WHERE vuln IS NOT NULL
                        RETURN count(DISTINCT vuln) as count
                        """
                        domain_result = session.run(domain_query, projectId=project_id)
                        domain_record = domain_result.single()
                        if domain_record and domain_record['count'] > 0:
                            print(f"   Found {domain_record['count']} vulnerabilities linked to Domain/Subdomain nodes")
                            print("   These vulnerabilities might have a different project_id")
                else:
                    print(f"\n✅ Found {total} vulnerabilities with correct project_id")
                    print("   They should be visible in the UI!")
                    return True
            else:
                print(f"\n❌ No vulnerabilities found for project_id '{project_id}'")
            
            if not check_only and total == 0:
                print("\n" + "=" * 80)
                print("🔧 FIX OPTIONS:")
                print("=" * 80)
                print("To fix this, you can:")
                print("1. Re-sync vulnerabilities using update_graph_from_json.py")
                print("   Make sure PROJECT_ID is set correctly before running")
                print(f"   export PROJECT_ID={project_id}")
                print("   python -m graph_db.update_graph_from_json")
                print("\n2. Or manually update project_id in Neo4j (if you know which vulnerabilities")
                print("   belong to this project)")
                
        return False
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        driver.close()

def main():
    parser = argparse.ArgumentParser(description='Check/fix project_id on vulnerabilities in Neo4j')
    parser.add_argument('project_id', help='The correct project_id to check/fix')
    parser.add_argument('--check-only', action='store_true', help='Only check, do not suggest fixes')
    args = parser.parse_args()
    
    print("=" * 80)
    print(f"🔍 Checking Vulnerabilities for Project: {args.project_id}")
    print("=" * 80)
    
    check_neo4j_vulnerabilities(args.project_id, args.check_only)

if __name__ == '__main__':
    main()
