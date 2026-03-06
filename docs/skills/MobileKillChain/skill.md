# Mobile Application Penetration Testing Kill Chain

## Overview
6-stage autonomous mobile application security assessment. Covers static analysis, dynamic instrumentation, attack simulation, data exfiltration testing, and compliance reporting.

## Prerequisites
- APK (Android), IPA (iOS), or APPX (Windows) file path or upload
- Target project context (optional)
- Human approval required for Stages 4 and 5

---

## Stage 1: RECON — Binary Metadata Extraction
**Tools**: mobsf_upload_app, mobsf_list_scans
**Goal**: Upload the app binary and extract metadata without full analysis

Steps:
1. Call `mobsf_upload_app` with the file path
2. Record: hash, scan_type, file_name from response
3. Extract: app name, package name, target SDK version
4. Call `log_agent_update`: "📱 App uploaded — {app_name} ({platform}), hash: {hash}"

Output: hash for subsequent stages

---

## Stage 2: STATIC ANALYSIS — Full Code & Binary Scan
**Tools**: mobsf_start_scan, mobsf_get_report, mobsf_get_scorecard, sec1_lookup_cve
**Goal**: Comprehensive static analysis of app binary

Steps:
1. Call `mobsf_start_scan(hash, scan_type, file_name)`
2. Wait 60-120 seconds
3. Call `mobsf_get_report(hash)` — get full JSON report
4. Call `mobsf_get_scorecard(hash)` — get security score and grade
5. For each vulnerable library with CVE IDs:
   - Call `sec1_lookup_cve(cve_id_list=[...])` to get CVSS, zero-day status
6. Call `log_agent_update` with findings summary:
   - Security score: {score}/100 ({grade})
   - Findings: {critical} critical, {high} high, {medium} medium
   - Dangerous permissions: {n} detected
   - Hardcoded secrets: {n} found

**Checklist** (verify each in the report):
- [ ] Hardcoded API keys, passwords, tokens (M1)
- [ ] Dangerous Android permissions — READ_CONTACTS, ACCESS_FINE_LOCATION, CAMERA, etc. (M6)
- [ ] Cleartext traffic allowed (M5) — `android:usesCleartextTraffic=true`
- [ ] Certificate validation disabled — `AllowAllHostnames`, custom TrustManager (M5)
- [ ] Weak cryptography — DES, MD5, SHA1, ECB mode, static IV (M10)
- [ ] SQLite without encryption (M9)
- [ ] External storage of sensitive data (M9)
- [ ] Debuggable build (M7) — `android:debuggable=true`
- [ ] Backup enabled (M8) — `android:allowBackup=true`
- [ ] Exported Activities/Services/Receivers without permissions (M8)
- [ ] WebView JavaScript enabled + `addJavascriptInterface` (M4)
- [ ] SQL injection patterns (M4)
- [ ] Log statements with sensitive data (M6)
- [ ] Root/emulator detection present (M7)
- [ ] Obfuscation present (M7)
- [ ] Third-party libraries with known CVEs (M2)

---

## Stage 3: DYNAMIC ANALYSIS — Runtime Behaviour (if emulator available)
**Tools**: mobsf_start_dynamic_analysis, mobsf_run_frida_script, mobsf_get_dynamic_report
**Goal**: Runtime behavior analysis — what the app actually does

Steps:
1. Call `mobsf_start_dynamic_analysis(hash)`
2. Run Frida scripts in sequence:
   - `ssl-pinning-bypass` — bypass certificate pinning to capture traffic
   - `crypto-monitor` — capture encryption keys and plaintext
   - `storage-monitor` — capture file I/O and SharedPreferences writes
   - `network-monitor` — capture all HTTP/HTTPS calls
3. After 2-3 minutes of instrumented execution, call `mobsf_get_dynamic_report(hash)`
4. Call `log_agent_update` with dynamic findings
5. Call `mobsf_stop_dynamic_analysis(hash)`

Key things to look for:
- URLs called by the app (API endpoints, CDN, analytics)
- Data sent in cleartext
- Sensitive data written to storage
- Encryption keys in memory
- Runtime permission requests

---

## Stage 4: ATTACK SIMULATION — Exploit Identified Weaknesses ⚠️ REQUIRES HUMAN APPROVAL
**STOP HERE** — present findings from Stages 2-3 to human operator.
Request approval before proceeding with active attack simulation.

Attack scenarios (only with approval):
1. **Intent hijacking** — send malicious intents to exported components
2. **Deep link exploitation** — craft malicious deep links
3. **API endpoint testing** — test discovered API endpoints with common payloads
4. **Auth bypass attempts** — test broken authentication patterns
5. **IPC exploitation** — test content providers for SQL injection / path traversal

---

## Stage 5: DATA EXFILTRATION TEST ⚠️ REQUIRES HUMAN APPROVAL
**STOP HERE** — request separate approval for data exfiltration testing.

Steps:
1. Audit all data storage locations
2. Check keychain/keystore contents
3. Verify data-at-rest encryption
4. Test data leakage via clipboard, logs, analytics SDKs

---

## Stage 6: REPORT — Compliance-Mapped Findings
**Tools**: mobsf_download_pdf_url
**Goal**: Generate structured report mapped to OWASP + compliance frameworks

Output format (JSON):
```json
{
  "app_name": "...",
  "package_name": "...",
  "platform": "ANDROID|IOS",
  "security_score": 0,
  "grade": "A|B|C|D|F",
  "owasp_mobile_top10": {
    "M1": { "status": "FAIL", "findings": [], "recommendation": "..." },
    "M2": { "status": "PASS", "findings": [], "recommendation": "..." },
    "M3": { "status": "PASS", "findings": [], "recommendation": "..." },
    "M4": { "status": "PASS", "findings": [], "recommendation": "..." },
    "M5": { "status": "FAIL", "findings": [], "recommendation": "..." },
    "M6": { "status": "FAIL", "findings": [], "recommendation": "..." },
    "M7": { "status": "FAIL", "findings": [], "recommendation": "..." },
    "M8": { "status": "FAIL", "findings": [], "recommendation": "..." },
    "M9": { "status": "PASS", "findings": [], "recommendation": "..." },
    "M10": { "status": "PASS", "findings": [], "recommendation": "..." }
  },
  "compliance": {
    "GDPR": { "score": 0, "status": "COMPLIANT|PARTIAL|NON_COMPLIANT", "controls": [] },
    "PCI_DSS": { "score": 0, "status": "COMPLIANT|PARTIAL|NON_COMPLIANT", "controls": [] },
    "HIPAA": { "score": 0, "status": "COMPLIANT|PARTIAL|NON_COMPLIANT", "controls": [] },
    "SOC2": { "score": 0, "status": "COMPLIANT|PARTIAL|NON_COMPLIANT", "controls": [] }
  },
  "recommendations": [
    { "priority": 1, "finding": "...", "remediation": "...", "effort": "LOW|MEDIUM|HIGH" }
  ],
  "pdf_url": "..."
}
```
