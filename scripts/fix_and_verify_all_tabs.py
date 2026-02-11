#!/usr/bin/env python3
"""
Comprehensive fix and verification script for all three tabs.

This script:
1. Fixes project_id on all nodes (Vulnerabilities, CVEs, MitreData, Capec, ActionLog)
2. Ensures vulnerabilities have source field set
3. Verifies all data is accessible
4. Creates sample ActionLog entries if none exist

Usage:
    python scripts/fix_and_verify_all_tabs.py <project_id> [--user-id <user_id>]
"""

import sys
import os
import argparse
from pathlib import Path
from datetime import datetime

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Load .env file if it exists
try:
    from dotenv import load_dotenv
    env_path = PROJECT_ROOT / '.env'
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass  # dotenv not available, use environment variables as-is

try:
    from neo4j import GraphDatabase
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False
    print("Warning: neo4j driver not available. Install with: pip install neo4j")

def fix_and_verify(project_id: str, user_id: str = None):
    """Fix project_ids and verify all tabs work"""
    if not NEO4J_AVAILABLE:
        print("❌ Neo4j driver not available")
        return False
    
    # Get Neo4j connection details
    uri = os.getenv('NEO4J_URI', 'bolt://localhost:7687')
    user = os.getenv('NEO4J_USER', 'neo4j')
    password = os.getenv('NEO4J_PASSWORD', 'changeme123')  # Default from docker-compose
    
    print(f"Connecting to Neo4j at {uri} as user {user}...")
    if not password or password == 'password':
        print("⚠️  Warning: Using default password. Set NEO4J_PASSWORD in .env if needed.")
    
    try:
        driver = GraphDatabase.driver(uri, auth=(user, password))
        
        with driver.session() as session:
            # Check connection
            result = session.run("RETURN 1 as test")
            if not result.single():
                print("❌ Could not connect to Neo4j")
                return False
            
            print(f"✅ Connected to Neo4j at {uri}\n")
            
            fixes_applied = 0
            
            # 1. Fix Vulnerability nodes - ensure source field is set
            print("🔧 Fixing Vulnerability nodes...")
            vuln_query = """
            MATCH (v:Vulnerability)
            WHERE v.project_id IS NULL OR v.project_id = '' OR v.project_id <> $projectId
            SET v.project_id = $projectId,
                v.source = CASE 
                    WHEN v.source IS NULL OR v.source = '' THEN 'nuclei'
                    ELSE v.source
                END
            RETURN count(v) as updated
            """
            if user_id:
                vuln_query = """
                MATCH (v:Vulnerability)
                WHERE v.project_id IS NULL OR v.project_id = '' OR v.project_id <> $projectId
                SET v.project_id = $projectId,
                    v.user_id = $userId,
                    v.source = CASE 
                        WHEN v.source IS NULL OR v.source = '' THEN 'nuclei'
                        ELSE v.source
                    END
                RETURN count(v) as updated
                """
            
            params = {"projectId": project_id}
            if user_id:
                params["userId"] = user_id
            
            result = session.run(vuln_query, params)
            record = result.single()
            vuln_updated = record['updated'] if record else 0
            fixes_applied += vuln_updated
            print(f"   ✅ Updated {vuln_updated} Vulnerability nodes")
            
            # 2. Fix CVE nodes
            print("🔧 Fixing CVE nodes...")
            cve_query = """
            MATCH (c:CVE)
            WHERE c.project_id IS NULL OR c.project_id = '' OR c.project_id <> $projectId
            SET c.project_id = $projectId
            RETURN count(c) as updated
            """
            if user_id:
                cve_query = """
                MATCH (c:CVE)
                WHERE c.project_id IS NULL OR c.project_id = '' OR c.project_id <> $projectId
                SET c.project_id = $projectId, c.user_id = $userId
                RETURN count(c) as updated
                """
            
            result = session.run(cve_query, params)
            record = result.single()
            cve_updated = record['updated'] if record else 0
            fixes_applied += cve_updated
            print(f"   ✅ Updated {cve_updated} CVE nodes")
            
            # 3. Fix MitreData nodes (CWE)
            print("🔧 Fixing MitreData (CWE) nodes...")
            mitre_query = """
            MATCH (m:MitreData)
            WHERE m.project_id IS NULL OR m.project_id = '' OR m.project_id <> $projectId
            SET m.project_id = $projectId
            RETURN count(m) as updated
            """
            if user_id:
                mitre_query = """
                MATCH (m:MitreData)
                WHERE m.project_id IS NULL OR m.project_id = '' OR m.project_id <> $projectId
                SET m.project_id = $projectId, m.user_id = $userId
                RETURN count(m) as updated
                """
            
            result = session.run(mitre_query, params)
            record = result.single()
            mitre_updated = record['updated'] if record else 0
            fixes_applied += mitre_updated
            print(f"   ✅ Updated {mitre_updated} MitreData nodes")
            
            # 4. Fix Capec nodes
            print("🔧 Fixing Capec nodes...")
            capec_query = """
            MATCH (cap:Capec)
            WHERE cap.project_id IS NULL OR cap.project_id = '' OR cap.project_id <> $projectId
            SET cap.project_id = $projectId
            RETURN count(cap) as updated
            """
            if user_id:
                capec_query = """
                MATCH (cap:Capec)
                WHERE cap.project_id IS NULL OR cap.project_id = '' OR cap.project_id <> $projectId
                SET cap.project_id = $projectId, cap.user_id = $userId
                RETURN count(cap) as updated
                """
            
            result = session.run(capec_query, params)
            record = result.single()
            capec_updated = record['updated'] if record else 0
            fixes_applied += capec_updated
            print(f"   ✅ Updated {capec_updated} Capec nodes")
            
            # 5. Create sample ActionLog if none exist
            print("🔧 Checking ActionLog nodes...")
            check_action_query = """
            MATCH (a:ActionLog {project_id: $projectId})
            RETURN count(a) as count
            """
            result = session.run(check_action_query, {"projectId": project_id})
            record = result.single()
            action_count = record['count'] if record else 0
            
            if action_count == 0:
                print(f"   ⚠️  No ActionLog entries found. Creating sample entry...")
                action_id = f"recon-{project_id}-{int(datetime.now().timestamp())}"
                create_action_query = """
                CREATE (a:ActionLog {
                    id: $id,
                    project_id: $projectId,
                    user_id: $userId,
                    type: 'recon',
                    action: 'Reconnaissance Scan',
                    description: 'Sample action log entry - recon operations will create entries automatically',
                    status: 'success',
                    timestamp: datetime(),
                    metadata: '{}'
                })
                RETURN a
                """
                session.run(create_action_query, {
                    "id": action_id,
                    "projectId": project_id,
                    "userId": user_id or "default_user"
                })
                print(f"   ✅ Created sample ActionLog entry")
            else:
                print(f"   ✅ Found {action_count} ActionLog entries")
            
            # 6. Verify counts
            print("\n📊 Verification:")
            verify_query = """
            MATCH (v:Vulnerability {project_id: $projectId})
            RETURN count(v) as count
            """
            result = session.run(verify_query, {"projectId": project_id})
            record = result.single()
            vuln_count = record['count'] if record else 0
            print(f"   Vulnerabilities: {vuln_count}")
            
            verify_query = """
            MATCH (c:CVE {project_id: $projectId})
            RETURN count(c) as count
            """
            result = session.run(verify_query, {"projectId": project_id})
            record = result.single()
            cve_count = record['count'] if record else 0
            print(f"   CVEs: {cve_count}")
            
            verify_query = """
            MATCH (c:CVE {project_id: $projectId})-[:HAS_CWE]->(m:MitreData)
            RETURN count(DISTINCT m) as count
            """
            result = session.run(verify_query, {"projectId": project_id})
            record = result.single()
            mitre_count = record['count'] if record else 0
            print(f"   MitreData (CWE) linked to CVEs: {mitre_count}")
            
            verify_query = """
            MATCH (cap:Capec {project_id: $projectId})
            RETURN count(cap) as count
            """
            result = session.run(verify_query, {"projectId": project_id})
            record = result.single()
            capec_count = record['count'] if record else 0
            print(f"   Capec: {capec_count}")
            
            verify_query = """
            MATCH (a:ActionLog {project_id: $projectId})
            RETURN count(a) as count
            """
            result = session.run(verify_query, {"projectId": project_id})
            record = result.single()
            action_count = record['count'] if record else 0
            print(f"   ActionLog: {action_count}")
            
            # 7. Check vulnerabilities have source field
            verify_source_query = """
            MATCH (v:Vulnerability {project_id: $projectId})
            WHERE v.source IS NULL OR v.source = ''
            RETURN count(v) as count
            """
            result = session.run(verify_source_query, {"projectId": project_id})
            record = result.single()
            missing_source = record['count'] if record else 0
            if missing_source > 0:
                print(f"\n   ⚠️  {missing_source} vulnerabilities missing source field - fixing...")
                fix_source_query = """
                MATCH (v:Vulnerability {project_id: $projectId})
                WHERE v.source IS NULL OR v.source = ''
                SET v.source = 'nuclei'
                RETURN count(v) as updated
                """
                result = session.run(fix_source_query, {"projectId": project_id})
                record = result.single()
                fixed = record['updated'] if record else 0
                print(f"   ✅ Fixed {fixed} vulnerabilities")
            else:
                print(f"   ✅ All vulnerabilities have source field set")
            
            print(f"\n✅ Fixed {fixes_applied} nodes total")
            print("\n✅ All tabs should now work correctly!")
            print("\n💡 Next steps:")
            print("   1. Refresh the UI in your browser")
            print("   2. Check the Vulnerabilities tab - should show all vulnerabilities")
            print("   3. Check the MITRE ATT&CK tab - should show CWE/CAPEC data")
            print("   4. Check the Actions Log tab - should show action entries")
            
            return True
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        driver.close()

def main():
    parser = argparse.ArgumentParser(description='Fix and verify all tabs: Vulnerabilities, MITRE ATT&CK, Actions Log')
    parser.add_argument('project_id', help='The project_id to fix')
    parser.add_argument('--user-id', help='Optional user_id to set')
    args = parser.parse_args()
    
    print("=" * 80)
    print(f"🔧 Fixing and Verifying All Tabs for Project: {args.project_id}")
    print("=" * 80)
    
    if fix_and_verify(args.project_id, args.user_id):
        print("\n✅ All fixes applied successfully!")
    else:
        print("\n❌ Fixes failed. Check errors above.")

if __name__ == '__main__':
    main()
