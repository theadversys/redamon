/**
 * Structured JSON logger for PandaExploit webapp.
 * Outputs JSON lines to stdout for aggregation (e.g. Loki, CloudWatch).
 * Standard fields: timestamp, level, service, message, project_id?, user_id?
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  project_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

function formatLog(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    service: "pandaexploit-webapp",
    message,
  };
  if (context?.project_id) entry.project_id = context.project_id;
  if (context?.user_id) entry.user_id = context.user_id;
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      if (k !== "project_id" && k !== "user_id" && v !== undefined) {
        entry[k] = v;
      }
    }
  }
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, context?: LogContext): void {
    process.stdout.write(formatLog("info", message, context) + "\n");
  },
  warn(message: string, context?: LogContext): void {
    process.stdout.write(formatLog("warn", message, context) + "\n");
  },
  error(message: string, context?: LogContext & { error?: unknown }): void {
    const ctx = context ? { ...context } : {};
    if (ctx.error instanceof Error) {
      ctx.exception = ctx.error.message;
      ctx.stack = ctx.error.stack;
      delete ctx.error;
    }
    process.stderr.write(formatLog("error", message, ctx) + "\n");
  },
};
