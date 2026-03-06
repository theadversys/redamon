import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../../graph/neo4j'
import prisma from '@/lib/prisma'

// ── ATT&CK Enterprise Matrix — all 14 tactics + key techniques ────────────────

export const TACTICS = [
  { id: 'TA0043', name: 'Reconnaissance',        shortName: 'Recon',      color: '#7c3aed' },
  { id: 'TA0042', name: 'Resource Development',  shortName: 'Resources',  color: '#6d28d9' },
  { id: 'TA0001', name: 'Initial Access',         shortName: 'Initial',   color: '#e53935' },
  { id: 'TA0002', name: 'Execution',              shortName: 'Exec',      color: '#f97316' },
  { id: 'TA0003', name: 'Persistence',            shortName: 'Persist',   color: '#f59e0b' },
  { id: 'TA0004', name: 'Privilege Escalation',   shortName: 'PrivEsc',   color: '#eab308' },
  { id: 'TA0005', name: 'Defense Evasion',        shortName: 'DefEvasion',color: '#84cc16' },
  { id: 'TA0006', name: 'Credential Access',      shortName: 'CredAccess',color: '#06b6d4' },
  { id: 'TA0007', name: 'Discovery',              shortName: 'Discovery', color: '#3b82f6' },
  { id: 'TA0008', name: 'Lateral Movement',       shortName: 'Lateral',   color: '#6366f1' },
  { id: 'TA0009', name: 'Collection',             shortName: 'Collection',color: '#8b5cf6' },
  { id: 'TA0011', name: 'Command & Control',      shortName: 'C2',        color: '#ec4899' },
  { id: 'TA0010', name: 'Exfiltration',           shortName: 'Exfil',     color: '#f43f5e' },
  { id: 'TA0040', name: 'Impact',                 shortName: 'Impact',    color: '#dc2626' },
] as const

