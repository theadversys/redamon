-- CreateTable
CREATE TABLE "recon_schedules" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recon_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recon_schedules_project_id_idx" ON "recon_schedules"("project_id");

-- CreateIndex
CREATE INDEX "recon_schedules_enabled_next_run_at_idx" ON "recon_schedules"("enabled", "next_run_at");

-- AddForeignKey
ALTER TABLE "recon_schedules" ADD CONSTRAINT "recon_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
