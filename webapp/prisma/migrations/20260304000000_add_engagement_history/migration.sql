-- AlterTable: add engagement metadata columns to kill_chain_runs
ALTER TABLE "kill_chain_runs"
  ADD COLUMN IF NOT EXISTS "name"              TEXT,
  ADD COLUMN IF NOT EXISTS "notes"             TEXT,
  ADD COLUMN IF NOT EXISTS "tags"              TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "stages_completed"  INT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "duration"          INTEGER;

-- CreateTable: kill_chain_logs for persisted log lines
CREATE TABLE IF NOT EXISTS "kill_chain_logs" (
  "id"          TEXT        NOT NULL,
  "run_id"      TEXT        NOT NULL,
  "project_id"  TEXT        NOT NULL,
  "stage"       INTEGER     NOT NULL,
  "stage_name"  TEXT        NOT NULL,
  "sub_step"    TEXT,
  "level"       TEXT        NOT NULL DEFAULT 'info',
  "log"         TEXT        NOT NULL,
  "tool_name"   TEXT,
  "metadata"    JSONB,
  "timestamp"   TIMESTAMPTZ NOT NULL,

  CONSTRAINT "kill_chain_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kill_chain_logs_run_id_fkey"
    FOREIGN KEY ("run_id")
    REFERENCES "kill_chain_runs"("id")
    ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS "kill_chain_logs_run_id_idx"       ON "kill_chain_logs"("run_id");
CREATE INDEX IF NOT EXISTS "kill_chain_logs_project_id_idx"   ON "kill_chain_logs"("project_id");
CREATE INDEX IF NOT EXISTS "kill_chain_logs_run_id_stage_idx" ON "kill_chain_logs"("run_id", "stage");
