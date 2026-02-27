#!/usr/bin/env python3
"""
Test Scenario A: ingest_custom_findings only.
Verifies graph + vulnerability pipeline via webapp API (same path MCP uses).
"""
import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:3000"
USER_EMAIL = "hmajeedus@gmail.com"
TARGET = "ginandjuice.shop"

def req(method, path, data=None):
    url = f"{BASE}{path}" if path.startswith("/") else f"{BASE}/{path}"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode())

def main():
    try:
        # 1. List users
        users = req("GET", "/api/users")
        user = next((u for u in users if u.get("email") == USER_EMAIL), None)
        if not user:
            print("Creating user...")
            user = req("POST", "/api/users", {"name": "H Majeed", "email": USER_EMAIL})
        user_id = user["id"]
        print(f"User ID: {user_id}")

        # 2. Create project
        project = req("POST", "/api/projects", {
            "userId": user_id,
            "name": f"{TARGET} pentest",
            "targetDomain": TARGET,
        })
        project_id = project["id"]
        print(f"Project ID: {project_id}")

        # 3. Ingest custom findings
        findings = [
            {"name": "Exposed admin panel", "severity": "info", "matched_at": f"https://{TARGET}/admin/",
             "description": "Admin interface discovered", "tool_name": "custom"},
            {"name": "HTTP server info disclosure", "severity": "low", "matched_at": f"https://{TARGET}/",
             "description": "Server header reveals technology", "tool_name": "custom"},
        ]
        payload = {"source": "custom", "projectId": project_id, "data": {"findings": findings, "target_domain": TARGET}}
        ingest = req("POST", "/api/graph/ingest", payload)
        print(f"Ingest: {ingest.get('message', ingest)}")

        # 4. Get graph
        graph = req("GET", f"/api/graph?projectId={project_id}")
        nodes = graph.get("nodes", [])
        links = graph.get("links", [])
        print(f"Graph: {len(nodes)} nodes, {len(links)} links")

        # 5. Get vulnerabilities
        data = req("GET", f"/api/vulnerabilities?projectId={project_id}")
        vulns = data.get("vulnerabilities", [])
        count = len(vulns)
        print(f"Vulnerabilities: {count}")

        if len(nodes) >= 1 and count >= 2:
            print("\n✅ Scenario A PASSED: graph and vulnerability tab populated")
            return 0
        print("\n❌ Scenario A FAILED: expected graph nodes and 2 vulnerabilities")
        return 1
    except Exception as e:
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
