#!/usr/bin/env python3
"""
BlackArch MCP - Linode Provisioning Script

Creates ALL resources in a NEW isolated VPC. Does NOT modify or touch
any existing VMs, VPCs, or firewalls on your Linode account.

Resources created (all prefixed with blackarch-):
- VPC: blackarch-vpc (10.0.99.0/24) - isolated from existing networks
- Subnet: blackarch-subnet
- Firewall: blackarch-firewall (only for our Linode)
- Linode: blackarch-mcp-production

Usage:
  LINODE_API_KEY=your_key python provision.py [--ssh-key "ssh-rsa AAAA..."]
"""

import argparse
import json
import os
import sys
import time

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx")
    sys.exit(1)

# =============================================================================
# ISOLATED VPC CONFIG - Unique to avoid conflicts with existing VPCs
# =============================================================================
REGION = "us-east"  # Newark; VPC tried first, fallback to public-only if unsupported
VPC_LABEL = "blackarch-vpc"
VPC_SUBNET_CIDR = "10.0.99.0/24"  # Unique - 99 avoids 10.0.1.x, 10.0.0.x
SUBNET_LABEL = "blackarch-subnet"
FIREWALL_LABEL = "blackarch-firewall"
LINODE_LABEL = "blackarch-mcp-production"
LINODE_TYPE = "g6-standard-2"
IMAGE = "linode/debian12"
VPC_IP = "10.0.99.2"  # Linode's IP in our VPC subnet

API_BASE = "https://api.linode.com/v4"


def get_token() -> str:
    token = os.environ.get("LINODE_API_KEY")
    if not token:
        print("ERROR: Set LINODE_API_KEY environment variable")
        sys.exit(1)
    return token


def api_get(client: httpx.Client, path: str) -> dict:
    r = client.get(f"{API_BASE}{path}")
    r.raise_for_status()
    return r.json()


def api_post(client: httpx.Client, path: str, data: dict) -> dict:
    r = client.post(f"{API_BASE}{path}", json=data)
    if r.status_code >= 400:
        print(f"API Error {r.status_code}: {r.text}")
    r.raise_for_status()
    return r.json()


def api_delete(client: httpx.Client, path: str) -> None:
    r = client.delete(f"{API_BASE}{path}")
    r.raise_for_status()


def wait_for_linode(client: httpx.Client, linode_id: int, timeout: int = 300) -> dict:
    """Wait for Linode to be running."""
    start = time.time()
    while time.time() - start < timeout:
        data = api_get(client, f"/linode/instances/{linode_id}")
        status = data.get("status")
        if status == "running":
            return data
        print(f"  Linode status: {status}...")
        time.sleep(10)
    raise TimeoutError(f"Linode {linode_id} did not reach running state in {timeout}s")


