"""
PandaExploit Attack Path Classification Prompt

LLM-based classification of user intent to select the appropriate attack path and phase.
Determines both the attack methodology AND the required phase (informational/exploitation).
"""


ATTACK_PATH_CLASSIFICATION_PROMPT = """You are classifying a penetration testing request to determine:
1. The required PHASE (informational vs exploitation)
2. The ATTACK PATH TYPE (for exploitation requests only)

## Phase Types

### informational
- Reconnaissance, OSINT, information gathering
- Querying the graph database for targets, vulnerabilities, services
- Scanning and enumeration without exploitation
- Example requests:
  - "What vulnerabilities exist on 10.0.0.5?"
  - "Show me all open ports on the target"
  - "What services are running?"
  - "Query the graph for CVEs"
  - "Scan the network"
  - "What technologies are used?"

### exploitation
- Active exploitation of vulnerabilities
- Brute force / credential attacks
- Any request that involves gaining unauthorized access
- Example requests:
  - "Exploit CVE-2021-41773"
  - "Brute force SSH"
  - "Try to crack the password"
  - "Pwn the target"

## Attack Path Types (ONLY for exploitation phase)

### cve_exploit
- Exploiting known CVE vulnerabilities
- Using Metasploit exploit modules (`exploit/*`)
- Keywords: CVE-XXXX-XXXX, MS17-XXX, vulnerability, exploit, RCE, remote code execution, pwn, hack
- Requires: TARGET selection, PAYLOAD selection
- Command: `exploit`
- Example requests:
  - "Exploit CVE-2021-41773 on 10.0.0.5"
  - "Use the Apache path traversal vulnerability"
  - "Attack the target using MS17-010"
  - "Test if the server is vulnerable to Log4Shell"

### brute_force_credential_guess
- Password guessing / credential attacks
- Using Metasploit auxiliary scanner modules (`auxiliary/scanner/*/login`)
- Keywords: brute force, crack password, credential attack, dictionary attack, password spray, guess password, wordlist, login attack
- Services: SSH, FTP, RDP, VNC, SMB, MySQL, MSSQL, PostgreSQL, Telnet, POP3, IMAP, HTTP login, Tomcat
- Requires: wordlists/credential files
- Command: `run` (NOT exploit)
- Example requests:
  - "Brute force SSH on 10.0.0.5"
  - "Try to crack the MySQL password"
  - "Password spray against the FTP server"
  - "Guess credentials for the Tomcat manager"
  - "Dictionary attack on the SSH service"
  - "Try default credentials on PostgreSQL"
  - "Try to get access to SSH guessing password"

### llm_exploit
- LLM-specific attacks: prompt injection, system prompt leakage, jailbreak
- Targets: PromptMe, OWASP LLM challenges, chat apps on localhost:5000-5010
- Keywords: prompt injection, capture flag, promptme, CTF, LLM challenge, OWASP LLM, leak system prompt, jailbreak
- Uses: execute_curl to POST crafted prompts to chat endpoints
- Example requests:
  - "Capture all flags in PromptMe"
  - "Exploit the LLM challenges on localhost"
  - "Prompt injection on the chat app"
  - "Get the flag from the OWASP LLM challenge"
  - "Leak the system prompt"

### web_app_exploit
- Web application attacks: SQL injection, XSS, path traversal, LFI
- Uses: execute_curl for injection testing; optional Metasploit sqli modules
- Keywords: SQL injection, SQLi, XSS, cross-site scripting, path traversal, LFI, RFI, web app exploit
- Example requests:
  - "Test for SQL injection on http://target/login"
  - "Find XSS on the search parameter"
  - "Exploit the web app for path traversal"

### credential_capture
- Credential harvesting via MITM, fake servers, phishing
- Uses: Metasploit auxiliary/server/capture modules, SMB/HTTP/FTP capture
- Keywords: credential capture, MITM, fake server, harvest credentials, capture hashes
- Example requests:
  - "Set up credential capture for SMB"
  - "Capture NTLM hashes from the network"

### social_engineering
- Phishing, web delivery, malicious documents, HTA
- Keywords: phish, social engineering, email campaign, web delivery, malicious file, HTA, macro
- Example requests:
  - "Set up a phishing campaign"
  - "Create web delivery payload"
  - "Generate malicious Office document"

### dos
- Denial of service, crash services
- Keywords: dos, denial of service, crash, slowloris, flood, disrupt availability
- Example requests:
  - "Run slowloris against the web server"
  - "DoS the target"

### fuzzing
- Fuzzing to discover vulnerabilities
- Keywords: fuzz, crash, discover vuln, overflow, mutation, bug hunting
- Example requests:
  - "Fuzz the HTTP server"
  - "Discover vulnerabilities via fuzzing"

### wireless
- Wireless/network attacks, ARP spoofing, NBNS/LLMNR
- Keywords: wireless, wifi, arp, spoof, poison, rogue
- Example requests:
  - "ARP poisoning attack"
  - "Set up rogue DHCP"

### client_side_exploit
- Browser, document, client-side exploits
- Keywords: browser, client-side, java, flash, pdf, office, document, drive-by
- Example requests:
  - "Exploit the browser"
  - "Create malicious PDF"

### local_privilege_escalation
- Local privilege escalation (requires existing session)
- Keywords: privilege escalate, root, sudo, kernel, local privesc
- Example requests:
  - "Escalate privileges on the session"
  - "Get root on the compromised host"

## User Request
{objective}

## Instructions
Classify the user's request:

1. First determine the REQUIRED PHASE:
   - Is this a reconnaissance/information gathering request? -> "informational"
   - Is this an active attack/exploitation request? -> "exploitation"

2. If exploitation, determine the ATTACK PATH TYPE:
   - Does the request mention PromptMe, LLM challenges, prompt injection, or CTF flags? -> "llm_exploit"
   - Does the request mention SQL injection, XSS, path traversal, or web app exploit? -> "web_app_exploit"
   - Does the request mention credential capture, MITM, or fake server? -> "credential_capture"
   - Does the request mention phishing, social engineering, web delivery, or malicious document? -> "social_engineering"
   - Does the request mention DoS, denial of service, crash, or flood? -> "dos"
   - Does the request mention fuzzing, fuzz, or vulnerability discovery? -> "fuzzing"
   - Does the request mention wireless, ARP spoofing, or rogue? -> "wireless"
   - Does the request mention browser, client-side, or document exploit? -> "client_side_exploit"
   - Does the request mention privilege escalation, local privesc, or root? -> "local_privilege_escalation"
   - Does the request mention a CVE or specific vulnerability? -> "cve_exploit"
   - Does the request mention password guessing, brute force, or credential attacks? -> "brute_force_credential_guess"
   - Does the request target a login service (SSH, FTP, MySQL, etc.) with credential-based attack? -> "brute_force_credential_guess"
   - Does the request mention exploit modules or payloads? -> "cve_exploit"
   - Does the request mention wordlists or dictionaries? -> "brute_force_credential_guess"
   - Default to "cve_exploit" if unclear

3. If informational, set attack_path_type to "cve_exploit" (default, won't be used)

Output valid JSON matching this schema:

```json
{{
  "required_phase": "informational" | "exploitation",
  "attack_path_type": "cve_exploit" | "brute_force_credential_guess" | "llm_exploit" | "web_app_exploit" | "credential_capture" | "social_engineering" | "dos" | "fuzzing" | "wireless" | "client_side_exploit" | "local_privilege_escalation",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of the classification",
  "detected_service": "ssh" | "ftp" | "mysql" | "mssql" | "postgres" | "smb" | "rdp" | "vnc" | "telnet" | "tomcat" | "http" | null
}}
```

Notes:
- `required_phase` determines if this is reconnaissance ("informational") or active attack ("exploitation")
- `attack_path_type` is only relevant when required_phase is "exploitation"
- `detected_service` should only be set for brute_force_credential_guess, null otherwise
- `confidence` should be 0.9+ if the intent is very clear, 0.6-0.8 if somewhat ambiguous
"""
