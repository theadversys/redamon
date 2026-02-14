-- AlterTable
ALTER TABLE "projects" ADD COLUMN "github_repo_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "github_include_forks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "github_scan_secrets" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "github_scan_high_entropy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "github_scan_ai_llm_keys" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "github_scan_ai_llm_usage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "github_max_files_per_repo" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN "github_max_file_size_bytes" INTEGER NOT NULL DEFAULT 1048576;
