/**
 * A0 Profile Manager
 * Manages Agent Zero profile files on the host filesystem.
 * The ./docs/agents/ directory is volume-mounted into the A0 container at /a0/usr/agents/
 * so any writes here are instantly visible to Agent Zero.
 */

import fs from 'fs/promises'
import path from 'path'

// Host-side path — volume-mounted into A0 as /a0/usr/agents/
const AGENTS_DIR = path.resolve(process.cwd(), '../docs/agents')

// All known MCP tool configs
const MCP_SERVERS: Record<string, { url: string; transport: string }> = {
  spiderfoot:   { url: 'http://pandaexploit-spiderfoot:5009/sse', transport: 'sse' },
  nmap:         { url: 'http://kali-sandbox:8006/sse', transport: 'sse' },
  naabu:        { url: 'http://kali-sandbox:8000/sse', transport: 'sse' },
  curl:         { url: 'http://kali-sandbox:8001/sse', transport: 'sse' },
  nuclei:       { url: 'http://kali-sandbox:8002/sse', transport: 'sse' },
  metasploit:   { url: 'http://kali-sandbox:8003/sse', transport: 'sse' },
  nikto:        { url: 'http://kali-sandbox:8004/sse', transport: 'sse' },
  sqlmap:       { url: 'http://kali-sandbox:8005/sse', transport: 'sse' },
  ffuf:         { url: 'http://kali-sandbox:8007/sse', transport: 'sse' },
  gobuster:     { url: 'http://kali-sandbox:8008/sse', transport: 'sse' },
  hydra:        { url: 'http://kali-sandbox:8009/sse', transport: 'sse' },
  pandaexploit: { url: 'http://pandaexploit-mcp:8011/mcp', transport: 'http' },
}

export interface AgentProfileFiles {
  slug: string
  name: string
  description: string
  systemPrompt: string
  promptFiles?: Record<string, string>
  mcpTools?: string[]
}

/**
 * Write an agent profile's files to the docs/agents/ directory.
 * A0 picks these up immediately via the volume mount.
 */
export async function deployProfileToA0(profile: AgentProfileFiles): Promise<void> {
  const dir = path.join(AGENTS_DIR, profile.slug)
  const promptsDir = path.join(dir, 'prompts')

  await fs.mkdir(dir, { recursive: true })
  await fs.mkdir(promptsDir, { recursive: true })

  // Write agent.json — A0 uses title, description, context fields
  await fs.writeFile(
    path.join(dir, 'agent.json'),
    JSON.stringify(
      {
        title: profile.name,
        description: profile.description,
        context: profile.systemPrompt,
      },
      null,
      2
    )
  )

  // Write prompt override files (e.g., system.md)
  if (profile.promptFiles) {
    for (const [filename, content] of Object.entries(profile.promptFiles)) {
      await fs.writeFile(path.join(promptsDir, filename), content)
    }
  }

  // Write per-agent MCP servers config
  if (profile.mcpTools && profile.mcpTools.length > 0) {
    const mcpConfig = buildMcpConfigForProfile(profile.mcpTools)
    await fs.writeFile(path.join(dir, 'mcp_servers.json'), JSON.stringify(mcpConfig, null, 2))
  }
}

/**
 * Delete an agent profile's files from docs/agents/.
 */
export async function removeProfileFromA0(slug: string): Promise<void> {
  const dir = path.join(AGENTS_DIR, slug)
  await fs.rm(dir, { recursive: true, force: true })
}

/**
 * Read agent.json for a profile.
 */
export async function readProfileFromA0(
  slug: string
): Promise<{ title: string; description: string; context: string } | null> {
  try {
    const agentJson = await fs.readFile(path.join(AGENTS_DIR, slug, 'agent.json'), 'utf-8')
    return JSON.parse(agentJson)
  } catch {
    return null
  }
}

/**
 * List all profile slugs that have been deployed (have agent.json).
 */
export async function listDeployedProfiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true })
    const slugs: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        await fs.access(path.join(AGENTS_DIR, entry.name, 'agent.json'))
        slugs.push(entry.name)
      } catch {
        // directory exists but no agent.json — skip
      }
    }
    return slugs
  } catch {
    return []
  }
}

/**
 * Build the mcp_servers.json payload for a given set of tool IDs.
 */
export function buildMcpConfigForProfile(
  tools: string[]
): Record<string, { url: string; transport: string }> {
  return Object.fromEntries(
    tools
      .filter((t) => t in MCP_SERVERS)
      .map((t) => [t, MCP_SERVERS[t]])
  )
}
