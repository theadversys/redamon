#!/usr/bin/env python3
"""
Check vulnerabilities in Neo4j for a specific project ID.

Usage:
    python scripts/check_neo4j_vulns.py <project_id>
"""

import sys
import os
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

def check_neo4j_vulnerabilities(project_id: str):
    """Check vulnerabilities in Neo4j database"""
    if not NEO4J_AVAILABLE:
        print("❌ Neo4j driver not available")
        return None
    
    # Get Neo4j connection details from environment or defaults
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
                return None
            
            print(f"✅ Connected to Neo4j at {uri}")
            
            # Query vulnerabilities for this project
            query = """
            MATCH (v:Vulnerability {project_id: $projectId})
            RETURN count(v) as total,
                   collect(DISTINCT v.severity) as severities,
                   collect(DISTINCT v.source) as sources
            """
            
            result = session.run(query, projectId=project_id)
            record = result.single()
            
            if record:
                total = record['total']
                severities = record['severities']
                sources = record['sources']
                
                print(f"\n📊 Vulnerabilities for project_id: {project_id}")
                print(f"   Total: {total}")
                print(f"   Severities: {', '.join(severities) if severities else 'None'}")
                print(f"   Sources: {', '.join(sources) if sources else 'None'}")
                
                if total == 0:
                    # Check if there are any vulnerabilities with null project_id
                    null_query = """
                    MATCH (v:Vulnerability)
                    WHERE v.project_id IS NULL OR v.project_id = ''
                    RETURN count(v) as total
                    """
                    null_result = session.run(null_query)
                    null_record = null_result.single()
                    if null_record and null_record['total'] > 0:
                        print(f"\n⚠️  Found {null_record['total']} vulnerabilities with NULL/empty project_id")
                    
                    # Check all project_ids in vulnerabilities
                    all_projects_query = """
                    MATCH (v:Vulnerability)
                    WHERE v.project_id IS NOT NULL AND v.project_id <> ''
                    RETURN DISTINCT v.project_id as project_id, count(v) as count
                    ORDER BY count DESC
                    LIMIT 10
                    """
                    all_projects_result = session.run(all_projects_query)
                    projects = list(all_projects_result)
                    if projects:
                        print(f"\n📋 Other project_ids found in Neo4j:")
                        for p in projects:
                            print(f"   - {p['project_id']}: {p['count']} vulnerabilities")
                
                return {
                    'total': total,
                    'severities': severities,
                    'sources': sources
                }
            else:
                print("❌ No vulnerabilities found")
                return None
                
    except Exception as e:
        print(f"❌ Error querying Neo4j: {e}")
        return None
    finally:
        driver.close()

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/check_neo4j_vulns.py <project_id>")
        print("Example: python scripts/check_neo4j_vulns.py cmleo8x3j0002lk01z9whiwvc")
        sys.exit(1)
    
    project_id = sys.argv[1]
    check_neo4j_vulnerabilities(project_id)

if __name__ == '__main__':
    main()
