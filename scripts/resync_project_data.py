#!/usr/bin/env python3
"""
Re-sync project data to Neo4j with correct project_id.

This script:
1. Loads the recon JSON file
2. Re-runs graph updates with the correct project_id
3. Ensures all data is properly synced

Usage:
    python scripts/resync_project_data.py <project_id> [--user-id <user_id>] [--modules <module1,module2>]
"""

import sys
import os
import argparse
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Import graph update functions
sys.path.insert(0, str(PROJECT_ROOT / "graph_db"))
from update_graph_from_json import (
    load_recon_json,
    get_recon_file_path,
    get_gvm_file_path,
    load_gvm_json,
    run_graph_updates
)
from graph_db import Neo4jClient

def resync_project(project_id: str, user_id: str = None, modules: list = None):
    """Re-sync project data to Neo4j"""
    
    print("=" * 80)
    print(f"🔄 Re-syncing Project Data: {project_id}")
    print("=" * 80)
    
    # Get recon file path
    recon_file = get_recon_file_path(project_id)
    
    if not recon_file.exists():
        print(f"❌ Recon file not found: {recon_file}")
        print(f"   Expected: recon/output/recon_{project_id}.json")
        return False
    
    print(f"✅ Found recon file: {recon_file}")
    
    # Load recon data
    try:
        recon_data = load_recon_json(recon_file)
        print("✅ Loaded recon JSON successfully")
    except Exception as e:
        print(f"❌ Error loading recon JSON: {e}")
        return False
    
    # Load GVM data if exists
    gvm_file = get_gvm_file_path(project_id)
    gvm_data = None
    if gvm_file.exists():
        try:
            gvm_data = load_gvm_json(gvm_file)
            print(f"✅ Loaded GVM JSON: {gvm_file}")
        except Exception as e:
            print(f"⚠️  Could not load GVM JSON: {e}")
    
    # Use provided user_id or try to get from recon metadata
    if not user_id:
        user_id = recon_data.get('metadata', {}).get('user_id') or 'default_user'
        print(f"ℹ️  Using user_id: {user_id}")
    
    # Run graph updates
    print(f"\n🔄 Running graph updates...")
    print(f"   Project ID: {project_id}")
    print(f"   User ID: {user_id}")
    print(f"   Modules: {', '.join(modules) if modules else 'ALL'}")
    
    try:
        results = run_graph_updates(
            recon_data=recon_data,
            user_id=user_id,
            project_id=project_id,
            modules=modules,
            gvm_data=gvm_data
        )
        
        print("\n✅ Graph updates completed!")
        print(f"   Modules run: {', '.join(results.get('modules', {}).keys())}")
        
        if results.get('errors'):
            print(f"\n⚠️  {len(results['errors'])} errors occurred:")
            for error in results['errors'][:5]:
                print(f"   - {error}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error running graph updates: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description='Re-sync project data to Neo4j')
    parser.add_argument('project_id', help='The project_id to sync')
    parser.add_argument('--user-id', help='User ID (defaults to metadata or "default_user")')
    parser.add_argument('--modules', help='Comma-separated list of modules to sync (e.g., "vuln_scan,mitre")')
    args = parser.parse_args()
    
    modules = None
    if args.modules:
        modules = [m.strip() for m in args.modules.split(',')]
    
    if resync_project(args.project_id, args.user_id, modules):
        print("\n✅ Re-sync completed successfully!")
        print("\n💡 Next steps:")
        print("   1. Refresh the UI in your browser")
        print("   2. Check all three tabs:")
        print("      - Vulnerabilities")
        print("      - MITRE ATT&CK")
        print("      - Actions Log")
    else:
        print("\n❌ Re-sync failed. Check errors above.")

if __name__ == '__main__':
    main()
