# SpiderFoot OSINT — Agent Zero Skill

## When to Use

Use this skill when the user asks to:
- Run OSINT / intelligence gathering on a person, domain, IP, email, phone number, or username
- Investigate a target using SpiderFoot
- Find social media accounts, data breaches, leaked emails, or public records for a target
- Map the digital footprint or attack surface of a person or organization
- Check what information is publicly available about a target
- Any mention of: **OSINT**, **SpiderFoot**, **intelligence**, **investigate**, **footprint**, **digital footprint**, **data breach**, **leaked email**, **social media lookup**

## Available Tools

All OSINT tools are on the **pandaexploit** MCP server. No extra setup or context needed.

| Tool | Purpose |
|------|---------|
| `osint_scan` | Start a SpiderFoot scan on any target type |
| `osint_scan_status` | Check scan status and risk matrix |
| `osint_scan_results` | Get discovered events (filterable by type) |
| `osint_scan_summary` | Event type counts at a glance |
| `osint_list_scans` | List all SpiderFoot scans |
| `osint_stop_scan` | Stop a running scan |

## Target Types

SpiderFoot auto-detects target types. **Names and usernames are auto-quoted** — just pass them naturally.

| Input | Detected As | Example |
|-------|-------------|---------|
| `example.com` | Domain (INTERNET_NAME) | `osint_scan("example.com")` |
| `1.2.3.4` | IP Address | `osint_scan("1.2.3.4")` |
| `user@example.com` | Email Address | `osint_scan("user@example.com")` |
| `John Smith` | Person Name (HUMAN_NAME) | `osint_scan("John Smith")` — auto-quoted |
| `+15551234567` | Phone Number | `osint_scan("+15551234567")` |
| `johndoe` | Username | `osint_scan("johndoe")` — auto-quoted |
| `1.2.3.0/24` | Netblock | `osint_scan("1.2.3.0/24")` |

## Scan Usecases

The `usecase` parameter controls which modules run. **Values are case-sensitive.**

| Usecase | Speed | Coverage | Best For |
|---------|-------|----------|----------|
| `"all"` | Slowest (10-60 min) | Every module | Maximum intelligence |
| `"Footprint"` | Medium (5-30 min) | Attack surface modules | Domain/org recon |
| `"Investigate"` | Medium (5-30 min) | Investigation modules | Targeted person/email lookup |
| `"Passive"` | Fast (2-15 min) | Passive-only, zero probing | Stealth, no active scanning |

## Event Types

Use these with `osint_scan_results(scan_id, event_type="...")` to filter results.

### Infrastructure & Network
- `INTERNET_NAME` — Subdomains and hostnames
- `IP_ADDRESS` — IP addresses
- `IPV6_ADDRESS` — IPv6 addresses
- `TCP_PORT_OPEN` — Open ports
- `WEBSERVER_BANNER` — Web server info
- `WEBSERVER_TECHNOLOGY` — Technologies detected
- `DNS_TEXT` — DNS TXT records
- `DOMAIN_WHOIS` — WHOIS data
- `BGP_AS_OWNER` — BGP AS info

### People & Identity
- `HUMAN_NAME` — Person names
- `EMAILADDR` — Email addresses
- `PHONE_NUMBER` — Phone numbers
- `SOCIAL_MEDIA` — Social media profiles
- `ACCOUNT_EXTERNAL_OWNED` — External accounts
- `USERNAME` — Usernames
- `GEOINFO` — Geolocation info

### Security & Breaches
- `VULNERABILITY` — Vulnerabilities
- `LEAKED_EMAIL` — Leaked email addresses
- `LEAKSITE_URL` — Leak/paste site URLs
- `MALICIOUS_IPADDR` — Malicious IPs
- `BLACKLISTED_IPADDR` — Blacklisted IPs
- `DEFACED_AFFILIATE` — Defaced sites

### Content & Files
- `URL_LINKED` — Linked URLs
- `RAW_RIR_DATA` — Raw RIR data
- `AFFILIATE_INTERNET_NAME` — Affiliated domains

## Workflows

### Quick Domain Footprint
```
1. osint_scan("example.com", usecase="Footprint")
2. osint_scan_status(scan_id) — poll every 30s until FINISHED
3. osint_scan_summary(scan_id) — see what was found
4. osint_scan_results(scan_id, "INTERNET_NAME") — subdomains
5. osint_scan_results(scan_id, "IP_ADDRESS") — IPs
6. osint_scan_results(scan_id, "TCP_PORT_OPEN") — open ports
7. osint_scan_results(scan_id, "VULNERABILITY") — vulns
8. Present findings as intelligence report
```

### Person Investigation
```
1. osint_scan("Jane Doe", usecase="all")
2. Poll osint_scan_status until FINISHED
3. osint_scan_summary(scan_id)
4. osint_scan_results(scan_id, "EMAILADDR") — emails
5. osint_scan_results(scan_id, "SOCIAL_MEDIA") — social profiles
6. osint_scan_results(scan_id, "PHONE_NUMBER") — phone numbers
7. osint_scan_results(scan_id, "LEAKED_EMAIL") — breach data
8. osint_scan_results(scan_id, "ACCOUNT_EXTERNAL_OWNED") — accounts
9. Compile intelligence dossier
```

### Email Investigation
```
1. osint_scan("target@company.com", usecase="Investigate")
2. Poll until FINISHED
3. osint_scan_results(scan_id, "LEAKED_EMAIL") — breaches
4. osint_scan_results(scan_id, "SOCIAL_MEDIA") — social media
5. osint_scan_results(scan_id, "HUMAN_NAME") — associated names
6. Report findings
```

### Full Lifecycle (Scan → Report → Cleanup)
```
1. osint_scan("testphp.vulnweb.com", scan_name="Vulnweb-OSINT", usecase="Footprint")
2. osint_scan_status(scan_id) — poll every 30s
3. osint_scan_summary(scan_id) — overview
4. osint_scan_results(scan_id, "INTERNET_NAME")
5. osint_scan_results(scan_id, "IP_ADDRESS")
6. osint_scan_results(scan_id, "TCP_PORT_OPEN")
7. osint_scan_results(scan_id, "VULNERABILITY")
8. osint_scan_results(scan_id, "WEBSERVER_BANNER")
9. Present intelligence report
10. osint_stop_scan(scan_id) — cleanup
```

## Polling Strategy

SpiderFoot scans take time. Use this pattern:

1. Call `osint_scan_status(scan_id)` every **30 seconds**
2. Watch the `status` field:
   - `CREATED` / `STARTING` — scan initializing, keep waiting
   - `RUNNING` — actively scanning, keep polling
   - `FINISHED` — done, fetch results
   - `ABORTED` / `FAILED` / `ERROR-FAILED` — stopped, report the error
3. While `RUNNING`, you can call `osint_scan_summary(scan_id)` to see partial results
4. Once `FINISHED`, call `osint_scan_results` for each event type of interest

## Important Notes

- **No project context needed** — OSINT tools work independently of PandaExploit projects
- **Scans can be long** — `usecase="all"` on a domain with many modules can take 30-60 minutes. Prefer `"Footprint"` or `"Passive"` for faster results.
- **Names are auto-quoted** — Just pass `"John Smith"`, the tool adds the required `"` wrapping
- **Multiple concurrent scans** — You can run multiple scans in parallel on different targets
- **Results persist** — SpiderFoot stores results in its database. Use `osint_list_scans` to find past scans.
- **Cleanup** — Call `osint_stop_scan(scan_id)` when done to free resources for long-running scans
- **Rate limiting** — SpiderFoot handles its own rate limiting per module. No need to throttle.
