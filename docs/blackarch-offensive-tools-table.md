# BlackArch Offensive Tools for Agent Zero

Tools a0 can run via `run_security_tool(tool_name, arguments)` when BlackArch MCP is available. All tools run in isolated Docker containers with network access when required.

**Reference:** [BlackArch Tools](https://blackarch.org/tools.html)

**Kali vs BlackArch routing:** When Kali overlap = Yes: use Kali for quick scans; use BlackArch for long scans or when Kali is down. See [TOOL_ROUTING_STRATEGY.md](TOOL_ROUTING_STRATEGY.md).

---

## Quick Reference Table

| Kill Chain | Tool | Kali overlap? | BlackArch Category | Network | Use Case | Example Invocation |
|------------|------|---------------|--------------------|---------|----------|--------------------|
| Recon | nmap | Yes | scanner | Yes | Port scan, service detection | `run_security_tool("nmap", "-sV -p 80,443 example.com")` |
| Recon | naabu | Yes | scanner | Yes | Fast port discovery | `run_security_tool("naabu", "-host example.com")` |
| Recon | nuclei | Yes | scanner | Yes | Vuln scanning, CVE checks | `run_security_tool("nuclei", "-u https://example.com")` |
| Recon | subfinder | No | scanner | Yes | Subdomain enumeration | `run_security_tool("subfinder", "-d example.com")` |
| Recon | amass | No | scanner | Yes | In-depth subdomain enum | `run_security_tool("amass", "enum -d example.com")` |
| Recon | theharvester | No | recon | Yes | OSINT: emails, subdomains, names | `run_security_tool("theharvester", "-d example.com -b all")` |
| Recon | httpx | No | webapp | Yes | HTTP probing, tech detection | `run_security_tool("httpx", "-u https://example.com")` |
| Recon | whatweb | No | fingerprint | Yes | Web tech fingerprinting | `run_security_tool("whatweb", "https://example.com")` |
| Recon | assetfinder | No | scanner | Yes | Domain/subdomain discovery | `run_security_tool("assetfinder", "example.com")` |
| Recon | dnsx | No | recon | Yes | DNS queries, resolution | `run_security_tool("dnsx", "-d example.com")` |
| Recon | gau | No | webapp | Yes | Fetch known URLs (Wayback, etc.) | `run_security_tool("gau", "example.com")` |
| Recon | waybackurls | No | recon | Yes | Historical URLs from Wayback | `run_security_tool("waybackurls", "example.com")` |
| Recon | recon-ng | No | recon | Yes | Recon framework | `run_security_tool("recon-ng", "--help")` |
| Recon | fierce | No | recon | Yes | DNS reconnaissance | `run_security_tool("fierce", "--domain example.com")` |
| Recon | masscan | No | scanner | Yes | Fast port scanner | `run_security_tool("masscan", "-p80,443 192.168.0.0/24")` |
| Scan | nikto | Yes | scanner | Yes | Web server vuln scan | `run_security_tool("nikto", "-h https://example.com")` |
| Scan | sqlmap | Yes | webapp | Yes | SQL injection | `run_security_tool("sqlmap", "-u https://example.com/page?id=1 --batch")` |
| Scan | ffuf | Yes | webapp | Yes | Web fuzzing, dir/file discovery | `run_security_tool("ffuf", "-u https://example.com/FUZZ -w /usr/share/wordlists/dirb/common.txt")` |
| Scan | gobuster | Yes | scanner | Yes | Dir/file brute force | `run_security_tool("gobuster", "dir -u https://example.com -w /usr/share/wordlists/dirb/common.txt")` |
| Scan | dirsearch | No | webapp | Yes | Web path discovery | `run_security_tool("dirsearch", "-u https://example.com")` |
| Scan | wpscan | No | webapp | Yes | WordPress vuln scan | `run_security_tool("wpscan", "--url https://example.com")` |
| Scan | feroxbuster | No | webapp | Yes | Recursive content discovery | `run_security_tool("feroxbuster", "-u https://example.com")` |
| Scan | arjun | No | scanner | Yes | HTTP parameter discovery | `run_security_tool("arjun", "-u https://example.com")` |
| Exploit | hydra | Yes | cracker | Yes | Brute force (SSH, HTTP, etc.) | `run_security_tool("hydra", "-l user -P pass.txt ssh://target")` |
| Exploit | commix | No | webapp | Yes | Command injection | `run_security_tool("commix", "-u https://example.com/vuln")` |

---

## By Kill Chain Phase

### 1. Reconnaissance

| Tool | Use Case |
|------|----------|
| nmap | Port scan, service/version detection, OS fingerprinting |
| naabu | Fast port discovery (ProjectDiscovery) |
| nuclei | Template-based vuln scanning, CVE checks |
| subfinder | Passive subdomain enumeration |
| amass | In-depth subdomain enumeration (OWASP) |
| theharvester | OSINT: emails, subdomains, names from public sources |
| httpx | HTTP probing, status codes, tech detection |
| whatweb | Web technology fingerprinting |
| assetfinder | Find domains/subdomains related to a target |
| dnsx | DNS resolution, subdomain enumeration |
| gau | Fetch known URLs from Wayback, AlienVault, Common Crawl |
| waybackurls | Historical URLs from Wayback Machine |
| recon-ng | Modular recon framework |
| fierce | DNS reconnaissance, non-contiguous IP discovery |
| masscan | Very fast port scanner |

### 2. Scanning / Enumeration

| Tool | Use Case |
|------|----------|
| nikto | Web server vulnerability scanner |
| sqlmap | Automated SQL injection detection and exploitation |
| ffuf | Fast web fuzzer for dirs, params, vhosts |
| gobuster | Directory/file brute forcing |
| dirsearch | Web path and file discovery |
| wpscan | WordPress vulnerability scanner |
| feroxbuster | Recursive content discovery (Rust) |
| arjun | Discover hidden HTTP parameters |

### 3. Exploitation

| Tool | Use Case |
|------|----------|
| sqlmap | SQLi exploitation (also in Scan) |
| hydra | Brute force: SSH, HTTP, FTP, RDP, etc. |
| commix | Command injection detection and exploitation |

---

## Network Tools (Auto-Bridge)

These tools automatically receive `--network=bridge` in the container so they can reach targets:

nmap, nuclei, curl, nikto, sqlmap, ffuf, gobuster, hydra, naabu, subfinder, amass, theharvester, httpx, whatweb, assetfinder, dnsx, gau, waybackurls, recon-ng, fierce, masscan, dirsearch, feroxbuster, arjun, commix, wpscan

---

## Notes

- **Kali overlap:** When Kali overlap = Yes, prefer Kali for quick scans (< 5 min); use BlackArch for long scans or when Kali MCP is down. See [TOOL_ROUTING_STRATEGY.md](TOOL_ROUTING_STRATEGY.md).
- **Package = binary:** All tools use the same name for pacman install and exec. If a tool fails with "not found", run `verify_tool_available(tool_name)` first.
- **Wordlists:** ffuf/gobuster need wordlists. BlackArch may include `/usr/share/wordlists/` from seclists, dirb, etc. Install `seclists` or `dirb` if needed: `pacman -S seclists` (run before tool in same container — or use a wordlist URL).
- **Metasploit:** Use Kali Metasploit MCP for interactive msfconsole. BlackArch's metasploit package uses `msfconsole` binary; the MCP uses one name for both pacman and exec, so metasploit is not in this table.
- **crackmapexec:** Package provides `cme` binary. Use `cme` as tool_name if the MCP supports package-to-binary mapping; otherwise verify with `verify_tool_available("crackmapexec")`.
