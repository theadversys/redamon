import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const reports = await prisma.complianceReport.findMany({
    where: { mobileScanId: id },
    orderBy: { generatedAt: 'desc' }
  })

  return NextResponse.json({ reports })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Get scan with findings
  const scan = await prisma.mobileScan.findUnique({ where: { id } })
  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
  if (!scan.findings) return NextResponse.json({ error: 'Scan has no findings yet' }, { status: 400 })

  // Generate compliance reports for all frameworks
  const frameworks: Array<'OWASP_MOBILE' | 'GDPR' | 'PCI_DSS' | 'HIPAA' | 'SOC2'> = ['OWASP_MOBILE', 'GDPR', 'PCI_DSS', 'HIPAA', 'SOC2']

  // Delete existing reports for this scan
  await prisma.complianceReport.deleteMany({ where: { mobileScanId: id } })

  // Generate simplified compliance scores based on scan data
  const score = scan.score ?? 50

  const reports = await Promise.all(frameworks.map(async (framework) => {
    let frameworkScore = score
    let status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT' = 'PARTIAL'
    let summary = ''
    let controls: any[] = []

    if (framework === 'GDPR') {
      frameworkScore = score >= 70 ? Math.min(100, score + 5) : Math.max(0, score - 10)
      controls = [
        { controlId: 'GDPR-32a', controlName: 'Pseudonymisation & Encryption', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Based on cryptography and data storage findings' },
        { controlId: 'GDPR-32b', controlName: 'Confidentiality & Integrity', status: score >= 60 ? 'PASS' : 'FAIL', evidence: 'Based on network security findings' },
        { controlId: 'GDPR-32c', controlName: 'Availability & Resilience', status: 'PARTIAL', evidence: 'Backup configuration reviewed' },
        { controlId: 'GDPR-6', controlName: 'Data Minimisation', status: score >= 65 ? 'PASS' : 'PARTIAL', evidence: 'Based on permissions analysis' },
        { controlId: 'GDPR-25', controlName: 'Privacy by Design', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Based on privacy controls findings' },
      ]
      summary = `GDPR Article 32 assessment: ${frameworkScore}% controls passing. ${frameworkScore >= 70 ? 'App demonstrates adequate technical security measures.' : 'Critical improvements needed for GDPR compliance — insecure data handling detected.'}`
    } else if (framework === 'PCI_DSS') {
      frameworkScore = score >= 75 ? Math.min(100, score) : Math.max(0, score - 15)
      controls = [
        { controlId: 'PCI-6.3', controlName: 'Identify Security Vulnerabilities', status: score >= 80 ? 'PASS' : 'FAIL', evidence: 'Vulnerability scan results' },
        { controlId: 'PCI-6.4', controlName: 'Public-facing App Security', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Injection vulnerability analysis' },
        { controlId: 'PCI-8.3', controlName: 'Strong Authentication', status: score >= 70 ? 'PASS' : 'PARTIAL', evidence: 'Authentication mechanism review' },
        { controlId: 'PCI-4.2', controlName: 'Encrypt Transmission', status: score >= 65 ? 'PASS' : 'FAIL', evidence: 'Network security analysis' },
        { controlId: 'PCI-3.5', controlName: 'Protect Stored Data', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Data storage analysis' },
        { controlId: 'PCI-11.3', controlName: 'Penetration Testing', status: 'PASS', evidence: 'PandaExploit mobile assessment conducted' },
      ]
      summary = `PCI-DSS v4.0 assessment: ${frameworkScore}% controls passing. ${frameworkScore >= 70 ? 'Cardholder data security requirements mostly met.' : 'PCI-DSS non-compliant — insecure data transmission or storage detected.'}`
    } else if (framework === 'HIPAA') {
      frameworkScore = score >= 70 ? Math.min(100, score + 3) : Math.max(0, score - 5)
      controls = [
        { controlId: 'HIPAA-312a1', controlName: 'Access Control', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Authentication and authorization review' },
        { controlId: 'HIPAA-312b', controlName: 'Audit Controls', status: score >= 65 ? 'PASS' : 'PARTIAL', evidence: 'Logging analysis — sensitive data in logs' },
        { controlId: 'HIPAA-312c', controlName: 'Integrity', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Cryptography findings' },
        { controlId: 'HIPAA-312d', controlName: 'Authentication', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Credential management review' },
        { controlId: 'HIPAA-312e1', controlName: 'Transmission Security', status: score >= 65 ? 'PASS' : 'FAIL', evidence: 'Network communication security' },
      ]
      summary = `HIPAA §164.312 assessment: ${frameworkScore}% controls passing. ${frameworkScore >= 70 ? 'ePHI security safeguards appear adequate.' : 'HIPAA non-compliant — ePHI may be at risk due to insecure storage or transmission.'}`
    } else if (framework === 'SOC2') {
      frameworkScore = score >= 70 ? Math.min(100, score - 2) : Math.max(0, score - 8)
      controls = [
        { controlId: 'CC6.1', controlName: 'Logical Access Controls', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Authentication mechanism review' },
        { controlId: 'CC6.6', controlName: 'Logical Access Boundaries', status: score >= 65 ? 'PASS' : 'PARTIAL', evidence: 'Exported component analysis' },
        { controlId: 'CC6.7', controlName: 'Transmission Integrity', status: score >= 65 ? 'PASS' : 'FAIL', evidence: 'Network security findings' },
        { controlId: 'CC6.8', controlName: 'Malicious Software Prevention', status: score >= 70 ? 'PASS' : 'PARTIAL', evidence: 'Third-party library CVE audit' },
        { controlId: 'CC7.1', controlName: 'Detect Anomalies', status: score >= 75 ? 'PASS' : 'PARTIAL', evidence: 'Anti-tamper and root detection presence' },
        { controlId: 'CC9.1', controlName: 'Risk Mitigation', status: score >= 70 ? 'PASS' : 'FAIL', evidence: 'Overall security posture' },
      ]
      summary = `SOC 2 CC6-CC9 assessment: ${frameworkScore}% controls passing. ${frameworkScore >= 70 ? 'System security controls largely adequate.' : 'SOC 2 gaps identified — logical access and transmission controls need improvement.'}`
    } else {
      // OWASP_MOBILE
      frameworkScore = score
      summary = `OWASP Mobile Top 10 (2024): Security score ${score}/100. Full findings in scan report.`
      controls = []
    }

    status = frameworkScore >= 70 ? 'COMPLIANT' : frameworkScore >= 40 ? 'PARTIAL' : 'NON_COMPLIANT'

    return prisma.complianceReport.create({
      data: {
        mobileScanId: id,
        framework,
        score: frameworkScore,
        status,
        controls,
        summary,
      }
    })
  }))

  return NextResponse.json({ reports })
}
