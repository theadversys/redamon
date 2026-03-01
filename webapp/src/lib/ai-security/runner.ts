/**
 * Async scan runner — spawns `promptfoo redteam run` as a background process
 * and tracks it by PID. The webapp API routes call these functions.
 */
import { spawn, execSync, type ChildProcess } from 'child_process'
import fs from 'fs/promises'
import { statSync, existsSync } from 'fs'
import path from 'path'

function getPromptfooDir(): string {
  if (process.env.PROMPTFOO_CONFIG_DIR) return process.env.PROMPTFOO_CONFIG_DIR
  return path.join(process.cwd(), 'promptfoo')
}

function getPromptfooBin(): string {
  const localBin = path.join(process.cwd(), 'node_modules', '.bin', 'promptfoo')
  try {
    statSync(localBin)
    return localBin
  } catch {
    // fallback
  }
  try {
    return execSync('which promptfoo', { encoding: 'utf-8' }).trim()
  } catch {
    return 'npx'
  }
}

interface TrackedProcess {
  child: ChildProcess
  outputPath: string
  exitCode: number | null
  exited: boolean
}

const activeProcesses = new Map<string, TrackedProcess>()

export interface StartResult {
  pid: number
  configPath: string
  outputPath: string
}

export async function startScan(scanId: string, configYaml: string): Promise<StartResult> {
  const baseDir = getPromptfooDir()
  const scanDir = path.join(baseDir, `scan-${scanId}`)
  await fs.mkdir(scanDir, { recursive: true })

  const configPath = path.join(scanDir, 'promptfooconfig.yaml')
  const outputPath = path.join(scanDir, 'output.json')
  const logPath = path.join(scanDir, 'run.log')

  await fs.writeFile(configPath, configYaml, 'utf-8')

  const env = {
    ...process.env,
    PROMPTFOO_CONFIG_DIR: baseDir,
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_DISABLE_TELEMETRY: '1',
  }

  const bin = getPromptfooBin()
  const args = bin === 'npx'
    ? ['promptfoo', 'redteam', 'run', '-c', configPath, '-o', outputPath, '--no-progress-bar']
    : ['redteam', 'run', '-c', configPath, '-o', outputPath, '--no-progress-bar']

  const logStream = await fs.open(logPath, 'w')

  await logStream.write(`[runner] bin: ${bin}\n`)
  await logStream.write(`[runner] args: ${args.join(' ')}\n`)
  await logStream.write(`[runner] cwd: ${scanDir}\n`)
  await logStream.write(`[runner] OPENAI_API_KEY set: ${!!process.env.OPENAI_API_KEY}\n`)
  await logStream.write(`[runner] starting at ${new Date().toISOString()}\n---\n`)

  const child = spawn(bin, args, {
    env,
    cwd: scanDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (!child.pid) {
    await logStream.write(`[runner] ERROR: spawn failed — no PID returned. Is promptfoo installed?\n`)
    await logStream.close()
    throw new Error(`Failed to spawn promptfoo process. Binary: ${bin}`)
  }

  const tracked: TrackedProcess = { child, outputPath, exitCode: null, exited: false }
  activeProcesses.set(scanId, tracked)

  child.stdout?.on('data', (chunk: Buffer) => logStream.write(chunk))
  child.stderr?.on('data', (chunk: Buffer) => logStream.write(chunk))

  child.on('error', async (err) => {
    await logStream.write(`[runner] process error: ${err.message}\n`)
  })

  child.on('close', async (code, signal) => {
    tracked.exitCode = code
    tracked.exited = true
    await logStream.write(`\n---\n[runner] exited code=${code} signal=${signal} at ${new Date().toISOString()}\n`)
    await logStream.close()
    // Keep in map for 60s so the poller can detect the exit + output file
    setTimeout(() => activeProcesses.delete(scanId), 60_000)
  })

  return {
    pid: child.pid,
    configPath,
    outputPath,
  }
}

export function getScanState(scanId: string): { running: boolean; exited: boolean; exitCode: number | null; hasOutput: boolean } {
  const tracked = activeProcesses.get(scanId)
  if (!tracked) {
    // Process not tracked (either never started, or cleaned up after 60s)
    const baseDir = getPromptfooDir()
    const outPath = path.join(baseDir, `scan-${scanId}`, 'output.json')
    return { running: false, exited: true, exitCode: null, hasOutput: existsSync(outPath) }
  }
  return {
    running: !tracked.exited,
    exited: tracked.exited,
    exitCode: tracked.exitCode,
    hasOutput: existsSync(tracked.outputPath),
  }
}

export function isProcessRunning(scanId: string): boolean {
  const tracked = activeProcesses.get(scanId)
  if (!tracked) return false
  return !tracked.exited
}

export function killScan(scanId: string): boolean {
  const tracked = activeProcesses.get(scanId)
  if (!tracked || tracked.exited) return false
  tracked.child.kill('SIGTERM')
  tracked.exited = true
  tracked.exitCode = -1
  return true
}

export async function getOutputPath(scanId: string): Promise<string> {
  const baseDir = getPromptfooDir()
  return path.join(baseDir, `scan-${scanId}`, 'output.json')
}

export async function getLogTail(scanId: string, lines = 50): Promise<string> {
  const baseDir = getPromptfooDir()
  const logPath = path.join(baseDir, `scan-${scanId}`, 'run.log')
  try {
    const content = await fs.readFile(logPath, 'utf-8')
    const allLines = content.split('\n')
    return allLines.slice(-lines).join('\n')
  } catch {
    return ''
  }
}

export async function outputFileExists(scanId: string): Promise<boolean> {
  const outPath = await getOutputPath(scanId)
  return existsSync(outPath)
}