// All ATT&CK Enterprise techniques we map to (subset of most relevant for web/network pentest)
export const TECHNIQUES: Record<string, { name: string; tactic: string; url: string; subtechniques?: string[] }> = {
  // ── Reconnaissance ────────────────────────────────────────────────────────
  'T1595':   { name: 'Active Scanning',                          tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1595' },
  'T1595.001': { name: 'Scanning IP Blocks',                    tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1595/001' },
  'T1595.002': { name: 'Vulnerability Scanning',                tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1595/002' },
  'T1592':   { name: 'Gather Victim Host Info',                  tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1592' },
  'T1590':   { name: 'Gather Victim Network Info',               tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1590' },
  'T1589':   { name: 'Gather Victim Identity Info',              tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1589' },
  'T1596':   { name: 'Search Open Technical Databases',          tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1596' },
  'T1593':   { name: 'Search Open Websites/Domains',             tactic: 'TA0043', url: 'https://attack.mitre.org/techniques/T1593' },
  // ── Resource Development ──────────────────────────────────────────────────
  'T1583':   { name: 'Acquire Infrastructure',                   tactic: 'TA0042', url: 'https://attack.mitre.org/techniques/T1583' },
  'T1587':   { name: 'Develop Capabilities',                     tactic: 'TA0042', url: 'https://attack.mitre.org/techniques/T1587' },
  'T1588':   { name: 'Obtain Capabilities',                      tactic: 'TA0042', url: 'https://attack.mitre.org/techniques/T1588' },
  // ── Initial Access ─────────────────────────────────────────────────────────
  'T1190':   { name: 'Exploit Public-Facing Application',        tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1190' },
  'T1566':   { name: 'Phishing',                                 tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1566' },
  'T1566.001': { name: 'Spearphishing Attachment',               tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1566/001' },
  'T1566.002': { name: 'Spearphishing Link',                     tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1566/002' },
  'T1133':   { name: 'External Remote Services',                 tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1133' },
  'T1078':   { name: 'Valid Accounts',                           tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1078' },
  'T1195':   { name: 'Supply Chain Compromise',                  tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1195' },
  'T1189':   { name: 'Drive-by Compromise',                      tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1189' },
  'T1199':   { name: 'Trusted Relationship',                     tactic: 'TA0001', url: 'https://attack.mitre.org/techniques/T1199' },
  // ── Execution ─────────────────────────────────────────────────────────────
  'T1059':   { name: 'Command and Scripting Interpreter',        tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1059' },
  'T1059.007': { name: 'JavaScript',                             tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1059/007' },
  'T1059.001': { name: 'PowerShell',                             tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1059/001' },
  'T1203':   { name: 'Exploitation for Client Execution',        tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1203' },
  'T1106':   { name: 'Native API',                               tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1106' },
  'T1053':   { name: 'Scheduled Task / Job',                     tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1053' },
  'T1204':   { name: 'User Execution',                           tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1204' },
  'T1569':   { name: 'System Services',                          tactic: 'TA0002', url: 'https://attack.mitre.org/techniques/T1569' },
  // ── Persistence ───────────────────────────────────────────────────────────
  'T1136':   { name: 'Create Account',                           tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1136' },
  'T1543':   { name: 'Create or Modify System Process',          tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1543' },
  'T1546':   { name: 'Event Triggered Execution',                tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1546' },
  'T1505':   { name: 'Server Software Component',                tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1505' },
  'T1505.003': { name: 'Web Shell',                              tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1505/003' },
  'T1547':   { name: 'Boot or Logon Autostart Execution',        tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1547' },
  'T1574':   { name: 'Hijack Execution Flow',                    tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1574' },
  'T1176':   { name: 'Browser Extensions',                       tactic: 'TA0003', url: 'https://attack.mitre.org/techniques/T1176' },
  // ── Privilege Escalation ─────────────────────────────────────────────────
  'T1068':   { name: 'Exploitation for Privilege Escalation',   tactic: 'TA0004', url: 'https://attack.mitre.org/techniques/T1068' },
  'T1055':   { name: 'Process Injection',                        tactic: 'TA0004', url: 'https://attack.mitre.org/techniques/T1055' },
  'T1548':   { name: 'Abuse Elevation Control Mechanism',        tactic: 'TA0004', url: 'https://attack.mitre.org/techniques/T1548' },
  'T1134':   { name: 'Access Token Manipulation',                tactic: 'TA0004', url: 'https://attack.mitre.org/techniques/T1134' },
  'T1484':   { name: 'Domain Policy Modification',               tactic: 'TA0004', url: 'https://attack.mitre.org/techniques/T1484' },
  // ── Defense Evasion ───────────────────────────────────────────────────────
  'T1027':   { name: 'Obfuscated Files or Information',          tactic: 'TA0005', url: 'https://attack.mitre.org/techniques/T1027' },
  'T1036':   { name: 'Masquerading',                             tactic: 'TA0005', url: 'https://attack.mitre.org/techniques/T1036' },
  'T1070':   { name: 'Indicator Removal',                        tactic: 'TA0005', url: 'https://attack.mitre.org/techniques/T1070' },
  'T1562':   { name: 'Impair Defenses',                          tactic: 'TA0005', url: 'https://attack.mitre.org/techniques/T1562' },
  'T1218':   { name: 'System Binary Proxy Execution',            tactic: 'TA0005', url: 'https://attack.mitre.org/techniques/T1218' },
  'T1140':   { name: 'Deobfuscate / Decode Files',               tactic: 'TA0005', url: 'https://attack.mitre.org/techniques/T1140' },
  'T1553':   { name: 'Subvert Trust Controls',                   tactic: 'TA0005', url: 'https://attack.mitre.org/techniques/T1553' },
  // ── Credential Access ─────────────────────────────────────────────────────
  'T1110':   { name: 'Brute Force',                              tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1110' },
  'T1110.001': { name: 'Password Guessing',                      tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1110/001' },
  'T1110.003': { name: 'Password Spraying',                      tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1110/003' },
  'T1552':   { name: 'Unsecured Credentials',                    tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1552' },
  'T1552.001': { name: 'Credentials In Files',                   tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1552/001' },
  'T1003':   { name: 'OS Credential Dumping',                    tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1003' },
  'T1003.001': { name: 'LSASS Memory',                           tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1003/001' },
  'T1040':   { name: 'Network Sniffing',                         tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1040' },
  'T1557':   { name: 'Adversary-in-the-Middle',                  tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1557' },
  'T1558':   { name: 'Steal or Forge Kerberos Tickets',          tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1558' },
  'T1558.003': { name: 'Kerberoasting',                          tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1558/003' },
  'T1212':   { name: 'Exploitation for Credential Access',       tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1212' },
  'T1528':   { name: 'Steal Application Access Token',           tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1528' },
  'T1539':   { name: 'Steal Web Session Cookie',                 tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1539' },
  'T1606':   { name: 'Forge Web Credentials',                    tactic: 'TA0006', url: 'https://attack.mitre.org/techniques/T1606' },
  // ── Discovery ─────────────────────────────────────────────────────────────
  'T1083':   { name: 'File and Directory Discovery',             tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1083' },
  'T1046':   { name: 'Network Service Discovery',                tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1046' },
  'T1087':   { name: 'Account Discovery',                        tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1087' },
  'T1135':   { name: 'Network Share Discovery',                  tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1135' },
  'T1082':   { name: 'System Information Discovery',             tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1082' },
  'T1016':   { name: 'System Network Config Discovery',          tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1016' },
  'T1518':   { name: 'Software Discovery',                       tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1518' },
  'T1201':   { name: 'Password Policy Discovery',                tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1201' },
  'T1069':   { name: 'Permission Groups Discovery',              tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1069' },
  'T1580':   { name: 'Cloud Infrastructure Discovery',           tactic: 'TA0007', url: 'https://attack.mitre.org/techniques/T1580' },
  // ── Lateral Movement ──────────────────────────────────────────────────────
  'T1210':   { name: 'Exploitation of Remote Services',          tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1210' },
  'T1021':   { name: 'Remote Services',                          tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1021' },
  'T1021.001': { name: 'Remote Desktop Protocol',                tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1021/001' },
  'T1021.002': { name: 'SMB / Windows Admin Shares',             tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1021/002' },
  'T1021.004': { name: 'SSH',                                    tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1021/004' },
  'T1550':   { name: 'Use Alternate Authentication Material',    tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1550' },
  'T1550.002': { name: 'Pass the Hash',                          tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1550/002' },
  'T1534':   { name: 'Internal Spearphishing',                   tactic: 'TA0008', url: 'https://attack.mitre.org/techniques/T1534' },
  // ── Collection ────────────────────────────────────────────────────────────
  'T1119':   { name: 'Automated Collection',                     tactic: 'TA0009', url: 'https://attack.mitre.org/techniques/T1119' },
  'T1005':   { name: 'Data from Local System',                   tactic: 'TA0009', url: 'https://attack.mitre.org/techniques/T1005' },
  'T1213':   { name: 'Data from Information Repositories',       tactic: 'TA0009', url: 'https://attack.mitre.org/techniques/T1213' },
  'T1530':   { name: 'Data from Cloud Storage',                  tactic: 'TA0009', url: 'https://attack.mitre.org/techniques/T1530' },
  'T1114':   { name: 'Email Collection',                         tactic: 'TA0009', url: 'https://attack.mitre.org/techniques/T1114' },
  'T1056':   { name: 'Input Capture',                            tactic: 'TA0009', url: 'https://attack.mitre.org/techniques/T1056' },
  'T1056.003': { name: 'Web Portal Capture',                     tactic: 'TA0009', url: 'https://attack.mitre.org/techniques/T1056/003' },
  // ── Command & Control ─────────────────────────────────────────────────────
  'T1071':   { name: 'Application Layer Protocol',               tactic: 'TA0011', url: 'https://attack.mitre.org/techniques/T1071' },
  'T1071.001': { name: 'Web Protocols',                          tactic: 'TA0011', url: 'https://attack.mitre.org/techniques/T1071/001' },
  'T1572':   { name: 'Protocol Tunneling',                       tactic: 'TA0011', url: 'https://attack.mitre.org/techniques/T1572' },
  'T1090':   { name: 'Proxy',                                    tactic: 'TA0011', url: 'https://attack.mitre.org/techniques/T1090' },
  'T1105':   { name: 'Ingress Tool Transfer',                    tactic: 'TA0011', url: 'https://attack.mitre.org/techniques/T1105' },
  'T1573':   { name: 'Encrypted Channel',                        tactic: 'TA0011', url: 'https://attack.mitre.org/techniques/T1573' },
  'T1219':   { name: 'Remote Access Software',                   tactic: 'TA0011', url: 'https://attack.mitre.org/techniques/T1219' },
  // ── Exfiltration ──────────────────────────────────────────────────────────
  'T1041':   { name: 'Exfiltration Over C2 Channel',             tactic: 'TA0010', url: 'https://attack.mitre.org/techniques/T1041' },
  'T1048':   { name: 'Exfiltration Over Alternative Protocol',   tactic: 'TA0010', url: 'https://attack.mitre.org/techniques/T1048' },
  'T1567':   { name: 'Exfiltration Over Web Service',            tactic: 'TA0010', url: 'https://attack.mitre.org/techniques/T1567' },
  'T1029':   { name: 'Scheduled Transfer',                       tactic: 'TA0010', url: 'https://attack.mitre.org/techniques/T1029' },
  // ── Impact ────────────────────────────────────────────────────────────────
  'T1486':   { name: 'Data Encrypted for Impact',                tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1486' },
  'T1499':   { name: 'Endpoint Denial of Service',               tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1499' },
  'T1498':   { name: 'Network Denial of Service',                tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1498' },
  'T1485':   { name: 'Data Destruction',                         tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1485' },
  'T1565':   { name: 'Data Manipulation',                        tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1565' },
  'T1491':   { name: 'Defacement',                               tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1491' },
  'T1496':   { name: 'Resource Hijacking',                       tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1496' },
  'T1489':   { name: 'Service Stop',                             tactic: 'TA0040', url: 'https://attack.mitre.org/techniques/T1489' },
}

// ── CWE → ATT&CK technique mapping ───────────────────────────────────────────
// Source: CAPEC→ATT&CK mappings, NVD CWE data, and pentest experience
const CWE_TO_TECHNIQUES: Record<string, string[]> = {
  // Injection (T1190, T1059)
  'CWE-89':  ['T1190', 'T1059'],        // SQL Injection
  'CWE-564': ['T1190'],                  // SQL Injection: Hibernate
  'CWE-943': ['T1190'],                  // Improper Neutralization of Special Elements in Data Query Logic
  'CWE-78':  ['T1059', 'T1190'],        // OS Command Injection → Execution
  'CWE-77':  ['T1059', 'T1190'],        // Command Injection
  'CWE-88':  ['T1059'],                  // Argument Injection
  // XSS (T1059.007, T1189)
  'CWE-79':  ['T1059.007', 'T1189'],    // Cross-site Scripting
  'CWE-80':  ['T1059.007'],              // Basic XSS
  'CWE-83':  ['T1059.007'],              // XSS in Attributes
  // File Inclusion / Path Traversal (T1083, T1190)
  'CWE-22':  ['T1083', 'T1190'],        // Path Traversal
  'CWE-23':  ['T1083'],                  // Relative Path Traversal
  'CWE-24':  ['T1083'],                  // Dot-Dot Slash
  'CWE-98':  ['T1190'],                  // PHP Remote File Inclusion
  'CWE-73':  ['T1083'],                  // External Control of File Name
  // SSRF (T1090, T1580)
  'CWE-918': ['T1090', 'T1580'],        // Server-Side Request Forgery
  // XXE (T1190, T1083)
  'CWE-611': ['T1190', 'T1083'],        // XML External Entity
  'CWE-776': ['T1190'],                  // Improper Restriction of Recursive XML
  // Deserialization (T1190, T1059)
  'CWE-502': ['T1190', 'T1059'],        // Deserialization of Untrusted Data
  // Improper Authentication / Authorization (T1078, T1190)
  'CWE-287': ['T1078'],                  // Improper Authentication
  'CWE-306': ['T1078', 'T1190'],        // Missing Authentication
  'CWE-307': ['T1110'],                  // Missing Brute Force Protection
  'CWE-798': ['T1552.001'],              // Hard-coded Credentials
  'CWE-259': ['T1552.001'],              // Hard-coded Password
  'CWE-321': ['T1552'],                  // Hard-coded Cryptographic Key
  'CWE-285': ['T1078'],                  // Improper Authorization
  'CWE-284': ['T1078'],                  // Improper Access Control
  'CWE-862': ['T1078'],                  // Missing Authorization
  'CWE-863': ['T1078'],                  // Incorrect Authorization
  // Session Management (T1539, T1606)
  'CWE-384': ['T1539'],                  // Session Fixation
  'CWE-613': ['T1539'],                  // Insufficient Session Expiration
  'CWE-614': ['T1539'],                  // Sensitive Cookie Without Secure Flag
  'CWE-1004': ['T1539'],                 // Sensitive Cookie Without HttpOnly
  // CSRF (T1606)
  'CWE-352': ['T1606'],                  // Cross-Site Request Forgery
  // Sensitive Data Exposure (T1552, T1083)
  'CWE-200': ['T1083', 'T1552'],        // Exposure of Sensitive Information
  'CWE-532': ['T1552'],                  // Insertion of Sensitive Information into Log File
  'CWE-312': ['T1552'],                  // Cleartext Storage of Sensitive Data
  'CWE-319': ['T1040'],                  // Cleartext Transmission of Sensitive Information → Sniffing
  'CWE-311': ['T1040'],                  // Missing Encryption of Sensitive Data
  // Cryptographic Issues (T1553, T1040)
  'CWE-327': ['T1553'],                  // Use of Broken Algorithm
  'CWE-326': ['T1553'],                  // Inadequate Encryption Strength
  'CWE-295': ['T1553'],                  // Improper Certificate Validation
  'CWE-297': ['T1557'],                  // Improper Validation of Certificate with Host Mismatch → MitM
  // Buffer/Memory (T1068, T1190)
  'CWE-120': ['T1068', 'T1190'],        // Buffer Copy without Checking
  'CWE-119': ['T1068', 'T1190'],        // Buffer Errors
  'CWE-125': ['T1068'],                  // Out-of-bounds Read
  'CWE-787': ['T1068', 'T1190'],        // Out-of-bounds Write
  'CWE-416': ['T1068', 'T1190'],        // Use After Free
  'CWE-476': ['T1068'],                  // NULL Pointer Dereference
  'CWE-190': ['T1068'],                  // Integer Overflow
  // Denial of Service (T1499, T1498)
  'CWE-400': ['T1499'],                  // Uncontrolled Resource Consumption
  'CWE-770': ['T1499'],                  // Allocation of Resources Without Limits
  'CWE-674': ['T1499'],                  // Uncontrolled Recursion
  // Open Redirect (T1189)
  'CWE-601': ['T1189'],                  // URL Redirection to Untrusted Site
  // Security Misconfiguration (T1082, T1046)
  'CWE-1021': ['T1189'],                 // Clickjacking (Improper Restriction of Rendered UI Layers)
  'CWE-16':  ['T1082'],                  // Configuration
  // LDAP Injection (T1087)
  'CWE-90':  ['T1087', 'T1190'],        // LDAP Injection
  // XPath Injection (T1190)
  'CWE-643': ['T1190'],                  // XPath Injection
  // Server-Side Template Injection (T1059, T1190)
  'CWE-1336': ['T1059', 'T1190'],       // Improper Neutralization of Special Elements in Template Engine
  // Privilege Escalation (T1068)
  'CWE-269': ['T1068'],                  // Improper Privilege Management
  'CWE-250': ['T1068'],                  // Execution with Unnecessary Privileges
  'CWE-266': ['T1068'],                  // Incorrect Privilege Assignment
  'CWE-732': ['T1068'],                  // Incorrect Permission Assignment for Critical Resource
  // Race Conditions (T1055)
  'CWE-362': ['T1055'],                  // Concurrent Execution using Shared Resource with Improper Synchronization
  // Web Server Issues (T1505.003)
  'CWE-94':  ['T1059', 'T1505.003'],    // Code Injection → Web Shell
  // Credential Issues (T1552)
  'CWE-522': ['T1552'],                  // Insufficiently Protected Credentials
  'CWE-256': ['T1552'],                  // Unprotected Storage of Credentials
  // Open Ports (T1046)
  // (handled via keyword matching below)
  // Supply Chain (T1195)
  'CWE-829': ['T1195'],                  // Inclusion of Functionality from Untrusted Control Sphere
}

// ── Vulnerability name/category/title keyword → ATT&CK technique mapping ─────
const KEYWORD_RULES: Array<{ patterns: RegExp[]; techniques: string[] }> = [
  // SQL Injection
  { patterns: [/sql.?inject/i, /sqli\b/i, /sql.*error/i], techniques: ['T1190', 'T1059'] },
  // XSS
  { patterns: [/cross.?site.?script/i, /\bxss\b/i, /stored.?xss/i, /reflected.?xss/i, /dom.?xss/i], techniques: ['T1059.007', 'T1189'] },
  // RCE
  { patterns: [/remote.?code.?exec/i, /\brce\b/i, /code.?execution/i, /command.?inject/i], techniques: ['T1059', 'T1190', 'T1068'] },
  // File inclusion
  { patterns: [/file.?inclus/i, /\blfi\b/i, /\brfi\b/i, /local.?file/i, /remote.?file.?inclus/i], techniques: ['T1083', 'T1190'] },
  // Path traversal
  { patterns: [/path.?traversal/i, /directory.?traversal/i, /dot.?dot.?slash/i], techniques: ['T1083'] },
  // SSRF
  { patterns: [/server.?side.?request.?forgery/i, /\bssrf\b/i], techniques: ['T1090', 'T1580'] },
  // CSRF
  { patterns: [/cross.?site.?request.?forgery/i, /\bcsrf\b/i], techniques: ['T1606'] },
  // XXE
  { patterns: [/xml.?external.?entity/i, /\bxxe\b/i], techniques: ['T1190', 'T1083'] },
  // Deserialization
  { patterns: [/deserializ/i, /insecure.?deserialization/i], techniques: ['T1190', 'T1059'] },
  // SSTI
  { patterns: [/template.?inject/i, /\bssti\b/i, /server.?side.?template/i], techniques: ['T1059', 'T1190'] },
  // Brute force / auth
  { patterns: [/brute.?force/i, /password.?spray/i, /credential.?stuff/i], techniques: ['T1110', 'T1078'] },
  // Default credentials
  { patterns: [/default.?cred/i, /default.?password/i, /hard.?coded.?cred/i], techniques: ['T1552.001', 'T1078'] },
  // Exposed login / admin panel
  { patterns: [/exposed.?admin/i, /admin.?panel/i, /admin.?interface/i, /login.?panel/i], techniques: ['T1133', 'T1078'] },
  // Directory listing / exposure
  { patterns: [/directory.?listing/i, /directory.?browsing/i, /index.?of\b/i], techniques: ['T1083'] },
  // Open redirect
  { patterns: [/open.?redirect/i, /url.?redirect/i, /unvalidated.?redirect/i], techniques: ['T1189'] },
  // Session issues
  { patterns: [/session.?fixation/i, /session.?hijack/i, /cookie.*secure/i, /httponly/i], techniques: ['T1539'] },
  // JWT issues
  { patterns: [/\bjwt\b/i, /json.?web.?token/i, /jwt.*none/i, /jwt.*weak/i], techniques: ['T1606', 'T1539'] },
  // Broken access control
  { patterns: [/access.?control/i, /idor\b/i, /insecure.?direct.?object/i, /broken.?access/i], techniques: ['T1078', 'T1190'] },
  // Information disclosure / secrets
  { patterns: [/api.?key.?exposur/i, /secret.*exposur/i, /env.?file/i, /\.env\b/i], techniques: ['T1552.001'] },
  { patterns: [/information.?disclosur/i, /sensitive.?data.?exposur/i], techniques: ['T1552', 'T1083'] },
  { patterns: [/error.?message/i, /stack.?trace/i, /debug.?mode/i], techniques: ['T1082', 'T1083'] },
  // Crypto / TLS
  { patterns: [/ssl.*v[23]/i, /tls.*v1\.[01]\b/i, /weak.*cipher/i, /deprecated.*cipher/i], techniques: ['T1040', 'T1553'] },
  { patterns: [/self.?signed.?cert/i, /certificate.*expired/i, /invalid.*cert/i], techniques: ['T1553'] },
  // MitM
  { patterns: [/mitm\b/i, /man.?in.?the.?middle/i, /arp.?poison/i, /llmnr/i, /nbns/i], techniques: ['T1557', 'T1040'] },
  // Password cracking / hash
  { patterns: [/hash.*crack/i, /password.*crack/i, /ntlm.*hash/i, /hashcat/i], techniques: ['T1003', 'T1110'] },
  // Web shell
  { patterns: [/web.?shell/i, /php.?shell/i, /backdoor/i, /webshell/i], techniques: ['T1505.003', 'T1059'] },
  // File upload
  { patterns: [/file.?upload/i, /unrestricted.?upload/i, /arbitrary.?file.?upload/i], techniques: ['T1505.003', 'T1190'] },
  // Port/service scanning
  { patterns: [/port.?scan/i, /service.?enum/i, /banner.?grab/i], techniques: ['T1046', 'T1595.002'] },
  // SMB / NetBIOS
  { patterns: [/\bsmb\b/i, /windows.?share/i, /netbios/i, /samba/i], techniques: ['T1021.002', 'T1135'] },
  // SSH
  { patterns: [/\bssh\b/i, /ssh.*weak/i, /ssh.*brute/i], techniques: ['T1021.004', 'T1110'] },
  // RDP
  { patterns: [/\brdp\b/i, /remote.?desktop/i], techniques: ['T1021.001', 'T1110'] },
  // Pass the hash
  { patterns: [/pass.?the.?hash/i, /pth\b/i], techniques: ['T1550.002', 'T1003'] },
  // Kerberos
  { patterns: [/kerberoasting/i, /kerberos/i, /spn\b/i, /as.?rep.?roasting/i], techniques: ['T1558.003', 'T1558'] },
  // LDAP
  { patterns: [/ldap.?inject/i, /ldap.?enum/i], techniques: ['T1087', 'T1190'] },
  // Outdated software / CVE
  { patterns: [/outdated/i, /out.?of.?date/i, /vulnerable.?version/i, /end.?of.?life/i], techniques: ['T1190', 'T1195'] },
  // Header issues (CSP, HSTS, etc.)
  { patterns: [/missing.*header/i, /content.?security.?policy/i, /\bcsp\b/i, /x.?frame.?options/i, /hsts/i], techniques: ['T1189'] },
  // DoS
  { patterns: [/denial.?of.?service/i, /\bdos\b/i, /\bddos\b/i, /resource.?exhaustion/i], techniques: ['T1499', 'T1498'] },
  // Command & Control
  { patterns: [/\bc2\b/i, /command.?and.?control/i, /reverse.?shell/i, /beacon/i], techniques: ['T1071.001', 'T1573'] },
  // Exfiltration
  { patterns: [/exfiltrat/i, /data.?theft/i], techniques: ['T1041', 'T1048'] },
  // Cloud
  { patterns: [/s3.?bucket/i, /cloud.?storage/i, /azure.?blob/i, /gcs\b/i], techniques: ['T1530', 'T1580'] },
  // Reconnaissance patterns
  { patterns: [/subdomain.?takeover/i, /dns.?hijack/i], techniques: ['T1596', 'T1583'] },
  { patterns: [/osint/i, /email.?harvest/i, /employee.?email/i], techniques: ['T1589', 'T1593'] },
  // Privilege escalation
  { patterns: [/privilege.?escal/i, /privesc/i, /suid\b/i, /sudo.*nopasswd/i], techniques: ['T1068', 'T1548'] },
  // Persistence
  { patterns: [/persist/i, /autorun/i, /cron.?job/i, /schtask/i, /startup/i], techniques: ['T1547', 'T1053'] },
]

// ── Severity weight for dedup: pick highest severity hit per technique ────────
const SEV_WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }

// ── Map a single vulnerability to ATT&CK technique IDs ───────────────────────
function mapVulnToTechniques(vuln: {
  name?: string | null
  category?: string | null
  description?: string | null
  cveIds?: string[]
  cwes?: Array<{ cweId: string }>
  attackTechniques?: Array<{ id: string; name: string; tactic: string }>
}): string[] {
  const hits = new Set<string>()

  // 1. Honour techniques already stored in graph
  if (vuln.attackTechniques?.length) {
    vuln.attackTechniques.forEach((t) => hits.add(t.id))
    return [...hits]
  }

  // 2. CWE → technique
  if (vuln.cwes?.length) {
    for (const { cweId } of vuln.cwes) {
      const key = cweId.startsWith('CWE-') ? cweId : `CWE-${cweId}`
      CWE_TO_TECHNIQUES[key]?.forEach((t) => hits.add(t))
    }
  }

  // 3. Keyword matching on name + category + description
  const text = [vuln.name, vuln.category, vuln.description].filter(Boolean).join(' ')
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      rule.techniques.forEach((t) => hits.add(t))
    }
  }

  return [...hits]
}

// ── GET /api/mitre/attack?projectId=xxx ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const session = getSession()

  try {
    // Fetch vulns from Neo4j (name, severity, category, cwes, attackTechniques)
    const query = `
      MATCH (v:Vulnerability {project_id: $projectId})
      OPTIONAL MATCH (v)-[:HAS_CWE]->(m:MitreData)
      OPTIONAL MATCH (v)-[:HAS_ATTACK_TECHNIQUE]->(at:AttackTechnique)
      OPTIONAL MATCH (v)-[:TARGETS]->(target)
      RETURN
        v.id AS id,
        v.name AS name,
        v.severity AS severity,
        v.category AS category,
        v.description AS description,
        v.source AS source,
        v.tool_name AS toolName,
        collect(DISTINCT {cweId: m.cwe_id, name: m.cwe_name}) AS cwes,
        collect(DISTINCT {id: at.technique_id, name: at.name, tactic: at.tactic}) AS attackTechniques,
        collect(DISTINCT target.name)[0] AS targetHost
      ORDER BY
        CASE v.severity
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END
    `

    const result = await session.run(query, { projectId })

    const vulns = result.records.map((r) => ({
      id: r.get('id') as string,
      name: r.get('name') as string,
      severity: (r.get('severity') || 'info') as string,
      category: r.get('category') as string | null,
      description: r.get('description') as string | null,
      source: r.get('source') as string | null,
      toolName: r.get('toolName') as string | null,
      targetHost: r.get('targetHost') as string | null,
      cwes: (r.get('cwes') as Array<{ cweId: string; name: string }>).filter((c) => c.cweId),
      attackTechniques: (r.get('attackTechniques') as Array<{ id: string; name: string; tactic: string }>).filter((t) => t.id),
    }))

    // Build matrix: techniqueId → { findings: [...], maxSeverity }
    type TechniqueHit = {
      techniqueId: string
      findings: Array<{ id: string; name: string; severity: string; targetHost?: string | null; source?: string | null }>
      maxSeverity: string
      maxSevWeight: number
      count: number
    }

    const techniqueHits: Record<string, TechniqueHit> = {}

    for (const vuln of vulns) {
      const techIds = mapVulnToTechniques(vuln)
      const sevWeight = SEV_WEIGHT[vuln.severity.toLowerCase()] ?? 0

      for (const tid of techIds) {
        if (!TECHNIQUES[tid]) continue // skip unknown technique IDs
        if (!techniqueHits[tid]) {
          techniqueHits[tid] = {
            techniqueId: tid,
            findings: [],
            maxSeverity: vuln.severity,
            maxSevWeight: sevWeight,
            count: 0,
          }
        }
        const hit = techniqueHits[tid]
        hit.findings.push({
          id: vuln.id,
          name: vuln.name || 'Unknown',
          severity: vuln.severity,
          targetHost: vuln.targetHost,
          source: vuln.source,
        })
        hit.count++
        if (sevWeight > hit.maxSevWeight) {
          hit.maxSevWeight = sevWeight
          hit.maxSeverity = vuln.severity
        }
      }
    }

    // Build the response: tactics + their techniques + hits
    const tacticsWithTechniques = TACTICS.map((tactic) => {
      const techniques = Object.entries(TECHNIQUES)
        .filter(([, tech]) => tech.tactic === tactic.id)
        // Put parent techniques before subtechniques
        .sort(([a], [b]) => {
          const aParent = a.split('.')[0]
          const bParent = b.split('.')[0]
          if (aParent !== bParent) return aParent.localeCompare(bParent)
          return a.localeCompare(b)
        })
        .map(([id, tech]) => ({
          id,
          name: tech.name,
          url: tech.url,
          isSubtechnique: id.includes('.'),
          hit: techniqueHits[id] ?? null,
        }))

      const hitCount = techniques.filter((t) => t.hit).length
      const totalCount = techniques.length
      // Highest severity in this tactic
      const tacticSeverity = techniques.reduce((best: string, t) => {
        if (!t.hit) return best
        return (SEV_WEIGHT[t.hit.maxSeverity] ?? 0) > (SEV_WEIGHT[best] ?? 0)
          ? t.hit.maxSeverity : best
      }, 'none')

      return {
        ...tactic,
        techniques,
        hitCount,
        totalCount,
        coverage: totalCount > 0 ? Math.round((hitCount / totalCount) * 100) : 0,
        maxSeverity: tacticSeverity,
      }
    })

    const totalTechniques = Object.keys(TECHNIQUES).length
    const hitTechniques = Object.keys(techniqueHits).length
    const totalFindings = vulns.length

    // Severity breakdown
    const bySeverity: Record<string, number> = {}
    for (const v of vulns) {
      const s = v.severity.toLowerCase()
      bySeverity[s] = (bySeverity[s] || 0) + 1
    }

    return NextResponse.json({
      tactics: tacticsWithTechniques,
      stats: {
        totalFindings,
        totalTechniques,
        hitTechniques,
        coverage: Math.round((hitTechniques / totalTechniques) * 100),
        bySeverity,
      },
    })
  } catch (error) {
    console.error('[MITRE Attack API]', error)
    // Graceful degradation — return empty matrix rather than 500
    return NextResponse.json({
      tactics: TACTICS.map((t) => ({ ...t, techniques: [], hitCount: 0, totalCount: 0, coverage: 0, maxSeverity: 'none' })),
      stats: { totalFindings: 0, totalTechniques: 0, hitTechniques: 0, coverage: 0, bySeverity: {} },
      error: String(error),
    })
  } finally {
    await session.close()
  }
}