def main():
    parser = argparse.ArgumentParser(description="Provision BlackArch MCP on Linode (isolated VPC)")
    parser.add_argument("--ssh-key", type=str, help="SSH public key for root access")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without executing")
    args = parser.parse_args()

    token = get_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print("=" * 60)
    print("BlackArch MCP - Linode Provisioning (isolated VPC)")
    print("=" * 60)
    print("Creating NEW resources only. No existing VMs/VPCs will be modified.")
    print()

    with httpx.Client(headers=headers, timeout=60.0) as client:
        region = REGION
        # 1. Create VPC with subnet (optional - some regions don't support VPC)
        vpc_id = None
        subnet_id = None
        print("1. Creating VPC (blackarch-vpc) with subnet...")
        if args.dry_run:
            print("   [DRY] Would create VPC + subnet")
            subnet_id = 99999
        else:
            try:
                vpc_data = api_post(client, "/vpcs", {
                    "label": VPC_LABEL,
                    "region": region,
                    "subnets": [{"label": SUBNET_LABEL, "ipv4": VPC_SUBNET_CIDR}],
                })
                vpc_id = vpc_data["id"]
                subnet_id = vpc_data["subnets"][0]["id"]
                print(f"   Created VPC id={vpc_id}, Subnet id={subnet_id}")
            except Exception as e:
                err_text = getattr(getattr(e, "response", None), "text", None) or str(e)
                if "does not support VPCs" in err_text:
                    print("   [SKIP] VPC not supported in this region - creating Linode with public interface only")
                    region = "us-east"
                else:
                    raise

        # 2. Create Firewall (for our Linode only) - optional
        firewall_id = None
        print("2. Creating Firewall (blackarch-firewall)...")
        if args.dry_run:
            print("   [DRY] Would create firewall")
        else:
            try:
                fw_data = api_post(client, "/networking/firewalls", {
                    "label": FIREWALL_LABEL,
                    "region": region,
                    "rules": {
                        "inbound_policy": "DROP",
                        "outbound_policy": "ACCEPT",
                        "inbound": [
                            {"action": "ACCEPT", "label": "allow-ssh", "ports": "22", "protocol": "TCP", "addresses": {"ipv4": ["0.0.0.0/0"]}},
                            {"action": "ACCEPT", "label": "allow-https", "ports": "443", "protocol": "TCP", "addresses": {"ipv4": ["0.0.0.0/0"]}},
                            {"action": "ACCEPT", "label": "allow-mcp", "ports": "8080", "protocol": "TCP", "addresses": {"ipv4": ["0.0.0.0/0"]}},
                        ],
                        "outbound": [
                            {"action": "ACCEPT", "label": "allow-all", "protocol": "TCP", "addresses": {"ipv4": ["0.0.0.0/0"]}},
                            {"action": "ACCEPT", "label": "allow-all-udp", "protocol": "UDP", "addresses": {"ipv4": ["0.0.0.0/0"]}},
                        ],
                    },
                })
                firewall_id = fw_data["id"]
                print(f"   Created Firewall id={firewall_id}")
            except Exception as e:
                print(f"   [SKIP] Firewall creation failed: {e}. Linode will use default security.")

        # 3. Create Linode (public + VPC if available)
        print("3. Creating Linode (blackarch-mcp-production)...")
        root_pass = os.urandom(24).hex()  # Random password; use SSH key for access

        interfaces = [{"purpose": "public"}]
        if subnet_id and subnet_id != 99999:
            interfaces.append({"purpose": "vpc", "subnet_id": subnet_id})

        linode_body = {
            "region": region,
            "type": LINODE_TYPE,
            "label": LINODE_LABEL,
            "image": IMAGE,
            "root_pass": root_pass,
            "interfaces": interfaces,
            "tags": ["blackarch-mcp"],
        }
        if args.ssh_key:
            linode_body["authorized_keys"] = [args.ssh_key.strip()]

        if args.dry_run:
            print("   [DRY] Would create Linode")
            print("   Body:", json.dumps({k: v for k, v in linode_body.items() if k != "root_pass"}, indent=2))
            return

        linode_data = api_post(client, "/linode/instances", linode_body)
        linode_id = linode_data["id"]
        print(f"   Created Linode id={linode_id}")

        # 4. Attach Firewall to Linode (if created)
        if firewall_id and firewall_id != 99999:
            print("4. Attaching Firewall to Linode...")
            try:
                api_post(client, f"/networking/firewalls/{firewall_id}/devices", {
                    "type": "linode",
                    "id": linode_id,
                })
                print("   Firewall attached")
            except Exception as e:
                print(f"   [WARN] Firewall attach failed: {e}")
        else:
            print("4. Skipping firewall attach (none created)")

        # 5. Wait for Linode to boot
        print("5. Waiting for Linode to start...")
        linode_data = wait_for_linode(client, linode_id)
        ipv4 = linode_data.get("ipv4", [])
        public_ip = ipv4[0] if ipv4 else ""

        # 7. Create StackScript and assign (optional - we'll use cloud-init or manual)
        # For now, we output instructions for manual StackScript deployment

        print()
        print("=" * 60)
        print("PROVISIONING COMPLETE")
        print("=" * 60)
        print(f"Linode ID: {linode_id}")
        print(f"Public IP: {public_ip}")
        print(f"VPC: {VPC_LABEL} ({VPC_SUBNET_CIDR})")
        print()
        print("Next steps:")
        print("1. Run the StackScript on first boot (or SSH and run stackscript.sh):")
        print(f"   ssh root@{public_ip}")
        print("2. If no SSH key was provided, use root password (saved to .root_pass)")
        with open(".root_pass", "w") as f:
            f.write(root_pass)
        print("   Password saved to .root_pass (delete after use)")
        print()
        print("3. Deploy stackscript.sh manually or via Linode StackScripts UI")


if __name__ == "__main__":
    main()
