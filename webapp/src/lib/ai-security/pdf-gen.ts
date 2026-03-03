/**
 * PDF report generation from HTML using Puppeteer + Chromium.
 * Uses @sparticuz/chromium-min for serverless/Linux compatibility.
 * On unsupported platforms (e.g. macOS), may throw — caller should catch and return 503.
 */

import puppeteer from 'puppeteer-core'

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'

export async function buildPdfReport(html: string): Promise<Buffer> {
  const chromium = (await import('@sparticuz/chromium-min')).default as {
    executablePath: (url?: string) => Promise<string>
    args: string[]
  }

  const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL)
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1200, height: 1600 },
    executablePath,
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
    })
    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
