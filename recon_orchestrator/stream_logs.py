#!/usr/bin/env python3
"""
Stream Docker logs from recon containers to terminal in real-time.

Usage:
    python stream_logs.py <project_id>
    python stream_logs.py <project_id> --follow
    python stream_logs.py --list  # List all running recon containers
"""

import sys
import docker
import argparse
from datetime import datetime
import re

# ANSI color codes
class Colors:
    RESET = '\033[0m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    BOLD = '\033[1m'

def strip_ansi(line: str) -> str:
    """Remove ANSI escape codes from a line"""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', line)

def colorize_log(line: str) -> str:
    """Colorize log line based on content"""
    line_stripped = strip_ansi(line)
    
    # Error indicators
    if '[!]' in line_stripped or 'ERROR' in line_stripped.upper() or 'FAILED' in line_stripped.upper():
        return f"{Colors.RED}{line}{Colors.RESET}"
    
    # Success indicators
    if '[+]' in line_stripped or '[✓]' in line_stripped or 'SUCCESS' in line_stripped.upper():
        return f"{Colors.GREEN}{line}{Colors.RESET}"
    
    # Action indicators
    if '[*]' in line_stripped or 'STARTING' in line_stripped.upper():
        return f"{Colors.BLUE}{line}{Colors.RESET}"
    
    # Phase indicators
    if '[PHASE' in line_stripped.upper() or '[Phase' in line_stripped:
        return f"{Colors.CYAN}{Colors.BOLD}{line}{Colors.RESET}"
    
    # Warning indicators
    if '[!]' in line_stripped or 'WARNING' in line_stripped.upper():
        return f"{Colors.YELLOW}{line}{Colors.RESET}"
    
    return line

def get_container_name(project_id: str) -> str:
    """Generate container name for a project"""
    safe_id = re.sub(r'[^a-zA-Z0-9_.-]', '_', project_id)
    return f"pandaexploit-recon-{safe_id}"

def list_running_containers():
    """List all running recon containers"""
    client = docker.from_env()
    containers = client.containers.list(filters={'status': 'running'})
    
    recon_containers = [c for c in containers if 'pandaexploit-recon-' in c.name]
    
    if not recon_containers:
        print(f"{Colors.YELLOW}No running recon containers found.{Colors.RESET}")
        return
    
    print(f"\n{Colors.BOLD}Running Recon Containers:{Colors.RESET}\n")
    for container in recon_containers:
        attrs = container.attrs
        created = attrs.get('Created', '')
        project_id = container.name.replace('pandaexploit-recon-', '').replace('_', '')
        
        print(f"  {Colors.CYAN}Container:{Colors.RESET} {container.name}")
        print(f"  {Colors.CYAN}Project ID:{Colors.RESET} {project_id}")
        print(f"  {Colors.CYAN}Status:{Colors.RESET} {container.status}")
        print(f"  {Colors.CYAN}Created:{Colors.RESET} {created}")
        print(f"  {Colors.CYAN}ID:{Colors.RESET} {container.id[:12]}")
        print()

def stream_container_logs(project_id: str, follow: bool = True, tail: int = 100):
    """Stream logs from a recon container"""
    client = docker.from_env()
    container_name = get_container_name(project_id)
    
    try:
        # Try to get container by name first
        try:
            container = client.containers.get(container_name)
        except docker.errors.NotFound:
            # Try to find by partial name match
            containers = client.containers.list(all=True, filters={'name': container_name})
            if containers:
                container = containers[0]
            else:
                print(f"{Colors.RED}Error: Container '{container_name}' not found.{Colors.RESET}")
                print(f"\n{Colors.YELLOW}Available containers:{Colors.RESET}")
                list_running_containers()
                sys.exit(1)
        
        if container.status != 'running' and follow:
            print(f"{Colors.YELLOW}Warning: Container is not running (status: {container.status}){Colors.RESET}")
            print(f"{Colors.YELLOW}Showing last {tail} lines of logs:{Colors.RESET}\n")
            follow = False
        
        print(f"{Colors.BOLD}{Colors.CYAN}Streaming logs from: {container.name}{Colors.RESET}")
        print(f"{Colors.CYAN}Status: {container.status}{Colors.RESET}")
        print(f"{Colors.CYAN}Project ID: {project_id}{Colors.RESET}\n")
        print(f"{'='*80}\n")
        
        # Stream logs
        for line in container.logs(stream=follow, follow=follow, tail=tail, timestamps=True):
            try:
                decoded = line.decode('utf-8', errors='replace').rstrip()
                if decoded:
                    colored_line = colorize_log(decoded)
                    print(colored_line)
            except Exception as e:
                print(f"{Colors.RED}Error decoding line: {e}{Colors.RESET}")
        
    except docker.errors.APIError as e:
        print(f"{Colors.RED}Docker API Error: {e}{Colors.RESET}")
        sys.exit(1)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Stopped streaming logs.{Colors.RESET}")
        sys.exit(0)
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.RESET}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description='Stream Docker logs from recon containers',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Stream logs for a specific project (follow mode)
  python stream_logs.py cmleo8x3j0002lk01z9whiwvc

  # Show last 50 lines without following
  python stream_logs.py cmleo8x3j0002lk01z9whiwvc --no-follow --tail 50

  # List all running containers
  python stream_logs.py --list
        """
    )
    
    parser.add_argument(
        'project_id',
        nargs='?',
        help='Project ID to stream logs for'
    )
    parser.add_argument(
        '--follow', '-f',
        action='store_true',
        default=True,
        help='Follow log output (default: True)'
    )
    parser.add_argument(
        '--no-follow',
        dest='follow',
        action='store_false',
        help='Do not follow log output'
    )
    parser.add_argument(
        '--tail', '-n',
        type=int,
        default=100,
        help='Number of lines to show from the end of logs (default: 100)'
    )
    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List all running recon containers'
    )
    
    args = parser.parse_args()
    
    if args.list:
        list_running_containers()
    elif args.project_id:
        stream_container_logs(args.project_id, follow=args.follow, tail=args.tail)
    else:
        parser.print_help()
        print(f"\n{Colors.YELLOW}Hint: Use --list to see available containers{Colors.RESET}")

if __name__ == '__main__':
    main()
